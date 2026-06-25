import { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../../lib/firebase';
import {
  collection, getDocs, updateDoc, doc,
  query, where, orderBy, limit, startAfter, serverTimestamp
} from 'firebase/firestore';

const BATCH_SIZE = 50;
const n = (v) => parseFloat(v) || 0;
const fmt = (v) => n(v).toFixed(2);

const sortLotesFIFO = (lotes) =>
  [...lotes].sort((a, b) => {
    const fa = a.fechaIngreso?.toMillis?.() ?? (a.fechaIngreso?.seconds ?? 0) * 1000;
    const fb = b.fechaIngreso?.toMillis?.() ?? (b.fechaIngreso?.seconds ?? 0) * 1000;
    return fa - fb;
  });

// ─── Un lote es editable si es 'activo' O 'agotado' (o no tiene estado) ──────
const esEditable = (lote) =>
  lote.estado === 'activo' || lote.estado === 'agotado' || !lote.estado;

export default function EditarPreciosMasivo() {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  // inputs como strings: { [loteId]: { venta: string, minimo: string } }
  const [inputValues, setInputValues] = useState({});

  const [guardando, setGuardando] = useState(new Set());
  const [guardados, setGuardados] = useState(new Set());
  const [guardandoProd, setGuardandoProd] = useState(new Set());

  const [busqueda, setBusqueda] = useState('');
  const [soloAfectados, setSoloAfectados] = useState(true);
  const [progreso, setProgreso] = useState(null);

  // ─── Map producto ────────────────────────────────────────────
  const mapProducto = (d) => ({ id: d.id, ...d.data() });

  const productoRefs = useRef({});
  const [indiceAfectado, setIndiceAfectado] = useState(0);
  const [ordenAfectadosPrimero, setOrdenAfectadosPrimero] = useState(false);

  // ─── Inicializar inputs de lotes ─────────────────────────────
  const inicializarInputs = (lotes) => {
    const entries = {};
    lotes.forEach(l => {
      entries[l.id] = {
        venta:  fmt(l.precioVentaUnitario),
        minimo: fmt(l.precioVentaMinimoUnitario),
      };
    });
    return entries;
  };

  // ─── Cargar lotes de un producto ─────────────────────────────
  const cargarLotesDeProducto = async (producto) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'lotes'),
        where('productoId', '==', producto.id)
      ));
      const lotes = sortLotesFIFO(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      return { ...producto, _lotes: lotes, _showLotes: true };
    } catch (err) {
      console.error('Error lotes de', producto.nombre, ':', err.message);
      return { ...producto, _lotes: [], _showLotes: true };
    }
  };

  // ─── Carga paginada ──────────────────────────────────────────
  const cargarProductos = async (reset = false) => {
    if (reset) { setLoading(true); setProductos([]); setLastDoc(null); setHasMore(true); }
    else setLoadingMore(true);

    try {
      const q = reset || !lastDoc
        ? query(collection(db, 'productos'), orderBy('nombre', 'asc'), limit(BATCH_SIZE))
        : query(collection(db, 'productos'), orderBy('nombre', 'asc'), startAfter(lastDoc), limit(BATCH_SIZE));

      const snap = await getDocs(q);
      if (snap.empty) { setHasMore(false); return; }

      const nuevos = snap.docs.map(mapProducto);
      setLastDoc(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === BATCH_SIZE);

      const nuevosConLotes = await Promise.all(nuevos.map(cargarLotesDeProducto));

      const newInputs = {};
      nuevosConLotes.forEach(p => {
        Object.assign(newInputs, inicializarInputs(p._lotes || []));
      });
      setInputValues(prev => ({ ...prev, ...newInputs }));

      setProductos(prev => reset ? nuevosConLotes : [...prev, ...nuevosConLotes]);
    } catch (err) {
      console.error('Error cargando productos:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { cargarProductos(true); }, []);

  // ─── Cambio de input ─────────────────────────────────────────
  const handleInputChange = (loteId, campo, rawValue) => {
    setInputValues(prev => ({
      ...prev,
      [loteId]: { ...prev[loteId], [campo]: rawValue },
    }));
  };

  // ─── Recalcular producto FIFO ────────────────────────────────
  // Si no hay stock activo, usa el último lote editable con precios para
  // que el producto no quede con precio 0 cuando está agotado.
  const recalcularProductoFIFO = async (productoId) => {
    setGuardandoProd(prev => new Set(prev).add(productoId));
    try {
      const snap = await getDocs(query(
        collection(db, 'lotes'),
        where('productoId', '==', productoId)
      ));
      const todosLotes = sortLotesFIFO(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
      );

      // Primero: lotes activos con stock > 0 (FIFO normal)
      const lotesConStock = todosLotes.filter(
        l => l.estado === 'activo' && (l.stockRestante || 0) > 0
      );

      let precioCompra = 0, precioVenta = 0, precioMinimo = 0, stockTotal = 0;

      if (lotesConStock.length > 0) {
        const primer = lotesConStock[0];
        precioCompra = n(primer.precioCompraUnitario);
        precioVenta  = n(primer.precioVentaUnitario);
        precioMinimo = n(primer.precioVentaMinimoUnitario);
        lotesConStock.forEach(l => { stockTotal += parseInt(l.stockRestante || 0); });
      } else {
        // Sin stock activo: buscar el lote editable más reciente con precios cargados
        // (agotado o activo-vacío) para mantener los precios visibles en el producto
        const editables = todosLotes.filter(esEditable);
        const conPrecios = [...editables]
          .reverse()  // el más reciente primero
          .find(l => n(l.precioVentaUnitario) > 0);

        if (conPrecios) {
          precioCompra = n(conPrecios.precioCompraUnitario);
          precioVenta  = n(conPrecios.precioVentaUnitario);
          precioMinimo = n(conPrecios.precioVentaMinimoUnitario);
        }
        stockTotal = 0;
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

  const [cargandoTodos, setCargandoTodos] = useState(false);

  const cargarTodosLosAfectados = async () => {
    setCargandoTodos(true);
    try {
      // Trae TODOS los productos donde precioVentaDefault == 0 O precioVentaMinimo == 0
      const [snapVenta, snapMinimo] = await Promise.all([
        getDocs(query(collection(db, 'productos'), where('precioVentaDefault', '==', 0))),
        getDocs(query(collection(db, 'productos'), where('precioVentaMinimo',  '==', 0))),
      ]);

      // Deduplicar por id
      const mapaExistentes = new Map(productos.map(p => [p.id, p]));
      const mapaYaCargados = new Set(productos.map(p => p.id));

      const nuevosIds = new Map();
      [...snapVenta.docs, ...snapMinimo.docs].forEach(d => {
        if (!mapaYaCargados.has(d.id)) {
          nuevosIds.set(d.id, mapProducto(d));
        }
      });

      if (nuevosIds.size === 0) {
        alert('No hay afectados nuevos fuera de los ya cargados.');
        return;
      }

      const nuevosConLotes = await Promise.all(
        [...nuevosIds.values()].map(cargarLotesDeProducto)
      );

      const newInputs = {};
      nuevosConLotes.forEach(p => {
        Object.assign(newInputs, inicializarInputs(p._lotes || []));
      });
      setInputValues(prev => ({ ...prev, ...newInputs }));
      setProductos(prev => [...prev, ...nuevosConLotes]);

      alert(`Se cargaron ${nuevosConLotes.length} productos afectados adicionales.`);
    } catch (err) {
      console.error('Error cargando afectados:', err);
      alert('Error: ' + err.message);
    } finally {
      setCargandoTodos(false);
    }
  };

  // ─── Guardar un lote ─────────────────────────────────────────
  const guardarLote = async (productoId, lote) => {
    const vals = inputValues[lote.id] || {};
    const precioVenta  = n(vals.venta);
    const precioMinimo = n(vals.minimo);

    if (precioVenta <= 0) {
      alert(`El precio de venta del lote ${lote.numeroLote || lote.id.slice(-6)} debe ser mayor a 0.`);
      return;
    }

    setGuardando(prev => new Set(prev).add(lote.id));
    try {
      await updateDoc(doc(db, 'lotes', lote.id), {
        precioVentaUnitario:       precioVenta,
        precioVentaMinimoUnitario: precioMinimo,
        updatedAt:                 serverTimestamp(),
      });

      setProductos(prev => prev.map(p =>
        p.id !== productoId ? p : {
          ...p,
          _lotes: p._lotes.map(l =>
            l.id !== lote.id ? l : {
              ...l,
              precioVentaUnitario:       precioVenta,
              precioVentaMinimoUnitario: precioMinimo,
            }
          ),
        }
      ));

      await recalcularProductoFIFO(productoId);

      setGuardados(prev => new Set(prev).add(lote.id));
      setTimeout(() => {
        setGuardados(prev => { const s = new Set(prev); s.delete(lote.id); return s; });
      }, 2500);
    } catch (err) {
      alert('Error al guardar lote: ' + err.message);
    } finally {
      setGuardando(prev => { const s = new Set(prev); s.delete(lote.id); return s; });
    }
  };

  // ─── Guardar TODO ────────────────────────────────────────────
  const guardarTodo = async () => {
    const lotesParaGuardar = [];
    productosFiltrados.forEach(p => {
      // Incluye agotados además de activos
      (p._lotes || []).filter(l => esEditable(l)).forEach(l => {
        const vals = inputValues[l.id] || {};
        if (n(vals.venta) > 0) {
          lotesParaGuardar.push({ productoId: p.id, lote: l });
        }
      });
    });

    if (!lotesParaGuardar.length) {
      alert('No hay lotes editables con precio de venta > 0 para guardar.');
      return;
    }
    if (!window.confirm(`¿Guardar ${lotesParaGuardar.length} lotes y recalcular productos?`)) return;

    setProgreso({ actual: 0, total: lotesParaGuardar.length });
    const CHUNK = 5;
    for (let i = 0; i < lotesParaGuardar.length; i += CHUNK) {
      const chunk = lotesParaGuardar.slice(i, i + CHUNK);
      await Promise.all(chunk.map(({ productoId, lote }) => guardarLote(productoId, lote)));
      setProgreso({ actual: Math.min(i + CHUNK, lotesParaGuardar.length), total: lotesParaGuardar.length });
    }
    setProgreso(null);
    alert('Todo guardado y productos actualizados.');
  };

  // ─── Toggle lotes ────────────────────────────────────────────
  const toggleLotes = (productoId) => {
    setProductos(prev => prev.map(p =>
      p.id === productoId ? { ...p, _showLotes: !p._showLotes } : p
    ));
  };

  // ─── "Afectado": producto o lote editable con precio 0 ───────
  const esAfectado = (p) => {
    const prodAfectado = n(p.precioVentaDefault) === 0 || n(p.precioVentaMinimo) === 0;
    const loteAfectado = (p._lotes || []).some(
      l => esEditable(l) &&
           (n(l.precioVentaUnitario) === 0 || n(l.precioVentaMinimoUnitario) === 0)
    );
    return prodAfectado || loteAfectado;
  };

  // Tiene al menos un lote editable (activo o agotado)
  const tieneStockActivo = (p) =>
    (p._lotes || []).some(l => esEditable(l));

  const irAlSiguienteAfectado = () => {
    const afectados = productosFiltrados.filter(esAfectado);
    if (!afectados.length) { alert('No hay productos afectados visibles.'); return; }

    const idx = indiceAfectado % afectados.length;
    const prod = afectados[idx];
    const el = productoRefs.current[prod.id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Abre los lotes si están cerrados
      if (!prod._showLotes) toggleLotes(prod.id);
    }
    setIndiceAfectado(idx + 1);
  };
  const productosFiltrados = useMemo(() => {
    let lista = productos.filter(p => {
      const coincide = !busqueda.trim() ||
        (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.codigoTienda || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.marca || '').toLowerCase().includes(busqueda.toLowerCase());
      if (!coincide) return false;
      if (soloAfectados) return tieneStockActivo(p) && esAfectado(p);
      return true;
    });

    if (ordenAfectadosPrimero) {
      lista = [...lista].sort((a, b) => {
        const aA = esAfectado(a) ? 0 : 1;
        const bA = esAfectado(b) ? 0 : 1;
        return aA - bA;
      });
    }

    return lista;
  }, [productos, busqueda, soloAfectados, ordenAfectadosPrimero, inputValues]);

  const totalAfectados = productos.filter(esAfectado).length;

  // ─── Render ──────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col justify-center items-center h-64 gap-3">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      <span className="text-gray-500 text-sm">Cargando productos y lotes...</span>
    </div>
  );

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Edición Masiva de Precios por Lote</h1>
        <p className="text-gray-500 text-sm mt-1">
          Edita <strong>precio de venta</strong> y <strong>precio mínimo</strong> en cada lote
          (activos y agotados). Al guardar, el producto se actualiza con el primer lote activo con
          stock (FIFO), o con el último lote con precios si no hay stock.
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
          <span className="text-blue-600"> cargados{hasMore ? ' (hay más)' : ' (todos)'}</span>
        </div>
      </div>

      {/* Barra herramientas */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="text"
          placeholder="Buscar por nombre, código, marca..."
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
            {loadingMore ? 'Cargando...' : 'Cargar más'}
          </button>
        )}

        {/* Botón nuevo: trae SOLO los afectados que faltan */}
        <button
          onClick={cargarTodosLosAfectados}
          disabled={cargandoTodos}
          className="px-3 py-2 text-sm bg-red-600 text-white font-semibold border border-red-700 rounded-lg hover:bg-red-700 disabled:opacity-50"
          title="Carga directamente desde Firestore todos los productos con precio 0, sin paginar"
        >
          {cargandoTodos ? 'Cargando afectados...' : '⚡ Cargar todos los afectados'}
        </button>

        <button
          onClick={() => setOrdenAfectadosPrimero(v => !v)}
          className={`px-3 py-2 text-sm border rounded-lg ${
            ordenAfectadosPrimero
              ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
              : 'bg-white border-gray-300 hover:bg-gray-50'
          }`}
          title="Mueve los productos con precio 0 al inicio de la lista"
        >
          {ordenAfectadosPrimero ? '🔴 Afectados arriba (ON)' : 'Afectados arriba'}
        </button>

        <button
          onClick={irAlSiguienteAfectado}
          className="px-3 py-2 text-sm bg-orange-100 border border-orange-300 text-orange-700 font-semibold rounded-lg hover:bg-orange-200"
          title="Salta al siguiente producto afectado en la lista"
        >
          → Siguiente afectado
        </button>
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
          const prodAfectado = esAfectado(producto);
          const recalculando = guardandoProd.has(producto.id);

          return (
            <div
              key={producto.id}
              ref={el => { productoRefs.current[producto.id] = el; }}
              className={`border rounded-lg overflow-hidden ${prodAfectado ? 'border-red-300' : 'border-gray-200'}`}
            >
              {/* Cabecera producto */}
              <div
                className={`flex flex-wrap items-center gap-4 px-4 py-3 cursor-pointer select-none ${
                  prodAfectado ? 'bg-red-50 hover:bg-red-100' : 'bg-gray-50 hover:bg-gray-100'
                }`}
                onClick={() => toggleLotes(producto.id)}
              >
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
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
                    {producto.codigoTienda}
                    {producto.marca ? ' · ' + producto.marca : ''}
                    {' · Stock: '}{producto.stockActual ?? 0}
                  </div>
                </div>

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
                    <div className="text-gray-400">P. Mínimo</div>
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
                    <div className="px-6 py-3 text-sm text-gray-400 italic bg-white">Sin lotes registrados.</div>
                  ) : (
                    <table className="min-w-full text-sm border-t border-gray-100">
                      <thead>
                        <tr className="bg-blue-50 text-xs text-gray-500 font-semibold">
                          <th className="px-4 py-2 text-left">LOTE</th>
                          <th className="px-4 py-2 text-center">ESTADO</th>
                          <th className="px-4 py-2 text-center">STOCK</th>
                          <th className="px-4 py-2 text-center">P. COMPRA</th>
                          <th className="px-4 py-2 text-center" style={{minWidth: '130px'}}>P. VENTA</th>
                          <th className="px-4 py-2 text-center" style={{minWidth: '130px'}}>P. MÍNIMO</th>
                          <th className="px-4 py-2 text-center">FIFO</th>
                          <th className="px-4 py-2 text-center" style={{minWidth: '90px'}}>GUARDAR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {producto._lotes.map((lote, idx) => {
                          const editable = esEditable(lote);
                          const esActivo = lote.estado === 'activo';
                          const esAgotado = lote.estado === 'agotado';

                          const esPrimeroActivo = idx === producto._lotes.findIndex(
                            l => l.estado === 'activo' && (l.stockRestante || 0) > 0
                          );
                          // Si no hay ningún lote activo con stock, marcar el último
                          // lote editable con precios como referencia FIFO
                          const hayLoteConStock = producto._lotes.some(
                            l => l.estado === 'activo' && (l.stockRestante || 0) > 0
                          );
                          const esFifoFallback = !hayLoteConStock && esAgotado && (() => {
                            const editables = [...producto._lotes].filter(esEditable);
                            const conPrecios = [...editables]
                              .reverse()
                              .find(l => n(l.precioVentaUnitario) > 0);
                            return conPrecios?.id === lote.id;
                          })();

                          const vals = inputValues[lote.id] || { venta: '0.00', minimo: '0.00' };
                          const ventaNum  = n(vals.venta);
                          const minimoNum = n(vals.minimo);
                          const loteAfectado = editable && (ventaNum === 0 || minimoNum === 0);
                          const estaGuardando = guardando.has(lote.id);
                          const fueGuardado   = guardados.has(lote.id);

                          const haysCambios =
                            ventaNum  !== n(lote.precioVentaUnitario) ||
                            minimoNum !== n(lote.precioVentaMinimoUnitario);

                          return (
                            <tr
                              key={lote.id}
                              className={
                                fueGuardado    ? 'bg-green-50 border-t border-gray-100' :
                                loteAfectado   ? 'bg-orange-50 border-t border-gray-100' :
                                !editable      ? 'bg-gray-50 opacity-60 border-t border-gray-100' :
                                idx % 2 === 0  ? 'bg-white border-t border-gray-100'
                                               : 'bg-gray-50 border-t border-gray-100'
                              }
                            >
                              <td className="px-4 py-2 font-mono text-xs text-gray-700">
                                <div className="font-semibold">{lote.numeroLote || lote.id.slice(-6)}</div>
                                <div className="text-gray-400">
                                  {lote.fechaIngreso?.toDate?.()?.toLocaleDateString('es-PE') ?? '—'}
                                </div>
                              </td>

                              <td className="px-4 py-2 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  esActivo
                                    ? 'bg-green-100 text-green-700'
                                    : esAgotado
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-gray-200 text-gray-500'
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

                              {/* P. Venta */}
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-400 text-xs flex-shrink-0">S/.</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={vals.venta}
                                    onChange={e => handleInputChange(lote.id, 'venta', e.target.value)}
                                    onFocus={e => e.target.select()}
                                    disabled={!editable}
                                    placeholder="0.00"
                                    className={`w-full px-2 py-1.5 border rounded text-sm text-right disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 ${
                                      ventaNum === 0 && editable
                                        ? 'border-red-400 bg-red-50 focus:ring-red-300'
                                        : haysCambios
                                        ? 'border-amber-400 bg-amber-50 focus:ring-amber-300'
                                        : 'border-gray-300 bg-white focus:ring-blue-300'
                                    }`}
                                  />
                                </div>
                              </td>

                              {/* P. Mínimo */}
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-400 text-xs flex-shrink-0">S/.</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={vals.minimo}
                                    onChange={e => handleInputChange(lote.id, 'minimo', e.target.value)}
                                    onFocus={e => e.target.select()}
                                    disabled={!editable}
                                    placeholder="0.00"
                                    className={`w-full px-2 py-1.5 border rounded text-sm text-right disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 ${
                                      minimoNum === 0 && editable
                                        ? 'border-red-400 bg-red-50 focus:ring-red-300'
                                        : haysCambios
                                        ? 'border-amber-400 bg-amber-50 focus:ring-amber-300'
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
                                ) : esFifoFallback ? (
                                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold" title="Referencia de precio mientras no hay stock">
                                    REF
                                  </span>
                                ) : '—'}
                              </td>

                              <td className="px-2 py-1.5 text-center">
                                {editable ? (
                                  <button
                                    onClick={() => guardarLote(producto.id, lote)}
                                    disabled={estaGuardando}
                                    className={`px-3 py-1.5 text-xs rounded font-semibold transition-colors w-full ${
                                      fueGuardado
                                        ? 'bg-green-500 text-white cursor-default'
                                        : estaGuardando
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : haysCambios
                                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                  >
                                    {fueGuardado ? '✓ OK' : estaGuardando ? '...' : haysCambios ? 'Guardar*' : 'Guardar'}
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

      {hasMore && !loading && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => cargarProductos(false)}
            disabled={loadingMore}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loadingMore ? 'Cargando...' : 'Cargar más productos'}
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