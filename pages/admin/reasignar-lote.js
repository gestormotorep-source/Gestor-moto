import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import {
  collection, getDocs, query, where, orderBy,
  doc, getDoc, updateDoc, limit, serverTimestamp
} from 'firebase/firestore';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CubeIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';

const fmt = (v) => parseFloat(v || 0).toFixed(2);

function formatFecha(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Buscar lotes por número ─────────────────────────────────────────────────
async function buscarLotes(termino) {
  if (!termino.trim()) return [];
  const upper = termino.trim().toUpperCase();
  const results = new Map();
  const snaps = await Promise.all([
    getDocs(query(collection(db, 'lotes'), where('numeroLote', '>=', upper), where('numeroLote', '<=', upper + '\uf8ff'), limit(20))),
    getDocs(query(collection(db, 'lotes'), where('numeroLote', '==', upper), limit(5))),
  ]);
  snaps.forEach(snap => snap.docs.forEach(d => {
    if (!results.has(d.id)) results.set(d.id, { id: d.id, ...d.data() });
  }));
  return Array.from(results.values());
}

// ─── Buscar productos (mismo algoritmo que NuevaVentaPage) ───────────────────
async function buscarProductos(term) {
  if (!term.trim()) return [];
  const idsVistos = new Set();
  let candidatos = [];
  const termUpper = term.trim().toUpperCase();
  const palabras = termUpper.split(/[\s\-\/\.]+/).filter(p => p.length >= 1);

  if (palabras.length > 0) {
    const queries = palabras.flatMap(palabra => [
      getDocs(query(collection(db, 'productos'), where('palabrasClave', 'array-contains', palabra), limit(100))),
      getDocs(query(collection(db, 'productos'), where('nombre', '>=', palabra), where('nombre', '<=', palabra + '\uf8ff'), limit(50))),
    ]);
    queries.push(
      getDocs(query(collection(db, 'productos'), where('codigoTienda', '==', termUpper), limit(5))),
      getDocs(query(collection(db, 'productos'), where('codigoProveedor', '==', termUpper), limit(5))),
      getDocs(query(collection(db, 'productos'), where('codigoProveedor', '>=', termUpper), where('codigoProveedor', '<=', termUpper + '\uf8ff'), limit(20))),
    );
    const resultados = await Promise.all(queries);
    resultados.forEach(snap => snap.docs.forEach(d => {
      if (!idsVistos.has(d.id)) { idsVistos.add(d.id); candidatos.push({ id: d.id, ...d.data() }); }
    }));
    candidatos = candidatos.filter(p => {
      const n = (p.nombre || '').toUpperCase();
      const claves = (p.palabrasClave || []);
      const ct = (p.codigoTienda || '').toUpperCase();
      const cp = (p.codigoProveedor || '').toUpperCase();
      return palabras.every(palabra =>
        n.includes(palabra) || claves.some(c => c.includes(palabra)) ||
        ct.includes(palabra) || cp.includes(palabra)
      );
    });
  }
  return candidatos.slice(0, 15);
}

// ─── Tarjeta de producto ─────────────────────────────────────────────────────
function ProductoCard({ producto, highlight, onSelect, selected, label }) {
  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border p-4 transition-all ${
        selected
          ? 'border-indigo-500 bg-indigo-50 shadow-md'
          : highlight
          ? 'border-red-300 bg-red-50'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm cursor-pointer'
      } ${onSelect ? 'cursor-pointer' : ''}`}
    >
      {label && (
        <div className={`text-xs font-bold uppercase tracking-wide mb-2 ${
          selected ? 'text-indigo-600' : highlight ? 'text-red-600' : 'text-gray-400'
        }`}>
          {label}
        </div>
      )}
      <div className="font-bold text-gray-900 text-sm">{producto.nombre}</div>
      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
        {producto.codigoProveedor && <span>C. Prov: <span className="font-mono font-semibold text-gray-700">{producto.codigoProveedor}</span></span>}
        {producto.codigoTienda    && <span>C. Tienda: <span className="font-mono font-semibold text-gray-700">{producto.codigoTienda}</span></span>}
        {producto.marca           && <span>Marca: <span className="font-semibold text-gray-700">{producto.marca}</span></span>}
        {producto.medida          && <span>{producto.medida}</span>}
      </div>
      <div className="mt-2 flex gap-3 text-xs">
        <span className="text-gray-500">Stock: <span className="font-bold text-gray-800">{producto.stockActual ?? 0}</span></span>
        <span className="text-gray-500">P. Venta: <span className="font-bold text-gray-800">S/. {fmt(producto.precioVentaDefault)}</span></span>
      </div>
      <div className="text-xs text-gray-300 font-mono mt-1 truncate">{producto.id}</div>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function ReasignarLote() {
  // ── Búsqueda de lote ──
  const [loteTerm, setLoteTerm]           = useState('');
  const [lotesFound, setLotesFound]       = useState([]);
  const [buscandoLote, setBuscandoLote]   = useState(false);
  const [showLoteDD, setShowLoteDD]       = useState(false);
  const [loteSeleccionado, setLoteSelec]  = useState(null);
  const [productoActual, setProductoAct]  = useState(null);
  const [cargandoLote, setCargandoLote]   = useState(false);

  // ── Búsqueda de producto destino ──
  const [prodTerm, setProdTerm]               = useState('');
  const [prodFound, setProdFound]             = useState([]);
  const [buscandoProd, setBuscandoProd]       = useState(false);
  const [showProdDD, setShowProdDD]           = useState(false);
  const [productoDestino, setProductoDest]    = useState(null);

  // ── Estado ──
  const [guardando, setGuardando]   = useState(false);
  const [exito, setExito]           = useState(false);
  const [error, setError]           = useState(null);

  // ── Debounce búsqueda lote ──
  useEffect(() => {
    if (!loteTerm.trim() || loteSeleccionado) { setLotesFound([]); setShowLoteDD(false); return; }
    const t = setTimeout(async () => {
      setBuscandoLote(true);
      try {
        const res = await buscarLotes(loteTerm);
        setLotesFound(res); setShowLoteDD(true);
      } catch { setError('Error buscando lotes'); }
      finally { setBuscandoLote(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [loteTerm, loteSeleccionado]);

  // ── Debounce búsqueda producto ──
  useEffect(() => {
    if (!prodTerm.trim() || productoDestino) { setProdFound([]); setShowProdDD(false); return; }
    const t = setTimeout(async () => {
      setBuscandoProd(true);
      try {
        const res = await buscarProductos(prodTerm);
        setProdFound(res); setShowProdDD(true);
      } catch { setError('Error buscando productos'); }
      finally { setBuscandoProd(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [prodTerm, productoDestino]);

  // ── Seleccionar lote ──
  const handleSelectLote = async (lote) => {
    setLoteSelec(lote);
    setLoteTerm(lote.numeroLote || lote.id);
    setShowLoteDD(false);
    setLotesFound([]);
    setProductoAct(null);
    setProductoDest(null);
    setProdTerm('');
    setExito(false);
    setError(null);
    setCargandoLote(true);
    try {
      if (lote.productoId) {
        const snap = await getDoc(doc(db, 'productos', lote.productoId));
        if (snap.exists()) setProductoAct({ id: snap.id, ...snap.data() });
        else setProductoAct({ id: lote.productoId, nombre: '⚠ Producto no encontrado', _notFound: true });
      }
    } catch { setProductoAct(null); }
    finally { setCargandoLote(false); }
  };

  // ── Seleccionar producto destino ──
  const handleSelectProducto = (prod) => {
    setProductoDest(prod);
    setProdTerm(prod.nombre + (prod.codigoProveedor ? ' · ' + prod.codigoProveedor : ''));
    setShowProdDD(false);
    setProdFound([]);
  };

  // ── Reasignar ──
  const handleReasignar = async () => {
    if (!loteSeleccionado || !productoDestino) return;
    if (loteSeleccionado.productoId === productoDestino.id) {
      setError('El lote ya está asignado a ese producto.');
      return;
    }
    if (!window.confirm(
      `¿Confirmas reasignar el lote ${loteSeleccionado.numeroLote} del producto actual al producto "${productoDestino.nombre}" (${productoDestino.codigoProveedor || productoDestino.id})?\n\nEsto también actualizará el stock de ambos productos.`
    )) return;

    setGuardando(true);
    setError(null);
    try {
      const stockLote = parseInt(loteSeleccionado.stockRestante || 0);

      // 1. Actualizar el lote con el nuevo productoId
      await updateDoc(doc(db, 'lotes', loteSeleccionado.id), {
        productoId:      productoDestino.id,
        nombreProducto:  productoDestino.nombre,
        updatedAt:       serverTimestamp(),
        _reasignadoDe:   loteSeleccionado.productoId, // auditoría
        _reasignadoAt:   serverTimestamp(),
      });

      // 2. Restar stock del producto original (si existe y tiene stock)
      if (productoActual && !productoActual._notFound && stockLote > 0) {
        const stockOriginal = parseInt(productoActual.stockActual || 0);
        await updateDoc(doc(db, 'productos', productoActual.id), {
          stockActual: Math.max(0, stockOriginal - stockLote),
          updatedAt:   serverTimestamp(),
        });
      }

      // 3. Sumar stock al producto destino
      if (stockLote > 0) {
        const snapDest = await getDoc(doc(db, 'productos', productoDestino.id));
        const stockDest = parseInt(snapDest.data()?.stockActual || 0);
        await updateDoc(doc(db, 'productos', productoDestino.id), {
          stockActual: stockDest + stockLote,
          updatedAt:   serverTimestamp(),
        });
      }

      setExito(true);

      // Actualizar estado local del lote
      setLoteSelec(prev => ({ ...prev, productoId: productoDestino.id }));
      setProductoAct(productoDestino);

    } catch (err) {
      setError('Error al reasignar: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const mismoProd = loteSeleccionado && productoDestino &&
    loteSeleccionado.productoId === productoDestino.id;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="p-2 bg-orange-600 rounded-lg">
            <ArrowsRightLeftIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Reasignar Lote a Producto</h1>
            <p className="text-sm text-gray-500">Admin — Corrige lotes asignados al producto equivocado</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

        {/* Aviso */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-800">
          <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-amber-500 mt-0.5" />
          <div>
            <span className="font-bold">Úsalo solo para corregir errores.</span> Al reasignar, el stock del lote
            se resta del producto original y se suma al producto destino. Los movimientos y ventas anteriores
            no se modifican — solo el lote y el stock.
          </div>
        </div>

        {/* PASO 1: Buscar lote */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 relative">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">1</div>
            <h2 className="font-semibold text-gray-800">Buscar el lote a corregir</h2>
          </div>

          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={loteTerm}
              onChange={e => { setLoteTerm(e.target.value); if (loteSeleccionado) { setLoteSelec(null); setProductoAct(null); setProductoDest(null); setExito(false); } }}
              placeholder="Número de lote: L260109-VJEN..."
              className="w-full pl-12 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm font-mono"
            />
            {loteTerm && (
              <button onClick={() => { setLoteTerm(''); setLoteSelec(null); setProductoAct(null); setProductoDest(null); setExito(false); setError(null); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Dropdown lotes */}
          {showLoteDD && (
            <div className="absolute left-6 right-6 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
              {buscandoLote ? (
                <div className="flex items-center justify-center py-5 gap-2 text-gray-500 text-sm">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" /> Buscando...
                </div>
              ) : lotesFound.length === 0 ? (
                <div className="py-5 text-center text-gray-400 text-sm">No se encontraron lotes</div>
              ) : lotesFound.map(lote => (
                <button key={lote.id} onClick={() => handleSelectLote(lote)}
                  className="w-full text-left px-4 py-3 hover:bg-orange-50 border-b border-gray-100 last:border-0 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold font-mono text-sm text-gray-900">{lote.numeroLote || lote.id}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {lote.nombreProducto || lote.productoId}
                        {lote.fechaIngreso?.toDate && <span className="ml-2">· {formatFecha(lote.fechaIngreso)}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        lote.estado === 'activo' ? 'bg-green-100 text-green-700' :
                        lote.estado === 'agotado' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                      }`}>{lote.estado || 'activo'}</span>
                      <div className="text-xs text-gray-400 mt-1">Stock: {lote.stockRestante ?? 0}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Info del lote seleccionado */}
          {loteSeleccionado && (
            <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-gray-400 mb-0.5">Número lote</div>
                  <div className="font-bold font-mono text-gray-800">{loteSeleccionado.numeroLote}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Estado</div>
                  <div className={`font-semibold ${loteSeleccionado.estado === 'activo' ? 'text-green-600' : 'text-red-600'}`}>
                    {loteSeleccionado.estado || 'activo'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Stock restante</div>
                  <div className="font-bold text-gray-800">{loteSeleccionado.stockRestante ?? 0}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Fecha ingreso</div>
                  <div className="font-medium text-gray-700">{formatFecha(loteSeleccionado.fechaIngreso)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">P. Compra</div>
                  <div className="font-medium text-gray-700">S/. {fmt(loteSeleccionado.precioCompraUnitario)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">P. Venta</div>
                  <div className="font-medium text-gray-700">S/. {fmt(loteSeleccionado.precioVentaUnitario)}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-gray-400 mb-0.5">productoId actual</div>
                  <div className="font-mono text-gray-600 text-xs truncate">{loteSeleccionado.productoId}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PASO 2: Producto actual */}
        {loteSeleccionado && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">2</div>
              <h2 className="font-semibold text-gray-800">Producto asignado actualmente <span className="text-red-500">(incorrecto)</span></h2>
            </div>
            {cargandoLote ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-3">
                <ArrowPathIcon className="h-4 w-4 animate-spin" /> Cargando producto...
              </div>
            ) : productoActual ? (
              <ProductoCard producto={productoActual} highlight label="Producto ACTUAL (equivocado)" />
            ) : (
              <div className="text-sm text-gray-400 italic">Sin productoId asignado en el lote</div>
            )}
          </div>
        )}

        {/* PASO 3: Producto destino */}
        {loteSeleccionado && !exito && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center">3</div>
              <h2 className="font-semibold text-gray-800">Buscar el producto correcto</h2>
            </div>

            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={prodTerm}
                onChange={e => { setProdTerm(e.target.value); if (productoDestino) setProductoDest(null); }}
                placeholder="Nombre, código proveedor, marca..."
                className="w-full pl-12 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent text-sm"
              />
              {prodTerm && (
                <button onClick={() => { setProdTerm(''); setProductoDest(null); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Dropdown productos */}
            {showProdDD && (
              <div className="absolute left-6 right-6 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
                {buscandoProd ? (
                  <div className="flex items-center justify-center py-5 gap-2 text-gray-500 text-sm">
                    <ArrowPathIcon className="h-4 w-4 animate-spin" /> Buscando...
                  </div>
                ) : prodFound.length === 0 ? (
                  <div className="py-5 text-center text-gray-400 text-sm">No se encontraron productos</div>
                ) : prodFound.map(prod => (
                  <button key={prod.id} onClick={() => handleSelectProducto(prod)}
                    className="w-full text-left px-4 py-3 hover:bg-green-50 border-b border-gray-100 last:border-0 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-sm text-gray-900">{prod.nombre}</div>
                        <div className="text-xs text-gray-500 flex gap-3 flex-wrap mt-0.5">
                          {prod.codigoProveedor && <span>C.Prov: <span className="font-mono font-semibold">{prod.codigoProveedor}</span></span>}
                          {prod.marca && <span>{prod.marca}</span>}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 flex-shrink-0">Stock: {prod.stockActual ?? 0}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Producto destino seleccionado */}
            {productoDestino && (
              <div className="mt-4">
                <ProductoCard
                  producto={productoDestino}
                  selected
                  label="Producto CORRECTO (destino)"
                />
                {mismoProd && (
                  <p className="text-sm text-amber-600 mt-2 font-medium">
                    ⚠ Este lote ya está asignado a ese producto.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* PASO 4: Confirmar */}
        {loteSeleccionado && productoDestino && !mismoProd && !exito && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">4</div>
              <h2 className="font-semibold text-gray-800">Confirmar reasignación</h2>
            </div>

            {/* Resumen visual */}
            <div className="flex items-center gap-3 flex-wrap mb-5">
              <div className="flex-1 min-w-0 bg-red-50 border border-red-200 rounded-xl p-3">
                <div className="text-xs text-red-500 font-bold mb-1">DE (actual)</div>
                <div className="font-semibold text-sm text-gray-800 truncate">{productoActual?.nombre || '—'}</div>
                <div className="text-xs text-gray-500 font-mono">{productoActual?.codigoProveedor || '—'}</div>
              </div>
              <ArrowRightIcon className="h-6 w-6 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0 bg-green-50 border border-green-200 rounded-xl p-3">
                <div className="text-xs text-green-600 font-bold mb-1">A (correcto)</div>
                <div className="font-semibold text-sm text-gray-800 truncate">{productoDestino.nombre}</div>
                <div className="text-xs text-gray-500 font-mono">{productoDestino.codigoProveedor || '—'}</div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 text-xs text-gray-600 mb-5 space-y-1">
              <div>• Lote <span className="font-mono font-bold">{loteSeleccionado.numeroLote}</span> se reasignará al producto correcto</div>
              <div>• Stock <span className="font-bold">{loteSeleccionado.stockRestante ?? 0} uds</span> se restará de <span className="font-semibold">{productoActual?.nombre}</span></div>
              <div>• Stock <span className="font-bold">{loteSeleccionado.stockRestante ?? 0} uds</span> se sumará a <span className="font-semibold">{productoDestino.nombre}</span></div>
              <div>• Las ventas anteriores <span className="font-bold text-amber-700">no se modifican</span></div>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 text-sm">
                <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={handleReasignar}
              disabled={guardando}
              className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {guardando ? (
                <><ArrowPathIcon className="h-5 w-5 animate-spin" /> Reasignando...</>
              ) : (
                <><ArrowsRightLeftIcon className="h-5 w-5" /> Confirmar Reasignación</>
              )}
            </button>
          </div>
        )}

        {/* Éxito */}
        {exito && (
          <div className="bg-green-50 border border-green-300 rounded-2xl p-6 text-center">
            <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h3 className="font-bold text-green-800 text-lg mb-1">¡Lote reasignado correctamente!</h3>
            <p className="text-sm text-green-700 mb-4">
              El lote <span className="font-mono font-bold">{loteSeleccionado?.numeroLote}</span> ahora pertenece a <span className="font-bold">{productoActual?.nombre}</span>.
              El stock fue actualizado en ambos productos.
            </p>
            <button
              onClick={() => { setLoteTerm(''); setLoteSelec(null); setProductoAct(null); setProductoDest(null); setProdTerm(''); setExito(false); setError(null); }}
              className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              Reasignar otro lote
            </button>
          </div>
        )}

        {/* Estado inicial */}
        {!loteSeleccionado && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-16 text-center">
            <ArrowsRightLeftIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-500 mb-1">Busca el lote a corregir</h3>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Escribe el número de lote para comenzar. Luego seleccionas el producto correcto y confirmas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}