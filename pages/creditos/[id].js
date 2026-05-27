// pages/creditos/[id].js
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { db } from '../../lib/firebase'; // Asegúrate que esta ruta sea correcta
import { useAuth } from '../../contexts/AuthContext'; // Asegúrate que esta ruta sea correcta
import Layout from '../../components/Layout'; // Asegúrate que esta ruta sea correcta
import {
  collection,
  query,
  where,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  getDocs,
  orderBy,
  getDoc,
  limit
} from 'firebase/firestore';
import {
  CreditCardIcon,
  ArrowDownTrayIcon,
  CurrencyDollarIcon,
  CubeIcon,
  ArrowLeftIcon,
  DocumentIcon,
  PlusIcon,
  BanknotesIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

// Modal de alerta personalizado
const CustomAlert = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
      <div className="relative p-5 border w-96 shadow-lg rounded-md bg-white">
        <h3 className="lg:text-lg text-base font-bold text-gray-900">Notificación</h3>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-auto shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};

const ClienteCreditoDetalle = () => {
  const router = useRouter();
  const { id: clienteId } = router.query;
  const { user } = useAuth();

  const [cliente, setCliente] = useState(null);
  const [creditosConItems, setCreditosConItems] = useState([]);
  const [abonos, setAbonos] = useState([]); // Todos los abonos
  const [abonosPaginados, setAbonosPaginados] = useState([]); // Abonos mostrados en la página actual
  const [montoAbono, setMontoAbono] = useState(''); // Monto del abono a registrar
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alertMessage, setAlertMessage] = useState('');
  
  // Estados para paginación de abonos
  const [limitAbonosPerPage, setLimitAbonosPerPage] = useState(10);
  const [currentPageAbonos, setCurrentPageAbonos] = useState(1);

  const showAlert = (message) => setAlertMessage(message);
  const closeAlert = () => setAlertMessage('');

  // Redirigir si no está autenticado
  useEffect(() => {
    if (!user) {
      router.push('/auth');
    }
  }, [user, router]);

  // Cargar detalles del cliente, créditos con sus ítems y abonos
  useEffect(() => {
  if (!clienteId || !user) {
    setLoading(false);
    return;
  }

  const fetchClientAndCreditos = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Client Details
      const clientDocRef = doc(db, 'cliente', clienteId);
      const clientDocSnap = await getDoc(clientDocRef);
      if (clientDocSnap.exists()) {
        setCliente({ id: clientDocSnap.id, ...clientDocSnap.data() });
      } else {
        setError("Cliente no encontrado.");
        setLoading(false);
        return;
      }

      // 2. Fetch Active Credits for the client
      console.log("Cargando créditos para clienteId:", clienteId);
      const creditosQuery = query(
        collection(db, 'creditos'),
        where('clienteId', '==', clienteId),
        where('estado', '==', 'activo')
      );
      const creditosSnapshot = await getDocs(creditosQuery);
      
      console.log("Créditos activos encontrados para clienteId", clienteId, ":", creditosSnapshot.docs.length);

      let totalDeudaItems = 0;
      const loadedCreditosConItems = [];
      for (const creditoDoc of creditosSnapshot.docs) {
        const creditoData = { id: creditoDoc.id, ...creditoDoc.data(), items: [] };

        const itemsCreditoQuery = query(
          collection(db, 'creditos', creditoDoc.id, 'itemsCredito'),
          orderBy('createdAt', 'desc')
        );
        const itemsSnapshot = await getDocs(itemsCreditoQuery);

        itemsSnapshot.forEach(itemDoc => {
          const itemData = { id: itemDoc.id, creditoId: creditoDoc.id, ...itemDoc.data() };
          creditoData.items.push(itemData);
          totalDeudaItems += (itemData.subtotal || 0);
        });
        loadedCreditosConItems.push(creditoData);
      }

      // ── REEMPLAZA setCreditosConItems(loadedCreditosConItems) por esto ──
      const creditosFiltrados = loadedCreditosConItems.filter(c => c.items.length > 0);
      setCreditosConItems(creditosFiltrados);
      // ────────────────────────────────────────────────────────────────────

      // 3. Fetch Abonos del cliente SOLO si hay créditos activos
      let totalAbonos = 0;
      if (creditosFiltrados.length > 0) {
        // ── CAMBIO: filtrar abonos por creditoId ──
        const creditoIds = creditosFiltrados.map(c => c.id);

        const abonosQuery = query(
          collection(db, 'abonos'),
          where('clienteId', '==', clienteId),
          where('estado', 'in', ['activo', 'pendiente']),
          orderBy('fecha', 'desc')
        );
        const abonosSnapshot = await getDocs(abonosQuery);
        const loadedAbonos = abonosSnapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(abono =>
            !abono.creditoId || creditoIds.includes(abono.creditoId)
          );
        // ─────────────────────────────────────────

        setAbonos(loadedAbonos);
        totalAbonos = loadedAbonos.reduce((sum, abono) => sum + (abono.monto || 0), 0);
      } else {
        setAbonos([]);
      }

      // 4. Calcular saldo real
      const saldoRealQueDebe = Math.max(0, totalDeudaItems - totalAbonos);
      setCliente(prevCliente => ({
        ...prevCliente,
        montoCreditoActual: saldoRealQueDebe
      }));

      console.log("=== CÁLCULO DEL SALDO ===");
      console.log("Total items de crédito:", totalDeudaItems);
      console.log("Total abonos realizados:", totalAbonos);
      console.log("Saldo real que debe:", saldoRealQueDebe);
      console.log("Todos los créditos con sus ítems cargados:", loadedCreditosConItems);

    } catch (err) {
      console.error('Error al cargar datos del cliente y créditos:', err);
      setError("Error al cargar la información del crédito: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  fetchClientAndCreditos();
  }, [clienteId, user]);

  // Efecto para manejar la paginación de abonos
  useEffect(() => {
    const startIndex = (currentPageAbonos - 1) * limitAbonosPerPage;
    const endIndex = startIndex + limitAbonosPerPage;
    setAbonosPaginados(abonos.slice(startIndex, endIndex));
  }, [abonos, currentPageAbonos, limitAbonosPerPage]);

  // Modificación en la función procesarAbono
  const procesarAbono = async () => {
    const monto = parseFloat(montoAbono);
    
    if (!monto || monto <= 0) {
      showAlert('Ingresa un monto válido para el abono');
      return;
    }

    if (monto > cliente.montoCreditoActual) {
      showAlert('El monto del abono no puede ser mayor al saldo que debe');
      return;
    }

    const confirmPayment = window.confirm(
      `¿Confirmar abono de S/. ${monto.toFixed(2)} por ${metodoPago}?`
    );
    if (!confirmPayment) return;

    try {
      const nuevoSaldo = parseFloat((cliente.montoCreditoActual - monto).toFixed(2));
      const estaSaldando = nuevoSaldo <= 0;

      // ── MOVER AQUÍ ARRIBA ──
      const creditoConVenta = creditosConItems.find(c => c.ventaId);

      // 1. Registrar abono
      const abonoData = {
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        clienteDNI: cliente.dni,
        monto,
        metodoPago,
        fecha: new Date(),
        empleadoId: user.email || user.uid,
        descripcion: 'Abono a cuenta de crédito',
        estado: estaSaldando ? 'procesado' : 'activo',
        creditoId: creditoConVenta?.id || creditosConItems[0]?.id || null,
        ventaId: creditoConVenta?.ventaId || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const abonoRef = await addDoc(collection(db, 'abonos'), abonoData);

      // 2. Actualizar saldo del cliente
      await updateDoc(doc(db, 'cliente', cliente.id), {
        montoCreditoActual: Math.max(0, nuevoSaldo),
        updatedAt: new Date()
      });

      // 3. Venta vinculada — ya está declarado arriba, no repetir
      if (creditoConVenta?.ventaId) {

        const ventaDoc = await getDoc(doc(db, 'ventas', creditoConVenta.ventaId));
        if (!ventaDoc.exists()) {
          setCliente(prev => ({ ...prev, montoCreditoActual: Math.max(0, nuevoSaldo) }));
          setAbonos(prev => [{ id: abonoRef.id, ...abonoData }, ...prev]);
          setMontoAbono('');
          showAlert(`Abono de S/. ${monto.toFixed(2)} registrado. Saldo restante: S/. ${Math.max(0, nuevoSaldo).toFixed(2)}`);
          return;
        }

        if (estaSaldando) {
          await updateDoc(doc(db, 'ventas', creditoConVenta.ventaId), {
            estado: 'completada',
            metodoPago,
            fechaSaldado: new Date(),
            updatedAt: new Date()
          });

          for (const credito of creditosConItems) {
            await updateDoc(doc(db, 'creditos', credito.id), {
              estado: 'saldado',
              fechaSaldado: new Date(),
              updatedAt: new Date()
            });
            for (const item of credito.items) {
              await updateDoc(
                doc(db, 'creditos', credito.id, 'itemsCredito', item.id),
                { estado: 'saldado', fechaSaldado: new Date(), updatedAt: new Date() }
              );
            }
          }

          const abonosActivosSnap = await getDocs(query(
            collection(db, 'abonos'),
            where('clienteId', '==', cliente.id),
            where('estado', '==', 'activo')
          ));
          await Promise.all(abonosActivosSnap.docs.map(d =>
            updateDoc(doc(db, 'abonos', d.id), {
              estado: 'procesado',
              fechaProcesado: new Date(),
              updatedAt: new Date()
            })
          ));

          showAlert(`¡Crédito saldado! Abono de S/. ${monto.toFixed(2)} registrado. Redirigiendo...`);
          setTimeout(() => router.push('/creditos/activos'), 2000);

        } else {
          await updateDoc(doc(db, 'ventas', creditoConVenta.ventaId), {
            ultimoAbono: {
              monto,
              metodoPago,
              fecha: new Date(),
              abonoId: abonoRef.id,
              saldoRestante: nuevoSaldo,
            },
            updatedAt: new Date()
          });

          setCliente(prev => ({ ...prev, montoCreditoActual: nuevoSaldo }));
          setAbonos(prev => [{ id: abonoRef.id, ...abonoData }, ...prev]);
          setMontoAbono('');
          showAlert(`Abono de S/. ${monto.toFixed(2)} registrado. Saldo restante: S/. ${nuevoSaldo.toFixed(2)}`);
        }
      } else {
        // Crédito antiguo sin ventaId
        setCliente(prev => ({ ...prev, montoCreditoActual: Math.max(0, nuevoSaldo) }));
        setAbonos(prev => [{ id: abonoRef.id, ...abonoData }, ...prev]);
        setMontoAbono('');
        showAlert(`Abono de S/. ${monto.toFixed(2)} registrado. Saldo restante: S/. ${Math.max(0, nuevoSaldo).toFixed(2)}`);
      }

    } catch (error) {
      console.error('Error al procesar abono:', error);
      showAlert('Error al procesar el abono. Inténtalo de nuevo.');
    }
  };

  // Funciones para paginación de abonos
  const totalPagesAbonos = Math.ceil(abonos.length / limitAbonosPerPage);

  const goToPageAbonos = (page) => {
    setCurrentPageAbonos(page);
  };

  const nextPageAbonos = () => {
    if (currentPageAbonos < totalPagesAbonos) {
      setCurrentPageAbonos(currentPageAbonos + 1);
    }
  };

  const prevPageAbonos = () => {
    if (currentPageAbonos > 1) {
      setCurrentPageAbonos(currentPageAbonos - 1);
    }
  };

  if (loading) {
    return (
      <Layout title="Cargando Crédito...">
        <div className="flex justify-center items-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="ml-4 text-lg text-gray-700">Cargando detalles del crédito...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Error de Crédito">
        <CustomAlert message={alertMessage || error} onClose={() => { closeAlert(); setError(null); router.push('/creditos/activos'); }} />
        <div className="flex flex-col items-center justify-center h-screen text-red-700">
          <p className="text-xl">Ocurrió un error:</p>
          <p className="text-lg">{error}</p>
          <button
            onClick={() => router.push('/creditos/activos')}
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Volver a la lista de créditos
          </button>
        </div>
      </Layout>
    );
  }

  if (!cliente) {
    return (
        <Layout title="Cliente no encontrado">
            <div className="flex flex-col items-center justify-center h-screen text-gray-700">
                <p className="text-xl">Cliente no encontrado o ID inválido.</p>
                <button
                    onClick={() => router.push('/creditos/activos')}
                    className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                    Volver a la lista de créditos
                </button>
            </div>
        </Layout>
    );
  }

  const totalProductosEnCredito = creditosConItems.reduce((count, credito) => count + credito.items.length, 0);
  const totalAbonos = abonos.reduce((sum, abono) => sum + (abono.monto || 0), 0);
  const saldoQueDebe = cliente.montoCreditoActual || 0; // Ya calculado correctamente
  const montoOriginalCredito = creditosConItems.reduce((sum, credito) => 
    sum + credito.items.reduce((itemSum, item) => itemSum + (item.subtotal || 0), 0), 0
  );

  return (
    <Layout title={`Crédito - ${cliente.nombre}`}>
      <CustomAlert message={alertMessage} onClose={closeAlert} />
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-6 bg-white rounded-lg shadow-md">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/creditos/activos')}
                className="mr-4 p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <CreditCardIcon className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-800">
                  Crédito de {cliente.nombre} {cliente.apellido || ''}
                </h1>
                <p className="text-gray-600">DNI: {cliente.dni}</p>
              </div>
            </div>
            <div className="text-right space-y-1">
              <div>
                <p className="text-sm text-gray-600">Monto Original</p>
                <p className="text-lg font-semibold text-blue-600">
                  S/. {montoOriginalCredito.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Abonado</p>
                <p className="text-lg font-semibold text-green-600">
                  S/. {totalAbonos.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Saldo que Debe</p>
                <p className="text-2xl font-bold text-red-600">
                  S/. {saldoQueDebe.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Sistema de Abonos */}
          {saldoQueDebe > 0 && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4 flex items-center text-green-800">
                <BanknotesIcon className="h-5 w-5 mr-2" />
                Registrar Abono
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Monto del Abono (S/.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={saldoQueDebe}
                    value={montoAbono}
                    onChange={(e) => setMontoAbono(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Método de Pago
                  </label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="yape">Yape</option>
                    <option value="plin">Plin</option>
                    <option value="tarjeta">Tarjeta</option>
                  </select>
                </div>
                
                <div className="flex items-end">
                  <button
                    onClick={procesarAbono}
                    disabled={!montoAbono || parseFloat(montoAbono) <= 0}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-md font-semibold flex items-center justify-center"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Registrar Abono
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Historial de Abonos con Paginación */}
          {abonos.length > 0 && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center">
                  <DocumentIcon className="h-5 w-5 mr-2" />
                  Historial de Abonos ({abonos.length})
                </h3>
                
                {/* Selector de límite por página */}
                <div className="flex items-center gap-2">
                  <label htmlFor="limit-abonos-per-page" className="text-sm text-gray-600">
                    Mostrar:
                  </label>
                  <select
                    id="limit-abonos-per-page"
                    className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={limitAbonosPerPage}
                    onChange={(e) => {
                      setLimitAbonosPerPage(Number(e.target.value));
                      setCurrentPageAbonos(1);
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                  <span className="text-sm text-gray-600">por página</span>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-2">
                  {abonosPaginados.map((abono) => (
                    <div key={abono.id} className="flex justify-between items-center p-3 bg-white rounded border">
                      <div>
                        <p className="font-semibold text-green-600">S/. {abono.monto?.toFixed(2)}</p>
                        <p className="text-sm text-gray-600">
                          {abono.fecha?.toDate ? abono.fecha.toDate().toLocaleDateString('es-PE') : 
                            (abono.fecha && new Date(abono.fecha.seconds * 1000).toLocaleDateString('es-PE'))}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium capitalize">{abono.metodoPago}</p>
                        <p className="text-xs text-gray-500">{abono.descripcion}</p>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Controles de paginación para abonos */}
                {totalPagesAbonos > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                    <div className="text-sm text-gray-600">
                      Mostrando {((currentPageAbonos - 1) * limitAbonosPerPage) + 1} a {Math.min(currentPageAbonos * limitAbonosPerPage, abonos.length)} de {abonos.length} abonos
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={prevPageAbonos}
                        disabled={currentPageAbonos === 1}
                        className="p-2 text-gray-600 hover:text-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                      </button>
                      
                      <div className="flex space-x-1">
                        {[...Array(totalPagesAbonos)].map((_, index) => {
                          const page = index + 1;
                          return (
                            <button
                              key={page}
                              onClick={() => goToPageAbonos(page)}
                              className={`px-3 py-1 rounded text-sm ${
                                currentPageAbonos === page
                                  ? 'bg-blue-500 text-white'
                                  : 'text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              {page}
                            </button>
                          );
                        })}
                      </div>
                      
                      <button
                        onClick={nextPageAbonos}
                        disabled={currentPageAbonos === totalPagesAbonos}
                        className="p-2 text-gray-600 hover:text-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Créditos y sus productos */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <DocumentIcon className="h-5 w-5 mr-2" />
              Productos en Crédito ({creditosConItems.length} créditos, {totalProductosEnCredito} productos)
            </h2>

            {creditosConItems.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No hay créditos activos para este cliente.</p>
            ) : (
              <div className="space-y-6">
                {creditosConItems.map((credito) => (
                  <div key={credito.id} className="border border-gray-200 rounded-lg p-4 shadow-sm bg-gray-50">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
                      <div>
                        <h3 className="text-lg font-bold text-gray-700 flex items-center">
                          <CreditCardIcon className="h-5 w-5 mr-2 text-indigo-600" />
                          Crédito ID: <span className="text-indigo-600 ml-2 text-sm">{credito.id}</span>
                        </h3>
                        <p className="text-sm text-gray-600">
                            Número de Crédito: {credito.numeroCredito || 'N/A'}
                        </p>
                        <p className="text-sm text-gray-600">
                            Fecha de Creación: {credito.fechaCreacion?.toDate ?
                                credito.fechaCreacion.toDate().toLocaleDateString('es-PE') :
                                (credito.fechaCreacion && new Date(credito.fechaCreacion.seconds * 1000 + credito.fechaCreacion.nanoseconds / 1000000).toLocaleDateString('es-PE'))
                            }
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Monto de este Crédito</p>
                        <p className="text-xl font-bold text-blue-600">
                            S/. {credito.items.reduce((sum, item) => sum + (item.subtotal || 0), 0).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Productos dentro de este crédito */}
                    <h4 className="font-semibold mb-2 flex items-center">
                      <CubeIcon className="h-4 w-4 mr-1 text-gray-600" />
                      Productos de este Crédito ({credito.items.length})
                    </h4>
                    {credito.items.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">Este crédito no tiene productos pendientes.</p>
                    ) : (
                      <div className="space-y-2">
                        {credito.items.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 rounded-md border border-gray-200 bg-white"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h5 className="font-semibold text-gray-800 text-sm">
                                  {item.nombreProducto}
                                </h5>
                                <p className="text-xs text-gray-600">
                                  Cant: {item.cantidad} | P. Unit: S/. {item.precioVentaUnitario?.toFixed(2)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-md">
                                  S/. {item.subtotal?.toFixed(2)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumen final */}
          {(saldoQueDebe === 0 && creditosConItems.length > 0) && (
            <div className="bg-green-100 border border-green-300 rounded-lg p-4 text-center">
              <h3 className="text-lg font-bold text-green-800 mb-2">¡Crédito Saldado!</h3>
              <p className="text-green-700">
                Este cliente ha pagado completamente su deuda. 
                Monto original: S/. {montoOriginalCredito.toFixed(2)} | 
                Total abonado: S/. {totalAbonos.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ClienteCreditoDetalle;