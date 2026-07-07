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
  runTransaction
} from 'firebase/firestore';
import { 
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  ShoppingCartIcon,
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const NuevaDevolucionPage = () => {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [ventasEncontradas, setVentasEncontradas] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [itemsVenta, setItemsVenta] = useState([]);
  const [itemsADevolver, setItemsADevolver] = useState([]);
  
  const [devolucionData, setDevolucionData] = useState({
    motivo: '',
    descripcionMotivo: '',
    montoADevolver: 0,
    observaciones: '',
    metodoPagoDevolucion: 'efectivo' 
  });

  useEffect(() => {
    if (!user) { router.push('/auth'); return; }
    setLoading(false);
  }, [user, router]);

  const buscarVentas = async (termino) => {
    if (!termino.trim()) { setVentasEncontradas([]); return; }
    setIsSearching(true);
    try {
      const qVentas = query(
        collection(db, 'ventas'),
        where('estado', '==', 'completada'),
        orderBy('fechaVenta', 'desc')
      );
      const ventasSnapshot = await getDocs(qVentas);
      const ventas = [];
      for (const docSnap of ventasSnapshot.docs) {
        const ventaData = docSnap.data();
        const ventaCompleta = {
          id: docSnap.id,
          ...ventaData,
          fechaVenta: ventaData.fechaVenta?.toDate ? ventaData.fechaVenta.toDate() : new Date(),
          fechaVentaFormatted: ventaData.fechaVenta?.toDate ? ventaData.fechaVenta.toDate().toLocaleDateString('es-ES') : 'N/A'
        };
        const terminoLower = termino.toLowerCase();
        if (
          String(ventaData.numeroVenta || '').toLowerCase().includes(terminoLower) ||
          String(ventaData.clienteNombre || '').toLowerCase().includes(terminoLower) ||
          String(ventaData.clienteDNI || '').toLowerCase().includes(terminoLower)
        ) {
          ventas.push(ventaCompleta);
        }
      }
      setVentasEncontradas(ventas.slice(0, 10));
    } catch (err) {
      setError('Error al buscar ventas: ' + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => { buscarVentas(searchTerm); }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const seleccionarVenta = async (venta) => {
    try {
      setVentaSeleccionada(venta);
      const itemsQuery = query(collection(db, 'ventas', venta.id, 'itemsVenta'), orderBy('createdAt', 'asc'));
      const itemsSnapshot = await getDocs(itemsQuery);
      const items = itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      console.log('Items de venta cargados:', items.map(i => ({
        nombre: i.nombreProducto,
        precioVentaUnitario: i.precioVentaUnitario,
        subtotal: i.subtotal,
        loteId: i.loteId,
        numeroLote: i.numeroLote
      })));

      setItemsVenta(items);
      setItemsADevolver([]);
      setSearchTerm('');
      setVentasEncontradas([]);
      setDevolucionData({ motivo: '', descripcionMotivo: '', montoADevolver: 0, observaciones: '', metodoPagoDevolucion: 'efectivo' });
    } catch (err) {
      setError('Error al cargar los productos de la venta');
    }
  };

  // Obtener precio real del item (maneja ventas antiguas con precioVentaUnitario: 0)
  const getPrecioReal = (item) => {
    const precio = parseFloat(item.precioVentaUnitario);
    if (precio > 0) return precio;
    // Fallback para ventas antiguas: calcular desde subtotal
    const subtotal = parseFloat(item.subtotal || 0);
    const cantidad = parseFloat(item.cantidad || 1);
    return cantidad > 0 ? subtotal / cantidad : 0;
  };

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
                montoDevolucion: cantidadADevolver * getPrecioReal(i),
                gananciaDevolucion: calcularGananciaDevolucion(i, cantidadADevolver)
              }
            : i
        ));
      }
    } else {
      try {
        setLoading(true);
        
        const precioReal = getPrecioReal(item);
        let precioCompraUnitario = 0;
        let gananciaUnitaria = 0;
        let loteOriginalInfo = null;
        
        if (item.loteId && item.numeroLote) {
          loteOriginalInfo = {
            loteId: item.loteId,
            numeroLote: item.numeroLote,
            precioCompraUnitario: item.precioCompraUnitario
          };
          precioCompraUnitario = parseFloat(item.precioCompraUnitario || 0);
          gananciaUnitaria = item.gananciaUnitaria || (precioReal - precioCompraUnitario);
        } else {
          const productRef = doc(db, 'productos', item.productoId);
          const productSnap = await getDoc(productRef);
          if (productSnap.exists()) {
            const productData = productSnap.data();
            precioCompraUnitario = parseFloat(productData.precioCompraDefault || 0);
            gananciaUnitaria = precioReal - precioCompraUnitario;
          }
        }
        
        const cantidadFinal = cantidadADevolver || item.cantidad;
        const gananciaDevolucion = gananciaUnitaria * cantidadFinal;
        
        const itemConLoteOriginal = {
          ...item,
          precioVentaUnitario: precioReal,        // ← sobreescribe el 0 si era venta antigua
          cantidadADevolver: cantidadFinal,
          montoDevolucion: cantidadFinal * precioReal,
          precioCompraUnitario,
          gananciaUnitaria,
          gananciaTotal: gananciaUnitaria * item.cantidad,
          gananciaDevolucion,
          loteOriginal: loteOriginalInfo,
          tieneLoteOriginal: !!loteOriginalInfo
        };
        
        setItemsADevolver(prev => [...prev, itemConLoteOriginal]);
      } catch (error) {
        alert('Error al procesar el producto para devolución: ' + error.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const calcularGananciaDevolucion = (itemDevolucion, nuevaCantidad) => {
    if (itemDevolucion.gananciaUnitaria && typeof itemDevolucion.gananciaUnitaria === 'number') {
      return itemDevolucion.gananciaUnitaria * nuevaCantidad;
    }
    return (getPrecioReal(itemDevolucion) * 0.4) * nuevaCantidad;
  };

  const calcularGananciaRealAfectada = () => {
    return itemsADevolver.reduce((total, item) => total + (item.gananciaDevolucion || 0), 0);
  };

  useEffect(() => {
    const montoTotal = itemsADevolver.reduce((sum, item) => sum + item.montoDevolucion, 0);
    setDevolucionData(prev => ({ ...prev, montoADevolver: montoTotal }));
  }, [itemsADevolver]);

  const handleDevolucionChange = (e) => {
    const { name, value } = e.target;
    setDevolucionData(prev => ({ ...prev, [name]: value }));
  };

  const generarNumeroDevolucion = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `DEV-${day}${month}${year}-${Date.now().toString().slice(-4)}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!ventaSeleccionada) { setError('Debe seleccionar una venta'); setSaving(false); return; }
    if (itemsADevolver.length === 0) { setError('Debe seleccionar al menos un producto para devolver'); setSaving(false); return; }
    if (!devolucionData.motivo) { setError('Debe seleccionar un motivo para la devolución'); setSaving(false); return; }
    if (devolucionData.montoADevolver <= 0) { setError('El monto a devolver debe ser mayor a 0'); setSaving(false); return; }

    try {
      const gananciaRealAfectada = calcularGananciaRealAfectada();
      
      await runTransaction(db, async (transaction) => {
        const devolucionRef = doc(collection(db, 'devoluciones'));
        const numeroDevolucion = generarNumeroDevolucion();
        
        transaction.set(devolucionRef, {
          numeroDevolucion,
          ventaId: ventaSeleccionada.id,
          numeroVenta: ventaSeleccionada.numeroVenta,
          clienteId: ventaSeleccionada.clienteId,
          clienteNombre: ventaSeleccionada.clienteNombre,
          clienteDNI: ventaSeleccionada.clienteDNI,
          metodoPagoOriginal: ventaSeleccionada.metodoPago,        // medio de la venta original
          metodoPagoDevolucion: devolucionData.metodoPagoDevolucion || 'efectivo',
          motivo: devolucionData.motivo,
          descripcionMotivo: devolucionData.descripcionMotivo || null,
          montoADevolver: devolucionData.montoADevolver,
          gananciaRealAfectada,
          observaciones: devolucionData.observaciones || null,
          estado: 'solicitada',
          fechaSolicitud: serverTimestamp(),
          solicitadoPor: user.email || user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        for (const item of itemsADevolver) {
          const itemDevolucionRef = doc(collection(devolucionRef, 'itemsDevolucion'));
          transaction.set(itemDevolucionRef, {
            ventaItemId: item.id,
            productoId: item.productoId,
            nombreProducto: item.nombreProducto,
            nombrePersonalizado: item.nombrePersonalizado || null,
            marca: item.marca || '',
            medida: item.medida || '',
            codigoProveedor: item.codigoProveedor || '',
            codigoTienda: item.codigoTienda || '',
            color: item.color || '',
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

      alert(`Devolución registrada con éxito.`);
      router.push('/devoluciones');
    } catch (err) {
      setError('Error al registrar la devolución: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!user || loading) {
    return (
      <Layout title="Cargando Nueva Devolución">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Nueva Devolución">
      <div className="w-full px-1 sm:px-2 lg:px-3">
        {error && (
          <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">Nueva Devolución</h1>
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
            
            {/* Panel Izquierdo */}
            <div className="col-span-12 lg:col-span-3">
              {!ventaSeleccionada ? (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">1. Buscar Venta</h2>
                  <div className="relative mb-4">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar por N° de venta, cliente, DNI..."
                      className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-600"></div>
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mb-4">
                    {searchTerm.trim() === '' ? 'Escribe para buscar ventas completadas...' : `${ventasEncontradas.length} ventas encontradas`}
                  </div>
                  {ventasEncontradas.length > 0 && (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {ventasEncontradas.map(venta => (
                        <div
                          key={venta.id}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-white cursor-pointer transition-colors"
                          onClick={() => seleccionarVenta(venta)}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium text-gray-900">Venta: {venta.numeroVenta}</h4>
                              <p className="text-sm text-gray-600">Cliente: {venta.clienteNombre}</p>
                              <p className="text-sm text-gray-500">Fecha: {venta.fechaVentaFormatted}</p>
                              {venta.clienteDNI && <p className="text-sm text-gray-500">DNI: {venta.clienteDNI}</p>}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-gray-900">S/. {parseFloat(venta.totalVenta || 0).toFixed(2)}</p>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Completada</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">Venta Seleccionada</h2>
                      <p className="text-sm text-gray-600">{ventaSeleccionada.numeroVenta} - {ventaSeleccionada.clienteNombre}</p>
                    </div>
                    <button
                      onClick={() => { setVentaSeleccionada(null); setItemsVenta([]); setItemsADevolver([]); }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="font-medium">Fecha:</span><p>{ventaSeleccionada.fechaVentaFormatted}</p></div>
                      <div><span className="font-medium">Total:</span><p>S/. {parseFloat(ventaSeleccionada.totalVenta || 0).toFixed(2)}</p></div>
                      <div><span className="font-medium">Cliente:</span><p>{ventaSeleccionada.clienteNombre}</p></div>
                      <div><span className="font-medium">DNI:</span><p>{ventaSeleccionada.clienteDNI || 'N/A'}</p></div>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Motivo de la Devolución *</label>
                      <select
                        name="motivo"
                        value={devolucionData.motivo}
                        onChange={handleDevolucionChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                        Método de Pago de la Devolución *
                      </label>
                      <select
                        name="metodoPagoDevolucion"
                        value={devolucionData.metodoPagoDevolucion}
                        onChange={handleDevolucionChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="yape">Yape</option>
                        <option value="plin">Plin</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="transferencia">Transferencia</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        ¿Cómo se le devuelve el dinero al cliente?
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Descripción del motivo</label>
                      <textarea
                        name="descripcionMotivo"
                        value={devolucionData.descripcionMotivo}
                        onChange={handleDevolucionChange}
                        rows="3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        placeholder="Detalle adicional del motivo..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Observaciones</label>
                      <textarea
                        name="observaciones"
                        value={devolucionData.observaciones}
                        onChange={handleDevolucionChange}
                        rows="2"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        placeholder="Notas adicionales..."
                      />
                    </div>

                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-gray-700">Total a devolver:</span>
                        <span className="font-bold text-orange-800 text-2xl">S/. {devolucionData.montoADevolver.toFixed(2)}</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={saving || itemsADevolver.length === 0}
                      className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent text-base font-semibold rounded-lg shadow-lg text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

            {/* Panel Derecho */}
            <div className="col-span-12 lg:col-span-9">
              {ventaSeleccionada ? (
                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-800">2. Seleccionar Productos a Devolver</h3>
                    <p className="text-sm text-gray-600 mt-1">Marque los productos que desea devolver y especifique las cantidades</p>
                  </div>

                  <div className="p-4">
                    {itemsVenta.length === 0 ? (
                      <div className="text-center py-8">
                        <ShoppingCartIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <p className="text-gray-500">No se encontraron productos en esta venta</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead className="bg-orange-50">
                              <tr className="border-b border-gray-300">
                                <th className="w-12 px-2 py-4 text-center text-sm font-semibold text-gray-600 uppercase">SELEC.</th>
                                <th className="w-32 px-2 py-4 text-center text-sm font-semibold text-gray-600 uppercase">C. TIENDA</th>
                                <th className="w-48 px-4 py-4 text-center text-sm font-semibold text-gray-600 uppercase">PRODUCTO</th>
                                <th className="w-28 px-2 py-4 text-center text-sm font-semibold text-gray-600 uppercase">C. PROVEEDOR</th>
                                <th className="w-24 px-2 py-4 text-center text-sm font-semibold text-gray-600 uppercase">LOTE</th>
                                <th className="w-20 px-2 py-4 text-center text-sm font-semibold text-gray-600 uppercase">MARCA</th>
                                <th className="w-20 px-2 py-4 text-center text-sm font-semibold text-gray-600 uppercase">MEDIDA</th>
                                <th className="w-16 px-2 py-4 text-center text-sm font-semibold text-gray-600 uppercase">CANT. VENDIDA</th>
                                <th className="w-24 px-2 py-4 text-center text-sm font-semibold text-gray-600 uppercase">P. UNITARIO</th>
                                <th className="w-24 px-2 py-4 text-center text-sm font-semibold text-gray-600 uppercase">SUBTOTAL</th>
                                <th className="w-20 px-2 py-4 text-center text-sm font-semibold text-gray-600 uppercase">CANT. DEVOLVER</th>
                                <th className="w-28 px-2 py-4 text-center text-sm font-semibold text-gray-600 uppercase">MONTO DEVOLUCIÓN</th>
                              </tr>
                            </thead>
                            <tbody>
                              {itemsVenta.map((item, index) => {
                                const itemDevolucion = itemsADevolver.find(i => i.id === item.id);
                                const isSelected = !!itemDevolucion;
                                const precioMostrar = getPrecioReal(item);

                                return (
                                  <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isSelected ? 'ring-2 ring-orange-200' : ''} transition-colors`}>
                                    <td className="w-12 px-2 py-3 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          if (e.target.checked) { toggleItemDevolucion(item, item.cantidad); }
                                          else { toggleItemDevolucion(item, 0); }
                                        }}
                                        className="h-5 w-5 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                                      />
                                    </td>
                                    <td className="w-32 px-2 py-3 text-center">
                                      <span className="text-sm text-gray-900 font-medium">{item.codigoTienda || 'N/A'}</span>
                                    </td>
                                    <td className="w-48 px-3 py-3">
                                      <div className="font-medium text-gray-900 text-sm">{item.nombreProducto}</div>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm text-gray-900 font-medium">{item.codigoProveedor || 'N/A'}</span>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">{item.numeroLote || 'N/A'}</span>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm text-gray-700">{item.marca || 'Sin marca'}</span>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm text-gray-700">{item.medida || 'N/A'}</span>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm font-medium text-gray-900">{item.cantidad}</span>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm font-medium text-gray-900">
                                        S/. {precioMostrar.toFixed(2)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm font-semibold text-gray-900">
                                        S/. {parseFloat(item.subtotal || 0).toFixed(2)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      {isSelected ? (
                                        <input
                                          type="number"
                                          min="1"
                                          max={item.cantidad}
                                          value={itemDevolucion.cantidadADevolver}
                                          onChange={(e) => {
                                            const cantidad = parseInt(e.target.value) || 1;
                                            toggleItemDevolucion(item, Math.min(cantidad, item.cantidad));
                                          }}
                                          className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                        />
                                      ) : (
                                        <span className="text-sm text-gray-400">-</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      {isSelected ? (
                                        <span className="text-sm font-bold text-orange-700">
                                          S/. {itemDevolucion.montoDevolucion.toFixed(2)}
                                        </span>
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
                          <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white px-6 py-4 border-t border-gray-300">
                            <div className="flex justify-between items-center">
                              <div>
                                <h3 className="text-lg font-semibold">Resumen de Devolución</h3>
                                <p className="text-orange-100 text-sm">
                                  {itemsADevolver.length} producto{itemsADevolver.length !== 1 ? 's' : ''} seleccionado{itemsADevolver.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                              <div className="text-right">
                                <div className="text-3xl font-bold">S/. {devolucionData.montoADevolver.toFixed(2)}</div>
                                <p className="text-orange-100 text-sm">Total a devolver</p>
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
                    <MagnifyingGlassIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-600 mb-2">Buscar Venta</h3>
                    <p className="text-gray-500">Primero debe buscar y seleccionar una venta para poder crear la devolución</p>
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

export default NuevaDevolucionPage;