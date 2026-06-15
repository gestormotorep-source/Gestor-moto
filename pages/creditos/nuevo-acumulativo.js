// pages/creditos/nuevo-acumulativo.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import ProductSearchItem from '../../components/ProductSearchItem';
import ProductDetailsModal from '../../components/modals/ProductDetailsModal';
import ProductModelsModal from '../../components/modals/ProductModelsModal';
import { db } from '../../lib/firebase';
import {
  collection, query, where, getDocs, doc, getDoc,
  addDoc, updateDoc, serverTimestamp, orderBy, limit, runTransaction
} from 'firebase/firestore';
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  UserIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  XMarkIcon,
  HashtagIcon,
  CreditCardIcon,
  PencilIcon
} from '@heroicons/react/24/outline';

const NuevoCreditoAcumulativoPage = () => {
  const { user } = useAuth();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ── Búsqueda de cliente ───────────────────────────────────────────────
  const [searchCliente, setSearchCliente] = useState('');
  const [clientesEncontrados, setClientesEncontrados] = useState([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [creditoActivoExistente, setCreditoActivoExistente] = useState(null);

  // ── Búsqueda de producto ──────────────────────────────────────────────
  const [searchProducto, setSearchProducto] = useState('');
  const [productosEncontrados, setProductosEncontrados] = useState([]);
  const [buscandoProducto, setBuscandoProducto] = useState(false);

  // ── Items del crédito ─────────────────────────────────────────────────
  const [items, setItems] = useState([]);

  // ── Modal cantidad ────────────────────────────────────────────────────
  const [showModalCantidad, setShowModalCantidad] = useState(false);
  const [productoModal, setProductoModal] = useState(null);
  const [cantidadModal, setCantidadModal] = useState(1);
  const [precioModal, setPrecioModal] = useState(0);
  const [lotesProducto, setLotesProducto] = useState([]);
  const [loteSeleccionado, setLoteSeleccionado] = useState(null);

  const [isProductDetailsModalOpen, setIsProductDetailsModalOpen] = useState(false);
  const [isProductModelsModalOpen, setIsProductModelsModalOpen] = useState(false);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState(null);
  const [selectedProductForModels, setSelectedProductForModels] = useState(null);

  const [nombrePersonalizado, setNombrePersonalizado] = useState('');

  const PRODUCTOS_VARIOS_IDS = new Set([
    '0CPwiOhioNxNZ8lLddtc',
    'ntnhqzYi8E7yaccrivU4',
  ]);

  // Modal de edición
  const [showModalEditar, setShowModalEditar] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editCantidad, setEditCantidad] = useState(1);
  const [editPrecio, setEditPrecio] = useState(0);

  // ── Observaciones ─────────────────────────────────────────────────────
  const [observaciones, setObservaciones] = useState('');

  useEffect(() => {
    if (!user) router.push('/auth');
  }, [user, router]);

  // ── Buscar clientes ───────────────────────────────────────────────────
  const buscarClientes = async (termino) => {
    if (!termino.trim()) { setClientesEncontrados([]); return; }
    setBuscandoCliente(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'cliente'),
        where('tieneCredito', '==', true)
      ));
      const terminoLower = termino.toLowerCase();
      const resultados = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c =>
          (c.nombre || '').toLowerCase().includes(terminoLower) ||
          (c.apellido || '').toLowerCase().includes(terminoLower) ||
          (c.dni || '').includes(termino)
        )
        .slice(0, 8);
      setClientesEncontrados(resultados);
    } catch (err) {
      console.error('Error buscando clientes:', err);
    } finally {
      setBuscandoCliente(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => buscarClientes(searchCliente), 300);
    return () => clearTimeout(t);
  }, [searchCliente]);

  // ── Seleccionar cliente y verificar crédito activo ────────────────────
  const seleccionarCliente = async (cliente) => {
    setClienteSeleccionado(cliente);
    setSearchCliente('');
    setClientesEncontrados([]);
    setCreditoActivoExistente(null);

    // Verificar si ya tiene un crédito acumulativo activo
    try {
      const snap = await getDocs(query(
        collection(db, 'creditos'),
        where('clienteId', '==', cliente.id),
        where('tipo', '==', 'acumulativo'),
        where('estado', '==', 'activo'),
        limit(1)
      ));
      if (!snap.empty) {
        setCreditoActivoExistente({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
    } catch (err) {
      console.error('Error verificando crédito activo:', err);
    }
  };

  // ── Buscar productos ──────────────────────────────────────────────────
  const buscarProductos = async (termino) => {
    if (!termino.trim()) { setProductosEncontrados([]); return; }
    setBuscandoProducto(true);
    try {
      const idsVistos = new Set();
      let candidatos = [];
      const termUpper = termino.trim().toUpperCase();
      const palabras = termUpper.split(/[\s\-\/\.]+/).filter(p => p.length >= 1);

      if (palabras.length > 0) {
        const queries = palabras.flatMap(palabra => [
          getDocs(query(collection(db, 'productos'), where('palabrasClave', 'array-contains', palabra), limit(200))),
          getDocs(query(collection(db, 'productos'), where('nombre', '>=', palabra), where('nombre', '<=', palabra + '\uf8ff'), limit(100))),
        ]);

        queries.push(
          getDocs(query(collection(db, 'productos'), where('codigoTienda', '==', termUpper), limit(10))),
          getDocs(query(collection(db, 'productos'), where('codigoProveedor', '==', termUpper), limit(10))),
          getDocs(query(collection(db, 'productos'), where('codigoTienda', '>=', termUpper), where('codigoTienda', '<=', termUpper + '\uf8ff'), limit(100))),
          getDocs(query(collection(db, 'productos'), where('codigoProveedor', '>=', termUpper), where('codigoProveedor', '<=', termUpper + '\uf8ff'), limit(100))),
        );

        // Búsqueda por subcadena en códigos (prefijos A-Z)
        const prefijos = ['', 'A','B','C','D','E','F','G','H','I','J','K','L',
                          'M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
        prefijos.forEach(prefijo => {
          const busqueda = prefijo + termUpper;
          queries.push(
            getDocs(query(collection(db, 'productos'), where('codigoTienda', '>=', busqueda), where('codigoTienda', '<=', busqueda + '\uf8ff'), limit(20))),
            getDocs(query(collection(db, 'productos'), where('codigoProveedor', '>=', busqueda), where('codigoProveedor', '<=', busqueda + '\uf8ff'), limit(20))),
          );
        });

        const resultados = await Promise.all(queries);
        resultados.forEach(snap => {
          snap.docs.forEach(d => {
            if (!idsVistos.has(d.id)) {
              idsVistos.add(d.id);
              candidatos.push({ id: d.id, ...d.data() });
            }
          });
        });

        // Filtro local por subcadena en todos los campos
        candidatos = candidatos.filter(p => {
          const nombreUpper     = (p.nombre          || '').toUpperCase();
          const claves          = (p.palabrasClave   || []);
          const codigoTienda    = (p.codigoTienda    || '').toUpperCase();
          const codigoProveedor = (p.codigoProveedor || '').toUpperCase();

          return palabras.every(palabra =>
            nombreUpper.includes(palabra)                  ||
            claves.some(c => c.includes(palabra))         ||
            codigoTienda.includes(palabra)                ||
            codigoProveedor.includes(palabra)
          );
        });
      }

      setProductosEncontrados(candidatos.slice(0, 20));
    } catch (err) {
      console.error('Error buscando productos:', err);
    } finally {
      setBuscandoProducto(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => buscarProductos(searchProducto), 300);
    return () => clearTimeout(t);
  }, [searchProducto]);

  // ── Abrir modal cantidad al seleccionar producto ──────────────────────
  const abrirModalCantidad = async (producto) => {
    setProductoModal(producto);
    setCantidadModal(1);
    setPrecioModal(parseFloat(producto.precioVentaDefault || 0));
    setLoteSeleccionado(null);
    setNombrePersonalizado('');
    setShowModalCantidad(true);
    setSearchProducto('');
    setProductosEncontrados([]);

    // Cargar lotes activos del producto
    try {
      const snap = await getDocs(query(
        collection(db, 'lotes'),
        where('productoId', '==', producto.id),
        where('estado', '==', 'activo'),
        orderBy('fechaIngreso', 'desc'),
        limit(5)
      ));
      const lotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLotesProducto(lotes);
      if (lotes.length === 1) {
        setLoteSeleccionado(lotes[0]);
        setPrecioModal(parseFloat(lotes[0].precioVentaUnitario || producto.precioVentaDefault || 0));
      }
    } catch (err) {
      console.error('Error cargando lotes:', err);
      setLotesProducto([]);
    }
  };

  // ── Agregar item desde el modal ───────────────────────────────────────
  const agregarItem = () => {
    if (!productoModal) return;
    if (cantidadModal <= 0) { setError('La cantidad debe ser mayor a 0'); return; }
    if (!loteSeleccionado && lotesProducto.length > 0) { setError('Selecciona un lote'); return; }
    if (loteSeleccionado && cantidadModal > (loteSeleccionado.stockRestante || 0)) {
      setError(`Stock insuficiente. Disponible: ${loteSeleccionado.stockRestante}`);
      return;
    }

    const nuevoItem = {
      tempId: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      productoId: productoModal.id,
      nombreProducto: productoModal.nombre,
      nombrePersonalizado: nombrePersonalizado.trim() || null,
      marca: productoModal.marca || '',
      medida: productoModal.medida || '',
      codigoTienda: productoModal.codigoTienda || '',
      codigoProveedor: productoModal.codigoProveedor || '',
      color: productoModal.color || '',
      cantidad: cantidadModal,
      precioVentaUnitario: precioModal,
      precioVentaMinimo: parseFloat(productoModal.precioVentaMinimo || 0),
      precioCompraUnitario: loteSeleccionado
        ? parseFloat(loteSeleccionado.precioCompraUnitario || 0)
        : parseFloat(productoModal.precioCompraDefault || 0),
      subtotal: cantidadModal * precioModal,
      loteId: loteSeleccionado?.id || null,
      numeroLote: loteSeleccionado?.numeroLote || null,
      estado: 'activo',
    };

    setItems(prev => [...prev, nuevoItem]);
    setShowModalCantidad(false);
    setNombrePersonalizado('');
    setError(null);
  };

  const abrirModalEditar = (item) => {
    setEditingItem(item);
    setEditCantidad(item.cantidad);
    setEditPrecio(parseFloat(item.precioVentaUnitario || 0));
    setShowModalEditar(true);
  };

  const guardarEdicionItem = () => {
    if (!editingItem) return;
    if (editCantidad <= 0) { setError('La cantidad debe ser mayor a 0'); return; }

    // Validar stock del lote si tiene uno asignado
    if (editingItem.loteId) {
      // Buscamos el stock restante del lote tal como estaba al agregarlo
      // (no recargamos de Firestore aquí; usamos el límite ya conocido)
    }

    setItems(prev => prev.map(i => {
      if (i.tempId !== editingItem.tempId) return i;
      return {
        ...i,
        cantidad: editCantidad,
        precioVentaUnitario: editPrecio,
        nombrePersonalizado: editingItem.nombrePersonalizado ?? null,
        subtotal: editCantidad * editPrecio,
      };
    }));

    setShowModalEditar(false);
    setEditingItem(null);
    setError(null);
  };

  // ── Eliminar item ─────────────────────────────────────────────────────
  const eliminarItem = (tempId) => {
    setItems(prev => prev.filter(i => i.tempId !== tempId));
  };

  // ── Total ─────────────────────────────────────────────────────────────
  const totalCredito = items.reduce((s, i) => s + parseFloat(i.subtotal || 0), 0);

  // ── Guardar ───────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clienteSeleccionado) { setError('Selecciona un cliente'); return; }
    if (items.length === 0) { setError('Agrega al menos un producto'); return; }
    if (creditoActivoExistente) { setError('Este cliente ya tiene un crédito acumulativo activo'); return; }

    setSaving(true);
    setError(null);

    try {
      await runTransaction(db, async (transaction) => {
        // ══ FASE 1: TODOS LOS READS ══════════════════════════════════════════

        // Leer lotes
        const lotesSnaps = {};
        for (const item of items) {
          if (item.loteId) {
            const loteRef = doc(db, 'lotes', item.loteId);
            lotesSnaps[item.loteId] = await transaction.get(loteRef);
          }
        }

        // Leer productos únicos
        const productosUnicos = [...new Set(items.map(i => i.productoId))];
        const productosSnaps = {};
        for (const productoId of productosUnicos) {
          const productoRef = doc(db, 'productos', productoId);
          productosSnaps[productoId] = await transaction.get(productoRef);
        }

        // Leer cliente
        const clienteRef = doc(db, 'cliente', clienteSeleccionado.id);
        const clienteSnap = await transaction.get(clienteRef);

        // ══ FASE 2: VALIDACIONES (sin reads) ════════════════════════════════

        for (const item of items) {
          if (item.loteId) {
            const loteSnap = lotesSnaps[item.loteId];
            if (!loteSnap.exists()) throw new Error(`Lote ${item.numeroLote} no encontrado`);
            const stockActual = loteSnap.data().stockRestante || 0;
            if (item.cantidad > stockActual) {
              throw new Error(`Stock insuficiente para ${item.nombreProducto}. Disponible: ${stockActual}`);
            }
          }
        }

        // ══ FASE 3: TODOS LOS WRITES ════════════════════════════════════════

        // Crear crédito
        const creditoRef = doc(collection(db, 'creditos'));
        const ahora = new Date();
        const numeroCredito = `CAC-${ahora.getFullYear().toString().slice(-2)}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}-${Date.now().toString().slice(-4)}`;

        transaction.set(creditoRef, {
          tipo: 'acumulativo',
          numeroCredito,
          clienteId: clienteSeleccionado.id,
          clienteNombre: `${clienteSeleccionado.nombre} ${clienteSeleccionado.apellido || ''}`.trim(),
          clienteDNI: clienteSeleccionado.dni || '',
          estado: 'activo',
          montoTotal: totalCredito,
          montoPagado: 0,
          saldoPendiente: totalCredito,
          observaciones: observaciones.trim() || null,
          fechaApertura: serverTimestamp(),
          fechaSaldado: null,
          creadoPor: user.email || user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Items del crédito
        for (const item of items) {
          const itemRef = doc(collection(db, 'creditos', creditoRef.id, 'itemsCredito'));
          transaction.set(itemRef, {
            productoId: item.productoId,
            nombreProducto: item.nombreProducto,
            nombrePersonalizado: item.nombrePersonalizado || null,
            marca: item.marca || '',
            medida: item.medida || '',
            codigoTienda: item.codigoTienda || '',
            codigoProveedor: item.codigoProveedor || '',
            color: item.color || '',
            cantidad: item.cantidad,
            precioVentaUnitario: item.precioVentaUnitario,
            precioVentaMinimo: item.precioVentaMinimo || 0,
            precioCompraUnitario: item.precioCompraUnitario,
            subtotal: item.subtotal,
            loteId: item.loteId || null,
            numeroLote: item.numeroLote || null,
            estado: 'activo',
            fechaAgregado: serverTimestamp(),
            agregadoPor: user.email || user.uid,
            createdAt: serverTimestamp(),
          });
        }

        // Descontar stock de lotes
        for (const item of items) {
          if (item.loteId) {
            const loteRef = doc(db, 'lotes', item.loteId);
            const stockActual = lotesSnaps[item.loteId].data().stockRestante || 0;
            transaction.update(loteRef, {
              stockRestante: stockActual - item.cantidad,
              updatedAt: serverTimestamp(),
            });
          }
        }

        // Actualizar stock de productos
        for (const productoId of productosUnicos) {
          const productoRef = doc(db, 'productos', productoId);
          const productoSnap = productosSnaps[productoId];
          if (productoSnap.exists()) {
            const stockActual = productoSnap.data().stockActual || 0;
            const cantidadTotal = items
              .filter(i => i.productoId === productoId)
              .reduce((s, i) => s + i.cantidad, 0);
            transaction.update(productoRef, {
              stockActual: Math.max(0, stockActual - cantidadTotal),
              updatedAt: serverTimestamp(),
            });
          }
        }

        // Actualizar cliente
        const montoActual = clienteSnap.exists() ? (clienteSnap.data().montoCreditoActual || 0) : 0;
        transaction.update(clienteRef, {
          montoCreditoActual: montoActual + totalCredito,
          updatedAt: serverTimestamp(),
        });
      });

      router.push('/creditos/activos');
    } catch (err) {
      console.error('Error creando crédito acumulativo:', err);
      setError('Error al crear el crédito: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <Layout title="Nuevo Crédito Acumulativo">
      <div className="max-w-full px-2 py-4">
        {error && (
          <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 max-w-md flex items-start gap-2">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 text-red-500 hover:text-red-700">
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <HashtagIcon className="h-7 w-7 text-purple-600" />
              Nuevo Crédito Acumulativo
            </h1>
            <button
              onClick={() => router.push('/creditos/activos')}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Volver
            </button>
          </div>

          <div className="grid grid-cols-12 gap-6 p-6">

            {/* ── Panel Izquierdo ── */}
            <div className="col-span-12 lg:col-span-3 space-y-5">

              {/* Selección de cliente */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <UserIcon className="h-5 w-5 text-purple-600" />
                  1. Seleccionar Cliente
                </h2>

                {!clienteSeleccionado ? (
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchCliente}
                      onChange={e => setSearchCliente(e.target.value)}
                      placeholder="Buscar por nombre o DNI..."
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    {buscandoCliente && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600" />
                      </div>
                    )}

                    {clientesEncontrados.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-30 mt-1 max-h-60 overflow-y-auto">
                        {clientesEncontrados.map(c => (
                          <div
                            key={c.id}
                            onClick={() => seleccionarCliente(c)}
                            className="px-3 py-2.5 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          >
                            <p className="font-medium text-sm text-gray-900">{c.nombre} {c.apellido || ''}</p>
                            <p className="text-xs text-gray-500">DNI: {c.dni || 'N/A'} · Deuda: S/. {parseFloat(c.montoCreditoActual || 0).toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white border border-purple-200 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900">{clienteSeleccionado.nombre} {clienteSeleccionado.apellido || ''}</p>
                        <p className="text-xs text-gray-500 mt-0.5">DNI: {clienteSeleccionado.dni || 'N/A'}</p>
                        <p className="text-xs text-gray-500">Deuda actual: <span className="font-medium text-red-600">S/. {parseFloat(clienteSeleccionado.montoCreditoActual || 0).toFixed(2)}</span></p>
                      </div>
                      <button
                        onClick={() => { setClienteSeleccionado(null); setCreditoActivoExistente(null); }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Alerta si ya tiene crédito acumulativo activo */}
                    {creditoActivoExistente && (
                      <div className="mt-3 bg-amber-50 border border-amber-300 rounded-lg p-3">
                        <p className="text-xs font-semibold text-amber-800">⚠️ Ya tiene un crédito acumulativo activo</p>
                        <p className="text-xs text-amber-700 mt-1">
                          Saldo: S/. {parseFloat(creditoActivoExistente.saldoPendiente || 0).toFixed(2)}
                        </p>
                        <button
                          onClick={() => router.push(`/creditos/acumulativo/${creditoActivoExistente.id}`)}
                          className="mt-2 text-xs font-medium text-amber-800 underline hover:text-amber-900"
                        >
                          Ir al crédito existente →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Observaciones */}
              <div className="bg-gray-50 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Observaciones (opcional)</label>
                <textarea
                  value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                  rows={3}
                  placeholder="Notas sobre este crédito..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Resumen y botón submit */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-medium text-gray-700">Productos:</span>
                  <span className="font-semibold text-gray-900">{items.length}</span>
                </div>
                <div className="flex justify-between items-center mb-5">
                  <span className="text-base font-semibold text-gray-700">Total Crédito:</span>
                  <span className="text-2xl font-bold text-purple-700">S/. {totalCredito.toFixed(2)}</span>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={saving || !clienteSeleccionado || items.length === 0 || !!creditoActivoExistente}
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent text-base font-semibold rounded-lg shadow-sm text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="h-5 w-5 mr-2" />
                      Crear Crédito
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* ── Panel Derecho ── */}
            <div className="col-span-12 lg:col-span-9 space-y-5">

              {/* Buscador de productos */}
              <div className="bg-white border border-gray-400 rounded-lg relative">
                <div className="p-4">
                  <h2 className="text-lg font-semibold mb-4 text-gray-800">2. Agregar Productos</h2>
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchProducto}
                      onChange={e => setSearchProducto(e.target.value)}
                      placeholder="Nombre, marca, código..."
                      className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    {searchProducto && (
                      <button
                        onClick={() => { setSearchProducto(''); setProductosEncontrados([]); }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    {!searchProducto.trim() ? 'Escribe para buscar productos...' : buscandoProducto ? 'Buscando...' : `${productosEncontrados.length} productos encontrados`}
                  </div>
                </div>

                {/* Dropdown de productos */}
                {searchProducto.trim() !== '' && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-400 rounded-b-lg shadow-lg z-40 max-h-96 overflow-y-auto">
                    {buscandoProducto ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
                      </div>
                    ) : productosEncontrados.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        <p>No se encontraron productos</p>
                      </div>
                    ) : (
                      <div>
                        {productosEncontrados.slice(0, 20).map(p => (
                          <ProductSearchItem
                            key={p.id}
                            producto={p}
                            onSelectProduct={(prod) => { abrirModalCantidad(prod); }}
                            onClearSearch={() => { setSearchProducto(''); setProductosEncontrados([]); }}
                            onOpenDetails={(prod) => { setSelectedProductForDetails(prod); setIsProductDetailsModalOpen(true); }}
                            onOpenModels={(prod) => { setSelectedProductForModels(prod); setIsProductModelsModalOpen(true); }}
                          />
                        ))}
                        {productosEncontrados.length > 20 && (
                          <div className="p-3 text-center text-sm text-gray-500 bg-gray-50">
                            Mostrando 20 de {productosEncontrados.length} resultados.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tabla de items */}
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-base font-semibold text-gray-800">
                    Productos del Crédito
                    {items.length > 0 && <span className="ml-2 text-sm font-normal text-gray-500">({items.length})</span>}
                  </h3>
                </div>

                <div className="p-4">
                  {items.length === 0 ? (
                    <div className="text-center py-12">
                      <PlusIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-gray-500 text-sm">Busca y agrega productos al crédito</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse min-w-[900px]">
                        <thead className="bg-purple-50">
                          <tr className="border-b border-gray-300">
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">C. TIENDA</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase min-w-48">PRODUCTO</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">C. PROVEEDOR</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">LOTE</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">MARCA</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">MEDIDA</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">COLOR</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">CANT.</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">P. COMPRA</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">P. VENTA MIN</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">P. UNIT.</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">SUBTOTAL</th>
                            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">ACCIÓN</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, idx) => (
                            <tr key={item.tempId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm text-gray-900 font-medium">{item.codigoTienda || 'N/A'}</span>
                              </td>
                              <td className="px-3 py-3 min-w-48">
                                <p className="text-sm font-medium text-gray-900">{item.nombreProducto}</p>
                                {item.nombrePersonalizado && (
                                  <div className="text-xs text-blue-600 font-semibold mt-0.5">
                                    → {item.nombrePersonalizado}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm text-gray-700 font-mono">{item.codigoProveedor || 'N/A'}</span>
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                {item.numeroLote
                                  ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 font-mono">{item.numeroLote}</span>
                                  : <span className="text-xs text-gray-400">—</span>
                                }
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm text-gray-700">{item.marca || 'Sin marca'}</span>
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm text-gray-700">{item.medida || 'N/A'}</span>
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm text-gray-700">{item.color || 'N/A'}</span>
                              </td>
                              <td className="px-3 py-3 text-center text-sm font-medium text-gray-900 whitespace-nowrap">{item.cantidad}</td>
                              <td className="px-3 py-3 text-center text-sm text-gray-700 whitespace-nowrap">S/. {parseFloat(item.precioCompraUnitario || 0).toFixed(2)}</td>
                              <td className="px-3 py-3 text-center text-sm text-gray-700 whitespace-nowrap">S/. {parseFloat(item.precioVentaMinimo || 0).toFixed(2)}</td>
                              <td className="px-3 py-3 text-center text-sm text-gray-700 whitespace-nowrap">S/. {parseFloat(item.precioVentaUnitario || 0).toFixed(2)}</td>
                              <td className="px-3 py-3 text-center text-sm font-semibold text-gray-900 whitespace-nowrap">S/. {parseFloat(item.subtotal || 0).toFixed(2)}</td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <div className="flex justify-center gap-2">
                                  <button
                                    onClick={() => abrirModalEditar(item)}
                                    className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors"
                                    title="Editar"
                                  >
                                    <PencilIcon className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => eliminarItem(item.tempId)}
                                    className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                                    title="Eliminar"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={13} className="p-0">
                              <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 border-t border-gray-300 rounded-b-lg">
                                <div className="flex justify-between items-center">
                                  <div>
                                    <h3 className="text-base font-semibold">Total del Crédito</h3>
                                    <p className="text-purple-200 text-sm">{items.length} producto{items.length !== 1 ? 's' : ''}</p>
                                  </div>
                                  <div className="text-3xl font-bold">S/. {totalCredito.toFixed(2)}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal Cantidad — diseño grande 2 columnas igual a nueva.js ── */}
      {showModalCantidad && productoModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowModalCantidad(false)} />
            <div className="relative bg-white rounded-xl shadow-xl w-[95vw] max-w-5xl p-10">

              <button onClick={() => setShowModalCantidad(false)}
                className="absolute right-4 top-4 rounded-md text-gray-400 hover:text-gray-500">
                <XMarkIcon className="h-6 w-6" />
              </button>

              <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <CreditCardIcon className="h-7 w-7 text-purple-600" />
                Agregar Producto a Crédito
              </h3>

              <div className="grid grid-cols-2 gap-8 items-stretch">

                {/* COLUMNA IZQUIERDA — info + lotes + precios referencia */}
                <div className="flex flex-col gap-4 h-full">

                  {/* Info del producto */}
                  <div className="bg-gray-50 p-5 rounded-lg border-2 border-purple-200">
                    <h4 className="font-bold text-xl text-gray-900 mb-1">{productoModal.nombre}</h4>
                    {productoModal.codigoProveedor && (
                      <div className="mb-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold bg-purple-100 text-purple-800 font-mono">
                          C. Proveedor: {productoModal.codigoProveedor}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="font-medium text-gray-600">C. Tienda: </span><span className="text-gray-800">{productoModal.codigoTienda || 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-600">Marca: </span><span className="text-gray-800">{productoModal.marca || 'Sin marca'}</span></div>
                      <div><span className="font-medium text-gray-600">Medida: </span><span className="text-gray-800">{productoModal.medida || 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-600">Color: </span><span className="text-gray-800">{productoModal.color || 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-600">Stock: </span><span className="font-bold text-gray-900">{productoModal.stockActual || 0}</span></div>
                    </div>
                  </div>

                  {/* Precios de referencia */}
                  <div className="border border-amber-200 rounded-lg overflow-hidden flex-1">
                    <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                      <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Precios de referencia</span>
                    </div>
                    <div className="divide-y divide-amber-100">
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-gray-600">Precio de compra</span>
                        <span className="text-base font-bold text-amber-800">S/. {parseFloat(productoModal.precioCompraDefault || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-gray-600">Precio venta mínimo</span>
                        <span className="text-base font-bold text-red-700">S/. {parseFloat(productoModal.precioVentaMinimo || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-gray-600">Precio venta sugerido</span>
                        <span className="text-base font-bold text-green-700">S/. {parseFloat(productoModal.precioVentaDefault || 0).toFixed(2)}</span>
                      </div>
                      {/* Lotes disponibles */}
                      {lotesProducto.length > 0 && lotesProducto.map(lote => (
                        <div
                          key={lote.id}
                          onClick={() => {
                            setLoteSeleccionado(lote);
                            setPrecioModal(parseFloat(lote.precioVentaUnitario || productoModal.precioVentaDefault || 0));
                          }}
                          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${loteSeleccionado?.id === lote.id ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                        >
                          <div>
                            <span className="text-sm font-mono font-medium text-gray-800">{lote.numeroLote}</span>
                            <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${(lote.stockRestante || 0) <= 0 ? 'bg-red-100 text-red-700' : (lote.stockRestante || 0) <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              Stock: {lote.stockRestante || 0}
                            </span>
                            {loteSeleccionado?.id === lote.id && (
                              <span className="ml-2 text-xs font-bold text-purple-700">✓ seleccionado</span>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-purple-700">V: S/. {parseFloat(lote.precioVentaUnitario || 0).toFixed(2)}</p>
                            <p className="text-xs text-gray-400">C: S/. {parseFloat(lote.precioCompraUnitario || 0).toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                    <p className="text-sm text-purple-700">⚠️ <strong>Crédito acumulativo:</strong> El stock se descuenta al confirmar.</p>
                  </div>
                </div>

                {/* COLUMNA DERECHA — cantidad, precio, ganancia preview */}
                <div className="flex flex-col gap-5 h-full">

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad</label>
                      <input
                        type="number"
                        value={cantidadModal}
                        onChange={e => setCantidadModal(parseInt(e.target.value) || 1)}
                        min="1"
                        max={loteSeleccionado?.stockRestante || productoModal.stockActual || 999}
                        onWheel={e => e.target.blur()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base"
                      />
                      {loteSeleccionado && (
                        <p className="text-xs text-gray-500 mt-1">Máx disponible: {loteSeleccionado.stockRestante}</p>
                      )}
                    </div>
                    {PRODUCTOS_VARIOS_IDS.has(productoModal?.id) && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nombre descriptivo <span className="text-gray-400 font-normal">(ej: Tuerca, Perno M8...)</span>
                        </label>
                        <input
                          type="text"
                          value={nombrePersonalizado}
                          onChange={e => setNombrePersonalizado(e.target.value)}
                          placeholder="¿Qué producto es?"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Venta (S/.)</label>
                      <input
                        type="number"
                        value={precioModal}
                        onChange={e => setPrecioModal(parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        onWheel={e => e.target.blur()}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent text-base ${
                          precioModal < parseFloat(productoModal.precioVentaMinimo || 0)
                            ? 'border-red-300 focus:ring-red-500 bg-red-50'
                            : 'border-gray-300 focus:ring-purple-500'
                        }`}
                      />
                      {precioModal < parseFloat(productoModal.precioVentaMinimo || 0) && (
                        <p className="text-red-600 text-xs mt-1 font-medium">⚠️ Precio por debajo del mínimo</p>
                      )}
                    </div>
                  </div>

                  {/* Ganancia preview */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Preview de ganancia</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ganancia unit.:</span>
                        <span className={`font-bold ${(precioModal - parseFloat(productoModal.precioCompraDefault || 0)) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          S/. {(precioModal - parseFloat(productoModal.precioCompraDefault || 0)).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ganancia total:</span>
                        <span className={`font-bold ${(cantidadModal * (precioModal - parseFloat(productoModal.precioCompraDefault || 0))) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          S/. {(cantidadModal * (precioModal - parseFloat(productoModal.precioCompraDefault || 0))).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Subtotal + botones al fondo */}
                  <div className="mt-auto flex flex-col gap-4">
                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-5 rounded-lg border border-purple-200">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-gray-700">Subtotal:</span>
                        <span className="font-bold text-purple-800 text-2xl">S/. {(cantidadModal * precioModal).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setShowModalCantidad(false)}
                        className="px-6 py-3 rounded-lg bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-semibold text-base">
                        Cancelar
                      </button>
                      <button
                        onClick={agregarItem}
                        disabled={cantidadModal <= 0 || precioModal < 0}
                        className="px-6 py-3 rounded-lg bg-purple-600 text-white font-semibold text-base hover:bg-purple-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                        Agregar a Crédito
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    
    {/* ── Modal Editar Item ── */}

    {showModalEditar && editingItem && (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowModalEditar(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-[95vw] max-w-5xl p-10">

            <button onClick={() => setShowModalEditar(false)}
              className="absolute right-4 top-4 rounded-md text-gray-400 hover:text-gray-500">
              <XMarkIcon className="h-6 w-6" />
            </button>

            <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <PencilIcon className="h-7 w-7 text-yellow-600" />
              Editar Producto del Crédito
            </h3>

            <div className="grid grid-cols-2 gap-8 items-stretch">

              {/* COLUMNA IZQUIERDA - Info del producto */}
              <div className="flex flex-col gap-4 h-full">
                <div className="bg-gray-50 p-5 rounded-lg border-2 border-yellow-200">
                  <h4 className="font-bold text-xl text-gray-900 mb-1">{editingItem.nombreProducto}</h4>
                  {editingItem.codigoProveedor && (
                    <div className="mb-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold bg-yellow-100 text-yellow-800 font-mono">
                        C. Proveedor: {editingItem.codigoProveedor}
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="font-medium text-gray-600">C. Tienda: </span><span className="text-gray-800">{editingItem.codigoTienda || 'N/A'}</span></div>
                    <div><span className="font-medium text-gray-600">Marca: </span><span className="text-gray-800">{editingItem.marca || 'Sin marca'}</span></div>
                    <div><span className="font-medium text-gray-600">Medida: </span><span className="text-gray-800">{editingItem.medida || 'N/A'}</span></div>
                    <div><span className="font-medium text-gray-600">Color: </span><span className="text-gray-800">{editingItem.color || 'N/A'}</span></div>
                    <div><span className="font-medium text-gray-600">N° Lote: </span><span className="text-gray-700 font-mono text-xs">{editingItem.numeroLote || 'N/A'}</span></div>
                  </div>
                </div>

                {/* Precios de referencia */}
                <div className="border border-amber-200 rounded-lg overflow-hidden flex-1">
                  <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Precios de referencia del lote</span>
                  </div>
                  <div className="divide-y divide-amber-100">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-gray-600">Precio de compra</span>
                      <span className="text-base font-bold text-amber-800">S/. {parseFloat(editingItem.precioCompraUnitario || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-gray-600">Precio venta mínimo</span>
                      <span className="text-base font-bold text-red-700">S/. {parseFloat(editingItem.precioVentaMinimo || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-gray-600">Precio venta actual</span>
                      <span className="text-base font-bold text-green-700">S/. {parseFloat(editingItem.precioVentaUnitario || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* COLUMNA DERECHA - Campos editables */}
              <div className="flex flex-col gap-5 h-full">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad</label>
                    <input
                      type="number"
                      value={editCantidad}
                      onChange={e => setEditCantidad(parseInt(e.target.value) || 1)}
                      min="1"
                      onWheel={e => e.target.blur()}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Venta (S/.)</label>
                    <input
                      type="number"
                      value={editPrecio}
                      onChange={e => setEditPrecio(parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      onWheel={e => e.target.blur()}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent text-base ${
                        editPrecio < parseFloat(editingItem.precioVentaMinimo || 0)
                          ? 'border-red-300 focus:ring-red-500 bg-red-50'
                          : 'border-gray-300 focus:ring-yellow-500'
                      }`}
                    />
                    {editPrecio < parseFloat(editingItem.precioVentaMinimo || 0) && (
                      <p className="text-red-600 text-xs mt-1 font-medium">⚠️ Precio por debajo del mínimo permitido</p>
                    )}
                  </div>
                </div>

                {PRODUCTOS_VARIOS_IDS.has(editingItem?.productoId) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre descriptivo <span className="text-gray-400 font-normal">(ej: Tuerca, Perno M8...)</span>
                    </label>
                    <input
                      type="text"
                      value={editingItem.nombrePersonalizado || ''}
                      onChange={e => setEditingItem(prev => ({ ...prev, nombrePersonalizado: e.target.value }))}
                      placeholder="¿Qué producto es?"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base"
                    />
                  </div>
                )}

                {/* Preview ganancia */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Preview con nuevo precio</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ganancia unit.:</span>
                      <span className={`font-bold ${(editPrecio - parseFloat(editingItem.precioCompraUnitario || 0)) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        S/. {(editPrecio - parseFloat(editingItem.precioCompraUnitario || 0)).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ganancia total:</span>
                      <span className={`font-bold ${(editCantidad * (editPrecio - parseFloat(editingItem.precioCompraUnitario || 0))) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        S/. {(editCantidad * (editPrecio - parseFloat(editingItem.precioCompraUnitario || 0))).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Subtotal + botones al fondo */}
                <div className="mt-auto flex flex-col gap-4">
                  <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-5 rounded-lg border border-yellow-200">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-medium text-gray-700">Nuevo Subtotal:</span>
                      <span className="font-bold text-yellow-800 text-2xl">S/. {(editCantidad * editPrecio).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowModalEditar(false)}
                      className="px-6 py-3 rounded-lg bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-semibold text-base">
                      Cancelar
                    </button>
                    <button
                      onClick={guardarEdicionItem}
                      disabled={editCantidad <= 0 || editPrecio < 0}
                      className="px-6 py-3 rounded-lg bg-yellow-600 text-white font-semibold text-base hover:bg-yellow-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                      Actualizar
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    )}
    <ProductDetailsModal 
      isOpen={isProductDetailsModalOpen} 
      onClose={() => { setIsProductDetailsModalOpen(false); setSelectedProductForDetails(null); }} 
      product={selectedProductForDetails} 
    />
    <ProductModelsModal 
      isOpen={isProductModelsModalOpen} 
      onClose={() => { setIsProductModelsModalOpen(false); setSelectedProductForModels(null); }} 
      product={selectedProductForModels} 
    />
    </Layout>
  );
};

export default NuevoCreditoAcumulativoPage;