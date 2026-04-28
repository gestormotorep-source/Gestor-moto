import { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  collectionGroup,
  getDoc,
  doc
} from 'firebase/firestore';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ShoppingCartIcon,
  ClipboardDocumentListIcon,
  UserIcon,
  CalendarIcon,
  CubeIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

// ─── Utilidad: búsqueda de productos igual que NuevaVentaPage ────────────────
async function buscarProductos(term) {
  if (!term.trim()) return [];

  const idsVistos = new Set();
  let candidatos = [];
  const termUpper = term.trim().toUpperCase();
  const palabras = termUpper.split(/[\s\-\/\.]+/).filter(p => p.length >= 1);

  if (palabras.length > 0) {
    const queries = palabras.flatMap(palabra => [
      getDocs(query(collection(db, 'productos'), where('palabrasClave', 'array-contains', palabra), limit(200))),
      getDocs(query(collection(db, 'productos'), where('nombre', '>=', palabra), where('nombre', '<=', palabra + '\uf8ff'), limit(100))),
    ]);

    queries.push(
      getDocs(query(collection(db, 'productos'), where('codigoTienda', '==', termUpper), limit(5))),
      getDocs(query(collection(db, 'productos'), where('codigoProveedor', '==', termUpper), limit(5))),
      getDocs(query(collection(db, 'productos'), where('codigoTienda', '>=', termUpper), where('codigoTienda', '<=', termUpper + '\uf8ff'), limit(50))),
      getDocs(query(collection(db, 'productos'), where('codigoProveedor', '>=', termUpper), where('codigoProveedor', '<=', termUpper + '\uf8ff'), limit(50))),
    );

    const resultados = await Promise.all(queries);
    resultados.forEach(snap => {
      snap.docs.forEach(d => {
        if (!idsVistos.has(d.id)) {
          idsVistos.add(d.id);
          candidatos.push({ id: d.id, ...d.data() });
        }
      });
    });

    candidatos = candidatos.filter(p => {
      const nombreUpper = (p.nombre || '').toUpperCase();
      const claves = (p.palabrasClave || []);
      const codigoTienda = (p.codigoTienda || '').toUpperCase();
      const codigoProveedor = (p.codigoProveedor || '').toUpperCase();
      return palabras.every(palabra =>
        nombreUpper.includes(palabra) ||
        claves.some(clave => clave.includes(palabra)) ||
        codigoTienda.includes(palabra) ||
        codigoProveedor.includes(palabra)
      );
    });
  }

  return candidatos;
}

// ─── Buscar todas las ventas que contienen un productoId ────────────────────
async function buscarVentasPorProducto(productoId) {
  // Usamos collectionGroup para buscar en todos los itemsVenta de todas las ventas
  const itemsSnap = await getDocs(
    query(
      collectionGroup(db, 'itemsVenta'),
      where('productoId', '==', productoId)
    )
  );

  if (itemsSnap.empty) return [];

  // Agrupar por ventaId para obtener todas las ventas únicas
  const ventaMap = new Map();

  for (const itemDoc of itemsSnap.docs) {
    // El path es ventas/{ventaId}/itemsVenta/{itemId}
    const ventaId = itemDoc.ref.parent.parent.id;
    const itemData = { id: itemDoc.id, ...itemDoc.data() };

    if (!ventaMap.has(ventaId)) {
      ventaMap.set(ventaId, { ventaId, items: [] });
    }
    ventaMap.get(ventaId).items.push(itemData);
  }

  // Cargar datos de cada venta
  const ventasConDatos = await Promise.all(
    Array.from(ventaMap.values()).map(async ({ ventaId, items }) => {
      try {
        const ventaSnap = await getDoc(doc(db, 'ventas', ventaId));
        const ventaData = ventaSnap.exists() ? ventaSnap.data() : {};
        return {
          ventaId,
          numeroVenta: ventaData.numeroVenta || 'Sin número',
          clienteNombre: ventaData.clienteNombre || 'N/A',
          clienteDNI: ventaData.clienteDNI || 'N/A',
          fechaVenta: ventaData.fechaVenta,
          estado: ventaData.estado || 'N/A',
          totalVenta: ventaData.totalVenta || 0,
          empleadoId: ventaData.empleadoId || 'N/A',
          metodoPago: ventaData.metodoPago || 'N/A',
          items, // items de este producto en esta venta
        };
      } catch {
        return {
          ventaId,
          numeroVenta: 'Error al cargar',
          clienteNombre: 'N/A',
          items,
        };
      }
    })
  );

  // Ordenar por fecha descendente
  return ventasConDatos.sort((a, b) => {
    const fa = a.fechaVenta?.toDate?.() || new Date(0);
    const fb = b.fechaVenta?.toDate?.() || new Date(0);
    return fb - fa;
  });
}

