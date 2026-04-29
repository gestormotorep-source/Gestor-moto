import { useState } from 'react';
import { db } from '../../lib/firebase';
import {
  collection, getDocs, query, where, orderBy,
  doc, getDoc, limit
} from 'firebase/firestore';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CubeIcon,
  ShoppingCartIcon,
  ArrowUturnLeftIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
  DocumentMagnifyingGlassIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

const fmt = (v) => parseFloat(v || 0).toFixed(2);

function formatFecha(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

// Íconos y colores por tipo de movimiento
function tipoMeta(tipo) {
  const map = {
    venta:       { label: 'Venta',       color: 'text-red-600',    bg: 'bg-red-50   border-red-200',   icon: ShoppingCartIcon,       dot: 'bg-red-500'    },
    devolucion:  { label: 'Devolución',  color: 'text-green-600',  bg: 'bg-green-50 border-green-200', icon: ArrowUturnLeftIcon,     dot: 'bg-green-500'  },
    ajuste:      { label: 'Ajuste',      color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200', icon: WrenchScrewdriverIcon,  dot: 'bg-amber-500'  },
    ingreso:     { label: 'Ingreso',     color: 'text-blue-600',   bg: 'bg-blue-50  border-blue-200',  icon: CubeIcon,               dot: 'bg-blue-500'   },
  };
  return map[tipo] || { label: tipo || 'Movimiento', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', icon: ClockIcon, dot: 'bg-gray-400' };
}

// ─── Buscar lotes por número de lote o productoId ────────────────────────────
async function buscarLotes(termino) {
  if (!termino.trim()) return [];
  const upper = termino.trim().toUpperCase();
  const results = new Map();

  const queries = [
    getDocs(query(collection(db, 'lotes'), where('numeroLote', '>=', upper), where('numeroLote', '<=', upper + '\uf8ff'), limit(20))),
    getDocs(query(collection(db, 'lotes'), where('numeroLote', '==', upper), limit(5))),
  ];

  const snaps = await Promise.all(queries);
  snaps.forEach(snap => {
    snap.docs.forEach(d => {
      if (!results.has(d.id)) results.set(d.id, { id: d.id, ...d.data() });
    });
  });

  return Array.from(results.values());
}

// ─── Cargar datos completos de un lote ──────────────────────────────────────
async function cargarAuditoriaLote(loteId) {
  // 1. Datos del lote
  const loteSnap = await getDoc(doc(db, 'lotes', loteId));
  if (!loteSnap.exists()) throw new Error('Lote no encontrado');
  const lote = { id: loteSnap.id, ...loteSnap.data() };

  // 2. Datos del producto
  let producto = null;
  if (lote.productoId) {
    const prodSnap = await getDoc(doc(db, 'productos', lote.productoId));
    if (prodSnap.exists()) producto = { id: prodSnap.id, ...prodSnap.data() };
  }

  // 3. Movimientos del lote
  let movimientos = [];
  try {
    const movSnap = await getDocs(query(
      collection(db, 'movimientosLotes'),
      where('loteId', '==', loteId),
      orderBy('fechaMovimiento', 'asc')
    ));
    movimientos = movSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // Si no hay índice, intentar sin orderBy
    try {
      const movSnap2 = await getDocs(query(
        collection(db, 'movimientosLotes'),
        where('loteId', '==', loteId)
      ));
      movimientos = movSnap2.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const fa = a.fechaMovimiento?.toMillis?.() ?? 0;
          const fb = b.fechaMovimiento?.toMillis?.() ?? 0;
          return fa - fb;
        });
    } catch { movimientos = []; }
  }

  // 4. Verificar en itemsVenta (búsqueda directa por loteId en todos los items)
  let itemsEnVentas = [];
  try {
    const { collectionGroup } = await import('firebase/firestore');
    const itemsSnap = await getDocs(query(
      collectionGroup(db, 'itemsVenta'),
      where('loteId', '==', loteId)
    ));
    for (const itemDoc of itemsSnap.docs) {
      const ventaId = itemDoc.ref.parent.parent.id;
      const itemData = { id: itemDoc.id, ventaId, ...itemDoc.data() };
      // Cargar datos básicos de la venta
      try {
        const ventaSnap = await getDoc(doc(db, 'ventas', ventaId));
        if (ventaSnap.exists()) {
          itemData.ventaData = ventaSnap.data();
        }
      } catch { /* sin datos extra */ }
      itemsEnVentas.push(itemData);
    }
  } catch { /* collectionGroup no disponible o sin índice */ }

  return { lote, producto, movimientos, itemsEnVentas };
}

// ─── Componente tarjeta de movimiento ────────────────────────────────────────
function MovimientoCard({ mov, idx }) {
  const meta = tipoMeta(mov.tipoMovimiento);
  const Icon = meta.icon;
  const cantidad = parseFloat(mov.cantidadConsumida || mov.cantidad || 0);
  const esEgreso = ['venta', 'ajuste_baja'].includes(mov.tipoMovimiento);

  return (
    <div className="flex gap-4 items-start">
      {/* Línea de tiempo */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-8 h-8 rounded-full ${meta.dot} flex items-center justify-center shadow`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="w-0.5 bg-gray-200 flex-1 mt-1 min-h-4" />
      </div>

      {/* Contenido */}
      <div className={`flex-1 border rounded-xl p-4 mb-3 ${meta.bg}`}>
        <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase tracking-wide ${meta.color}`}>
              {meta.label}
            </span>
            {mov.ventaId && (
              <span className="text-xs text-gray-500 font-mono bg-white px-2 py-0.5 rounded border border-gray-200">
                Venta: {mov.numeroVenta || mov.ventaId?.slice(-8)}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400">{formatFecha(mov.fechaMovimiento || mov.createdAt)}</div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Cantidad</div>
            <div className={`font-bold text-base ${esEgreso ? 'text-red-600' : 'text-green-600'}`}>
              {esEgreso ? '−' : '+'}{cantidad}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Stock restante</div>
            <div className="font-semibold text-gray-800">{mov.stockRestanteLote ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">P. Compra unit.</div>
            <div className="font-medium text-gray-700">S/. {fmt(mov.precioCompraUnitario)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Empleado</div>
            <div className="font-medium text-gray-700 truncate">{mov.empleadoId || '—'}</div>
          </div>
        </div>

        {mov.ventaData && (
          <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600 flex flex-wrap gap-4">
            <span><span className="font-medium">Cliente:</span> {mov.ventaData.clienteNombre || '—'}</span>
            <span><span className="font-medium">Total venta:</span> S/. {fmt(mov.ventaData.totalVenta)}</span>
            <span><span className="font-medium">Estado:</span> {mov.ventaData.estado || '—'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tarjeta de item en venta (sin movimiento registrado) ────────────────────
function ItemVentaCard({ item }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center shadow">
          <ShoppingCartIcon className="w-4 h-4 text-white" />
        </div>
        <div className="w-0.5 bg-gray-200 flex-1 mt-1 min-h-4" />
      </div>
      <div className="flex-1 border rounded-xl p-4 mb-3 bg-orange-50 border-orange-200">
        <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-orange-600">
              Venta (itemsVenta)
            </span>
            <span className="text-xs text-gray-500 font-mono bg-white px-2 py-0.5 rounded border border-gray-200">
              {item.ventaData?.numeroVenta || item.ventaId?.slice(-8)}
            </span>
            <span className="text-xs bg-orange-200 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              Sin movimiento registrado
            </span>
          </div>
          <div className="text-xs text-gray-400">{formatFecha(item.ventaData?.fechaVenta)}</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Cantidad vendida</div>
            <div className="font-bold text-base text-red-600">−{item.cantidad}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">P. Venta unit.</div>
            <div className="font-medium text-gray-700">S/. {fmt(item.precioVentaUnitario)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Subtotal</div>
            <div className="font-medium text-gray-700">S/. {fmt(item.subtotal)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Cliente</div>
            <div className="font-medium text-gray-700 truncate">{item.ventaData?.clienteNombre || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function AuditarLote() {
  const [searchTerm, setSearchTerm] = useState('');
  const [lotesEncontrados, setLotesEncontrados] = useState([]);
  const [buscandoLotes, setBuscandoLotes] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const [auditoria, setAuditoria] = useState(null); // { lote, producto, movimientos, itemsEnVentas }
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (term) => {
    setSearchTerm(term);
    setAuditoria(null);
    if (!term.trim()) { setLotesEncontrados([]); setShowDropdown(false); return; }
    setBuscandoLotes(true);
    try {
      const res = await buscarLotes(term);
      setLotesEncontrados(res);
      setShowDropdown(true);
    } catch (err) {
      setError('Error buscando lotes: ' + err.message);
    } finally {
      setBuscandoLotes(false);
    }
  };

  const handleSelectLote = async (lote) => {
    setSearchTerm(lote.numeroLote || lote.id);
    setShowDropdown(false);
    setLotesEncontrados([]);
    setError(null);
    setCargando(true);
    try {
      const result = await cargarAuditoriaLote(lote.id);
      setAuditoria(result);
    } catch (err) {
      setError('Error cargando auditoría: ' + err.message);
    } finally {
      setCargando(false);
    }
  };

  const handleClear = () => {
    setSearchTerm('');
    setAuditoria(null);
    setLotesEncontrados([]);
    setShowDropdown(false);
    setError(null);
  };

  // Calcular balance
  const totalConsumido = auditoria
    ? auditoria.movimientos
        .filter(m => m.tipoMovimiento === 'venta')
        .reduce((s, m) => s + parseFloat(m.cantidadConsumida || 0), 0)
    : 0;

  const totalDevuelto = auditoria
    ? auditoria.movimientos
        .filter(m => m.tipoMovimiento === 'devolucion')
        .reduce((s, m) => s + parseFloat(m.cantidadConsumida || m.cantidad || 0), 0)
    : 0;

  const stockInicial = auditoria ? parseFloat(auditoria.lote.stockInicial || auditoria.lote.cantidadIngresada || 0) : 0;
  const stockActual  = auditoria ? parseFloat(auditoria.lote.stockRestante || 0) : 0;
  const discrepancia = auditoria ? stockInicial - totalConsumido + totalDevuelto - stockActual : 0;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="p-2 bg-slate-800 rounded-lg">
            <DocumentMagnifyingGlassIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Auditoría de Lote</h1>
            <p className="text-sm text-gray-500">Admin — Rastrea todos los movimientos de un lote específico</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Buscador */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6 relative">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Buscar por número de lote
          </label>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Ej: L260109-VJEN, L260116..."
              className="w-full pl-12 pr-12 py-3.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm font-mono"
            />
            {searchTerm && (
              <button onClick={handleClear} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Dropdown lotes */}
          {showDropdown && (
            <div className="absolute left-6 right-6 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-72 overflow-y-auto">
              {buscandoLotes ? (
                <div className="flex items-center justify-center py-6 gap-2 text-gray-500 text-sm">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" /> Buscando...
                </div>
              ) : lotesEncontrados.length === 0 ? (
                <div className="py-6 text-center text-gray-400 text-sm">No se encontraron lotes</div>
              ) : (
                lotesEncontrados.map(lote => (
                  <button
                    key={lote.id}
                    onClick={() => handleSelectLote(lote)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-gray-100 last:border-0 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold font-mono text-gray-900">{lote.numeroLote || lote.id}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {lote.nombreProducto || lote.productoId}
                          {lote.fechaIngreso?.toDate && (
                            <span className="ml-2">· {lote.fechaIngreso.toDate().toLocaleDateString('es-PE')}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          lote.estado === 'activo' ? 'bg-green-100 text-green-700' :
                          lote.estado === 'agotado' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {lote.estado || 'activo'}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">Stock: {lote.stockRestante ?? 0} / {lote.stockInicial ?? lote.cantidadIngresada ?? '?'}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 text-sm">
            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Cargando */}
        {cargando && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <ArrowPathIcon className="h-8 w-8 animate-spin mb-3 text-slate-500" />
            <p className="text-sm">Cargando auditoría del lote...</p>
          </div>
        )}

        {/* Resultado */}
        {auditoria && !cargando && (
          <>
            {/* Info del lote */}
            <div className="bg-slate-800 text-white rounded-2xl p-5 mb-5">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Lote</div>
                  <div className="font-bold text-xl font-mono">{auditoria.lote.numeroLote || auditoria.lote.id}</div>
                  {auditoria.producto && (
                    <div className="text-slate-300 text-sm mt-1">
                      {auditoria.producto.nombre}
                      {auditoria.producto.marca ? ' · ' + auditoria.producto.marca : ''}
                    </div>
                  )}
                  <div className="text-slate-400 text-xs mt-1">
                    Ingreso: {formatFecha(auditoria.lote.fechaIngreso)}
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="text-slate-400 text-xs mb-1">Stock inicial</div>
                    <div className="text-2xl font-bold">{auditoria.lote.stockInicial ?? auditoria.lote.cantidadIngresada ?? '?'}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-xs mb-1">Stock actual</div>
                    <div className={`text-2xl font-bold ${stockActual === 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {stockActual}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-xs mb-1">Estado</div>
                    <div className={`text-sm font-bold px-3 py-1 rounded-full mt-1 ${
                      auditoria.lote.estado === 'activo' ? 'bg-green-500/20 text-green-400' :
                      auditoria.lote.estado === 'agotado' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {auditoria.lote.estado || 'activo'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Balance */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <div className="text-xs text-gray-500 mb-1">Vendido</div>
                <div className="text-2xl font-bold text-red-600">−{totalConsumido}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <div className="text-xs text-gray-500 mb-1">Devuelto</div>
                <div className="text-2xl font-bold text-green-600">+{totalDevuelto}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <div className="text-xs text-gray-500 mb-1">Movimientos</div>
                <div className="text-2xl font-bold text-slate-700">{auditoria.movimientos.length}</div>
              </div>
              <div className={`rounded-xl border p-4 text-center ${
                Math.abs(discrepancia) > 0.01
                  ? 'bg-red-50 border-red-300'
                  : 'bg-green-50 border-green-300'
              }`}>
                <div className="text-xs text-gray-500 mb-1">Discrepancia</div>
                <div className={`text-2xl font-bold ${Math.abs(discrepancia) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                  {Math.abs(discrepancia) > 0.01 ? `⚠ ${discrepancia}` : '✓ 0'}
                </div>
              </div>
            </div>

            {/* Alerta discrepancia */}
            {Math.abs(discrepancia) > 0.01 && (
              <div className="mb-5 bg-amber-50 border border-amber-300 rounded-xl p-4 flex gap-3">
                <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <span className="font-bold">Discrepancia detectada.</span> Según los movimientos registrados, el stock debería ser{' '}
                  <strong>{stockInicial - totalConsumido + totalDevuelto}</strong>, pero el lote muestra <strong>{stockActual}</strong>.
                  Esto puede indicar que hubo ventas sin movimiento registrado, ajustes manuales en Firestore, o un error en el flujo de venta.
                </div>
              </div>
            )}

            {/* Timeline de movimientos */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
              <h2 className="font-bold text-gray-800 mb-5 flex items-center gap-2">
                <ClockIcon className="h-5 w-5 text-gray-400" />
                Movimientos en <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">movimientosLotes</code>
                <span className="ml-auto text-xs font-normal text-gray-400">{auditoria.movimientos.length} registros</span>
              </h2>

              {auditoria.movimientos.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <InformationCircleIcon className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm font-medium">No hay movimientos registrados en <code>movimientosLotes</code></p>
                  <p className="text-xs mt-1 text-gray-400">Las ventas antiguas pueden no haber escrito movimientos si el código no lo incluía aún.</p>
                </div>
              ) : (
                <div>
                  {auditoria.movimientos.map((mov, idx) => (
                    <MovimientoCard key={mov.id} mov={mov} idx={idx} />
                  ))}
                </div>
              )}
            </div>

            {/* Items encontrados en ventas via collectionGroup */}
            {auditoria.itemsEnVentas.length > 0 && (
              <div className="bg-white rounded-2xl border border-orange-200 p-6">
                <h2 className="font-bold text-gray-800 mb-5 flex items-center gap-2">
                  <ShoppingCartIcon className="h-5 w-5 text-orange-500" />
                  Encontrado en <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">itemsVenta</code>
                  <span className="ml-auto text-xs font-normal text-gray-400">{auditoria.itemsEnVentas.length} registros</span>
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  Estas ventas tienen este lote en sus items. Si no aparecen arriba en movimientosLotes, el stock fue consumido pero no se registró el movimiento.
                </p>
                {auditoria.itemsEnVentas.map((item, idx) => (
                  <ItemVentaCard key={item.id} item={item} />
                ))}
              </div>
            )}

            {/* Sin nada */}
            {auditoria.movimientos.length === 0 && auditoria.itemsEnVentas.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                <ExclamationTriangleIcon className="h-10 w-10 text-amber-400 mx-auto mb-2" />
                <p className="font-semibold text-amber-800">No se encontraron movimientos ni ventas para este lote.</p>
                <p className="text-sm text-amber-600 mt-1">
                  El stock puede haber sido modificado manualmente directamente en Firestore, o hubo un error al registrar la venta.
                </p>
              </div>
            )}
          </>
        )}

        {/* Estado inicial */}
        {!auditoria && !cargando && !error && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-20 text-center">
            <DocumentMagnifyingGlassIcon className="h-14 w-14 text-gray-300 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-500 text-lg mb-1">Busca un número de lote</h3>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Escribe el código del lote (ej: L260109-VJEN) para ver su historial completo de movimientos y en qué ventas aparece.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}