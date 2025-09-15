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
      // Obtener datos de la devolución
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

      // Obtener items de la devolución
      const itemsQuery = query(collection(devolucionRef, 'itemsDevolucion'));
      const itemsSnap = await getDocs(itemsQuery);
      const items = itemsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setItemsDevolucion(items);

      // Obtener datos de la venta original
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
        
        // Actualizar estado de la devolución
        transaction.update(devolucionRef, {
          estado: 'aprobada',
          fechaProcesamiento: serverTimestamp(),
          procesadoPor: user.email || user.uid,
          montoAprobado: adjustedAmount,
          updatedAt: serverTimestamp(),
        });

        // Crear registro de pago (devolución de dinero)
        if (adjustedAmount > 0) {
          const pagoRef = doc(collection(db, 'pagos'));
          transaction.set(pagoRef, {
            ventaId: devolucion.ventaId,
            devolucionId: id,
            numeroVenta: devolucion.numeroVenta,
            numeroDevolucion: devolucion.numeroDevolucion,
            metodoPago: 'devolucion_efectivo', // O el método original
            monto: -adjustedAmount, // Negativo porque es una salida de dinero
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

        // TODO: Aquí podrías también actualizar el stock si es necesario
        // dependiendo de tu lógica de negocio
      });

      alert('Devolución aprobada con éxito');
      await fetchDevolucionData(); // Recargar datos
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
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          
          {error && (
            <div className="mb-6 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    Devolución {devolucion.numeroDevolucion}
                  </h1>
                  <div className="flex items-center space-x-4">
                    {getEstadoBadge(devolucion.estado)}
                    <span className="text-sm text-gray-500">
                      Solicitada el {devolucion.fechaSolicitud?.toLocaleDateString('es-ES')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {devolucion.estado === 'solicitada' && (
                    <>
                      <button
                        onClick={() => setShowApprovalModal(true)}
                        disabled={updating}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                      >
                        <CheckCircleIcon className="h-4 w-4 mr-2" />
                        Aprobar
                      </button>
                      <button
                        onClick={() => setShowRejectionModal(true)}
                        disabled={updating}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                      >
                        <XCircleIcon className="h-4 w-4 mr-2" />
                        Rechazar
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => router.push('/devoluciones')}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <ArrowLeftIcon className="h-4 w-4 mr-2" />
                    Volver
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-6">
            
            {/* Panel Izquierdo - Información General */}
            <div className="col-span-12 lg:col-span-4 space-y-6">
              
              {/* Información de la Devolución */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <DocumentTextIcon className="h-5 w-5 mr-2" />
                    Información de la Devolución
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Número de Devolución</label>
                    <p className="mt-1 text-sm text-gray-900 font-mono">{devolucion.numeroDevolucion}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Venta Original</label>
                    <p className="mt-1 text-sm text-gray-900 font-mono">{devolucion.numeroVenta}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Cliente</label>
                    <p className="mt-1 text-sm text-gray-900">{devolucion.clienteNombre}</p>
                    {devolucion.clienteDNI && (
                      <p className="text-xs text-gray-500">DNI: {devolucion.clienteDNI}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Motivo</label>
                    <p className="mt-1 text-sm text-gray-900">{getMotivoBadge(devolucion.motivo)}</p>
                  </div>

                  {devolucion.descripcionMotivo && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Descripción del Motivo</label>
                      <p className="mt-1 text-sm text-gray-900">{devolucion.descripcionMotivo}</p>
                    </div>
                  )}

                  {devolucion.observaciones && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Observaciones</label>
                      <p className="mt-1 text-sm text-gray-900">{devolucion.observaciones}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Información de Fechas y Estado */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <CalendarIcon className="h-5 w-5 mr-2" />
                    Fechas y Estado
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Fecha de Solicitud</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {devolucion.fechaSolicitud?.toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Solicitado por</label>
                    <p className="mt-1 text-sm text-gray-900 flex items-center">
                      <UserIcon className="h-4 w-4 mr-1" />
                      {devolucion.solicitadoPor}
                    </p>
                  </div>

                  {devolucion.fechaProcesamiento && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Fecha de Procesamiento</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {devolucion.fechaProcesamiento?.toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  )}

                  {devolucion.procesadoPor && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Procesado por</label>
                      <p className="mt-1 text-sm text-gray-900 flex items-center">
                        <UserIcon className="h-4 w-4 mr-1" />
                        {devolucion.procesadoPor}
                      </p>
                    </div>
                  )}

                  {devolucion.motivoRechazo && (
                    <div>
                      <label className="block text-sm font-medium text-red-600">Motivo de Rechazo</label>
                      <p className="mt-1 text-sm text-red-800 bg-red-50 p-2 rounded">
                        {devolucion.motivoRechazo}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Información Financiera */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                    Información Financiera
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-500">Monto Solicitado:</span>
                    <span className="text-lg font-semibold text-gray-900">
                      S/. {devolucion.montoADevolver?.toFixed(2)}
                    </span>
                  </div>

                  {devolucion.montoAprobado !== undefined && (
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                      <span className="text-sm font-medium text-green-600">Monto Aprobado:</span>
                      <span className="text-lg font-semibold text-green-700">
                        S/. {devolucion.montoAprobado?.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {ventaOriginal && (
                    <div className="pt-2 border-t border-gray-200 text-xs text-gray-500">
                      <p>Venta original: S/. {ventaOriginal.totalVenta?.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Panel Derecho - Items y Venta Original */}
            <div className="col-span-12 lg:col-span-8 space-y-6">
              
              {/* Items a Devolver */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <ShoppingBagIcon className="h-5 w-5 mr-2" />
                    Productos a Devolver
                  </h3>
                </div>
                <div className="p-4">
                  {itemsDevolucion.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No hay productos registrados para esta devolución</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Cant. Original</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Cant. Devolver</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Precio Unit.</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {itemsDevolucion.map((item, index) => (
                            <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-4 py-3">
                                <div>
                                  <div className="font-medium text-gray-900">{item.nombreProducto}</div>
                                  <div className="text-sm text-gray-500">
                                    {item.codigoTienda} - {item.marca} - {item.color || 'N/A'}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-sm text-gray-900">
                                {item.cantidadOriginal}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                  {item.cantidadADevolver}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center text-sm text-gray-900">
                                S/. {parseFloat(item.precioVentaUnitario).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-center font-medium text-gray-900">
                                S/. {parseFloat(item.montoDevolucion).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td colSpan="4" className="px-4 py-3 text-right font-medium text-gray-900">
                              Total:
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-gray-900 text-lg">
                              S/. {devolucion.montoADevolver?.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Información de la Venta Original */}
              {ventaOriginal && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Información de la Venta Original
                    </h3>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-500">Número de Venta</label>
                        <p className="mt-1 text-sm text-gray-900 font-mono">{ventaOriginal.numeroVenta}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-500">Fecha de Venta</label>
                        <p className="mt-1 text-sm text-gray-900">
                          {ventaOriginal.fechaVenta?.toLocaleDateString('es-ES')}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-500">Total de la Venta</label>
                        <p className="mt-1 text-sm text-gray-900 font-semibold">
                          S/. {ventaOriginal.totalVenta?.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-500">Método de Pago</label>
                        <p className="mt-1 text-sm text-gray-900">{ventaOriginal.metodoPago}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-500">Vendido por</label>
                        <p className="mt-1 text-sm text-gray-900">{ventaOriginal.empleadoId}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-500">Estado</label>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {ventaOriginal.estado}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
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