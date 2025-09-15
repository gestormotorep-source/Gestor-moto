// pages/creditos/nueva.js - SISTEMA CORREGIDO

import { useState, useEffect, Fragment } from 'react';
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import {
  collection,
  getDocs,
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
  UserIcon,
  TruckIcon,
  BanknotesIcon,
  DocumentTextIcon,
  CheckIcon,
  PencilIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';
import { Dialog, Transition } from '@headlessui/react';
import Select from 'react-select';

const NuevoCreditoPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Estados para productos - SIN CARGAR AUTOMÁTICAMENTE
  const [productos, setProductos] = useState([]);
  const [filteredProductos, setFilteredProductos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Estados para datos de referencia - SOLO CLIENTES CON CRÉDITO ACTIVADO
  const [clientesConCredito, setClientesConCredito] = useState([]);

  // Estados para créditos (cambio: borrador -> temporal)
  const [creditosTemporales, setCreditosTemporales] = useState([]);
  const [creditoActivo, setCreditoActivo] = useState(null);
  const [itemsCreditoActivo, setItemsCreditoActivo] = useState([]);

  // Estados para el formulario de crédito
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [observaciones, setObservaciones] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');

  // Estados para modal de cantidad
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [precioVenta, setPrecioVenta] = useState(0);

  // Estados para modal de edición de item
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editPrecio, setEditPrecio] = useState(0);

  // Cargar datos iniciales (sin productos)
  useEffect(() => {
    if (!user) {
      router.push('/auth');
      return;
    }
    fetchInitialData();
  }, [user, router]);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Cargar SOLO clientes con crédito activado
      const qClientesCredito = query(
        collection(db, 'cliente'), 
        where('tieneCredito', '==', true),
        orderBy('nombre', 'asc')
      );
      const clientesCreditoSnapshot = await getDocs(qClientesCredito);
      const clientesCreditoList = clientesCreditoSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setClientesConCredito(clientesCreditoList);

      console.log('Clientes con crédito cargados:', clientesCreditoList.length);

    } catch (err) {
      console.error("Error al cargar datos iniciales:", err);
      setError("Error al cargar datos iniciales");
    } finally {
      setLoading(false);
    }
  };

  // Búsqueda de productos - idéntica a cotizaciones
  const searchProducts = async (searchTerm) => {
    if (!searchTerm.trim()) {
      setFilteredProductos([]);
      return;
    }

    setIsSearching(true);
    try {
      const qProductos = query(collection(db, 'productos'), orderBy('nombre', 'asc'));
      const productosSnapshot = await getDocs(qProductos);
      const productosList = productosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const searchTermLower = searchTerm.toLowerCase();
      
      const filtered = productosList.filter(producto => {
        const nombre = (producto.nombre || '').toLowerCase();
        const marca = (producto.marca || '').toLowerCase();
        const codigoTienda = (producto.codigoTienda || '').toLowerCase();
        const codigoProveedor = (producto.codigoProveedor || '').toLowerCase();
        const descripcion = (producto.descripcion || '').toLowerCase();
        
        // Buscar en modelos compatibles IDs
        const modelosCompatibles = producto.modelosCompatiblesIds || [];
        const modelosCompatiblesText = modelosCompatibles.join(' ').toLowerCase();
        
        // Buscar en modelosCompatiblesTexto
        const modelosCompatiblesTexto = (producto.modelosCompatiblesTexto || '').toLowerCase();

        return nombre.includes(searchTermLower) ||
              marca.includes(searchTermLower) ||
              codigoTienda.includes(searchTermLower) ||
              codigoProveedor.includes(searchTermLower) ||
              descripcion.includes(searchTermLower) ||
              modelosCompatiblesText.includes(searchTermLower) ||
              modelosCompatiblesTexto.includes(searchTermLower);
      });

      setFilteredProductos(filtered);
    } catch (err) {
      console.error("Error al buscar productos:", err);
      setError("Error al buscar productos");
    } finally {
      setIsSearching(false);
    }
  };

  // Efecto para buscar productos con debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm.trim()) {
        searchProducts(searchTerm);
      } else {
        setFilteredProductos([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Escuchar créditos temporales (cambio de borrador a temporal)
  useEffect(() => {
    if (!user) return;

    console.log('Setting up temporary credits listener...');

    const qTemporales = query(
      collection(db, 'creditos'),
      where('estado', '==', 'temporal'),
      orderBy('fechaCreacion', 'desc')
    );

    const unsubscribe = onSnapshot(qTemporales, (snapshot) => {
      console.log('Snapshot received for temporary credits:', snapshot.size, 'documents');
      
      const creditosList = snapshot.docs.map(doc => {
        const data = doc.data();
        console.log('Credit doc data:', doc.id, data);
        return {
          id: doc.id,
          ...data
        };
      });
      
      console.log('Setting creditosTemporales:', creditosList);
      setCreditosTemporales(creditosList);
    }, (err) => {
      console.error("Error al escuchar créditos temporales:", err);
    });

    return () => {
      console.log('Cleaning up temporary credits listener');
      unsubscribe();
    };
  }, [user]);

  // Escuchar cambios en crédito activo
  useEffect(() => {
    if (!creditoActivo?.id) {
      setItemsCreditoActivo([]);
      return;
    }

    console.log('Setting up active credit listener for ID:', creditoActivo.id);

    const unsubscribe = onSnapshot(doc(db, 'creditos', creditoActivo.id), async (docSnap) => {
      console.log('Active credit snapshot received, exists:', docSnap.exists());
      
      if (docSnap.exists()) {
        const creditoData = { id: docSnap.id, ...docSnap.data() };
        console.log('Setting active credit:', creditoData);
        setCreditoActivo(creditoData);

        // Cargar items
        try {
          const qItems = query(
            collection(db, 'creditos', creditoActivo.id, 'itemsCredito'), 
            orderBy('createdAt', 'asc')
          );
          const itemsSnapshot = await getDocs(qItems);
          const itemsList = itemsSnapshot.docs.map(itemDoc => ({
            id: itemDoc.id,
            ...itemDoc.data()
          }));
          
          console.log('Setting active credit items:', itemsList);
          setItemsCreditoActivo(itemsList);
        } catch (itemsError) {
          console.error('Error loading credit items:', itemsError);
          setItemsCreditoActivo([]);
        }
      } else {
        console.log('Active credit not found, clearing state');
        setCreditoActivo(null);
        setItemsCreditoActivo([]);
      }
    });

    return () => {
      console.log('Cleaning up active credit listener');
      unsubscribe();
    };
  }, [creditoActivo?.id]);

  // Sincronizar formulario con crédito activo
  useEffect(() => {
    if (creditoActivo) {
      // Sincronizar cliente
      const cliente = clientesConCredito.find(c => c.id === creditoActivo.clienteId);
      setSelectedCliente(cliente ? {
        value: cliente.id,
        label: `${cliente.nombre} ${cliente.apellido || ''} - ${cliente.dni || ''} - Crédito: S/.${parseFloat(cliente.montoCreditoActual || 0).toFixed(2)}`.trim()
      } : null);

      setObservaciones(creditoActivo.observaciones || '');

      // Formatear fecha de vencimiento
      if (creditoActivo.fechaVencimiento) {
        const fechaVenc = creditoActivo.fechaVencimiento instanceof Date 
          ? creditoActivo.fechaVencimiento 
          : creditoActivo.fechaVencimiento.toDate();
        setFechaVencimiento(fechaVenc.toISOString().split('T')[0]);
      }
    }
  }, [creditoActivo, clientesConCredito]);

  // Crear nuevo crédito temporal
  const handleNuevoCredito = async () => {
    setLoading(true);
    try {
      // Crear fecha de vencimiento por defecto (30 días desde hoy)
      const fechaVencimientoDefault = new Date();
      fechaVencimientoDefault.setDate(fechaVencimientoDefault.getDate() + 30);

      console.log('Creating new temporary credit...');
      
      const newCreditData = {
        numeroCredito: `CRE-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        clienteId: null,
        clienteNombre: 'Cliente Pendiente',
        clienteDNI: null,
        totalCredito: 0,
        fechaCreacion: serverTimestamp(),
        fechaVencimiento: fechaVencimientoDefault,
        estado: 'temporal', // CAMBIO: de 'borrador' a 'temporal'
        observaciones: '',
        empleadoId: user.email || user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      console.log('New credit data:', newCreditData);

      const newCreditRef = await addDoc(collection(db, 'creditos'), newCreditData);
      console.log('New credit created with ID:', newCreditRef.id);

      setCreditoActivo({ id: newCreditRef.id });
      alert('Nuevo crédito temporal creado exitosamente');
    } catch (err) {
      console.error("Error al crear crédito:", err);
      setError("Error al crear nuevo crédito");
      alert('Error al crear nuevo crédito: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Seleccionar crédito temporal
  const handleSelectCredito = (credito) => {
    console.log('Selecting credit:', credito.id);
    setCreditoActivo(credito);
  };

  // Actualizar cliente
  const handleUpdateCliente = async (selectedOption) => {
    if (!creditoActivo?.id) return;

    try {
      await runTransaction(db, async (transaction) => {
        const creditoRef = doc(db, 'creditos', creditoActivo.id);
        let clientData = { nombre: 'Cliente Pendiente', apellido: '', dni: null };

        if (selectedOption) {
          const clientRef = doc(db, 'cliente', selectedOption.value);
          const clientSnap = await transaction.get(clientRef);
          if (clientSnap.exists()) {
            const clienteData = clientSnap.data();
            
            // VALIDACIÓN: Verificar que el cliente tenga crédito activado
            if (!clienteData.tieneCredito) {
              throw new Error("El cliente seleccionado no tiene la opción de crédito activada.");
            }
            
            clientData = clienteData;
          }
        }

        const clientNombre = `${clientData.nombre} ${clientData.apellido || ''}`.trim();

        transaction.update(creditoRef, {
          clienteId: selectedOption?.value || null,
          clienteNombre: clientNombre,
          clienteDNI: clientData.dni || null,
          updatedAt: serverTimestamp(),
        });
      });

      setSelectedCliente(selectedOption);
    } catch (err) {
      console.error("Error al actualizar cliente:", err);
      setError("Error al actualizar cliente: " + err.message);
      alert("Error al actualizar cliente: " + err.message);
    }
  };

  // Actualizar observaciones
  const handleUpdateObservaciones = async (nuevasObservaciones) => {
    if (!creditoActivo?.id) return;

    try {
      const creditoRef = doc(db, 'creditos', creditoActivo.id);
      await updateDoc(creditoRef, {
        observaciones: nuevasObservaciones,
        updatedAt: serverTimestamp(),
      });
      setObservaciones(nuevasObservaciones);
    } catch (err) {
      console.error("Error al actualizar observaciones:", err);
      setError("Error al actualizar observaciones");
    }
  };

  // Actualizar fecha de vencimiento
  const handleUpdateFechaVencimiento = async (nuevaFecha) => {
    if (!creditoActivo?.id) return;

    try {
      const creditoRef = doc(db, 'creditos', creditoActivo.id);
      const fechaVenc = nuevaFecha ? new Date(nuevaFecha) : null;
      
      await updateDoc(creditoRef, {
        fechaVencimiento: fechaVenc,
        updatedAt: serverTimestamp(),
      });
      setFechaVencimiento(nuevaFecha);
    } catch (err) {
      console.error("Error al actualizar fecha de vencimiento:", err);
      setError("Error al actualizar fecha de vencimiento");
    }
  };

  // Abrir modal de cantidad
  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setPrecioVenta(parseFloat(product.precioVentaDefault || 0));
    setQuantity(1);
    setShowQuantityModal(true);
  };

  // Agregar producto a crédito (SIN CREAR VENTA)
  const handleAddProductToCredito = async () => {
    if (!creditoActivo?.id || !selectedProduct) return;

    try {
      const creditoItemsRef = collection(db, 'creditos', creditoActivo.id, 'itemsCredito');
      const existingItemQuery = query(creditoItemsRef, where('productoId', '==', selectedProduct.id));
      const existingItemSnapshot = await getDocs(existingItemQuery);

      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'productos', selectedProduct.id);
        const creditoRef = doc(db, 'creditos', creditoActivo.id);

        const productSnap = await transaction.get(productRef);
        const creditoSnap = await transaction.get(creditoRef);

        if (!productSnap.exists() || !creditoSnap.exists()) {
          throw new Error("Producto o crédito no encontrado");
        }

        // Obtener los datos más recientes del producto
        const productData = productSnap.data();

        // VERIFICAR STOCK DISPONIBLE
        const stockActual = productData.stockActual || 0;
        if (stockActual < quantity) {
          throw new Error(`Stock insuficiente. Disponible: ${stockActual}, Solicitado: ${quantity}`);
        }

        let itemRef;
        let newQuantity;
        let oldSubtotal = 0;

        if (!existingItemSnapshot.empty) {
          const existingItemDoc = existingItemSnapshot.docs[0];
          itemRef = existingItemDoc.ref;
          const existingItemData = existingItemDoc.data();
          oldSubtotal = parseFloat(existingItemData.subtotal || 0);
          newQuantity = existingItemData.cantidad + quantity;
          const newSubtotal = newQuantity * precioVenta;

          transaction.update(itemRef, {
            cantidad: newQuantity,
            subtotal: newSubtotal,
            precioCompraDefault: productData.precioCompraDefault || 0,
            precioVentaMinimo: productData.precioVentaMinimo || 0,
            precioVentaUnitario: precioVenta,
            color: productData.color || '',
            updatedAt: serverTimestamp(),
          });
        } else {
          itemRef = doc(creditoItemsRef);
          newQuantity = quantity;
          const newSubtotal = newQuantity * precioVenta;

          // Guardar todos los datos del producto, incluyendo color
          transaction.set(itemRef, {
            productoId: selectedProduct.id,
            nombreProducto: productData.nombre || selectedProduct.nombre,
            marca: productData.marca || selectedProduct.marca || '',
            medida: productData.medida || selectedProduct.medida || '',
            codigoProveedor: productData.codigoProveedor || selectedProduct.codigoProveedor || '',   
            precioCompraDefault: productData.precioCompraDefault || selectedProduct.precioCompraDefault || 0,
            precioVentaMinimo: productData.precioVentaMinimo || selectedProduct.precioVentaMinimo || 0,
            codigoTienda: productData.codigoTienda || selectedProduct.codigoTienda || '',
            descripcion: productData.descripcion || selectedProduct.descripcion || '',
            color: productData.color || selectedProduct.color || '',
            cantidad: newQuantity,
            precioVentaUnitario: precioVenta,
            subtotal: newSubtotal,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const currentTotal = parseFloat(creditoSnap.data().totalCredito || 0);
        const finalItemSubtotal = newQuantity * precioVenta;
        const updatedTotal = currentTotal - oldSubtotal + finalItemSubtotal;

        transaction.update(creditoRef, {
          totalCredito: parseFloat(updatedTotal.toFixed(2)),
          updatedAt: serverTimestamp(),
        });

        // NO REDUCIR STOCK AÚN - Se hace cuando se registra el crédito
      });

      setShowQuantityModal(false);
      alert('Producto agregado exitosamente al crédito temporal');
    } catch (err) {
      console.error("Error al agregar producto:", err);
      setError("Error al agregar producto al crédito: " + err.message);
      alert("Error al agregar producto al crédito: " + err.message);
    }
  };

  // Actualizar item de crédito
  const handleUpdateItem = async () => {
    if (!creditoActivo?.id || !editingItem) return;

    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'creditos', creditoActivo.id, 'itemsCredito', editingItem.id);
        const creditoRef = doc(db, 'creditos', creditoActivo.id);

        const creditoSnap = await transaction.get(creditoRef);
        if (!creditoSnap.exists()) {
          throw new Error("Crédito no encontrado");
        }

        const oldSubtotal = parseFloat(editingItem.subtotal || 0);
        const newSubtotal = editQuantity * editPrecio;

        transaction.update(itemRef, {
          cantidad: editQuantity,
          precioVentaUnitario: editPrecio,
          subtotal: newSubtotal,
          updatedAt: serverTimestamp(),
        });

        const currentTotal = parseFloat(creditoSnap.data().totalCredito || 0);
        const updatedTotal = currentTotal - oldSubtotal + newSubtotal;

        transaction.update(creditoRef, {
          totalCredito: parseFloat(updatedTotal.toFixed(2)),
          updatedAt: serverTimestamp(),
        });
      });

      setShowEditItemModal(false);
      alert('Producto actualizado exitosamente');
    } catch (err) {
      console.error("Error al actualizar item:", err);
      setError("Error al actualizar producto");
    }
  };

  // Eliminar item de crédito
  const handleRemoveItem = async (itemId, subtotal) => {
    if (!creditoActivo?.id || !itemId) return;

    if (!window.confirm('¿Eliminar este producto del crédito?')) return;

    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'creditos', creditoActivo.id, 'itemsCredito', itemId);
        const creditoRef = doc(db, 'creditos', creditoActivo.id);

        const creditoSnap = await transaction.get(creditoRef);
        if (!creditoSnap.exists()) {
          throw new Error("Crédito no encontrado");
        }

        const currentTotal = parseFloat(creditoSnap.data().totalCredito || 0);
        const updatedTotal = currentTotal - parseFloat(subtotal);

        transaction.delete(itemRef);
        transaction.update(creditoRef, {
          totalCredito: parseFloat(updatedTotal.toFixed(2)),
          updatedAt: serverTimestamp(),
        });
      });

      alert('Producto eliminado del crédito');
    } catch (err) {
      console.error("Error al eliminar item:", err);
      setError("Error al eliminar producto");
    }
  };


  // Función para consumir stock de lotes según FIFO
const consumirStockFIFO = async (productoId, cantidadConsumida, transaction) => {
  try {
    // Obtener todos los lotes disponibles de la colección principal
    const lotesQuery = query(
      collection(db, 'lotes'),
      where('productoId', '==', productoId),
      where('stockRestante', '>', 0),
      where('estado', '==', 'activo'),
      orderBy('fechaIngreso', 'asc')
    );
    
    const lotesSnapshot = await getDocs(lotesQuery);
    let cantidadPendiente = cantidadConsumida;
    const movimientos = [];
    
    // Consumir de los lotes más antiguos primero
    for (const loteDoc of lotesSnapshot.docs) {
      if (cantidadPendiente <= 0) break;
      
      const lote = loteDoc.data();
      const consumir = Math.min(cantidadPendiente, lote.stockRestante);
      const nuevoStock = lote.stockRestante - consumir;
      
      // Actualizar el lote en la colección principal
      const loteRef = doc(db, 'lotes', loteDoc.id);
      transaction.update(loteRef, {
        stockRestante: nuevoStock,
        estado: nuevoStock <= 0 ? 'agotado' : 'activo',
        updatedAt: serverTimestamp()
      });
      
      // Registrar el movimiento para auditoría
      movimientos.push({
        loteId: loteDoc.id,
        numeroLote: lote.numeroLote,
        cantidadConsumida: consumir,
        precioCompraUnitario: lote.precioCompraUnitario,
        stockRestante: nuevoStock
      });
      
      cantidadPendiente -= consumir;
    }
    
    if (cantidadPendiente > 0) {
      throw new Error(`Stock insuficiente. Faltan ${cantidadPendiente} unidades del producto.`);
    }
    
    return movimientos;
  } catch (error) {
    console.error(`Error al consumir stock FIFO para producto ${productoId}:`, error);
    throw error;
  }
};

// Función para recalcular precio de compra del producto
const recalcularPrecioCompraProducto = async (productoId, transaction) => {
  try {
    // Buscar el nuevo primer lote disponible después del consumo
    const lotesQuery = query(
      collection(db, 'lotes'),
      where('productoId', '==', productoId),
      where('stockRestante', '>', 0),
      where('estado', '==', 'activo'),
      orderBy('fechaIngreso', 'asc'),
      limit(1)
    );
    
    const lotesSnapshot = await getDocs(lotesQuery);
    let nuevoPrecioCompra = 0;
    
    if (!lotesSnapshot.empty) {
      const primerLoteDisponible = lotesSnapshot.docs[0].data();
      nuevoPrecioCompra = parseFloat(primerLoteDisponible.precioCompraUnitario || 0);
    }
    
    // Actualizar el precio de compra del producto
    const productRef = doc(db, 'productos', productoId);
    transaction.update(productRef, {
      precioCompraDefault: nuevoPrecioCompra,
      updatedAt: serverTimestamp()
    });
    
  } catch (error) {
    console.error(`Error al recalcular precio de compra para producto ${productoId}:`, error);
  }
};

  // REEMPLAZAR LA FUNCIÓN handleRegistrarCredito EXISTENTE CON ESTA VERSIÓN FIFO:
const handleRegistrarCredito = async () => {
  if (!creditoActivo?.id) return;

  if (!selectedCliente) {
    alert('Por favor selecciona un cliente con crédito activado');
    return;
  }

  if (itemsCreditoActivo.length === 0) {
    alert('El crédito debe tener al menos un producto');
    return;
  }

  if (!window.confirm('¿REGISTRAR este crédito? Esto consumirá stock de lotes según FIFO y aumentará la deuda del cliente.')) {
    return;
  }

  setLoading(true);

  try {
    await runTransaction(db, async (transaction) => {
      const creditoRef = doc(db, 'creditos', creditoActivo.id);
      const clienteRef = doc(db, 'cliente', selectedCliente.value);

      // ========================================
      // FASE 1: TODAS LAS LECTURAS PRIMERO
      // ========================================
      
      // Leer cliente
      const clienteSnap = await transaction.get(clienteRef);
      if (!clienteSnap.exists()) {
        throw new Error("Cliente no encontrado");
      }

      // Leer todos los productos y verificar stock
      const productSnapshots = {};
      const stockInsuficiente = [];
      
      for (const item of itemsCreditoActivo) {
        const productRef = doc(db, 'productos', item.productoId);
        const productSnap = await transaction.get(productRef);
        
        if (!productSnap.exists()) {
          throw new Error(`Producto ${item.nombreProducto} no encontrado`);
        }
        
        productSnapshots[item.productoId] = productSnap;
        
        const stockActual = productSnap.data().stockActual || 0;
        if (stockActual < item.cantidad) {
          stockInsuficiente.push(`${item.nombreProducto}: disponible ${stockActual}, requerido ${item.cantidad}`);
        }
      }

      if (stockInsuficiente.length > 0) {
        throw new Error(`Stock insuficiente:\n${stockInsuficiente.join('\n')}`);
      }

      // ========================================
      // FASE 2: CONSUMIR LOTES FIFO Y ACTUALIZAR
      // ========================================

      // CONSUMIR STOCK DE LOTES SEGÚN FIFO
      const todosLosMovimientos = [];
      for (const item of itemsCreditoActivo) {
        const cantidadConsumida = parseFloat(item.cantidad);
        
        // Consumir stock de lotes según FIFO
        const movimientos = await consumirStockFIFO(item.productoId, cantidadConsumida, transaction);
        todosLosMovimientos.push({
          productoId: item.productoId,
          nombreProducto: item.nombreProducto,
          movimientos: movimientos
        });
        
        // Actualizar stock total del producto
        const productRef = doc(db, 'productos', item.productoId);
        const productSnap = productSnapshots[item.productoId];
        const stockActual = productSnap.data().stockActual || 0;
        const nuevoStock = stockActual - cantidadConsumida;
        
        transaction.update(productRef, {
          stockActual: nuevoStock,
          updatedAt: serverTimestamp(),
        });

        // Recalcular precio de compra del producto
        await recalcularPrecioCompraProducto(item.productoId, transaction);

        console.log(`Stock consumido FIFO para ${item.nombreProducto}: ${stockActual} -> ${nuevoStock}`);
      }

      // Actualizar el saldo del cliente
      const clienteData = clienteSnap.data();
      const montoActual = parseFloat(clienteData.montoCreditoActual || 0);
      const nuevoMonto = montoActual + parseFloat(creditoActivo.totalCredito || 0);

      transaction.update(clienteRef, {
        montoCreditoActual: nuevoMonto,
        updatedAt: serverTimestamp(),
      });

      // Cambiar estado del crédito a 'activo'
      transaction.update(creditoRef, {
        estado: 'activo',
        fechaActivacion: serverTimestamp(),
        observaciones: observaciones || '',
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
        updatedAt: serverTimestamp(),
      });

      // CREAR REGISTROS DE MOVIMIENTOS DE LOTES PARA AUDITORÍA
      for (const productoMovimiento of todosLosMovimientos) {
        for (const movimiento of productoMovimiento.movimientos) {
          const movimientoRef = doc(collection(db, 'movimientosLotes'));
          transaction.set(movimientoRef, {
            creditoId: creditoActivo.id,
            numeroCredito: creditoActivo.numeroCredito,
            productoId: productoMovimiento.productoId,
            nombreProducto: productoMovimiento.nombreProducto,
            loteId: movimiento.loteId,
            numeroLote: movimiento.numeroLote,
            cantidadConsumida: movimiento.cantidadConsumida,
            precioCompraUnitario: movimiento.precioCompraUnitario,
            stockRestanteLote: movimiento.stockRestante,
            tipoMovimiento: 'credito-activado',
            fechaMovimiento: serverTimestamp(),
            empleadoId: user.email || user.uid,
            createdAt: serverTimestamp()
          });
        }
      }

      console.log(`Crédito registrado con FIFO: Cliente ${selectedCliente.label} - Monto anterior: S/. ${montoActual.toFixed(2)} - Nuevo monto: S/. ${nuevoMonto.toFixed(2)}`);
    });

    alert(`¡Crédito registrado exitosamente con sistema FIFO!\n\nTotal: S/. ${parseFloat(creditoActivo.totalCredito || 0).toFixed(2)}\nCliente: ${selectedCliente.label}\n\nStock consumido según FIFO, precios recalculados automáticamente.`);
    
    // Limpiar formulario
    setCreditoActivo(null);
    setItemsCreditoActivo([]);
    setSelectedCliente(null);
    setObservaciones('');
    setFechaVencimiento('');
    
    // Redirigir al índice de créditos activos
    router.push('/creditos/activos');
    
  } catch (err) {
    console.error("Error al registrar crédito:", err);
    alert('Error al registrar crédito: ' + err.message);
  } finally {
    setLoading(false);
  }
};

  // Eliminar crédito temporal
  const handleEliminarCreditoTemporal = async () => {
    if (!creditoActivo?.id) return;

    if (!window.confirm('¿Eliminar este crédito temporal? Se perderán todos los productos agregados.')) {
      return;
    }

    try {
      // Eliminar items primero
      const qItems = query(
        collection(db, 'creditos', creditoActivo.id, 'itemsCredito')
      );
      const itemsSnapshot = await getDocs(qItems);
      
      for (const itemDoc of itemsSnapshot.docs) {
        await deleteDoc(itemDoc.ref);
      }

      // Eliminar el crédito
      await deleteDoc(doc(db, 'creditos', creditoActivo.id));

      // Limpiar estado
      setCreditoActivo(null);
      setItemsCreditoActivo([]);
      setSelectedCliente(null);
      setObservaciones('');
      setFechaVencimiento('');

      alert('Crédito temporal eliminado exitosamente');
    } catch (err) {
      console.error("Error al eliminar crédito temporal:", err);
      alert('Error al eliminar crédito temporal: ' + err.message);
    }
  };

  // Abrir modal de edición de item
  const handleEditItem = (item) => {
    setEditingItem(item);
    setEditQuantity(item.cantidad);
    setEditPrecio(parseFloat(item.precioVentaUnitario || 0));
    setShowEditItemModal(true);
  };

  const clienteOptions = clientesConCredito.map(cliente => ({
    value: cliente.id,
    label: `${cliente.nombre} ${cliente.apellido || ''} - ${cliente.dni || ''} - Crédito Actual: S/.${parseFloat(cliente.montoCreditoActual || 0).toFixed(2)}`.trim()
  }));

  if (!user) return null;

  return (
  <Layout title="Nuevo Crédito">
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-full mx-auto px-6 sm:px-8 lg:px-12">
        {error && (
          <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50">
            {error}
          </div>
        )}

          <div className="bg-white rounded-xl shadow-lg overflow-hidden">

            <div className="grid grid-cols-12 gap-6 p-6">
              {/* Panel Izquierdo - Créditos Temporales */}
              <div className="col-span-12 lg:col-span-3">
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h2 className="text-lg font-semibold mb-4 text-gray-800">Créditos Temporales</h2>
                  <button
                    onClick={handleNuevoCredito}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg flex items-center justify-center mb-4 transition-colors"
                    disabled={loading}
                  >
                    <PlusIcon className="h-5 w-5 mr-2" />
                    Nuevo Crédito
                  </button>

                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {creditosTemporales.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No hay créditos temporales</p>
                    ) : (
                      creditosTemporales.map(credito => (
                        <div
                          key={credito.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                            creditoActivo?.id === credito.id
                              ? 'bg-purple-50 border-purple-500 shadow-md'
                              : 'bg-white hover:bg-gray-50 border-gray-200'
                          }`}
                          onClick={() => handleSelectCredito(credito)}
                        >
                          <div className="font-medium text-sm text-gray-800">{credito.numeroCredito}</div>
                          <div className="text-xs text-gray-600">{credito.clienteNombre}</div>
                          <div className="text-xs font-semibold text-purple-600">S/. {parseFloat(credito.totalCredito || 0).toFixed(2)}</div>
                          <div className="text-xs text-gray-500">
                            {credito.fechaCreacion?.toDate?.() ? 
                              credito.fechaCreacion.toDate().toLocaleDateString() : 
                              'Fecha N/A'
                            }
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Información de Crédito Activo */}
                {creditoActivo && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-4 text-gray-800">Datos del Crédito</h3>
                    
                    <div className="space-y-4">
                      {/* Cliente */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Cliente (Solo con Crédito Activado):</label>
                        <Select
                          options={clienteOptions}
                          value={selectedCliente}
                          onChange={handleUpdateCliente}
                          placeholder="Seleccionar cliente..."
                          className="text-sm"
                          isClearable
                        />
                      </div>

                      {/* Fecha de Vencimiento */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de Vencimiento:</label>
                        <input
                          type="date"
                          value={fechaVencimiento}
                          onChange={(e) => handleUpdateFechaVencimiento(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>

                      {/* Observaciones */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Observaciones:</label>
                        <textarea
                          value={observaciones}
                          onChange={(e) => handleUpdateObservaciones(e.target.value)}
                          placeholder="Observaciones adicionales del crédito..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          rows="3"
                        />
                      </div>

                      {/* Total */}
                      <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                        <div className="text-lg font-bold text-purple-800">
                          Total Crédito: S/. {parseFloat(creditoActivo.totalCredito || 0).toFixed(2)}
                        </div>
                      </div>

                      {/* Botones de acción */}
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
                          <TrashIcon className="h-5 w-5 mr-2" />
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

              {/* Panel Derecho - Buscador y Items */}
              <div className="col-span-12 lg:col-span-9">
                {/* Buscador de Productos */}
                <div className="bg-white border border-gray-200 rounded-lg mb-6 relative">
                  <div className="p-4">
                    <h2 className="text-lg font-semibold mb-4 text-gray-800">Buscar Productos</h2>
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar productos por nombre, marca, código, modelos compatibles..."
                        className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      {isSearching && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                        </div>
                      )}
                    </div>
                    
                    <div className="text-sm text-gray-600 mt-2">
                      {searchTerm.trim() === '' ? (
                        'Escribe para buscar productos...'
                      ) : (
                        `${filteredProductos.length} productos encontrados`
                      )}
                    </div>
                  </div>

                  {/* Dropdown de productos - VERSIÓN MEJORADA */}
                  {searchTerm.trim() !== '' && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b-lg shadow-lg z-40 max-h-80 overflow-y-auto">
                      {isSearching ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                        </div>
                      ) : filteredProductos.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          <p>No se encontraron productos</p>
                        </div>
                      ) : (
                        <div className="max-h-80">
                          {filteredProductos.slice(0, 20).map(producto => (
                            <div
                              key={producto.id}
                              className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                              onClick={() => {
                                handleSelectProduct(producto);
                                setSearchTerm('');
                              }}
                            >
                              <div className="flex items-center justify-between gap-6">
                                {/* Información principal del producto */}
                                <div className="flex items-center gap-6 flex-1 min-w-0">
                                  {/* Nombre y código */}
                                  <div className="min-w-0 flex-shrink-0">
                                    <h4 className="font-medium text-gray-900 truncate text-sm">
                                      {producto.nombre} ({producto.codigoTienda})
                                    </h4>
                                  </div>
                                  
                                  {/* Marca */}
                                  <div className="flex-shrink-0">
                                    <span className="text-xs text-gray-500 uppercase tracking-wide">Marca:</span>
                                    <span className="ml-1 text-sm text-gray-700 font-medium">{producto.marca}</span>
                                  </div>
                                  
                                  {/* Color */}
                                  <div className="flex-shrink-0">
                                    <span className="text-xs text-gray-500 uppercase tracking-wide">Color:</span>
                                    <span className="ml-1 text-sm text-gray-700 font-medium">{producto.color || 'N/A'}</span>
                                  </div>
                                  
                                  {/* Stock */}
                                  <div className="flex-shrink-0">
                                    <span className="text-xs text-gray-500 uppercase tracking-wide">Stock:</span>
                                    <span className="ml-1 text-sm font-semibold text-gray-900">{producto.stockActual || 0}</span>
                                  </div>
                                  
                                  {/* Modelos compatibles */}
                                  {producto.modelosCompatiblesTexto && (
                                    <div className="flex-shrink-0 max-w-xs">
                                      <span className="text-xs text-gray-500 uppercase tracking-wide">Modelos:</span>
                                      <span className="ml-1 text-sm text-blue-700 font-medium truncate" title={producto.modelosCompatiblesTexto}>
                                        {producto.modelosCompatiblesTexto}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Precio */}
                                <div className="text-right flex-shrink-0">
                                  <p className="font-bold text-purple-600 text-base">
                                    S/. {parseFloat(producto.precioVentaDefault || 0).toFixed(2)}
                                  </p>
                                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                                    Precio Venta
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                          {filteredProductos.length > 20 && (
                            <div className="p-3 text-center text-sm text-gray-500 bg-gray-50">
                              Mostrando 20 de {filteredProductos.length} resultados. Refina tu búsqueda para ver más.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  </div>

                {/* Items del Crédito */}
                {!creditoActivo ? (
                  <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                    <CreditCardIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-xl font-medium text-gray-600 mb-2">Selecciona o crea un crédito</h3>
                    <p className="text-gray-500">Crea un nuevo crédito o selecciona uno temporal para comenzar a agregar productos</p>
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-lg">
                    <div className="p-4 border-b border-gray-200">
                      <h3 className="text-xl font-semibold text-gray-800">
                        Items del Crédito: {creditoActivo.numeroCredito || 'Nuevo'}
                      </h3>
                    </div>

                    <div className="p-4">
                      {itemsCreditoActivo.length === 0 ? (
                        <div className="text-center py-12">
                          <CreditCardIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                          <h4 className="text-lg font-medium text-gray-600 mb-2">No hay productos en este crédito</h4>
                          <p className="text-gray-500">Usa el buscador arriba para encontrar y agregar productos</p>
                        </div>
                      ) : (
                        <div className="bg-white rounded-lg overflow-hidden">
                          {/* Tabla de items */}
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              {/* Encabezados */}
                              <thead className="bg-purple-50">
                                <tr className="border-b border-gray-300">
                                  <th className="w-40 px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide w-20">C. PRODUCTO</th>
                                  <th className="w-48 px-4 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide w-1/4">NOMBRE</th>
                                  <th className="w-20 px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide w-20">C. PROVEEDOR</th>
                                  <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide w-24">MARCA</th>
                                  <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide w-24">MEDIDA</th>  
                                  <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide w-16">CANT.</th>
                                  <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide w-24">P. COMPRA</th>
                                  <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide w-24">P.V. UNIT.</th>
                                  <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide w-24">P. VENTA MIN</th>
                                  <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide w-28">SUBTOTAL</th>
                                  <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide w-24">ACCIONES</th>
                                </tr>
                              </thead>
                              
                              {/* Cuerpo de la tabla */}
                              <tbody>
                                {itemsCreditoActivo.map((item, index) => (
                                  <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                    {/* Código */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm text-gray-900 font-medium">
                                        {item.codigoTienda || 'N/A'}
                                      </span>
                                    </td>
                                    {/* Nombre */}
                                    <td className="px-4 py-3">
                                      <div className="font-medium text-gray-900 text-sm">
                                        {item.nombreProducto}
                                      </div>
                                    </td>
                                    {/* Código */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm text-gray-900 font-medium">
                                        {item.codigoProveedor || 'N/A'}
                                      </span>
                                    </td>

                                    {/* Marca */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm text-gray-700">
                                        {item.marca || 'Sin marca'}
                                      </span>
                                    </td>
                                    {/* MEDIDA */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm text-gray-700">
                                        {item.medida || 'Sin marca'}
                                      </span>
                                    </td>
                                    

                                    {/* Cantidad */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm font-medium text-gray-900">
                                        {item.cantidad}
                                      </span>
                                    </td>
                                   {/* Precio COMPRA */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm font-medium text-gray-900">
                                        S/. {parseFloat(item.precioCompraDefault || 0).toFixed(2)}
                                      </span>
                                    </td>

                                    {/* Precio unitario */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm font-medium text-gray-900">
                                        S/. {parseFloat(item.precioVentaUnitario || 0).toFixed(2)}
                                      </span>
                                    </td>
                                    {/* Precio VENTA MINIMO */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm font-medium text-gray-900">
                                        S/. {parseFloat(item.precioVentaMinimo || 0).toFixed(2)}
                                      </span>
                                    </td>


                                    {/* Subtotal */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm font-semibold text-gray-900">
                                        S/. {parseFloat(item.subtotal || 0).toFixed(2)}
                                      </span>
                                    </td>

                                    {/* Acciones */}
                                    <td className="px-3 py-3 text-center">
                                      <div className="flex justify-center space-x-2">
                                        <button
                                          onClick={() => handleEditItem(item)}
                                          className="text-purple-600 hover:text-purple-800 p-1 rounded hover:bg-purple-50 transition-colors"
                                          title="Editar"
                                        >
                                          <PencilIcon className="h-4 w-4" />
                                        </button>
                                        <button
                                          onClick={() => handleRemoveItem(item.id, item.subtotal)}
                                          className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors"
                                          title="Eliminar"
                                        >
                                          <TrashIcon className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Total final */}
                          <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 border-t border-gray-300">
                            <div className="flex justify-between items-center">
                              <div>
                                <h3 className="text-lg font-semibold">Total del Crédito</h3>
                                <p className="text-purple-100 text-sm">{itemsCreditoActivo.length} producto{itemsCreditoActivo.length !== 1 ? 's' : ''}</p>
                              </div>
                              <div className="text-right">
                                <div className="text-3xl font-bold">
                                  S/. {parseFloat(creditoActivo.totalCredito || 0).toFixed(2)}
                                </div>
                              </div>
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
        </div>
      </div>

      {/* Modal de Cantidad y Precio */}
      <Transition.Root show={showQuantityModal} as={Fragment}>
  <Dialog as="div" className="relative z-50" onClose={setShowQuantityModal}>
    <Transition.Child
      as={Fragment}
      enter="ease-out duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="ease-in duration-200"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
    </Transition.Child>

    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          enterTo="opacity-100 translate-y-0 sm:scale-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100 translate-y-0 sm:scale-100"
          leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
        >
          <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
            <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
              <button
                type="button"
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                onClick={() => setShowQuantityModal(false)}
              >
                <span className="sr-only">Cerrar</span>
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>

            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 sm:mx-0 sm:h-10 sm:w-10">
                <CreditCardIcon className="h-6 w-6 text-purple-600" aria-hidden="true" />
              </div>
              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                <Dialog.Title as="h3" className="text-xl font-semibold leading-6 text-gray-900 mb-4">
                  Agregar Producto a Crédito
                </Dialog.Title>
                
                {selectedProduct && (
                  <div className="mt-4">
                    <div className="bg-gray-50 p-6 rounded-lg mb-6">
                      <h4 className="font-semibold text-lg text-gray-900 mb-2">
                        {selectedProduct.nombre}
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Código: </span>
                          <span className="text-gray-600">{selectedProduct.codigoTienda}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Marca: </span>
                          <span className="text-gray-600">{selectedProduct.marca || 'Sin marca'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Stock disponible: </span>
                          <span className="text-gray-600">{selectedProduct.stockActual || 0}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Color: </span>
                          <span className="text-gray-600">{selectedProduct.color || 'N/A'}</span>
                        </div>
                      </div>
                      
                      {/* AGREGAR ESTA SECCIÓN - Mostrar precio de venta mínimo */}
                      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-yellow-800">
                            Precio Venta Mínimo:
                          </span>
                          <span className="text-lg font-bold text-yellow-900">
                            S/. {parseFloat(selectedProduct.precioVentaMinimo || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          value={quantity}
                          onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                          min="1"
                          max={selectedProduct.stockActual || 999}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Precio de Venta (S/.)
                        </label>
                        <input
                          type="number"
                          value={precioVenta}
                          onChange={(e) => setPrecioVenta(parseFloat(e.target.value) || 0)}
                          min="0"
                          step="0.01"
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent text-lg ${
                            precioVenta < parseFloat(selectedProduct.precioVentaMinimo || 0)
                              ? 'border-red-300 focus:ring-red-500 bg-red-50'
                              : 'border-gray-300 focus:ring-purple-500'
                          }`}
                        />
                        {precioVenta < parseFloat(selectedProduct.precioVentaMinimo || 0) && (
                          <p className="text-red-600 text-sm mt-1 font-medium">
                            ⚠️ Precio por debajo del mínimo permitido
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-6 rounded-lg border border-purple-200 mt-6">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-gray-700">Subtotal:</span>
                        <span className="font-bold text-purple-800 text-2xl">S/. {(quantity * precioVenta).toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="bg-red-50 p-3 rounded-lg border border-red-200 mt-4">
                      <p className="text-sm text-red-700">
                        ⚠️ <strong>Importante:</strong> Este producto se agregará al crédito temporal. El stock NO se reducirá hasta que registres el crédito.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 sm:mt-6 sm:flex sm:flex-row-reverse gap-3">
              <button
                type="button"
                className="inline-flex w-full justify-center rounded-md bg-purple-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-purple-500 sm:w-auto disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                onClick={handleAddProductToCredito}
                disabled={!creditoActivo || quantity <= 0 || precioVenta <= 0}
              >
                Agregar a Crédito
              </button>
              <button
                type="button"
                className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-6 py-3 text-base font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto transition-colors"
                onClick={() => setShowQuantityModal(false)}
              >
                Cancelar
              </button>
            </div>
          </Dialog.Panel>
        </Transition.Child>
      </div>
    </div>
  </Dialog>
</Transition.Root>


      {/* Modal de Edición de Item - VERSIÓN MEJORADA */}
<Transition.Root show={showEditItemModal} as={Fragment}>
  <Dialog as="div" className="relative z-50" onClose={setShowEditItemModal}>
    <Transition.Child
      as={Fragment}
      enter="ease-out duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="ease-in duration-200"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
    </Transition.Child>

    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          enterTo="opacity-100 translate-y-0 sm:scale-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100 translate-y-0 sm:scale-100"
          leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
        >
          <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
            <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
              <button
                type="button"
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                onClick={() => setShowEditItemModal(false)}
              >
                <span className="sr-only">Cerrar</span>
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>

            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 sm:mx-0 sm:h-10 sm:w-10">
                <PencilIcon className="h-6 w-6 text-purple-600" aria-hidden="true" />
              </div>
              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                <Dialog.Title as="h3" className="text-xl font-semibold leading-6 text-gray-900 mb-4">
                  Editar Producto
                </Dialog.Title>
                
                {editingItem && (
                  <div className="mt-4">
                    <div className="bg-gray-50 p-6 rounded-lg mb-6">
                      <h4 className="font-semibold text-lg text-gray-900 mb-2">
                        {editingItem.nombreProducto}
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Código: </span>
                          <span className="text-gray-600">{editingItem.codigoTienda}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Marca: </span>
                          <span className="text-gray-600">{editingItem.marca}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(parseInt(e.target.value) || 1)}
                          min="1"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Precio de Venta (S/.)
                        </label>
                        <input
                          type="number"
                          value={editPrecio}
                          onChange={(e) => setEditPrecio(parseFloat(e.target.value) || 0)}
                          min="0"
                          step="0.01"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                        />
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-6 rounded-lg border border-purple-200 mt-6">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-gray-700">Nuevo Subtotal:</span>
                        <span className="font-bold text-purple-800 text-2xl">S/. {(editQuantity * editPrecio).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 sm:mt-6 sm:flex sm:flex-row-reverse gap-3">
              <button
                type="button"
                className="inline-flex w-full justify-center rounded-md bg-purple-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-purple-500 sm:w-auto disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                onClick={handleUpdateItem}
                disabled={editQuantity <= 0 || editPrecio <= 0}
              >
                Actualizar
              </button>
              <button
                type="button"
                className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-6 py-3 text-base font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto transition-colors"
                onClick={() => setShowEditItemModal(false)}
              >
                Cancelar
              </button>
            </div>
          </Dialog.Panel>
        </Transition.Child>
      </div>
    </div>
  </Dialog>
</Transition.Root>
    </Layout>
  );
};

export default NuevoCreditoPage;