// pages/productos/faltantes.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/router';
import {
  ExclamationTriangleIcon,
  ArchiveBoxIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  BuildingStorefrontIcon,
  ShoppingCartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TagIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

// ─── Cache simple en módulo (sobrevive re-renders, no re-fetches) ─────────────
let _cache = null;
let _cacheTs = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const getModuleCache = () => {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;
  return null;
};
const setModuleCache = (data) => {
  _cache = data;
  _cacheTs = Date.now();
};
const invalidateModuleCache = () => {
  _cache = null;
  _cacheTs = 0;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const generateLoteNumber = () => {
  const fecha = new Date();
  const yy = fecha.getFullYear().toString().slice(-2);
  const mm = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const dd = fecha.getDate().toString().padStart(2, '0');
  const rand = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `L${yy}${mm}${dd}-${rand}`;
};

const fmt = (n) => parseFloat(n || 0).toFixed(2);

// ─── Componente Principal ─────────────────────────────────────────────────────
const ProductosFaltantesPage = () => {
  const router = useRouter();
  const { user } = useAuth();

  // ── Datos ──────────────────────────────────────────────────────────────────
  const cached = getModuleCache();
  const [productos, setProductos] = useState(cached?.productos || []);
  const [proveedores, setProveedores] = useState(cached?.proveedores || []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProveedorId, setSelectedProveedorId] = useState('');
  const [selectedMarca, setSelectedMarca] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // ── Paginación ─────────────────────────────────────────────────────────────
  const [limitPerPage, setLimitPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // ── Selección para ingreso ─────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [draftItems, setDraftItems] = useState([]); // [{producto, cantidad}]

  // ── Derivados ─────────────────────────────────────────────────────────────
  const marcas = [...new Set(
    productos.map(p => p.marca).filter(Boolean)
  )].sort();

  const productosFaltantes = productos.filter(producto => {
    const stock = typeof producto.stockActual === 'number' ? producto.stockActual : 0;
    const umbral = typeof producto.stockReferencialUmbral === 'number' ? producto.stockReferencialUmbral : 0;
    if (stock > umbral) return false;

    const lower = searchTerm.toLowerCase();
    const matchSearch = !searchTerm || [
      producto.nombre, producto.marca, producto.codigoTienda,
      producto.codigoProveedor, producto.ubicacion,
    ].some(v => v?.toLowerCase().includes(lower));

    const matchProveedor = !selectedProveedorId || (
      producto.proveedorPrincipal === selectedProveedorId ||
      producto.proveedores?.some(p => p.proveedorId === selectedProveedorId)
    );

    const matchMarca = !selectedMarca || producto.marca === selectedMarca;

    return matchSearch && matchProveedor && matchMarca;
  });

  // Paginación sobre los faltantes filtrados
  const totalPages = Math.ceil(productosFaltantes.length / limitPerPage);
  const idxFirst = (currentPage - 1) * limitPerPage;
  const idxLast = idxFirst + limitPerPage;
  const displayedProductos = productosFaltantes.slice(idxFirst, idxLast);

  // ── Carga de datos con onSnapshot ──────────────────────────────────────────
  useEffect(() => {
    if (!user) { router.push('/auth'); return; }
    if (getModuleCache()) return; // Usar cache si existe

    setLoading(true);
    setError(null);

    let unsubProd = null;
    let unsubProv = null;
    let prodData = null;
    let provData = null;

    const tryCache = () => {
      if (prodData !== null && provData !== null) {
        setModuleCache({ productos: prodData, proveedores: provData });
        setLoading(false);
      }
    };

    unsubProd = onSnapshot(
      query(collection(db, 'productos'), orderBy('nombre', 'asc')),
      (snap) => {
        prodData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setProductos(prodData);
        tryCache();
      },
      (err) => { setError('Error al cargar productos: ' + err.message); setLoading(false); }
    );

    unsubProv = onSnapshot(
      query(collection(db, 'proveedores'), orderBy('nombreEmpresa', 'asc')),
      (snap) => {
        provData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setProveedores(provData);
        tryCache();
      },
      (err) => { setError('Error al cargar proveedores: ' + err.message); setLoading(false); }
    );

    return () => {
      unsubProd?.();
      unsubProv?.();
    };
  }, [user, router]);

  // Reset página cuando cambian filtros
  useEffect(() => { setCurrentPage(1); }, [searchTerm, selectedProveedorId, selectedMarca, limitPerPage]);

  // ── Helpers de selección ───────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (displayedProductos.every(p => selectedIds.has(p.id))) {
      // Deseleccionar todos los de la página actual
      setSelectedIds(prev => {
        const next = new Set(prev);
        displayedProductos.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        displayedProductos.forEach(p => next.add(p.id));
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ── Abrir modal de confirmación ────────────────────────────────────────────
  const openConfirmModal = () => {
    const seleccionados = productosFaltantes.filter(p => selectedIds.has(p.id));
    const deficit = (p) => Math.max(1, (p.stockReferencialUmbral || 0) - (p.stockActual || 0));
    setDraftItems(seleccionados.map(p => ({
      producto: p,
      cantidad: deficit(p),
    })));
    setShowConfirmModal(true);
  };

  const handleDraftCantidad = (idx, val) => {
    setDraftItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, cantidad: Math.max(1, parseInt(val) || 1) } : item
    ));
  };

  // ── Crear ingreso desde modal ──────────────────────────────────────────────
  const handleCrearIngreso = () => {
    const items = draftItems.map(({ producto, cantidad }) => ({
      id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      productoId: producto.id,
      nombreProducto: producto.nombre,
      marca: producto.marca || '',
      medida: producto.medida || '',
      codigoTienda: producto.codigoTienda || '',
      color: producto.color || '',
      numeroLote: generateLoteNumber(),
      cantidad,
      precioCompraUnitario: parseFloat(producto.precioCompraDefault || 0).toFixed(2),
      stockRestanteLote: cantidad,
      subtotal: (cantidad * parseFloat(producto.precioCompraDefault || 0)).toFixed(2),
      fechaVencimiento: null,
      nuevoUmbral: null,
      precioVentaUnitario: parseFloat(producto.precioVentaDefault || 0).toFixed(2),
      precioVentaMinimoUnitario: parseFloat(producto.precioVentaMinimo || 0).toFixed(2),
    }));

    try {
      localStorage.setItem('ingreso_draft', JSON.stringify(items));
    } catch (e) {
      console.error('Error guardando draft:', e);
    }

    setShowConfirmModal(false);
    router.push('/inventario/ingresos/nuevo?from=faltantes');
  };

  // ── Helpers de display ─────────────────────────────────────────────────────
  const getProveedorNombre = (producto) => {
    if (producto.proveedorPrincipalNombre) return producto.proveedorPrincipalNombre;
    if (producto.proveedores?.length > 0) return producto.proveedores[0].nombreProveedor;
    return 'Sin proveedor';
  };

  const getProveedoresTodos = (producto) => {
    if (producto.proveedores?.length > 0)
      return producto.proveedores.map(p => p.nombreProveedor).join(', ');
    return getProveedorNombre(producto);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedProveedorId('');
    setSelectedMarca('');
  };

  const activeFilters = [searchTerm, selectedProveedorId, selectedMarca].filter(Boolean).length;

  if (!user) return null;

  const allPageSelected = displayedProductos.length > 0 &&
    displayedProductos.every(p => selectedIds.has(p.id));

  return (
    <Layout title="Productos Faltantes">
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full bg-white rounded-xl shadow-md flex flex-col overflow-hidden">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-50">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Productos Faltantes</h1>
                <p className="text-sm text-gray-500">
                  {loading ? 'Cargando...' : `${productosFaltantes.length} productos bajo umbral`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Selector de límite */}
              <select
                value={limitPerPage}
                onChange={(e) => setLimitPerPage(Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>

              {/* Botón Filtros */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg shadow-sm text-sm font-medium transition-colors ${
                  showFilters || activeFilters > 0
                    ? 'bg-blue-50 text-blue-700 border-blue-300'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <FunnelIcon className="h-4 w-4" />
                Filtros
                {activeFilters > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                    {activeFilters}
                  </span>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-6 mt-4 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* ── Panel de Filtros ─────────────────────────────────────────── */}
          {showFilters && (
            <div className="mx-6 mt-4 border border-gray-200 rounded-xl p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Filtros</h3>
                {activeFilters > 0 && (
                  <button
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    <XMarkIcon className="h-3 w-3" /> Limpiar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Búsqueda */}
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Nombre, código, marca..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Filtro por proveedor */}
                <div className="relative">
                  <BuildingStorefrontIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <select
                    value={selectedProveedorId}
                    onChange={(e) => setSelectedProveedorId(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                  >
                    <option value="">Todos los proveedores</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombreEmpresa}</option>
                    ))}
                  </select>
                </div>

                {/* Filtro por marca */}
                <div className="relative">
                  <TagIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <select
                    value={selectedMarca}
                    onChange={(e) => setSelectedMarca(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                  >
                    <option value="">Todas las marcas</option>
                    {marcas.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <span>
                  <strong className="text-gray-800">{productosFaltantes.length}</strong> productos faltantes encontrados
                  {productosFaltantes.length > limitPerPage && (
                    <span className="ml-1 text-gray-400">
                      · mostrando {Math.min(limitPerPage, productosFaltantes.length - idxFirst)} en esta página
                    </span>
                  )}
                </span>
                {selectedIds.size > 0 && (
                  <span className="text-blue-600 font-medium">
                    {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Tabla ───────────────────────────────────────────────────── */}
          <div className="p-6">
            {loading ? (
              <div className="flex flex-col justify-center items-center h-64 gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-500">Cargando productos...</p>
              </div>
            ) : displayedProductos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50 rounded-xl">
                <ArchiveBoxIcon className="h-20 w-20 text-gray-200 mb-4" />
                {activeFilters > 0 ? (
                  <>
                    <p className="text-base font-medium text-gray-600">No hay resultados para estos filtros</p>
                    <button onClick={clearFilters} className="mt-2 text-sm text-blue-600 hover:underline">
                      Limpiar filtros
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-base font-medium text-gray-600">¡Sin productos faltantes!</p>
                    <p className="text-sm mt-1">Todo el inventario está sobre el umbral.</p>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl ring-1 ring-gray-200 shadow-sm overflow-y-auto max-h-[65vh]">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        {/* Checkbox select all */}
                        <th className="border border-gray-200 px-3 py-2.5 text-center w-10">
                          <input
                            type="checkbox"
                            checked={allPageSelected}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            title="Seleccionar página actual"
                          />
                        </th>
                        <th className="border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-center whitespace-nowrap">CÓDIGO</th>
                        <th className="border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left whitespace-nowrap">NOMBRE</th>
                        <th className="border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-center whitespace-nowrap">MARCA</th>
                        <th className="border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-center whitespace-nowrap">MEDIDA</th>
                        <th className="border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-center whitespace-nowrap">UBICACIÓN</th>
                        <th className="border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left whitespace-nowrap">PROVEEDOR PRINCIPAL</th>
                        <th className="border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left whitespace-nowrap">TODOS LOS PROVEEDORES</th>
                        <th className="border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-center whitespace-nowrap">STOCK</th>
                        <th className="border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-center whitespace-nowrap">UMBRAL</th>
                        <th className="border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-center whitespace-nowrap">P. COMPRA</th>
                        <th className="border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-center whitespace-nowrap">P. VENTA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedProductos.map((producto, index) => {
                        const stock = producto.stockActual || 0;
                        const umbral = producto.stockReferencialUmbral || 0;
                        const isSelected = selectedIds.has(producto.id);

                        return (
                          <tr
                            key={producto.id}
                            className={`transition-colors ${
                              isSelected
                                ? 'bg-blue-50 hover:bg-blue-100'
                                : index % 2 === 0
                                  ? 'bg-white hover:bg-gray-50'
                                  : 'bg-gray-50/50 hover:bg-gray-100'
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="border border-gray-200 px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(producto.id)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>

                            {/* CÓDIGO */}
                            <td className="border border-gray-200 px-3 py-2 text-center">
                              <span className="font-mono text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">
                                {producto.codigoTienda || 'N/A'}
                              </span>
                            </td>

                            {/* NOMBRE */}
                            <td className="border border-gray-200 whitespace-nowrap px-3 py-2 text-left">
                              <span className="font-medium text-gray-900">
                                {producto.nombre || 'N/A'}
                              </span>
                            </td>

                            {/* MARCA */}
                            <td className="border border-gray-200 px-3 py-2 text-center text-gray-600">
                              {producto.marca || '—'}
                            </td>

                            {/* MEDIDA */}
                            <td className="border border-gray-200 px-3 py-2 text-center text-gray-600">
                              {producto.medida || '—'}
                            </td>

                            {/* UBICACIÓN */}
                            <td className="border border-gray-200 px-3 py-2 text-center text-gray-600">
                              {producto.ubicacion || '—'}
                            </td>

                            {/* PROVEEDOR PRINCIPAL */}
                            <td className="border border-gray-200 px-3 py-2 text-left">
                              <div className="flex items-center gap-1">
                                <BuildingStorefrontIcon className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                                <span className="text-blue-700 text-xs font-medium">
                                  {getProveedorNombre(producto)}
                                </span>
                              </div>
                            </td>

                            {/* TODOS LOS PROVEEDORES */}
                            <td className="border border-gray-200 px-3 py-2 text-left max-w-[180px]">
                              <span
                                className="text-xs text-gray-500 truncate block"
                                title={getProveedoresTodos(producto)}
                              >
                                {getProveedoresTodos(producto)}
                              </span>
                            </td>

                            {/* STOCK */}
                            <td className="border border-gray-200 px-3 py-2 text-center">
                              <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                stock === 0
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}>
                                {stock}
                              </span>
                            </td>

                            {/* UMBRAL */}
                            <td className="border border-gray-200 px-3 py-2 text-center text-gray-500 text-xs">
                              {umbral}
                            </td>

                            {/* PRECIO COMPRA */}
                            <td className="border border-gray-200 whitespace-nowrap px-3 py-2 text-center text-gray-700 text-xs">
                              S/. {fmt(producto.precioCompraDefault)}
                            </td>

                            {/* PRECIO VENTA */}
                            <td className="border border-gray-200 whitespace-nowrap px-3 py-2 text-center text-gray-700 text-xs">
                              S/. {fmt(producto.precioVentaDefault)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Paginación ─────────────────────────────────────────── */}
                {productosFaltantes.length > limitPerPage && (
                  <div className="flex justify-between items-center mt-4">
                    <p className="text-sm text-gray-600">
                      Mostrando{' '}
                      <span className="font-semibold">{idxFirst + 1}</span> –{' '}
                      <span className="font-semibold">{Math.min(idxLast, productosFaltantes.length)}</span>{' '}
                      de <span className="font-semibold">{productosFaltantes.length}</span> productos
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                      </button>
                      <span className="text-sm text-gray-600 px-2">
                        Página <span className="font-semibold">{currentPage}</span> de <span className="font-semibold">{totalPages}</span>
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── FAB: Botón flotante de selección ────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700">
          <span className="text-sm font-medium">
            <span className="text-blue-400 font-bold">{selectedIds.size}</span> producto{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={openConfirmModal}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <ShoppingCartIcon className="h-4 w-4" />
            Crear Ingreso
          </button>
          <button
            onClick={clearSelection}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            title="Limpiar selección"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Modal de Confirmación de Cantidades ──────────────────────────── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowConfirmModal(false)}
            />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
              {/* Header modal */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50">
                    <ShoppingCartIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Confirmar cantidades</h3>
                    <p className="text-xs text-gray-500">{draftItems.length} producto{draftItems.length !== 1 ? 's' : ''} · Ajusta las cantidades antes de crear el ingreso</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              {/* Tabla de productos */}
              <div className="px-6 py-4 max-h-[55vh] overflow-y-auto">
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 border-b border-gray-200">PRODUCTO</th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">STOCK / UMBRAL</th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 border-b border-gray-200">DÉFICIT</th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 border-b border-gray-200">P. COMPRA</th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 border-b border-gray-200 w-28">CANTIDAD A INGRESAR</th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">SUBTOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {draftItems.map((item, idx) => {
                        const subtotal = item.cantidad * parseFloat(item.producto.precioCompraDefault || 0);
                        const deficit = (item.producto.stockReferencialUmbral || 0) - (item.producto.stockActual || 0);
                        return (
                          <tr key={item.producto.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900 text-sm">{item.producto.nombre}</div>
                              <div className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                                {item.producto.codigoTienda && (
                                  <span className="font-mono">{item.producto.codigoTienda}</span>
                                )}
                                {item.producto.marca && <span>{item.producto.marca}</span>}
                                {item.producto.medida && <span>{item.producto.medida}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-orange-600 font-bold">{item.producto.stockActual || 0}</span>
                              <span className="text-gray-400 mx-1">/</span>
                              <span className="text-gray-500">{item.producto.stockReferencialUmbral || 0}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">
                                -{deficit}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-600 text-xs">
                              S/. {fmt(item.producto.precioCompraDefault)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="number"
                                min="1"
                                value={item.cantidad}
                                onChange={(e) => handleDraftCantidad(idx, e.target.value)}
                                onWheel={(e) => e.target.blur()}
                                className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-gray-800 text-sm">
                              S/. {subtotal.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Total */}
                <div className="mt-4 flex justify-end">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 flex items-center gap-4">
                    <span className="text-sm font-medium text-blue-700">Total estimado:</span>
                    <span className="text-2xl font-bold text-blue-800">
                      S/. {draftItems.reduce((sum, item) =>
                        sum + item.cantidad * parseFloat(item.producto.precioCompraDefault || 0), 0
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer modal */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCrearIngreso}
                  className="inline-flex items-center gap-2 px-6 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
                >
                  <CheckIcon className="h-4 w-4" />
                  Crear Ingreso con {draftItems.length} producto{draftItems.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ProductosFaltantesPage;