// pages/devoluciones/credito.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import {
  collection,
  getDoc,
  doc,
  serverTimestamp,
  query,
  where,
  getDocs,
  orderBy,
  runTransaction,
  limit
} from 'firebase/firestore';
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  ShoppingCartIcon,
  CheckCircleIcon,
  XMarkIcon,
  CreditCardIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

const DevolucionCreditoPage = () => {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Búsqueda de crédito
  const [searchTerm, setSearchTerm] = useState('');
  const [creditosEncontrados, setCreditosEncontrados] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Crédito seleccionado y sus datos
  const [creditoSeleccionado, setCreditoSeleccionado] = useState(null);
  // 'activo' | 'saldado'
  const [estadoCredito, setEstadoCredito] = useState(null);
  const [itemsVenta, setItemsVenta] = useState([]);
  const [itemsADevolver, setItemsADevolver] = useState([]);

  const [devolucionData, setDevolucionData] = useState({
    motivo: '',
    descripcionMotivo: '',
    montoADevolver: 0,
    observaciones: ''
  });

  useEffect(() => {
    if (!user) { router.push('/auth'); return; }
    setLoading(false);
  }, [user, router]);

  // ── Buscar créditos (activos o saldados) ───────────────
    const buscarCreditos = async (termino) => {
    if (!termino.trim()) { setCreditosEncontrados([]); return; }
    setIsSearching(true);
    try {
        const lower = termino.toLowerCase();

        // Sin orderBy → no necesita índice compuesto
        const [snapActivos, snapSaldados] = await Promise.all([
        getDocs(query(
            collection(db, 'creditos'),
            where('estado', '==', 'activo'),
            limit(50)
        )),
        getDocs(query(
            collection(db, 'creditos'),
            where('estado', '==', 'saldado'),
            limit(50)
        ))
        ]);

        const idsVistos = new Set();
        const resultados = [];

        [...snapActivos.docs, ...snapSaldados.docs].forEach(d => {
        if (idsVistos.has(d.id)) return;
        idsVistos.add(d.id);
        const c = { id: d.id, ...d.data() };
        if (
            String(c.numeroCredito || '').toLowerCase().includes(lower) ||
            String(c.clienteNombre || '').toLowerCase().includes(lower) ||
            String(c.clienteDNI || '').toLowerCase().includes(lower)
        ) {
            resultados.push(c);
        }
        });

        // Ordenar localmente
        resultados.sort((a, b) => {
        const fa = a.fechaActivacion?.toDate?.() || new Date(0);
        const fb = b.fechaActivacion?.toDate?.() || new Date(0);
        return fb - fa;
        });

        setCreditosEncontrados(resultados.slice(0, 10));
    } catch (err) {
        setError('Error al buscar créditos: ' + err.message);
    } finally {
        setIsSearching(false);
    }
    };

  useEffect(() => {
    const t = setTimeout(() => buscarCreditos(searchTerm), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // ── Seleccionar crédito ────────────────────────────────
const seleccionarCredito = async (credito) => {
  setLoading(true);
  setError(null);
  try {
    const esSaldado = credito.estado === 'saldado';
    setEstadoCredito(esSaldado ? 'saldado' : 'activo');

    if (!credito.ventaId) {
      throw new Error('Este crédito no tiene venta vinculada. Solo se pueden devolver créditos registrados con el nuevo flujo.');
    }

    const itemsSnap = await getDocs(
      query(
        collection(db, 'ventas', credito.ventaId, 'itemsVenta'),
        orderBy('createdAt', 'asc')
      )
    );
    const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ── Restar cantidades ya devueltas previamente ──────
    const devSnap = await getDocs(
      query(
        collection(db, 'devoluciones'),
        where('creditoId', '==', credito.id)
      )
    );

    const cantidadesDevueltas = {}; // { productoId: cantidadTotal }

    for (const devDoc of devSnap.docs) {
      const itemsDevSnap = await getDocs(
        collection(db, 'devoluciones', devDoc.id, 'itemsDevolucion')
      );
      itemsDevSnap.forEach(itemDev => {
        const { productoId, cantidadADevolver } = itemDev.data();
        cantidadesDevueltas[productoId] = (cantidadesDevueltas[productoId] || 0) + (cantidadADevolver || 0);
      });
    }

    const itemsAjustados = items
      .map(item => {
        const yaDevuelto = cantidadesDevueltas[item.productoId] || 0;
        const cantidadRestante = item.cantidad - yaDevuelto;
        const subtotalRestante = cantidadRestante * parseFloat(item.precioVentaUnitario || 0);
        return { ...item, cantidad: cantidadRestante, subtotal: subtotalRestante };
      })
      .filter(item => item.cantidad > 0);
    // ── Fin fix ─────────────────────────────────────────

    setCreditoSeleccionado({
      ...credito,
      fechaFormatted: credito.fechaActivacion?.toDate
        ? credito.fechaActivacion.toDate().toLocaleDateString('es-ES')
        : 'N/A'
    });
    setItemsVenta(itemsAjustados);
    setItemsADevolver([]);
    setSearchTerm('');
    setCreditosEncontrados([]);
    setDevolucionData({ motivo: '', descripcionMotivo: '', montoADevolver: 0, observaciones: '' });
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

  // ── Precio real del item ───────────────────────────────
  const getPrecioReal = (item) => {
    const precio = parseFloat(item.precioVentaUnitario);
    if (precio > 0) return precio;
    const subtotal = parseFloat(item.subtotal || 0);
    const cantidad = parseFloat(item.cantidad || 1);
    return cantidad > 0 ? subtotal / cantidad : 0;
  };

  // ── Toggle item para devolución ────────────────────────
  const toggleItemDevolucion = async (item, cantidadADevolver = null) => {
    const existe = itemsADevolver.find(i => i.id === item.id);

    if (existe) {
      if (cantidadADevolver === null || cantidadADevolver === 0) {
        setItemsADevolver(prev => prev.filter(i => i.id !== item.id));
      } else {
        setItemsADevolver(prev => prev.map(i =>
          i.id === item.id
            ? {
                ...i,
                cantidadADevolver,
                montoDevolucion: estadoCredito === 'saldado'
                  ? cantidadADevolver * getPrecioReal(i)
                  : 0,
                gananciaDevolucion: (i.gananciaUnitaria || 0) * cantidadADevolver
              }
            : i
        ));
      }
    } else {
      try {
        setLoading(true);
        const precioReal = getPrecioReal(item);
        const precioCompraUnitario = parseFloat(item.precioCompraUnitario || 0);
        const gananciaUnitaria = item.gananciaUnitaria || (precioReal - precioCompraUnitario);
        const cantidadFinal = cantidadADevolver || item.cantidad;

        // Si crédito no saldado → montoDevolucion = 0 (sin dinero)
        const montoDevolucion = estadoCredito === 'saldado'
          ? cantidadFinal * precioReal
          : 0;

        setItemsADevolver(prev => [...prev, {
          ...item,
          precioVentaUnitario: precioReal,
          cantidadADevolver: cantidadFinal,
          montoDevolucion,
          precioCompraUnitario,
          gananciaUnitaria,
          gananciaTotal: gananciaUnitaria * item.cantidad,
          gananciaDevolucion: gananciaUnitaria * cantidadFinal,
          tieneLoteOriginal: !!item.loteId
        }]);
      } catch (err) {
        setError('Error al procesar el producto: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // Recalcular monto total cuando cambian items
  useEffect(() => {
    const total = itemsADevolver.reduce((sum, i) => sum + (i.montoDevolucion || 0), 0);
    setDevolucionData(prev => ({ ...prev, montoADevolver: total }));
  }, [itemsADevolver]);

  const handleDevolucionChange = (e) => {
    const { name, value } = e.target;
    setDevolucionData(prev => ({ ...prev, [name]: value }));
  };

  const generarNumeroDevolucion = () => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `DEVC-${d}${m}${y}-${Date.now().toString().slice(-4)}`;
  };

  // ── Submit ─────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!creditoSeleccionado) { setError('Debe seleccionar un crédito'); setSaving(false); return; }
    if (itemsADevolver.length === 0) { setError('Debe seleccionar al menos un producto'); setSaving(false); return; }
    if (!devolucionData.motivo) { setError('Debe seleccionar un motivo'); setSaving(false); return; }
    if (estadoCredito === 'saldado' && devolucionData.montoADevolver <= 0) {
      setError('El monto a devolver debe ser mayor a 0');
      setSaving(false);
      return;
    }

    try {
      const gananciaRealAfectada = itemsADevolver.reduce((t, i) => t + (i.gananciaDevolucion || 0), 0);
      const numeroDevolucion = generarNumeroDevolucion();

      await runTransaction(db, async (transaction) => {
        const ventaRef = doc(db, 'ventas', creditoSeleccionado.ventaId);
        const ventaSnap = await transaction.get(ventaRef);
        if (!ventaSnap.exists()) throw new Error('Venta vinculada no encontrada');

        // Solo crear el documento de devolución y sus items
        const devolucionRef = doc(collection(db, 'devoluciones'));

        transaction.set(devolucionRef, {
          numeroDevolucion,
          creditoId: creditoSeleccionado.id,
          numeroCredito: creditoSeleccionado.numeroCredito,
          ventaId: creditoSeleccionado.ventaId,
          numeroVenta: ventaSnap.data().numeroVenta,
          clienteId: creditoSeleccionado.clienteId,
          clienteNombre: creditoSeleccionado.clienteNombre,
          clienteDNI: creditoSeleccionado.clienteDNI || null,
          tipoDevolucion: estadoCredito === 'saldado' ? 'credito-saldado' : 'credito-activo',
          montoADevolver: devolucionData.montoADevolver,
          gananciaRealAfectada,
          motivo: devolucionData.motivo,
          descripcionMotivo: devolucionData.descripcionMotivo || null,
          observaciones: devolucionData.observaciones || null,
          estado: 'solicitada',
          fechaSolicitud: serverTimestamp(),
          solicitadoPor: user.email || user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        for (const item of itemsADevolver) {
          transaction.set(doc(collection(devolucionRef, 'itemsDevolucion')), {
            productoId: item.productoId,
            nombreProducto: item.nombreProducto,
            marca: item.marca || '',
            medida: item.medida || '',
            codigoProveedor: item.codigoProveedor || '',
            codigoTienda: item.codigoTienda || '',
            color: item.color || '',
            loteId: item.loteId,
            numeroLote: item.numeroLote || '',
            cantidadOriginal: item.cantidad,
            cantidadADevolver: item.cantidadADevolver,
            precioVentaUnitario: item.precioVentaUnitario,
            montoDevolucion: item.montoDevolucion,
            precioCompraUnitario: item.precioCompraUnitario || 0,
            gananciaUnitaria: item.gananciaUnitaria || 0,
            gananciaTotal: item.gananciaTotal || 0,
            gananciaDevolucion: item.gananciaDevolucion || 0,
            createdAt: serverTimestamp()
          });
        }
      });

      alert('Devolución solicitada. Pendiente de aprobación.');
      router.push('/devoluciones');
    } catch (err) {
      setError('Error al registrar la devolución: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!user || loading) {
    return (
      <Layout title="Cargando Devolución de Crédito">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Devolución de Crédito">
      <div className="w-full px-1 sm:px-2 lg:px-3">
        {error && (
          <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 max-w-md">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <CreditCardIcon className="h-7 w-7 text-purple-600" />
                <h1 className="text-2xl font-bold text-gray-900">Devolución de Crédito</h1>
              </div>
              <button
                onClick={() => router.push('/devoluciones')}
                className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <ArrowLeftIcon className="h-4 w-4 mr-1" />
                Volver
              </button>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 p-2">

            {/* ── Panel Izquierdo ─────────────────────── */}
            <div className="col-span-12 lg:col-span-3">
              {!creditoSeleccionado ? (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">1. Buscar Crédito</h2>
                  <div className="relative mb-4">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="N° crédito, cliente, DNI..."
                      className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-gray-600 mb-4">
                    {searchTerm.trim() === ''
                      ? 'Busca créditos activos o saldados...'
                      : `${creditosEncontrados.length} créditos encontrados`}
                  </div>

                  {creditosEncontrados.length > 0 && (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {creditosEncontrados.map(credito => (
                        <div
                          key={credito.id}
                          onClick={() => seleccionarCredito(credito)}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-white cursor-pointer transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium text-gray-900 text-sm">{credito.numeroCredito}</h4>
                              <p className="text-sm text-gray-600">{credito.clienteNombre}</p>
                              {credito.clienteDNI && (
                                <p className="text-xs text-gray-500">DNI: {credito.clienteDNI}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-gray-900 text-sm">
                                S/. {parseFloat(credito.totalCredito || 0).toFixed(2)}
                              </p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                credito.estado === 'saldado'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}>
                                {credito.estado === 'saldado' ? 'Saldado' : 'Activo'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">Crédito Seleccionado</h2>
                      <p className="text-sm text-gray-600">{creditoSeleccionado.numeroCredito}</p>
                    </div>
                    <button
                      onClick={() => {
                        setCreditoSeleccionado(null);
                        setItemsVenta([]);
                        setItemsADevolver([]);
                        setEstadoCredito(null);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Badge tipo devolución */}
                  <div className={`mb-4 p-3 rounded-lg border flex items-start gap-2 ${
                    estadoCredito === 'activo'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-green-50 border-green-200'
                  }`}>
                    <ExclamationTriangleIcon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                      estadoCredito === 'activo' ? 'text-yellow-600' : 'text-green-600'
                    }`} />
                    <div className="text-xs">
                      {estadoCredito === 'activo' ? (
                        <>
                          <p className="font-semibold text-yellow-800">Crédito activo</p>
                          <p className="text-yellow-700 mt-1">
                            No hay dinero que devolver. El stock regresa al lote original y se reduce la deuda del cliente.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-semibold text-green-800">Crédito saldado</p>
                          <p className="text-green-700 mt-1">
                            El cliente ya pagó. Se devolverá dinero real y el stock regresa al lote original.
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Info del crédito */}
                  <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Cliente:</span>
                        <p className="text-gray-900">{creditoSeleccionado.clienteNombre}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Total crédito:</span>
                        <p className="text-gray-900">S/. {parseFloat(creditoSeleccionado.totalCredito || 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">N° crédito:</span>
                        <p className="text-gray-900 text-xs">{creditoSeleccionado.numeroCredito}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Activado:</span>
                        <p className="text-gray-900">{creditoSeleccionado.fechaFormatted}</p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Motivo de la Devolución *
                      </label>
                      <select
                        name="motivo"
                        value={devolucionData.motivo}
                        onChange={handleDevolucionChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                      >
                        <option value="">Seleccione un motivo</option>
                        <option value="no_quiere">No le gustó el producto</option>
                        <option value="defectuoso">Producto defectuoso</option>
                        <option value="empaque_abierto">Empaque abierto</option>
                        <option value="descripcion_incorrecta">Descripción incorrecta</option>
                        <option value="otro">Otro motivo</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Descripción del motivo
                      </label>
                      <textarea
                        name="descripcionMotivo"
                        value={devolucionData.descripcionMotivo}
                        onChange={handleDevolucionChange}
                        rows="2"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        placeholder="Detalle adicional..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Observaciones
                      </label>
                      <textarea
                        name="observaciones"
                        value={devolucionData.observaciones}
                        onChange={handleDevolucionChange}
                        rows="2"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        placeholder="Notas adicionales..."
                      />
                    </div>

                    {/* Total a devolver — solo relevante si está saldado */}
                    <div className={`rounded-lg p-4 border ${
                      estadoCredito === 'saldado'
                        ? 'bg-purple-50 border-purple-200'
                        : 'bg-yellow-50 border-yellow-200'
                    }`}>
                      {estadoCredito === 'saldado' ? (
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">Total a devolver:</span>
                          <span className="font-bold text-purple-800 text-xl">
                            S/. {devolucionData.montoADevolver.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-medium text-yellow-800">Sin devolución de dinero</p>
                          <p className="text-xs text-yellow-700 mt-1">
                            Solo se reduce la deuda y regresa el stock.
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={saving || itemsADevolver.length === 0}
                      className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent text-sm font-semibold rounded-lg shadow-lg text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                          Registrando...
                        </>
                      ) : (
                        <><CheckCircleIcon className="h-5 w-5 mr-2" />Registrar Devolución</>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* ── Panel Derecho ───────────────────────── */}
            <div className="col-span-12 lg:col-span-9">
              {creditoSeleccionado ? (
                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-800">
                      2. Seleccionar Productos a Devolver
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {estadoCredito === 'activo'
                        ? 'Los productos seleccionados regresarán al stock y se reducirá la deuda del cliente.'
                        : 'Los productos seleccionados regresarán al stock y se calculará el monto a devolver al cliente.'}
                    </p>
                  </div>

                  <div className="p-4">
                    {itemsVenta.length === 0 ? (
                      <div className="text-center py-8">
                        <ShoppingCartIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <p className="text-gray-500">No se encontraron productos en este crédito</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead className="bg-purple-50">
                              <tr className="border-b border-gray-300">
                                <th className="w-12 px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase">SELEC.</th>
                                <th className="w-28 px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase">C. TIENDA</th>
                                <th className="w-44 px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">PRODUCTO</th>
                                <th className="w-28 px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase">C. PROVEEDOR</th>
                                <th className="w-24 px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase">LOTE</th>
                                <th className="w-20 px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase">MARCA</th>
                                <th className="w-16 px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase">CANT.</th>
                                <th className="w-24 px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase">P. UNITARIO</th>
                                <th className="w-24 px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase">SUBTOTAL</th>
                                <th className="w-20 px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase">CANT. DEV.</th>
                                <th className="w-28 px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                                  {estadoCredito === 'saldado' ? 'MONTO DEV.' : 'IMPACTO DEUDA'}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {itemsVenta.map((item, index) => {
                                const itemDev = itemsADevolver.find(i => i.id === item.id);
                                const isSelected = !!itemDev;
                                const precioMostrar = getPrecioReal(item);
                                const subtotalItem = parseFloat(item.subtotal || precioMostrar * item.cantidad || 0);

                                return (
                                  <tr
                                    key={item.id}
                                    className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isSelected ? 'ring-2 ring-purple-200' : ''} transition-colors`}
                                  >
                                    <td className="px-2 py-3 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          if (e.target.checked) toggleItemDevolucion(item, item.cantidad);
                                          else toggleItemDevolucion(item, 0);
                                        }}
                                        className="h-5 w-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                      />
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                      <span className="text-sm text-gray-900 font-medium">{item.codigoTienda || 'N/A'}</span>
                                    </td>
                                    <td className="px-3 py-3">
                                      <div className="font-medium text-gray-900 text-sm">{item.nombreProducto}</div>
                                      {item.medida && <div className="text-xs text-gray-500">{item.medida}</div>}
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                      <span className="text-sm text-gray-900">{item.codigoProveedor || 'N/A'}</span>
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                                        {item.numeroLote || 'N/A'}
                                      </span>
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                      <span className="text-sm text-gray-700">{item.marca || '-'}</span>
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                      <span className="text-sm font-medium text-gray-900">{item.cantidad}</span>
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                      <span className="text-sm font-medium text-gray-900">
                                        S/. {precioMostrar.toFixed(2)}
                                      </span>
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                      <span className="text-sm font-semibold text-gray-900">
                                        S/. {subtotalItem.toFixed(2)}
                                      </span>
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                      {isSelected ? (
                                        <input
                                          type="number"
                                          min="1"
                                          max={item.cantidad}
                                          value={itemDev.cantidadADevolver}
                                          onChange={(e) => {
                                            const v = parseInt(e.target.value) || 1;
                                            toggleItemDevolucion(item, Math.min(v, item.cantidad));
                                          }}
                                          className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                                        />
                                      ) : (
                                        <span className="text-sm text-gray-400">-</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                      {isSelected ? (
                                        estadoCredito === 'saldado' ? (
                                          <span className="text-sm font-bold text-purple-700">
                                            S/. {itemDev.montoDevolucion.toFixed(2)}
                                          </span>
                                        ) : (
                                          <span className="text-sm font-bold text-yellow-700">
                                            -S/. {(itemDev.cantidadADevolver * precioMostrar).toFixed(2)}
                                          </span>
                                        )
                                      ) : (
                                        <span className="text-sm text-gray-400">-</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {itemsADevolver.length > 0 && (
                          <div className={`px-6 py-4 border-t border-gray-300 ${
                            estadoCredito === 'saldado'
                              ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white'
                              : 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white'
                          }`}>
                            <div className="flex justify-between items-center">
                              <div>
                                <h3 className="text-lg font-semibold">Resumen de Devolución</h3>
                                <p className="text-sm opacity-80">
                                  {itemsADevolver.length} producto{itemsADevolver.length !== 1 ? 's' : ''} seleccionado{itemsADevolver.length !== 1 ? 's' : ''}
                                  {estadoCredito === 'activo' && ' — sin retorno de dinero'}
                                </p>
                              </div>
                              <div className="text-right">
                                {estadoCredito === 'saldado' ? (
                                  <>
                                    <div className="text-3xl font-bold">
                                      S/. {devolucionData.montoADevolver.toFixed(2)}
                                    </div>
                                    <p className="text-sm opacity-80">Total a devolver al cliente</p>
                                  </>
                                ) : (
                                  <>
                                    <div className="text-3xl font-bold">
                                      -S/. {itemsADevolver.reduce((s, i) => s + i.cantidadADevolver * getPrecioReal(i), 0).toFixed(2)}
                                    </div>
                                    <p className="text-sm opacity-80">Reducción en deuda del cliente</p>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-lg p-8">
                  <div className="text-center">
                    <CreditCardIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-600 mb-2">Buscar Crédito</h3>
                    <p className="text-gray-500">
                      Busca por número de crédito, nombre del cliente o DNI. Puedes devolver productos de créditos activos o ya saldados.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default DevolucionCreditoPage;