// ─── Formatear fecha ─────────────────────────────────────────────────────────
function formatFecha(ts) {
  if (!ts) return 'Sin fecha';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ─── Badge de estado ─────────────────────────────────────────────────────────
function EstadoBadge({ estado }) {
  const map = {
    completada: 'bg-green-100 text-green-800 border-green-200',
    borrador: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    anulada: 'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize ${map[estado] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {estado}
    </span>
  );
}

// ─── Componente: fila de venta expandible ────────────────────────────────────
function VentaRow({ venta, idx }) {
  const [expanded, setExpanded] = useState(false);

  const totalCantidad = venta.items.reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0);
  const totalSubtotal = venta.items.reduce((s, i) => s + (parseFloat(i.subtotal) || 0), 0);

  return (
    <div className={`border border-gray-200 rounded-xl overflow-hidden transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
      {/* Fila principal */}
      <div
        className="grid grid-cols-12 gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50/40 transition-colors items-center"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="col-span-2">
          <div className="font-mono text-sm font-bold text-gray-800">{venta.numeroVenta}</div>
          <EstadoBadge estado={venta.estado} />
        </div>

        <div className="col-span-3 flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <div>
            <div className="text-sm font-medium text-gray-800 leading-tight">{venta.clienteNombre}</div>
            <div className="text-xs text-gray-500">{venta.clienteDNI !== 'N/A' ? `DNI: ${venta.clienteDNI}` : ''}</div>
          </div>
        </div>

        <div className="col-span-2 flex items-center gap-1 text-xs text-gray-600">
          <CalendarIcon className="h-4 w-4 text-gray-400" />
          <span>{formatFecha(venta.fechaVenta)}</span>
        </div>

        <div className="col-span-2 text-center">
          <div className="text-sm font-semibold text-indigo-700">
            {totalCantidad} ud{totalCantidad !== 1 ? 's' : ''}
          </div>
          <div className="text-xs text-gray-500">
            {venta.items.length > 1 ? `${venta.items.length} lotes` : '1 lote'}
          </div>
        </div>

        <div className="col-span-2 text-right">
          <div className="text-sm font-bold text-gray-900">S/. {totalSubtotal.toFixed(2)}</div>
          <div className="text-xs text-gray-400 capitalize">{venta.metodoPago}</div>
        </div>

        <div className="col-span-1 flex justify-end">
          {expanded
            ? <ChevronUpIcon className="h-5 w-5 text-gray-400" />
            : <ChevronDownIcon className="h-5 w-5 text-gray-400" />
          }
        </div>
      </div>

      {/* Detalle expandible: items/lotes */}
      {expanded && (
        <div className="border-t border-gray-100 bg-indigo-50/30 px-6 py-4">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-3">
            Detalle de lotes para este producto
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="pb-2 font-semibold">Lote</th>
                <th className="pb-2 font-semibold text-center">Cantidad</th>
                <th className="pb-2 font-semibold text-right">P. Compra</th>
                <th className="pb-2 font-semibold text-right">P. Venta</th>
                <th className="pb-2 font-semibold text-right">Subtotal</th>
                <th className="pb-2 font-semibold text-right">Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {venta.items.map((item, i) => (
                <tr key={item.id || i} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 font-mono text-xs text-gray-600">{item.numeroLote || item.loteId || 'N/A'}</td>
                  <td className="py-2 text-center font-medium">{item.cantidad}</td>
                  <td className="py-2 text-right text-gray-600">S/. {parseFloat(item.precioCompraUnitario || 0).toFixed(2)}</td>
                  <td className="py-2 text-right text-gray-800 font-medium">S/. {parseFloat(item.precioVentaUnitario || 0).toFixed(2)}</td>
                  <td className="py-2 text-right font-bold text-gray-900">S/. {parseFloat(item.subtotal || 0).toFixed(2)}</td>
                  <td className={`py-2 text-right font-semibold ${parseFloat(item.gananciaTotal || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    S/. {parseFloat(item.gananciaTotal || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-100/50">
                <td className="pt-2 text-xs font-bold text-indigo-700 uppercase">TOTAL</td>
                <td className="pt-2 text-center font-bold text-indigo-700">{totalCantidad}</td>
                <td></td>
                <td></td>
                <td className="pt-2 text-right font-bold text-indigo-700">S/. {totalSubtotal.toFixed(2)}</td>
                <td className="pt-2 text-right font-bold text-green-700">
                  S/. {venta.items.reduce((s, i) => s + (parseFloat(i.gananciaTotal) || 0), 0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-3 flex gap-6 text-xs text-gray-500">
            <span><span className="font-medium">Empleado:</span> {venta.empleadoId}</span>
            <span><span className="font-medium">ID Venta:</span> <span className="font-mono">{venta.ventaId}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function BuscarVentasPorProducto() {
  const [searchTerm, setSearchTerm] = useState('');
  const [productos, setProductos] = useState([]);
  const [buscandoProductos, setBuscandoProductos] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [buscandoVentas, setBuscandoVentas] = useState(false);
  const [error, setError] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);

  // Debounce búsqueda de productos
  useEffect(() => {
    if (!searchTerm.trim() || productoSeleccionado) {
      setProductos([]);
      setShowDropdown(false);
      return;
    }
    const t = setTimeout(async () => {
      setBuscandoProductos(true);
      try {
        const res = await buscarProductos(searchTerm);
        setProductos(res.slice(0, 20));
        setShowDropdown(true);
      } catch (err) {
        setError('Error buscando productos: ' + err.message);
      } finally {
        setBuscandoProductos(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm, productoSeleccionado]);

  const handleSelectProducto = async (producto) => {
    setProductoSeleccionado(producto);
    setSearchTerm(producto.nombre);
    setShowDropdown(false);
    setProductos([]);
    setVentas([]);
    setError(null);
    setBuscandoVentas(true);
    try {
      const resultado = await buscarVentasPorProducto(producto.id);
      setVentas(resultado);
    } catch (err) {
      setError('Error buscando ventas: ' + err.message);
    } finally {
      setBuscandoVentas(false);
    }
  };

  const handleClear = () => {
    setSearchTerm('');
    setProductoSeleccionado(null);
    setVentas([]);
    setProductos([]);
    setError(null);
    inputRef.current?.focus();
  };

  // Totales resumen
  const totalUnidades = ventas.reduce((s, v) =>
    s + v.items.reduce((si, i) => si + (parseFloat(i.cantidad) || 0), 0), 0);
  const totalMonto = ventas.reduce((s, v) =>
    s + v.items.reduce((si, i) => si + (parseFloat(i.subtotal) || 0), 0), 0);
  const totalGanancia = ventas.reduce((s, v) =>
    s + v.items.reduce((si, i) => si + (parseFloat(i.gananciaTotal) || 0), 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <ClipboardDocumentListIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Rastreo de Ventas por Producto</h1>
              <p className="text-sm text-gray-500">Admin — Encuentra todas las ventas que contienen un producto específico</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Buscador */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6 relative">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Buscar producto
          </label>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                if (productoSeleccionado) setProductoSeleccionado(null);
              }}
              placeholder="Nombre, código de tienda, código proveedor, marca..."
              className="w-full pl-12 pr-12 py-3.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
            {(searchTerm || productoSeleccionado) && (
              <button onClick={handleClear} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Dropdown de productos */}
          {showDropdown && (
            <div className="absolute left-6 right-6 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto">
              {buscandoProductos ? (
                <div className="flex items-center justify-center py-8 text-gray-500 text-sm gap-2">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" /> Buscando...
                </div>
              ) : productos.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">No se encontraron productos</div>
              ) : (
                productos.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProducto(p)}
                    className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-gray-100 last:border-0 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <CubeIcon className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{p.nombre}</div>
                          <div className="text-xs text-gray-500 flex gap-3 flex-wrap">
                            {p.codigoTienda && <span>Cód: {p.codigoTienda}</span>}
                            {p.codigoProveedor && <span>Prov: {p.codigoProveedor}</span>}
                            {p.marca && <span>{p.marca}</span>}
                            {p.medida && <span>{p.medida}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                          Stock: {p.stockActual ?? 0}
                        </div>
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

        {/* Cargando ventas */}
        {buscandoVentas && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <ArrowPathIcon className="h-8 w-8 animate-spin mb-3 text-indigo-500" />
            <p className="text-sm">Buscando en todas las ventas...</p>
          </div>
        )}

        {/* Producto seleccionado + resultados */}
        {productoSeleccionado && !buscandoVentas && (
          <>
            {/* Info del producto */}
            <div className="bg-indigo-600 text-white rounded-2xl p-5 mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CubeIcon className="h-8 w-8 text-indigo-200" />
                <div>
                  <h2 className="font-bold text-lg leading-tight">{productoSeleccionado.nombre}</h2>
                  <div className="flex gap-4 text-indigo-200 text-xs mt-0.5 flex-wrap">
                    {productoSeleccionado.codigoTienda && <span>Cód: {productoSeleccionado.codigoTienda}</span>}
                    {productoSeleccionado.codigoProveedor && <span>Prov: {productoSeleccionado.codigoProveedor}</span>}
                    {productoSeleccionado.marca && <span>{productoSeleccionado.marca}</span>}
                    {productoSeleccionado.medida && <span>{productoSeleccionado.medida}</span>}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">{ventas.length}</div>
                <div className="text-indigo-200 text-sm">venta{ventas.length !== 1 ? 's' : ''} encontrada{ventas.length !== 1 ? 's' : ''}</div>
              </div>
            </div>

            {/* Tarjetas resumen */}
            {ventas.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Total Unidades</p>
                  <p className="text-2xl font-bold text-gray-900">{totalUnidades}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Monto Total</p>
                  <p className="text-2xl font-bold text-indigo-700">S/. {totalMonto.toFixed(2)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Ganancia Total</p>
                  <p className={`text-2xl font-bold ${totalGanancia >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    S/. {totalGanancia.toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {/* Sin resultados */}
            {ventas.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center">
                <ShoppingCartIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-600 mb-1">No se encontraron ventas</h3>
                <p className="text-sm text-gray-400">
                  Este producto no aparece en ninguna venta registrada.
                </p>
              </div>
            ) : (
              <>
                {/* Encabezado de tabla */}
                <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  <div className="col-span-2">N° Venta</div>
                  <div className="col-span-3">Cliente</div>
                  <div className="col-span-2">Fecha</div>
                  <div className="col-span-2 text-center">Cantidad</div>
                  <div className="col-span-2 text-right">Subtotal</div>
                  <div className="col-span-1"></div>
                </div>

                {/* Filas de ventas */}
                <div className="space-y-2">
                  {ventas.map((venta, idx) => (
                    <VentaRow key={venta.ventaId} venta={venta} idx={idx} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Estado inicial */}
        {!productoSeleccionado && !buscandoVentas && !error && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-20 text-center">
            <MagnifyingGlassIcon className="h-14 w-14 text-gray-300 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-500 text-lg mb-1">Busca un producto para comenzar</h3>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Escribe el nombre, código o marca del producto y selecciónalo para ver todas las ventas en las que aparece.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}