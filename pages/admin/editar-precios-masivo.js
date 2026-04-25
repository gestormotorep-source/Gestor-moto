import { useState, useEffect, useCallback } from 'react';
import { db } from '../../lib/firebase';
import {
  collection, getDocs, updateDoc, doc,
  query, where, orderBy, limit, startAfter, serverTimestamp
} from 'firebase/firestore';

const BATCH_SIZE = 50;
const n = (v) => parseFloat(v) || 0;
const fmt = (v) => n(v).toFixed(2);

// Ordena lotes por fechaIngreso asc en memoria (evita indice compuesto en Firestore)
const sortLotesFIFO = (lotes) =>
  [...lotes].sort((a, b) => {
    const fa = a.fechaIngreso?.toMillis?.() ?? (a.fechaIngreso?.seconds ?? 0) * 1000;
    const fb = b.fechaIngreso?.toMillis?.() ?? (b.fechaIngreso?.seconds ?? 0) * 1000;
    return fa - fb;
  });

export default function EditarPreciosMasivo() {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const [guardando, setGuardando] = useState(new Set());
  const [guardados, setGuardados] = useState(new Set());
  const [guardandoProd, setGuardandoProd] = useState(new Set());

  const [busqueda, setBusqueda] = useState('');
  const [soloAfectados, setSoloAfectados] = useState(true);
  const [progreso, setProgreso] = useState(null);

  // ─── Mapeo de producto ───────────────────────────────────────
  const mapProducto = (d) => ({ id: d.id, ...d.data() });

  // ─── Carga de lotes (solo where = sin indice compuesto) ──────
  const cargarLotesDeProducto = async (producto) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'lotes'),
        where('productoId', '==', producto.id)
        // SIN orderBy aqui: evita necesitar indice compuesto
      ));

      const lotes = sortLotesFIFO(
        snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          _precioVenta:  n(d.data().precioVentaUnitario),
          _precioMinimo: n(d.data().precioVentaMinimoUnitario),
        }))
      );

      return { ...producto, _lotes: lotes, _showLotes: true };
    } catch (err) {
      console.error('Error cargando lotes de', producto.nombre, ':', err.message);
      return { ...producto, _lotes: [], _showLotes: true };
    }
  };

  // ─── Carga paginada de productos ─────────────────────────────
  const cargarProductos = async (reset = false) => {
    if (reset) {
      setLoading(true);
      setProductos([]);
      setLastDoc(null);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }

    try {
      let q;
      if (reset || !lastDoc) {
        q = query(collection(db, 'productos'), orderBy('nombre', 'asc'), limit(BATCH_SIZE));
      } else {
        q = query(collection(db, 'productos'), orderBy('nombre', 'asc'), startAfter(lastDoc), limit(BATCH_SIZE));
      }

      const snap = await getDocs(q);
      if (snap.empty) { setHasMore(false); return; }

      const nuevos = snap.docs.map(mapProducto);
      setLastDoc(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === BATCH_SIZE);

      // Cargar lotes de cada producto en paralelo
      const nuevosConLotes = await Promise.all(nuevos.map(cargarLotesDeProducto));

      setProductos(prev => reset ? nuevosConLotes : [...prev, ...nuevosConLotes]);
    } catch (err) {
      console.error('Error cargando productos:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { cargarProductos(true); }, []);

  // ─── Edicion local de precio en lote ────────────────────────
  const handleLotePrecioChange = (productoId, loteId, campo, valor) => {
    setProductos(prev => prev.map(p => {
      if (p.id !== productoId) return p;
      return {
        ...p,
        _lotes: p._lotes.map(l =>
          l.id === loteId ? { ...l, [campo]: parseFloat(valor) || 0 } : l
        ),
      };
    }));
  };

  // ─── Recalcular producto FIFO (sin indice compuesto) ────────
  const recalcularProductoFIFO = async (productoId) => {
    setGuardandoProd(prev => new Set(prev).add(productoId));
    try {
      const snap = await getDocs(query(
        collection(db, 'lotes'),
        where('productoId', '==', productoId)
        // Sin where extra + orderBy = sin indice compuesto. Filtramos en memoria.
      ));

      const lotesActivos = sortLotesFIFO(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(l => l.estado === 'activo' && (l.stockRestante || 0) > 0)
      );

      let precioCompra = 0, precioVenta = 0, precioMinimo = 0, stockTotal = 0;
      if (lotesActivos.length > 0) {
        const primer = lotesActivos[0];
        precioCompra = n(primer.precioCompraUnitario);
        precioVenta  = n(primer.precioVentaUnitario);
        precioMinimo = n(primer.precioVentaMinimoUnitario);
        lotesActivos.forEach(l => { stockTotal += parseInt(l.stockRestante || 0); });
      }

      await updateDoc(doc(db, 'productos', productoId), {
        precioCompraDefault: precioCompra,
        precioVentaDefault:  precioVenta,
        precioVentaMinimo:   precioMinimo,
        stockActual:         stockTotal,
        updatedAt:           serverTimestamp(),
      });

      setProductos(prev => prev.map(p =>
        p.id !== productoId ? p : {
          ...p,
          precioCompraDefault: precioCompra,
          precioVentaDefault:  precioVenta,
          precioVentaMinimo:   precioMinimo,
          stockActual:         stockTotal,
        }
      ));
    } catch (err) {
      console.error('Error FIFO:', err);
    } finally {
      setGuardandoProd(prev => { const s = new Set(prev); s.delete(productoId); return s; });
    }
  };

  // ─── Guardar un lote + recalcular producto ───────────────────
  const guardarLote = async (producto, lote) => {
    const key = lote.id;
    setGuardando(prev => new Set(prev).add(key));
    try {
      await updateDoc(doc(db, 'lotes', lote.id), {
        precioVentaUnitario:       lote._precioVenta,
        precioVentaMinimoUnitario: lote._precioMinimo,
        updatedAt:                 serverTimestamp(),
      });
      await recalcularProductoFIFO(producto.id);

      setGuardados(prev => new Set(prev).add(key));
      setTimeout(() => {
        setGuardados(prev => { const s = new Set(prev); s.delete(key); return s; });
      }, 2000);
    } catch (err) {
      alert('Error al guardar lote: ' + err.message);
    } finally {
      setGuardando(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  // ─── Guardar TODO ────────────────────────────────────────────
  const guardarTodo = async () => {
    const lotesParaGuardar = [];
    productosFiltrados.forEach(p => {
      (p._lotes || []).filter(l => l.estado === 'activo').forEach(l => {
        if (l._precioVenta > 0 || l._precioMinimo > 0) {
          lotesParaGuardar.push({ producto: p, lote: l });
        }
      });
    });

    if (!lotesParaGuardar.length) {
      alert('No hay lotes activos con precios para guardar.');
      return;
    }
    if (!window.confirm(`Guardar ${lotesParaGuardar.length} lotes y recalcular productos?`)) return;

    setProgreso({ actual: 0, total: lotesParaGuardar.length });
    const CHUNK = 5;
    for (let i = 0; i < lotesParaGuardar.length; i += CHUNK) {
      const chunk = lotesParaGuardar.slice(i, i + CHUNK);
      await Promise.all(chunk.map(({ producto, lote }) => guardarLote(producto, lote)));
      setProgreso({ actual: Math.min(i + CHUNK, lotesParaGuardar.length), total: lotesParaGuardar.length });
    }

    const productosAfectados = [...new Set(lotesParaGuardar.map(x => x.producto.id))];
    await Promise.all(productosAfectados.map(recalcularProductoFIFO));

    setProgreso(null);
    alert('Todo guardado y productos actualizados.');
  };

  // ─── Toggle lotes ────────────────────────────────────────────
  const toggleLotes = (productoId) => {
    setProductos(prev => prev.map(p =>
      p.id === productoId ? { ...p, _showLotes: !p._showLotes } : p
    ));
  };

  // ─── Filtrado ────────────────────────────────────────────────
  const productosFiltrados = productos.filter(p => {
    const coincide = !busqueda ||
      (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.codigoTienda || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.marca || '').toLowerCase().includes(busqueda.toLowerCase());

    if (!coincide) return false;

    if (soloAfectados) {
      const prodAfectado = n(p.precioVentaDefault) === 0 || n(p.precioVentaMinimo) === 0;
      const loteAfectado = (p._lotes || []).some(l =>
        l.estado === 'activo' && (l._precioVenta === 0 || l._precioMinimo === 0)
      );
      return prodAfectado || loteAfectado;
    }
    return true;
  });

  const totalAfectados = productos.filter(p => {
    const prodAfectado = n(p.precioVentaDefault) === 0 || n(p.precioVentaMinimo) === 0;
    const loteAfectado = (p._lotes || []).some(l =>
      l.estado === 'activo' && (l._precioVenta === 0 || l._precioMinimo === 0)
    );
    return prodAfectado || loteAfectado;
  }).length;

  // ─── Render ──────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col justify-center items-center h-64 gap-3">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      <span className="text-gray-500 text-sm">Cargando productos y lotes...</span>
    </div>
  );

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Cabecera */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Edicion Masiva de Precios por Lote</h1>
        <p className="text-gray-500 text-sm mt-1">
          Edita <strong>precio de venta</strong> y <strong>precio minimo</strong> en cada lote.
          Al guardar, el producto se actualiza con el lote activo mas antiguo (FIFO).
        </p>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-red-700">{totalAfectados}</span>
          <span className="text-red-600"> productos afectados</span>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-green-700">{productos.length - totalAfectados}</span>
          <span className="text-green-600"> correctos</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-blue-700">{productos.length}</span>
          <span className="text-blue-600"> cargados{hasMore ? ' (hay mas)' : ' (todos)'}</span>
        </div>
      </div>

      {/* Barra herramientas */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="text"
          placeholder="Buscar por nombre, codigo, marca..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-grow max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soloAfectados}
            onChange={e => setSoloAfectados(e.target.checked)}
            className="w-4 h-4"
          />
          Solo afectados ({totalAfectados})
        </label>
        <span className="text-sm text-gray-500">Mostrando: {productosFiltrados.length}</span>

        {hasMore && (
          <button
            onClick={() => cargarProductos(false)}
            disabled={loadingMore}
            className="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            {loadingMore ? 'Cargando...' : 'Cargar mas productos'}
          </button>
        )}

        <button
          onClick={guardarTodo}
          className="px-4 py-2 text-sm bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 ml-auto"
        >
          Guardar Todo
        </button>
      </div>

      {/* Barra de progreso */}
      {progreso && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Guardando... {progreso.actual} / {progreso.total}</span>
            <span>{Math.round((progreso.actual / progreso.total) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${(progreso.actual / progreso.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Lista de productos */}
      <div className="space-y-3">
        {productosFiltrados.map(producto => {
          const prodAfectado = n(producto.precioVentaDefault) === 0 || n(producto.precioVentaMinimo) === 0;
          const recalculando = guardandoProd.has(producto.id);

          return (
            <div
              key={producto.id}
              className={`border rounded-lg overflow-hidden ${prodAfectado ? 'border-red-300' : 'border-gray-200'}`}
            >
              {/* Cabecera producto - clickable para colapsar */}
              <div
                className={`flex flex-wrap items-center gap-4 px-4 py-3 cursor-pointer select-none ${
                  prodAfectado ? 'bg-red-50 hover:bg-red-100' : 'bg-gray-50 hover:bg-gray-100'
                }`}
                onClick={() => toggleLotes(producto.id)}
              >
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm ${prodAfectado ? 'text-red-800' : 'text-gray-900'}`}>
                      {producto.nombre}
                    </span>
                    {prodAfectado && (
                      <span className="text-xs bg-red-200 text-red-700 px-2 py-0.5 rounded-full font-medium">
                        precio 0
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {producto.codigoTienda} {producto.marca ? '· ' + producto.marca : ''} · Stock: {producto.stockActual ?? 0}
                  </div>
                </div>

                {/* Precios actuales del producto */}
                <div className="flex gap-4 text-xs text-gray-600">
                  <div className="text-center">
                    <div className="text-gray-400">P. Compra</div>
                    <div className="font-medium">S/. {fmt(producto.precioCompraDefault)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-400">P. Venta</div>
                    <div className={`font-bold ${n(producto.precioVentaDefault) === 0 ? 'text-red-600' : 'text-green-700'}`}>
                      S/. {fmt(producto.precioVentaDefault)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-400">P. Minimo</div>
                    <div className={`font-bold ${n(producto.precioVentaMinimo) === 0 ? 'text-red-600' : 'text-blue-700'}`}>
                      S/. {fmt(producto.precioVentaMinimo)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400">
                  {recalculando && <span className="text-blue-600 animate-pulse">actualizando...</span>}
                  <span>{(producto._lotes || []).length} lotes {producto._showLotes ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Tabla de lotes */}
              {producto._showLotes && (
                <div className="overflow-x-auto">
                  {(!producto._lotes || producto._lotes.length === 0) ? (
                    <div className="px-6 py-3 text-sm text-gray-400 italic bg-white">
                      Sin lotes registrados.
                    </div>
                  ) : (
                    <table className="min-w-full text-sm border-t border-gray-100">
                      <thead>
                        <tr className="bg-blue-50 text-xs text-gray-500 font-semibold">
                          <th className="px-4 py-2 text-left">LOTE</th>
                          <th className="px-4 py-2 text-center">ESTADO</th>
                          <th className="px-4 py-2 text-center">STOCK</th>
                          <th className="px-4 py-2 text-center">P. COMPRA</th>
                          <th className="px-4 py-2 text-center w-36">P. VENTA</th>
                          <th className="px-4 py-2 text-center w-36">P. MINIMO</th>
                          <th className="px-4 py-2 text-center">FIFO</th>
                          <th className="px-4 py-2 text-center w-24">GUARDAR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {producto._lotes.map((lote, idx) => {
                          const esActivo = lote.estado === 'activo';
                          const esPrimeroActivo = idx === producto._lotes.findIndex(
                            l => l.estado === 'activo' && (l.stockRestante || 0) > 0
                          );
                          const loteAfectado = lote._precioVenta === 0 || lote._precioMinimo === 0;
                          const estaGuardando = guardando.has(lote.id);
                          const fueGuardado = guardados.has(lote.id);

                          return (
                            <tr
                              key={lote.id}
                              className={
                                fueGuardado ? 'bg-green-50 border-t border-gray-100' :
                                loteAfectado && esActivo ? 'bg-orange-50 border-t border-gray-100' :
                                !esActivo ? 'bg-gray-50 opacity-60 border-t border-gray-100' :
                                idx % 2 === 0 ? 'bg-white border-t border-gray-100' : 'bg-gray-50 border-t border-gray-100'
                              }
                            >
                              <td className="px-4 py-2 font-mono text-xs text-gray-700">
                                {lote.numeroLote || lote.id.slice(-6)}
                                <div className="text-gray-400">
                                  {lote.fechaIngreso?.toDate?.()?.toLocaleDateString('es-PE') ?? '—'}
                                </div>
                              </td>

                              <td className="px-4 py-2 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  esActivo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                                }`}>
                                  {lote.estado || 'activo'}
                                </span>
                              </td>

                              <td className="px-4 py-2 text-center font-medium text-gray-700">
                                {lote.stockRestante ?? 0}
                              </td>

                              <td className="px-4 py-2 text-center text-gray-500">
                                S/. {fmt(lote.precioCompraUnitario)}
                              </td>

                              {/* P. Venta editable */}
                              <td className="px-2 py-1">
                                <div className="flex items-center">
                                  <span className="text-gray-400 mr-1 text-xs">S/.</span>
                                  <input
                                    type="number"
                                    value={lote._precioVenta}
                                    onChange={e => handleLotePrecioChange(producto.id, lote.id, '_precioVenta', e.target.value)}
                                    step="0.01"
                                    min="0"
                                    disabled={!esActivo}
                                    className={`w-full px-2 py-1.5 border rounded text-sm text-center disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 ${
                                      lote._precioVenta === 0 && esActivo
                                        ? 'border-red-400 bg-red-50 focus:ring-red-300'
                                        : 'border-gray-300 bg-white focus:ring-blue-300'
                                    }`}
                                  />
                                </div>
                              </td>

                              {/* P. Minimo editable */}
                              <td className="px-2 py-1">
                                <div className="flex items-center">
                                  <span className="text-gray-400 mr-1 text-xs">S/.</span>
                                  <input
                                    type="number"
                                    value={lote._precioMinimo}
                                    onChange={e => handleLotePrecioChange(producto.id, lote.id, '_precioMinimo', e.target.value)}
                                    step="0.01"
                                    min="0"
                                    disabled={!esActivo}
                                    className={`w-full px-2 py-1.5 border rounded text-sm text-center disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 ${
                                      lote._precioMinimo === 0 && esActivo
                                        ? 'border-red-400 bg-red-50 focus:ring-red-300'
                                        : 'border-gray-300 bg-white focus:ring-blue-300'
                                    }`}
                                  />
                                </div>
                              </td>

                              <td className="px-4 py-2 text-center">
                                {esPrimeroActivo ? (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                                    FIFO
                                  </span>
                                ) : '—'}
                              </td>

                              <td className="px-2 py-1 text-center">
                                {esActivo ? (
                                  <button
                                    onClick={() => guardarLote(producto, lote)}
                                    disabled={estaGuardando}
                                    className={`px-3 py-1.5 text-xs rounded font-semibold transition-colors ${
                                      fueGuardado
                                        ? 'bg-green-500 text-white'
                                        : estaGuardando
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                  >
                                    {fueGuardado ? 'OK' : estaGuardando ? '...' : 'Guardar'}
                                  </button>
                                ) : (
                                  <span className="text-xs text-gray-400">inactivo</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cargar mas al fondo */}
      {hasMore && !loading && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => cargarProductos(false)}
            disabled={loadingMore}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loadingMore ? 'Cargando...' : 'Cargar mas productos'}
          </button>
        </div>
      )}

      {productosFiltrados.length === 0 && !loading && (
        <div className="text-center py-16 text-gray-400">
          No se encontraron productos con los filtros actuales.
        </div>
      )}
    </div>
  );
}