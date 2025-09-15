import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import { useSale } from '../../contexts/SaleContext';
import Layout from '../../components/Layout';
import MixedPaymentModal from '../../components/modals/MixedPaymentModal';
import { db } from '../../lib/firebase';
import {
  collection,
  getDoc,
  doc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  getDocs,
  runTransaction,
  updateDoc,
  limit,
  where
} from 'firebase/firestore';
import { 
  ShoppingCartIcon, 
  PlusIcon, 
  MagnifyingGlassIcon, 
  TrashIcon, 
  ArrowLeftIcon, 
  CurrencyDollarIcon,
  CreditCardIcon,
  PencilIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const NuevaVentaPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { activeSale, clearActiveSale } = useSale();

  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [clientes, setClientes] = useState([]);

  const [ventaPrincipalData, setVentaPrincipalData] = useState({
    id: null,
    numeroVenta: '',
    clienteId: '',
    observaciones: '',
    estado: 'borrador',
    tipoVenta: 'Venta'
  });

  // Estado para pagos mixtos
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

  // Estados para búsqueda mejorada (estilo cotizaciones)
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProductos, setFilteredProductos] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [itemsVenta, setItemsVenta] = useState([]);

  // Estados para modal de cantidad
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [precioVenta, setPrecioVenta] = useState(0);

  // Estados para modal de edición
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editPrecio, setEditPrecio] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        router.push('/auth');
        return;
      }

      setLoadingData(true);
      setError(null);

      try {
        // 1. Cargar Productos
        const qProducts = query(collection(db, 'productos'), orderBy('nombre', 'asc'));
        const productSnapshot = await getDocs(qProducts);
        const productsList = productSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProducts(productsList);

        // 2. Cargar Clientes
        const qClientes = query(collection(db, 'cliente'), orderBy('nombre', 'asc'));
        const clienteSnapshot = await getDocs(qClientes);
        const clientesList = clienteSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setClientes(clientesList);

        // 3. Cargar venta en borrador si existe en el contexto
        if (activeSale && activeSale.saleId) {
          const saleDocRef = doc(db, 'ventas', activeSale.saleId);
          const saleSnap = await getDoc(saleDocRef);

          if (saleSnap.exists() && saleSnap.data().estado === 'borrador') {
            const saleData = saleSnap.data();
            setVentaPrincipalData({
              id: saleSnap.id,
              numeroVenta: saleData.numeroVenta,
              clienteId: saleData.clienteId,
              observaciones: saleData.observaciones || '',
              estado: saleData.estado,
              tipoVenta: saleData.tipoVenta
            });

            if (saleData.paymentData) {
              setPaymentData(saleData.paymentData);
            }

            // CARGAR ITEMS CON CAMPOS OCULTOS
            const qItems = query(collection(saleDocRef, 'itemsVenta'), orderBy('createdAt', 'asc'));
            const itemsSnapshot = await getDocs(qItems);
            const itemsList = itemsSnapshot.docs.map(itemDoc => {
                const data = itemDoc.data();
                return {
                id: itemDoc.id,
                ...data,
                subtotal: parseFloat(data.subtotal).toFixed(2),
                // MANTENER CAMPOS OCULTOS PARA CÁLCULOS POSTERIORES
                precioCompraUnitario: data.precioCompraUnitario || 0, // OCULTO
                gananciaUnitaria: data.gananciaUnitaria || 0, // OCULTO
                gananciaTotal: data.gananciaTotal || 0, // OCULTO
                };
            });
            setItemsVenta(itemsList);
            alert(`Venta borrador ${saleData.numeroVenta} cargada.`);
          } else {
            clearActiveSale();
            setVentaPrincipalData(prev => ({
              ...prev,
              clienteId: clientesList.find(c => c.id === 'cliente-no-registrado')?.id || '',
            }));
          }
        } else {
          setVentaPrincipalData(prev => ({
            ...prev,
            clienteId: clientesList.find(c => c.id === 'cliente-no-registrado')?.id || '',
          }));
        }

      } catch (err) {
        console.error("Error al cargar datos:", err);
        setError("Error al cargar los datos: " + err.message);
      } finally {
        setLoadingData(false);
      }
    };

    if (router.isReady) {
      fetchData();
    }
  }, [user, router.isReady, activeSale]);

  // Búsqueda de productos mejorada (estilo cotizaciones)
  const searchProducts = async (searchTerm) => {
    if (!searchTerm.trim()) {
      setFilteredProductos([]);
      return;
    }

    setIsSearching(true);
    try {
      const searchTermLower = searchTerm.toLowerCase();
      
      const filtered = products.filter(producto => {
        const nombre = (producto.nombre || '').toLowerCase();
        const marca = (producto.marca || '').toLowerCase();
        const codigoTienda = (producto.codigoTienda || '').toLowerCase();
        const codigoProveedor = (producto.codigoProveedor || '').toLowerCase();
        const descripcion = (producto.descripcion || '').toLowerCase();
        const modelosCompatiblesIds = (producto.modelosCompatiblesIds || []).join(' ').toLowerCase();
        const modelosCompatiblesTexto = (producto.modelosCompatiblesTexto || '').toLowerCase();

        return nombre.includes(searchTermLower) ||
              marca.includes(searchTermLower) ||
              codigoTienda.includes(searchTermLower) ||
              codigoProveedor.includes(searchTermLower) ||
              descripcion.includes(searchTermLower) ||
              modelosCompatiblesIds.includes(searchTermLower) ||
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

  // Función corregida para obtener el precio de compra FIFO real
const obtenerPrecioCompraFIFO = async (productoId) => {
  try {
    // Buscar el primer lote disponible en la colección principal 'lotes'
    const lotesQuery = query(
      collection(db, 'lotes'), // Colección principal, no subcolección
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

  // Función corregida para consumir stock de lotes según FIFO
const consumirStockFIFO = async (productoId, cantidadVendida, transaction) => {
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
    let cantidadPendiente = cantidadVendida;
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

  // Actualizar el total cuando cambian los items
  useEffect(() => {
    const total = itemsVenta.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0);
    setPaymentData(prev => ({
      ...prev,
      totalAmount: total,
      paymentMethods: prev.isMixedPayment 
        ? prev.paymentMethods 
        : [{ ...prev.paymentMethods[0], amount: total }]
    }));
  }, [itemsVenta]);

  const handleVentaPrincipalChange = (e) => {
    const { name, value } = e.target;
    setVentaPrincipalData(prev => ({ ...prev, [name]: value }));
  };

  // Abrir modal de cantidad para agregar producto
  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setPrecioVenta(parseFloat(product.precioVentaDefault || 0));
    setQuantity(1);
    setShowQuantityModal(true);
    setSearchTerm(''); // Limpiar búsqueda
  };

  // Agregar producto a la venta
  // Función mejorada para agregar producto con separación automática por lotes
const handleAddProductToVenta = async () => {
  if (!selectedProduct) return;

  const exists = itemsVenta.some(item => item.productoId === selectedProduct.id);
  if (exists) {
    alert('Este producto ya ha sido añadido a la venta. Edite la cantidad en la tabla.');
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

    // AGREGAR TODOS LOS ITEMS SEPARADOS
    setItemsVenta(prev => [...prev, ...itemsSeparados]);
    setShowQuantityModal(false);
    setError(null);
  } catch (err) {
    console.error("Error al crear items por lote:", err);
    setError("Error al calcular la distribución por lotes. Intente de nuevo.");
  }
};

// Nueva función para obtener lotes disponibles ordenados por FIFO
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

// Nueva función para crear items separados automáticamente por lote
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
      id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${contadorItem}`,
      productoId: producto.id,
      nombreProducto: producto.nombre,
      marca: producto.marca || '',
      medida: producto.medida || '',
      codigoTienda: producto.codigoTienda || '',
      codigoProveedor: producto.codigoProveedor || '',
      color: producto.color || '',
      cantidad: cantidadDelLote,
      precioCompraDefault: parseFloat(producto.precioCompraDefault || lote.precioCompraUnitario || 0).toFixed(2),
      precioVentaMinimo: parseFloat(producto.precioVentaMinimo || 0).toFixed(2),
      precioVentaUnitario: precioVenta.toFixed(2),
      subtotal: (cantidadDelLote * precioVenta).toFixed(2),
      // DATOS DEL LOTE ESPECÍFICO
      loteId: lote.id,
      numeroLote: lote.numeroLote,
      precioCompraUnitario: lote.precioCompraUnitario,
      gananciaUnitaria: gananciaUnitaria,
      gananciaTotal: gananciaTotal,
      // IDENTIFICADOR PARA DEVOLUCIONES
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

  // Abrir modal de edición
  const handleEditItem = (item) => {
    setEditingItem(item);
    setEditQuantity(item.cantidad);
    setEditPrecio(parseFloat(item.precioVentaUnitario || 0));
    setShowEditItemModal(true);
  };

  // Actualizar item
  // Actualizar item de venta - VERSIÓN CON PRECIO FIFO REAL
  const handleUpdateItem = async () => {
    if (!editingItem) return;

    try {
      // OBTENER PRECIO DE COMPRA FIFO ACTUALIZADO
      const precioCompraFIFO = await obtenerPrecioCompraFIFO(editingItem.productoId);
      
      // CALCULAR NUEVA GANANCIA CON PRECIO FIFO REAL
      const nuevaGananciaUnitaria = editPrecio - precioCompraFIFO;
      const nuevaGananciaTotal = editQuantity * nuevaGananciaUnitaria;

      const newItems = [...itemsVenta];
      const index = newItems.findIndex(item => item.id === editingItem.id);
      
      if (index !== -1) {
        newItems[index] = {
          ...newItems[index],
          cantidad: editQuantity,
          precioVentaUnitario: editPrecio.toFixed(2),
          subtotal: (editQuantity * editPrecio).toFixed(2),
           precioCompraDefault: precioCompraFIFO.toFixed(2), // PARA LA TABLA
        precioVentaMinimo: parseFloat(productoOriginal?.precioVentaMinimo || 0).toFixed(2), // PARA LA TABLA
          // ACTUALIZAR CON PRECIO FIFO REAL
          precioCompraUnitario: precioCompraFIFO, // PRECIO FIFO REAL ACTUALIZADO
          gananciaUnitaria: nuevaGananciaUnitaria, // GANANCIA REAL
          gananciaTotal: nuevaGananciaTotal, // GANANCIA TOTAL REAL
        };
        setItemsVenta(newItems);
      }
      
      setShowEditItemModal(false);
    } catch (err) {
      console.error("Error al actualizar precio FIFO:", err);
      setError("Error al actualizar el precio de compra. Intente de nuevo.");
    }
  };

  const removeItem = (index) => {
    if (window.confirm('¿Está seguro de que desea eliminar este producto de la venta?')) {
      setItemsVenta(prevItems => prevItems.filter((_, i) => i !== index));
    }
  };

  const handlePaymentConfirm = (newPaymentData) => {
    setPaymentData(newPaymentData);
    setShowPaymentModal(false);
  };

  const openPaymentModal = () => {
    const total = itemsVenta.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0);
    if (total <= 0) {
      setError('Debe añadir al menos un producto antes de configurar el pago.');
      return;
    }
    setShowPaymentModal(true);
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

const handleSubmit = async (e) => {
  e.preventDefault();
  setSaving(true);
  setError(null);

  // Validaciones previas
  const clienteSeleccionado = clientes.find(c => c.id === ventaPrincipalData.clienteId);
  if (!clienteSeleccionado) {
    setError('Por favor, seleccione un cliente válido.');
    setSaving(false);
    return;
  }

  if (itemsVenta.length === 0) {
    setError('Debe añadir al menos un producto a la venta.');
    setSaving(false);
    return;
  }

  const validItems = itemsVenta.every(item => {
    const cantidad = parseFloat(item.cantidad);
    const precio = parseFloat(item.precioVentaUnitario);
    return (
      item.productoId &&
      !isNaN(cantidad) && cantidad > 0 &&
      !isNaN(precio) && precio >= 0 &&
      item.loteId // VALIDAR QUE TENGA LOTE ASIGNADO
    );
  });

  if (!validItems) {
    setError('Por favor, asegúrese de que todos los ítems tengan un producto, cantidad (>0), precio de venta (>=0) y lote asignado válidos.');
    setSaving(false);
    return;
  }

  const totalVenta = itemsVenta.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0);
  const totalPagado = paymentData.paymentMethods.reduce((sum, pm) => sum + pm.amount, 0);
  
  if (Math.abs(totalVenta - totalPagado) > 0.01) {
    setError('El total del pago no coincide con el total de la venta. Por favor, configure el pago correctamente.');
    setSaving(false);
    return;
  }

  try {
    await runTransaction(db, async (transaction) => {
      // ========== PHASE 1: TODOS LOS READS PRIMERO ==========
      
      // 1.1 Leer todos los lotes que se van a consumir
      const lotesRefs = itemsVenta.map(item => doc(db, 'lotes', item.loteId));
      const lotesSnaps = await Promise.all(lotesRefs.map(ref => transaction.get(ref)));
      
      // 1.2 Leer todos los productos que se van a actualizar
      const productosUnicos = [...new Set(itemsVenta.map(item => item.productoId))];
      const productRefs = productosUnicos.map(id => doc(db, 'productos', id));
      const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
      
      // 1.3 Pre-leer los próximos lotes FIFO para cada producto (para recalcular precios)
      const proximosLotesPorProducto = new Map();
      for (const productoId of productosUnicos) {
        // Simular el consumo para saber qué lotes quedarán disponibles
        const lotesActuales = await obtenerLotesDisponiblesFIFOParaSimulacion(productoId);
        const cantidadTotalConsumida = itemsVenta
          .filter(item => item.productoId === productoId)
          .reduce((sum, item) => sum + item.cantidad, 0);
        
        const proximoLoteDisponible = simularConsumoYObtenerProximoLote(lotesActuales, cantidadTotalConsumida);
        proximosLotesPorProducto.set(productoId, proximoLoteDisponible);
      }

      // 1.4 Leer venta existente si es actualización
      let existingSaleSnap = null;
      if (ventaPrincipalData.id) {
        const saleDocRef = doc(db, 'ventas', ventaPrincipalData.id);
        existingSaleSnap = await transaction.get(saleDocRef);
      }

      // ========== PHASE 2: VALIDACIONES CON DATOS LEÍDOS ==========
      
      // Validar lotes
      const productosAfectados = new Map();
      for (let i = 0; i < itemsVenta.length; i++) {
        const item = itemsVenta[i];
        const loteSnap = lotesSnaps[i];
        
        if (!loteSnap.exists()) {
          throw new Error(`Lote ${item.numeroLote || item.loteId} no encontrado`);
        }

        const loteData = loteSnap.data();
        const nuevoStockLote = loteData.stockRestante - item.cantidad;
        
        if (nuevoStockLote < 0) {
          throw new Error(`Stock insuficiente en lote ${item.numeroLote || item.loteId}. Disponible: ${loteData.stockRestante}, Solicitado: ${item.cantidad}`);
        }

        // Acumular cantidades por producto
        if (!productosAfectados.has(item.productoId)) {
          productosAfectados.set(item.productoId, 0);
        }
        productosAfectados.set(item.productoId, 
          productosAfectados.get(item.productoId) + item.cantidad
        );
      }

      // Validar productos
      for (let i = 0; i < productosUnicos.length; i++) {
        const productSnap = productSnaps[i];
        const productoId = productosUnicos[i];
        
        if (!productSnap.exists()) {
          throw new Error(`Producto ${productoId} no encontrado`);
        }

        const currentStock = productSnap.data().stockActual || 0;
        const cantidadVendida = productosAfectados.get(productoId);
        
        if (currentStock < cantidadVendida) {
          throw new Error(`Stock insuficiente para producto ${productoId}. Stock actual: ${currentStock}, Cantidad solicitada: ${cantidadVendida}`);
        }
      }

      // ========== PHASE 3: TODOS LOS WRITES ==========
      
      // 3.1 Calcular ganancia total
      const gananciaTotalVenta = itemsVenta.reduce((sum, item) => sum + (parseFloat(item.gananciaTotal) || 0), 0);

      // 3.2 Crear o actualizar venta principal
      let ventaRef;
      const saleData = {
        numeroVenta: ventaPrincipalData.numeroVenta.trim() || `V-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        clienteId: ventaPrincipalData.clienteId,
        clienteNombre: clienteSeleccionado.nombre + (clienteSeleccionado.apellido ? ' ' + clienteSeleccionado.apellido : ''),
        clienteDNI: clienteSeleccionado.dni || clienteSeleccionado.numeroDocumento || null,
        observaciones: ventaPrincipalData.observaciones.trim() || null,
        totalVenta: parseFloat(totalVenta.toFixed(2)),
        gananciaTotalVenta: parseFloat(gananciaTotalVenta.toFixed(2)),
        fechaVenta: serverTimestamp(),
        empleadoId: user.email || user.uid,
        estado: 'completada',
        tipoVenta: 'ventaDirecta',
        paymentData: paymentData,
        metodoPago: paymentData.isMixedPayment ? 'mixto' : paymentData.paymentMethods[0].method,
        updatedAt: serverTimestamp(),
      };

      if (ventaPrincipalData.id && existingSaleSnap && existingSaleSnap.exists()) {
        ventaRef = doc(db, 'ventas', ventaPrincipalData.id);
        transaction.update(ventaRef, saleData);
      } else {
        ventaRef = doc(collection(db, 'ventas'));
        transaction.set(ventaRef, {
          ...saleData,
          createdAt: serverTimestamp(),
        });
      }

      // 3.3 Actualizar lotes
      for (let i = 0; i < itemsVenta.length; i++) {
        const item = itemsVenta[i];
        const loteRef = lotesRefs[i];
        const loteSnap = lotesSnaps[i];
        const loteData = loteSnap.data();
        
        const nuevoStockLote = loteData.stockRestante - item.cantidad;
        
        transaction.update(loteRef, {
          stockRestante: nuevoStockLote,
          estado: nuevoStockLote <= 0 ? 'agotado' : 'activo',
          updatedAt: serverTimestamp()
        });

        // Crear movimiento de lote para auditoría
        const movimientoRef = doc(collection(db, 'movimientosLotes'));
        transaction.set(movimientoRef, {
          ventaId: ventaRef.id,
          productoId: item.productoId,
          nombreProducto: item.nombreProducto,
          loteId: item.loteId,
          numeroLote: item.numeroLote,
          cantidadConsumida: item.cantidad,
          precioCompraUnitario: item.precioCompraUnitario,
          stockRestanteLote: nuevoStockLote,
          tipoMovimiento: 'venta',
          fechaMovimiento: serverTimestamp(),
          empleadoId: user.email || user.uid,
          createdAt: serverTimestamp()
        });
      }

      // 3.4 Actualizar productos con nuevos precios FIFO
      for (let i = 0; i < productosUnicos.length; i++) {
        const productoId = productosUnicos[i];
        const productRef = productRefs[i];
        const productSnap = productSnaps[i];
        const cantidadVendida = productosAfectados.get(productoId);
        
        const currentStock = productSnap.data().stockActual || 0;
        const newStock = currentStock - cantidadVendida;
        
        // Usar el precio pre-calculado
        const nuevoPrecioCompra = proximosLotesPorProducto.get(productoId) || 0;
        
        transaction.update(productRef, {
          stockActual: newStock,
          precioCompraDefault: nuevoPrecioCompra,
          updatedAt: serverTimestamp()
        });
      }

      // 3.5 Guardar items de la venta
      for (const item of itemsVenta) {
        const itemData = {
          productoId: item.productoId,
          nombreProducto: item.nombreProducto,
          marca: item.marca || '',
          medida: item.medida || '',
          codigoProveedor: item.codigoProveedor || '',
          codigoTienda: item.codigoTienda || '',
          color: item.color || '',
          cantidad: parseFloat(item.cantidad),
          precioVentaUnitario: parseFloat(item.precioVentaUnitario),
          subtotal: parseFloat(item.subtotal),
          // DATOS DEL LOTE ESPECÍFICO PARA DEVOLUCIONES
          loteId: item.loteId,
          numeroLote: item.numeroLote,
          precioCompraUnitario: parseFloat(item.precioCompraUnitario),
          gananciaUnitaria: parseFloat(item.gananciaUnitaria),
          gananciaTotal: parseFloat(item.gananciaTotal),
          loteOriginal: item.loteOriginal,
          updatedAt: serverTimestamp(),
        };

        if (item.id && item.id.startsWith('temp-')) {
          const newItemRef = doc(collection(ventaRef, 'itemsVenta'));
          transaction.set(newItemRef, {
            ...itemData,
            createdAt: serverTimestamp(),
          });
        } else if (item.id && existingSaleSnap && existingSaleSnap.exists()) {
          const itemDocRef = doc(ventaRef, 'itemsVenta', item.id);
          transaction.update(itemDocRef, itemData);
        } else {
          const newItemRef = doc(collection(ventaRef, 'itemsVenta'));
          transaction.set(newItemRef, {
            ...itemData,
            createdAt: serverTimestamp(),
          });
        }
      }

      // 3.6 Crear registros de pagos
      if (paymentData.isMixedPayment) {
        for (const paymentMethod of paymentData.paymentMethods) {
          if (paymentMethod.amount > 0) {
            const paymentRef = doc(collection(db, 'pagos'));
            transaction.set(paymentRef, {
              ventaId: ventaRef.id,
              numeroVenta: saleData.numeroVenta,
              metodoPago: paymentMethod.method,
              monto: paymentMethod.amount,
              clienteId: ventaPrincipalData.clienteId,
              clienteNombre: clienteSeleccionado.nombre + (clienteSeleccionado.apellido ? ' ' + clienteSeleccionado.apellido : ''),
              empleadoId: user.email || user.uid,
              fechaPago: serverTimestamp(),
              estado: 'completado',
              tipo: 'venta',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      } else {
        const paymentRef = doc(collection(db, 'pagos'));
        transaction.set(paymentRef, {
          ventaId: ventaRef.id,
          numeroVenta: saleData.numeroVenta,
          metodoPago: paymentData.paymentMethods[0].method,
          monto: paymentData.paymentMethods[0].amount,
          clienteId: ventaPrincipalData.clienteId,
          clienteNombre: clienteSeleccionado.nombre + (clienteSeleccionado.apellido ? ' ' + clienteSeleccionado.apellido : ''),
          empleadoId: user.email || user.uid,
          fechaPago: serverTimestamp(),
          estado: 'completado',
          tipo: 'venta',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });

    alert('Venta registrada con éxito. Productos separados automáticamente por lotes FIFO.');
    clearActiveSale();
    router.push('/ventas');

  } catch (err) {
    console.error("Error al registrar venta:", err);
    setError("Error al registrar la venta. " + (err.code === 'permission-denied' ? 'No tiene permisos para realizar esta acción. Contacte al administrador.' : err.message));
  } finally {
    setSaving(false);
  }
};

// Funciones auxiliares necesarias
const obtenerLotesDisponiblesFIFOParaSimulacion = async (productoId) => {
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
};

const simularConsumoYObtenerProximoLote = (lotes, cantidadAConsumir) => {
  let cantidadPendiente = cantidadAConsumir;
  
  for (const lote of lotes) {
    if (cantidadPendiente <= 0) {
      return parseFloat(lote.precioCompraUnitario || 0);
    }
    
    const consumir = Math.min(cantidadPendiente, lote.stockRestante);
    cantidadPendiente -= consumir;
    
    // Si este lote no se agota completamente, será el próximo disponible
    if (consumir < lote.stockRestante) {
      return parseFloat(lote.precioCompraUnitario || 0);
    }
  }
  
  return 0; // No hay más lotes disponibles
};



  const totalGeneralVenta = itemsVenta.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0).toFixed(2);

  if (!router.isReady || !user || loadingData) {
    return (
      <Layout title="Cargando Formulario de Venta">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Registrar Nueva Venta Directa">
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-full mx-auto px-6 sm:px-8 lg:px-12">
          {error && (
            <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50">
              {error}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-6 p-6">
              
              {/* Panel Izquierdo - Información de la Venta */}
              <div className="col-span-12 lg:col-span-3">
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">Nueva Venta Directa</h2>
                    <button
                      onClick={() => {
                        if (activeSale && window.confirm('¿Desea descartar la venta en progreso y volver a la lista de ventas?')) {
                          clearActiveSale();
                          router.push('/ventas');
                        } else if (!activeSale) {
                          router.push('/ventas');
                        }
                      }}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <ArrowLeftIcon className="h-4 w-4 mr-1" />
                      Volver
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Número de Venta */}
                    <div>
                      <label htmlFor="numeroVenta" className="block text-sm font-medium text-gray-700 mb-2">
                        Número de Venta (Opcional)
                      </label>
                      <input
                        type="text"
                        name="numeroVenta"
                        id="numeroVenta"
                        value={ventaPrincipalData.numeroVenta}
                        onChange={handleVentaPrincipalChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Se autogenerará si está vacío"
                      />
                    </div>

                    {/* Cliente */}
                    <div>
                      <label htmlFor="clienteId" className="block text-sm font-medium text-gray-700 mb-2">
                        Cliente
                      </label>
                      <select
                        id="clienteId"
                        name="clienteId"
                        value={ventaPrincipalData.clienteId}
                        onChange={handleVentaPrincipalChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="">Seleccione un cliente</option>
                        {clientes.map((cli) => (
                          cli.id && (
                            <option key={cli.id} value={cli.id}>
                              {cli.nombre} {cli.apellido} ({cli.dni || cli.numeroDocumento || 'N/A'})
                            </option>
                          )
                        ))}
                      </select>
                    </div>

                    {/* Observaciones */}
                    <div>
                      <label htmlFor="observaciones" className="block text-sm font-medium text-gray-700 mb-2">
                        Observaciones (Opcional)
                      </label>
                      <textarea
                        id="observaciones"
                        name="observaciones"
                        rows="3"
                        value={ventaPrincipalData.observaciones}
                        onChange={handleVentaPrincipalChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Notas adicionales sobre esta venta..."
                      />
                    </div>

                    {/* Configuración de Pago */}
                    <div className="border-t border-gray-200 pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-md font-semibold text-gray-800">Pago</h3>
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
                          <span className="text-lg font-bold text-gray-900">S/. {totalGeneralVenta}</span>
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

                    {/* Botón Submit */}
                    <div className="pt-4">
                      <button
                        type="submit"
                        disabled={saving || itemsVenta.length === 0 || !ventaPrincipalData.clienteId}
                        className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent text-base font-semibold rounded-lg shadow-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                            </svg>
                            Registrando...
                          </>
                        ) : (
                          <>
                            <ShoppingCartIcon className="h-5 w-5 mr-2" />
                            Registrar Venta
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
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
                        className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      {isSearching && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
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

                {/* Items de la Venta */}
                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-800">
                      Items de la Venta
                    </h3>
                  </div>

                  <div className="p-4">
                    {itemsVenta.length === 0 ? (
                      <div className="text-center py-12">
                        <ShoppingCartIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <h4 className="text-lg font-medium text-gray-600 mb-2">No hay productos en esta venta</h4>
                        <p className="text-gray-500">Usa el buscador arriba para encontrar y agregar productos</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead className="bg-green-50">
                              <tr className="border-b border-gray-300">
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">C. TIENDA</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">PRODUCTO</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">C. PROVEEDOR</th>
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
                            
                            <tbody>
                              {itemsVenta.map((item, index) => (
                                <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm text-gray-900 font-medium">
                                      {item.codigoTienda || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="font-medium text-gray-900 text-sm">
                                      {item.nombreProducto}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="font-medium text-gray-900 text-sm">
                                      {item.codigoProveedor}
                                    </div>
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
                                    <span className="text-sm text-gray-700">
                                      {item.color || 'N/A'}
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
                                  <td className="px-3 py-3 text-center">
                                    <div className="flex justify-center space-x-2">
                                      <button
                                        type="button"
                                        onClick={() => handleEditItem(item)}
                                        className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors"
                                        title="Editar"
                                      >
                                        <PencilIcon className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeItem(index)}
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
                        <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-4 border-t border-gray-300">
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="text-lg font-semibold">Total de la Venta</h3>
                              <p className="text-green-100 text-sm">{itemsVenta.length} producto{itemsVenta.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl font-bold">
                                S/. {totalGeneralVenta}
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

      {/* Modal de Cantidad */}
      {showQuantityModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowQuantityModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
              <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                <button
                  type="button"
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  onClick={() => setShowQuantityModal(false)}
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                  <ShoppingCartIcon className="h-6 w-6 text-green-600" />
                </div>
                <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                  <h3 className="text-xl font-semibold leading-6 text-gray-900 mb-4">
                    Agregar Producto a Venta
                  </h3>
                  
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
                        
                        {/* Mostrar precio de venta mínimo */}
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
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
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
                                : 'border-gray-300 focus:ring-green-500'
                            }`}
                          />
                          {precioVenta < parseFloat(selectedProduct.precioVentaMinimo || 0) && (
                            <p className="text-red-600 text-sm mt-1 font-medium">
                              ⚠️ Precio por debajo del mínimo permitido
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="bg-gradient-to-r from-green-50 to-green-100 p-6 rounded-lg border border-green-200 mt-6">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-medium text-gray-700">Subtotal:</span>
                          <span className="font-bold text-green-800 text-2xl">S/. {(quantity * precioVenta).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 sm:flex sm:flex-row-reverse gap-3">
                <button
                  type="button"
                  className="inline-flex w-full justify-center rounded-md bg-green-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-500 sm:w-auto disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  onClick={handleAddProductToVenta}
                  disabled={quantity <= 0 || precioVenta <= 0}
                >
                  Agregar a Venta
                </button>
                <button
                  type="button"
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-6 py-3 text-base font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto transition-colors"
                  onClick={() => setShowQuantityModal(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Edición */}
      {showEditItemModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowEditItemModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
              <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                <button
                  type="button"
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  onClick={() => setShowEditItemModal(false)}
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-yellow-100 sm:mx-0 sm:h-10 sm:w-10">
                  <PencilIcon className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                  <h3 className="text-xl font-semibold leading-6 text-gray-900 mb-4">
                    Editar Producto
                  </h3>
                  
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
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
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
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
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

              <div className="mt-6 sm:flex sm:flex-row-reverse gap-3">
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
            </div>
          </div>
        </div>
      )}

      {/* Mixed Payment Modal */}
      <MixedPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        totalAmount={parseFloat(totalGeneralVenta)}
        onPaymentConfirm={handlePaymentConfirm}
        initialPaymentMethod={paymentData.paymentMethods[0]?.method || 'efectivo'}
      />
    </Layout>
  );
};

export default NuevaVentaPage;