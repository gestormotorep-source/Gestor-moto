import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import {
  collection, getDocs, query, where, limit,
  doc, getDoc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import {
  MagnifyingGlassIcon, XMarkIcon, ArrowPathIcon,
  CheckCircleIcon, ExclamationTriangleIcon, AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

async function buscarProductos(term) {
  if (!term.trim()) return [];
  const upper = term.trim().toUpperCase();
  const palabras = upper.split(/[\s\-\/\.]+/).filter(p => p.length >= 1);
  const idsVistos = new Set();
  let candidatos = [];

  const queries = palabras.flatMap(p => [
    getDocs(query(collection(db, 'productos'), where('palabrasClave', 'array-contains', p), limit(100))),
    getDocs(query(collection(db, 'productos'), where('nombre', '>=', p), where('nombre', '<=', p + '\uf8ff'), limit(50))),
  ]);
  queries.push(
    getDocs(query(collection(db, 'productos'), where('codigoProveedor', '>=', upper), where('codigoProveedor', '<=', upper + '\uf8ff'), limit(20))),
    getDocs(query(collection(db, 'productos'), where('codigoTienda', '==', upper), limit(5))),
  );

  const snaps = await Promise.all(queries);
  snaps.forEach(snap => snap.docs.forEach(d => {
    if (!idsVistos.has(d.id)) { idsVistos.add(d.id); candidatos.push({ id: d.id, ...d.data() }); }
  }));

  return candidatos.filter(p => {
    const n = (p.nombre || '').toUpperCase();
    const claves = p.palabrasClave || [];
    const ct = (p.codigoTienda || '').toUpperCase();
    const cp = (p.codigoProveedor || '').toUpperCase();
    return palabras.every(pal =>
      n.includes(pal) || claves.some(c => c.includes(pal)) || ct.includes(pal) || cp.includes(pal)
    );
  }).slice(0, 15);
}

export default function AjustarStock() {
  const [term, setTerm]             = useState('');
  const [found, setFound]           = useState([]);
  const [buscando, setBuscando]     = useState(false);
  const [showDD, setShowDD]         = useState(false);
  const [producto, setProducto]     = useState(null);

  const [nuevoStock, setNuevoStock] = useState('');
  const [motivo, setMotivo]         = useState('');
  const [guardando, setGuardando]   = useState(false);
  const [exito, setExito]           = useState(false);
  const [error, setError]           = useState(null);

  useEffect(() => {
    if (!term.trim() || producto) { setFound([]); setShowDD(false); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      try { const r = await buscarProductos(term); setFound(r); setShowDD(true); }
      catch { setError('Error buscando'); }
      finally { setBuscando(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [term, producto]);

  const handleSelect = async (p) => {
    setProducto(p);
    setTerm(p.nombre + (p.codigoProveedor ? ' · ' + p.codigoProveedor : ''));
    setShowDD(false);
    setFound([]);
    setNuevoStock(String(p.stockActual ?? 0));
    setExito(false);
    setError(null);
    setMotivo('');
  };

  const handleGuardar = async () => {
    const stock = parseInt(nuevoStock);
    if (isNaN(stock) || stock < 0) { setError('Stock inválido'); return; }
    if (!motivo.trim()) { setError('Escribe el motivo del ajuste'); return; }
    if (!window.confirm(`¿Confirmas cambiar el stock de "${producto.nombre}" de ${producto.stockActual ?? 0} → ${stock}?`)) return;

    setGuardando(true);
    setError(null);
    try {
      await updateDoc(doc(db, 'productos', producto.id), {
        stockActual: stock,
        updatedAt: serverTimestamp(),
        _ultimoAjusteManual: { stockAnterior: producto.stockActual ?? 0, stockNuevo: stock, motivo, fecha: new Date().toISOString() }
      });
      setProducto(prev => ({ ...prev, stockActual: stock }));
      setExito(true);
    } catch (err) {
      setError('Error al guardar: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleClear = () => {
    setTerm(''); setProducto(null); setFound([]); setShowDD(false);
    setNuevoStock(''); setMotivo(''); setExito(false); setError(null);
  };

  const stockActual = producto?.stockActual ?? 0;
  const stockNuevo  = parseInt(nuevoStock);
  const diferencia  = isNaN(stockNuevo) ? null : stockNuevo - stockActual;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="p-2 bg-violet-600 rounded-lg">
            <AdjustmentsHorizontalIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Ajuste Manual de Stock</h1>
            <p className="text-sm text-gray-500">Admin — Corrige el stock de un producto directamente</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-6 py-8 space-y-4">

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-amber-500 mt-0.5" />
          Úsalo solo para corregir errores puntuales. El ajuste no genera movimiento de lote.
        </div>

        {/* Buscador */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 relative">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Buscar producto</label>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={term}
              onChange={e => { setTerm(e.target.value); if (producto) { setProducto(null); setExito(false); } }}
              placeholder="Nombre, código proveedor, marca..."
              className="w-full pl-12 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-violet-400 focus:border-transparent text-sm"
            />
            {term && (
              <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </div>

          {showDD && (
            <div className="absolute left-6 right-6 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
              {buscando ? (
                <div className="flex items-center justify-center py-5 gap-2 text-gray-500 text-sm">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" /> Buscando...
                </div>
              ) : found.length === 0 ? (
                <div className="py-5 text-center text-gray-400 text-sm">Sin resultados</div>
              ) : found.map(p => (
                <button key={p.id} onClick={() => handleSelect(p)}
                  className="w-full text-left px-4 py-3 hover:bg-violet-50 border-b border-gray-100 last:border-0 transition-colors">
                  <div className="flex justify-between items-center gap-3">
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{p.nombre}</div>
                      <div className="text-xs text-gray-500 flex gap-3 mt-0.5">
                        {p.codigoProveedor && <span>C.Prov: <span className="font-mono font-semibold">{p.codigoProveedor}</span></span>}
                        {p.marca && <span>{p.marca}</span>}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-700 flex-shrink-0">Stock: {p.stockActual ?? 0}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ajuste */}
        {producto && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
            {/* Info producto */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="font-bold text-gray-900">{producto.nombre}</div>
              <div className="text-xs text-gray-500 flex gap-3 mt-1 flex-wrap">
                {producto.codigoProveedor && <span>C.Prov: <span className="font-mono font-semibold text-gray-700">{producto.codigoProveedor}</span></span>}
                {producto.marca && <span>Marca: <span className="font-semibold text-gray-700">{producto.marca}</span></span>}
                <span className="font-mono text-gray-300">{producto.id}</span>
              </div>
            </div>

            {/* Stock actual vs nuevo */}
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="text-xs text-gray-500 mb-1">Stock actual</div>
                <div className="text-3xl font-bold text-gray-800">{stockActual}</div>
              </div>
              <div className="text-center bg-violet-50 rounded-xl p-4 border border-violet-200">
                <div className="text-xs text-violet-600 mb-1">Stock nuevo</div>
                <input
                  type="number"
                  min="0"
                  value={nuevoStock}
                  onChange={e => { setNuevoStock(e.target.value); setExito(false); }}
                  onFocus={e => e.target.select()}
                  className="w-full text-center text-3xl font-bold text-violet-700 bg-transparent border-none outline-none focus:ring-0"
                />
              </div>
            </div>

            {/* Diferencia */}
            {!isNaN(diferencia) && nuevoStock !== '' && (
              <div className={`text-center text-sm font-semibold rounded-lg py-2 ${
                diferencia > 0 ? 'bg-green-50 text-green-700' :
                diferencia < 0 ? 'bg-red-50 text-red-700' :
                'bg-gray-50 text-gray-500'
              }`}>
                {diferencia > 0 ? `+${diferencia} unidades` : diferencia < 0 ? `${diferencia} unidades` : 'Sin cambio'}
              </div>
            )}

            {/* Motivo */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Motivo del ajuste</label>
              <input
                type="text"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: Corrección por lote reasignado (L260109-VJEN)"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" /> {error}
              </div>
            )}

            {exito ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <CheckCircleIcon className="h-8 w-8 text-green-500 mx-auto mb-1" />
                <p className="font-semibold text-green-800">Stock actualizado a {stockActual}</p>
                <button onClick={handleClear} className="mt-2 text-sm text-green-600 underline">Ajustar otro producto</button>
              </div>
            ) : (
              <button
                onClick={handleGuardar}
                disabled={guardando || nuevoStock === '' || isNaN(stockNuevo) || stockNuevo < 0 || diferencia === 0}
                className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {guardando
                  ? <><ArrowPathIcon className="h-5 w-5 animate-spin" /> Guardando...</>
                  : 'Confirmar Ajuste de Stock'
                }
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}