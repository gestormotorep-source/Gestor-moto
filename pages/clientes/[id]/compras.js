import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../contexts/AuthContext';
import Layout from '../../../components/Layout';
import { collection, query, where, onSnapshot, doc, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar } from '../../../components/ui/calendar';
import {
  ArrowLeftIcon, ShoppingBagIcon, ChevronDownIcon, ChevronUpIcon,
  ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ExclamationTriangleIcon,
  XMarkIcon, CreditCardIcon, BanknotesIcon
} from '@heroicons/react/24/outline';

const ComprasPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();

  const [cliente, setCliente] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [devoluciones, setDevoluciones] = useState([]);
  const [ventasFiltradas, setVentasFiltradas] = useState([]);
  const [devolucionesFiltradas, setDevolucionesFiltradas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filterPeriod, setFilterPeriod] = useState('all');
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [totalPeriodo, setTotalPeriodo] = useState(0);
  const [totalDevoluciones, setTotalDevoluciones] = useState(0);
  const [totalReal, setTotalReal] = useState(0);

  const [expandedVentaId, setExpandedVentaId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [limitPerPage, setLimitPerPage] = useState(20);

  // ── DatePickerPopover (igual que index ventas) ──────────
  const DatePickerPopover = ({ selected, onChange, placeholder, minDate }) => {
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(selected || new Date());
    const ref = useRef(null);

    useEffect(() => {
      const handler = (e) => {
        if (ref.current && !ref.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);

    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - 3 + i);

    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(prev => !prev)}
          className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 whitespace-nowrap shadow-sm"
        >
          <CalendarIcon className="h-4 w-4 text-gray-400" />
          {selected
            ? format(selected, 'dd/MM/yyyy', { locale: es })
            : <span className="text-gray-400">{placeholder}</span>
          }
        </button>

        {open && (
          <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl">
            <div className="flex items-center justify-between px-3 pt-3 pb-1 gap-2">
              <button
                onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                className="flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700 shrink-0"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1">
                <select
                  value={month.getMonth()}
                  onChange={(e) => setMonth(m => new Date(m.getFullYear(), parseInt(e.target.value), 1))}
                  className="text-sm font-semibold text-gray-800 bg-transparent border-none outline-none cursor-pointer rounded px-1 py-0.5"
                >
                  {meses.map((mes, i) => <option key={i} value={i}>{mes}</option>)}
                </select>
                <select
                  value={month.getFullYear()}
                  onChange={(e) => setMonth(m => new Date(parseInt(e.target.value), m.getMonth(), 1))}
                  className="text-sm font-semibold text-gray-800 bg-transparent border-none outline-none cursor-pointer rounded px-1 py-0.5"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button
                onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                className="flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700 shrink-0"
              >
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
              classNames={{ month_caption: "hidden", nav: "hidden" }}
            />
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (!user) { router.push('/auth'); return; }
  }, [user, router]);

  // ── Filtrado ─────────────────────────────────────────────
  const getDateRange = (period) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (period) {
      case 'day': return { start: today, end: new Date(today.getTime() + 86400000 - 1) };
      case 'week': {
        const s = new Date(today); s.setDate(today.getDate() - today.getDay());
        const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23,59,59,999);
        return { start: s, end: e };
      }
      case 'month': {
        const s = new Date(now.getFullYear(), now.getMonth(), 1);
        const e = new Date(now.getFullYear(), now.getMonth() + 1, 0); e.setHours(23,59,59,999);
        return { start: s, end: e };
      }
      case 'year': {
        const s = new Date(now.getFullYear(), 0, 1);
        const e = new Date(now.getFullYear(), 11, 31); e.setHours(23,59,59,999);
        return { start: s, end: e };
      }
      case 'custom': return { start: dateRange.start, end: dateRange.end };
      default: return null;
    }
  };

  useEffect(() => {
    let fv = [...ventas];
    let fd = [...devoluciones];

    if (filterPeriod !== 'all') {
      const range = getDateRange(filterPeriod);
      if (range?.start && range?.end) {
        fv = fv.filter(v => v.fechaVenta && v.fechaVenta >= range.start && v.fechaVenta <= range.end);
        fd = fd.filter(d => d.fechaProcesamiento && d.fechaProcesamiento >= range.start && d.fechaProcesamiento <= range.end);
      }
    }

    setVentasFiltradas(fv);
    setDevolucionesFiltradas(fd);
    const tv = fv.reduce((s, v) => s + parseFloat(v.totalVenta || 0), 0);
    const td = fd.reduce((s, d) => s + parseFloat(d.montoADevolver || 0), 0);
    setTotalPeriodo(tv);
    setTotalDevoluciones(td);
    setTotalReal(tv - td);
    setCurrentPage(1);
    setExpandedVentaId(null);
  }, [ventas, devoluciones, filterPeriod, dateRange]);

  // ── Listeners ────────────────────────────────────────────
  useEffect(() => {
    if (!id || !user) return;
    setLoading(true);

    const unsubCliente = onSnapshot(doc(db, 'cliente', id), (snap) => {
      if (snap.exists()) setCliente({ id: snap.id, ...snap.data() });
      else { setError('Cliente no encontrado.'); setCliente(null); }
    });

    const unsubVentas = onSnapshot(
      query(collection(db, 'ventas'), where('clienteId', '==', id)),
      async (snap) => {
        const lista = await Promise.all(snap.docs.map(async (d) => {
          const items = (await getDocs(collection(d.ref, 'itemsVenta'))).docs.map(i => ({ id: i.id, ...i.data() }));
          return { id: d.id, ...d.data(), fechaVenta: d.data().fechaVenta?.toDate() || null, items };
        }));
        lista.sort((a, b) => b.fechaVenta - a.fechaVenta);
        setVentas(lista);
        setLoading(false);
      },
      (err) => { setError('Error al cargar ventas: ' + err.message); setLoading(false); }
    );

    const unsubDev = onSnapshot(
      query(collection(db, 'devoluciones'), where('clienteId', '==', id)),
      (snap) => {
        const lista = snap.docs.map(d => ({
          id: d.id, ...d.data(),
          fechaProcesamiento: d.data().fechaProcesamiento?.toDate() || null,
        })).sort((a, b) => (b.fechaProcesamiento || 0) - (a.fechaProcesamiento || 0));
        setDevoluciones(lista);
      }
    );

    return () => { unsubCliente(); unsubVentas(); unsubDev(); };
  }, [id, user]);

  // ── Helpers ──────────────────────────────────────────────
  const getDevolucionesDeVenta = (numeroVenta) =>
    devolucionesFiltradas.filter(d => d.numeroVenta === numeroVenta && d.estado === 'aprobada');

  const getTotalRealVenta = (venta) => {
    const devs = getDevolucionesDeVenta(venta.numeroVenta);
    return parseFloat(venta.totalVenta || 0) - devs.reduce((s, d) => s + parseFloat(d.montoADevolver || 0), 0);
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(amount || 0);

  const getPeriodText = () => {
    switch (filterPeriod) {
      case 'day': return 'hoy';
      case 'week': return 'esta semana';
      case 'month': return 'este mes';
      case 'year': return 'este año';
      case 'custom':
        if (dateRange.start && dateRange.end)
          return `${format(dateRange.start,'dd/MM/yyyy',{locale:es})} – ${format(dateRange.end,'dd/MM/yyyy',{locale:es})}`;
        return 'período personalizado';
      default: return 'todas las fechas';
    }
  };

  // ── Paginación ───────────────────────────────────────────
  const totalPages = Math.ceil(ventasFiltradas.length / limitPerPage);
  const indexOfLast = currentPage * limitPerPage;
  const indexOfFirst = indexOfLast - limitPerPage;
  const ventasPaginadas = ventasFiltradas.slice(indexOfFirst, indexOfLast);

  const handleFilterChange = (period) => {
    setFilterPeriod(period);
    if (period !== 'custom') setDateRange({ start: null, end: null });
  };

  if (!user) return null;

  return (
    <Layout title={`Compras de ${cliente?.nombre || 'Cliente'}`}>
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-6 bg-white rounded-lg shadow-md flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-100 p-2 rounded-xl">
                <ShoppingBagIcon className="h-7 w-7 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">
                  {cliente ? `${cliente.nombre} ${cliente.apellido}` : '...'}
                </h1>
                <p className="text-sm text-gray-500">Historial de compras</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/clientes')}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition"
            >
              <ArrowLeftIcon className="-ml-1 mr-2 h-4 w-4" />
              Volver
            </button>
          </div>

          {loading && (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Panel de filtros */}
              <div className="mb-6 border border-gray-200 rounded-xl p-4 bg-gray-50">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {/* Botones período */}
                  {[
                    { key: 'all', label: 'Todas' },
                    { key: 'day',  label: 'Hoy' },
                    { key: 'week', label: 'Esta Semana' },
                    { key: 'month',label: 'Este Mes' },
                    { key: 'year', label: 'Este Año' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handleFilterChange(key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                        filterPeriod === key
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}

                  {/* Date pickers */}
                  <DatePickerPopover
                    selected={dateRange.start}
                    onChange={(date) => {
                      const d = new Date(date); d.setHours(0,0,0,0);
                      setDateRange(prev => ({ ...prev, start: d }));
                      setFilterPeriod('custom');
                    }}
                    placeholder="Fecha inicio"
                  />
                  <DatePickerPopover
                    selected={dateRange.end}
                    onChange={(date) => {
                      const d = new Date(date); d.setHours(23,59,59,999);
                      setDateRange(prev => ({ ...prev, end: d }));
                      setFilterPeriod('custom');
                    }}
                    placeholder="Fecha fin"
                    minDate={dateRange.start}
                  />

                  {/* Limpiar */}
                  <button
                    onClick={() => { handleFilterChange('all'); }}
                    className="inline-flex items-center px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 border border-red-200 transition"
                  >
                    <XMarkIcon className="h-4 w-4 mr-1" />
                    Limpiar
                  </button>

                  {/* Límite */}
                  <div className="ml-auto">
                    <select
                      className="px-3 py-1.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                      value={limitPerPage}
                      onChange={(e) => { setLimitPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                {/* Tarjetas de resumen */}
                {ventasFiltradas.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-200">
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-col">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Compras</span>
                      <span className="text-2xl font-bold text-gray-800">{ventasFiltradas.length}</span>
                      <span className="text-xs text-gray-400 mt-0.5">{getPeriodText()}</span>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-col">
                      <span className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-1">Total Compras</span>
                      <span className="text-xl font-bold text-blue-800">{formatCurrency(totalPeriodo)}</span>
                      <span className="text-xs text-blue-400 mt-0.5">bruto</span>
                    </div>
                    {totalDevoluciones > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex flex-col">
                        <span className="text-xs text-red-600 font-medium uppercase tracking-wide mb-1">Devoluciones</span>
                        <span className="text-xl font-bold text-red-700">-{formatCurrency(totalDevoluciones)}</span>
                        <span className="text-xs text-red-400 mt-0.5">{devolucionesFiltradas.length} devoluciones</span>
                      </div>
                    )}
                    <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex flex-col">
                      <span className="text-xs text-green-600 font-medium uppercase tracking-wide mb-1">Total Real</span>
                      <span className="text-xl font-bold text-green-700">{formatCurrency(totalReal)}</span>
                      <span className="text-xs text-green-400 mt-0.5">neto</span>
                    </div>
                  </div>
                )}
              </div>

              {ventasFiltradas.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <ShoppingBagIcon className="h-16 w-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">
                    {filterPeriod === 'all' ? 'Este cliente aún no ha realizado compras.' : `No hay compras ${getPeriodText()}.`}
                  </p>
                </div>
              ) : (
                <>
                  {/* Indicador */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2 flex items-center gap-2">
                      <span className="text-sm text-indigo-600 font-medium">Mostrando:</span>
                      <span className="text-lg font-bold text-indigo-800">{ventasFiltradas.length} compras</span>
                    </div>
                  </div>

                  {/* Tabla */}
                  <div className="overflow-x-auto shadow-lg ring-1 ring-black ring-opacity-5 rounded-xl overflow-y-auto max-h-[60vh]">
                    <table className="min-w-full border-collapse">
                      <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                          <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center w-10"></th>
                          <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">FECHA</th>
                          <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">N° VENTA</th>
                          <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">TOTAL ORIGINAL</th>
                          <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">DEVUELTO</th>
                          <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">TOTAL REAL</th>
                          <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MÉTODO PAGO</th>
                          <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ESTADO</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {ventasPaginadas.map((venta, index) => {
                          const devolucionesVenta = getDevolucionesDeVenta(venta.numeroVenta);
                          const totalDevsVenta = devolucionesVenta.reduce((s, d) => s + parseFloat(d.montoADevolver || 0), 0);
                          const totalRealVenta = getTotalRealVenta(venta);
                          const tieneDevolucion = devolucionesVenta.length > 0;
                          const isExpanded = expandedVentaId === venta.id;

                          return (
                            <>
                              <tr
                                key={venta.id}
                                className={`${
                                  isExpanded ? 'bg-indigo-50 border-l-4 border-l-indigo-400' :
                                  tieneDevolucion ? 'border-l-4 border-l-red-400 ' + (index % 2 === 0 ? 'bg-white' : 'bg-gray-50') :
                                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                } hover:bg-indigo-50 transition-colors`}
                              >
                                <td className="border border-gray-300 px-2 py-2 text-center">
                                  {venta.items?.length > 0 && (
                                    <button
                                      onClick={() => setExpandedVentaId(isExpanded ? null : venta.id)}
                                      className={`p-1 rounded-lg transition ${isExpanded ? 'bg-indigo-200 text-indigo-700' : 'text-gray-400 hover:bg-gray-100'}`}
                                    >
                                      {isExpanded
                                        ? <ChevronUpIcon className="h-4 w-4" />
                                        : <ChevronDownIcon className="h-4 w-4" />
                                      }
                                    </button>
                                  )}
                                </td>
                                <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-center">
                                  {venta.fechaVenta
                                    ? format(venta.fechaVenta, 'dd/MM/yyyy HH:mm', { locale: es })
                                    : 'N/A'}
                                </td>
                                <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-mono text-gray-700 text-center">
                                  {venta.numeroVenta || 'N/A'}
                                </td>
                                <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center font-semibold ${tieneDevolucion ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                  {formatCurrency(venta.totalVenta)}
                                </td>
                                <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                                  {tieneDevolucion
                                    ? <span className="text-red-600 font-bold">-{formatCurrency(totalDevsVenta)}</span>
                                    : <span className="text-gray-300">—</span>
                                  }
                                </td>
                                <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center font-bold ${tieneDevolucion ? 'text-green-600' : 'text-gray-800'}`}>
                                  {formatCurrency(totalRealVenta)}
                                </td>
                                <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                    {venta.metodoPago?.toUpperCase() || 'N/A'}
                                  </span>
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-center">
                                  {venta.estado === 'anulada' ? (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">ANULADA</span>
                                  ) : tieneDevolucion ? (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">CON DEVOLUCIÓN</span>
                                  ) : (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">COMPLETA</span>
                                  )}
                                </td>
                              </tr>

                              {/* Fila expandida */}
                              {isExpanded && venta.items && (
                                <tr key={`${venta.id}-expanded`}>
                                  <td colSpan="8" className="border-0 p-0">
                                    <div className="bg-gradient-to-r from-indigo-50 via-white to-indigo-50 border-l-4 border-indigo-400 mx-2 mb-2 mt-0 rounded-b-xl shadow-inner">
                                      <div className="p-5">
                                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-200">
                                          <h4 className="text-sm font-bold text-indigo-800">
                                            Productos — {venta.fechaVenta ? format(venta.fechaVenta, "EEEE d 'de' MMMM yyyy", { locale: es }) : 'N/A'}
                                          </h4>
                                          {tieneDevolucion && (
                                            <span className="bg-red-100 border border-red-300 text-red-800 text-xs font-bold px-3 py-1 rounded-full">
                                              Devuelto: {formatCurrency(totalDevsVenta)}
                                            </span>
                                          )}
                                        </div>

                                        {/* Devoluciones detalle */}
                                        {tieneDevolucion && (
                                          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                            <h5 className="text-xs font-bold text-red-800 mb-2 flex items-center gap-1">
                                              <ExclamationTriangleIcon className="h-4 w-4" />
                                              Devoluciones ({devolucionesVenta.length})
                                            </h5>
                                            <div className="space-y-1">
                                              {devolucionesVenta.map((dev, i) => (
                                                <div key={i} className="flex justify-between text-xs">
                                                  <span className="text-red-700">
                                                    {dev.fechaProcesamiento ? format(dev.fechaProcesamiento, 'dd/MM/yyyy', { locale: es }) : ''} — {dev.metodoPagoOriginal?.toUpperCase()}
                                                  </span>
                                                  <span className="font-bold text-red-800">-{formatCurrency(dev.montoADevolver)}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* Tabla de items */}
                                        <div className="overflow-x-auto rounded-lg">
                                          <table className="min-w-full border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
                                            <thead className="bg-indigo-100">
                                              <tr>
                                                <th className="border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-800 text-left">Producto</th>
                                                <th className="border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-800 text-center">Cant.</th>
                                                <th className="border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-800 text-center">P. Unitario</th>
                                                <th className="border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-800 text-center">Subtotal</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {venta.items.map((item, i) => (
                                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-indigo-50/30'}>
                                                  <td className="border border-indigo-100 px-3 py-2 text-sm text-gray-800 font-medium">{item.nombreProducto}</td>
                                                  <td className="border border-indigo-100 px-3 py-2 text-sm text-gray-700 text-center">{item.cantidad}</td>
                                                  <td className="border border-indigo-100 px-3 py-2 text-sm text-gray-700 text-center">{formatCurrency(item.precioVentaUnitario || 0)}</td>
                                                  <td className="border border-indigo-100 px-3 py-2 text-sm font-semibold text-gray-800 text-center">{formatCurrency(parseFloat(item.cantidad) * parseFloat(item.precioVentaUnitario || 0))}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                            <tfoot className="bg-indigo-100">
                                              <tr>
                                                <td colSpan="3" className="border border-indigo-200 px-3 py-2 text-sm font-bold text-indigo-800 text-right">Total Original:</td>
                                                <td className="border border-indigo-200 px-3 py-2 text-sm font-bold text-indigo-800 text-center">{formatCurrency(venta.totalVenta)}</td>
                                              </tr>
                                              {tieneDevolucion && (
                                                <>
                                                  <tr>
                                                    <td colSpan="3" className="border border-indigo-200 px-3 py-2 text-sm font-bold text-red-700 text-right">Total Devuelto:</td>
                                                    <td className="border border-indigo-200 px-3 py-2 text-sm font-bold text-red-700 text-center">-{formatCurrency(totalDevsVenta)}</td>
                                                  </tr>
                                                  <tr>
                                                    <td colSpan="3" className="border border-indigo-200 px-3 py-2 text-sm font-bold text-green-700 text-right">Total Real:</td>
                                                    <td className="border border-indigo-200 px-3 py-2 text-sm font-bold text-green-700 text-center">{formatCurrency(totalRealVenta)}</td>
                                                  </tr>
                                                </>
                                              )}
                                            </tfoot>
                                          </table>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginación igual que ventas */}
                  {ventasFiltradas.length > limitPerPage && (
                    <div className="flex justify-between items-center mt-4">
                      <p className="text-sm text-gray-700">
                        Mostrando <span className="font-medium">{indexOfFirst + 1}</span> a{' '}
                        <span className="font-medium">{Math.min(indexOfLast, ventasFiltradas.length)}</span> de{' '}
                        <span className="font-medium">{ventasFiltradas.length}</span> resultados
                      </p>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronLeftIcon className="h-5 w-5" />
                        </button>
                        <span className="px-3 py-1 text-sm text-gray-700">
                          Página {currentPage} de {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronRightIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ComprasPage;