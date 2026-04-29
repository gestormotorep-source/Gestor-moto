// pages/inventario/lotes/index.js
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../contexts/AuthContext';
import Layout from '../../../components/Layout';
import { db } from '../../../lib/firebase';
import { useAppCache } from '../../../contexts/AppCacheContext';
import {
  collection, getDocs, query, orderBy, where,
} from 'firebase/firestore';
import {
  MagnifyingGlassIcon,
  HashtagIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const LotesPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { getCache, setCache, invalidateCache } = useAppCache();

  // ── Leer cache al inicializar ──────────────────────────────────────────────
  const cached = getCache('lotes');
  const isFirstRender = useRef(true);
  const filtersChanged = useRef(false);

  // ── Estados principales (inicializados desde cache si existe) ─────────────
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const [lotesAgrupados, setLotesAgrupados] = useState(cached?.data || []);
  const [filteredGrupos, setFilteredGrupos] = useState(cached?.filtros?.filteredGrupos || cached?.data || []);

  // Filtros — rehidratados desde cache
  const [searchTerm, setSearchTerm] = useState(cached?.filtros?.searchTerm || '');
  const [estadoFilter, setEstadoFilter] = useState(cached?.filtros?.estadoFilter || '');
  const [sortBy, setSortBy] = useState(cached?.filtros?.sortBy || 'nombre');
  const [limitPerPage, setLimitPerPage] = useState(cached?.filtros?.limitPerPage || 50);

  // Vista expandida — rehidratada desde cache (Set serializado como Array)
  const [expandedProducts, setExpandedProducts] = useState(() => {
    const arr = cached?.filtros?.expandedProducts;
    return arr ? new Set(arr) : new Set();
  });

  // ── Carga de datos ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { router.push('/auth'); return; }
    if (!router.isReady) return;

    // Si hay cache válido y los filtros no cambiaron, no recargar
    if (cached && !filtersChanged.current) {
      setLoading(false);
      return;
    }

    filtersChanged.current = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const snap = await getDocs(
          query(collection(db, 'lotes'), orderBy('fechaIngreso', 'desc'))
        );

        const lotesData = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            productoId:               data.productoId               || 'sin-producto',
            nombreProducto:           data.nombreProducto           || 'Sin nombre',
            codigoTienda:             data.codigoTienda             || '',
            codigoProveedor:          data.codigoProveedor          || '',
            marca:                    data.marca                    || '',
            medida:                   data.medida                   || '',
            color:                    data.color                    || '',
            numeroLote:               data.numeroLote               || '—',
            cantidad:                 data.cantidad                 || 0,
            cantidadInicial:          data.cantidadInicial          || data.cantidad || 0,
            stockRestante:            data.stockRestante            ?? data.cantidad ?? 0,
            precioCompraUnitario:     data.precioCompraUnitario     || 0,
            precioVentaUnitario:      data.precioVentaUnitario      || 0,
            precioVentaMinimoUnitario: data.precioVentaMinimoUnitario || 0,
            subtotal:                 data.subtotal                 || 0,
            fechaIngreso:             data.fechaIngreso             || null,
            estado:                   data.estado                   || 'activo',
            ingresoId:                data.ingresoId                || null,
          };
        });

        // Agrupar por producto
        const map = {};
        lotesData.forEach(lote => {
          const pid = lote.productoId;
          if (!map[pid]) {
            map[pid] = {
              productoId:      pid,
              nombreProducto:  lote.nombreProducto,
              codigoTienda:    lote.codigoTienda,
              codigoProveedor: lote.codigoProveedor,
              marca:           lote.marca,
              medida:          lote.medida,
              lotes: [],
            };
          }
          map[pid].lotes.push(lote);
        });

        const grupos = Object.values(map).map(g => {
          const lotesActivos = g.lotes.filter(l => l.estado === 'activo');
          const stockActivo  = lotesActivos.reduce((s, l) => s + parseFloat(l.stockRestante || 0), 0);

          // Precio promedio ponderado
          let totalValor = 0, totalCant = 0;
          lotesActivos.forEach(l => {
            const st = parseFloat(l.stockRestante || 0);
            totalValor += st * parseFloat(l.precioCompraUnitario || 0);
            totalCant  += st;
          });
          const precioPromedio = totalCant > 0 ? totalValor / totalCant : 0;

          const fechaUltimoIngreso = g.lotes.reduce((latest, l) => {
            if (!l.fechaIngreso) return latest;
            const f = l.fechaIngreso.toDate ? l.fechaIngreso.toDate() : new Date(l.fechaIngreso);
            return !latest || f > latest ? f : latest;
          }, null);

          let estadoGeneral = 'activo';
          if (stockActivo === 0) estadoGeneral = 'agotado';
          else if (stockActivo <= 5) estadoGeneral = 'stock-bajo';

          // Ordenar lotes: más reciente primero
          g.lotes.sort((a, b) => {
            const fa = a.fechaIngreso ? (a.fechaIngreso.toDate ? a.fechaIngreso.toDate() : new Date(a.fechaIngreso)) : new Date(0);
            const fb = b.fechaIngreso ? (b.fechaIngreso.toDate ? b.fechaIngreso.toDate() : new Date(b.fechaIngreso)) : new Date(0);
            return fb - fa;
          });

          return { ...g, stockActivo, precioPromedio, fechaUltimoIngreso, estadoGeneral };
        });

        setLotesAgrupados(grupos);
      } catch (err) {
        setError('Error al cargar datos: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, router.isReady]); // Solo recarga si cambia el usuario o router — filtros son locales

  // ── Filtros locales (sin llamadas a Firestore) ─────────────────────────────
  useEffect(() => {
    // En primer render con cache válido, restaurar filteredGrupos directo
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (cached?.filtros?.filteredGrupos?.length > 0) {
        setFilteredGrupos(cached.filtros.filteredGrupos);
        return;
      }
    }

    if (!lotesAgrupados.length) return;

    let result = [...lotesAgrupados];

    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(g =>
        g.nombreProducto.toLowerCase().includes(lower) ||
        g.codigoTienda.toLowerCase().includes(lower) ||
        g.codigoProveedor.toLowerCase().includes(lower) ||
        g.marca.toLowerCase().includes(lower) ||
        g.lotes.some(l => l.numeroLote.toLowerCase().includes(lower))
      );
    }

    if (estadoFilter) {
      result = result.filter(g => g.estadoGeneral === estadoFilter);
    }

    result.sort((a, b) => {
      if (sortBy === 'stock') return b.stockActivo - a.stockActivo;
      if (sortBy === 'fecha') return (b.fechaUltimoIngreso || 0) - (a.fechaUltimoIngreso || 0);
      return a.nombreProducto.localeCompare(b.nombreProducto);
    });

    setFilteredGrupos(result);
  }, [lotesAgrupados, searchTerm, estadoFilter, sortBy]);

  // ── Persistir cache cada vez que cambia algo relevante ────────────────────
  useEffect(() => {
    if (lotesAgrupados.length > 0) {
      setCache('lotes', lotesAgrupados, {
        searchTerm,
        estadoFilter,
        sortBy,
        limitPerPage,
        filteredGrupos,
        // Set → Array para serialización
        expandedProducts: Array.from(expandedProducts),
      });
    }
  }, [lotesAgrupados, filteredGrupos, searchTerm, estadoFilter, sortBy, limitPerPage, expandedProducts]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatDate = (ts) => {
    if (!ts) return '—';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return '—'; }
  };

  const toggleExpand = (pid) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  const clearFilters = () => {
    invalidateCache('lotes');
    filtersChanged.current = true;
    setSearchTerm('');
    setEstadoFilter('');
    setSortBy('nombre');
    setLimitPerPage(50);
    setExpandedProducts(new Set());
  };

  const estadoBadgeGrupo = (estado) => {
    if (estado === 'agotado')    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><XCircleIcon className="h-3 w-3"/>Agotado</span>;
    if (estado === 'stock-bajo') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><ExclamationTriangleIcon className="h-3 w-3"/>Stock bajo</span>;
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircleIcon className="h-3 w-3"/>Activo</span>;
  };

  const estadoBadgeLote = (lote) => {
    if (lote.estado === 'agotado' || lote.stockRestante <= 0)
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><XCircleIcon className="h-3 w-3"/>Agotado</span>;
    if (lote.stockRestante <= 5)
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><ExclamationTriangleIcon className="h-3 w-3"/>Bajo</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircleIcon className="h-3 w-3"/>Activo</span>;
  };

  // Estadísticas globales
  const stats = {
    total:      lotesAgrupados.length,
    activos:    lotesAgrupados.filter(g => g.estadoGeneral === 'activo').length,
    bajo:       lotesAgrupados.filter(g => g.estadoGeneral === 'stock-bajo').length,
    agotados:   lotesAgrupados.filter(g => g.estadoGeneral === 'agotado').length,
    totalLotes: lotesAgrupados.reduce((s, g) => s + g.lotes.length, 0),
  };

  const displayed = filteredGrupos.slice(0, limitPerPage);

  if (!router.isReady || !user || loading) {
    return (
      <Layout title="Cargando Lotes">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Gestión de Lotes">
      <div className="flex flex-col mx-4 py-4">
        {error && (
          <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 max-w-md">
            {error}
          </div>
        )}

        <div className="w-full bg-white rounded-xl shadow-lg overflow-hidden">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                  <HashtagIcon className="h-7 w-7" />
                  Gestión de Lotes
                </h1>
                <p className="text-blue-100 text-sm mt-1">Control de lotes agrupados por producto • FIFO</p>
              </div>
            </div>
          </div>

          {/* ── Estadísticas ────────────────────────────────────────────── */}
          <div className="grid grid-cols-5 divide-x divide-gray-200 border-b border-gray-200 bg-gray-50">
            {[
              { label: 'Productos',     value: stats.total,      color: 'text-gray-900' },
              { label: 'Lotes totales', value: stats.totalLotes, color: 'text-blue-700' },
              { label: 'Activos',       value: stats.activos,    color: 'text-green-700' },
              { label: 'Stock bajo',    value: stats.bajo,       color: 'text-amber-600' },
              { label: 'Agotados',      value: stats.agotados,   color: 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="py-4 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── Controles ───────────────────────────────────────────────── */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-wrap items-center gap-3">
              {/* Búsqueda */}
              <div className="relative flex-1 min-w-64">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => {
                    setSearchTerm(e.target.value);
                  }}
                  placeholder="Buscar por producto, lote, código, marca..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Estado */}
              <select
                value={estadoFilter}
                onChange={e => setEstadoFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="stock-bajo">Stock bajo</option>
                <option value="agotado">Agotado</option>
              </select>

              {/* Ordenar */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="nombre">Ordenar: Nombre</option>
                <option value="stock">Ordenar: Stock</option>
                <option value="fecha">Ordenar: Fecha</option>
              </select>

              {/* Límite */}
              <select
                value={limitPerPage}
                onChange={e => setLimitPerPage(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>

              {/* Limpiar filtros */}
              <button
                onClick={clearFilters}
                className="inline-flex items-center px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 border border-red-200 whitespace-nowrap transition-colors"
              >
                <XMarkIcon className="h-4 w-4 mr-1" />
                Limpiar
              </button>

              {/* Contador */}
              <span className="text-sm text-gray-500 ml-auto">
                {filteredGrupos.length} producto{filteredGrupos.length !== 1 ? 's' : ''}
                {filteredGrupos.length !== lotesAgrupados.length && ` de ${lotesAgrupados.length}`}
              </span>
            </div>
          </div>

          {/* ── Tabla de grupos ─────────────────────────────────────────── */}
          {displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <ArchiveBoxIcon className="h-16 w-16 mb-4 text-gray-300" />
              <p className="text-lg font-medium text-gray-500">
                {lotesAgrupados.length === 0 ? 'No hay lotes registrados' : 'Sin resultados'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {lotesAgrupados.length === 0
                  ? 'Los lotes se crean al registrar ingresos de inventario'
                  : 'Intenta con otros filtros de búsqueda'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {displayed.map(grupo => {
                const expanded = expandedProducts.has(grupo.productoId);
                return (
                  <div key={grupo.productoId}>

                    {/* ── Fila de grupo (producto) ──────────────────────── */}
                    <div
                      className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-blue-50 transition-colors group"
                      onClick={() => toggleExpand(grupo.productoId)}
                    >
                      {/* Chevron */}
                      <div className="flex-shrink-0 w-5">
                        {expanded
                          ? <ChevronDownIcon className="h-4 w-4 text-blue-500" />
                          : <ChevronRightIcon className="h-4 w-4 text-gray-400 group-hover:text-blue-400" />
                        }
                      </div>

                      {/* Info producto */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">{grupo.nombreProducto}</span>
                          {grupo.marca && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{grupo.marca}</span>
                          )}
                          {grupo.medida && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{grupo.medida}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                          {grupo.codigoTienda && (
                            <span>C.Tienda: <span className="font-mono font-medium text-gray-700">{grupo.codigoTienda}</span></span>
                          )}
                          {grupo.codigoProveedor && (
                            <span className="text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded font-mono">
                              C.Prov: {grupo.codigoProveedor}
                            </span>
                          )}
                          <span>{grupo.lotes.length} lote{grupo.lotes.length !== 1 ? 's' : ''}</span>
                          {grupo.fechaUltimoIngreso && (
                            <span>Último ingreso: {formatDate(grupo.fechaUltimoIngreso)}</span>
                          )}
                        </div>
                      </div>

                      {/* Stock y precio */}
                      <div className="text-right flex-shrink-0 hidden sm:block">
                        <div className="text-sm font-bold text-gray-900">{grupo.stockActivo} uds.</div>
                        <div className="text-xs text-gray-500">P. compra prom: S/. {grupo.precioPromedio.toFixed(2)}</div>
                      </div>

                      {/* Badge estado */}
                      <div className="flex-shrink-0">
                        {estadoBadgeGrupo(grupo.estadoGeneral)}
                      </div>
                    </div>

                    {/* ── Lotes individuales expandidos ─────────────────── */}
                    {expanded && (
                      <div className="bg-gray-50 border-t border-gray-100 px-5 py-4">
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="bg-blue-50 border-b border-blue-100">
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Lote</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Stock rest.</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Cant. inicial</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">P. Compra</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">P. Venta</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">P. Venta Mín.</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha ingreso</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Estado</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Ver</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {grupo.lotes.map((lote, i) => (
                                <tr key={lote.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>

                                  {/* Número de lote */}
                                  <td className="px-3 py-2.5">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 font-mono">
                                      {lote.numeroLote}
                                    </span>
                                  </td>

                                  {/* Stock restante */}
                                  <td className="px-3 py-2.5 text-center">
                                    <span className={`font-bold text-sm ${
                                      lote.stockRestante <= 0 ? 'text-red-600' :
                                      lote.stockRestante <= 5 ? 'text-amber-600' : 'text-gray-900'
                                    }`}>
                                      {lote.stockRestante}
                                    </span>
                                  </td>

                                  {/* Cantidad inicial */}
                                  <td className="px-3 py-2.5 text-center text-gray-500 text-xs">
                                    {lote.cantidadInicial}
                                  </td>

                                  {/* P. Compra */}
                                  <td className="px-3 py-2.5 text-center">
                                    <span className="text-sm font-medium text-gray-700">
                                      S/. {parseFloat(lote.precioCompraUnitario || 0).toFixed(2)}
                                    </span>
                                  </td>

                                  {/* P. Venta */}
                                  <td className="px-3 py-2.5 text-center">
                                    {lote.precioVentaUnitario > 0 ? (
                                      <span className="text-sm font-semibold text-blue-700">
                                        S/. {parseFloat(lote.precioVentaUnitario).toFixed(2)}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-400">—</span>
                                    )}
                                  </td>

                                  {/* P. Venta Mínimo */}
                                  <td className="px-3 py-2.5 text-center">
                                    {lote.precioVentaMinimoUnitario > 0 ? (
                                      <span className="text-sm font-medium text-orange-600">
                                        S/. {parseFloat(lote.precioVentaMinimoUnitario).toFixed(2)}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-400">—</span>
                                    )}
                                  </td>

                                  {/* Fecha ingreso */}
                                  <td className="px-3 py-2.5 text-center text-xs text-gray-500">
                                    {formatDate(lote.fechaIngreso)}
                                  </td>

                                  {/* Estado */}
                                  <td className="px-3 py-2.5 text-center">
                                    {estadoBadgeLote(lote)}
                                  </td>

                                  {/* Ver detalle */}
                                  <td className="px-3 py-2.5 text-center">
                                    {lote.ingresoId && (
                                      <button
                                        onClick={e => { e.stopPropagation(); router.push(`/inventario/ingresos/${lote.ingresoId}`); }}
                                        className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors"
                                        title="Ver ingreso"
                                      >
                                        <EyeIcon className="h-4 w-4" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Footer con paginación simple ──────────────────────────── */}
          {filteredGrupos.length > limitPerPage && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Mostrando {displayed.length} de {filteredGrupos.length} productos
              </span>
              <button
                onClick={() => setLimitPerPage(p => p + 50)}
                className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Cargar más
              </button>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
};

export default LotesPage;