// pages/creditos/nueva.js

import { useState, useEffect } from 'react';
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProductSearchItem from '../../components/ProductSearchItem';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import {
  collection,
  getDocs,
  getDoc,
  query,
  orderBy,
  deleteDoc,
  doc,
  addDoc,
  serverTimestamp,
  runTransaction,
  where,
  updateDoc,
  onSnapshot,
  limit
} from 'firebase/firestore';
import {
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  CreditCardIcon,
  BanknotesIcon,
  CheckIcon,
  PencilIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';
import Select from 'react-select';

const NuevoCreditoPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [filteredProductos, setFilteredProductos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [clientesConCredito, setClientesConCredito] = useState([]);
  const [creditosTemporales, setCreditosTemporales] = useState([]);
  const [creditoActivo, setCreditoActivo] = useState(null);
  const [itemsCreditoActivo, setItemsCreditoActivo] = useState([]);

  const [selectedCliente, setSelectedCliente] = useState(null);
  const [observaciones, setObservaciones] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');

  // Modal cantidad
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [precioVenta, setPrecioVenta] = useState(0);

  // Modal límite crédito
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitModalData, setLimitModalData] = useState(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [validatingAdmin, setValidatingAdmin] = useState(false);

  // Modal edición item
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editPrecio, setEditPrecio] = useState(0);

  // ── Cargar datos iniciales ─────────────────────────────
  useEffect(() => {
    if (!user) { router.push('/auth'); return; }
    fetchInitialData();
  }, [user, router]);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const qClientesCredito = query(
        collection(db, 'cliente'),
        where('tieneCredito', '==', true),
        orderBy('nombre', 'asc')
      );
      const snap = await getDocs(qClientesCredito);
      setClientesConCredito(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError("Error al cargar datos iniciales");
    } finally {
      setLoading(false);
    }
  };

  // ── Helper: obtener datos frescos del cliente ──────────
  const obtenerDatosCliente = async (clienteId) => {
    if (!clienteId) return null;
    try {
      const snap = await getDoc(doc(db, 'cliente', clienteId));
      return snap.exists() ? snap.data() : null;
    } catch { return null; }
  };

  // ── Búsqueda de productos con palabrasClave ────────────
  const searchProducts = async (term) => {
    if (!term.trim()) { setFilteredProductos([]); return; }
    setIsSearching(true);
    try {
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
            if (!idsVistos.has(d.id)) { idsVistos.add(d.id); candidatos.push({ id: d.id, ...d.data() }); }
          });
        });

        candidatos = candidatos.filter(p => {
          const nombreUpper = (p.nombre || '').toUpperCase();
          const claves = (p.palabrasClave || []);
          const codigoTienda = (p.codigoTienda || '').toUpperCase();
          const codigoProveedor = (p.codigoProveedor || '').toUpperCase();
          return palabras.every(palabra =>
            nombreUpper.includes(palabra) ||
            claves.some(c => c.includes(palabra)) ||
            codigoTienda.includes(palabra) ||
            codigoProveedor.includes(palabra)
          );
        });
      }
      setFilteredProductos(candidatos);
    } catch (err) {
      setError("Error al buscar productos");
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(() => {
      if (searchTerm.trim()) searchProducts(searchTerm);
      else setFilteredProductos([]);
    }, 300);
    return () => clearTimeout(id);
  }, [searchTerm]);

  // ── Listener créditos temporales ───────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'creditos'), where('estado', '==', 'temporal'), orderBy('fechaCreacion', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setCreditosTemporales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user]);

  // ── Listener crédito activo ────────────────────────────
  useEffect(() => {
    if (!creditoActivo?.id) { setItemsCreditoActivo([]); return; }
    const unsub = onSnapshot(doc(db, 'creditos', creditoActivo.id), async (docSnap) => {
      if (docSnap.exists()) {
        setCreditoActivo({ id: docSnap.id, ...docSnap.data() });
        try {
          const qItems = query(collection(db, 'creditos', creditoActivo.id, 'itemsCredito'), orderBy('createdAt', 'asc'));
          const itemsSnap = await getDocs(qItems);
          setItemsCreditoActivo(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch { setItemsCreditoActivo([]); }
      } else {
        setCreditoActivo(null);
        setItemsCreditoActivo([]);
      }
    });
    return () => unsub();
  }, [creditoActivo?.id]);

  // ── Sincronizar formulario con crédito activo ──────────
  useEffect(() => {
    if (creditoActivo) {
      const cliente = clientesConCredito.find(c => c.id === creditoActivo.clienteId);
      setSelectedCliente(cliente ? {
        value: cliente.id,
        label: `${cliente.nombre} ${cliente.apellido || ''} - ${cliente.dni || ''} - Crédito: S/.${parseFloat(cliente.montoCreditoActual || 0).toFixed(2)}`.trim()
      } : null);
      setObservaciones(creditoActivo.observaciones || '');
      if (creditoActivo.fechaVencimiento) {
        const fv = creditoActivo.fechaVencimiento instanceof Date
          ? creditoActivo.fechaVencimiento
          : creditoActivo.fechaVencimiento.toDate();
        setFechaVencimiento(fv.toISOString().split('T')[0]);
      }
    }
  }, [creditoActivo, clientesConCredito]);

  // ── Crear crédito temporal ─────────────────────────────
  const handleNuevoCredito = async () => {
    setLoading(true);
    try {
      const fechaDef = new Date();
      fechaDef.setDate(fechaDef.getDate() + 30);
      const ref = await addDoc(collection(db, 'creditos'), {
        numeroCredito: `CRE-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        clienteId: null,
        clienteNombre: 'Cliente Pendiente',
        clienteDNI: null,
        totalCredito: 0,
        fechaCreacion: serverTimestamp(),
        fechaVencimiento: fechaDef,
        estado: 'temporal',
        observaciones: '',
        empleadoId: user.email || user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCreditoActivo({ id: ref.id });
      alert('Nuevo crédito temporal creado exitosamente');
    } catch (err) {
      setError("Error al crear nuevo crédito");
      alert('Error al crear nuevo crédito: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCredito = (credito) => setCreditoActivo(credito);

  // ── Actualizar cliente ─────────────────────────────────
  const handleUpdateCliente = async (selectedOption) => {
    if (!creditoActivo?.id) return;
    try {
      await runTransaction(db, async (transaction) => {
        const creditoRef = doc(db, 'creditos', creditoActivo.id);
        let clientData = { nombre: 'Cliente Pendiente', apellido: '', dni: null };
        if (selectedOption) {
          const clientSnap = await transaction.get(doc(db, 'cliente', selectedOption.value));
          if (clientSnap.exists()) {
            const cd = clientSnap.data();
            if (!cd.tieneCredito) throw new Error("El cliente no tiene crédito activado.");
            clientData = cd;
          }
        }
        transaction.update(creditoRef, {
          clienteId: selectedOption?.value || null,
          clienteNombre: `${clientData.nombre} ${clientData.apellido || ''}`.trim(),
          clienteDNI: clientData.dni || null,
          updatedAt: serverTimestamp(),
        });
      });
      setSelectedCliente(selectedOption);
    } catch (err) {
      setError("Error al actualizar cliente: " + err.message);
      alert("Error al actualizar cliente: " + err.message);
    }
  };

  const handleUpdateObservaciones = async (val) => {
    if (!creditoActivo?.id) return;
    try {
      await updateDoc(doc(db, 'creditos', creditoActivo.id), { observaciones: val, updatedAt: serverTimestamp() });
      setObservaciones(val);
    } catch { setError("Error al actualizar observaciones"); }
  };

  const handleUpdateFechaVencimiento = async (val) => {
    if (!creditoActivo?.id) return;
    try {
      await updateDoc(doc(db, 'creditos', creditoActivo.id), {
        fechaVencimiento: val ? new Date(val) : null,
        updatedAt: serverTimestamp(),
      });
      setFechaVencimiento(val);
    } catch { setError("Error al actualizar fecha"); }
  };

  // ── Seleccionar producto ───────────────────────────────
  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setPrecioVenta(parseFloat(product.precioVentaDefault || 0));
    setQuantity(1);
    setShowQuantityModal(true);
  };

  // ── Validar límite de crédito ──────────────────────────
  const validarLimiteCredito = async (nuevoTotalCredito) => {
    if (!selectedCliente?.value) return { excede: false };
    const clienteData = await obtenerDatosCliente(selectedCliente.value);
    const creditoMaximo = parseFloat(clienteData?.creditoMaximo || 0);
    if (creditoMaximo <= 0) return { excede: false }; // sin límite configurado
    const deudaActual = parseFloat(clienteData?.montoCreditoActual || 0);
    const totalFinal = deudaActual + nuevoTotalCredito;
    if (totalFinal > creditoMaximo) {
      return {
        excede: true,
        creditoMaximo,
        deudaActual,
        totalFinal,
        exceso: totalFinal - creditoMaximo,
      };
    }
    return { excede: false };
  };

  // ── Agregar producto ───────────────────────────────────
  const handleAddProductToCredito = async () => {
    if (!creditoActivo?.id || !selectedProduct) return;
    try {
      const creditoItemsRef = collection(db, 'creditos', creditoActivo.id, 'itemsCredito');
      const existingSnap = await getDocs(query(creditoItemsRef, where('productoId', '==', selectedProduct.id)));

      let oldSubtotal = 0;
      let newQuantity = quantity;
      if (!existingSnap.empty) {
        const ed = existingSnap.docs[0].data();
        oldSubtotal = parseFloat(ed.subtotal || 0);
        newQuantity = ed.cantidad + quantity;
      }
      const newSubtotal = newQuantity * precioVenta;
      const currentTotal = parseFloat(creditoActivo.totalCredito || 0);
      const nuevoTotal = currentTotal - oldSubtotal + newSubtotal;

      // Validar límite
      const validacion = await validarLimiteCredito(nuevoTotal);
      if (validacion.excede) {
        setLimitModalData({
          nuevoTotal,
          creditoMaximo: validacion.creditoMaximo,
          deudaActual: validacion.deudaActual,
          totalFinal: validacion.totalFinal,
          exceso: validacion.exceso,
          existingSnap,
          oldSubtotal,
          newQuantity,
          newSubtotal,
          esRegistro: false,
        });
        setAdminPassword('');
        setAdminError('');
        setShowLimitModal(true);
        return;
      }

      await ejecutarAgregarProducto(existingSnap, oldSubtotal, newQuantity, newSubtotal);
    } catch (err) {
      setError("Error al agregar producto: " + err.message);
      alert("Error al agregar producto: " + err.message);
    }
  };

  // ── Ejecutar agregar producto (reutilizable) ───────────
  const ejecutarAgregarProducto = async (existingSnap, oldSubtotal, newQuantity, newSubtotal) => {
    const creditoItemsRef = collection(db, 'creditos', creditoActivo.id, 'itemsCredito');
    await runTransaction(db, async (transaction) => {
      const productSnap = await transaction.get(doc(db, 'productos', selectedProduct.id));
      const creditoSnap = await transaction.get(doc(db, 'creditos', creditoActivo.id));
      if (!productSnap.exists() || !creditoSnap.exists()) throw new Error("Producto o crédito no encontrado");

      const productData = productSnap.data();
      const stockActual = productData.stockActual || 0;
      const cantidadNueva = existingSnap.empty ? newQuantity : newQuantity - existingSnap.docs[0].data().cantidad;
      if (stockActual < cantidadNueva) throw new Error(`Stock insuficiente. Disponible: ${stockActual}`);

      if (!existingSnap.empty) {
        transaction.update(existingSnap.docs[0].ref, {
          cantidad: newQuantity,
          subtotal: newSubtotal,
          precioCompraDefault: productData.precioCompraDefault || 0,
          precioVentaMinimo: productData.precioVentaMinimo || 0,
          precioVentaUnitario: precioVenta,
          color: productData.color || '',
          updatedAt: serverTimestamp(),
        });
      } else {
        transaction.set(doc(creditoItemsRef), {
          productoId: selectedProduct.id,
          nombreProducto: productData.nombre || selectedProduct.nombre,
          marca: productData.marca || selectedProduct.marca || '',
          medida: productData.medida || selectedProduct.medida || '',
          codigoProveedor: productData.codigoProveedor || selectedProduct.codigoProveedor || '',
          precioCompraDefault: productData.precioCompraDefault || selectedProduct.precioCompraDefault || 0,
          precioVentaMinimo: productData.precioVentaMinimo || selectedProduct.precioVentaMinimo || 0,
          codigoTienda: productData.codigoTienda || selectedProduct.codigoTienda || '',
          color: productData.color || selectedProduct.color || '',
          cantidad: newQuantity,
          precioVentaUnitario: precioVenta,
          subtotal: newSubtotal,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const updatedTotal = parseFloat(creditoSnap.data().totalCredito || 0) - oldSubtotal + newSubtotal;
      transaction.update(doc(db, 'creditos', creditoActivo.id), {
        totalCredito: parseFloat(updatedTotal.toFixed(2)),
        updatedAt: serverTimestamp(),
      });
    });

    setShowQuantityModal(false);
    setShowLimitModal(false);
    setLimitModalData(null);
  };

  // ── Autorizar admin ────────────────────────────────────
  const handleAutorizarAdmin = async () => {
    if (!adminPassword.trim()) { setAdminError('Ingrese la contraseña del administrador.'); return; }
    setValidatingAdmin(true);
    setAdminError('');
    try {
      const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, 'admin@gmail.com', adminPassword);

      if (limitModalData?.esRegistro) {
        // Viene del registro → ejecutar registro sin validar límite
        setShowLimitModal(false);
        setLimitModalData(null);
        setAdminPassword('');
        await ejecutarRegistroCredito();
      } else {
        // Viene de agregar producto
        const { existingSnap, oldSubtotal, newQuantity, newSubtotal } = limitModalData;
        await ejecutarAgregarProducto(existingSnap, oldSubtotal, newQuantity, newSubtotal);
        alert('Límite autorizado por administrador. Producto agregado.');
      }
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setAdminError('Contraseña incorrecta. Solo el administrador puede autorizar esto.');
      } else {
        setAdminError('Error al verificar: ' + err.message);
      }
    } finally {
      setValidatingAdmin(false);
    }
  };

  // ── FIFO helpers ───────────────────────────────────────
  const consumirStockFIFO = async (productoId, cantidad, transaction) => {
    const lotesSnap = await getDocs(query(
      collection(db, 'lotes'),
      where('productoId', '==', productoId),
      where('stockRestante', '>', 0),
      where('estado', '==', 'activo'),
      orderBy('fechaIngreso', 'asc')
    ));
    let pendiente = cantidad;
    const movimientos = [];
    for (const loteDoc of lotesSnap.docs) {
      if (pendiente <= 0) break;
      const lote = loteDoc.data();
      const consumir = Math.min(pendiente, lote.stockRestante);
      const nuevoStock = lote.stockRestante - consumir;
      transaction.update(doc(db, 'lotes', loteDoc.id), {
        stockRestante: nuevoStock,
        estado: nuevoStock <= 0 ? 'agotado' : 'activo',
        updatedAt: serverTimestamp()
      });
      movimientos.push({ loteId: loteDoc.id, numeroLote: lote.numeroLote, cantidadConsumida: consumir, precioCompraUnitario: lote.precioCompraUnitario, stockRestante: nuevoStock });
      pendiente -= consumir;
    }
    if (pendiente > 0) throw new Error(`Stock insuficiente. Faltan ${pendiente} unidades.`);
    return movimientos;
  };

  const recalcularPrecioCompraProducto = async (productoId, transaction) => {
    const snap = await getDocs(query(
      collection(db, 'lotes'),
      where('productoId', '==', productoId),
      where('stockRestante', '>', 0),
      where('estado', '==', 'activo'),
      orderBy('fechaIngreso', 'asc'),
      limit(1)
    ));
    const nuevoPrecio = snap.empty ? 0 : parseFloat(snap.docs[0].data().precioCompraUnitario || 0);
    transaction.update(doc(db, 'productos', productoId), { precioCompraDefault: nuevoPrecio, updatedAt: serverTimestamp() });
  };

  // ── Ejecutar registro (separado para reutilizar desde admin) ──
  const ejecutarRegistroCredito = async () => {
    setLoading(true);
    try {
      let ventaId = null;
      const numeroVenta = `VC-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      await runTransaction(db, async (transaction) => {
        const creditoRef = doc(db, 'creditos', creditoActivo.id);
        const clienteRef = doc(db, 'cliente', selectedCliente.value);
        const clienteSnap = await transaction.get(clienteRef);
        if (!clienteSnap.exists()) throw new Error("Cliente no encontrado");

        const productSnapshots = {};
        const stockInsuficiente = [];
        for (const item of itemsCreditoActivo) {
          const pSnap = await transaction.get(doc(db, 'productos', item.productoId));
          if (!pSnap.exists()) throw new Error(`Producto ${item.nombreProducto} no encontrado`);
          productSnapshots[item.productoId] = pSnap;
          if ((pSnap.data().stockActual || 0) < item.cantidad) {
            stockInsuficiente.push(`${item.nombreProducto}: disponible ${pSnap.data().stockActual || 0}, requerido ${item.cantidad}`);
          }
        }
        if (stockInsuficiente.length > 0) throw new Error(`Stock insuficiente:\n${stockInsuficiente.join('\n')}`);

        const todosMovimientos = [];
        for (const item of itemsCreditoActivo) {
          const movimientos = await consumirStockFIFO(item.productoId, parseFloat(item.cantidad), transaction);
          todosMovimientos.push({ 
            item,
            productoId: item.productoId, 
            nombreProducto: item.nombreProducto, 
            movimientos 
          });
          const stockActual = productSnapshots[item.productoId].data().stockActual || 0;
          transaction.update(doc(db, 'productos', item.productoId), { 
            stockActual: stockActual - item.cantidad, 
            updatedAt: serverTimestamp() 
          });
          await recalcularPrecioCompraProducto(item.productoId, transaction);
        }

        const montoActual = parseFloat(clienteSnap.data().montoCreditoActual || 0);
        const nuevoMonto = montoActual + parseFloat(creditoActivo.totalCredito || 0);
        transaction.update(clienteRef, { montoCreditoActual: nuevoMonto, updatedAt: serverTimestamp() });
        transaction.update(creditoRef, {
          estado: 'activo',
          fechaActivacion: serverTimestamp(),
          observaciones: observaciones || '',
          fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
          ventaId: null, // se asignará abajo
          updatedAt: serverTimestamp(),
        });

        // ── Movimientos de lotes ────────────────────────────
        for (const pm of todosMovimientos) {
          for (const mov of pm.movimientos) {
            transaction.set(doc(collection(db, 'movimientosLotes')), {
              creditoId: creditoActivo.id,
              numeroCredito: creditoActivo.numeroCredito,
              productoId: pm.productoId,
              nombreProducto: pm.nombreProducto,
              loteId: mov.loteId,
              numeroLote: mov.numeroLote,
              cantidadConsumida: mov.cantidadConsumida,
              precioCompraUnitario: mov.precioCompraUnitario,
              stockRestanteLote: mov.stockRestante,
              tipoMovimiento: 'credito-activado',
              fechaMovimiento: serverTimestamp(),
              empleadoId: user.email || user.uid,
              createdAt: serverTimestamp()
            });
          }
        }

        // ── Crear venta vinculada al crédito ────────────────
        const clienteData = clienteSnap.data();
        const ventaRef = doc(collection(db, 'ventas'));
        ventaId = ventaRef.id;

        const totalCredito = parseFloat(creditoActivo.totalCredito || 0);

        transaction.set(ventaRef, {
          numeroVenta,
          creditoId: creditoActivo.id,
          numeroCredito: creditoActivo.numeroCredito,
          clienteId: selectedCliente.value,
          clienteNombre: `${clienteData.nombre} ${clienteData.apellido || ''}`.trim(),
          clienteDNI: clienteData.dni || null,
          totalVenta: totalCredito,
          tipoVenta: 'credito',
          estado: 'pendiente',           // ← pendiente hasta que salde
          estadoCredito: 'activo',
          metodoPago: null,              // ← se define cuando abonen
          observaciones: observaciones || null,
          empleadoId: user.email || user.uid,
          fechaVenta: serverTimestamp(),
          fechaVentaCliente: new Date(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // ── Items de la venta (con loteId del FIFO) ─────────
        for (const pm of todosMovimientos) {
          const { item } = pm;
          // Un item puede haberse distribuido en varios lotes
          for (const mov of pm.movimientos) {
            const itemVentaRef = doc(collection(ventaRef, 'itemsVenta'));
            transaction.set(itemVentaRef, {
              productoId: item.productoId,
              nombreProducto: item.nombreProducto,
              marca: item.marca || '',
              medida: item.medida || '',
              codigoProveedor: item.codigoProveedor || '',
              codigoTienda: item.codigoTienda || '',
              color: item.color || '',
              cantidad: mov.cantidadConsumida,
              precioVentaUnitario: parseFloat(item.precioVentaUnitario || 0),
              subtotal: parseFloat((mov.cantidadConsumida * parseFloat(item.precioVentaUnitario || 0)).toFixed(2)),
              // Datos del lote para devoluciones
              loteId: mov.loteId,
              numeroLote: mov.numeroLote,
              precioCompraUnitario: mov.precioCompraUnitario,
              gananciaUnitaria: parseFloat(item.precioVentaUnitario || 0) - mov.precioCompraUnitario,
              gananciaTotal: (parseFloat(item.precioVentaUnitario || 0) - mov.precioCompraUnitario) * mov.cantidadConsumida,
              // Referencia al crédito
              creditoId: creditoActivo.id,
              numeroCredito: creditoActivo.numeroCredito,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }

        // ── Actualizar crédito con ventaId ──────────────────
        transaction.update(creditoRef, { ventaId: ventaRef.id });
      });

      alert(`¡Crédito registrado exitosamente!\n\nTotal: S/. ${parseFloat(creditoActivo.totalCredito || 0).toFixed(2)}\nCliente: ${selectedCliente.label}\nN° Venta generada: ${numeroVenta}`);
      setCreditoActivo(null);
      setItemsCreditoActivo([]);
      setSelectedCliente(null);
      setObservaciones('');
      setFechaVencimiento('');
      router.push('/creditos/activos');
    } catch (err) {
      alert('Error al registrar crédito: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Registrar crédito (con validación de límite) ───────
  const handleRegistrarCredito = async () => {
    if (!creditoActivo?.id) return;
    if (!selectedCliente) { alert('Por favor selecciona un cliente con crédito activado'); return; }
    if (itemsCreditoActivo.length === 0) { alert('El crédito debe tener al menos un producto'); return; }
    if (!window.confirm('¿REGISTRAR este crédito? Esto consumirá stock FIFO y aumentará la deuda del cliente.')) return;

    // Validar límite antes de registrar
    const totalCredito = parseFloat(creditoActivo.totalCredito || 0);
    const validacion = await validarLimiteCredito(totalCredito);
    if (validacion.excede) {
      setLimitModalData({
        nuevoTotal: totalCredito,
        creditoMaximo: validacion.creditoMaximo,
        deudaActual: validacion.deudaActual,
        totalFinal: validacion.totalFinal,
        exceso: validacion.exceso,
        esRegistro: true,
      });
      setAdminPassword('');
      setAdminError('');
      setShowLimitModal(true);
      return;
    }

    await ejecutarRegistroCredito();
  };

  // ── Eliminar crédito temporal ──────────────────────────
  const handleEliminarCreditoTemporal = async () => {
    if (!creditoActivo?.id) return;
    if (!window.confirm('¿Eliminar este crédito temporal? Se perderán todos los productos.')) return;
    try {
      const itemsSnap = await getDocs(query(collection(db, 'creditos', creditoActivo.id, 'itemsCredito')));
      for (const d of itemsSnap.docs) await deleteDoc(d.ref);
      await deleteDoc(doc(db, 'creditos', creditoActivo.id));
      setCreditoActivo(null);
      setItemsCreditoActivo([]);
      setSelectedCliente(null);
      setObservaciones('');
      setFechaVencimiento('');
      alert('Crédito temporal eliminado');
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  // ── Actualizar item ────────────────────────────────────
  const handleUpdateItem = async () => {
    if (!creditoActivo?.id || !editingItem) return;
    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'creditos', creditoActivo.id, 'itemsCredito', editingItem.id);
        const creditoRef = doc(db, 'creditos', creditoActivo.id);
        const creditoSnap = await transaction.get(creditoRef);
        if (!creditoSnap.exists()) throw new Error("Crédito no encontrado");
        const oldSubtotal = parseFloat(editingItem.subtotal || 0);
        const newSubtotal = editQuantity * editPrecio;
        transaction.update(itemRef, { cantidad: editQuantity, precioVentaUnitario: editPrecio, subtotal: newSubtotal, updatedAt: serverTimestamp() });
        const updatedTotal = parseFloat(creditoSnap.data().totalCredito || 0) - oldSubtotal + newSubtotal;
        transaction.update(creditoRef, { totalCredito: parseFloat(updatedTotal.toFixed(2)), updatedAt: serverTimestamp() });
      });
      setShowEditItemModal(false);
    } catch (err) {
      setError("Error al actualizar producto");
    }
  };

  // ── Eliminar item ──────────────────────────────────────
  const handleRemoveItem = async (itemId, subtotal) => {
    if (!creditoActivo?.id || !itemId) return;
    if (!window.confirm('¿Eliminar este producto del crédito?')) return;
    try {
      await runTransaction(db, async (transaction) => {
        const creditoSnap = await transaction.get(doc(db, 'creditos', creditoActivo.id));
        if (!creditoSnap.exists()) throw new Error("Crédito no encontrado");
        const updatedTotal = parseFloat(creditoSnap.data().totalCredito || 0) - parseFloat(subtotal);
        transaction.delete(doc(db, 'creditos', creditoActivo.id, 'itemsCredito', itemId));
        transaction.update(doc(db, 'creditos', creditoActivo.id), { totalCredito: parseFloat(updatedTotal.toFixed(2)), updatedAt: serverTimestamp() });
      });
    } catch (err) {
      setError("Error al eliminar producto");
    }
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setEditQuantity(item.cantidad);
    setEditPrecio(parseFloat(item.precioVentaUnitario || 0));
    setShowEditItemModal(true);
  };

  const clienteOptions = clientesConCredito.map(c => ({
    value: c.id,
    label: `${c.nombre} ${c.apellido || ''} - ${c.dni || ''} - Crédito Actual: S/.${parseFloat(c.montoCreditoActual || 0).toFixed(2)}`.trim()
  }));

  if (!user) return null;

  return (
    <Layout title="Nuevo Crédito">
      <div className="w-full px-2 py-4">
        {error && (
          <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-4 p-4">

            {/* ── Panel Izquierdo ─────────────────────────── */}
            <div className="col-span-12 lg:col-span-3">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h2 className="text-lg font-semibold mb-4 text-gray-800">Créditos Temporales</h2>
                <button
                  onClick={handleNuevoCredito}
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg flex items-center justify-center mb-4 transition-colors font-medium"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Nuevo Crédito
                </button>

                <div className="max-h-64 overflow-y-auto space-y-2">
                  {creditosTemporales.length === 0 ? (
                    <p className="text-gray-500 text-center py-4 text-sm">No hay créditos temporales</p>
                  ) : (
                    creditosTemporales.map(credito => (
                      <div
                        key={credito.id}
                        onClick={() => handleSelectCredito(credito)}
                        className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                          creditoActivo?.id === credito.id
                            ? 'bg-purple-50 border-purple-500 shadow-md'
                            : 'bg-white hover:bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="font-medium text-sm text-gray-800">{credito.numeroCredito}</div>
                        <div className="text-xs text-gray-600">{credito.clienteNombre}</div>
                        <div className="text-xs font-semibold text-purple-600">S/. {parseFloat(credito.totalCredito || 0).toFixed(2)}</div>
                        <div className="text-xs text-gray-400">
                          {credito.fechaCreacion?.toDate?.() ? credito.fechaCreacion.toDate().toLocaleDateString() : 'Fecha N/A'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {creditoActivo && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-lg mb-4 text-gray-800">Datos del Crédito</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Cliente (Solo con Crédito):</label>
                      <Select
                        options={clienteOptions}
                        value={selectedCliente}
                        onChange={handleUpdateCliente}
                        placeholder="Seleccionar cliente..."
                        className="text-sm"
                        isClearable
                      />
                    </div>

                    {/* Indicador de límite si hay cliente */}
                    {selectedCliente && (() => {
                      const cliente = clientesConCredito.find(c => c.id === selectedCliente.value);
                      if (!cliente) return null;
                      const deuda = parseFloat(cliente.montoCreditoActual || 0);
                      const limite = parseFloat(cliente.creditoMaximo || 0);
                      const totalConCredito = deuda + parseFloat(creditoActivo.totalCredito || 0);
                      const porcentaje = limite > 0 ? Math.min(100, (totalConCredito / limite) * 100) : 0;
                      const colorBarra = porcentaje >= 90 ? 'bg-red-500' : porcentaje >= 60 ? 'bg-yellow-500' : 'bg-green-500';
                      if (limite <= 0) return null;
                      return (
                        <div className={`rounded-lg p-3 border ${totalConCredito > limite ? 'bg-red-50 border-red-300' : 'bg-blue-50 border-blue-200'}`}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-gray-700">Uso del crédito</span>
                            <span className={`font-bold ${totalConCredito > limite ? 'text-red-700' : 'text-blue-700'}`}>
                              S/. {totalConCredito.toFixed(2)} / S/. {limite.toFixed(2)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                            <div className={`h-2 rounded-full transition-all ${colorBarra}`} style={{ width: `${porcentaje}%` }} />
                          </div>
                          {totalConCredito > limite && (
                            <p className="text-xs text-red-700 font-semibold mt-1">
                              ⚠️ Excede el límite en S/. {(totalConCredito - limite).toFixed(2)} — requiere autorización admin
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de Vencimiento:</label>
                      <input
                        type="date"
                        value={fechaVencimiento}
                        onChange={(e) => handleUpdateFechaVencimiento(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Observaciones:</label>
                      <textarea
                        value={observaciones}
                        onChange={(e) => handleUpdateObservaciones(e.target.value)}
                        placeholder="Observaciones adicionales..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        rows="3"
                      />
                    </div>

                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                      <div className="text-lg font-bold text-purple-800">
                        Total Crédito: S/. {parseFloat(creditoActivo.totalCredito || 0).toFixed(2)}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <button
                        onClick={handleRegistrarCredito}
                        disabled={!selectedCliente || itemsCreditoActivo.length === 0 || loading}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg flex items-center justify-center font-medium transition-colors"
                      >
                        <BanknotesIcon className="h-5 w-5 mr-2" />
                        {loading ? 'Registrando...' : 'Registrar Crédito'}
                      </button>
                      <button
                        onClick={handleEliminarCreditoTemporal}
                        disabled={loading}
                        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg flex items-center justify-center font-medium transition-colors"
                      >
                        <ShieldCheckIcon className="h-5 w-5 mr-2" />
                        Eliminar Temporal
                      </button>
                      <button
                        onClick={() => router.push('/creditos/activos')}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg flex items-center justify-center font-medium transition-colors"
                      >
                        <CheckIcon className="h-5 w-5 mr-2" />
                        Ver Créditos Activos
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Panel Derecho ───────────────────────────── */}
            <div className="col-span-12 lg:col-span-9">
              {/* Buscador */}
              <div className="bg-white border border-gray-400 rounded-lg mb-6 relative">
                <div className="p-4">
                  <h2 className="text-lg font-semibold mb-4 text-gray-800">Buscar Productos</h2>
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Nombre, marca, código..."
                      className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    {searchTerm && (
                      <button onClick={() => { setSearchTerm(''); setFilteredProductos([]); }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    {!searchTerm.trim() ? 'Escribe para buscar productos...' : isSearching ? 'Buscando...' : `${filteredProductos.length} productos encontrados`}
                  </div>
                </div>

                {searchTerm.trim() !== '' && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-400 rounded-b-lg shadow-lg z-40 max-h-96 overflow-y-auto">
                    {isSearching ? (
                      <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div></div>
                    ) : filteredProductos.length === 0 ? (
                      <div className="p-4 text-center text-gray-500"><p>No se encontraron productos</p></div>
                    ) : (
                      <div>
                        {filteredProductos.slice(0, 20).map(producto => (
                          <ProductSearchItem
                            key={producto.id}
                            producto={producto}
                            onSelectProduct={(p) => { handleSelectProduct(p); setSearchTerm(''); }}
                            onClearSearch={() => setSearchTerm('')}
                          />
                        ))}
                        {filteredProductos.length > 20 && (
                          <div className="p-3 text-center text-sm text-gray-500 bg-gray-50">
                            Mostrando 20 de {filteredProductos.length} resultados.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Items */}
              {!creditoActivo ? (
                <div className="bg-white border border-gray-400 rounded-lg p-8 text-center">
                  <CreditCardIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-xl font-medium text-gray-600 mb-2">Selecciona o crea un crédito</h3>
                  <p className="text-gray-500">Crea un nuevo crédito o selecciona uno temporal para agregar productos</p>
                </div>
              ) : (
                <div className="bg-white border border-gray-400 rounded-lg">
                  <div className="p-4 border-b border-gray-400">
                    <h3 className="text-xl font-semibold text-gray-800">Items del Crédito: {creditoActivo.numeroCredito || 'Nuevo'}</h3>
                  </div>
                  <div className="p-4">
                    {itemsCreditoActivo.length === 0 ? (
                      <div className="text-center py-12">
                        <CreditCardIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <h4 className="text-lg font-medium text-gray-600 mb-2">No hay productos en este crédito</h4>
                        <p className="text-gray-500">Usa el buscador arriba para agregar productos</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse min-w-full">
                            <thead className="bg-purple-50">
                              <tr className="border-b border-gray-400">
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">C. TIENDA</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide min-w-48">PRODUCTO</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">C. PROVEEDOR</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">MARCA</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">MEDIDA</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">CANT.</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">P. COMPRA</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">P. VENTA MIN</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">P. VENTA</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">SUBTOTAL</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">ACCIONES</th>
                              </tr>
                            </thead>
                            <tbody>
                              {itemsCreditoActivo.map((item, index) => (
                                <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-3 py-3 text-center whitespace-nowrap"><span className="text-sm font-medium text-gray-900">{item.codigoTienda || 'N/A'}</span></td>
                                  <td className="px-4 py-3 min-w-48"><div className="font-medium text-gray-900 text-sm">{item.nombreProducto}</div></td>
                                  <td className="px-3 py-3 text-center whitespace-nowrap"><span className="text-sm font-medium text-gray-900">{item.codigoProveedor || 'N/A'}</span></td>
                                  <td className="px-3 py-3 text-center whitespace-nowrap"><span className="text-sm text-gray-700">{item.marca || 'Sin marca'}</span></td>
                                  <td className="px-3 py-3 text-center whitespace-nowrap"><span className="text-sm text-gray-700">{item.medida || 'N/A'}</span></td>
                                  <td className="px-3 py-3 text-center whitespace-nowrap"><span className="text-sm font-medium text-gray-900">{item.cantidad}</span></td>
                                  <td className="px-3 py-3 text-center whitespace-nowrap"><span className="text-sm font-medium text-gray-900">S/. {parseFloat(item.precioCompraDefault || 0).toFixed(2)}</span></td>
                                  <td className="px-3 py-3 text-center whitespace-nowrap"><span className="text-sm font-medium text-gray-900">S/. {parseFloat(item.precioVentaMinimo || 0).toFixed(2)}</span></td>
                                  <td className="px-3 py-3 text-center whitespace-nowrap"><span className="text-sm font-medium text-gray-900">S/. {parseFloat(item.precioVentaUnitario || 0).toFixed(2)}</span></td>
                                  <td className="px-3 py-3 text-center whitespace-nowrap"><span className="text-sm font-semibold text-gray-900">S/. {parseFloat(item.subtotal || 0).toFixed(2)}</span></td>
                                  <td className="px-3 py-3 text-center whitespace-nowrap">
                                    <div className="flex justify-center space-x-2">
                                      <button onClick={() => handleEditItem(item)} className="text-purple-600 hover:text-purple-800 p-1 rounded hover:bg-purple-50 transition-colors" title="Editar">
                                        <PencilIcon className="h-4 w-4" />
                                      </button>
                                      <button onClick={() => handleRemoveItem(item.id, item.subtotal)} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors" title="Eliminar">
                                        <ShieldCheckIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 border-t border-gray-400">
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="text-lg font-semibold">Total del Crédito</h3>
                              <p className="text-purple-100 text-sm">{itemsCreditoActivo.length} producto{itemsCreditoActivo.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="text-3xl font-bold">S/. {parseFloat(creditoActivo.totalCredito || 0).toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Modal Cantidad ──────────────────────────────── */}
        {showQuantityModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowQuantityModal(false)} />
              <div className="relative bg-white rounded-xl shadow-xl w-[95vw] max-w-5xl p-10">
                <button onClick={() => setShowQuantityModal(false)} className="absolute right-4 top-4 text-gray-400 hover:text-gray-500">
                  <XMarkIcon className="h-6 w-6" />
                </button>
                <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <CreditCardIcon className="h-7 w-7 text-purple-600" />
                  Agregar Producto a Crédito
                </h3>
                {selectedProduct && (
                  <div className="grid grid-cols-2 gap-8 items-stretch">
                    <div className="flex flex-col gap-4 h-full">
                      <div className="bg-gray-50 p-5 rounded-lg border-2 border-purple-200">
                        <h4 className="font-bold text-xl text-gray-900 mb-1">{selectedProduct.nombre}</h4>
                        {selectedProduct.codigoProveedor && (
                          <div className="mb-3">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold bg-purple-100 text-purple-800 font-mono">
                              C. Proveedor: {selectedProduct.codigoProveedor}
                            </span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><span className="font-medium text-gray-600">C. Tienda: </span><span className="text-gray-800">{selectedProduct.codigoTienda || 'N/A'}</span></div>
                          <div><span className="font-medium text-gray-600">Marca: </span><span className="text-gray-800">{selectedProduct.marca || 'Sin marca'}</span></div>
                          <div><span className="font-medium text-gray-600">Medida: </span><span className="text-gray-800">{selectedProduct.medida || 'N/A'}</span></div>
                          <div><span className="font-medium text-gray-600">Color: </span><span className="text-gray-800">{selectedProduct.color || 'N/A'}</span></div>
                          <div><span className="font-medium text-gray-600">Stock: </span><span className="font-bold text-gray-900">{selectedProduct.stockActual || 0}</span></div>
                        </div>
                      </div>
                      <div className="border border-amber-200 rounded-lg overflow-hidden flex-1">
                        <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Precios de referencia</span>
                        </div>
                        <div className="divide-y divide-amber-100">
                          <div className="flex items-center justify-between px-4 py-3">
                            <span className="text-sm text-gray-600">Precio de compra</span>
                            <span className="text-base font-bold text-amber-800">S/. {parseFloat(selectedProduct.precioCompraDefault || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-3">
                            <span className="text-sm text-gray-600">Precio venta mínimo</span>
                            <span className="text-base font-bold text-red-700">S/. {parseFloat(selectedProduct.precioVentaMinimo || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-3">
                            <span className="text-sm text-gray-600">Precio venta sugerido</span>
                            <span className="text-base font-bold text-green-700">S/. {parseFloat(selectedProduct.precioVentaDefault || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                        <p className="text-sm text-purple-700">⚠️ <strong>Crédito temporal:</strong> El stock NO se reducirá hasta registrar el crédito.</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-5 h-full">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad</label>
                          <input type="number" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)} min="1" max={selectedProduct.stockActual || 999} onWheel={(e) => e.target.blur()}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Venta (S/.)</label>
                          <input type="number" value={precioVenta} onChange={(e) => setPrecioVenta(parseFloat(e.target.value) || 0)} min="0" step="0.01" onWheel={(e) => e.target.blur()}
                            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent text-base ${precioVenta < parseFloat(selectedProduct.precioVentaMinimo || 0) ? 'border-red-300 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-purple-500'}`} />
                          {precioVenta < parseFloat(selectedProduct.precioVentaMinimo || 0) && (
                            <p className="text-red-600 text-xs mt-1 font-medium">⚠️ Precio por debajo del mínimo</p>
                          )}
                        </div>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Preview con precio ingresado</p>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Ganancia unit.:</span>
                            <span className={`font-bold ${(precioVenta - parseFloat(selectedProduct.precioCompraDefault || 0)) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              S/. {(precioVenta - parseFloat(selectedProduct.precioCompraDefault || 0)).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Ganancia total:</span>
                            <span className={`font-bold ${(quantity * (precioVenta - parseFloat(selectedProduct.precioCompraDefault || 0))) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              S/. {(quantity * (precioVenta - parseFloat(selectedProduct.precioCompraDefault || 0))).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-auto flex flex-col gap-4">
                        <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-5 rounded-lg border border-purple-200">
                          <div className="flex justify-between items-center">
                            <span className="text-lg font-medium text-gray-700">Subtotal:</span>
                            <span className="font-bold text-purple-800 text-2xl">S/. {(quantity * precioVenta).toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex justify-end gap-3">
                          <button onClick={() => setShowQuantityModal(false)} className="px-6 py-3 rounded-lg bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-semibold text-base">Cancelar</button>
                          <button onClick={handleAddProductToCredito} disabled={!creditoActivo || quantity <= 0 || precioVenta <= 0}
                            className="px-6 py-3 rounded-lg bg-purple-600 text-white font-semibold text-base hover:bg-purple-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                            Agregar a Crédito
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Modal Edición Item ──────────────────────────── */}
        {showEditItemModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowEditItemModal(false)} />
              <div className="relative bg-white rounded-xl shadow-xl w-[95vw] max-w-5xl p-10">
                <button onClick={() => setShowEditItemModal(false)} className="absolute right-4 top-4 text-gray-400 hover:text-gray-500"><XMarkIcon className="h-6 w-6" /></button>
                <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <PencilIcon className="h-7 w-7 text-yellow-600" />
                  Editar Producto en Crédito
                </h3>
                {editingItem && (
                  <div className="grid grid-cols-2 gap-8 items-stretch">
                    <div className="flex flex-col gap-4 h-full">
                      <div className="bg-gray-50 p-5 rounded-lg border-2 border-yellow-200">
                        <h4 className="font-bold text-xl text-gray-900 mb-1">{editingItem.nombreProducto}</h4>
                        {editingItem.codigoProveedor && (
                          <div className="mb-3"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold bg-yellow-100 text-yellow-800 font-mono">C. Proveedor: {editingItem.codigoProveedor}</span></div>
                        )}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><span className="font-medium text-gray-600">C. Tienda: </span><span className="text-gray-800">{editingItem.codigoTienda || 'N/A'}</span></div>
                          <div><span className="font-medium text-gray-600">Marca: </span><span className="text-gray-800">{editingItem.marca || 'Sin marca'}</span></div>
                          <div><span className="font-medium text-gray-600">Medida: </span><span className="text-gray-800">{editingItem.medida || 'N/A'}</span></div>
                        </div>
                      </div>
                      <div className="border border-amber-200 rounded-lg overflow-hidden flex-1">
                        <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Precios de referencia</span>
                        </div>
                        <div className="divide-y divide-amber-100">
                          <div className="flex items-center justify-between px-4 py-3"><span className="text-sm text-gray-600">Precio de compra</span><span className="text-base font-bold text-amber-800">S/. {parseFloat(editingItem.precioCompraDefault || 0).toFixed(2)}</span></div>
                          <div className="flex items-center justify-between px-4 py-3"><span className="text-sm text-gray-600">Precio venta mínimo</span><span className="text-base font-bold text-red-700">S/. {parseFloat(editingItem.precioVentaMinimo || 0).toFixed(2)}</span></div>
                          <div className="flex items-center justify-between px-4 py-3"><span className="text-sm text-gray-600">Precio venta actual</span><span className="text-base font-bold text-green-700">S/. {parseFloat(editingItem.precioVentaUnitario || 0).toFixed(2)}</span></div>
                          <div className="flex items-center justify-between px-4 py-3">
                            <span className="text-sm text-gray-600">Ganancia unitaria</span>
                            <span className={`text-base font-bold ${parseFloat(editingItem.precioVentaUnitario || 0) - parseFloat(editingItem.precioCompraDefault || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              S/. {(parseFloat(editingItem.precioVentaUnitario || 0) - parseFloat(editingItem.precioCompraDefault || 0)).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-5 h-full">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad</label>
                          <input type="number" value={editQuantity} onChange={(e) => setEditQuantity(parseInt(e.target.value) || 1)} min="1" onWheel={(e) => e.target.blur()}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Venta (S/.)</label>
                          <input type="number" value={editPrecio} onChange={(e) => setEditPrecio(parseFloat(e.target.value) || 0)} min="0" step="0.01" onWheel={(e) => e.target.blur()}
                            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent text-base ${editPrecio < parseFloat(editingItem.precioVentaMinimo || 0) ? 'border-red-300 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-yellow-500'}`} />
                          {editPrecio < parseFloat(editingItem.precioVentaMinimo || 0) && (
                            <p className="text-red-600 text-xs mt-1 font-medium">⚠️ Precio por debajo del mínimo</p>
                          )}
                        </div>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Preview con nuevo precio</p>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Ganancia unit.:</span>
                            <span className={`font-bold ${(editPrecio - parseFloat(editingItem.precioCompraDefault || 0)) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              S/. {(editPrecio - parseFloat(editingItem.precioCompraDefault || 0)).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Ganancia total:</span>
                            <span className={`font-bold ${(editQuantity * (editPrecio - parseFloat(editingItem.precioCompraDefault || 0))) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              S/. {(editQuantity * (editPrecio - parseFloat(editingItem.precioCompraDefault || 0))).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-auto flex flex-col gap-4">
                        <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-5 rounded-lg border border-yellow-200">
                          <div className="flex justify-between items-center">
                            <span className="text-lg font-medium text-gray-700">Nuevo Subtotal:</span>
                            <span className="font-bold text-yellow-800 text-2xl">S/. {(editQuantity * editPrecio).toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex justify-end gap-3">
                          <button onClick={() => setShowEditItemModal(false)} className="px-6 py-3 rounded-lg bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-semibold text-base">Cancelar</button>
                          <button onClick={handleUpdateItem} disabled={editQuantity <= 0 || editPrecio <= 0}
                            className="px-6 py-3 rounded-lg bg-yellow-600 text-white font-semibold text-base hover:bg-yellow-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                            Actualizar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Modal Límite de Crédito ─────────────────────── */}
        {showLimitModal && limitModalData && (
          <div className="fixed inset-0 z-[60] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="fixed inset-0 bg-gray-900 bg-opacity-80" />
              <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg p-8">

                <div className="flex items-start gap-4 mb-6">
                  <div className="flex-shrink-0 bg-red-100 p-3 rounded-full">
                    <ShieldCheckIcon className="h-8 w-8 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Límite de Crédito Superado</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {limitModalData.esRegistro
                        ? 'El total del crédito supera el límite del cliente al registrar.'
                        : 'Agregar este producto supera el límite de crédito del cliente.'
                      }
                    </p>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Deuda actual del cliente:</span>
                    <span className="font-semibold text-gray-800">S/. {limitModalData.deudaActual.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total de este crédito:</span>
                    <span className="font-semibold text-gray-800">S/. {limitModalData.nuevoTotal.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-red-200 pt-2 flex justify-between text-sm">
                    <span className="text-gray-600">Total final si se aprueba:</span>
                    <span className="font-bold text-red-700">S/. {limitModalData.totalFinal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Límite máximo permitido:</span>
                    <span className="font-semibold text-gray-800">S/. {limitModalData.creditoMaximo.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-red-700">Exceso sobre el límite:</span>
                    <span className="text-red-700">S/. {limitModalData.exceso.toFixed(2)}</span>
                  </div>
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div className="h-3 rounded-full bg-red-500 w-full" />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>S/. 0</span>
                      <span className="text-red-600 font-semibold">Límite: S/. {limitModalData.creditoMaximo.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-gray-700">Contraseña del Administrador</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => { setAdminPassword(e.target.value); setAdminError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAutorizarAdmin()}
                    placeholder="Ingrese la contraseña de admin..."
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:outline-none text-base ${adminError ? 'border-red-300 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-purple-500'}`}
                  />
                  {adminError && <p className="text-red-600 text-sm font-medium">⚠️ {adminError}</p>}
                  <p className="text-xs text-gray-500">Solo el administrador puede autorizar operaciones que superen el límite de crédito.</p>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => { setShowLimitModal(false); setLimitModalData(null); setAdminPassword(''); setAdminError(''); }}
                    className="flex-1 px-4 py-3 rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 font-semibold text-sm transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAutorizarAdmin}
                    disabled={validatingAdmin || !adminPassword.trim()}
                    className="flex-1 px-4 py-3 rounded-lg bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                  >
                    {validatingAdmin ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Verificando...</>
                    ) : (
                      <><ShieldCheckIcon className="h-4 w-4" />Autorizar y {limitModalData.esRegistro ? 'Registrar' : 'Agregar'}</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default NuevoCreditoPage;