// pages/cotizaciones/index.js
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import { generarPDFCotizacionCompleta } from '../../components/utils/pdfGeneratorCotizaciones';
import CustomDatePicker from '../../components/CustomDatePicker';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  addDoc,
  limit,
  getDoc,
  onSnapshot,
  Timestamp,
  getCountFromServer
} from 'firebase/firestore';
import { useRouter } from 'next/router';
import {
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  DocumentTextIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PrinterIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const CotizacionesIndexPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCotizaciones, setFilteredCotizaciones] = useState([]);
  const [totalCotizacionesPeriodo, setTotalCotizacionesPeriodo] = useState(0);

  // Estados para filtros
  const [filterPeriod, setFilterPeriod] = useState('day');
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  });
  const [selectedEstado, setSelectedEstado] = useState('all');
  const [limitFirestore, setLimitFirestore] = useState(20);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const cotizacionesPerPage = 20; // FIJO - muestra de 20 en 20

  // useEffect 1: Carga desde Firestore
  useEffect(() => {
    if (!user) { router.push('/auth'); return; }
    if (filterPeriod === 'custom' && (!dateRange.start || !dateRange.end)) return;

    setLoading(true);
    setError(null);

    const isAdmin = user?.email === 'admin@gmail.com' || user?.email === 'admin2@gmail.com';
    let constraints = [];
    const { start, end } = dateRange;

    if (start && end) {
      const startCopy = new Date(start); startCopy.setHours(0, 0, 0, 0);
      const endCopy = new Date(end); endCopy.setHours(23, 59, 59, 999);

      constraints = [
        where('fechaCreacion', '>=', Timestamp.fromDate(startCopy)),
        where('fechaCreacion', '<=', Timestamp.fromDate(endCopy)),
        orderBy('fechaCreacion', 'desc'),
        limit(limitFirestore)
      ];
    } else {
      constraints = [
        orderBy('fechaCreacion', 'desc'),
        limit(limitFirestore)
      ];
    }

    if (selectedEstado !== 'all') {
      constraints = [where('estado', '==', selectedEstado), ...constraints];
    }

    if (!isAdmin) {
      constraints = [where('empleadoId', '==', user.email || user.uid), ...constraints];
    }

    const q = query(collection(db, 'cotizaciones'), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedCotizaciones = snapshot.docs.map(docCot => {
        const data = docCot.data();
        return {
          id: docCot.id,
          ...data,
          fechaCreacion: data.fechaCreacion?.toDate().toLocaleDateString('es-ES', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          }) || 'N/A',
          estado: data.estado,
          metodoPago: data.metodoPago || 'N/A',
        };
      });

      setCotizaciones(loadedCotizaciones);
      setLoading(false);
    }, (err) => {
      setError("Error al cargar cotizaciones: " + err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, router, dateRange, selectedEstado, limitFirestore, filterPeriod]);

  // useEffect 2: Conteo total
  useEffect(() => {
    if (!user) return;
    if (filterPeriod === 'custom' && (!dateRange.start || !dateRange.end)) return;

    const contarCotizaciones = async () => {
      try {
        let constraints = [];
        const { start, end } = dateRange;

        if (start && end) {
          const startCopy = new Date(start); startCopy.setHours(0, 0, 0, 0);
          const endCopy = new Date(end); endCopy.setHours(23, 59, 59, 999);
          constraints = [
            where('fechaCreacion', '>=', Timestamp.fromDate(startCopy)),
            where('fechaCreacion', '<=', Timestamp.fromDate(endCopy)),
          ];
        }

        if (selectedEstado !== 'all') {
          constraints.push(where('estado', '==', selectedEstado));
        }

        const q = query(collection(db, 'cotizaciones'), ...constraints);
        const snapshot = await getCountFromServer(q);
        setTotalCotizacionesPeriodo(snapshot.data().count);
      } catch (err) {
        console.error('Error al contar cotizaciones:', err);
      }
    };

    contarCotizaciones();
  }, [user, dateRange, selectedEstado, filterPeriod]);

  // useEffect 3: Filtros locales + búsqueda Firestore
  useEffect(() => {
    let filtered = [...cotizaciones];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(cot =>
        cot.numeroCotizacion?.toLowerCase().includes(lower) ||
        cot.clienteNombre?.toLowerCase().includes(lower) ||
        cot.observaciones?.toLowerCase().includes(lower) ||
        cot.estado?.toLowerCase().includes(lower) ||
        cot.metodoPago?.toLowerCase().includes(lower)
      );

      if (filtered.length === 0 && searchTerm.length >= 3) {
        const buscarEnFirestore = async () => {
          try {
            const { getDocs: getDocsFS } = await import('firebase/firestore');
            const termUpper = searchTerm.toUpperCase();
            const termCap = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();

            const qNumero = query(
              collection(db, 'cotizaciones'),
              where('numeroCotizacion', '==', termUpper),
              limit(5)
            );

            const qClienteUpper = query(
              collection(db, 'cotizaciones'),
              where('clienteNombre', '>=', termUpper),
              where('clienteNombre', '<=', termUpper + '\uf8ff'),
              orderBy('clienteNombre', 'asc'),
              limit(20)
            );

            const qClienteCap = query(
              collection(db, 'cotizaciones'),
              where('clienteNombre', '>=', termCap),
              where('clienteNombre', '<=', termCap + '\uf8ff'),
              orderBy('clienteNombre', 'asc'),
              limit(20)
            );

            const [snapNumero, snapUpper, snapCap] = await Promise.all([
              getDocsFS(qNumero),
              getDocsFS(qClienteUpper),
              getDocsFS(qClienteCap),
            ]);

            const idsVistos = new Set();
            const resultados = [];

            [...snapNumero.docs, ...snapUpper.docs, ...snapCap.docs].forEach(docSnap => {
              if (!idsVistos.has(docSnap.id)) {
                idsVistos.add(docSnap.id);
                const data = docSnap.data();
                resultados.push({
                  id: docSnap.id,
                  ...data,
                  fechaCreacion: data.fechaCreacion?.toDate().toLocaleDateString('es-ES', {
                    year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  }) || 'N/A',
                  estado: data.estado,
                  metodoPago: data.metodoPago || 'N/A',
                });
              }
            });

            if (resultados.length > 0) {
              setFilteredCotizaciones(resultados);
              setCurrentPage(1);
            }
          } catch (err) {
            console.error('Error en búsqueda directa:', err);
          }
        };

        buscarEnFirestore();
        return;
      }
    }

    setFilteredCotizaciones(filtered);
    setCurrentPage(1);
  }, [searchTerm, cotizaciones]);

  // Paginación
  const totalPages = Math.ceil(filteredCotizaciones.length / cotizacionesPerPage);
  const indexOfLastCotizacion = currentPage * cotizacionesPerPage;
  const indexOfFirstCotizacion = indexOfLastCotizacion - cotizacionesPerPage;
  const currentCotizaciones = filteredCotizaciones.slice(indexOfFirstCotizacion, indexOfLastCotizacion);

  const goToNextPage = () => setCurrentPage(p => Math.min(p + 1, totalPages));
  const goToPrevPage = () => setCurrentPage(p => Math.max(p - 1, 1));

  const handleFilterChange = (period) => {
    setFilterPeriod(period);
    const today = new Date();
    switch (period) {
      case 'day': {
        const start = new Date(today); start.setHours(0, 0, 0, 0);
        const end = new Date(today); end.setHours(23, 59, 59, 999);
        setDateRange({ start, end }); break;
      }
      case 'week': {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        start.setHours(0, 0, 0, 0);
        const end = new Date(today); end.setHours(23, 59, 59, 999);
        setDateRange({ start, end }); break;
      }
      case 'month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(today); end.setHours(23, 59, 59, 999);
        setDateRange({ start, end }); break;
      }
      case 'all':
      default:
        setDateRange({ start: null, end: null }); break;
    }
  };

  const clearFilters = () => {
    const today = new Date();
    const start = new Date(today); start.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setHours(23, 59, 59, 999);
    setFilterPeriod('day');
    setDateRange({ start, end });
    setSelectedEstado('all');
    setSearchTerm('');
    setLimitFirestore(20);
    setCurrentPage(1);
  };

  // Función FIFO
  const consumirStockFIFO = async (productoId, cantidadVendida, transaction) => {
    const lotesQuery = query(
      collection(db, 'lotes'),
      where('productoId', '==', productoId),
      where('stockRestante', '>', 0),
      where('estado', '==', 'activo'),
      orderBy('fechaIngreso', 'asc')
    );
    const lotesSnapshot = await getDocs(lotesQuery);
    let cantidadPendiente = cantidadVendida;
    const movimientos = [];

    for (const loteDoc of lotesSnapshot.docs) {
      if (cantidadPendiente <= 0) break;
      const lote = loteDoc.data();
      const consumir = Math.min(cantidadPendiente, lote.stockRestante);
      const nuevoStock = lote.stockRestante - consumir;
      transaction.update(doc(db, 'lotes', loteDoc.id), {
        stockRestante: nuevoStock,
        estado: nuevoStock <= 0 ? 'agotado' : 'activo',
        updatedAt: serverTimestamp()
      });
      movimientos.push({ loteId: loteDoc.id, numeroLote: lote.numeroLote, cantidadConsumida: consumir, precioCompraUnitario: lote.precioCompraUnitario, stockRestante: nuevoStock });
      cantidadPendiente -= consumir;
    }

    if (cantidadPendiente > 0) throw new Error(`Stock insuficiente. Faltan ${cantidadPendiente} unidades.`);
    return movimientos;
  };

  const handleConfirmarCotizacion = async (cotizacionId) => {
    if (!window.confirm('¿Confirmar esta cotización? Esto la convertirá en una VENTA y consumirá stock.')) return;

    setLoading(true);
    setError(null);
    try {
      await runTransaction(db, async (transaction) => {
        const cotizacionRef = doc(db, 'cotizaciones', cotizacionId);
        const cotizacionSnap = await transaction.get(cotizacionRef);
        if (!cotizacionSnap.exists()) throw new Error('Cotización no encontrada.');
        const currentCotizacionData = cotizacionSnap.data();
        if (currentCotizacionData.estado === 'confirmada' || currentCotizacionData.estado === 'cancelada')
          throw new Error('Esta cotización ya fue confirmada o cancelada.');

        const itemsCotizacionSnapshot = await getDocs(
          collection(db, 'cotizaciones', cotizacionId, 'itemsCotizacion')
        );
        if (itemsCotizacionSnapshot.empty) throw new Error('No hay productos en esta cotización.');

        const itemsData = [];
        const productosAActualizar = new Map();
        const lotesData = new Map();

        for (const itemDoc of itemsCotizacionSnapshot.docs) {
          const itemData = itemDoc.data();
          const productoRef = doc(db, 'productos', itemData.productoId);
          const productoSnap = await transaction.get(productoRef);
          if (!productoSnap.exists()) throw new Error(`Producto ${itemData.productoId} no encontrado.`);

          const productoData = productoSnap.data();
          const currentStock = productoData.stockActual || 0;
          const cantidadVendida = itemData.cantidad || 0;
          const stockUsadoProducto = (productosAActualizar.get(itemData.productoId)?.stockUsado || 0) + cantidadVendida;

          if (currentStock < stockUsadoProducto) throw new Error(`Stock insuficiente para "${itemData.nombreProducto}".`);

          productosAActualizar.set(itemData.productoId, { productoRef, currentProductoData: productoData, stockUsado: stockUsadoProducto });

          if (itemData.loteId) {
            if (!lotesData.has(itemData.loteId)) {
              const loteRef = doc(db, 'lotes', itemData.loteId);
              const loteSnap = await transaction.get(loteRef);
              if (!loteSnap.exists()) throw new Error(`Lote ${itemData.loteId} no encontrado.`);
              lotesData.set(itemData.loteId, { ref: loteRef, data: loteSnap.data(), stockUsado: 0 });
            }
            const loteInfo = lotesData.get(itemData.loteId);
            const nuevoStockUsadoLote = loteInfo.stockUsado + cantidadVendida;
            if (loteInfo.data.stockRestante < nuevoStockUsadoLote)
              throw new Error(`Stock insuficiente en lote ${loteInfo.data.numeroLote}.`);
            loteInfo.stockUsado = nuevoStockUsadoLote;
          }

          itemsData.push({ itemData, productoRef, currentProductoData: productoData });
        }

        const newVentaRef = doc(collection(db, 'ventas'));
        const numeroVenta = `V-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const clienteNombre = currentCotizacionData.clienteNombre || 'Cliente No Especificado';

        transaction.set(newVentaRef, {
          numeroVenta,
          cotizacionId,
          clienteId: currentCotizacionData.clienteId,
          clienteNombre,
          clienteDNI: currentCotizacionData.clienteDNI || null,
          totalVenta: currentCotizacionData.totalCotizacion,
          gananciaTotalVenta: currentCotizacionData.gananciaTotalCotizacion || 0,
          fechaVenta: serverTimestamp(),
          empleadoId: user.email || user.uid,
          observaciones: (currentCotizacionData.observaciones || '') + ' - Convertido de cotización',
          estado: 'completada',
          metodoPago: currentCotizacionData.metodoPago || 'efectivo',
          tipoVenta: 'cotizacionAprobada',
          paymentData: currentCotizacionData.paymentData || {
            totalAmount: currentCotizacionData.totalCotizacion,
            paymentMethods: [{ method: currentCotizacionData.metodoPago || 'efectivo', amount: currentCotizacionData.totalCotizacion, label: (currentCotizacionData.metodoPago || 'efectivo').toUpperCase(), icon: '💵' }],
            isMixedPayment: false
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        for (const [loteId, loteInfo] of lotesData) {
          if (loteInfo.stockUsado > 0) {
            const nuevoStock = loteInfo.data.stockRestante - loteInfo.stockUsado;
            transaction.update(loteInfo.ref, {
              stockRestante: nuevoStock,
              estado: nuevoStock <= 0 ? 'agotado' : 'activo',
              updatedAt: serverTimestamp()
            });
          }
        }

        for (const { itemData } of itemsData) {
          transaction.set(doc(collection(newVentaRef, 'itemsVenta')), {
            productoId: itemData.productoId,
            nombreProducto: itemData.nombreProducto,
            marca: itemData.marca || '',
            codigoTienda: itemData.codigoTienda || '',
            descripcion: itemData.descripcion || '',
            color: itemData.color || '',
            cantidad: itemData.cantidad,
            precioVentaUnitario: itemData.precioVentaUnitario,
            subtotal: itemData.subtotal,
            loteId: itemData.loteId || null,
            numeroLote: itemData.numeroLote || null,
            precioCompraUnitario: itemData.precioCompraUnitario || 0,
            gananciaUnitaria: itemData.gananciaUnitaria || 0,
            gananciaTotal: itemData.gananciaTotal || 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (itemData.loteId) {
            const loteInfo = lotesData.get(itemData.loteId);
            transaction.set(doc(collection(db, 'movimientosLotes')), {
              ventaId: newVentaRef.id, numeroVenta, cotizacionId,
              productoId: itemData.productoId, nombreProducto: itemData.nombreProducto,
              loteId: itemData.loteId, numeroLote: loteInfo?.data.numeroLote,
              cantidadConsumida: parseFloat(itemData.cantidad),
              precioCompraUnitario: parseFloat(itemData.precioCompraUnitario || 0),
              tipoMovimiento: 'cotizacion-confirmada',
              fechaMovimiento: serverTimestamp(),
              empleadoId: user.email || user.uid,
              createdAt: serverTimestamp()
            });
          }
        }

        for (const [productoId, productoInfo] of productosAActualizar) {
          const newStock = (productoInfo.currentProductoData.stockActual || 0) - productoInfo.stockUsado;
          const lotesDisponibles = Array.from(lotesData.entries())
            .filter(([, li]) => li.data.productoId === productoId && (li.data.stockRestante - li.stockUsado) > 0)
            .sort((a, b) => new Date(a[1].data.fechaIngreso.seconds * 1000) - new Date(b[1].data.fechaIngreso.seconds * 1000));
          const nuevoPrecioCompra = lotesDisponibles.length > 0 ? parseFloat(lotesDisponibles[0][1].data.precioCompraUnitario || 0) : 0;

          transaction.update(productoInfo.productoRef, {
            stockActual: newStock,
            precioCompraDefault: nuevoPrecioCompra,
            updatedAt: serverTimestamp(),
          });
        }

        const paymentData = currentCotizacionData.paymentData;
        if (paymentData?.isMixedPayment) {
          for (const pm of paymentData.paymentMethods) {
            if (pm.amount > 0) {
              transaction.set(doc(collection(db, 'pagos')), {
                ventaId: newVentaRef.id, numeroVenta, cotizacionId,
                metodoPago: pm.method, monto: pm.amount,
                clienteId: currentCotizacionData.clienteId, clienteNombre,
                empleadoId: user.email || user.uid,
                fechaPago: serverTimestamp(), estado: 'completado', tipo: 'venta',
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
              });
            }
          }
        } else {
          transaction.set(doc(collection(db, 'pagos')), {
            ventaId: newVentaRef.id, numeroVenta, cotizacionId,
            metodoPago: currentCotizacionData.metodoPago || 'efectivo',
            monto: currentCotizacionData.totalCotizacion,
            clienteId: currentCotizacionData.clienteId, clienteNombre,
            empleadoId: user.email || user.uid,
            fechaPago: serverTimestamp(), estado: 'completado', tipo: 'venta',
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        }

        transaction.update(cotizacionRef, {
          estado: 'confirmada',
          fechaConfirmacion: serverTimestamp(),
          ventaGeneradaId: newVentaRef.id,
          numeroVentaGenerada: numeroVenta,
          updatedAt: serverTimestamp()
        });
      });

      alert('Cotización confirmada exitosamente.');
    } catch (err) {
      console.error('Error al confirmar cotización:', err);
      setError('Error al confirmar la cotización: ' + err.message);
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelarCotizacion = async (cotizacionId) => {
    if (!window.confirm('¿Cancelar esta cotización?')) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'cotizaciones', cotizacionId), { estado: 'cancelada', updatedAt: serverTimestamp() });
      alert('Cotización cancelada.');
    } catch (err) {
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCotizacion = async (cotizacionId, estadoCotizacion) => {
    let msg = '¿Eliminar esta cotización?';
    if (estadoCotizacion === 'confirmada') msg += '\nADVERTENCIA: Ya fue confirmada. La venta NO se revertirá.';
    if (!window.confirm(msg)) return;
    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const itemsSnap = await getDocs(collection(db, 'cotizaciones', cotizacionId, 'itemsCotizacion'));
        itemsSnap.docs.forEach(itemDoc => transaction.delete(doc(db, 'cotizaciones', cotizacionId, 'itemsCotizacion', itemDoc.id)));
        transaction.delete(doc(db, 'cotizaciones', cotizacionId));
      });
      alert('Cotización eliminada.');
    } catch (err) {
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImprimirCotizacion = async (cotizacion) => {
    try {
      const loadingToast = document.createElement('div');
      loadingToast.innerHTML = `<div class="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50"><div class="flex items-center"><div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Generando PDF...</div></div>`;
      document.body.appendChild(loadingToast);

      let clienteData = null;
      if (cotizacion.clienteId && cotizacion.clienteId !== 'general') {
        try {
          const clienteDoc = await getDoc(doc(db, 'clientes', cotizacion.clienteId));
          if (clienteDoc.exists()) clienteData = clienteDoc.data();
        } catch (e) { console.warn(e); }
      }

      await generarPDFCotizacionCompleta(cotizacion.id, cotizacion, clienteData);
      document.body.removeChild(loadingToast);

      const toast = document.createElement('div');
      toast.innerHTML = `<div class="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">PDF generado exitosamente</div>`;
      document.body.appendChild(toast);
      setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 3000);
    } catch (error) {
      console.error('Error al generar PDF:', error);
    }
  };

  const [selectedCotizaciones, setSelectedCotizaciones] = useState(new Set());

  const handleSelectCotizacion = (cotizacionId) => {
    const newSelected = new Set(selectedCotizaciones);
    newSelected.has(cotizacionId) ? newSelected.delete(cotizacionId) : newSelected.add(cotizacionId);
    setSelectedCotizaciones(newSelected);
  };

  const handleImprimirSeleccionadas = async () => {
    if (selectedCotizaciones.size === 0) { alert('Selecciona al menos una cotización'); return; }
    for (const cotizacionId of selectedCotizaciones) {
      const cot = filteredCotizaciones.find(c => c.id === cotizacionId);
      if (cot) { await handleImprimirCotizacion(cot); await new Promise(r => setTimeout(r, 1000)); }
    }
    setSelectedCotizaciones(new Set());
  };

  if (!user) return null;

  return (
    <Layout title="Mis Cotizaciones">
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-6 bg-white rounded-lg shadow-md flex flex-col">
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-6">
              <span>{error}</span>
            </div>
          )}

          {/* Filtros */}
          <div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50 relative z-20">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
              <div className="relative flex-grow sm:mr-4">
                <input
                  type="text"
                  placeholder="Buscar por número, cliente, estado..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base placeholder-gray-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/cotizaciones/nueva')}
                  className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                  Nueva Cotización
                </button>
                {selectedCotizaciones.size > 0 && (
                  <button
                    onClick={handleImprimirSeleccionadas}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors"
                  >
                    <PrinterIcon className="-ml-1 mr-2 h-4 w-4" />
                    Imprimir ({selectedCotizaciones.size})
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {['all', 'day', 'week', 'month'].map(period => (
                  <button
                    key={period}
                    onClick={() => handleFilterChange(period)}
                    className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${
                      filterPeriod === period ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    {period === 'all' ? 'Todas' : period === 'day' ? 'Hoy' : period === 'week' ? 'Esta Semana' : 'Este Mes'}
                  </button>
                ))}

                <CustomDatePicker
                  selected={dateRange.start}
                  onChange={(date) => {
                    setFilterPeriod('custom');
                    const s = new Date(date); s.setHours(0, 0, 0, 0);
                    setDateRange(prev => ({ ...prev, start: s }));
                  }}
                  placeholder="Fecha inicio"
                />
                <CustomDatePicker
                  selected={dateRange.end}
                  onChange={(date) => {
                    setFilterPeriod('custom');
                    const e = new Date(date); e.setHours(23, 59, 59, 999);
                    setDateRange(prev => ({ ...prev, end: e }));
                  }}
                  placeholder="Fecha fin"
                  minDate={dateRange.start}
                />

                <select
                  value={selectedEstado}
                  onChange={(e) => setSelectedEstado(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded shadow-sm text-sm"
                >
                  <option value="all">Estado</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="confirmada">Confirmada</option>
                  <option value="cancelada">Cancelada</option>
                  <option value="borrador">Borrador</option>
                </select>

                <select
                  value={limitFirestore}
                  onChange={(e) => { setLimitFirestore(Number(e.target.value)); setCurrentPage(1); }}
                  className="px-3 py-1 border border-gray-300 rounded shadow-sm text-sm"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <button
                onClick={clearFilters}
                className="inline-flex items-center px-3 py-1 bg-red-50 text-red-700 rounded text-sm font-medium hover:bg-red-100 border border-red-200"
              >
                <XMarkIcon className="h-4 w-4 mr-1" />
                Limpiar
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredCotizaciones.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-gray-50 rounded-lg p-4">
              <DocumentTextIcon className="h-24 w-24 text-gray-300 mb-4" />
              <p className="text-lg font-medium">No se encontraron cotizaciones.</p>
            </div>
          ) : (
            <>
              {/* Indicador de total */}
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-2">
                  <span className="text-sm text-blue-600 font-medium">Total en período:</span>
                  <span className="text-lg font-bold text-blue-800">{totalCotizacionesPeriodo} cotizaciones</span>
                </div>
                {limitFirestore < totalCotizacionesPeriodo && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
                    <span className="text-sm text-yellow-700">
                      ⚠️ Mostrando {Math.min(limitFirestore, filteredCotizaciones.length)} de {totalCotizacionesPeriodo} — aumenta el límite para ver más
                    </span>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto shadow-lg ring-1 ring-black ring-opacity-5 rounded-lg overflow-y-auto max-h-[60vh] relative z-10">
                <table className="min-w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">
                        <input
                          type="checkbox"
                          checked={selectedCotizaciones.size === currentCotizaciones.length && currentCotizaciones.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedCotizaciones(new Set(currentCotizaciones.map(c => c.id)));
                            else setSelectedCotizaciones(new Set());
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">N° COTIZACIÓN</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">CLIENTE</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">FECHA CREACIÓN</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">TOTAL</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ESTADO</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MÉTODO PAGO</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">REGISTRADO POR</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {currentCotizaciones.map((cotizacion, index) => (
                      <tr key={cotizacion.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          <input
                            type="checkbox"
                            checked={selectedCotizaciones.has(cotizacion.id)}
                            onChange={() => handleSelectCotizacion(cotizacion.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium text-black">{cotizacion.numeroCotizacion || 'N/A'}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black">{cotizacion.clienteNombre}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black">{cotizacion.fechaCreacion}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black font-medium">
                          S/. {parseFloat(cotizacion.totalCotizacion || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          {cotizacion.estado === 'confirmada' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircleIcon className="h-4 w-4 mr-1" /> Confirmada
                            </span>
                          ) : cotizacion.estado === 'cancelada' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <XCircleIcon className="h-4 w-4 mr-1" /> Cancelada
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <DocumentTextIcon className="h-4 w-4 mr-1" /> Pendiente
                            </span>
                          )}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black">{cotizacion.metodoPago || 'N/A'}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black">{cotizacion.empleadoId || 'Desconocido'}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          <div className="flex items-center space-x-1 justify-center">
                            {(cotizacion.estado === 'pendiente' || cotizacion.estado === 'borrador') && (
                              <>
                                <button onClick={() => handleConfirmarCotizacion(cotizacion.id)}
                                  className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition-colors" title="Confirmar">
                                  <CheckCircleIcon className="h-5 w-5" />
                                </button>
                                <button onClick={() => handleCancelarCotizacion(cotizacion.id)}
                                  className="text-orange-600 hover:text-orange-800 p-2 rounded-full hover:bg-orange-50 transition-colors" title="Cancelar">
                                  <XCircleIcon className="h-5 w-5" />
                                </button>
                                <button onClick={() => router.push(`/cotizaciones/${cotizacion.id}`)}
                                  className="text-purple-600 hover:text-purple-800 p-2 rounded-full hover:bg-purple-50 transition-colors" title="Editar">
                                  <PencilIcon className="h-5 w-5" />
                                </button>
                              </>
                            )}
                            <button onClick={() => router.push(`/cotizaciones/${cotizacion.id}`)}
                              className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors" title="Ver Detalles">
                              <EyeIcon className="h-5 w-5" />
                            </button>
                            <button onClick={() => handleImprimirCotizacion(cotizacion)}
                              className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition-colors" title="Imprimir PDF">
                              <PrinterIcon className="h-5 w-5" />
                            </button>
                            <button onClick={() => handleDeleteCotizacion(cotizacion.id, cotizacion.estado)}
                              className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition-colors" title="Eliminar">
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {filteredCotizaciones.length > cotizacionesPerPage && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{indexOfFirstCotizacion + 1}</span> a{' '}
                    <span className="font-medium">{Math.min(indexOfLastCotizacion, filteredCotizaciones.length)}</span> de{' '}
                    <span className="font-medium">{filteredCotizaciones.length}</span> resultados
                  </p>
                  <div className="flex space-x-2">
                    <button onClick={goToPrevPage} disabled={currentPage === 1}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                      <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-700">Página {currentPage} de {totalPages}</span>
                    <button onClick={goToNextPage} disabled={currentPage === totalPages}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                      <ChevronRightIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default CotizacionesIndexPage;