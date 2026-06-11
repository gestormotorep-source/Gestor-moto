// pages/creditos/acumulativo/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../contexts/AuthContext';
import Layout from '../../../components/Layout';
import { db } from '../../../lib/firebase';
import {
  collection, query, where, getDocs, doc, getDoc,
  updateDoc, serverTimestamp, orderBy, limit,
  runTransaction, addDoc, onSnapshot
} from 'firebase/firestore';
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  UserIcon,
  BanknotesIcon,
  CreditCardIcon,
  XMarkIcon,
  CheckCircleIcon,
  PencilIcon,
  ArrowUturnLeftIcon,
  LockClosedIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  HashtagIcon
} from '@heroicons/react/24/outline';

// ── Métodos de pago disponibles ────────────────────────────────────────────
const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'yape',     label: 'Yape'     },
  { value: 'plin',     label: 'Plin'     },
  { value: 'tarjeta',  label: 'Tarjeta'  },
  { value: 'transferencia', label: 'Transferencia' },
];

const CreditoAcumulativoPage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const { id } = router.query;

  const [loadingData, setLoadingData] = useState(true);
  const [error, setError]             = useState(null);

  // ── Crédito + items ────────────────────────────────────────────────────
  const [credito, setCredito]     = useState(null);
  const [items, setItems]         = useState([]);
  const [abonos, setAbonos]       = useState([]);

  // ── Búsqueda de productos ──────────────────────────────────────────────
  const [searchProducto, setSearchProducto]         = useState('');
  const [productosEncontrados, setProductosEncontrados] = useState([]);
  const [buscandoProducto, setBuscandoProducto]     = useState(false);

  // ── Modal agregar producto ─────────────────────────────────────────────
  const [showModalProducto, setShowModalProducto]   = useState(false);
  const [productoModal, setProductoModal]           = useState(null);
  const [cantidadModal, setCantidadModal]           = useState(1);
  const [precioModal, setPrecioModal]               = useState(0);
  const [lotesProducto, setLotesProducto]           = useState([]);
  const [loteSeleccionado, setLoteSeleccionado]     = useState(null);
  const [guardandoProducto, setGuardandoProducto]   = useState(false);

  // ── Modal abono ────────────────────────────────────────────────────────
  const [showModalAbono, setShowModalAbono]         = useState(false);
  const [guardandoAbono, setGuardandoAbono]         = useState(false);
  const [abonoMethods, setAbonoMethods]             = useState([
    { method: 'efectivo', amount: '' }
  ]);

  // ── Modal devolución de item ───────────────────────────────────────────
  const [showModalDevolucion, setShowModalDevolucion] = useState(false);
  const [itemDevolucion, setItemDevolucion]           = useState(null);
  const [guardandoDevolucion, setGuardandoDevolucion] = useState(false);
  const [metodoPagoDevolucion, setMetodoPagoDevolucion] = useState('efectivo');

  // ── Modal editar item ──────────────────────────────────────────────────
  const [showModalEditItem, setShowModalEditItem]   = useState(false);
  const [editingItem, setEditingItem]               = useState(null);
  const [editCantidad, setEditCantidad]             = useState(1);
  const [editPrecio, setEditPrecio]                 = useState(0);
  const [guardandoEdit, setGuardandoEdit]           = useState(false);

  // ── Cargar crédito ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { router.push('/auth'); return; }
    if (!id || !router.isReady) return;

    setLoadingData(true);

    // Listener en tiempo real del crédito
    const unsubCredito = onSnapshot(doc(db, 'creditos', id), (snap) => {
      if (!snap.exists()) { setError('Crédito no encontrado'); setLoadingData(false); return; }
      setCredito({ id: snap.id, ...snap.data() });
      setLoadingData(false);
    }, (err) => {
      setError('Error al cargar crédito: ' + err.message);
      setLoadingData(false);
    });

    // Listener items ordenados por fecha
    const unsubItems = onSnapshot(
      query(
        collection(db, 'creditos', id, 'itemsCredito'),
        orderBy('fechaAgregado', 'asc')
      ),
      (snap) => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    );

    // Listener abonos
    const unsubAbonos = onSnapshot(
      query(collection(db, 'abonos'), where('creditoId', '==', id), orderBy('fecha', 'asc')),
      (snap) => {
        setAbonos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    );

    return () => { unsubCredito(); unsubItems(); unsubAbonos(); };
  }, [user, id, router.isReady]);

  // ── Búsqueda de productos con debounce ─────────────────────────────────
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
          getDocs(query(collection(db, 'productos'), where('palabrasClave', 'array-contains', palabra), limit(100))),
          getDocs(query(collection(db, 'productos'), where('nombre', '>=', palabra), where('nombre', '<=', palabra + '\uf8ff'), limit(50))),
        ]);
        queries.push(
          getDocs(query(collection(db, 'productos'), where('codigoTienda', '==', termUpper), limit(5))),
          getDocs(query(collection(db, 'productos'), where('codigoProveedor', '==', termUpper), limit(5))),
        );
        const resultados = await Promise.all(queries);
        resultados.forEach(snap => {
          snap.docs.forEach(d => {
            if (!idsVistos.has(d.id)) { idsVistos.add(d.id); candidatos.push({ id: d.id, ...d.data() }); }
          });
        });
        candidatos = candidatos.filter(p => {
          const nombreUpper = (p.nombre || '').toUpperCase();
          const claves = p.palabrasClave || [];
          return palabras.every(w =>
            nombreUpper.includes(w) || claves.some(c => c.includes(w)) ||
            (p.codigoTienda || '').toUpperCase().includes(w) ||
            (p.codigoProveedor || '').toUpperCase().includes(w)
          );
        });
      }
      setProductosEncontrados(candidatos.slice(0, 20));
    } catch (err) {
      console.error('Error buscando:', err);
    } finally {
      setBuscandoProducto(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => buscarProductos(searchProducto), 300);
    return () => clearTimeout(t);
  }, [searchProducto]);

  // ── Abrir modal de producto ────────────────────────────────────────────
  const abrirModalProducto = async (producto) => {
    setProductoModal(producto);
    setCantidadModal(1);
    setPrecioModal(parseFloat(producto.precioVentaDefault || 0));
    setLoteSeleccionado(null);
    setShowModalProducto(true);
    setSearchProducto('');
    setProductosEncontrados([]);

    try {
      const snap = await getDocs(query(
        collection(db, 'lotes'),
        where('productoId', '==', producto.id),
        where('estado', '==', 'activo'),
        orderBy('fechaIngreso', 'asc'), // FIFO: más antiguo primero
        limit(5)
      ));
      const lotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLotesProducto(lotes);
      // Auto-seleccionar el primer lote con stock (FIFO)
      const primero = lotes.find(l => (l.stockRestante || 0) > 0);
      if (primero) {
        setLoteSeleccionado(primero);
        setPrecioModal(parseFloat(primero.precioVentaUnitario || producto.precioVentaDefault || 0));
      }
    } catch (err) {
      console.error('Error cargando lotes:', err);
      setLotesProducto([]);
    }
  };

  // ── Guardar producto inmediatamente en Firestore ───────────────────────
    const guardarProducto = async () => {
    if (!productoModal || !credito) return;
    if (cantidadModal <= 0) { setError('Cantidad debe ser mayor a 0'); return; }
    if (lotesProducto.length > 0 && !loteSeleccionado) { setError('Selecciona un lote'); return; }
    if (loteSeleccionado && cantidadModal > (loteSeleccionado.stockRestante || 0)) {
        setError(`Stock insuficiente. Disponible: ${loteSeleccionado.stockRestante}`);
        return;
    }

    setGuardandoProducto(true);
    setError(null);

    try {
        const subtotal = cantidadModal * precioModal;
        const precioCompra = loteSeleccionado
        ? parseFloat(loteSeleccionado.precioCompraUnitario || 0)
        : parseFloat(productoModal.precioCompraDefault || 0);

        await runTransaction(db, async (transaction) => {
        // ══ FASE 1: TODOS LOS READS ══════════════════════════
        const creditoRef = doc(db, 'creditos', id);
        const creditoSnap = await transaction.get(creditoRef);
        if (!creditoSnap.exists()) throw new Error('Crédito no encontrado');

        let loteSnap = null;
        let loteRef = null;
        if (loteSeleccionado) {
            loteRef = doc(db, 'lotes', loteSeleccionado.id);
            loteSnap = await transaction.get(loteRef);
            if (!loteSnap.exists()) throw new Error('Lote no encontrado');
        }

        const productoRef = doc(db, 'productos', productoModal.id);
        const productoSnap = await transaction.get(productoRef);

        const clienteRef = doc(db, 'cliente', creditoSnap.data().clienteId);
        const clienteSnap = await transaction.get(clienteRef);

        // ══ FASE 2: VALIDACIONES ══════════════════════════════
        if (loteSnap) {
            const stockActual = loteSnap.data().stockRestante || 0;
            if (cantidadModal > stockActual)
            throw new Error(`Stock insuficiente. Disponible: ${stockActual}`);
        }

        // ══ FASE 3: TODOS LOS WRITES ══════════════════════════
        if (loteRef && loteSnap) {
            const stockActual = loteSnap.data().stockRestante || 0;
            transaction.update(loteRef, {
            stockRestante: stockActual - cantidadModal,
            estado: (stockActual - cantidadModal) <= 0 ? 'agotado' : 'activo',
            updatedAt: serverTimestamp(),
            });
        }

        if (productoSnap.exists()) {
            const stockActual = productoSnap.data().stockActual || 0;
            transaction.update(productoRef, {
            stockActual: Math.max(0, stockActual - cantidadModal),
            updatedAt: serverTimestamp(),
            });
        }

        const itemRef = doc(collection(db, 'creditos', id, 'itemsCredito'));
        transaction.set(itemRef, {
            productoId: productoModal.id,
            nombreProducto: productoModal.nombre,
            marca: productoModal.marca || '',
            medida: productoModal.medida || '',
            codigoTienda: productoModal.codigoTienda || '',
            codigoProveedor: productoModal.codigoProveedor || '',
            color: productoModal.color || '',
            cantidad: cantidadModal,
            precioVentaUnitario: precioModal,
            precioCompraUnitario: precioCompra,
            subtotal,
            loteId: loteSeleccionado?.id || null,
            numeroLote: loteSeleccionado?.numeroLote || null,
            estado: 'activo',
            fechaAgregado: serverTimestamp(),
            agregadoPor: user.email || user.uid,
            createdAt: serverTimestamp(),
        });

        const creditoData = creditoSnap.data();
        const nuevoMontoTotal = parseFloat(creditoData.montoTotal || 0) + subtotal;
        const montoPagado = parseFloat(creditoData.montoPagado || 0);
        transaction.update(creditoRef, {
            montoTotal: nuevoMontoTotal,
            saldoPendiente: nuevoMontoTotal - montoPagado,
            updatedAt: serverTimestamp(),
        });

        if (clienteSnap.exists()) {
            const montoActual = parseFloat(clienteSnap.data().montoCreditoActual || 0);
            transaction.update(clienteRef, {
            montoCreditoActual: montoActual + subtotal,
            updatedAt: serverTimestamp(),
            });
        }
        });

        setShowModalProducto(false);
    } catch (err) {
        setError('Error al agregar producto: ' + err.message);
    } finally {
        setGuardandoProducto(false);
    }
    };

  // ── Lógica de abono — igual al flujo actual ────────────────────────────
  const totalAbono = abonoMethods.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);

  const agregarMetodoPago = () => {
    if (abonoMethods.length >= 4) return;
    setAbonoMethods(prev => [...prev, { method: 'efectivo', amount: '' }]);
  };

  const quitarMetodoPago = (idx) => {
    setAbonoMethods(prev => prev.filter((_, i) => i !== idx));
  };

  const actualizarMetodoPago = (idx, field, value) => {
    setAbonoMethods(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  const guardarAbono = async () => {
    if (!credito) return;
    if (totalAbono <= 0) { setError('El monto del abono debe ser mayor a 0'); return; }
    if (totalAbono > parseFloat(credito.saldoPendiente || 0)) {
      setError(`El abono (S/.${totalAbono.toFixed(2)}) supera el saldo pendiente (S/.${parseFloat(credito.saldoPendiente || 0).toFixed(2)})`);
      return;
    }

    setGuardandoAbono(true);
    setError(null);

    try {
      const metodosValidos = abonoMethods.filter(m => parseFloat(m.amount) > 0);
      const metodoPagoFinal = metodosValidos.length > 1 ? 'mixto' : metodosValidos[0]?.method || 'efectivo';

      await runTransaction(db, async (transaction) => {
        // ══ FASE 1: TODOS LOS READS ══════════════════════════
        const creditoRef = doc(db, 'creditos', id);
        const creditoSnap = await transaction.get(creditoRef);
        if (!creditoSnap.exists()) throw new Error('Crédito no encontrado');
        const creditoData = creditoSnap.data();

        const clienteRef = doc(db, 'cliente', creditoData.clienteId);
        const clienteSnap = await transaction.get(clienteRef);

        // ══ FASE 2: TODOS LOS WRITES ══════════════════════════
        const nuevoMontoPagado = parseFloat(creditoData.montoPagado || 0) + totalAbono;
        const nuevoSaldo = parseFloat(creditoData.montoTotal || 0) - nuevoMontoPagado;
        const seLiquidó = nuevoSaldo <= 0;

        transaction.update(creditoRef, {
          montoPagado: nuevoMontoPagado,
          saldoPendiente: Math.max(0, nuevoSaldo),
          estado: seLiquidó ? 'saldado' : 'activo',
          fechaSaldado: seLiquidó ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });

        const abonoRef = doc(collection(db, 'abonos'));
        transaction.set(abonoRef, {
          creditoId: id,
          clienteId: creditoData.clienteId,
          clienteNombre: creditoData.clienteNombre,
          monto: totalAbono,
          metodoPago: metodoPagoFinal,
          paymentData: metodosValidos.length > 1 ? {
            isMixedPayment: true,
            paymentMethods: metodosValidos.map(m => ({
              method: m.method,
              amount: parseFloat(m.amount),
              label: METODOS_PAGO.find(mp => mp.value === m.method)?.label || m.method
            }))
          } : null,
          descripcion: `Abono a crédito acumulativo ${creditoData.numeroCredito}`,
          tipo: 'acumulativo',
          fecha: serverTimestamp(),
          registradoPor: user.email || user.uid,
          createdAt: serverTimestamp(),
        });

        if (clienteSnap.exists()) {
          const montoActual = parseFloat(clienteSnap.data().montoCreditoActual || 0);
          transaction.update(clienteRef, {
            montoCreditoActual: Math.max(0, montoActual - totalAbono),
            updatedAt: serverTimestamp(),
          });
        }
      });

      setShowModalAbono(false);
      setAbonoMethods([{ method: 'efectivo', amount: '' }]);
    } catch (err) {
      setError('Error al registrar abono: ' + err.message);
    } finally {
      setGuardandoAbono(false);
    }
  };

  // ── Abrir modal devolución de item ─────────────────────────────────────
  const abrirDevolucion = (item) => {
    setItemDevolucion(item);
    setMetodoPagoDevolucion('efectivo');
    setShowModalDevolucion(true);
  };

  // ── Calcular impacto de la devolución ──────────────────────────────────
  const calcularImpactoDevolucion = (item) => {
    if (!credito || !item) return { reduccionDeuda: 0, excedente: 0 };
    const saldo = parseFloat(credito.saldoPendiente || 0);
    const valorItem = parseFloat(item.subtotal || 0);

    if (valorItem <= saldo) {
      // El item cabe dentro de la deuda — solo reduce la deuda
      return { reduccionDeuda: valorItem, excedente: 0 };
    } else {
      // El item supera la deuda — parte reduce deuda, el resto es excedente
      return { reduccionDeuda: saldo, excedente: valorItem - saldo };
    }
  };

  // ── Guardar devolución de item ─────────────────────────────────────────
    const guardarDevolucion = async () => {
    if (!itemDevolucion || !credito) return;
    setGuardandoDevolucion(true);
    setError(null);

    const { reduccionDeuda, excedente } = calcularImpactoDevolucion(itemDevolucion);
    const valorItem = parseFloat(itemDevolucion.subtotal || 0);

    try {
        await runTransaction(db, async (transaction) => {
        // ══ FASE 1: TODOS LOS READS ══════════════════════════
        const creditoRef = doc(db, 'creditos', id);
        const creditoSnap = await transaction.get(creditoRef);
        if (!creditoSnap.exists()) throw new Error('Crédito no encontrado');
        const creditoData = creditoSnap.data();

        const itemRef = doc(db, 'creditos', id, 'itemsCredito', itemDevolucion.id);

        const clienteRef = doc(db, 'cliente', creditoData.clienteId);
        const clienteSnap = await transaction.get(clienteRef);

        let loteRef = null;
        let loteSnap = null;
        if (itemDevolucion.loteId) {
            loteRef = doc(db, 'lotes', itemDevolucion.loteId);
            loteSnap = await transaction.get(loteRef);
        }

        const productoRef = doc(db, 'productos', itemDevolucion.productoId);
        const productoSnap = await transaction.get(productoRef);

        // ══ FASE 2: TODOS LOS WRITES ══════════════════════════
        transaction.update(itemRef, {
            estado: 'devuelto',
            fechaDevolucion: serverTimestamp(),
            devueltoPor: user.email || user.uid,
            metodoPagoDevolucion,
        });

        const nuevoMontoTotal = parseFloat(creditoData.montoTotal || 0) - valorItem;
        const nuevoMontoPagado = parseFloat(creditoData.montoPagado || 0);
        const nuevoSaldo = Math.max(0, nuevoMontoTotal - nuevoMontoPagado);
        const seLiquidó = nuevoSaldo <= 0 && nuevoMontoTotal >= 0;

        transaction.update(creditoRef, {
          montoTotal: nuevoMontoTotal,
          saldoPendiente: nuevoSaldo,
          excedentePagoCliente: excedente > 0 ? excedente : null,
          excedenteMétodoPago: excedente > 0 ? metodoPagoDevolucion : null, // ← NUEVO
          estado: seLiquidó ? 'saldado' : 'activo',
          fechaSaldado: seLiquidó ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });

        if (clienteSnap.exists()) {
            const montoActual = parseFloat(clienteSnap.data().montoCreditoActual || 0);
            transaction.update(clienteRef, {
            montoCreditoActual: Math.max(0, montoActual - reduccionDeuda),
            updatedAt: serverTimestamp(),
            });
        }

        if (loteRef && loteSnap?.exists()) {
            const stockActual = loteSnap.data().stockRestante || 0;
            transaction.update(loteRef, {
            stockRestante: stockActual + itemDevolucion.cantidad,
            estado: 'activo',
            updatedAt: serverTimestamp(),
            });
        }

        if (productoSnap.exists()) {
            const stockActual = productoSnap.data().stockActual || 0;
            transaction.update(productoRef, {
            stockActual: stockActual + itemDevolucion.cantidad,
            updatedAt: serverTimestamp(),
            });
        }
        });

        setShowModalDevolucion(false);
        setItemDevolucion(null);
    } catch (err) {
        setError('Error al devolver producto: ' + err.message);
    } finally {
        setGuardandoDevolucion(false);
    }
    };

  // ── Editar item (solo precio, no cantidad para no afectar stock) ────────
  const abrirEditItem = (item) => {
    setEditingItem(item);
    setEditCantidad(item.cantidad);
    setEditPrecio(parseFloat(item.precioVentaUnitario || 0));
    setShowModalEditItem(true);
  };

    const guardarEditItem = async () => {
    if (!editingItem || !credito) return;
    setGuardandoEdit(true);
    setError(null);

    try {
        const nuevoSubtotal = editCantidad * editPrecio;
        const subtotalAnterior = parseFloat(editingItem.subtotal || 0);
        const diferencia = nuevoSubtotal - subtotalAnterior;

        await runTransaction(db, async (transaction) => {
        // ══ FASE 1: TODOS LOS READS ══════════════════════════
        const creditoRef = doc(db, 'creditos', id);
        const creditoSnap = await transaction.get(creditoRef);
        if (!creditoSnap.exists()) throw new Error('Crédito no encontrado');
        const creditoData = creditoSnap.data();

        const clienteRef = doc(db, 'cliente', creditoData.clienteId);
        const clienteSnap = await transaction.get(clienteRef);

        const itemRef = doc(db, 'creditos', id, 'itemsCredito', editingItem.id);

        // ══ FASE 2: TODOS LOS WRITES ══════════════════════════
        transaction.update(itemRef, {
            precioVentaUnitario: editPrecio,
            subtotal: nuevoSubtotal,
            updatedAt: serverTimestamp(),
        });

        const nuevoMontoTotal = parseFloat(creditoData.montoTotal || 0) + diferencia;
        const montoPagado = parseFloat(creditoData.montoPagado || 0);
        transaction.update(creditoRef, {
            montoTotal: nuevoMontoTotal,
            saldoPendiente: Math.max(0, nuevoMontoTotal - montoPagado),
            updatedAt: serverTimestamp(),
        });

        if (clienteSnap.exists()) {
            const montoActual = parseFloat(clienteSnap.data().montoCreditoActual || 0);
            transaction.update(clienteRef, {
            montoCreditoActual: Math.max(0, montoActual + diferencia),
            updatedAt: serverTimestamp(),
            });
        }
        });

        setShowModalEditItem(false);
        setEditingItem(null);
    } catch (err) {
        setError('Error al editar item: ' + err.message);
    } finally {
        setGuardandoEdit(false);
    }
    };

  // ── Helpers de formato ─────────────────────────────────────────────────
  const formatFecha = (ts) => {
    if (!ts) return 'N/A';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const itemsActivos   = items.filter(i => i.estado === 'activo');
  const itemsDevueltos = items.filter(i => i.estado === 'devuelto');

  if (!router.isReady || !user || loadingData) {
    return (
      <Layout title="Cargando Crédito">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
        </div>
      </Layout>
    );
  }

  if (error && !credito) {
    return (
      <Layout title="Error">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-red-600 font-medium">{error}</p>
          <button onClick={() => router.push('/creditos/activos')}
            className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
            <ArrowLeftIcon className="h-4 w-4 mr-2" /> Volver
          </button>
        </div>
      </Layout>
    );
  }

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <Layout title={`Crédito ${credito?.numeroCredito || ''}`}>
      <div className="w-full px-2 py-4">

        {error && (
          <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 max-w-md flex items-start gap-2">
            <span className="flex-1 text-sm">{error}</span>
            <button onClick={() => setError(null)} className="shrink-0">
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-4 p-4">

            {/* ══════════════════════════════════════════════════
                PANEL IZQUIERDO
            ══════════════════════════════════════════════════ */}
            <div className="col-span-12 lg:col-span-3 space-y-4">

              {/* Header + volver */}
              <div className="flex justify-between items-center">
                <h1 className="text-lg font-bold text-gray-900">Crédito Acumulativo</h1>
                <button onClick={() => router.push('/creditos/activos')}  
                  className="inline-flex items-center px-2 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50">
                  <ArrowLeftIcon className="h-3 w-3 mr-1" /> Volver
                </button>
              </div>

              {/* Info del cliente y crédito */}
              {credito && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <UserIcon className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-gray-900">{credito.clienteNombre}</p>
                      <p className="text-xs text-gray-500">DNI: {credito.clienteDNI || 'N/A'}</p>
                      <p className="text-xs text-gray-500 font-mono">{credito.numeroCredito}</p>
                    </div>
                  </div>

                  {/* Badge estado */}
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                      credito.estado === 'saldado'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {credito.estado === 'saldado' ? '✓ Saldado' : '● Activo'}
                    </span>
                    {credito.excedentePagoCliente > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                        ⚠️ Excedente
                      </span>
                    )}
                  </div>

                  {/* Resumen financiero */}
                  <div className="space-y-2 pt-2 border-t border-gray-200">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total crédito:</span>
                      <span className="font-semibold text-gray-900">S/. {parseFloat(credito.montoTotal || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Abonado:</span>
                      <span className="font-semibold text-green-700">S/. {parseFloat(credito.montoPagado || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base pt-1 border-t border-gray-200">
                      <span className="font-bold text-gray-800">Saldo pendiente:</span>
                      <span className={`font-bold text-xl ${parseFloat(credito.saldoPendiente || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        S/. {parseFloat(credito.saldoPendiente || 0).toFixed(2)}
                      </span>
                    </div>
                    {credito.excedentePagoCliente > 0 && (
                      <div className="flex justify-between text-sm bg-orange-50 border border-orange-200 rounded-lg px-2 py-1.5">
                        <span className="text-orange-700 font-medium">⚠️ Negocio debe:</span>
                        <span className="font-bold text-orange-800">S/. {parseFloat(credito.excedentePagoCliente).toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  {/* Fecha apertura */}
                  <div className="flex items-center gap-1 text-xs text-gray-400 pt-1">
                    <CalendarDaysIcon className="h-3.5 w-3.5" />
                    <span>Abierto: {formatFecha(credito.fechaApertura)}</span>
                  </div>
                </div>
              )}

              {/* Botón abonar */}
              {credito?.estado === 'activo' && (
                <button
                  onClick={() => { setShowModalAbono(true); setAbonoMethods([{ method: 'efectivo', amount: '' }]); }}
                  className="w-full inline-flex items-center justify-center px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition"
                >
                  <BanknotesIcon className="h-5 w-5 mr-2" />
                  Registrar Abono
                </button>
              )}

              {/* Historial de abonos */}
              {abonos.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                    <BanknotesIcon className="h-4 w-4 text-green-600" />
                    Abonos ({abonos.length})
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {abonos.map(abono => (
                      <div key={abono.id} className="bg-white border border-green-200 rounded-lg px-3 py-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-green-700 text-sm">S/. {parseFloat(abono.monto || 0).toFixed(2)}</span>
                          <span className="text-xs text-gray-500 capitalize">{abono.metodoPago}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{formatFecha(abono.fecha)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between text-sm">
                    <span className="text-gray-600">Total abonado:</span>
                    <span className="font-bold text-green-700">
                      S/. {abonos.reduce((s, a) => s + parseFloat(a.monto || 0), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Observaciones */}
              {credito?.observaciones && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-yellow-700 mb-1">Observaciones:</p>
                  <p className="text-xs text-yellow-800">{credito.observaciones}</p>
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════
                PANEL DERECHO
            ══════════════════════════════════════════════════ */}
            <div className="col-span-12 lg:col-span-9 space-y-5">

              {/* Buscador de productos */}
              {credito?.estado === 'activo' && (
                <div className="bg-white border border-gray-400 rounded-lg relative">
                  <div className="p-4">
                    <h2 className="text-lg font-semibold mb-4 text-gray-800">Agregar Producto al Crédito</h2>
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
                        <button onClick={() => { setSearchProducto(''); setProductosEncontrados([]); }}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-2">
                      {!searchProducto.trim() ? 'Escribe para buscar productos...' : buscandoProducto ? 'Buscando...' : `${productosEncontrados.length} productos encontrados`}
                    </div>
                  </div>

                  {searchProducto.trim() !== '' && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-400 rounded-b-lg shadow-lg z-40 max-h-96 overflow-y-auto">
                      {buscandoProducto ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
                        </div>
                      ) : productosEncontrados.length === 0 ? (
                        <div className="p-4 text-center text-gray-500"><p>No se encontraron productos</p></div>
                      ) : (
                        <div>
                          {productosEncontrados.slice(0, 20).map(p => (
                            <div key={p.id}
                              onClick={() => { abrirModalProducto(p); setSearchProducto(''); }}
                              className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex flex-col gap-1 flex-1 min-w-0">
                                  <h4 className="font-semibold text-gray-900 text-sm">{p.nombre}</h4>
                                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                                    {p.codigoTienda && <span>C.Tienda: <span className="font-mono font-semibold text-gray-700">{p.codigoTienda}</span></span>}
                                    {p.codigoProveedor && <span className="text-purple-700 font-semibold bg-purple-50 px-1.5 py-0.5 rounded">C.Prov: {p.codigoProveedor}</span>}
                                    {p.marca && <span>Marca: <span className="font-semibold text-gray-700">{p.marca}</span></span>}
                                    {p.medida && <span>Medida: <span className="font-semibold text-gray-700">{p.medida}</span></span>}
                                    <span>Stock: <span className="font-bold text-gray-900">{p.stockActual || 0}</span></span>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="font-bold text-purple-600 text-base">S/. {parseFloat(p.precioVentaDefault || 0).toFixed(2)}</p>
                                  <p className="text-xs text-gray-500 uppercase tracking-wide">Precio Venta</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tabla de items activos */}
              <div className="bg-white border border-gray-400 rounded-lg">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <HashtagIcon className="h-6 w-6 text-purple-600" />
                    Productos del Crédito
                    {itemsActivos.length > 0 && (
                      <span className="text-sm font-normal text-gray-500">({itemsActivos.length} activos)</span>
                    )}
                  </h3>
                </div>

                <div className="p-4">
                  {itemsActivos.length === 0 ? (
                    <div className="text-center py-10">
                      <CreditCardIcon className="h-14 w-14 mx-auto mb-3 text-gray-300" />
                      <p className="text-gray-500">No hay productos activos en este crédito</p>
                    </div>
                  ) : (
                    <>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse min-w-full">
                        <thead className="bg-purple-50">
                          <tr className="border-b border-gray-300">
                            <th className="px-3 py-3 text-left   text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">FECHA</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">C. TIENDA</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide min-w-48">PRODUCTO</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">C. PROVEEDOR</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">MARCA</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">MEDIDA</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">COLOR</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">LOTE</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">CANT.</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">P. COMPRA</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">P. VENTA MIN</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">P. VENTA</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">SUBTOTAL</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">ACCIONES</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemsActivos.map((item, idx) => (
                            <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
 
                              {/* FECHA */}
                              <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                                {formatFecha(item.fechaAgregado)}
                              </td>
 
                              {/* C. TIENDA */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm text-gray-900 font-medium">
                                  {item.codigoTienda || 'N/A'}
                                </span>
                              </td>
 
                              {/* PRODUCTO */}
                              <td className="px-4 py-3 min-w-48">
                                <div className="font-medium text-gray-900 text-sm">{item.nombreProducto}</div>
                              </td>
 
                              {/* C. PROVEEDOR */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="font-medium text-gray-900 text-sm">
                                  {item.codigoProveedor || '—'}
                                </div>
                              </td>
 
                              {/* MARCA */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm text-gray-700">{item.marca || 'Sin marca'}</span>
                              </td>
 
                              {/* MEDIDA */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm text-gray-700">{item.medida || 'N/A'}</span>
                              </td>
 
                              {/* COLOR */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm text-gray-700">{item.color || 'N/A'}</span>
                              </td>
 
                              {/* LOTE */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                {item.numeroLote
                                  ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 font-mono">{item.numeroLote}</span>
                                  : <span className="text-xs text-gray-400">—</span>
                                }
                              </td>
 
                              {/* CANT. */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm font-medium text-gray-900">{item.cantidad}</span>
                              </td>
 
                              {/* P. COMPRA */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm font-medium text-gray-900">
                                  S/. {parseFloat(item.precioCompraUnitario || 0).toFixed(2)}
                                </span>
                              </td>
 
                              {/* P. VENTA MIN */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm font-medium text-gray-900">
                                  S/. {parseFloat(item.precioVentaMinimo || 0).toFixed(2)}
                                </span>
                              </td>
 
                              {/* P. VENTA */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm font-medium text-gray-900">
                                  S/. {parseFloat(item.precioVentaUnitario || 0).toFixed(2)}
                                </span>
                              </td>
 
                              {/* SUBTOTAL */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm font-semibold text-gray-900">
                                  S/. {parseFloat(item.subtotal || 0).toFixed(2)}
                                </span>
                              </td>
 
                              {/* ACCIONES */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <div className="flex justify-center gap-1">
                                  {credito?.estado === 'activo' && (
                                    <>
                                      <button onClick={() => abrirEditItem(item)}
                                        title="Editar precio"
                                        className="text-purple-600 hover:text-purple-800 p-1 rounded hover:bg-purple-50 transition-colors">
                                        <PencilIcon className="h-4 w-4" />
                                      </button>
                                      <button onClick={() => abrirDevolucion(item)}
                                        title="Devolver"
                                        className="text-orange-500 hover:text-orange-700 p-1 rounded hover:bg-orange-50 transition-colors">
                                        <ArrowUturnLeftIcon className="h-4 w-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
 
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>

                      {/* Total activos */}
                      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 border-t border-gray-300 rounded-b-lg">
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="text-base font-semibold">Total del Crédito</h3>
                            <p className="text-purple-200 text-sm">{itemsActivos.length} producto{itemsActivos.length !== 1 ? 's' : ''} activos</p>
                          </div>
                          <div className="text-3xl font-bold">
                            S/. {parseFloat(credito?.montoTotal || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                      </>
                  )}
                </div>
              </div>

              {/* Items devueltos (colapsados) */}
              {itemsDevueltos.length > 0 && (
                <div className="bg-white border border-orange-200 rounded-lg">
                  <div className="p-4 border-b border-orange-100">
                    <h3 className="text-base font-semibold text-orange-700 flex items-center gap-2">
                      <ArrowUturnLeftIcon className="h-5 w-5" />
                      Productos Devueltos ({itemsDevueltos.length})
                    </h3>
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-orange-50">
                        <tr className="border-b border-orange-200">
                          <th className="px-3 py-2 text-left text-xs font-semibold text-orange-600 uppercase">Fecha devolución</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-orange-600 uppercase">Producto</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-orange-600 uppercase">Cant.</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-orange-600 uppercase">Subtotal</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-orange-600 uppercase">Medio dev.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsDevueltos.map((item, idx) => (
                          <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-orange-50'} opacity-70`}>
                            <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                              {formatFecha(item.fechaDevolucion)}
                            </td>
                            <td className="px-4 py-2">
                              <p className="font-medium text-gray-700 line-through">{item.nombreProducto}</p>
                              <p className="text-xs text-gray-400">{item.marca || ''}</p>
                            </td>
                            <td className="px-3 py-2 text-center text-gray-600">{item.cantidad}</td>
                            <td className="px-3 py-2 text-center text-orange-600 font-medium">
                              -S/. {parseFloat(item.subtotal || 0).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-xs capitalize text-gray-500">{item.metodoPagoDevolucion || '—'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MODAL AGREGAR PRODUCTO — 2 columnas igual a nueva.js
      ══════════════════════════════════════════════════════════════════ */}
      {showModalProducto && productoModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowModalProducto(false)} />
            <div className="relative bg-white rounded-xl shadow-xl w-[95vw] max-w-5xl p-10">

              <button onClick={() => setShowModalProducto(false)}
                className="absolute right-4 top-4 rounded-md text-gray-400 hover:text-gray-500">
                <XMarkIcon className="h-6 w-6" />
              </button>

              <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <CreditCardIcon className="h-7 w-7 text-purple-600" />
                Agregar Producto al Crédito
              </h3>

              <div className="grid grid-cols-2 gap-8 items-stretch">

                {/* COL IZQUIERDA */}
                <div className="flex flex-col gap-4 h-full">
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
                      {lotesProducto.map(lote => (
                        <div key={lote.id}
                          onClick={() => {
                            setLoteSeleccionado(lote);
                            setPrecioModal(parseFloat(lote.precioVentaUnitario || productoModal.precioVentaDefault || 0));
                          }}
                          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${loteSeleccionado?.id === lote.id ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                          <div>
                            <span className="text-sm font-mono font-medium text-gray-800">{lote.numeroLote}</span>
                            <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${(lote.stockRestante || 0) <= 0 ? 'bg-red-100 text-red-700' : (lote.stockRestante || 0) <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              Stock: {lote.stockRestante || 0}
                            </span>
                            {loteSeleccionado?.id === lote.id && (
                              <span className="ml-2 text-xs font-bold text-purple-700">✓</span>
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
                </div>

                {/* COL DERECHA */}
                <div className="flex flex-col gap-5 h-full">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad</label>
                      <input type="number" value={cantidadModal}
                        onChange={e => setCantidadModal(parseInt(e.target.value) || 1)}
                        min="1" max={loteSeleccionado?.stockRestante || productoModal.stockActual || 999}
                        onWheel={e => e.target.blur()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-base" />
                      {loteSeleccionado && <p className="text-xs text-gray-500 mt-1">Máx: {loteSeleccionado.stockRestante}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Venta (S/.)</label>
                      <input type="number" value={precioModal}
                        onChange={e => setPrecioModal(parseFloat(e.target.value) || 0)}
                        min="0" step="0.01" onWheel={e => e.target.blur()}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent text-base ${
                          precioModal < parseFloat(productoModal.precioVentaMinimo || 0)
                            ? 'border-red-300 focus:ring-red-500 bg-red-50'
                            : 'border-gray-300 focus:ring-purple-500'
                        }`} />
                      {precioModal < parseFloat(productoModal.precioVentaMinimo || 0) && (
                        <p className="text-red-600 text-xs mt-1 font-medium">⚠️ Por debajo del mínimo</p>
                      )}
                    </div>
                  </div>

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

                  <div className="mt-auto flex flex-col gap-4">
                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-5 rounded-lg border border-purple-200">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-gray-700">Subtotal:</span>
                        <span className="font-bold text-purple-800 text-2xl">S/. {(cantidadModal * precioModal).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setShowModalProducto(false)}
                        className="px-6 py-3 rounded-lg bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-semibold text-base">
                        Cancelar
                      </button>
                      <button onClick={guardarProducto} disabled={guardandoProducto || cantidadModal <= 0}
                        className="px-6 py-3 rounded-lg bg-purple-600 text-white font-semibold text-base hover:bg-purple-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2">
                        {guardandoProducto ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Guardando...</> : 'Agregar al Crédito'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL ABONO — con pago mixto
      ══════════════════════════════════════════════════════════════════ */}
      {showModalAbono && credito && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-25" onClick={() => setShowModalAbono(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">

              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <BanknotesIcon className="h-6 w-6 mr-2 text-green-600" />
                  Registrar Abono
                </h3>
                <button onClick={() => setShowModalAbono(false)} className="text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Total a pagar */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Saldo pendiente:</span>
                  <span className="text-xl font-bold text-red-600">S/. {parseFloat(credito.saldoPendiente || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Métodos de pago */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Métodos de pago:</label>
                  {abonoMethods.length < 5 && (
                    <button type="button" onClick={agregarMetodoPago}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-full text-green-700 bg-green-100 hover:bg-green-200">
                      + Agregar
                    </button>
                  )}
                </div>

                {abonoMethods.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-lg">
                      {m.method === 'efectivo' ? '💵' : m.method === 'tarjeta' ? '💳' : m.method === 'transferencia' ? '🏦' : '📱'}
                    </span>
                    <select value={m.method} onChange={e => actualizarMetodoPago(idx, 'method', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:outline-none">
                      {METODOS_PAGO.map(mp => (
                        <option key={mp.value} value={mp.value}
                          disabled={abonoMethods.some((a, i) => i !== idx && a.method === mp.value)}>
                          {mp.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center">
                      <span className="text-sm text-gray-500 mr-2">S/.</span>
                      <input type="number" value={m.amount}
                        onChange={e => actualizarMetodoPago(idx, 'amount', e.target.value)}
                        min="0" step="0.01" placeholder="0.00" onWheel={e => e.target.blur()}
                        className="w-24 px-2 py-2 border border-gray-300 rounded-md text-sm text-right focus:ring-2 focus:ring-green-500 focus:outline-none" />
                    </div>
                    {abonoMethods.length > 1 && (
                      <button onClick={() => quitarMetodoPago(idx)} className="text-red-400 hover:text-red-600">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Resumen */}
              <div className="p-4 bg-gray-50 rounded-lg space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total abono:</span>
                  <span className="font-medium">S/. {totalAbono.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Restante:</span>
                  <span className={`font-medium ${
                    (parseFloat(credito.saldoPendiente || 0) - totalAbono) > 0.01 ? 'text-red-600' :
                    totalAbono > parseFloat(credito.saldoPendiente || 0) ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    S/. {(parseFloat(credito.saldoPendiente || 0) - totalAbono).toFixed(2)}
                  </span>
                </div>
                {(parseFloat(credito.saldoPendiente || 0) - totalAbono) > 0.01 && totalAbono > 0 && (
                  <button type="button"
                    onClick={() => {
                      const restante = parseFloat(credito.saldoPendiente || 0) - totalAbono;
                      const last = abonoMethods.length - 1;
                      actualizarMetodoPago(last, 'amount', (parseFloat(abonoMethods[last].amount) || 0) + restante);
                    }}
                    className="text-xs text-green-600 hover:text-green-800">
                    Auto-completar restante
                  </button>
                )}
                {totalAbono > 0 && totalAbono <= parseFloat(credito.saldoPendiente || 0) &&
                (parseFloat(credito.saldoPendiente || 0) - totalAbono) === 0 && (
                  <p className="text-xs font-bold text-green-700">✓ Se liquidará el crédito</p>
                )}
              </div>

              {/* Botones */}
              <div className="flex gap-3">
                <button onClick={() => setShowModalAbono(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={guardarAbono}
                  disabled={guardandoAbono || totalAbono <= 0 || totalAbono > parseFloat(credito.saldoPendiente || 0)}
                  className="flex-1 inline-flex justify-center items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed gap-2">
                  {guardandoAbono
                    ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Guardando...</>
                    : <><CheckCircleIcon className="h-4 w-4" />Confirmar Abono</>
                  }
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL DEVOLUCIÓN DE ITEM
      ══════════════════════════════════════════════════════════════════ */}
      {showModalDevolucion && itemDevolucion && credito && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowModalDevolucion(false)} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-8">

              <button onClick={() => setShowModalDevolucion(false)}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>

              <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <ArrowUturnLeftIcon className="h-6 w-6 text-orange-500" />
                Devolver Producto
              </h3>

              {/* Info del item */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
                <p className="font-bold text-gray-900">{itemDevolucion.nombreProducto}</p>
                <div className="flex flex-wrap gap-x-4 text-xs text-gray-500 mt-1">
                  {itemDevolucion.marca && <span>Marca: {itemDevolucion.marca}</span>}
                  <span>Cant: <span className="font-bold">{itemDevolucion.cantidad}</span></span>
                  <span>P.Unit: <span className="font-bold">S/. {parseFloat(itemDevolucion.precioVentaUnitario || 0).toFixed(2)}</span></span>
                </div>
                <p className="text-sm font-bold text-orange-700 mt-1">
                  Valor: S/. {parseFloat(itemDevolucion.subtotal || 0).toFixed(2)}
                </p>
              </div>

              {/* Impacto calculado */}
              {(() => {
                const { reduccionDeuda, excedente } = calcularImpactoDevolucion(itemDevolucion);
                return (
                  <div className={`rounded-lg p-4 mb-4 border ${excedente > 0 ? 'bg-orange-50 border-orange-300' : 'bg-blue-50 border-blue-200'}`}>
                    <p className="text-sm font-semibold text-gray-700 mb-2">Impacto de la devolución:</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Reduce deuda del cliente:</span>
                        <span className="font-bold text-blue-700">S/. {reduccionDeuda.toFixed(2)}</span>
                      </div>
                      {excedente > 0 && (
                        <div className="flex justify-between text-orange-700 font-bold">
                          <span>⚠️ Negocio debe al cliente:</span>
                          <span>S/. {excedente.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    {excedente > 0 && (
                      <p className="text-xs text-orange-600 mt-2">El cliente ya pagó más de lo que debe. Se registrará que el negocio debe S/. {excedente.toFixed(2)}.</p>
                    )}
                  </div>
                );
              })()}

              {/* Método de pago de la devolución */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ¿Cómo se devuelve el dinero? (si aplica)
                </label>
                <select value={metodoPagoDevolucion} onChange={e => setMetodoPagoDevolucion(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500">
                  {METODOS_PAGO.map(mp => (
                    <option key={mp.value} value={mp.value}>{mp.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowModalDevolucion(false)}
                  className="px-5 py-2.5 rounded-lg bg-white text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-medium">
                  Cancelar
                </button>
                <button onClick={guardarDevolucion} disabled={guardandoDevolucion}
                  className="px-5 py-2.5 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2">
                  {guardandoDevolucion ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Procesando...</> : <><ArrowUturnLeftIcon className="h-4 w-4" />Confirmar Devolución</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL EDITAR PRECIO DE ITEM
      ══════════════════════════════════════════════════════════════════ */}
      {showModalEditItem && editingItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowModalEditItem(false)} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-7">

              <button onClick={() => setShowModalEditItem(false)}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>

              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <PencilIcon className="h-5 w-5 text-purple-600" />
                Editar Precio
              </h3>

              <div className="bg-gray-50 rounded-lg p-3 mb-4 border border-gray-200">
                <p className="font-bold text-gray-900 text-sm">{editingItem.nombreProducto}</p>
                <p className="text-xs text-gray-500 mt-0.5">Cantidad: {editingItem.cantidad} · Lote: {editingItem.numeroLote || 'N/A'}</p>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nuevo Precio de Venta (S/.)</label>
                <input type="number" value={editPrecio}
                  onChange={e => setEditPrecio(parseFloat(e.target.value) || 0)}
                  min="0" step="0.01" onWheel={e => e.target.blur()}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-lg font-semibold text-center" />
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 mb-5 flex justify-between">
                <span className="text-sm text-gray-600">Nuevo subtotal:</span>
                <span className="font-bold text-purple-700">S/. {(editCantidad * editPrecio).toFixed(2)}</span>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowModalEditItem(false)}
                  className="px-4 py-2.5 rounded-lg bg-white text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-medium text-sm">
                  Cancelar
                </button>
                <button onClick={guardarEditItem} disabled={guardandoEdit || editPrecio < 0}
                  className="px-4 py-2.5 rounded-lg bg-purple-600 text-white font-semibold text-sm hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2">
                  {guardandoEdit ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Guardando...</> : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
};

export default CreditoAcumulativoPage;