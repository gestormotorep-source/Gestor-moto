// pages/devoluciones/index.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import CustomDatePicker from '../../components/CustomDatePicker';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  where,
  getDocs,
  runTransaction,
  limit,
  Timestamp,
  getCountFromServer
} from 'firebase/firestore';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

const DevolucionesIndexPage = () => {
  const { user } = useAuth();
  const router = useRouter();

  const [devoluciones, setDevoluciones] = useState([]);
  const [filteredDevoluciones, setFilteredDevoluciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalDevolucionesPeriodo, setTotalDevolucionesPeriodo] = useState(0);

  // Estados para filtros
  const [filterPeriod, setFilterPeriod] = useState('day');
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const start = new Date(today); start.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setHours(23, 59, 59, 999);
    return { start, end };
  });
  const [selectedEstado, setSelectedEstado] = useState('all');
  const [selectedMotivo, setSelectedMotivo] = useState('all');
  const [limitFirestore, setLimitFirestore] = useState(20);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const devolucionesPerPage = 20; // FIJO

  // useEffect 1: Carga desde Firestore
  useEffect(() => {
    if (!user) { router.push('/auth'); return; }
    if (filterPeriod === 'custom' && (!dateRange.start || !dateRange.end)) return;

    setLoading(true);
    setError(null);

    let constraints = [];
    const { start, end } = dateRange;

    if (start && end) {
      const startCopy = new Date(start); startCopy.setHours(0, 0, 0, 0);
      const endCopy = new Date(end); endCopy.setHours(23, 59, 59, 999);
      constraints = [
        where('fechaSolicitud', '>=', Timestamp.fromDate(startCopy)),
        where('fechaSolicitud', '<=', Timestamp.fromDate(endCopy)),
        orderBy('fechaSolicitud', 'desc'),
        limit(limitFirestore)
      ];
    } else {
      constraints = [
        orderBy('fechaSolicitud', 'desc'),
        limit(limitFirestore)
      ];
    }

    if (selectedEstado !== 'all') {
      constraints = [where('estado', '==', selectedEstado), ...constraints];
    }

    const q = query(collection(db, 'devoluciones'), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // ✅ Sin getDoc por cada devolución - usa campos guardados directamente
      const devolucionesList = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          fechaSolicitud: data.fechaSolicitud?.toDate ? data.fechaSolicitud.toDate() : new Date(),
          fechaSolicitudFormatted: data.fechaSolicitud?.toDate
            ? data.fechaSolicitud.toDate().toLocaleDateString('es-ES')
            : 'N/A',
          fechaProcesamientoFormatted: data.fechaProcesamiento?.toDate
            ? data.fechaProcesamiento.toDate().toLocaleDateString('es-ES')
            : null,
          // Usar campos guardados directamente en el documento
          numeroVentaOriginal: data.numeroVenta || data.numeroVentaOriginal || 'N/A',
          clienteNombre: data.clienteNombre || 'N/A',
        };
      });

      setDevoluciones(devolucionesList);
      setLoading(false);
    }, (err) => {
      setError("Error al cargar devoluciones: " + err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, router, dateRange, selectedEstado, limitFirestore, filterPeriod]);

  // useEffect 2: Conteo total
  useEffect(() => {
    if (!user) return;
    if (filterPeriod === 'custom' && (!dateRange.start || !dateRange.end)) return;

    const contarDevoluciones = async () => {
      try {
        let constraints = [];
        const { start, end } = dateRange;

        if (start && end) {
          const startCopy = new Date(start); startCopy.setHours(0, 0, 0, 0);
          const endCopy = new Date(end); endCopy.setHours(23, 59, 59, 999);
          constraints = [
            where('fechaSolicitud', '>=', Timestamp.fromDate(startCopy)),
            where('fechaSolicitud', '<=', Timestamp.fromDate(endCopy)),
          ];
        }

        if (selectedEstado !== 'all') {
          constraints.push(where('estado', '==', selectedEstado));
        }

        const q = query(collection(db, 'devoluciones'), ...constraints);
        const snapshot = await getCountFromServer(q);
        setTotalDevolucionesPeriodo(snapshot.data().count);
      } catch (err) {
        console.error('Error al contar devoluciones:', err);
      }
    };

    contarDevoluciones();
  }, [user, dateRange, selectedEstado, filterPeriod]);

  // useEffect 3: Filtros locales + búsqueda Firestore
  useEffect(() => {
    let filtered = [...devoluciones];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(dev =>
        dev.numeroDevolucion?.toLowerCase().includes(lower) ||
        dev.numeroVentaOriginal?.toLowerCase().includes(lower) ||
        dev.clienteNombre?.toLowerCase().includes(lower) ||
        dev.motivo?.toLowerCase().includes(lower)
      );

      if (filtered.length === 0 && searchTerm.length >= 3) {
        const buscarEnFirestore = async () => {
          try {
            const { getDocs: getDocsFS } = await import('firebase/firestore');
            const termUpper = searchTerm.toUpperCase();
            const termCap = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();

            const qNumero = query(
              collection(db, 'devoluciones'),
              where('numeroDevolucion', '==', termUpper),
              limit(5)
            );

            const qClienteUpper = query(
              collection(db, 'devoluciones'),
              where('clienteNombre', '>=', termUpper),
              where('clienteNombre', '<=', termUpper + '\uf8ff'),
              orderBy('clienteNombre', 'asc'),
              limit(20)
            );

            const qClienteCap = query(
              collection(db, 'devoluciones'),
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
                  fechaSolicitud: data.fechaSolicitud?.toDate ? data.fechaSolicitud.toDate() : new Date(),
                  fechaSolicitudFormatted: data.fechaSolicitud?.toDate
                    ? data.fechaSolicitud.toDate().toLocaleDateString('es-ES') : 'N/A',
                  numeroVentaOriginal: data.numeroVenta || data.numeroVentaOriginal || 'N/A',
                  clienteNombre: data.clienteNombre || 'N/A',
                });
              }
            });

            if (resultados.length > 0) {
              setFilteredDevoluciones(resultados);
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

    if (selectedMotivo !== 'all') {
      filtered = filtered.filter(dev => dev.motivo === selectedMotivo);
    }

    setFilteredDevoluciones(filtered);
    setCurrentPage(1);
  }, [searchTerm, devoluciones, selectedMotivo]);

  // Paginación
  const totalPages = Math.ceil(filteredDevoluciones.length / devolucionesPerPage);
  const indexOfLastDevolucion = currentPage * devolucionesPerPage;
  const indexOfFirstDevolucion = indexOfLastDevolucion - devolucionesPerPage;
  const currentDevoluciones = filteredDevoluciones.slice(indexOfFirstDevolucion, indexOfLastDevolucion);

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
    setSelectedMotivo('all');
    setSearchTerm('');
    setLimitFirestore(20);
    setCurrentPage(1);
  };

  // Aprobar devolución (sin cambios en lógica)
  const handleAprobarDevolucion = async (devolucionId) => {
    if (!window.confirm('¿Aprobar esta devolución? Cada producto regresará a su lote original.')) return;

    try {
      await runTransaction(db, async (transaction) => {
        const devolucionRef = doc(db, 'devoluciones', devolucionId);
        const devolucionSnap = await transaction.get(devolucionRef);
        if (!devolucionSnap.exists()) throw new Error('Devolución no encontrada');
        const devolucionData = devolucionSnap.data();
        if (devolucionData.estado !== 'solicitada') throw new Error('Solo se pueden aprobar devoluciones en estado "solicitada"');

        const itemsSnapshot = await getDocs(query(
          collection(db, 'devoluciones', devolucionId, 'itemsDevolucion'),
          orderBy('createdAt', 'asc')
        ));
        if (itemsSnapshot.empty) throw new Error('No se encontraron items en esta devolución');

        const itemsData = itemsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const ventaId = devolucionData.ventaId;

        const itemsVentaSnapshot = await getDocs(query(
          collection(db, 'ventas', ventaId, 'itemsVenta'),
          orderBy('createdAt', 'asc')
        ));
        const itemsVentaData = itemsVentaSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        const itemsConLoteOriginal = [];
        for (const itemDevolucion of itemsData) {
          const itemVentaCorrespondiente = itemsVentaData.find(iv =>
            iv.productoId === itemDevolucion.productoId &&
            iv.nombreProducto === itemDevolucion.nombreProducto
          );
          if (!itemVentaCorrespondiente) throw new Error(`No se encontró item original para: ${itemDevolucion.nombreProducto}`);
          if (!itemVentaCorrespondiente.loteId) throw new Error(`El item ${itemDevolucion.nombreProducto} no tiene lote original`);

          const loteOriginalRef = doc(db, 'lotes', itemVentaCorrespondiente.loteId);
          const loteOriginalSnap = await transaction.get(loteOriginalRef);
          if (!loteOriginalSnap.exists()) throw new Error(`Lote original ${itemVentaCorrespondiente.loteId} no encontrado`);

          const loteOriginalData = loteOriginalSnap.data();
          const stockOriginal = parseInt(loteOriginalData.cantidad || 0);
          const stockActual = parseInt(loteOriginalData.stockRestante || 0);
          const cantidadADevolver = parseFloat(itemDevolucion.cantidadADevolver || 0);
          const espacioDisponible = stockOriginal - stockActual;

          if (espacioDisponible < cantidadADevolver) {
            throw new Error(`Sin espacio en lote ${loteOriginalData.numeroLote}. Disponible: ${espacioDisponible}, Solicitado: ${cantidadADevolver}`);
          }

          itemsConLoteOriginal.push({
            itemDevolucion, itemVentaOriginal: itemVentaCorrespondiente,
            loteOriginal: { id: itemVentaCorrespondiente.loteId, data: loteOriginalData }
          });
        }

        const productosData = {};
        for (const item of itemsConLoteOriginal) {
          if (!productosData[item.itemDevolucion.productoId]) {
            const productRef = doc(db, 'productos', item.itemDevolucion.productoId);
            const productSnap = await transaction.get(productRef);
            productosData[item.itemDevolucion.productoId] = { ref: productRef, data: productSnap.exists() ? productSnap.data() : null };
          }
        }

        const todosLosMovimientos = [];
        for (const item of itemsConLoteOriginal) {
          const cantidadADevolver = parseFloat(item.itemDevolucion.cantidadADevolver || 0);
          const loteData = item.loteOriginal.data;
          const stockActualLote = parseInt(loteData.stockRestante || 0);
          const nuevoStockLote = stockActualLote + cantidadADevolver;

          transaction.update(doc(db, 'lotes', item.loteOriginal.id), {
            stockRestante: nuevoStockLote,
            estado: nuevoStockLote > 0 ? 'activo' : 'agotado',
            updatedAt: serverTimestamp()
          });

          const productInfo = productosData[item.itemDevolucion.productoId];
          if (productInfo.data) {
            transaction.update(productInfo.ref, {
              stockActual: (productInfo.data.stockActual || 0) + cantidadADevolver,
              updatedAt: serverTimestamp()
            });
          }

          todosLosMovimientos.push({
            productoId: item.itemDevolucion.productoId,
            nombreProducto: item.itemDevolucion.nombreProducto,
            loteId: item.loteOriginal.id,
            numeroLote: loteData.numeroLote,
            cantidadDevuelta: cantidadADevolver,
            stockAnterior: stockActualLote,
            stockNuevo: nuevoStockLote,
            precioCompraUnitario: parseFloat(loteData.precioCompraUnitario || 0),
            itemVentaOriginal: item.itemVentaOriginal,
            gananciaDevolucion: item.itemDevolucion.gananciaDevolucion || 0
          });
        }

        transaction.update(devolucionRef, {
          estado: 'aprobada',
          fechaProcesamiento: serverTimestamp(),
          procesadoPor: user.email || user.uid,
          updatedAt: serverTimestamp()
        });

        for (const mov of todosLosMovimientos) {
          transaction.set(doc(collection(db, 'movimientosLotes')), {
            devolucionId,
            numeroDevolucion: devolucionData.numeroDevolucion,
            ventaOriginalId: devolucionData.ventaId,
            numeroVentaOriginal: devolucionData.numeroVenta,
            productoId: mov.productoId,
            nombreProducto: mov.nombreProducto,
            loteId: mov.loteId,
            numeroLote: mov.numeroLote,
            cantidadDevuelta: mov.cantidadDevuelta,
            stockAnteriorLote: mov.stockAnterior,
            stockNuevoLote: mov.stockNuevo,
            precioCompraUnitario: mov.precioCompraUnitario,
            itemVentaOriginalId: mov.itemVentaOriginal.id,
            cantidadVendidaOriginal: mov.itemVentaOriginal.cantidad,
            precioVentaUnitario: mov.itemVentaOriginal.precioVentaUnitario,
            gananciaDevolucion: mov.gananciaDevolucion,
            tipoMovimiento: 'devolucion-aprobada-lote-original',
            esLoteOriginal: true,
            fechaMovimiento: serverTimestamp(),
            empleadoId: user.email || user.uid,
            createdAt: serverTimestamp()
          });
        }
      });

      alert('✅ Devolución aprobada. Productos devueltos a sus lotes originales.');
    } catch (err) {
      console.error('Error al aprobar devolución:', err);
      setError('Error: ' + err.message);
      alert('Error: ' + err.message);
    }
  };

  const handleRechazarDevolucion = async (id) => {
    const motivo = window.prompt('Motivo del rechazo (opcional):');
    if (!window.confirm('¿Rechazar esta devolución?')) return;
    try {
      await updateDoc(doc(db, 'devoluciones', id), {
        estado: 'rechazada',
        motivoRechazo: motivo || null,
        fechaProcesamiento: serverTimestamp(),
        procesadoPor: user.email || user.uid,
        updatedAt: serverTimestamp(),
      });
      alert('Devolución rechazada.');
    } catch (err) {
      setError("Error: " + err.message);
    }
  };

  const getEstadoBadge = (estado) => {
    switch (estado) {
      case 'solicitada': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><ClockIcon className="h-4 w-4 mr-1" /> Solicitada</span>;
      case 'en_revision': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><ExclamationTriangleIcon className="h-4 w-4 mr-1" /> En Revisión</span>;
      case 'aprobada': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircleIcon className="h-4 w-4 mr-1" /> Aprobada</span>;
      case 'rechazada': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircleIcon className="h-4 w-4 mr-1" /> Rechazada</span>;
      default: return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{estado}</span>;
    }
  };

  const getMotivoBadge = (motivo) => {
    const labels = { no_quiere: 'No le gustó', defectuoso: 'Defectuoso', empaque_abierto: 'Empaque abierto', descripcion_incorrecta: 'Desc. incorrecta', otro: 'Otro' };
    const colors = { no_quiere: 'bg-purple-100 text-purple-800', defectuoso: 'bg-red-100 text-red-800', empaque_abierto: 'bg-orange-100 text-orange-800', descripcion_incorrecta: 'bg-blue-100 text-blue-800', otro: 'bg-gray-100 text-gray-800' };
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[motivo] || 'bg-gray-100 text-gray-800'}`}>{labels[motivo] || motivo}</span>;
  };

  if (!user) return null;

  return (
    <Layout title="Devoluciones">
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
                  placeholder="Buscar por número, cliente, venta..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 text-base placeholder-gray-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                </div>
              </div>
              <button
                onClick={() => router.push('/devoluciones/nueva')}
                className="inline-flex items-center px-6 py-2 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-orange-600 hover:bg-orange-700 transition-colors"
              >
                <PlusIcon className="-ml-1 mr-3 h-5 w-5" />
                Nueva Devolución
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {['all', 'day', 'week', 'month'].map(period => (
                  <button key={period} onClick={() => handleFilterChange(period)}
                    className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${filterPeriod === period ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'}`}>
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

                <select value={selectedEstado} onChange={(e) => setSelectedEstado(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded shadow-sm text-sm">
                  <option value="all">Estado</option>
                  <option value="solicitada">Solicitada</option>
                  <option value="en_revision">En Revisión</option>
                  <option value="aprobada">Aprobada</option>
                  <option value="rechazada">Rechazada</option>
                </select>

                <select value={selectedMotivo} onChange={(e) => setSelectedMotivo(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded shadow-sm text-sm">
                  <option value="all">Motivo</option>
                  <option value="no_quiere">No le gustó</option>
                  <option value="defectuoso">Defectuoso</option>
                  <option value="empaque_abierto">Empaque abierto</option>
                  <option value="descripcion_incorrecta">Desc. incorrecta</option>
                  <option value="otro">Otro</option>
                </select>

                <select value={limitFirestore} onChange={(e) => { setLimitFirestore(Number(e.target.value)); setCurrentPage(1); }}
                  className="px-3 py-1 border border-gray-300 rounded shadow-sm text-sm">
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <button onClick={clearFilters}
                className="inline-flex items-center px-3 py-1 bg-red-50 text-red-700 rounded text-sm font-medium hover:bg-red-100 border border-red-200">
                <XMarkIcon className="h-4 w-4 mr-1" />
                Limpiar
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
            </div>
          ) : filteredDevoluciones.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-lg">
              No hay devoluciones que coincidan con los filtros.
            </div>
          ) : (
            <>
              {/* Indicador de total */}
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-2">
                  <span className="text-sm text-blue-600 font-medium">Total en período:</span>
                  <span className="text-lg font-bold text-blue-800">{totalDevolucionesPeriodo} devoluciones</span>
                </div>
              </div>

              <div className="overflow-x-auto shadow-lg ring-1 ring-black ring-opacity-5 rounded-lg overflow-y-auto max-h-[60vh] relative z-10">
                <table className="min-w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">N° DEVOLUCIÓN</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">N° VENTA ORIGINAL</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">CLIENTE</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">FECHA SOLICITUD</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MONTO A DEVOLVER</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MOTIVO</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ESTADO</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">PROCESADO POR</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {currentDevoluciones.map((devolucion, index) => (
                      <tr key={devolucion.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900">{devolucion.numeroDevolucion || 'N/A'}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black">{devolucion.numeroVentaOriginal}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black">{devolucion.clienteNombre}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black">{devolucion.fechaSolicitudFormatted}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black font-medium">S/. {parseFloat(devolucion.montoADevolver || 0).toFixed(2)}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">{getMotivoBadge(devolucion.motivo)}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">{getEstadoBadge(devolucion.estado)}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black">{devolucion.procesadoPor || devolucion.solicitadoPor || 'N/A'}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          <div className="flex items-center space-x-2 justify-center">
                            <button onClick={() => router.push(`/devoluciones/${devolucion.id}`)}
                              className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors" title="Ver Detalles">
                              <EyeIcon className="h-5 w-5" />
                            </button>
                            {devolucion.estado === 'solicitada' && (
                              <>
                                <button onClick={() => handleAprobarDevolucion(devolucion.id)}
                                  className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition-colors" title="Aprobar">
                                  <CheckCircleIcon className="h-5 w-5" />
                                </button>
                                <button onClick={() => handleRechazarDevolucion(devolucion.id)}
                                  className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition-colors" title="Rechazar">
                                  <XCircleIcon className="h-5 w-5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredDevoluciones.length > devolucionesPerPage && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{indexOfFirstDevolucion + 1}</span> a{' '}
                    <span className="font-medium">{Math.min(indexOfLastDevolucion, filteredDevoluciones.length)}</span> de{' '}
                    <span className="font-medium">{filteredDevoluciones.length}</span> resultados
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

export default DevolucionesIndexPage;