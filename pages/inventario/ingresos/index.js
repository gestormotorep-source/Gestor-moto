// pages/inventario/ingresos/index.js
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import Layout from '../../../components/Layout';
import { db } from '../../../lib/firebase';
import { useAppCache } from '../../../contexts/AppCacheContext';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  doc, 
  deleteDoc, 
  runTransaction,
  where,
  serverTimestamp,
  onSnapshot,
  limit,
  Timestamp
} from 'firebase/firestore';
import { PlusIcon,
        ArrowDownTrayIcon, 
        TrashIcon, 
        EyeIcon, 
        CheckCircleIcon, 
        ExclamationCircleIcon, 
        ChevronLeftIcon, 
        ChevronRightIcon, 
        XMarkIcon, 
        PencilIcon,
        CalendarIcon } 
from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';
import { Calendar } from '../../../components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const IngresosPage = () => {
  const router = useRouter();
  const { user } = useAuth();

  // ── Cache ──────────────────────────────────────────────────────────────────
  const { getCache, setCache, invalidateCache } = useAppCache();
  const cached = getCache('ingresos');
  const isFirstRender = useRef(true);
  const filtersChanged = useRef(false);

  // ── Estados principales ────────────────────────────────────────────────────
  const [ingresos, setIngresos] = useState(cached?.data || []);
  const [filteredIngresos, setFilteredIngresos] = useState(
    cached?.filtros?.filteredIngresos || cached?.data || []
  );
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState(cached?.filtros?.searchTerm || '');
  const [totalIngresosPeriodo, setTotalIngresosPeriodo] = useState(
    cached?.filtros?.totalIngresosPeriodo || 0
  );

  // ── Filtros de fecha ───────────────────────────────────────────────────────
  const [filterPeriod, setFilterPeriod] = useState(cached?.filtros?.filterPeriod || 'day');
  const [dateRange, setDateRange] = useState(() => {
    if (cached?.filtros?.dateRange) {
      const { start, end } = cached.filtros.dateRange;
      return {
        start: start ? new Date(start) : null,
        end:   end   ? new Date(end)   : null,
      };
    }
    const today = new Date();
    const start = new Date(today); start.setHours(0,  0,  0,   0);
    const end   = new Date(today); end.setHours(23, 59, 59, 999);
    return { start, end };
  });

  // ── Paginación ─────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(cached?.filtros?.currentPage || 1);
  const [limitFirestore, setLimitFirestore] = useState(cached?.filtros?.limitFirestore || 20);
  const ingresosPerPage = 20; // fijo, no es estado

  // ── useEffect 1: Cargar ingresos desde Firestore ───────────────────────────
  useEffect(() => {
    if (!user) {
      router.push('/auth');
      return;
    }

    // ── GUARD DE CACHE ──────────────────────────────────────
    const hayCacheValido = getCache('ingresos') && !filtersChanged.current;

    filtersChanged.current = false;

    // Si hay caché, no mostramos spinner pero igual nos suscribimos al onSnapshot
    if (!hayCacheValido) {
      setLoading(true);
    }
    setError(null);

    if (filterPeriod === 'custom' && (!dateRange.start || !dateRange.end)) return;

    setLoading(true);
    setError(null);

    let constraints = [];
    const { start, end } = dateRange;

    if (start && end) {
      const startCopy = new Date(start); startCopy.setHours(0,  0,  0,   0);
      const endCopy   = new Date(end);   endCopy.setHours(23, 59, 59, 999);

      constraints = [
        where('fechaIngreso', '>=', Timestamp.fromDate(startCopy)),
        where('fechaIngreso', '<=', Timestamp.fromDate(endCopy)),
        orderBy('fechaIngreso', 'desc'),
        limit(limitFirestore),
      ];
    } else {
      constraints = [
        orderBy('fechaIngreso', 'desc'),
        limit(limitFirestore),
      ];
    }

    const q = query(collection(db, 'ingresos'), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedIngresos = snapshot.docs.map(docIngreso => {
        const data = docIngreso.data();
        return {
          id: docIngreso.id,
          ...data,
          fechaIngresoOriginal:  data.fechaIngreso,
          fechaIngresoFormatted: data.fechaIngreso?.toDate?.().toLocaleDateString('es-ES', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          }) || 'N/A',
          fechaRecepcion:      data.fechaRecepcion || data.fechaIngreso,
          costoTotalIngreso:   data.costoTotalIngreso   || 0,
          cantidadLotes:       data.cantidadLotes        || 0,
          totalStockIngresado: data.totalStockIngresado  || 0,
          estado:              data.estado               || 'pendiente',
        };
      });

      setIngresos(loadedIngresos);
      setLoading(false);
    }, (err) => {
      setError('Error al cargar ingresos: ' + err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, router, dateRange, limitFirestore, filterPeriod]);

  // ── useEffect 2: Conteo total del período ─────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (filterPeriod === 'custom' && (!dateRange.start || !dateRange.end)) return;

    const contarIngresos = async () => {
      try {
        const { getCountFromServer } = await import('firebase/firestore');

        let constraints = [];
        const { start, end } = dateRange;

        if (start && end) {
          const startCopy = new Date(start); startCopy.setHours(0,  0,  0,   0);
          const endCopy   = new Date(end);   endCopy.setHours(23, 59, 59, 999);
          constraints = [
            where('fechaIngreso', '>=', Timestamp.fromDate(startCopy)),
            where('fechaIngreso', '<=', Timestamp.fromDate(endCopy)),
          ];
        }

        const q = query(collection(db, 'ingresos'), ...constraints);
        const snapshot = await getCountFromServer(q);
        setTotalIngresosPeriodo(snapshot.data().count);
      } catch (err) {
        console.error('Error al contar ingresos:', err);
      }
    };

    contarIngresos();
  }, [user, dateRange, filterPeriod]);

  // ── useEffect 3: Filtros locales + búsqueda en Firestore ──────────────────
  useEffect(() => {
    // Primer render: si el cache ya tiene filteredIngresos guardados, restaurar
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (getCache('ingresos')) {
        const cachedTerm     = cached?.filtros?.searchTerm;
        const cachedFiltered = cached?.filtros?.filteredIngresos;

        if (cachedTerm && cachedTerm === searchTerm && cachedFiltered?.length > 0) {
          setFilteredIngresos(cachedFiltered);
          return;
        }
        if (!searchTerm.trim()) {
          return; // sin búsqueda, mostrar lo que ya está en estado
        }
      }
    }

    if (!ingresos.length) return;

    if (!searchTerm.trim()) {
      setFilteredIngresos(ingresos);
      setCurrentPage(1);
      return;
    }

    const lower = searchTerm.toLowerCase();

    let filtered = [...ingresos].filter(ingreso =>
      ingreso.numeroBoleta?.toLowerCase().includes(lower)  ||
      ingreso.proveedorNombre?.toLowerCase().includes(lower) ||
      ingreso.observaciones?.toLowerCase().includes(lower)  ||
      ingreso.estado?.toLowerCase().includes(lower)
      ).sort((a, b) => {                                          // ← AGREGAR
      const dateA = a.fechaIngresoOriginal?.toDate?.() || new Date(0);
      const dateB = b.fechaIngresoOriginal?.toDate?.() || new Date(0);
      return dateB - dateA;
    });

    // Si no encontró nada localmente → buscar en Firestore
    if (filtered.length === 0 && searchTerm.length >= 3) {
      const buscarEnFirestore = async () => {
        try {
          const { getDocs: getDocsFS } = await import('firebase/firestore');
          const termUpper      = searchTerm.toUpperCase();
          const termCapitalized = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();

          const qBoleta = query(
            collection(db, 'ingresos'),
            where('numeroBoleta', '==', termUpper),
            limit(5)
          );
          const qProveedorUpper = query(
            collection(db, 'ingresos'),
            where('proveedorNombre', '>=', termUpper),
            where('proveedorNombre', '<=', termUpper + '\uf8ff'),
            orderBy('proveedorNombre', 'asc'),
            limit(20)
          );
          const qProveedorCap = query(
            collection(db, 'ingresos'),
            where('proveedorNombre', '>=', termCapitalized),
            where('proveedorNombre', '<=', termCapitalized + '\uf8ff'),
            orderBy('proveedorNombre', 'asc'),
            limit(20)
          );

          const [snapBoleta, snapProvUpper, snapProvCap] = await Promise.all([
            getDocsFS(qBoleta),
            getDocsFS(qProveedorUpper),
            getDocsFS(qProveedorCap),
          ]);

          const idsVistos  = new Set();
          const resultados = [];

          for (const docSnap of [...snapBoleta.docs, ...snapProvUpper.docs, ...snapProvCap.docs]) {
            if (!idsVistos.has(docSnap.id)) {
              idsVistos.add(docSnap.id);
              const data = docSnap.data();
              resultados.push({
                id: docSnap.id,
                ...data,
                fechaIngresoOriginal:  data.fechaIngreso,
                fechaIngresoFormatted: data.fechaIngreso?.toDate?.().toLocaleDateString('es-ES', {
                  year: 'numeric', month: 'long', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                }) || 'N/A',
                fechaRecepcion:      data.fechaRecepcion || data.fechaIngreso,
                costoTotalIngreso:   data.costoTotalIngreso   || 0,
                cantidadLotes:       data.cantidadLotes        || 0,
                totalStockIngresado: data.totalStockIngresado  || 0,
                estado:              data.estado               || 'pendiente',
              });
            }
          }

          resultados.sort((a, b) => {
            const dateA = a.fechaIngresoOriginal?.toDate?.() || new Date(0);
            const dateB = b.fechaIngresoOriginal?.toDate?.() || new Date(0);
            return dateB - dateA;
          });

          if (resultados.length > 0) {
            setFilteredIngresos(resultados);
            setCurrentPage(1);
          }
        } catch (err) {
          console.error('Error en búsqueda directa:', err);
        }
      };

      buscarEnFirestore();
      return;
    }

    setFilteredIngresos(filtered);
    setCurrentPage(1);
  }, [searchTerm, ingresos]);

  // ── useEffect 4: Guardar en cache cuando los datos cambian ─────────────────
  useEffect(() => {
    if (ingresos.length > 0) {
      setCache('ingresos', ingresos, {
        searchTerm,
        filteredIngresos,
        filterPeriod,
        dateRange,
        limitFirestore,
        currentPage,
        totalIngresosPeriodo,
      });
    }
  }, [ingresos, filteredIngresos, searchTerm, filterPeriod, dateRange,
      limitFirestore, currentPage, totalIngresosPeriodo]);

  // ── Cambio de período ──────────────────────────────────────────────────────
  const handleFilterChange = (period) => {
    invalidateCache('ingresos');
    filtersChanged.current = true;
    setFilterPeriod(period);
    setFilteredIngresos([]);
    setIngresos([]);
    setCurrentPage(1);

    const today = new Date();

    switch (period) {
      case 'day': {
        const start = new Date(today); start.setHours(0,  0,  0,   0);
        const end   = new Date(today); end.setHours(23, 59, 59, 999);
        setDateRange({ start, end });
        break;
      }
      case 'week': {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        start.setHours(0, 0, 0, 0);
        const end = new Date(today); end.setHours(23, 59, 59, 999);
        setDateRange({ start, end });
        break;
      }
      case 'month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(today); end.setHours(23, 59, 59, 999);
        setDateRange({ start, end });
        break;
      }
      case 'all':
      default:
        setDateRange({ start: null, end: null });
        break;
    }
  };

  // ── Limpiar filtros ────────────────────────────────────────────────────────
  const clearFilters = () => {
    invalidateCache('ingresos');
    filtersChanged.current = true;

    const today = new Date();
    const start = new Date(today); start.setHours(0,  0,  0,   0);
    const end   = new Date(today); end.setHours(23, 59, 59, 999);

    setFilterPeriod('day');
    setDateRange({ start, end });
    setSearchTerm('');
    setLimitFirestore(20);
    setCurrentPage(1);
    setFilteredIngresos([]);
    setIngresos([]);
  };

  // ── Paginación ─────────────────────────────────────────────────────────────
  const totalPages          = Math.ceil(filteredIngresos.length / ingresosPerPage);
  const indexOfLastIngreso  = currentPage * ingresosPerPage;
  const indexOfFirstIngreso = indexOfLastIngreso - ingresosPerPage;
  const currentIngresos     = filteredIngresos.slice(indexOfFirstIngreso, indexOfLastIngreso);

  const goToNextPage = () => { if (currentPage < totalPages) setCurrentPage(p => p + 1); };
  const goToPrevPage = () => { if (currentPage > 1)          setCurrentPage(p => p - 1); };

  // ── Confirmar recepción ────────────────────────────────────────────────────
  const handleConfirmarRecepcion = async (ingresoId) => {
    if (!window.confirm('¿Confirmar recepción? Esto agregará los productos al stock.')) return;

    setLoading(true);
    setError(null);
    try {
      await runTransaction(db, async (transaction) => {
        const ingresoRef  = doc(db, 'ingresos', ingresoId);
        const ingresoSnap = await transaction.get(ingresoRef);
        if (!ingresoSnap.exists())              throw new Error('Boleta no encontrada.');
        if (ingresoSnap.data().estado === 'recibido') throw new Error('Ya fue confirmada.');

        const lotesIngresoRef   = collection(db, 'ingresos', ingresoId, 'lotes');
        const lotesIngresoSnap  = await getDocs(lotesIngresoRef);
        const lotesPrincipalesSnap = await getDocs(
          query(collection(db, 'lotes'), where('ingresoId', '==', ingresoId))
        );

        if (lotesIngresoSnap.empty && lotesPrincipalesSnap.empty)
          throw new Error('No se encontraron lotes.');

        const productoRefsAndData = [];

        for (const loteDoc of lotesIngresoSnap.docs) {
          const loteData    = loteDoc.data();
          const productoRef = doc(db, 'productos', loteData.productoId);
          const productoSnap = await transaction.get(productoRef);
          if (productoSnap.exists()) {
            productoRefsAndData.push({
              loteDocRef: loteDoc.ref, loteData,
              productoRef, currentProductoData: productoSnap.data(),
            });
          }
        }

        for (const loteDoc of lotesPrincipalesSnap.docs) {
          const loteData = loteDoc.data();
          const yaExiste = productoRefsAndData.some(i =>
            i.loteData.productoId  === loteData.productoId &&
            i.loteData.numeroLote  === loteData.numeroLote
          );
          if (!yaExiste) {
            const productoRef  = doc(db, 'productos', loteData.productoId);
            const productoSnap = await transaction.get(productoRef);
            if (productoSnap.exists()) {
              productoRefsAndData.push({
                loteDocRef: loteDoc.ref, loteData,
                productoRef, currentProductoData: productoSnap.data(),
              });
            }
          }
        }

        const cantidadLotes      = productoRefsAndData.length;
        const totalStockIngresado = productoRefsAndData.reduce(
          (sum, { loteData }) => sum + (loteData.cantidad || 0), 0
        );

        for (const { loteDocRef, loteData, productoRef, currentProductoData } of productoRefsAndData) {
          const newStock = (currentProductoData.stockActual || 0) + (loteData.cantidad || 0);
          transaction.update(productoRef,  { stockActual: newStock, updatedAt: serverTimestamp() });
          transaction.update(loteDocRef,   { stockRestante: loteData.cantidad, estado: 'activo', updatedAt: serverTimestamp() });
        }

        transaction.update(ingresoRef, {
          estado: 'recibido',
          fechaConfirmacion: serverTimestamp(),
          cantidadLotes,
          totalStockIngresado,
          updatedAt: serverTimestamp(),
        });
      });

      alert('Recepción confirmada y stock actualizado.');
      // Invalidar cache para que el próximo fetch traiga datos frescos
      invalidateCache('ingresos');
      filtersChanged.current = true;
      setIngresos(prev => prev.map(ing =>
        ing.id !== ingresoId ? ing : { ...ing, estado: 'recibido' }
      ));
    } catch (err) {
      console.error('Error al confirmar recepción:', err);
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Eliminar ingreso ───────────────────────────────────────────────────────
  const handleDeleteIngreso = async (ingresoId, estadoIngreso) => {
    let msg = '¿Eliminar esta boleta de ingreso?';
    if (estadoIngreso === 'recibido') msg += '\nADVERTENCIA: El stock NO se revertirá automáticamente.';
    if (!window.confirm(msg)) return;

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const ingresoRef = doc(db, 'ingresos', ingresoId);
        const lotesRef   = collection(db, 'ingresos', ingresoId, 'lotes');
        const lotesSnap  = await getDocs(lotesRef);
        lotesSnap.docs.forEach(loteDoc =>
          transaction.delete(doc(db, 'ingresos', ingresoId, 'lotes', loteDoc.id))
        );
        transaction.delete(ingresoRef);
      });

      alert('Boleta eliminada.');
      invalidateCache('ingresos');
      filtersChanged.current = true;
      setIngresos(prev => prev.filter(ing => ing.id !== ingresoId));
    } catch (err) {
      setError('Error al eliminar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── DatePickerPopover ──────────────────────────────────────────────────────
  const DatePickerPopover = ({ selected, onChange, placeholder, minDate }) => {
    const [open,  setOpen]  = useState(false);
    const [month, setMonth] = useState(selected || new Date());
    const ref = useRef(null);

    useEffect(() => {
      const handler = (e) => {
        if (ref.current && !ref.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);

    const prevMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    const nextMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));

    const meses      = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const currentYear = new Date().getFullYear();
    const years       = Array.from({ length: 6 }, (_, i) => currentYear - 1 + i);

    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(prev => !prev)}
          className="flex items-center gap-2 px-3 py-1 border border-gray-300 rounded bg-white text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
        >
          <CalendarIcon className="h-4 w-4 text-gray-400" />
          {selected
            ? format(selected, 'dd/MM/yyyy', { locale: es })
            : <span className="text-gray-400">{placeholder}</span>
          }
        </button>

        {open && (
          <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl">
            <div className="flex items-center justify-between px-3 pt-3 pb-1 gap-2">
              <button onClick={prevMonth}
                className="flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700 shrink-0">
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1">
                <select value={month.getMonth()}
                  onChange={(e) => setMonth(m => new Date(m.getFullYear(), parseInt(e.target.value), 1))}
                  className="text-sm font-semibold text-gray-800 bg-transparent border-none outline-none cursor-pointer rounded px-1 py-0.5">
                  {meses.map((mes, i) => <option key={i} value={i}>{mes}</option>)}
                </select>
                <select value={month.getFullYear()}
                  onChange={(e) => setMonth(m => new Date(parseInt(e.target.value), m.getMonth(), 1))}
                  className="text-sm font-semibold text-gray-800 bg-transparent border-none outline-none cursor-pointer rounded px-1 py-0.5">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button onClick={nextMonth}
                className="flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700 shrink-0">
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <Calendar
              mode="single"
              selected={selected}
              month={month}
              onMonthChange={setMonth}
              onSelect={(date) => { if (date) { onChange(date); setOpen(false); } }}
              disabled={minDate ? { before: minDate } : undefined}
              captionLayout="label"
              classNames={{ month_caption: 'hidden', nav: 'hidden' }}
            />
          </div>
        )}
      </div>
    );
  };

  if (!user) return null;

  return (
    <Layout title="Registro de Ingresos de Mercadería">
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-6 bg-white rounded-lg shadow-md flex flex-col">

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-6">
              <span>{error}</span>
            </div>
          )}

          {/* ── Filtros ───────────────────────────────────────────────────── */}
          <div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50 relative z-20">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
              <div className="relative flex-grow sm:mr-4">
                <input
                  type="text"
                  placeholder="Buscar por boleta, proveedor, observaciones..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base placeholder-gray-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>

              <button
                onClick={() => router.push('/inventario/ingresos/nuevo')}
                className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                Registrar Nueva Boleta
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {/* Botones de período */}
                {['all', 'day', 'week', 'month'].map((period) => (
                  <button
                    key={period}
                    onClick={() => handleFilterChange(period)}
                    className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${
                      filterPeriod === period
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    {period === 'all' ? 'Todas' : period === 'day' ? 'Hoy' : period === 'week' ? 'Esta Semana' : 'Este Mes'}
                  </button>
                ))}

                {/* Fecha inicio */}
                <DatePickerPopover
                  selected={dateRange.start}
                  onChange={(date) => {
                    invalidateCache('ingresos');
                    filtersChanged.current = true;
                    setFilterPeriod('custom');
                    setFilteredIngresos([]);
                    setIngresos([]);
                    const startOfDay = new Date(date);
                    startOfDay.setHours(0, 0, 0, 0);
                    setDateRange(prev => ({ ...prev, start: startOfDay }));
                  }}
                  placeholder="Fecha inicio"
                />

                {/* Fecha fin */}
                <DatePickerPopover
                  selected={dateRange.end}
                  onChange={(date) => {
                    invalidateCache('ingresos');
                    filtersChanged.current = true;
                    setFilterPeriod('custom');
                    const endOfDay = new Date(date);
                    endOfDay.setHours(23, 59, 59, 999);
                    setDateRange(prev => ({ ...prev, end: endOfDay }));
                  }}
                  placeholder="Fecha fin"
                  minDate={dateRange.start}
                />

                {/* Selector de límite */}
                <select
                  value={limitFirestore}
                  onChange={(e) => {
                    invalidateCache('ingresos');
                    filtersChanged.current = true;
                    setLimitFirestore(Number(e.target.value));
                    setFilteredIngresos([]);
                    setIngresos([]);
                    setCurrentPage(1);
                  }}
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

          {/* ── Contenido ─────────────────────────────────────────────────── */}
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : currentIngresos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-gray-50 rounded-lg p-4">
              <ArrowDownTrayIcon className="h-24 w-24 text-gray-300 mb-4" />
              <p className="text-lg font-medium">No se encontraron boletas de ingreso.</p>
            </div>
          ) : (
            <>
              {/* Indicador de total */}
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-2">
                  <span className="text-sm text-blue-600 font-medium">Total en período:</span>
                  <span className="text-lg font-bold text-blue-800">{totalIngresosPeriodo} ingresos</span>
                </div>
              </div>

              <div className="overflow-x-auto shadow-lg ring-1 ring-black ring-opacity-5 rounded-lg overflow-y-auto max-h-[60vh] relative z-10">
                <table className="min-w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">N° BOLETA</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">N° PEDIDO</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">PROVEEDOR</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">FECHA RECEPCION</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">FECHA FACTURACION</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">LOTES</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">STOCK</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">COSTO TOTAL</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ESTADO</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">OBSERVACIONES</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">REGISTRADO POR</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {currentIngresos.map((ingreso, index) => (
                      <tr key={ingreso.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700">
                          {ingreso.numeroBoleta || 'N/A'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 font-mono">
                          {ingreso.numeroPedido || '—'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700">
                          {ingreso.proveedorNombre}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700">
                          {ingreso.fechaIngresoFormatted}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700">
                          {ingreso.fechaRecepcion?.toDate?.().toLocaleDateString('es-ES', {
                            year: 'numeric', month: 'long', day: 'numeric',
                          }) || ingreso.fechaIngresoFormatted}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {ingreso.cantidadLotes || 0} lotes
                          </span>
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-center">
                          {ingreso.totalStockIngresado || 0}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 font-medium">
                          S/. {parseFloat(ingreso.costoTotalIngreso || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          {ingreso.estado === 'recibido' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircleIcon className="h-4 w-4 mr-1" /> Recibido
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <ExclamationCircleIcon className="h-4 w-4 mr-1" /> Pendiente
                            </span>
                          )}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700 max-w-xs truncate"
                            title={ingreso.observaciones || 'N/A'}>
                          {ingreso.observaciones || 'N/A'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700">
                          {ingreso.empleadoId || 'Desconocido'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          <div className="flex items-center space-x-2 justify-center">
                            {ingreso.estado === 'pendiente' && (
                              <button
                                onClick={() => handleConfirmarRecepcion(ingreso.id)}
                                className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition-colors"
                                title="Confirmar Recepción"
                              >
                                <CheckCircleIcon className="h-5 w-5" />
                              </button>
                            )}
                            {ingreso.estado === 'pendiente' && (
                              <button
                                onClick={() => router.push(`/inventario/ingresos/editar/${ingreso.id}`)}
                                className="text-yellow-600 hover:text-yellow-800 p-2 rounded-full hover:bg-yellow-50 transition-colors"
                                title="Editar"
                              >
                                <PencilIcon className="h-5 w-5" />
                              </button>
                            )}
                            <button
                              onClick={() => router.push(`/inventario/ingresos/${ingreso.id}`)}
                              className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors"
                              title="Ver Detalles"
                            >
                              <EyeIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteIngreso(ingreso.id, ingreso.estado)}
                              className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition-colors"
                              title="Eliminar"
                            >
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
              {filteredIngresos.length > ingresosPerPage && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-gray-700">
                    Mostrando{' '}
                    <span className="font-medium">{indexOfFirstIngreso + 1}</span> a{' '}
                    <span className="font-medium">{Math.min(indexOfLastIngreso, filteredIngresos.length)}</span> de{' '}
                    <span className="font-medium">{filteredIngresos.length}</span> resultados
                  </p>
                  <div className="flex space-x-2">
                    <button
                      onClick={goToPrevPage}
                      disabled={currentPage === 1}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-700">
                      Página {currentPage} de {totalPages}
                    </span>
                    <button
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
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

export default IngresosPage;