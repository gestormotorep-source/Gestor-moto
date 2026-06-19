// pages/cotizaciones/[id].js

import { useState, useEffect, Fragment } from 'react';
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import MixedPaymentModal from '../../components/modals/MixedPaymentModal';
import ProductSearchItem from '../../components/ProductSearchItem';
import ProductDetailsModal from '../../components/modals/ProductDetailsModal';
import ProductModelsModal from '../../components/modals/ProductModelsModal';
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
  PencilIcon,
  ArrowLeftIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  PrinterIcon
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';
import { Dialog, Transition } from '@headlessui/react';
import Select from 'react-select';
import { generarPDFCotizacionCompleta } from '../../components/utils/pdfGeneratorCotizaciones';

const EditarVerCotizacionPage = () => {
  const router = useRouter();
  const { id: cotizacionId } = router.query;
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

  // Estados para la cotización actual
  const [cotizacion, setCotizacion] = useState(null);
  const [itemsCotizacion, setItemsCotizacion] = useState([]);

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

  const [nombrePersonalizado, setNombrePersonalizado] = useState('');

  const PRODUCTOS_VARIOS_IDS = new Set([
    '0CPwiOhioNxNZ8lLddtc',
    'ntnhqzYi8E7yaccrivU4',
  ]);

  // Estados para modales de detalles y modelos
  const [isProductDetailsModalOpen, setIsProductDetailsModalOpen] = useState(false);
  const [isProductModelsModalOpen, setIsProductModelsModalOpen] = useState(false);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState(null);
  const [selectedProductForModels, setSelectedProductForModels] = useState(null);

  const openProductDetailsModal = (product) => {
    setSelectedProductForDetails(product);
    setIsProductDetailsModalOpen(true);
  };

  const openProductModelsModal = (product) => {
    setSelectedProductForModels(product);
    setIsProductModelsModalOpen(true);
  };

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

  // Determinar si es modo edición o solo vista
  const isViewOnly = cotizacion?.estado === 'confirmada' || cotizacion?.estado === 'cancelada';
  const canEdit = !isViewOnly && (cotizacion?.estado === 'pendiente' || cotizacion?.estado === 'borrador');

  // Cargar datos iniciales
  useEffect(() => {
  if (!user) { router.push('/auth'); return; }
  if (!cotizacionId) return;

  const cargarTodo = async () => {
    setLoading(true);
    setError(null);
    try {
      // Cargar todo en paralelo
      const [clientesSnap, empleadosSnap, cotizacionSnap] = await Promise.all([
        getDocs(query(collection(db, 'cliente'), orderBy('nombre', 'asc'))),
        getDocs(query(collection(db, 'empleado'), orderBy('nombre', 'asc'))),
        getDoc(doc(db, 'cotizaciones', cotizacionId)),
      ]);

      if (!cotizacionSnap.exists()) { setError('Cotización no encontrada'); return; }

      const clientesList = clientesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const empleadosList = empleadosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const cotizacionData = { id: cotizacionSnap.id, ...cotizacionSnap.data() };

      setClientes(clientesList);
      setEmpleados(empleadosList);
      setCotizacion(cotizacionData);

      // Sincronizar campos simples
      setPlacaMoto(cotizacionData.placaMoto || '');
      setMetodoPago(cotizacionData.metodoPago || '');
      setObservaciones(cotizacionData.observaciones || '');
      if (cotizacionData.paymentData) setPaymentData(cotizacionData.paymentData);

      // Sincronizar cliente
      const cliente = clientesList.find(c => c.id === cotizacionData.clienteId);
      setSelectedCliente(cliente ? {
        value: cliente.id,
        label: `${cliente.nombre} ${cliente.apellido || ''} - ${cliente.dni || ''}`.trim()
      } : null);

      // Sincronizar empleado
      const empleado = empleadosList.find(e => e.id === cotizacionData.empleadoAsignadoId);
      setSelectedEmpleado(empleado ? {
        value: empleado.id,
        label: `${empleado.nombre} ${empleado.apellido || ''} - ${empleado.puesto || ''}`.trim()
      } : null);

      // Cargar items
      const itemsSnap = await getDocs(
        query(collection(db, 'cotizaciones', cotizacionId, 'itemsCotizacion'), orderBy('createdAt', 'asc'))
      );
      setItemsCotizacion(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (err) {
      console.error('Error al cargar:', err);
      setError('Error al cargar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  cargarTodo();
}, [user, cotizacionId]);



  // Escuchar cambios en tiempo real solo si es modo edición
  useEffect(() => {
    if (!cotizacionId || isViewOnly) return;

    const unsubscribe = onSnapshot(doc(db, 'cotizaciones', cotizacionId), async (docSnap) => {
      if (docSnap.exists()) {
        const cotizacionData = { id: docSnap.id, ...docSnap.data() };
        setCotizacion(cotizacionData);

        // Cargar items
        const qItems = query(
          collection(db, 'cotizaciones', cotizacionId, 'itemsCotizacion'), 
          orderBy('createdAt', 'asc')
        );
        const itemsSnapshot = await getDocs(qItems);
        const itemsList = itemsSnapshot.docs.map(itemDoc => ({
          id: itemDoc.id,
          ...itemDoc.data()
        }));
        setItemsCotizacion(itemsList);
      }
    });

    return () => unsubscribe();
  }, [cotizacionId, isViewOnly]);

  // Actualizar el total cuando cambian los items
  useEffect(() => {
    const total = parseFloat(cotizacion?.totalCotizacion || 0);
    setPaymentData(prev => ({
      ...prev,
      totalAmount: total,
      paymentMethods: prev.isMixedPayment 
        ? prev.paymentMethods 
        : [{ ...prev.paymentMethods[0], amount: total }]
    }));
  }, [cotizacion?.totalCotizacion]);

  // BÚSQUEDA DE PRODUCTOS - solo si puede editar
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
          getDocs(query(collection(db, 'productos'), where('codigoTienda', '==', termUpper), limit(10))),
          getDocs(query(collection(db, 'productos'), where('codigoProveedor', '==', termUpper), limit(10))),
          getDocs(query(collection(db, 'productos'), where('codigoTienda', '>=', termUpper), where('codigoTienda', '<=', termUpper + '\uf8ff'), limit(100))),
          getDocs(query(collection(db, 'productos'), where('codigoProveedor', '>=', termUpper), where('codigoProveedor', '<=', termUpper + '\uf8ff'), limit(100))),
        );

        const prefijos = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
                          'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
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
            claves.some(clave => clave.includes(palabra)) ||
            codigoTienda.includes(palabra) ||
            codigoProveedor.includes(palabra)
          );
        });
      }

      setFilteredProductos(candidatos);
    } catch (err) {
      console.error('Error al buscar productos:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Efecto para buscar productos con debounce - solo si puede editar
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm.trim()) searchProducts(searchTerm);
      else setFilteredProductos([]);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Funciones de edición - solo disponibles si puede editar
  const handleUpdateCliente = async (selectedOption) => {
    if (!cotizacion?.id || isViewOnly) return;

    try {
      await runTransaction(db, async (transaction) => {
        const cotizacionRef = doc(db, 'cotizaciones', cotizacion.id);
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

  const handleUpdateEmpleado = async (selectedOption) => {
    if (!cotizacion?.id || isViewOnly) return;

    try {
      await runTransaction(db, async (transaction) => {
        const cotizacionRef = doc(db, 'cotizaciones', cotizacion.id);
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


  const handleUpdateMetodoPago = async (nuevoMetodo) => {
    if (!cotizacion?.id || isViewOnly) return;

    try {
      const cotizacionRef = doc(db, 'cotizaciones', cotizacion.id);
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

  // Funciones para productos (solo en modo edición)
  const handleSelectProduct = (product) => {
    if (isViewOnly) return;
    
    setSelectedProduct(product);
    setPrecioVenta(parseFloat(product.precioVentaDefault || 0));
    setNombrePersonalizado('');
    setQuantity(1);
    setShowQuantityModal(true);
  };

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

  const crearItemsSeparadosPorLote = async (producto, cantidadTotal, precioVenta, lotesDisponibles) => {
    const itemsSeparados = [];
    let cantidadPendiente = cantidadTotal;

    for (const lote of lotesDisponibles) {
      if (cantidadPendiente <= 0) break;

      const cantidadDelLote = Math.min(cantidadPendiente, lote.stockRestante);
      const gananciaUnitaria = precioVenta - lote.precioCompraUnitario;
      const gananciaTotal = cantidadDelLote * gananciaUnitaria;

      const item = {
        productoId: producto.id,
        nombreProducto: producto.nombre,
        nombrePersonalizado: nombrePersonalizado.trim() || null,
        marca: producto.marca || '',
        codigoTienda: producto.codigoTienda || '',
        color: producto.color || '',
        medida: producto.medida || 'N/A',
        precioCompraDefault: parseFloat(producto.precioCompraDefault || 0),
        precioVentaMinimo: parseFloat(producto.precioVentaMinimo || 0),
        descripcion: producto.descripcion || '',
        cantidad: cantidadDelLote,
        precioVentaUnitario: precioVenta.toFixed(2),
        subtotal: (cantidadDelLote * precioVenta).toFixed(2),
        loteId: lote.id,
        numeroLote: lote.numeroLote,
        precioCompraUnitario: lote.precioCompraUnitario,
        gananciaUnitaria: gananciaUnitaria,
        gananciaTotal: gananciaTotal,
        loteOriginal: {
          id: lote.id,
          numeroLote: lote.numeroLote,
          precioCompraUnitario: lote.precioCompraUnitario,
          fechaIngreso: lote.fechaIngreso
        }
      };

      itemsSeparados.push(item);
      cantidadPendiente -= cantidadDelLote;
    }

    if (cantidadPendiente > 0) {
      throw new Error(`Stock insuficiente. Faltan ${cantidadPendiente} unidades del producto.`);
    }

    return itemsSeparados;
  };

  const handleAddProductToCotizacion = async () => {
    if (!cotizacion?.id || !selectedProduct || isViewOnly) return;

    // Bloquear solo si es MISMO producto + MISMO precio (igual que en nueva.js)
    if (!PRODUCTOS_VARIOS_IDS.has(selectedProduct.id)) {
      const existeConMismoPrecio = itemsCotizacion.some(item =>
        item.productoId === selectedProduct.id &&
        parseFloat(item.precioVentaUnitario) === parseFloat(precioVenta)
      );
      if (existeConMismoPrecio) {
        alert(`Este producto ya existe con el mismo precio (S/. ${precioVenta.toFixed(2)}). Edita el item existente o cambia el precio.`);
        setShowQuantityModal(false);
        return;
      }
    }

    // Validar stock sumando lo ya reservado en itemsCotizacion
    const stockComprometido = itemsCotizacion
      .filter(item => item.productoId === selectedProduct.id)
      .reduce((total, item) => total + parseFloat(item.cantidad || 0), 0);

    const stockDisponible = (selectedProduct.stockActual || 0) - stockComprometido;

    if (stockDisponible < quantity) {
      alert(`Stock insuficiente. Disponible: ${stockDisponible}, ya en cotización: ${stockComprometido}`);
      return;
    }

    try {
      const lotesDisponibles = await obtenerLotesDisponiblesFIFO(selectedProduct.id);

      // ── Igual que en nueva.js: restar lo ya reservado por lote ──
      const stockReservadoPorLote = {};
      itemsCotizacion
        .filter(item => item.productoId === selectedProduct.id)
        .forEach(item => {
          if (item.loteId) {
            stockReservadoPorLote[item.loteId] = (stockReservadoPorLote[item.loteId] || 0) + parseFloat(item.cantidad || 0);
          }
        });

      const lotesAjustados = lotesDisponibles
        .map(lote => ({ ...lote, stockRestante: lote.stockRestante - (stockReservadoPorLote[lote.id] || 0) }))
        .filter(lote => lote.stockRestante > 0);

      const itemsSeparados = await crearItemsSeparadosPorLote(selectedProduct, quantity, precioVenta, lotesAjustados);

      await runTransaction(db, async (transaction) => {
        const cotizacionRef = doc(db, 'cotizaciones', cotizacion.id);
        const cotizacionSnap = await transaction.get(cotizacionRef);
        
        if (!cotizacionSnap.exists()) {
          throw new Error("Cotización no encontrada");
        }

        let totalSubtotal = 0;
        let totalGanancia = 0;

        for (const item of itemsSeparados) {
          const itemRef = doc(collection(db, 'cotizaciones', cotizacion.id, 'itemsCotizacion'));
          
          transaction.set(itemRef, {
            ...item,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          totalSubtotal += parseFloat(item.subtotal);
          totalGanancia += parseFloat(item.gananciaTotal);
        }

        const currentTotal = parseFloat(cotizacionSnap.data().totalCotizacion || 0);
        const currentGananciaTotal = parseFloat(cotizacionSnap.data().gananciaTotalCotizacion || 0);
        
        const updatedTotal = currentTotal + totalSubtotal;
        const updatedGananciaTotal = currentGananciaTotal + totalGanancia;

        transaction.update(cotizacionRef, {
          totalCotizacion: parseFloat(updatedTotal.toFixed(2)),
          gananciaTotalCotizacion: parseFloat(updatedGananciaTotal.toFixed(2)),
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

  const handleEditItem = (item) => {
    if (isViewOnly) return;
    
    setEditingItem(item);
    setEditQuantity(item.cantidad);
    setEditPrecio(parseFloat(item.precioVentaUnitario || 0));
    setShowEditItemModal(true);
  };

  const handleUpdateItem = async () => {
    if (!cotizacion?.id || !editingItem || isViewOnly) return;

    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'cotizaciones', cotizacion.id, 'itemsCotizacion', editingItem.id);
        const cotizacionRef = doc(db, 'cotizaciones', cotizacion.id);

        const cotizacionSnap = await transaction.get(cotizacionRef);
        
        if (!cotizacionSnap.exists()) {
          throw new Error("Cotización no encontrada");
        }

        const precioCompraFIFO = await obtenerPrecioCompraFIFO(editingItem.productoId);
        const nuevaGananciaUnitaria = editPrecio - precioCompraFIFO;
        
        const oldSubtotal = parseFloat(editingItem.subtotal || 0);
        const oldGananciaTotal = parseFloat(editingItem.gananciaTotal || 0);
        
        const newSubtotal = editQuantity * editPrecio;
        const newGananciaTotal = editQuantity * nuevaGananciaUnitaria;

        transaction.update(itemRef, {
          cantidad: editQuantity,
          precioVentaUnitario: editPrecio,
          nombrePersonalizado: editingItem.nombrePersonalizado ?? null,
          subtotal: newSubtotal,
          precioCompraUnitario: precioCompraFIFO,
          gananciaUnitaria: nuevaGananciaUnitaria,
          gananciaTotal: newGananciaTotal,
          updatedAt: serverTimestamp(),
        });

        const currentTotal = parseFloat(cotizacionSnap.data().totalCotizacion || 0);
        const currentGananciaTotal = parseFloat(cotizacionSnap.data().gananciaTotalCotizacion || 0);
        
        const updatedTotal = currentTotal - oldSubtotal + newSubtotal;
        const updatedGananciaTotal = currentGananciaTotal - oldGananciaTotal + newGananciaTotal;

        transaction.update(cotizacionRef, {
          totalCotizacion: parseFloat(updatedTotal.toFixed(2)),
          gananciaTotalCotizacion: parseFloat(updatedGananciaTotal.toFixed(2)),
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

  const handleRemoveItem = async (itemId, subtotal) => {
    if (!cotizacion?.id || !itemId || isViewOnly) return;

    if (!window.confirm('¿Eliminar este producto de la cotización?')) return;

    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'cotizaciones', cotizacion.id, 'itemsCotizacion', itemId);
        const cotizacionRef = doc(db, 'cotizaciones', cotizacion.id);

        const cotizacionSnap = await transaction.get(cotizacionRef);
        const itemSnap = await transaction.get(itemRef);
        
        if (!cotizacionSnap.exists() || !itemSnap.exists()) {
          throw new Error("Cotización o item no encontrado");
        }

        const itemData = itemSnap.data();
        const itemGananciaTotal = parseFloat(itemData.gananciaTotal || 0);

        const currentTotal = parseFloat(cotizacionSnap.data().totalCotizacion || 0);
        const currentGananciaTotal = parseFloat(cotizacionSnap.data().gananciaTotalCotizacion || 0);
        
        const updatedTotal = currentTotal - parseFloat(subtotal);
        const updatedGananciaTotal = currentGananciaTotal - itemGananciaTotal;

        transaction.delete(itemRef);
        
        transaction.update(cotizacionRef, {
          totalCotizacion: parseFloat(updatedTotal.toFixed(2)),
          gananciaTotalCotizacion: parseFloat(updatedGananciaTotal.toFixed(2)),
          updatedAt: serverTimestamp(),
        });
      });

      alert('Producto eliminado de la cotización');
    } catch (err) {
      console.error("Error al eliminar item:", err);
      setError("Error al eliminar producto");
    }
  };

const handleGuardarCotizacion = async () => {
  if (!cotizacion?.id || isViewOnly) return;

  if (!selectedCliente) {
    alert('Por favor selecciona un cliente');
    return;
  }

  if (itemsCotizacion.length === 0) {
    alert('La cotización debe tener al menos un producto');
    return;
  }

  if (!window.confirm('¿Guardar los cambios en esta cotización?')) {
    return;
  }

  try {
    const cotizacionRef = doc(db, 'cotizaciones', cotizacion.id);
    await updateDoc(cotizacionRef, {
      estado: 'pendiente',
      metodoPago: paymentData.isMixedPayment ? 'mixto' : (paymentData.paymentMethods[0]?.method || metodoPago || 'efectivo'),
      paymentData: paymentData,
      placaMoto: placaMoto || null, // ← SE GUARDA AQUÍ
      observaciones: observaciones || '', // ← SE GUARDA AQUÍ
      fechaGuardado: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    alert('Cotización actualizada exitosamente.');
    
  } catch (err) {
    console.error("Error al guardar cotización:", err);
    alert('Error al guardar cotización: ' + err.message);
  }
};

  const handlePaymentConfirm = (newPaymentData) => {
    setPaymentData(newPaymentData);
    setShowPaymentModal(false);
  };

  const openPaymentModal = () => {
    if (isViewOnly) return;
    const total = parseFloat(cotizacion?.totalCotizacion || 0);
    if (total <= 0) {
      setError('Debe añadir al menos un producto antes de configurar el pago.');
      return;
    }
    setShowPaymentModal(true);
  };

  // Función para imprimir PDF
  const handleImprimirCotizacion = async () => {
    try {
      const loadingToast = document.createElement('div');
      loadingToast.innerHTML = `
        <div class="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <div class="flex items-center">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Generando PDF...
          </div>
        </div>
      `;
      document.body.appendChild(loadingToast);

      let clienteData = null;
      if (cotizacion.clienteId && cotizacion.clienteId !== 'general') {
        try {
          const clienteDoc = await getDoc(doc(db, 'clientes', cotizacion.clienteId));
          if (clienteDoc.exists()) {
            clienteData = clienteDoc.data();
          }
        } catch (error) {
          console.warn('No se pudo obtener información del cliente:', error);
        }
      }

      await generarPDFCotizacionCompleta(cotizacion.id, cotizacion, clienteData);
      
      document.body.removeChild(loadingToast);
      
      const successToast = document.createElement('div');
      successToast.innerHTML = `
        <div class="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <div class="flex items-center">
            <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            PDF generado exitosamente
          </div>
        </div>
      `;
      document.body.appendChild(successToast);
      
      setTimeout(() => {
        if (document.body.contains(successToast)) {
          document.body.removeChild(successToast);
        }
      }, 3000);

    } catch (error) {
      const loadingElements = document.querySelectorAll('div[class*="fixed top-4 right-4 bg-blue-500"]');
      loadingElements.forEach(el => {
        if (document.body.contains(el.parentElement)) {
          document.body.removeChild(el.parentElement);
        }
      });

      console.error('Error al generar PDF:', error);
      
      const errorToast = document.createElement('div');
      errorToast.innerHTML = `
        <div class="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <div class="flex items-center">
            <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
            Error al generar PDF
          </div>
        </div>
      `;
      document.body.appendChild(errorToast);
      
      setTimeout(() => {
        if (document.body.contains(errorToast)) {
          document.body.removeChild(errorToast);
        }
      }, 3000);
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

  const getEstadoBadge = (estado) => {
    switch (estado) {
      case 'confirmada':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">
            <CheckIcon className="h-4 w-4 mr-1" />
            Confirmada
          </span>
        );
      case 'cancelada':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 border border-red-200">
            <XMarkIcon className="h-4 w-4 mr-1" />
            Cancelada
          </span>
        );
      case 'pendiente':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
            <DocumentTextIcon className="h-4 w-4 mr-1" />
            Pendiente
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 border border-gray-200">
            <DocumentTextIcon className="h-4 w-4 mr-1" />
            Borrador
          </span>
        );
    }
  };

  if (!user) return null;

  if (loading && !cotizacion) {
    return (
      <Layout title="Cargando Cotización...">
        <div className="min-h-screen bg-gray-50 py-6">
          <div className="max-w-full mx-auto px-6 sm:px-8 lg:px-12">
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!cotizacion) {
    return (
      <Layout title="Cotización no encontrada">
        <div className="min-h-screen bg-gray-50 py-6">
          <div className="max-w-full mx-auto px-6 sm:px-8 lg:px-12">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden p-8 text-center">
              <ExclamationTriangleIcon className="h-16 w-16 mx-auto mb-4 text-red-500" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Cotización no encontrada</h2>
              <p className="text-gray-600 mb-6">La cotización que buscas no existe o no tienes permisos para verla.</p>
              <button
                onClick={() => router.push('/cotizaciones')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Volver a Cotizaciones
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={isViewOnly ? `Ver Cotización ${cotizacion.numeroCotizacion}` : `Editar Cotización ${cotizacion.numeroCotizacion}`}>
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-full mx-auto px-6 sm:px-8 lg:px-12">
          {error && (
            <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50">
              {error}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            {/* Header con información de la cotización */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => router.push('/cotizaciones')}
                    className="text-white hover:text-blue-100 p-2 rounded-full hover:bg-blue-800 transition-colors"
                  >
                    <ArrowLeftIcon className="h-5 w-5" />
                  </button>
                  <div>
                    <h1 className="text-2xl font-bold text-white">
                      {isViewOnly ? 'Ver Cotización' : 'Editar Cotización'}: {cotizacion.numeroCotizacion}
                    </h1>
                    <p className="text-blue-100 text-sm">
                      Cliente: {cotizacion.clienteNombre} | 
                      Creado: {cotizacion.fechaCreacion?.toDate?.() ? 
                        cotizacion.fechaCreacion.toDate().toLocaleDateString() : 
                        'Fecha N/A'
                      }
                    </p>
                  </div>
                </div>
              </div>

            </div>

            

            <div className="grid grid-cols-12 gap-6 p-6">
              {/* Panel Izquierdo - Datos de la Cotización */}
              <div className="col-span-12 lg:col-span-4">
                <div className="bg-gray-50 rounded-lg overflow-hidden">
                  <div className="p-4 bg-gray-100">
                    <h3 className="font-semibold text-lg text-gray-800">
                      {isViewOnly ? 'Información de la Cotización' : 'Editar Cotización'}
                    </h3>
                  </div>
                  
                  <div className="p-4 space-y-4">
                    {/* Cliente */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Cliente:</label>
                      {isViewOnly ? (
                        <div className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900">
                          {cotizacion.clienteNombre}
                        </div>
                      ) : (
                        <Select
                          options={clienteOptions}
                          value={selectedCliente}
                          onChange={handleUpdateCliente}
                          placeholder="Seleccionar cliente..."
                          className="text-sm"
                          isClearable
                        />
                      )}
                    </div>

                    {/* Empleado */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Empleado:</label>
                      {isViewOnly ? (
                        <div className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900">
                          {cotizacion.empleadoAsignadoNombre || 'No asignado'}
                        </div>
                      ) : (
                        <Select
                          options={empleadoOptions}
                          value={selectedEmpleado}
                          onChange={handleUpdateEmpleado}
                          placeholder="Seleccionar empleado..."
                          className="text-sm"
                          isClearable
                        />
                      )}
                    </div>

                    {/* Placa Moto */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Placa Moto:</label>
                      <input
                        type="text"
                        value={placaMoto}
                        onChange={(e) => isViewOnly ? null : setPlacaMoto(e.target.value)}
                        placeholder="Ej: ABC-123"
                        readOnly={isViewOnly}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-lg ${
                          isViewOnly 
                            ? 'bg-gray-50 text-gray-700 cursor-not-allowed' 
                            : 'focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        }`}
                      />
                    </div>

                    {/* Configuración de Pago */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="block text-sm font-medium text-gray-700">Pago:</label>
                        {!isViewOnly && (
                          <button
                            type="button"
                            onClick={openPaymentModal}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-lg text-blue-700 bg-blue-100 hover:bg-blue-200"
                          >
                            <CreditCardIcon className="h-4 w-4 mr-1" />
                            Configurar
                          </button>
                        )}
                      </div>

                      <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">Total:</span>
                          <span className="text-lg font-bold text-gray-900">
                            S/. {parseFloat(cotizacion?.totalCotizacion || 0).toFixed(2)}
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
                        onChange={(e) => isViewOnly ? null : setObservaciones(e.target.value)}
                        placeholder="Observaciones adicionales..."
                        readOnly={isViewOnly}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-lg ${
                          isViewOnly 
                            ? 'bg-gray-50 text-gray-700 cursor-not-allowed' 
                            : 'focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        }`}
                        rows="3"
                      />
                    </div>

                    {/* Total */}
                    <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                      <div className="text-lg font-bold text-green-800">
                        Total: S/. {parseFloat(cotizacion.totalCotizacion || 0).toFixed(2)}
                      </div>
                    </div>

                    {/* Botones de acción */}
                    {!isViewOnly && (
                      <div className="space-y-3">
                        <button
                          onClick={handleGuardarCotizacion}
                          disabled={!selectedCliente || itemsCotizacion.length === 0}
                          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg flex items-center justify-center font-medium transition-colors"
                        >
                          <CheckIcon className="h-5 w-5 mr-2" />
                          Guardar Cambios
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Panel Derecho - Productos */}
              <div className="col-span-12 lg:col-span-8">
                {/* Buscador de Productos - Solo si puede editar */}
                {!isViewOnly && (
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
                      

                    </div>

                    {/* Dropdown de productos */}
                    {searchTerm.trim() !== '' && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b-lg shadow-lg z-40 max-h-96 overflow-y-auto">
                        {isSearching ? (
                          <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                          </div>
                        ) : filteredProductos.length === 0 ? (
                          <div className="p-4 text-center text-gray-500">
                            <p>No se encontraron productos</p>
                          </div>
                        ) : (
                          <div className="max-h-96">
                            {filteredProductos.slice(0, 20).map(producto => (
                              <ProductSearchItem
                                key={producto.id}
                                producto={producto}
                                onSelectProduct={handleSelectProduct}
                                onClearSearch={() => setSearchTerm('')}
                                onOpenDetails={openProductDetailsModal}
                                onOpenModels={openProductModelsModal}
                              />
                            ))}
                            {filteredProductos.length > 20 && (
                              <div className="p-3 text-center text-sm text-gray-500 bg-gray-50">
                                Mostrando 20 de {filteredProductos.length} resultados. Refina tu búsqueda.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Items de la Cotización */}
                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-800">
                      Productos de la Cotización
                    </h3>
                  </div>

                  <div className="p-4">
                    {itemsCotizacion.length === 0 ? (
                      <div className="text-center py-12">
                        <ShoppingCartIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <h4 className="text-lg font-medium text-gray-600 mb-2">No hay productos en esta cotización</h4>
                        {!isViewOnly && (
                          <p className="text-gray-500">Usa el buscador arriba para encontrar y agregar productos</p>
                        )}
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
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
                                {!isViewOnly && (
                                  <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">ACCIONES</th>
                                )}
                              </tr>
                            </thead>
                            
                            <tbody>
                              {itemsCotizacion.map((item, index) => (
                                <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm text-gray-900 font-medium">
                                      {item.codigoTienda || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 min-w-48">
                                    <div className="font-medium text-gray-900 text-sm">
                                      {item.nombreProducto}
                                    </div>
                                    {item.nombrePersonalizado && (
                                      <div className="text-xs text-blue-600 font-semibold mt-0.5">
                                        → {item.nombrePersonalizado}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                                      {item.numeroLote || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm text-gray-700">
                                      {item.marca || 'Sin marca'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm text-gray-700">
                                      {item.medida || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm text-gray-600" title={item.color || item.descripcion || 'N/A'}>
                                      {item.color || item.descripcion || "N/A"}
                                    </span>
                                  </td>

                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm font-medium text-gray-900">
                                      {item.cantidad}
                                    </span>
                                  </td>
                                  
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm font-medium text-gray-900">
                                      S/. {parseFloat(item.precioCompraDefault || 0).toFixed(2)}
                                    </span>
                                  </td>
                                  
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm font-medium text-gray-900">
                                      S/. {parseFloat(item.precioVentaUnitario || 0).toFixed(2)}
                                    </span>
                                  </td>
                                  
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm font-medium text-gray-900">
                                      S/. {parseFloat(item.precioVentaMinimo || 0).toFixed(2)}
                                    </span>
                                  </td>

                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm font-semibold text-gray-900">
                                      S/. {parseFloat(item.subtotal || 0).toFixed(2)}
                                    </span>
                                  </td>

                                  {!isViewOnly && (
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
                                  )}
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
                              <p className="text-blue-100 text-sm">{itemsCotizacion.length} producto{itemsCotizacion.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl font-bold">
                                S/. {parseFloat(cotizacion.totalCotizacion || 0).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Cantidad y Precio - Solo en modo edición */}
      {!isViewOnly && (
        <Transition.Root show={showQuantityModal} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={setShowQuantityModal}>
            <Transition.Child as={Fragment}
              enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100"
              leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
            </Transition.Child>

            <div className="fixed inset-0 z-50 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment}
                  enter="ease-out duration-300" enterFrom="opacity-0 translate-y-4 sm:scale-95"
                  enterTo="opacity-100 translate-y-0 sm:scale-100"
                  leave="ease-in duration-200" leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                  leaveTo="opacity-0 translate-y-4 sm:scale-95">
                  <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-white shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-5xl p-10">
                    <button type="button" onClick={() => setShowQuantityModal(false)}
                      className="absolute right-4 top-4 rounded-md text-gray-400 hover:text-gray-500">
                      <XMarkIcon className="h-6 w-6" />
                    </button>

                    <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                      <ShoppingCartIcon className="h-7 w-7 text-blue-600" />
                      Agregar Producto a Cotización
                    </h3>

                    {selectedProduct && (
                      <div className="grid grid-cols-2 gap-8 items-stretch">

                        {/* COLUMNA IZQUIERDA */}
                        <div className="flex flex-col gap-4 h-full">
                          <div className="bg-gray-50 p-5 rounded-lg border-2 border-blue-200 text-left">
                            <h4 className="font-bold text-xl text-gray-900 mb-1">{selectedProduct.nombre}</h4>
                            {selectedProduct.codigoProveedor && (
                              <div className="mb-3">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold bg-blue-100 text-blue-800 font-mono">
                                  C. Proveedor: {selectedProduct.codigoProveedor}
                                </span>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div><span className="font-medium text-gray-600">C. Tienda: </span><span className="text-gray-800">{selectedProduct.codigoTienda || 'N/A'}</span></div>
                              <div><span className="font-medium text-gray-600">Marca: </span><span className="text-gray-800">{selectedProduct.marca || 'Sin marca'}</span></div>
                              <div><span className="font-medium text-gray-600">Medida: </span><span className="text-gray-800">{selectedProduct.medida || 'N/A'}</span></div>
                              <div><span className="font-medium text-gray-600">Color: </span><span className="text-gray-800">{selectedProduct.color || 'N/A'}</span></div>
                              <div><span className="font-medium text-gray-600">Stock disponible: </span><span className="font-bold text-gray-900">{selectedProduct.stockActual || 0}</span></div>
                            </div>
                          </div>

                          <div className="border border-amber-200 rounded-lg overflow-hidden flex-1">
                            <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Precios de referencia</span>
                            </div>
                            <div className="divide-y divide-amber-100">
                              <div className="flex items-center justify-between px-4 py-3">
                                <span className="text-sm text-gray-600">Precio compra</span>
                                <span className="text-base font-bold text-amber-800">S/. {parseFloat(selectedProduct.precioCompraDefault || 0).toFixed(2)}</span>
                              </div>
                              <div className="flex items-center justify-between px-4 py-3">
                                <span className="text-sm text-gray-600">Precio venta mínimo</span>
                                <span className="text-base font-bold text-red-700">S/. {parseFloat(selectedProduct.precioVentaMinimo || 0).toFixed(2)}</span>
                              </div>
                              <div className="flex items-center justify-between px-4 py-3">
                                <span className="text-sm text-gray-600">Precio venta sugerido</span>
                                <span className="text-base font-bold text-blue-700">S/. {precioVenta.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* COLUMNA DERECHA */}
                        <div className="flex flex-col gap-5 h-full">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad</label>
                              <input type="number" value={quantity}
                                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                                min="1" max={selectedProduct.stockActual || 999}
                                onWheel={(e) => e.target.blur()}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base" />
                            </div>
                            {PRODUCTOS_VARIOS_IDS.has(selectedProduct?.id) && (
                              <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Nombre descriptivo 
                                </label>
                                <input
                                  type="text"
                                  value={nombrePersonalizado}
                                  onChange={e => setNombrePersonalizado(e.target.value)}
                                  placeholder="¿Qué producto es?"
                                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                                />
                              </div>
                            )}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Venta (S/.)</label>
                              <input type="number" value={precioVenta}
                                onChange={(e) => setPrecioVenta(parseFloat(e.target.value) || 0)}
                                min="0" step="0.01" onWheel={(e) => e.target.blur()}
                                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent text-base ${
                                  precioVenta < parseFloat(selectedProduct.precioVentaMinimo || 0)
                                    ? 'border-red-300 focus:ring-red-500 bg-red-50'
                                    : 'border-gray-300 focus:ring-blue-500'
                                }`} />
                              {precioVenta < parseFloat(selectedProduct.precioVentaMinimo || 0) && (
                                <p className="text-red-600 text-xs mt-1 font-medium">⚠️ Precio por debajo del mínimo permitido</p>
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
                            <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-5 rounded-lg border border-blue-200">
                              <div className="flex justify-between items-center">
                                <span className="text-lg font-medium text-gray-700">Subtotal:</span>
                                <span className="font-bold text-blue-800 text-2xl">S/. {(quantity * precioVenta).toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="flex justify-end gap-3">
                              <button type="button" onClick={() => setShowQuantityModal(false)}
                                className="px-6 py-3 rounded-lg bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-semibold text-base">
                                Cancelar
                              </button>
                              <button type="button" onClick={handleAddProductToCotizacion}
                                disabled={!cotizacion || quantity <= 0 || precioVenta <= 0}
                                className="px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold text-base hover:bg-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                                Agregar a Cotización
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition.Root>
      )}

      {/* Modal de Edición de Item - Solo en modo edición */}
      {!isViewOnly && (
        <Transition.Root show={showEditItemModal} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={setShowEditItemModal}>
            <Transition.Child as={Fragment}
              enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100"
              leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
            </Transition.Child>

            <div className="fixed inset-0 z-50 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment}
                  enter="ease-out duration-300" enterFrom="opacity-0 translate-y-4 sm:scale-95"
                  enterTo="opacity-100 translate-y-0 sm:scale-100"
                  leave="ease-in duration-200" leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                  leaveTo="opacity-0 translate-y-4 sm:scale-95">
                  <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-white shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-5xl p-10">
                    <button type="button" onClick={() => setShowEditItemModal(false)}
                      className="absolute right-4 top-4 rounded-md text-gray-400 hover:text-gray-500">
                      <XMarkIcon className="h-6 w-6" />
                    </button>

                    <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                      <PencilIcon className="h-7 w-7 text-yellow-500" />
                      Editar Producto en Cotización
                    </h3>

                    {editingItem && (
                      <div className="grid grid-cols-2 gap-8 items-stretch">

                        {/* COLUMNA IZQUIERDA */}
                        <div className="flex flex-col gap-4 h-full">
                          <div className="bg-gray-50 p-5 rounded-lg border-2 border-yellow-200 text-left">
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

                        {/* COLUMNA DERECHA */}
                        <div className="flex flex-col gap-5 h-full">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad</label>
                              <input type="number" value={editQuantity}
                                onChange={(e) => setEditQuantity(parseInt(e.target.value) || 1)}
                                min="1" onWheel={(e) => e.target.blur()}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base" />
                            </div>
                            {PRODUCTOS_VARIOS_IDS.has(editingItem?.productoId) && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Nombre descriptivo
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
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Venta (S/.)</label>
                              <input type="number" value={editPrecio}
                                onChange={(e) => setEditPrecio(parseFloat(e.target.value) || 0)}
                                min="0" step="0.01" onWheel={(e) => e.target.blur()}
                                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent text-base ${
                                  editPrecio < parseFloat(editingItem.precioVentaMinimo || 0)
                                    ? 'border-red-300 focus:ring-red-500 bg-red-50'
                                    : 'border-gray-300 focus:ring-yellow-500'
                                }`} />
                              {editPrecio < parseFloat(editingItem.precioVentaMinimo || 0) && (
                                <p className="text-red-600 text-xs mt-1 font-medium">⚠️ Precio por debajo del mínimo permitido</p>
                              )}
                            </div>
                          </div>

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
                                <span className={`font-bold ${(editQuantity * (editPrecio - parseFloat(editingItem.precioCompraUnitario || 0))) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                  S/. {(editQuantity * (editPrecio - parseFloat(editingItem.precioCompraUnitario || 0))).toFixed(2)}
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
                              <button type="button" onClick={() => setShowEditItemModal(false)}
                                className="px-6 py-3 rounded-lg bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-semibold text-base">
                                Cancelar
                              </button>
                              <button type="button" onClick={handleUpdateItem}
                                disabled={editQuantity <= 0 || editPrecio <= 0}
                                className="px-6 py-3 rounded-lg bg-yellow-500 text-white font-semibold text-base hover:bg-yellow-400 disabled:bg-gray-400 disabled:cursor-not-allowed">
                                Actualizar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition.Root>
      )}

      {/* Mixed Payment Modal - Solo en modo edición */}
      {!isViewOnly && (
        <MixedPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          totalAmount={parseFloat(cotizacion?.totalCotizacion || 0)}
          onPaymentConfirm={handlePaymentConfirm}
          initialPaymentMethod={paymentData.paymentMethods[0]?.method || 'efectivo'}
          initialPaymentData={paymentData}
        />
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

export default EditarVerCotizacionPage;