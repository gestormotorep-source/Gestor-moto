import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import { doc, getDoc, collection, query, getDocs, orderBy, where } from 'firebase/firestore';
import { ArrowLeftIcon,
  ReceiptPercentIcon, 
  UserIcon, 
  CalendarDaysIcon, 
  TagIcon, 
  BanknotesIcon, 
  ShoppingCartIcon, 
  TruckIcon, 
  IdentificationIcon, 
  CreditCardIcon } from '@heroicons/react/24/outline';

const VentaDetailPage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const { id } = router.query;

  const [venta, setVenta] = useState(null);
  const [itemsVenta, setItemsVenta] = useState([]);
  const [cotizacionData, setCotizacionData] = useState(null);
  const [devolucionesVenta, setDevolucionesVenta] = useState([]);
  const [abonosVenta, setAbonosVenta] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      router.push('/auth');
      return;
    }

    if (!id) {
      setLoading(false);
      return;
    }

    const fetchVentaDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const ventaRef = doc(db, 'ventas', id);
        const ventaSnap = await getDoc(ventaRef);

        if (!ventaSnap.exists()) {
          setError('Venta no encontrada.');
          setLoading(false);
          return;
        }

        const ventaData = ventaSnap.data();

        ventaData.fechaVentaFormatted = ventaData.fechaVenta?.toDate
          ? ventaData.fechaVenta.toDate().toLocaleDateString('es-ES', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'N/A';

        setVenta({ id: ventaSnap.id, ...ventaData });

        if (ventaData.cotizacionId) {
          try {
            const cotizacionRef = doc(db, 'cotizaciones', ventaData.cotizacionId);
            const cotizacionSnap = await getDoc(cotizacionRef);
            if (cotizacionSnap.exists()) {
              setCotizacionData(cotizacionSnap.data());
            }
          } catch (cotizacionError) {
            console.error("Error al cargar datos de cotización:", cotizacionError);
          }
        }

        const itemsCollectionRef = collection(db, 'ventas', id, 'itemsVenta');
        const qItems = query(itemsCollectionRef, orderBy('createdAt', 'asc'));
        const itemsSnapshot = await getDocs(qItems);
        const fetchedItems = itemsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setItemsVenta(fetchedItems);

        // Cargar devoluciones aprobadas
        try {
          const qDev = query(
            collection(db, 'devoluciones'),
            where('ventaId', '==', id),
            where('estado', '==', 'aprobada')
          );
          const devSnap = await getDocs(qDev);

          const devolucionesCargadas = [];
          await Promise.all(devSnap.docs.map(async (devDoc) => {
            const devData = { id: devDoc.id, ...devDoc.data() };
            const itemsDevSnap = await getDocs(
              collection(db, 'devoluciones', devDoc.id, 'itemsDevolucion')
            );
            devData.items = itemsDevSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            devolucionesCargadas.push(devData);
          }));

          devolucionesCargadas.sort((a, b) => {
            const fa = a.fechaSolicitud?.toDate ? a.fechaSolicitud.toDate() : new Date(0);
            const fb = b.fechaSolicitud?.toDate ? b.fechaSolicitud.toDate() : new Date(0);
            return fb - fa;
          });

          setDevolucionesVenta(devolucionesCargadas);
        } catch (e) {
          console.error('Error cargando devoluciones:', e);
        }

        // Cargar abonos si es venta de crédito
        if (ventaData.tipoVenta === 'credito') {
          try {
            const qAbonos = query(
              collection(db, 'abonos'),
              where('ventaId', '==', id)
            );
            const abonosSnap = await getDocs(qAbonos);
            const abonosCargados = abonosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            abonosCargados.sort((a, b) => {
              const fa = a.fecha?.toDate ? a.fecha.toDate() : new Date(0);
              const fb = b.fecha?.toDate ? b.fecha.toDate() : new Date(0);
              return fa - fb;
            });
            setAbonosVenta(abonosCargados);
          } catch (e) {
            console.error('Error cargando abonos:', e);
            setAbonosVenta([]);
          }
        } else {
          setAbonosVenta([]);
        }

      } catch (err) {
        console.error("Error al cargar detalles de la venta:", err);
        setError("Error al cargar los detalles de la venta: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchVentaDetails();
  }, [id, user, router]);

  // Función para obtener el ícono del método de pago
  const getPaymentMethodIcon = (method) => {
    const icons = {
      'efectivo': '💵',
      'tarjeta_credito': '💳',
      'tarjeta_debito': '💳',
      'transferencia': '🏦',
      'yape': '📱',
      'plin': '📲',
      'deposito': '🏛️',
      'cheque': '📄'
    };
    return icons[method] || '💰';
  };

  // Función para obtener la etiqueta del método de pago
  const getPaymentMethodLabel = (method) => {
    const labels = {
      'efectivo': 'Efectivo',
      'tarjeta_credito': 'Tarjeta de Crédito',
      'tarjeta_debito': 'Tarjeta de Débito',
      'transferencia': 'Transferencia Bancaria',
      'yape': 'Yape',
      'plin': 'Plin',
      'deposito': 'Depósito Bancario',
      'cheque': 'Cheque',
      'mixto': 'Pago Mixto'
    };
    return labels[method] || method?.charAt(0).toUpperCase() + method?.slice(1) || 'N/A';
  };

  if (loading) {
    return (
      <Layout title="Cargando Venta...">
        <div className="flex justify-center items-center h-screen">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600"></div>
          <p className="ml-4 text-lg text-gray-700">Cargando detalles de la venta...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Error">
        <div className="flex flex-col items-center justify-center h-screen px-4">
          <div className="bg-red-50 border border-red-300 text-red-700 px-6 py-4 rounded-lg relative mb-6 text-center shadow-md" role="alert">
            <span className="block text-lg font-medium mb-2">¡Error!</span>
            <span className="block">{error}</span>
          </div>
          <button
            onClick={() => router.push('/ventas')}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
          >
            <ArrowLeftIcon className="-ml-1 mr-3 h-5 w-5" aria-hidden="true" />
            Volver al Historial de Ventas
          </button>
        </div>
      </Layout>
    );
  }

  if (!venta) {
    return (
      <Layout title="Venta no encontrada">
        <div className="text-center py-10">
          <p className="text-xl text-gray-600">No se pudo cargar la información de la venta.</p>
          <button
            onClick={() => router.push('/ventas')}
            className="mt-6 inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            Volver al Historial de Ventas
          </button>
        </div>
      </Layout>
    );
  }

  const getEstadoClass = (estado) => {
    switch (estado) {
      case 'completada': return 'bg-green-100 text-green-800';
      case 'anulada': return 'bg-red-100 text-red-800';
      case 'pendiente': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTipoVentaIcon = (tipoVenta) => {
    if (tipoVenta === 'cotizacionAprobada') return <TagIcon className="h-5 w-5 mr-2" />;
    return <ShoppingCartIcon className="h-5 w-5 mr-2" />;
  };

  // Set de productoIds que han sido devueltos (para pintar filas)
  const productosDevueltosIds = new Set(
    devolucionesVenta.flatMap(dev => dev.items?.map(i => i.productoId) || [])
  );

  // Total devuelto acumulado
  const totalDevuelto = devolucionesVenta.reduce((sum, d) => {
    if (d.tipoDevolucion === 'credito-activo') {
      // El impacto real en la venta es la reducción de deuda + lo que se devuelve en efectivo
      const reduccion = parseFloat(d.reduccionDeuda || 0);
      const excedente = parseFloat(d.excedentePagoCliente || 0);
      // Si tiene los campos nuevos, usarlos; si no, fallback a montoProducto
      if (reduccion > 0 || excedente > 0) return sum + reduccion + excedente;
      // fallback: sumar el valor real del producto devuelto desde items
      return sum + parseFloat(d.montoADevolver || 0);
    }
    return sum + parseFloat(d.montoADevolver || 0);
  }, 0);

  // Renderizar los métodos de pago
  const renderPaymentMethods = () => {
    if (!venta.paymentData) {
      return (
        <div className="flex items-center text-gray-700">
          <BanknotesIcon className="h-5 w-5 mr-2 text-gray-500" />
          <p><span className="font-semibold">Método de Pago:</span> {getPaymentMethodLabel(venta.metodoPago || 'efectivo')}</p>
        </div>
      );
    }

    if (venta.paymentData.isMixedPayment && venta.paymentData.paymentMethods) {
      return (
        <div className="md:col-span-2">
          <div className="flex items-start text-gray-700 mb-2">
            <CreditCardIcon className="h-5 w-5 mr-2 text-gray-500 mt-1" />
            <div className="flex-1">
              <p className="font-semibold mb-3">Métodos de Pago (Mixto):</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {venta.paymentData.paymentMethods
                  .filter(pm => pm.amount > 0)
                  .map((paymentMethod, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg border">
                      <span className="inline-flex items-center text-sm font-medium text-gray-700">
                        <span className="mr-2 text-lg">{getPaymentMethodIcon(paymentMethod.method)}</span>
                        {paymentMethod.label || getPaymentMethodLabel(paymentMethod.method)}
                      </span>
                      <span className="font-bold text-gray-900">
                        S/. {parseFloat(paymentMethod.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      );
    } else {
      const singlePayment = venta.paymentData.paymentMethods?.[0] || { method: venta.metodoPago || 'efectivo', amount: venta.totalVenta };
      return (
        <div className="flex items-center text-gray-700">
          <BanknotesIcon className="h-5 w-5 mr-2 text-gray-500" />
          <p>
            <span className="font-semibold">Método de Pago:</span>
            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              <span className="mr-1">{getPaymentMethodIcon(singlePayment.method)}</span>
              {getPaymentMethodLabel(singlePayment.method)}
            </span>
          </p>
        </div>
      );
    }
  };

  return (
    <Layout title={`Detalle Venta #${venta.numeroVenta || venta.id.substring(0, 8)}`}>
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-6 bg-white rounded-lg shadow-md">

          {/* Header */}
          <div className="flex items-center justify-between mb-6 border-b pb-4">
            <h1 className="text-3xl font-extrabold text-gray-900 flex items-center flex-wrap gap-2">
              Detalle de Venta
              <span className="text-blue-700">#{venta.numeroVenta || venta.id.substring(0, 8).toUpperCase()}</span>
              {devolucionesVenta.length > 0 && (
                <span className="text-sm font-medium px-3 py-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                  {venta.estadoDevolucion === 'devuelta' ? '⚠ Devuelta' : '⚠ Dev. Parcial'}
                </span>
              )}
            </h1>
            <button
              onClick={() => router.push('/ventas')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition duration-150 ease-in-out"
            >
              <ArrowLeftIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
              Volver
            </button>
          </div>

          {/* Datos de la Venta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 mb-8">
            <div className="flex items-center text-gray-700">
              <UserIcon className="h-5 w-5 mr-2 text-gray-500" />
              <p><span className="font-semibold">Cliente:</span> {venta.clienteNombre} {venta.clienteDNI && `(DNI: ${venta.clienteDNI})`}</p>
            </div>
            <div className="flex items-center text-gray-700">
              <CalendarDaysIcon className="h-5 w-5 mr-2 text-gray-500" />
              <p><span className="font-semibold">Fecha:</span> {venta.fechaVentaFormatted}</p>
            </div>
            <div className="flex items-center text-gray-700">
              {getTipoVentaIcon(venta.tipoVenta)}
              <p>
                <span className="font-semibold">Tipo de Venta:</span>
                <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${venta.tipoVenta === 'cotizacionAprobada' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                  {venta.tipoVenta === 'cotizacionAprobada' ? 'Aprobada (Cotización)' : 'Directa'}
                </span>
              </p>
            </div>

            {renderPaymentMethods()}

            <div className="flex items-center text-gray-700">
              <p><span className="font-semibold">Registrado por:</span> {venta.empleadoId || 'Desconocido'}</p>
            </div>

            {venta.empleadoAsignadoNombre && (
              <div className="flex items-center text-gray-700">
                <IdentificationIcon className="h-5 w-5 mr-2 text-blue-500" />
                <p>
                  <span className="font-semibold">Empleado Asignado:</span>
                  <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {venta.empleadoAsignadoNombre}
                  </span>
                </p>
              </div>
            )}

            {venta.placaMoto && (
              <div className="flex items-center text-gray-700">
                <TruckIcon className="h-5 w-5 mr-2 text-green-500" />
                <p>
                  <span className="font-semibold">Placa de Moto:</span>
                  <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 font-mono">
                    {venta.placaMoto}
                  </span>
                </p>
              </div>
            )}

            {venta.modeloMoto && (
              <div className="flex items-center text-gray-700">
                <TruckIcon className="h-5 w-5 mr-2 text-gray-500" />
                <p>
                  <span className="font-semibold">Modelo de Moto:</span>
                  <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {venta.modeloMoto}
                  </span>
                </p>
              </div>
            )}

            <div className="flex items-center text-gray-700 md:col-span-2">
              <p><span className="font-semibold">Observaciones:</span> {venta.observaciones || 'Sin observaciones'}</p>
            </div>
          </div>

          {/* Productos Vendidos */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Productos Vendidos</h3>
            {itemsVenta.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No hay productos registrados para esta venta.</p>
            ) : (
              <div className="overflow-x-auto shadow-sm ring-1 ring-black ring-opacity-5 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">C. TIENDA</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PRODUCTO</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MARCA</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">C. PROVEEDOR</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">COLOR</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MEDIDA</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CANTIDAD</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PRECIO UNIT.</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SUBTOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {itemsVenta.map((item) => {
                      const fueDevuelto = productosDevueltosIds.has(item.productoId);
                      return (
                        <tr key={item.id} className={fueDevuelto ? 'bg-orange-50' : ''}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{item.codigoTienda || 'N/A'}</td>
                          <td className={`px-4 py-4 whitespace-nowrap text-sm font-medium ${fueDevuelto ? 'text-orange-800' : 'text-gray-900'}`}>
                            {item.nombreProducto}
                            {item.nombrePersonalizado && (
                              <div className="text-xs text-blue-600 font-semibold mt-0.5">
                                → {item.nombrePersonalizado}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{item.marca || 'N/A'}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{item.codigoProveedor || 'N/A'}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{item.color || 'N/A'}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{item.medida || 'N/A'}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{item.cantidad}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">S/. {parseFloat(item.precioVentaUnitario || 0).toFixed(2)}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">S/. {parseFloat(item.subtotal || 0).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>


           {/* Historial de Abonos — solo para ventas de crédito */}
            {venta.tipoVenta === 'credito' && abonosVenta.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-blue-700 mb-4 border-b border-blue-200 pb-2 flex items-center gap-2">
                  <BanknotesIcon className="h-5 w-5" />
                  Abonos Registrados ({abonosVenta.length})
                </h3>
                <div className="space-y-2">
                  {abonosVenta.map((abono) => (
                    <div key={abono.id} className="flex justify-between items-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div>
                        <p className="font-semibold text-blue-700">
                          S/. {parseFloat(abono.monto || 0).toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-600">
                          {abono.fecha?.toDate
                            ? abono.fecha.toDate().toLocaleDateString('es-PE', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit'
                              })
                            : 'N/A'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium capitalize">{abono.metodoPago}</p>
                        <p className="text-xs text-gray-500">{abono.descripcion || 'Abono a crédito'}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end mt-2">
                    <div className="bg-blue-100 border border-blue-300 rounded-lg px-4 py-2 text-right">
                      <span className="text-sm text-blue-700 font-medium">Total abonado: </span>
                      <span className="text-lg font-bold text-blue-800">
                        S/. {abonosVenta.reduce((s, a) => s + parseFloat(a.monto || 0), 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )} 
          {/* Sección de Devoluciones */}
          {devolucionesVenta.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-orange-700 mb-4 border-b border-orange-200 pb-2 flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Devoluciones Registradas
              </h3>

              {devolucionesVenta.map((dev) => (
                <div key={dev.id} className="mb-6 border border-orange-200 rounded-lg overflow-hidden">

                  {/* Header de la devolución */}
                  <div className="bg-orange-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-orange-800">{dev.numeroDevolucion}</span>
                      <span className="text-xs text-orange-600">
                        {dev.fechaSolicitud?.toDate
                          ? dev.fechaSolicitud.toDate().toLocaleDateString('es-ES', {
                              year: 'numeric', month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit'
                            })
                          : 'N/A'}
                      </span>
                      {dev.metodoPagoDevolucion && (
                        <span className="text-xs font-medium text-orange-700 bg-orange-100 border border-orange-300 px-2 py-0.5 rounded-full">
                          Devuelto por: {dev.metodoPagoDevolucion.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-orange-700">
                        Motivo: <span className="font-medium capitalize">{dev.motivo || 'N/A'}</span>
                      </span>
                      {dev.observaciones && (
                        <span className="text-xs text-orange-600 italic">"{dev.observaciones}"</span>
                      )}
                    </div>
                  </div>

                  {/* Tabla de items devueltos */}
                  {dev.items && dev.items.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-orange-100">
                        <thead className="bg-orange-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-orange-600 uppercase tracking-wider">Producto</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-orange-600 uppercase tracking-wider">Marca</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-orange-600 uppercase tracking-wider">C. Proveedor</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-orange-600 uppercase tracking-wider">Medida</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-orange-600 uppercase tracking-wider">Cant. Original</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-orange-600 uppercase tracking-wider">Cant. Devuelta</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-orange-600 uppercase tracking-wider">Precio Unit.</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-orange-600 uppercase tracking-wider">Monto Dev.</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-orange-50">
                          {dev.items.map((item) => (
                            <tr key={item.id} className="hover:bg-orange-50 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.nombreProducto}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{item.marca || 'N/A'}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{item.codigoProveedor || 'N/A'}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{item.medida || 'N/A'}</td>
                              <td className="px-4 py-3 text-sm text-gray-600 text-center">{item.cantidadOriginal}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                                  {item.cantidadADevolver}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 text-right">
                                S/. {parseFloat(item.precioVentaUnitario || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-sm font-semibold text-orange-700 text-right">
                                - S/. {parseFloat(
                                  item.montoDevolucion > 0
                                    ? item.montoDevolucion
                                    : (item.precioVentaUnitario || 0) * (item.cantidadADevolver || 0)
                                ).toFixed(2)}
                                {item.montoDevolucion === 0 && dev.tipoDevolucion === 'credito-activo' && (
                                  <span className="block text-xs text-yellow-600 font-normal">(reduce deuda)</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Footer con procesado por */}
                  <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 flex justify-between items-center">
                    <span>Procesado por: <span className="font-medium">{dev.procesadoPor || 'N/A'}</span></span>
                    {dev.fechaProcesamiento?.toDate && (
                      <span>
                        Procesado el {dev.fechaProcesamiento.toDate().toLocaleDateString('es-ES', {
                          year: 'numeric', month: '2-digit', day: '2-digit'
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Total devuelto */}
              <div className="flex justify-end mt-2">
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 text-right">
                  <span className="text-sm text-orange-700 font-medium">Total devuelto: </span>
                  <span className="text-lg font-bold text-orange-800">
                    - S/. {totalDevuelto.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Resumen Final */}
          <div className="flex justify-end items-end gap-6 border-t pt-4 mt-6 flex-wrap">
            
            {devolucionesVenta.length > 0 ? (
              <div className="text-right">
                <p className="text-xl font-semibold text-gray-800 mb-3">
                  Estado:
                  <span className={`ml-2 px-3 py-1 rounded-full text-sm font-bold ${
                    venta.estadoDevolucion === 'devuelta'
                      ? 'bg-orange-100 text-orange-800'
                      : venta.estadoDevolucion === 'parcial'
                      ? 'bg-yellow-100 text-yellow-800'
                      : getEstadoClass(venta.estado)
                  }`}>
                    {venta.estadoDevolucion === 'devuelta'
                      ? 'Devuelta'
                      : venta.estadoDevolucion === 'parcial'
                      ? 'Parcial'
                      : venta.estado.charAt(0).toUpperCase() + venta.estado.slice(1)}
                  </span>
                </p>
                <p className="text-sm text-gray-400">Total original</p>
                <p className="text-xl font-semibold text-gray-400 line-through">
                  S/. {parseFloat(venta.totalVenta || 0).toFixed(2)}
                </p>

                {/* Para créditos: mostrar desglose de abonos + devolución */}
                {venta.tipoVenta === 'credito' && abonosVenta.length > 0 ? (
                  <>
                    <p className="text-sm text-blue-600 font-medium mt-1">
                      + S/. {abonosVenta.reduce((s,a) => s + parseFloat(a.monto||0), 0).toFixed(2)} abonado
                    </p>
                    <p className="text-sm text-orange-600 font-medium mt-1">
                      - S/. {totalDevuelto.toFixed(2)} devuelto
                    </p>
                    {(venta.excedentePagoCliente || 0) > 0 && (
                      <p className="text-sm text-red-600 font-medium mt-1">
                        ⚠️ Negocio debe al cliente: S/. {parseFloat(venta.excedentePagoCliente).toFixed(2)}
                      </p>
                    )}
                    <p className="text-3xl font-extrabold text-green-700 mt-2">
                      Neto cobrado: S/. {(
                        abonosVenta.reduce((s,a) => s + parseFloat(a.monto||0), 0) 
                        - parseFloat(venta.excedentePagoCliente || 0)
                      ).toFixed(2)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-orange-600 font-medium mt-1">
                      - S/. {totalDevuelto.toFixed(2)} devuelto
                    </p>
                    <p className="text-3xl font-extrabold text-green-700 mt-2">
                      Neto: S/. {(parseFloat(venta.totalVenta || 0) - totalDevuelto).toFixed(2)}
                    </p>
                  </>
                )}
              </div>
            ) : (
              // SIN devoluciones: mostrar normal
              <div className="text-right">
                <p className="text-xl font-semibold text-gray-800">
                  Estado:
                  <span className={`ml-2 px-3 py-1 rounded-full text-sm font-bold ${getEstadoClass(venta.estado)}`}>
                    {venta.estado.charAt(0).toUpperCase() + venta.estado.slice(1)}
                  </span>
                </p>
                <p className="text-3xl font-extrabold text-green-700 mt-4">
                  Total Venta: S/. {parseFloat(venta.totalVenta || 0).toFixed(2)}
                </p>
              </div>
            )}

          </div>

        </div>
      </div>
    </Layout>
  );
};

export default VentaDetailPage;