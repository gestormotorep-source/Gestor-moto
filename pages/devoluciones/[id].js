import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import {
  doc,
  getDoc,
  collection,
  query,
  getDocs,
  updateDoc,
  serverTimestamp,
  addDoc,
  runTransaction
} from 'firebase/firestore';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  UserIcon,
  CalendarIcon,
  DocumentTextIcon,
  ShoppingBagIcon,
  PrinterIcon
} from '@heroicons/react/24/outline';

const DevolucionDetallePage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const { id } = router.query;

  const [devolucion, setDevolucion] = useState(null);
  const [itemsDevolucion, setItemsDevolucion] = useState([]);
  const [ventaOriginal, setVentaOriginal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  // Estados para modales
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [adjustedAmount, setAdjustedAmount] = useState(0);

  useEffect(() => {
    if (!user) {
      router.push('/auth');
      return;
    }

    if (!id) return;

    fetchDevolucionData();
  }, [user, router, id]);

  const fetchDevolucionData = async () => {
    setLoading(true);
    setError(null);

    try {
      const devolucionRef = doc(db, 'devoluciones', id);
      const devolucionSnap = await getDoc(devolucionRef);

      if (!devolucionSnap.exists()) {
        setError('Devolución no encontrada');
        return;
      }

      const devolucionData = {
        id: devolucionSnap.id,
        ...devolucionSnap.data(),
        fechaSolicitud: devolucionSnap.data().fechaSolicitud?.toDate(),
        fechaProcesamiento: devolucionSnap.data().fechaProcesamiento?.toDate(),
      };

      setDevolucion(devolucionData);
      setAdjustedAmount(devolucionData.montoADevolver || 0);

      const itemsQuery = query(collection(devolucionRef, 'itemsDevolucion'));
      const itemsSnap = await getDocs(itemsQuery);
      const items = itemsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setItemsDevolucion(items);

      if (devolucionData.ventaId) {
        const ventaRef = doc(db, 'ventas', devolucionData.ventaId);
        const ventaSnap = await getDoc(ventaRef);
        if (ventaSnap.exists()) {
          setVentaOriginal({
            id: ventaSnap.id,
            ...ventaSnap.data(),
            fechaVenta: ventaSnap.data().fechaVenta?.toDate()
          });
        }
      }

    } catch (err) {
      console.error('Error al cargar devolución:', err);
      setError('Error al cargar los datos de la devolución');
    } finally {
      setLoading(false);
    }
  };

  const handleAprobarDevolucion = async () => {
    if (!window.confirm('¿Está seguro de que desea APROBAR esta devolución?')) {
      return;
    }

    setUpdating(true);
    try {
      await runTransaction(db, async (transaction) => {
        const devolucionRef = doc(db, 'devoluciones', id);

        transaction.update(devolucionRef, {
          estado: 'aprobada',
          fechaProcesamiento: serverTimestamp(),
          procesadoPor: user.email || user.uid,
          montoAprobado: adjustedAmount,
          updatedAt: serverTimestamp(),
        });

        if (adjustedAmount > 0) {
          const pagoRef = doc(collection(db, 'pagos'));
          transaction.set(pagoRef, {
            ventaId: devolucion.ventaId,
            devolucionId: id,
            numeroVenta: devolucion.numeroVenta,
            numeroDevolucion: devolucion.numeroDevolucion,
            metodoPago: 'devolucion_efectivo',
            monto: -adjustedAmount,
            clienteId: devolucion.clienteId,
            clienteNombre: devolucion.clienteNombre,
            empleadoId: user.email || user.uid,
            fechaPago: serverTimestamp(),
            estado: 'completado',
            tipo: 'devolucion',
            descripcion: `Devolución aprobada: ${devolucion.numeroDevolucion}`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });

      alert('Devolución aprobada con éxito');
      await fetchDevolucionData();
      setShowApprovalModal(false);
    } catch (err) {
      console.error('Error al aprobar devolución:', err);
      setError('Error al aprobar la devolución: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleRechazarDevolucion = async () => {
    if (!rejectionReason.trim()) {
      alert('Debe proporcionar un motivo para el rechazo');
      return;
    }

    if (!window.confirm('¿Está seguro de que desea RECHAZAR esta devolución?')) {
      return;
    }

    setUpdating(true);
    try {
      const devolucionRef = doc(db, 'devoluciones', id);
      await updateDoc(devolucionRef, {
        estado: 'rechazada',
        motivoRechazo: rejectionReason,
        fechaProcesamiento: serverTimestamp(),
        procesadoPor: user.email || user.uid,
        updatedAt: serverTimestamp(),
      });

      alert('Devolución rechazada');
      await fetchDevolucionData();
      setShowRejectionModal(false);
      setRejectionReason('');
    } catch (err) {
      console.error('Error al rechazar devolución:', err);
      setError('Error al rechazar la devolución: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const getEstadoBadge = (estado) => {
    switch (estado) {
      case 'solicitada':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
            <ClockIcon className="h-4 w-4 mr-1" /> Solicitada
          </span>
        );
      case 'en_revision':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
            <ExclamationTriangleIcon className="h-4 w-4 mr-1" /> En Revisión
          </span>
        );
      case 'aprobada':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            <CheckCircleIcon className="h-4 w-4 mr-1" /> Aprobada
          </span>
        );
      case 'rechazada':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
            <XCircleIcon className="h-4 w-4 mr-1" /> Rechazada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
            {estado}
          </span>
        );
    }
  };

  const getMotivoBadge = (motivo) => {
    const motivoLabels = {
      'no_quiere': 'No le gustó',
      'defectuoso': 'Producto defectuoso',
      'empaque_abierto': 'Empaque abierto',
      'descripcion_incorrecta': 'Descripción incorrecta',
      'otro': 'Otro motivo'
    };
    return motivoLabels[motivo] || motivo;
  };

  if (!user || loading) {
    return (
      <Layout title="Cargando Devolución">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Error">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg">
            <p className="font-medium">Error</p>
            <p>{error}</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!devolucion) {
    return (
      <Layout title="Devolución no encontrada">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="text-center">
            <p className="text-gray-500 text-lg">Devolución no encontrada</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`Devolución ${devolucion.numeroDevolucion}`}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4">

        {error && (
          <div className="mb-4 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* ── Header compacto ── */}
        <div className="flex justify-between items-center mb-4 bg-white rounded-lg shadow-sm border border-gray-200 px-5 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">
              Devolución <span className="font-mono">{devolucion.numeroDevolucion}</span>
            </h1>
            {getEstadoBadge(devolucion.estado)}
            <span className="text-sm text-gray-400">
              Solicitada el {devolucion.fechaSolicitud?.toLocaleDateString('es-ES')}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {devolucion.estado === 'solicitada' && (
              <>
                <button
                  onClick={() => setShowApprovalModal(true)}
                  disabled={updating}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircleIcon className="h-4 w-4 mr-1.5" />
                  Aprobar
                </button>
                <button
                  onClick={() => setShowRejectionModal(true)}
                  disabled={updating}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  <XCircleIcon className="h-4 w-4 mr-1.5" />
                  Rechazar
                </button>
              </>
            )}
            <button
              onClick={() => router.push('/devoluciones')}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1.5" />
              Volver
            </button>
          </div>
        </div>

        {/* ── 2 columnas de información ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

          {/* Col 1: Información de la Devolución */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                <DocumentTextIcon className="h-4 w-4 mr-2 text-gray-500" />
                Información de la Devolución
              </h3>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">N° Devolución</label>
                <p className="mt-0.5 text-sm text-gray-900 font-mono font-semibold">{devolucion.numeroDevolucion}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Venta Original</label>
                <p className="mt-0.5 text-sm text-gray-900 font-mono">{devolucion.numeroVenta}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Cliente</label>
                <p className="mt-0.5 text-sm text-gray-900 font-medium">{devolucion.clienteNombre}</p>
                {devolucion.clienteDNI && (
                  <p className="text-xs text-gray-500">DNI: {devolucion.clienteDNI}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Motivo</label>
                <p className="mt-0.5 text-sm text-gray-900">{getMotivoBadge(devolucion.motivo)}</p>
              </div>
              {devolucion.descripcionMotivo && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Descripción</label>
                  <p className="mt-0.5 text-sm text-gray-900">{devolucion.descripcionMotivo}</p>
                </div>
              )}
              {devolucion.observaciones && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Observaciones</label>
                  <p className="mt-0.5 text-sm text-gray-900">{devolucion.observaciones}</p>
                </div>
              )}
            </div>
          </div>

          {/* Col 2: Fechas y Estado */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                <CalendarIcon className="h-4 w-4 mr-2 text-gray-500" />
                Fechas y Estado
              </h3>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Fecha de Solicitud</label>
                <p className="mt-0.5 text-sm text-gray-900">
                  {devolucion.fechaSolicitud?.toLocaleDateString('es-ES', {
                    year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Solicitado por</label>
                <p className="mt-0.5 text-sm text-gray-900 flex items-center">
                  <UserIcon className="h-3.5 w-3.5 mr-1 text-gray-400" />
                  {devolucion.solicitadoPor}
                </p>
              </div>
              {devolucion.fechaProcesamiento && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Fecha de Procesamiento</label>
                  <p className="mt-0.5 text-sm text-gray-900">
                    {devolucion.fechaProcesamiento?.toLocaleDateString('es-ES', {
                      year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              )}
              {devolucion.procesadoPor && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Procesado por</label>
                  <p className="mt-0.5 text-sm text-gray-900 flex items-center">
                    <UserIcon className="h-3.5 w-3.5 mr-1 text-gray-400" />
                    {devolucion.procesadoPor}
                  </p>
                </div>
              )}
              {devolucion.motivoRechazo && (
                <div>
                  <label className="block text-xs font-medium text-red-500 uppercase tracking-wide">Motivo de Rechazo</label>
                  <p className="mt-0.5 text-sm text-red-800 bg-red-50 p-2 rounded border border-red-200">
                    {devolucion.motivoRechazo}
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── Tabla de Productos a Devolver — ancho completo ── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center">
              <ShoppingBagIcon className="h-4 w-4 mr-2 text-gray-500" />
              Productos a Devolver
            </h3>
          </div>
          <div>
            {itemsDevolucion.length === 0 ? (
              <p className="text-center text-gray-500 py-10">No hay productos registrados para esta devolución</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[200px]">Producto</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Marca</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cód. Tienda</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cód. Proveedor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Medida</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Cant. Original</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Cant. Devolver</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Precio Unit.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {itemsDevolucion.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {item.nombreProducto}
                          {item.nombrePersonalizado && (
                            <div className="text-xs text-blue-600 font-semibold mt-0.5">
                              → {item.nombrePersonalizado}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {item.marca || <span className="text-gray-400">N/A</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono whitespace-nowrap">
                          {item.codigoTienda || <span className="text-gray-400 font-sans">N/A</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono whitespace-nowrap">
                          {item.codigoProveedor || <span className="text-gray-400 font-sans">N/A</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {item.color || <span className="text-gray-400">N/A</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {item.medida || <span className="text-gray-400">N/A</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-700">
                          {item.cantidadOriginal}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                            {item.cantidadADevolver}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700 whitespace-nowrap">
                          S/. {parseFloat(item.precioVentaUnitario).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 whitespace-nowrap">
                          S/. {parseFloat(item.montoDevolucion).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan="9" className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                        Total a Devolver:
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900 text-base whitespace-nowrap">
                        S/. {devolucion.montoADevolver?.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Información de la Venta Original — ancho completo ── */}
        {ventaOriginal && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                Información de la Venta Original
              </h3>
            </div>
            <div className="px-4 py-3">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">N° Venta</label>
                  <p className="mt-0.5 text-sm text-gray-900 font-mono font-semibold">{ventaOriginal.numeroVenta}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Fecha de Venta</label>
                  <p className="mt-0.5 text-sm text-gray-900">{ventaOriginal.fechaVenta?.toLocaleDateString('es-ES')}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Total de la Venta</label>
                  <p className="mt-0.5 text-sm font-bold text-gray-900">S/. {ventaOriginal.totalVenta?.toFixed(2)}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Método de Pago</label>
                  <p className="mt-0.5 text-sm text-gray-900 capitalize">{ventaOriginal.metodoPago}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Vendido por</label>
                  <p className="mt-0.5 text-sm text-gray-900">{ventaOriginal.empleadoId}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Estado</label>
                  <span className="mt-0.5 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {ventaOriginal.estado}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Aprobación */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowApprovalModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                </div>
                <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                  <h3 className="text-base font-semibold leading-6 text-gray-900">
                    Aprobar Devolución
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      ¿Está seguro de que desea aprobar esta devolución?
                    </p>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700">
                        Monto a devolver (S/.)
                      </label>
                      <input
                        type="number"
                        value={adjustedAmount}
                        onChange={(e) => setAdjustedAmount(parseFloat(e.target.value) || 0)}
                        min="0"
                        max={devolucion.montoADevolver}
                        step="0.01"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Monto solicitado: S/. {devolucion.montoADevolver?.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleAprobarDevolucion}
                  disabled={updating || adjustedAmount <= 0}
                  className="inline-flex w-full justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 sm:ml-3 sm:w-auto disabled:bg-gray-400"
                >
                  {updating ? 'Procesando...' : 'Aprobar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowApprovalModal(false)}
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Rechazo */}
      {showRejectionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowRejectionModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                  <XCircleIcon className="h-6 w-6 text-red-600" />
                </div>
                <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                  <h3 className="text-base font-semibold leading-6 text-gray-900">
                    Rechazar Devolución
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500 mb-4">
                      Por favor, proporcione el motivo del rechazo:
                    </p>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={4}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
                      placeholder="Explique el motivo del rechazo..."
                    />
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleRechazarDevolucion}
                  disabled={updating || !rejectionReason.trim()}
                  className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto disabled:bg-gray-400"
                >
                  {updating ? 'Procesando...' : 'Rechazar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectionModal(false);
                    setRejectionReason('');
                  }}
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default DevolucionDetallePage;