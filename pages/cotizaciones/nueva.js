// pages/cotizaciones/nueva.js

import { useState, useEffect, Fragment } from 'react';
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import MixedPaymentModal from '../../components/modals/MixedPaymentModal';
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
  limit,
  getDoc
} from 'firebase/firestore';
import {
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ShoppingCartIcon,
  UserIcon,
  TruckIcon,
  CreditCardIcon,
  DocumentTextIcon,
  CheckIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';
import { Dialog, Transition } from '@headlessui/react';
import Select from 'react-select';

const NuevaCotizacionPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Estados para productos - SIN CARGAR AUTOMÁTICAMENTE
  const [productos, setProductos] = useState([]);
  const [filteredProductos, setFilteredProductos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Estados para datos de referencia
  const [clientes, setClientes] = useState([]);
  const [empleados, setEmpleados] = useState([]);

  // Estados para cotizaciones
  const [cotizacionesPendientes, setCotizacionesPendientes] = useState([]);
  const [cotizacionActiva, setCotizacionActiva] = useState(null);
  const [itemsCotizacionActiva, setItemsCotizacionActiva] = useState([]);

  // Estados para el formulario de cotización
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [selectedEmpleado, setSelectedEmpleado] = useState(null);
  const [placaMoto, setPlacaMoto] = useState('');
  const [metodoPago, setMetodoPago] = useState('');
  const [observaciones, setObservaciones] = useState('');

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

  // Estados para pagos mixtos
  const [paymentData, setPaymentData] = useState({
    totalAmount: 0,
    paymentMethods: [
      {
        method: 'efectivo',
        amount: 0,
        label: 'EFECTIVO',
        icon: '💵'
      }
    ],
    isMixedPayment: false
  });

  const [showPaymentModal, setShowPaymentModal] = useState(false);

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
      // Cargar clientes
      const qClientes = query(collection(db, 'cliente'), orderBy('nombre', 'asc'));
      const clientesSnapshot = await getDocs(qClientes);
      const clientesList = clientesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setClientes(clientesList);

      // Cargar empleados
      const qEmpleados = query(collection(db, 'empleado'), orderBy('nombre', 'asc'));
      const empleadosSnapshot = await getDocs(qEmpleados);
      const empleadosList = empleadosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEmpleados(empleadosList);

    } catch (err) {
      console.error("Error al cargar datos iniciales:", err);
      setError("Error al cargar datos iniciales");
    } finally {
      setLoading(false);
    }
  };

  // BÚSQUEDA DE PRODUCTOS - incluye modelosCompatiblesTexto
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
        
        // BUSCAR EN modelosCompatiblesTexto
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

  // Escuchar cotizaciones pendientes
  useEffect(() => {
    if (!user) return;

    const qPendientes = query(
      collection(db, 'cotizaciones'),
      where('estado', '==', 'borrador'),
      orderBy('fechaCreacion', 'desc')
    );

    const unsubscribe = onSnapshot(qPendientes, (snapshot) => {
      const cotizacionesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCotizacionesPendientes(cotizacionesList);
    });

    return () => unsubscribe();
  }, [user]);

  // Escuchar cambios en cotización activa
  useEffect(() => {
    if (!cotizacionActiva?.id) {
      setItemsCotizacionActiva([]);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'cotizaciones', cotizacionActiva.id), async (docSnap) => {
      if (docSnap.exists()) {
        const cotizacionData = { id: docSnap.id, ...docSnap.data() };
        setCotizacionActiva(cotizacionData);

        // Cargar items
        const qItems = query(
          collection(db, 'cotizaciones', cotizacionActiva.id, 'itemsCotizacion'), 
          orderBy('createdAt', 'asc')
        );
        const itemsSnapshot = await getDocs(qItems);
        const itemsList = itemsSnapshot.docs.map(itemDoc => ({
          id: itemDoc.id,
          ...itemDoc.data()
        }));
        setItemsCotizacionActiva(itemsList);
      }
    });

    return () => unsubscribe();
  }, [cotizacionActiva?.id]);

  // Sincronizar formulario con cotización activa
  useEffect(() => {
    if (cotizacionActiva) {
      // Sincronizar cliente
      const cliente = clientes.find(c => c.id === cotizacionActiva.clienteId);
      setSelectedCliente(cliente ? {
        value: cliente.id,
        label: `${cliente.nombre} ${cliente.apellido || ''} - ${cliente.dni || ''}`.trim()
      } : null);

      // Sincronizar empleado
      const empleado = empleados.find(e => e.id === cotizacionActiva.empleadoAsignadoId);
      setSelectedEmpleado(empleado ? {
        value: empleado.id,
        label: `${empleado.nombre} ${empleado.apellido || ''} - ${empleado.puesto || ''}`.trim()
      } : null);

      setPlacaMoto(cotizacionActiva.placaMoto || '');
      setMetodoPago(cotizacionActiva.metodoPago || '');
      setObservaciones(cotizacionActiva.observaciones || '');
    }
  }, [cotizacionActiva, clientes, empleados]);

  // Actualizar el total cuando cambian los items
  useEffect(() => {
    const total = parseFloat(cotizacionActiva?.totalCotizacion || 0);
    setPaymentData(prev => ({
      ...prev,
      totalAmount: total,
      paymentMethods: prev.isMixedPayment 
        ? prev.paymentMethods 
        : [{ ...prev.paymentMethods[0], amount: total }]
    }));
  }, [cotizacionActiva?.totalCotizacion]);

  // Crear nueva cotización
  const handleNuevaCotizacion = async () => {
    setLoading(true);
    try {
      // Crear fecha de expiración (7 días desde hoy)
      const fechaExpiracion = new Date();
      fechaExpiracion.setDate(fechaExpiracion.getDate() + 7);

      const newCotizacionRef = await addDoc(collection(db, 'cotizaciones'), {
        numeroCotizacion: `COT-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        clienteId: null,
        clienteNombre: 'Cliente Pendiente',
        clienteDNI: null,
        totalCotizacion: 0,
        fechaCreacion: serverTimestamp(),
        fechaExpiracion: fechaExpiracion,
        empleadoId: user.email || user.uid,
        estado: 'borrador',
        metodoPago: null,
        placaMoto: null,
        observaciones: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setCotizacionActiva({ id: newCotizacionRef.id });
      alert('Nueva cotización creada exitosamente');
    } catch (err) {
      console.error("Error al crear cotización:", err);
      setError("Error al crear nueva cotización");
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentConfirm = (newPaymentData) => {
    setPaymentData(newPaymentData);
    setShowPaymentModal(false);
  };

  const openPaymentModal = () => {
    const total = parseFloat(cotizacionActiva?.totalCotizacion || 0);
    if (total <= 0) {
      setError('Debe añadir al menos un producto antes de configurar el pago.');
      return;
    }
    setShowPaymentModal(true);
  };

  // Seleccionar cotización pendiente
  const handleSelectCotizacion = (cotizacion) => {
    setCotizacionActiva(cotizacion);
  };

  // Actualizar cliente
  const handleUpdateCliente = async (selectedOption) => {
    if (!cotizacionActiva?.id) return;

    try {
      await runTransaction(db, async (transaction) => {
        const cotizacionRef = doc(db, 'cotizaciones', cotizacionActiva.id);
        let clientData = { nombre: 'Cliente Pendiente', apellido: '', dni: null };

        if (selectedOption) {
          const clientRef = doc(db, 'cliente', selectedOption.value);
          const clientSnap = await transaction.get(clientRef);
          if (clientSnap.exists()) {
            clientData = clientSnap.data();
          }
        }

        const clientNombre = `${clientData.nombre} ${clientData.apellido || ''}`.trim();

        transaction.update(cotizacionRef, {
          clienteId: selectedOption?.value || null,
          clienteNombre: clientNombre,
          clienteDNI: clientData.dni || null,
          updatedAt: serverTimestamp(),
        });
      });

      setSelectedCliente(selectedOption);
    } catch (err) {
      console.error("Error al actualizar cliente:", err);
      setError("Error al actualizar cliente");
    }
  };

  // Actualizar empleado
  const handleUpdateEmpleado = async (selectedOption) => {
    if (!cotizacionActiva?.id) return;

    try {
      await runTransaction(db, async (transaction) => {
        const cotizacionRef = doc(db, 'cotizaciones', cotizacionActiva.id);
        let employeeData = { nombre: '', apellido: '', puesto: '' };

        if (selectedOption) {
          const employeeRef = doc(db, 'empleado', selectedOption.value);
          const employeeSnap = await transaction.get(employeeRef);
          if (employeeSnap.exists()) {
            employeeData = employeeSnap.data();
          }
        }

        const employeeNombre = `${employeeData.nombre} ${employeeData.apellido || ''}`.trim();

        transaction.update(cotizacionRef, {
          empleadoAsignadoId: selectedOption?.value || null,
          empleadoAsignadoNombre: employeeNombre || null,
          empleadoAsignadoPuesto: employeeData.puesto || null,
          updatedAt: serverTimestamp(),
        });
      });

      setSelectedEmpleado(selectedOption);
    } catch (err) {
      console.error("Error al actualizar empleado:", err);
      setError("Error al actualizar empleado");
    }
  };

  // Actualizar placa de moto
  const handleUpdatePlaca = async (nuevaPlaca) => {
    if (!cotizacionActiva?.id) return;

    try {
      const cotizacionRef = doc(db, 'cotizaciones', cotizacionActiva.id);
      await updateDoc(cotizacionRef, {
        placaMoto: nuevaPlaca || null,
        updatedAt: serverTimestamp(),
      });
      setPlacaMoto(nuevaPlaca);
    } catch (err) {
      console.error("Error al actualizar placa:", err);
      setError("Error al actualizar placa");
    }
  };

  // Actualizar método de pago
  const handleUpdateMetodoPago = async (nuevoMetodo) => {
    if (!cotizacionActiva?.id) return;

    try {
      const cotizacionRef = doc(db, 'cotizaciones', cotizacionActiva.id);
      await updateDoc(cotizacionRef, {
        metodoPago: nuevoMetodo,
        updatedAt: serverTimestamp(),
      });
      setMetodoPago(nuevoMetodo);
    } catch (err) {
      console.error("Error al actualizar método de pago:", err);
      setError("Error al actualizar método de pago");
    }
  };

  // Actualizar observaciones
  const handleUpdateObservaciones = async (nuevasObservaciones) => {
    if (!cotizacionActiva?.id) return;

    try {
      const cotizacionRef = doc(db, 'cotizaciones', cotizacionActiva.id);
      await updateDoc(cotizacionRef, {
        observaciones: nuevasObservaciones,
        updatedAt: serverTimestamp(),
      });
      setObservaciones(nuevasObservaciones);
    } catch (err) {
      console.error("Error al actualizar observaciones:", err);
      setError("Error al actualizar observaciones");
    }
  };

  // Abrir modal de cantidad
  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setPrecioVenta(parseFloat(product.precioVentaDefault || 0));
    setQuantity(1);
    setShowQuantityModal(true);
  };

  const [showCotizacionDetails, setShowCotizacionDetails] = useState(false);
  // NUEVAS FUNCIONES PARA MANEJO DE LOTES FIFO EN COTIZACIONES

  // Función para obtener lotes disponibles ordenados por FIFO
  const obtenerLotesDisponiblesFIFO = async (productoId) => {
    try {
      const lotesQuery = query(
        collection(db, 'lotes'),
        where('productoId', '==', productoId),
        where('stockRestante', '>', 0),
        where('estado', '==', 'activo'),
        orderBy('fechaIngreso', 'asc')
      );
      
      const lotesSnapshot = await getDocs(lotesQuery);
      return lotesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Error al obtener lotes disponibles:", error);
      throw error;
    }
  };

  // Función para crear items separados automáticamente por lote
  const crearItemsSeparadosPorLote = async (producto, cantidadTotal, precioVenta, lotesDisponibles) => {
    const itemsSeparados = [];
    let cantidadPendiente = cantidadTotal;
    let contadorItem = 1;

    for (const lote of lotesDisponibles) {
      if (cantidadPendiente <= 0) break;

      const cantidadDelLote = Math.min(cantidadPendiente, lote.stockRestante);
      const gananciaUnitaria = precioVenta - lote.precioCompraUnitario;
      const gananciaTotal = cantidadDelLote * gananciaUnitaria;

      const item = {
        productoId: producto.id,
        nombreProducto: producto.nombre,
        marca: producto.marca || '',
        codigoTienda: producto.codigoTienda || '',
        color: producto.color || '',
        // AGREGAR CAMPOS FALTANTES DEL PRODUCTO
        medida: producto.medida || 'N/A',
        precioCompraDefault: parseFloat(producto.precioCompraDefault || 0),
        precioVentaMinimo: parseFloat(producto.precioVentaMinimo || 0),
        descripcion: producto.descripcion || '',
        // CAMPOS EXISTENTES
        cantidad: cantidadDelLote,
        precioVentaUnitario: precioVenta.toFixed(2),
        subtotal: (cantidadDelLote * precioVenta).toFixed(2),
        // DATOS DEL LOTE ESPECÍFICO PARA COTIZACIÓN
        loteId: lote.id,
        numeroLote: lote.numeroLote,
        precioCompraUnitario: lote.precioCompraUnitario,
        gananciaUnitaria: gananciaUnitaria,
        gananciaTotal: gananciaTotal,
        // IDENTIFICADOR PARA FUTURAS VENTAS
        loteOriginal: {
          id: lote.id,
          numeroLote: lote.numeroLote,
          precioCompraUnitario: lote.precioCompraUnitario,
          fechaIngreso: lote.fechaIngreso
        }
      };

      itemsSeparados.push(item);
      cantidadPendiente -= cantidadDelLote;
      contadorItem++;
    }

    if (cantidadPendiente > 0) {
      throw new Error(`Stock insuficiente. Faltan ${cantidadPendiente} unidades del producto.`);
    }

    return itemsSeparados;
  };

  // Agregar producto a cotización - ACTUALIZADO CON SEPARACIÓN POR LOTES
  const handleAddProductToCotizacion = async () => {
    if (!cotizacionActiva?.id || !selectedProduct) return;

    // Verificar si el producto ya existe en la cotización
    const existsInCotizacion = itemsCotizacionActiva.some(item => item.productoId === selectedProduct.id);
    if (existsInCotizacion) {
      alert('Este producto ya ha sido añadido a la cotización. Edite la cantidad en la tabla.');
      setShowQuantityModal(false);
      return;
    }

    if ((selectedProduct.stockActual || 0) < quantity) {
      alert(`Stock insuficiente para ${selectedProduct.nombre}. Stock disponible: ${selectedProduct.stockActual || 0}`);
      return;
    }

    try {
      // OBTENER LOTES DISPONIBLES PARA SIMULAR LA DISTRIBUCIÓN
      const lotesDisponibles = await obtenerLotesDisponiblesFIFO(selectedProduct.id);
      
      // CREAR ITEMS SEPARADOS POR LOTE
      const itemsSeparados = await crearItemsSeparadosPorLote(
        selectedProduct, 
        quantity, 
        precioVenta, 
        lotesDisponibles
      );

      await runTransaction(db, async (transaction) => {
        const cotizacionRef = doc(db, 'cotizaciones', cotizacionActiva.id);
        const cotizacionSnap = await transaction.get(cotizacionRef);
        
        if (!cotizacionSnap.exists()) {
          throw new Error("Cotización no encontrada");
        }

        let totalSubtotal = 0;
        let totalGanancia = 0;

        // AGREGAR CADA ITEM SEPARADO POR LOTE
        for (const item of itemsSeparados) {
          const itemRef = doc(collection(db, 'cotizaciones', cotizacionActiva.id, 'itemsCotizacion'));
          
          transaction.set(itemRef, {
            ...item,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          totalSubtotal += parseFloat(item.subtotal);
          totalGanancia += parseFloat(item.gananciaTotal);
        }

        // ACTUALIZAR TOTALES EN LA COTIZACIÓN
        const currentTotal = parseFloat(cotizacionSnap.data().totalCotizacion || 0);
        const currentGananciaTotal = parseFloat(cotizacionSnap.data().gananciaTotalCotizacion || 0);
        
        const updatedTotal = currentTotal + totalSubtotal;
        const updatedGananciaTotal = currentGananciaTotal + totalGanancia;

        transaction.update(cotizacionRef, {
          totalCotizacion: parseFloat(updatedTotal.toFixed(2)),
          gananciaTotalCotizacion: parseFloat(updatedGananciaTotal.toFixed(2)), // CAMPO OCULTO
          updatedAt: serverTimestamp(),
        });
      });

      setShowQuantityModal(false);
      alert(`Producto agregado exitosamente y separado automáticamente en ${itemsSeparados.length} lote(s) FIFO`);
    } catch (err) {
      console.error("Error al agregar producto:", err);
      setError("Error al agregar producto a la cotización: " + err.message);
    }
  };

  // Función para obtener el precio de compra FIFO real
  const obtenerPrecioCompraFIFO = async (productoId) => {
    try {
      const lotesQuery = query(
        collection(db, 'lotes'),
        where('productoId', '==', productoId),
        where('stockRestante', '>', 0),
        where('estado', '==', 'activo'),
        orderBy('fechaIngreso', 'asc'),
        limit(1)
      );
      
      const lotesSnapshot = await getDocs(lotesQuery);
      
      if (!lotesSnapshot.empty) {
        const primerLote = lotesSnapshot.docs[0].data();
        return parseFloat(primerLote.precioCompraUnitario || 0);
      } else {
        // Si no hay lotes disponibles, usar precio por defecto del producto
        const productRef = doc(db, 'productos', productoId);
        const productSnap = await getDoc(productRef);
        
        if (productSnap.exists()) {
          return parseFloat(productSnap.data().precioCompraDefault || 0);
        }
        
        return 0;
      }
    } catch (error) {
      console.error(`Error al obtener precio FIFO para producto ${productoId}:`, error);
      return 0;
    }
  };

  // Abrir modal de edición de item
  const handleEditItem = (item) => {
    setEditingItem(item);
    setEditQuantity(item.cantidad);
    setEditPrecio(parseFloat(item.precioVentaUnitario || 0));
    setShowEditItemModal(true);
  };

  // Actualizar item de cotización - VERSIÓN CON PRECIO FIFO REAL
  const handleUpdateItem = async () => {
    if (!cotizacionActiva?.id || !editingItem) return;

    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'cotizaciones', cotizacionActiva.id, 'itemsCotizacion', editingItem.id);
        const cotizacionRef = doc(db, 'cotizaciones', cotizacionActiva.id);

        const cotizacionSnap = await transaction.get(cotizacionRef);
        
        if (!cotizacionSnap.exists()) {
          throw new Error("Cotización no encontrada");
        }

        // OBTENER PRECIO DE COMPRA FIFO ACTUALIZADO
        const precioCompraFIFO = await obtenerPrecioCompraFIFO(editingItem.productoId);
        
        // CALCULAR NUEVA GANANCIA CON PRECIO FIFO REAL
        const nuevaGananciaUnitaria = editPrecio - precioCompraFIFO;
        
        // CÁLCULOS ANTIGUOS PARA RESTAR DEL TOTAL
        const oldSubtotal = parseFloat(editingItem.subtotal || 0);
        const oldGananciaTotal = parseFloat(editingItem.gananciaTotal || 0);
        
        // CÁLCULOS NUEVOS CON PRECIO FIFO REAL
        const newSubtotal = editQuantity * editPrecio;
        const newGananciaTotal = editQuantity * nuevaGananciaUnitaria;

        // ACTUALIZAR EL ITEM CON PRECIO FIFO REAL
        transaction.update(itemRef, {
          cantidad: editQuantity,
          precioVentaUnitario: editPrecio,
          subtotal: newSubtotal,
          // ACTUALIZAR CAMPOS OCULTOS CON PRECIO FIFO REAL
          precioCompraUnitario: precioCompraFIFO, // PRECIO FIFO REAL ACTUALIZADO
          gananciaUnitaria: nuevaGananciaUnitaria, // GANANCIA REAL
          gananciaTotal: newGananciaTotal, // GANANCIA TOTAL REAL
          updatedAt: serverTimestamp(),
        });

        // ACTUALIZAR TOTALES EN LA COTIZACIÓN CON GANANCIA REAL
        const currentTotal = parseFloat(cotizacionSnap.data().totalCotizacion || 0);
        const currentGananciaTotal = parseFloat(cotizacionSnap.data().gananciaTotalCotizacion || 0);
        
        const updatedTotal = currentTotal - oldSubtotal + newSubtotal;
        const updatedGananciaTotal = currentGananciaTotal - oldGananciaTotal + newGananciaTotal;

        transaction.update(cotizacionRef, {
          totalCotizacion: parseFloat(updatedTotal.toFixed(2)),
          // ACTUALIZAR GANANCIA TOTAL REAL CON PRECIO FIFO
          gananciaTotalCotizacion: parseFloat(updatedGananciaTotal.toFixed(2)), // OCULTO
          updatedAt: serverTimestamp(),
        });
      });

      setShowEditItemModal(false);
      alert('Producto actualizado exitosamente con precio FIFO real');
    } catch (err) {
      console.error("Error al actualizar item:", err);
      setError("Error al actualizar producto");
    }
  };

  // Eliminar item de cotización - VERSIÓN ACTUALIZADA CON GANANCIA OCULTA
  const handleRemoveItem = async (itemId, subtotal) => {
    if (!cotizacionActiva?.id || !itemId) return;

    if (!window.confirm('¿Eliminar este producto de la cotización?')) return;

    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'cotizaciones', cotizacionActiva.id, 'itemsCotizacion', itemId);
        const cotizacionRef = doc(db, 'cotizaciones', cotizacionActiva.id);

        const cotizacionSnap = await transaction.get(cotizacionRef);
        const itemSnap = await transaction.get(itemRef);
        
        if (!cotizacionSnap.exists() || !itemSnap.exists()) {
          throw new Error("Cotización o item no encontrado");
        }

        // OBTENER DATOS DEL ITEM A ELIMINAR
        const itemData = itemSnap.data();
        const itemGananciaTotal = parseFloat(itemData.gananciaTotal || 0);

        // ACTUALIZAR TOTALES DE LA COTIZACIÓN
        const currentTotal = parseFloat(cotizacionSnap.data().totalCotizacion || 0);
        const currentGananciaTotal = parseFloat(cotizacionSnap.data().gananciaTotalCotizacion || 0);
        
        const updatedTotal = currentTotal - parseFloat(subtotal);
        const updatedGananciaTotal = currentGananciaTotal - itemGananciaTotal;

        // ELIMINAR ITEM
        transaction.delete(itemRef);
        
        // ACTUALIZAR TOTALES EN COTIZACIÓN
        transaction.update(cotizacionRef, {
          totalCotizacion: parseFloat(updatedTotal.toFixed(2)),
          // ACTUALIZAR GANANCIA TOTAL OCULTA
          gananciaTotalCotizacion: parseFloat(updatedGananciaTotal.toFixed(2)), // OCULTO
          updatedAt: serverTimestamp(),
        });
      });

      alert('Producto eliminado de la cotización');
    } catch (err) {
      console.error("Error al eliminar item:", err);
      setError("Error al eliminar producto");
    }
  };

  // Guardar cotización como pendiente
  const handleGuardarCotizacion = async () => {
    if (!cotizacionActiva?.id) return;

    if (!selectedCliente) {
      alert('Por favor selecciona un cliente');
      return;
    }

    if (itemsCotizacionActiva.length === 0) {
      alert('La cotización debe tener al menos un producto');
      return;
    }

    if (!window.confirm('¿Guardar esta cotización como PENDIENTE? Podrás confirmarla desde el índice de cotizaciones.')) {
      return;
    }

    try {
      const cotizacionRef = doc(db, 'cotizaciones', cotizacionActiva.id);
      await updateDoc(cotizacionRef, {
        estado: 'pendiente',
        metodoPago: paymentData.isMixedPayment ? 'mixto' : (paymentData.paymentMethods[0]?.method || metodoPago || 'efectivo'),
        paymentData: paymentData, // AÑADIR ESTA LÍNEA
        placaMoto: placaMoto || null,
        observaciones: observaciones || '',
        fechaGuardado: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert('Cotización guardada como PENDIENTE exitosamente. Ve al índice de cotizaciones para confirmarla.');
      
      // Limpiar formulario
      setCotizacionActiva(null);
      setItemsCotizacionActiva([]);
      setSelectedCliente(null);
      setSelectedEmpleado(null);
      setPlacaMoto('');
      setMetodoPago('');
      setObservaciones('');
      
      // Opcional: redirigir al índice de cotizaciones
      router.push('/cotizaciones');
      
    } catch (err) {
      console.error("Error al guardar cotización:", err);
      alert('Error al guardar cotización: ' + err.message);
    }
  };

  const clienteOptions = clientes.map(cliente => ({
    value: cliente.id,
    label: `${cliente.nombre} ${cliente.apellido || ''} - ${cliente.dni || ''}`.trim()
  }));

  const empleadoOptions = empleados.map(empleado => ({
    value: empleado.id,
    label: `${empleado.nombre} ${empleado.apellido || ''} - ${empleado.puesto || ''}`.trim()
  }));

  if (!user) return null;

  return (
    <Layout title="Nueva Cotización">
      <div className="min-h-screen bg-gray-50 py-6">
        {/* CAMBIAR max-w-7xl por max-w-full y agregar padding más amplio */}
        <div className="max-w-full mx-auto px-6 sm:px-8 lg:px-12">
          {error && (
            <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50">
              {error}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-lg overflow-hidden">

            <div className="grid grid-cols-12 gap-6 p-6">
  {/* Panel Izquierdo - Cotizaciones Borrador - CAMBIO: de col-span-4 a col-span-3 */}
  <div className="col-span-12 lg:col-span-3">
    <div className="bg-gray-50 rounded-lg p-4 mb-6">
      <h2 className="text-lg font-semibold mb-4 text-gray-800">Cotizaciones Borrador</h2>
      <button
        onClick={handleNuevaCotizacion}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg flex items-center justify-center mb-4 transition-colors"
        disabled={loading}
      >
        <PlusIcon className="h-5 w-5 mr-2" />
        Nueva Cotización
      </button>

      <div className="max-h-100 overflow-y-auto space-y-2">
        {cotizacionesPendientes.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No hay cotizaciones en borrador</p>
        ) : (
          cotizacionesPendientes.map(cotizacion => (
            <div
              key={cotizacion.id}
              className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                cotizacionActiva?.id === cotizacion.id
                  ? 'bg-blue-50 border-blue-500 shadow-md'
                  : 'bg-white hover:bg-gray-50 border-gray-200'
              }`}
              onClick={() => handleSelectCotizacion(cotizacion)}
            >
              <div className="font-medium text-sm text-gray-800">{cotizacion.numeroCotizacion}</div>
              <div className="text-xs text-gray-600">{cotizacion.clienteNombre}</div>
              <div className="text-xs font-semibold text-green-600">S/. {parseFloat(cotizacion.totalCotizacion || 0).toFixed(2)}</div>
              <div className="text-xs text-gray-500">
                {cotizacion.fechaCreacion?.toDate?.() ? 
                  cotizacion.fechaCreacion.toDate().toLocaleDateString() : 
                  'Fecha N/A'
                }
              </div>
            </div>
          ))
        )}
      </div>
    </div>

    {/* Información de Cotización Activa - CON BOTÓN COLAPSABLE */}
    {cotizacionActiva && (
      <div className="bg-gray-50 rounded-lg overflow-hidden">
        {/* Encabezado colapsable */}
        <div 
          className="p-4 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors flex items-center justify-between"
          onClick={() => setShowCotizacionDetails(!showCotizacionDetails)}
        >
          <h3 className="font-semibold text-lg text-gray-800">Datos de la Cotización</h3>
          <div className={`transform transition-transform duration-200 ${showCotizacionDetails ? 'rotate-180' : ''}`}>
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        
        {/* Contenido colapsable */}
        <div className={`transition-all duration-300 overflow-hidden ${showCotizacionDetails ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="p-4 space-y-4">
            {/* Cliente */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cliente:</label>
              <Select
                options={clienteOptions}
                value={selectedCliente}
                onChange={handleUpdateCliente}
                placeholder="Seleccionar cliente..."
                className="text-sm"
                isClearable
              />
            </div>

            {/* Empleado */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Empleado:</label>
              <Select
                options={empleadoOptions}
                value={selectedEmpleado}
                onChange={handleUpdateEmpleado}
                placeholder="Seleccionar empleado..."
                className="text-sm"
                isClearable
              />
            </div>

            {/* Placa Moto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Placa Moto:</label>
              <input
                type="text"
                value={placaMoto}
                onChange={(e) => handleUpdatePlaca(e.target.value)}
                placeholder="Ej: ABC-123"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Configuración de Pago */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Pago:</label>
                <button
                  type="button"
                  onClick={openPaymentModal}
                  className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-lg text-blue-700 bg-blue-100 hover:bg-blue-200"
                >
                  <CreditCardIcon className="h-4 w-4 mr-1" />
                  Configurar
                </button>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Total:</span>
                  <span className="text-lg font-bold text-gray-900">
                    S/. {parseFloat(cotizacionActiva?.totalCotizacion || 0).toFixed(2)}
                  </span>
                </div>
                
                {paymentData.isMixedPayment ? (
                  <div className="space-y-1">
                    {paymentData.paymentMethods.map((pm, index) => (
                      <div key={index} className="flex justify-between items-center text-sm">
                        <span className="inline-flex items-center">
                          <span className="mr-1">{pm.icon}</span>
                          {pm.label}
                        </span>
                        <span>S/. {pm.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex justify-between items-center text-sm">
                    <span className="inline-flex items-center">
                      <span className="mr-1">{paymentData.paymentMethods[0]?.icon}</span>
                      {paymentData.paymentMethods[0]?.label}
                    </span>
                    <span>S/. {paymentData.paymentMethods[0]?.amount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Observaciones:</label>
              <textarea
                value={observaciones}
                onChange={(e) => handleUpdateObservaciones(e.target.value)}
                placeholder="Observaciones adicionales..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows="3"
              />
            </div>

            {/* Total */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
              <div className="text-lg font-bold text-green-800">
                Total: S/. {parseFloat(cotizacionActiva.totalCotizacion || 0).toFixed(2)}
              </div>
            </div>

            {/* Botones de acción */}
            <div className="space-y-3">
              <button
                onClick={handleGuardarCotizacion}
                disabled={!selectedCliente || itemsCotizacionActiva.length === 0}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg flex items-center justify-center font-medium transition-colors"
              >
                <DocumentTextIcon className="h-5 w-5 mr-2" />
                Guardar como Pendiente
              </button>
              
              <button
                onClick={() => router.push('/cotizaciones')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg flex items-center justify-center font-medium transition-colors"
              >
                <CheckIcon className="h-5 w-5 mr-2" />
                Ver Todas las Cotizaciones
              </button>
            </div>
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
                        className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {isSearching && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
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

                  {/* Dropdown de productos */}
{searchTerm.trim() !== '' && (
  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b-lg shadow-lg z-40 max-h-80 overflow-y-auto">
    {isSearching ? (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
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
                <p className="font-bold text-green-600 text-base">
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

                {/* Items de la Cotización */}
                {!cotizacionActiva ? (
                  <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                    <ShoppingCartIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-xl font-medium text-gray-600 mb-2">Selecciona o crea una cotización</h3>
                    <p className="text-gray-500">Crea una nueva cotización o selecciona una existente para comenzar a agregar productos</p>
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-lg">
                    <div className="p-4 border-b border-gray-200">
                      <h3 className="text-xl font-semibold text-gray-800">
                        Items de la Cotización: {cotizacionActiva.numeroCotizacion || 'Nueva'}
                      </h3>
                    </div>

                    <div className="p-4">
                      {itemsCotizacionActiva.length === 0 ? (
                        <div className="text-center py-12">
                          <ShoppingCartIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                          <h4 className="text-lg font-medium text-gray-600 mb-2">No hay productos en esta cotización</h4>
                          <p className="text-gray-500">Usa el buscador arriba para encontrar y agregar productos</p>
                        </div>
                      ) : (
                        <div className="bg-white rounded-lg overflow-hidden">
                          {/* Tabla de items - USAR OVERFLOW RESPONSIVE */}
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              {/* Encabezados */}
                              <thead className="bg-blue-50">
                              <tr className="border-b border-gray-300">
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">C. TIENDA</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">PRODUCTO</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">LOTE</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">MARCA</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">MEDIDA</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">COLOR</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">CANT.</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">P. COMPRA</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">P. VENTA</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">P. VENTA MIN</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">SUBTOTAL</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">ACCIONES</th>
                              </tr>
                            </thead>
                              
                              {/* Cuerpo de la tabla */}
                              <tbody>
                                {itemsCotizacionActiva.map((item, index) => (
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
                                    {/* NUEVA COLUMNA: LOTE */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                                        {item.numeroLote || 'N/A'}
                                      </span>
                                    </td>

                                    {/* Marca */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm text-gray-700">
                                        {item.marca || 'Sin marca'}
                                      </span>
                                    </td>
                                    {/* Medida */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm text-gray-700">
                                        {item.medida || 'N/A'}
                                      </span>
                                    </td>
                                    {/* Color */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm text-gray-600" title={item.color || item.descripcion || 'N/A'}>
                                        {item.color || item.descripcion || "N/A"}
                                      </span>
                                    </td>

                                    {/* Cantidad */}
                                    <td className="px-3 py-3 text-center">
                                      <span className="text-sm font-medium text-gray-900">
                                        {item.cantidad}
                                      </span>
                                    </td>
                                    
                                    {/* Precio unitario */}
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
                                    {/* Precio unitario */}
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
                                          className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors"
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
                          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 border-t border-gray-300">
                            <div className="flex justify-between items-center">
                              <div>
                                <h3 className="text-lg font-semibold">Total de la Cotización</h3>
                                <p className="text-blue-100 text-sm">{itemsCotizacionActiva.length} producto{itemsCotizacionActiva.length !== 1 ? 's' : ''}</p>
                              </div>
                              <div className="text-right">
                                <div className="text-3xl font-bold">
                                  S/. {parseFloat(cotizacionActiva.totalCotizacion || 0).toFixed(2)}
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

     {/* Modal de Cantidad y Precio - VERSIÓN MEJORADA */}
{/* Modal de Cantidad y Precio - VERSIÓN CORREGIDA CON PRECIO MÍNIMO */}
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
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                onClick={() => setShowQuantityModal(false)}
              >
                <span className="sr-only">Cerrar</span>
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>

            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                <ShoppingCartIcon className="h-6 w-6 text-blue-600" aria-hidden="true" />
              </div>
              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                <Dialog.Title as="h3" className="text-xl font-semibold leading-6 text-gray-900 mb-4">
                  Agregar Producto a Cotización
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
                      
                      {/* AGREGAR ESTA SECCIÓN QUE FALTABA - Mostrar precio de venta mínimo */}
                      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-yellow-800">
                            Precio Venta Mínimo:
                          </span>
                          <span className="text-lg font-bold text-yellow-900">
                            S/. {parseFloat(selectedProduct.precioVentaMinimo || 0).toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-yellow-700 mt-1">
                        </p>
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
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
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
                              : 'border-gray-300 focus:ring-blue-500'
                          }`}
                        />
                        {precioVenta < parseFloat(selectedProduct.precioVentaMinimo || 0) && (
                          <p className="text-red-600 text-sm mt-1 font-medium">
                            ⚠️ Precio por debajo del mínimo permitido
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200 mt-6">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-gray-700">Subtotal:</span>
                        <span className="font-bold text-blue-800 text-2xl">S/. {(quantity * precioVenta).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 sm:mt-6 sm:flex sm:flex-row-reverse gap-3">
              <button
                type="button"
                className="inline-flex w-full justify-center rounded-md bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-500 sm:w-auto disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                onClick={handleAddProductToCotizacion}
                disabled={!cotizacionActiva || quantity <= 0 || precioVenta <= 0}
              >
                Agregar a Cotización
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
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-yellow-100 sm:mx-0 sm:h-10 sm:w-10">
                <PencilIcon className="h-6 w-6 text-yellow-600" aria-hidden="true" />
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

                    <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-6 rounded-lg border border-yellow-200 mt-6">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-gray-700">Nuevo Subtotal:</span>
                        <span className="font-bold text-yellow-800 text-2xl">S/. {(editQuantity * editPrecio).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 sm:mt-6 sm:flex sm:flex-row-reverse gap-3">
              <button
                type="button"
                className="inline-flex w-full justify-center rounded-md bg-yellow-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-yellow-500 sm:w-auto disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
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

{/* Mixed Payment Modal */}
<MixedPaymentModal
  isOpen={showPaymentModal}
  onClose={() => setShowPaymentModal(false)}
  totalAmount={parseFloat(cotizacionActiva?.totalCotizacion || 0)}
  onPaymentConfirm={handlePaymentConfirm}
  initialPaymentMethod={paymentData.paymentMethods[0]?.method || 'efectivo'}
/>

    </Layout>
  );
};

export default NuevaCotizacionPage;