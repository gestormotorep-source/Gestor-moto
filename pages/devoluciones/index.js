import { useState, useEffect } from 'react';
  import { useRouter } from 'next/router';
  import { useAuth } from '../../contexts/AuthContext';
  import Layout from '../../components/Layout';
  import { db } from '../../lib/firebase';
  import DatePicker from 'react-datepicker';
  import "react-datepicker/dist/react-datepicker.css";
  import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    serverTimestamp,
    getDoc,
    where,
    getDocs,
    runTransaction,
    limit
  } from 'firebase/firestore';
  import {
    ArrowLeftIcon,
    PlusIcon,
    MagnifyingGlassIcon,
    EyeIcon,
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
    XMarkIcon, 
    CurrencyDollarIcon,
    FunnelIcon,
    ExclamationTriangleIcon,
    ChevronLeftIcon,
    ChevronRightIcon
  } from '@heroicons/react/24/outline';

  const DevolucionesIndexPage = () => {
    const { user } = useAuth();
    const router = useRouter();

    const [devoluciones, setDevoluciones] = useState([]);
    const [filteredDevoluciones, setFilteredDevoluciones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Estados para filtros
    const [filterPeriod, setFilterPeriod] = useState('all');
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [limitPerPage, setLimitPerPage] = useState(20);
    const [selectedEstado, setSelectedEstado] = useState('all');
    const [selectedMotivo, setSelectedMotivo] = useState('all');

    // Estados para paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [devolucionesPerPage] = useState(10);

    // Cálculos de paginación
    const indexOfLastDevolucion = currentPage * devolucionesPerPage;
    const indexOfFirstDevolucion = indexOfLastDevolucion - devolucionesPerPage;
    const currentDevoluciones = filteredDevoluciones.slice(indexOfFirstDevolucion, indexOfLastDevolucion);
    const totalPages = Math.ceil(filteredDevoluciones.length / devolucionesPerPage);

    // Funciones de paginación
    const goToNextPage = () => {
      setCurrentPage((prev) => Math.min(prev + 1, totalPages));
    };

    const goToPrevPage = () => {
      setCurrentPage((prev) => Math.max(prev - 1, 1));
    };

    useEffect(() => {
      if (!user) {
        router.push('/auth');
        return;
      }

      setLoading(true);
      setError(null);

      const q = query(collection(db, 'devoluciones'), orderBy('fechaSolicitud', 'desc'));
      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const devolucionesList = [];

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          
          // Obtener información de la venta relacionada
          let ventaData = null;
          if (data.ventaId) {
            try {
              const ventaDoc = await getDoc(doc(db, 'ventas', data.ventaId));
              if (ventaDoc.exists()) {
                ventaData = ventaDoc.data();
              }
            } catch (err) {
              console.warn(`Error al obtener venta ${data.ventaId}:`, err);
            }
          }

          const devolucionData = {
            id: docSnap.id,
            ...data,
            fechaSolicitud: data.fechaSolicitud?.toDate ? data.fechaSolicitud.toDate() : new Date(),
            fechaSolicitudFormatted: data.fechaSolicitud?.toDate ? 
              data.fechaSolicitud.toDate().toLocaleDateString('es-ES') : 'N/A',
            fechaProcesamiento: data.fechaProcesamiento?.toDate ? data.fechaProcesamiento.toDate() : null,
            fechaProcesamientoFormatted: data.fechaProcesamiento?.toDate ? 
              data.fechaProcesamiento.toDate().toLocaleDateString('es-ES') : null,
            // Datos de la venta relacionada
            numeroVentaOriginal: ventaData?.numeroVenta || data.numeroVenta || 'N/A',
            clienteNombre: ventaData?.clienteNombre || data.clienteNombre || 'Cliente no encontrado',
            totalVentaOriginal: ventaData?.totalVenta || 0
          };

          devolucionesList.push(devolucionData);
        }

        setDevoluciones(devolucionesList);
        setLoading(false);
      }, (err) => {
        console.error("Error fetching devoluciones:", err);
        setError("Error al cargar las devoluciones: " + err.message);
        setLoading(false);
      });

      return () => unsubscribe();
    }, [user, router]);

    // Función para manejar cambios en filtros de período
    const handleFilterChange = (period) => {
      setFilterPeriod(period);
      const today = new Date();
      
      switch (period) {
        case 'day':
          setStartDate(new Date(today.setHours(0, 0, 0, 0)));
          setEndDate(new Date(today.setHours(23, 59, 59, 999)));
          break;
        case 'week':
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          setStartDate(startOfWeek);
          setEndDate(new Date());
          break;
        case 'month':
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          setStartDate(startOfMonth);
          setEndDate(new Date());
          break;
        case 'all':
        default:
          setStartDate(null);
          setEndDate(null);
          break;
      }
    };

    // Función para filtrar devoluciones
    useEffect(() => {
      let filtered = [...devoluciones];

      // Filtro por término de búsqueda
      if (searchTerm) {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        filtered = filtered.filter(devolucion => {
          const numeroDevolucionMatch = devolucion.numeroDevolucion && typeof devolucion.numeroDevolucion === 'string'
            ? devolucion.numeroDevolucion.toLowerCase().includes(lowerCaseSearchTerm)
            : false;

          const numeroVentaMatch = devolucion.numeroVentaOriginal && typeof devolucion.numeroVentaOriginal === 'string'
            ? devolucion.numeroVentaOriginal.toLowerCase().includes(lowerCaseSearchTerm)
            : false;

          const clienteMatch = devolucion.clienteNombre && typeof devolucion.clienteNombre === 'string'
            ? devolucion.clienteNombre.toLowerCase().includes(lowerCaseSearchTerm)
            : false;

          const motivoMatch = devolucion.motivo && typeof devolucion.motivo === 'string'
            ? devolucion.motivo.toLowerCase().includes(lowerCaseSearchTerm)
            : false;

          return numeroDevolucionMatch || numeroVentaMatch || clienteMatch || motivoMatch;
        });
      }

      // Filtro por fecha
      if (startDate && endDate) {
        filtered = filtered.filter(devolucion => {
          const fechaSolicitud = devolucion.fechaSolicitud;
          if (!fechaSolicitud) return false;
          
          const devolucionDate = new Date(fechaSolicitud);
          const start = new Date(startDate);
          const end = new Date(endDate);
          
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          devolucionDate.setHours(12, 0, 0, 0);
          
          return devolucionDate >= start && devolucionDate <= end;
        });
      }

      // Filtro por estado
      if (selectedEstado !== 'all') {
        filtered = filtered.filter(devolucion => devolucion.estado === selectedEstado);
      }

      // Filtro por motivo
      if (selectedMotivo !== 'all') {
        filtered = filtered.filter(devolucion => devolucion.motivo === selectedMotivo);
      }

      setFilteredDevoluciones(filtered);
      // Reset página al cambiar los filtros
      setCurrentPage(1);
    }, [searchTerm, devoluciones, startDate, endDate, selectedEstado, selectedMotivo, limitPerPage]);

    const handleViewDetails = (id) => {
      router.push(`/devoluciones/${id}`);
    };


const obtenerLoteOriginalDeItem = async (ventaId, itemVentaId) => {
  try {
    const itemRef = doc(db, 'ventas', ventaId, 'itemsVenta', itemVentaId);
    const itemSnap = await getDoc(itemRef);
    
    if (!itemSnap.exists()) {
      throw new Error('Item de venta no encontrado');
    }
    
    const itemData = itemSnap.data();
    
    // Verificar si tiene información del lote original
    if (itemData.loteId) {
      return {
        loteId: itemData.loteId,
        numeroLote: itemData.numeroLote,
        precioCompraUnitario: itemData.precioCompraUnitario,
        loteOriginal: itemData.loteOriginal
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error al obtener lote original del item:', error);
    throw error;
  }
};

// Función corregida para devolver stock al lote original específico
const devolverStockALoteOriginal = async (loteId, cantidadADevolver, transaction) => {
  try {
    console.log(`🔍 DEBUGGING - Devolviendo al lote: ${loteId}, cantidad: ${cantidadADevolver}`);
    
    const loteRef = doc(db, 'lotes', loteId);
    const loteSnap = await transaction.get(loteRef);
    
    if (!loteSnap.exists()) {
      throw new Error(`Lote original ${loteId} no encontrado`);
    }
    
    const loteData = loteSnap.data();
    
    // DEBUGGING: Mostrar datos del lote
    console.log(`📊 DATOS DEL LOTE ${loteData.numeroLote}:`, {
      stockOriginal: loteData.stockOriginal || loteData.cantidad,
      stockRestante: loteData.stockRestante,
      cantidadInicial: loteData.cantidadInicial,
      cantidadOriginal: loteData.cantidad,
      rawData: loteData
    });
    
    // CORRECCIÓN 1: Usar exactamente los campos que tienes en tu BD
    // Basado en tus imágenes, usas 'cantidad' y 'stockRestante'
    const stockOriginal = parseInt(loteData.cantidad || 0); // Campo correcto según tu BD
    const stockActual = parseInt(loteData.stockRestante || 0); // Campo correcto según tu BD
    const cantidadDevolver = parseInt(cantidadADevolver);
    
    console.log(`🔢 VALORES CONVERTIDOS:`, {
      stockOriginal,
      stockActual,
      cantidadDevolver,
      stockOriginalType: typeof stockOriginal,
      stockActualType: typeof stockActual
    });
    
    // CORRECCIÓN 2: Calcular espacio disponible correctamente
    const espacioDisponible = stockOriginal - stockActual;
    
    console.log(`📏 CÁLCULO DE ESPACIO:`, {
      formula: `${stockOriginal} - ${stockActual} = ${espacioDisponible}`,
      espacioDisponible,
      cantidadDevolver,
      puedeDevolver: espacioDisponible >= cantidadDevolver
    });
    
    // CORRECCIÓN 3: Validación más clara
    if (isNaN(stockOriginal) || isNaN(stockActual) || isNaN(cantidadDevolver)) {
      throw new Error(
        `❌ ERROR DE DATOS: Valores no numéricos detectados\n` +
        `Stock Original: ${stockOriginal} (${typeof stockOriginal})\n` +
        `Stock Actual: ${stockActual} (${typeof stockActual})\n` +
        `Cantidad a Devolver: ${cantidadDevolver} (${typeof cantidadDevolver})\n` +
        `Lote: ${loteData.numeroLote}`
      );
    }
    
    if (stockOriginal <= 0) {
      throw new Error(
        `❌ ERROR DE CONFIGURACIÓN: El lote ${loteData.numeroLote} no tiene stock original válido (${stockOriginal})`
      );
    }
    
    if (espacioDisponible < cantidadDevolver) {
      throw new Error(
        `❌ LOTE ORIGINAL SIN ESPACIO: ${loteData.numeroLote}\n` +
        `Stock Original: ${stockOriginal}\n` +
        `Stock Actual: ${stockActual}\n` +
        `Espacio disponible: ${espacioDisponible}\n` +
        `Cantidad a devolver: ${cantidadDevolver}\n\n` +
        `Fórmula: ${stockOriginal} - ${stockActual} = ${espacioDisponible}\n` +
        `¿Puede devolver?: ${espacioDisponible >= cantidadDevolver ? 'SÍ' : 'NO'}`
      );
    }
    
    const nuevoStock = stockActual + cantidadDevolver;
    
    // CORRECCIÓN 4: Validar que no exceda el stock original
    if (nuevoStock > stockOriginal) {
      throw new Error(
        `❌ ERROR DE CÁLCULO: El nuevo stock (${nuevoStock}) excedería el stock original (${stockOriginal})\n` +
        `Lote: ${loteData.numeroLote}`
      );
    }
    
    console.log(`✅ ACTUALIZANDO LOTE ${loteData.numeroLote}:`, {
      stockAnterior: stockActual,
      stockNuevo: nuevoStock,
      diferencia: cantidadDevolver
    });
    
    // Actualizar el lote original
    transaction.update(loteRef, {
      stockRestante: nuevoStock,
      estado: nuevoStock > 0 ? 'activo' : 'agotado',
      updatedAt: serverTimestamp()
    });
    
    return {
      loteId: loteId,
      numeroLote: loteData.numeroLote,
      cantidadDevuelta: cantidadDevolver,
      stockAnterior: stockActual,
      stockNuevo: nuevoStock,
      precioCompraUnitario: parseFloat(loteData.precioCompraUnitario || 0),
      espacioDisponibleAntes: espacioDisponible,
      stockOriginal: stockOriginal
    };
    
  } catch (error) {
    console.error(`❌ Error detallado en lote ${loteId}:`, error);
    throw error;
  }
};

// FUNCIÓN ADICIONAL: Verificar estructura de lotes en tu base de datos
const verificarEstructuraLote = async (loteId) => {
  try {
    const loteRef = doc(db, 'lotes', loteId);
    const loteSnap = await getDoc(loteRef);
    
    if (!loteSnap.exists()) {
      console.log(`❌ Lote ${loteId} no encontrado`);
      return;
    }
    
    const data = loteSnap.data();
    console.log(`🔍 ESTRUCTURA DEL LOTE ${loteId}:`, {
      numeroLote: data.numeroLote,
      camposDeStock: {
        cantidad: data.cantidad,
        cantidadInicial: data.cantidadInicial,
        cantidadOriginal: data.cantidadOriginal,
        stockOriginal: data.stockOriginal,
        stockRestante: data.stockRestante,
        stockActual: data.stockActual
      },
      todosLosCampos: Object.keys(data).sort(),
      valoresOriginales: data
    });
    
  } catch (error) {
    console.error('Error al verificar estructura:', error);
  }
};


const handleAprobarDevolucion = async (devolucionId) => {
  if (!window.confirm('¿Está seguro de que desea APROBAR esta devolución? Cada producto regresará a su lote original específico.')) {
    return;
  }

  try {
    await runTransaction(db, async (transaction) => {
      console.log('🚀 INICIANDO APROBACIÓN CON DEBUGGING DETALLADO:', devolucionId);
      
      // FASE 1: LECTURAS
      const devolucionRef = doc(db, 'devoluciones', devolucionId);
      const devolucionSnap = await transaction.get(devolucionRef);
      
      if (!devolucionSnap.exists()) {
        throw new Error('Devolución no encontrada');
      }
      
      const devolucionData = devolucionSnap.data();
      console.log('📄 DATOS DEVOLUCIÓN:', devolucionData);
      
      if (devolucionData.estado !== 'solicitada') {
        throw new Error('Solo se pueden aprobar devoluciones en estado "solicitada"');
      }

      // Leer items de devolución
      const itemsQuery = query(
        collection(db, 'devoluciones', devolucionId, 'itemsDevolucion'),
        orderBy('createdAt', 'asc')
      );
      const itemsSnapshot = await getDocs(itemsQuery);
      
      if (itemsSnapshot.empty) {
        throw new Error('No se encontraron items en esta devolución');
      }

      const itemsData = itemsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('🛍️ ITEMS A DEVOLVER:', itemsData);

      // OBTENER INFORMACIÓN DE LOTES ORIGINALES DESDE LA VENTA
      const ventaId = devolucionData.ventaId;
      console.log('🏪 VENTA ID:', ventaId);
      
      const itemsVentaQuery = query(
        collection(db, 'ventas', ventaId, 'itemsVenta'),
        orderBy('createdAt', 'asc')
      );
      const itemsVentaSnapshot = await getDocs(itemsVentaQuery);
      const itemsVentaData = itemsVentaSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('🛒 ITEMS VENTA ORIGINAL:', itemsVentaData);

      // Mapear items de devolución con sus lotes originales
      const itemsConLoteOriginal = [];
      
      for (const itemDevolucion of itemsData) {
        console.log(`🔍 PROCESANDO ITEM: ${itemDevolucion.nombreProducto}`);
        
        // Buscar el item correspondiente en la venta original
        const itemVentaCorrespondiente = itemsVentaData.find(itemVenta => 
          itemVenta.productoId === itemDevolucion.productoId &&
          itemVenta.nombreProducto === itemDevolucion.nombreProducto
        );
        
        console.log('📦 ITEM VENTA CORRESPONDIENTE:', itemVentaCorrespondiente);
        
        if (!itemVentaCorrespondiente) {
          throw new Error(`No se encontró el item original en la venta para: ${itemDevolucion.nombreProducto}`);
        }
        
        if (!itemVentaCorrespondiente.loteId) {
          throw new Error(`El item ${itemDevolucion.nombreProducto} no tiene información de lote original`);
        }
        
        // DEBUGGING CRÍTICO: Leer el lote original
        const loteOriginalRef = doc(db, 'lotes', itemVentaCorrespondiente.loteId);
        const loteOriginalSnap = await transaction.get(loteOriginalRef);
        
        if (!loteOriginalSnap.exists()) {
          throw new Error(`Lote original ${itemVentaCorrespondiente.loteId} no encontrado`);
        }
        
        const loteOriginalData = loteOriginalSnap.data();
        
        console.log(`🎯 LOTE ORIGINAL COMPLETO:`, {
          loteId: itemVentaCorrespondiente.loteId,
          numeroLote: loteOriginalData.numeroLote,
          todosLosCampos: loteOriginalData,
          camposDEStock: {
            cantidad: loteOriginalData.cantidad,
            stockRestante: loteOriginalData.stockRestante,
            stockOriginal: loteOriginalData.stockOriginal,
            stockActual: loteOriginalData.stockActual,
            cantidadInicial: loteOriginalData.cantidadInicial
          }
        });
        
        // CÁLCULO DEL ESPACIO DISPONIBLE CON DEBUGGING
        const stockOriginal = parseInt(loteOriginalData.cantidad || 0);
        const stockActual = parseInt(loteOriginalData.stockRestante || 0);
        const cantidadADevolver = parseFloat(itemDevolucion.cantidadADevolver || 0);
        const espacioDisponible = stockOriginal - stockActual;
        
        console.log(`📊 CÁLCULO DE ESPACIO DETALLADO:`, {
          producto: itemDevolucion.nombreProducto,
          lote: loteOriginalData.numeroLote,
          stockOriginal: stockOriginal,
          stockActual: stockActual,
          cantidadADevolver: cantidadADevolver,
          formula: `${stockOriginal} - ${stockActual} = ${espacioDisponible}`,
          espacioDisponible: espacioDisponible,
          puedeDevolver: espacioDisponible >= cantidadADevolver,
          razonError: espacioDisponible < cantidadADevolver ? 'ESPACIO INSUFICIENTE' : 'OK'
        });
        
        if (espacioDisponible < cantidadADevolver) {
          const errorDetails = {
            producto: itemDevolucion.nombreProducto,
            lote: loteOriginalData.numeroLote,
            loteId: itemVentaCorrespondiente.loteId,
            stockOriginal: stockOriginal,
            stockActual: stockActual,
            espacioDisponible: espacioDisponible,
            cantidadADevolver: cantidadADevolver,
            datosCompletosLote: loteOriginalData
          };
          
          console.error('❌ ERROR DETALLADO:', errorDetails);
          
          throw new Error(
            `❌ LOTE ORIGINAL SIN ESPACIO: ${itemDevolucion.nombreProducto}\n` +
            `Lote: ${loteOriginalData.numeroLote}\n` +
            `Stock Original: ${stockOriginal}\n` +
            `Stock Actual: ${stockActual}\n` +
            `Espacio disponible: ${espacioDisponible}\n` +
            `Cantidad a devolver: ${cantidadADevolver}\n\n` +
            `Revisa la consola para más detalles técnicos.`
          );
        }
        
        itemsConLoteOriginal.push({
          itemDevolucion: itemDevolucion,
          itemVentaOriginal: itemVentaCorrespondiente,
          loteOriginal: {
            id: itemVentaCorrespondiente.loteId,
            data: loteOriginalData
          }
        });
        
        console.log(`✅ ITEM VALIDADO CORRECTAMENTE: ${itemDevolucion.nombreProducto}`);
      }

      // Leer productos para actualizar stock
      const productosData = {};
      for (const item of itemsConLoteOriginal) {
        if (!productosData[item.itemDevolucion.productoId]) {
          const productRef = doc(db, 'productos', item.itemDevolucion.productoId);
          const productSnap = await transaction.get(productRef);
          productosData[item.itemDevolucion.productoId] = {
            ref: productRef,
            data: productSnap.exists() ? productSnap.data() : null
          };
        }
      }

      // FASE 2: ESCRITURAS
      console.log('✍️ FASE 2: Ejecutando devoluciones a lotes originales...');

      const todosLosMovimientos = [];

      for (const item of itemsConLoteOriginal) {
        const cantidadADevolver = parseFloat(item.itemDevolucion.cantidadADevolver || 0);
        const loteOriginalId = item.loteOriginal.id;
        const loteData = item.loteOriginal.data;
        
        console.log(`✍️ Devolviendo ${cantidadADevolver} unidades de ${item.itemDevolucion.nombreProducto} al lote original ${loteData.numeroLote}`);
        
        // DEVOLVER AL LOTE ORIGINAL ESPECÍFICO
        const stockActualLote = parseInt(loteData.stockRestante || 0);
        const nuevoStockLote = stockActualLote + cantidadADevolver;
        
        // Actualizar el lote
        const loteRef = doc(db, 'lotes', loteOriginalId);
        transaction.update(loteRef, {
          stockRestante: nuevoStockLote,
          estado: nuevoStockLote > 0 ? 'activo' : 'agotado',
          updatedAt: serverTimestamp()
        });
        
        console.log(`✍️ LOTE ACTUALIZADO: ${loteData.numeroLote} stock ${stockActualLote} -> ${nuevoStockLote}`);
        
        // Actualizar stock total del producto
        const productInfo = productosData[item.itemDevolucion.productoId];
        if (productInfo.data) {
          const currentStock = productInfo.data.stockActual || 0;
          const newStock = currentStock + cantidadADevolver;
          
          transaction.update(productInfo.ref, {
            stockActual: newStock,
            updatedAt: serverTimestamp()
          });
          
          console.log(`✍️ PRODUCTO ACTUALIZADO: ${item.itemDevolucion.nombreProducto} stock ${currentStock} -> ${newStock}`);
        }

        // Preparar auditoría
        todosLosMovimientos.push({
          productoId: item.itemDevolucion.productoId,
          nombreProducto: item.itemDevolucion.nombreProducto,
          movimiento: {
            loteId: loteOriginalId,
            numeroLote: loteData.numeroLote,
            cantidadDevuelta: cantidadADevolver,
            stockAnterior: stockActualLote,
            stockNuevo: nuevoStockLote,
            precioCompraUnitario: parseFloat(loteData.precioCompraUnitario || 0)
          },
          itemVentaOriginal: item.itemVentaOriginal,
          gananciaDevolucion: item.itemDevolucion.gananciaDevolucion || 0
        });
        
        console.log(`✅ DEVUELTO AL LOTE ORIGINAL: ${loteData.numeroLote}`);
      }

      // Actualizar estado de la devolución
      transaction.update(devolucionRef, {
        estado: 'aprobada',
        fechaProcesamiento: serverTimestamp(),
        procesadoPor: user.email || user.uid,
        metodoProcesamiento: 'lote_original_especifico',
        updatedAt: serverTimestamp()
      });

      // Crear registros de auditoría específicos por lote original
      for (const movimiento of todosLosMovimientos) {
        const movimientoRef = doc(collection(db, 'movimientosLotes'));
        transaction.set(movimientoRef, {
          devolucionId: devolucionId,
          numeroDevolucion: devolucionData.numeroDevolucion,
          ventaOriginalId: devolucionData.ventaId,
          numeroVentaOriginal: devolucionData.numeroVenta,
          
          // Información del producto
          productoId: movimiento.productoId,
          nombreProducto: movimiento.nombreProducto,
          
          // Información del lote original específico
          loteId: movimiento.movimiento.loteId,
          numeroLote: movimiento.movimiento.numeroLote,
          cantidadDevuelta: movimiento.movimiento.cantidadDevuelta,
          stockAnteriorLote: movimiento.movimiento.stockAnterior,
          stockNuevoLote: movimiento.movimiento.stockNuevo,
          precioCompraUnitario: movimiento.movimiento.precioCompraUnitario,
          
          // Información de la venta original
          itemVentaOriginalId: movimiento.itemVentaOriginal.id,
          cantidadVendidaOriginal: movimiento.itemVentaOriginal.cantidad,
          precioVentaUnitario: movimiento.itemVentaOriginal.precioVentaUnitario,
          
          // Información de ganancia
          gananciaDevolucion: movimiento.gananciaDevolucion,
          
          // Metadatos del movimiento
          tipoMovimiento: 'devolucion-aprobada-lote-original',
          esLoteOriginal: true,
          fechaMovimiento: serverTimestamp(),
          empleadoId: user.email || user.uid,
          createdAt: serverTimestamp()
        });
      }

      console.log('✅ TRANSACCIÓN COMPLETADA - TODOS LOS PRODUCTOS DEVUELTOS A SUS LOTES ORIGINALES');
    });

    alert(`✅ Devolución aprobada exitosamente.\n📦 Todos los productos han regresado a sus lotes originales específicos.\n🎯 Sistema de devolución exacta aplicado correctamente.`);
    
  } catch (err) {
    console.error('❌ Error al aprobar devolución:', err);
    setError('Error al aprobar devolución: ' + err.message);
    alert('❌ Error al aprobar devolución: ' + err.message);
  }
};



    const handleRechazarDevolucion = async (id) => {
      const motivo = window.prompt('Ingrese el motivo del rechazo (opcional):');
      if (!window.confirm('¿Está seguro de que desea RECHAZAR esta devolución?')) {
        return;
      }

      try {
        const devolucionRef = doc(db, 'devoluciones', id);
        await updateDoc(devolucionRef, {
          estado: 'rechazada',
          motivoRechazo: motivo || null,
          fechaProcesamiento: serverTimestamp(),
          procesadoPor: user.email || user.uid,
          updatedAt: serverTimestamp(),
        });
        alert('Devolución rechazada.');
      } catch (err) {
        console.error("Error al rechazar devolución:", err);
        setError("Error al rechazar la devolución: " + err.message);
      }
    };

    const getEstadoBadge = (estado) => {
      switch (estado) {
        case 'solicitada':
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              <ClockIcon className="h-4 w-4 mr-1" /> Solicitada
            </span>
          );
        case 'en_revision':
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              <ExclamationTriangleIcon className="h-4 w-4 mr-1" /> En Revisión
            </span>
          );
        case 'aprobada':
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <CheckCircleIcon className="h-4 w-4 mr-1" /> Aprobada
            </span>
          );
        case 'rechazada':
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              <XCircleIcon className="h-4 w-4 mr-1" /> Rechazada
            </span>
          );
        default:
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              {estado}
            </span>
          );
      }
    };

    const getMotivoBadge = (motivo) => {
      const motivoLabels = {
        'no_quiere': 'No le gustó',
        'defectuoso': 'Producto defectuoso',
        'empaque_abierto': 'Empaque abierto',
        'descripcion_incorrecta': 'Descripción incorrecta',
        'otro': 'Otro motivo'
      };

      const colors = {
        'no_quiere': 'bg-purple-100 text-purple-800',
        'defectuoso': 'bg-red-100 text-red-800',
        'empaque_abierto': 'bg-orange-100 text-orange-800',
        'descripcion_incorrecta': 'bg-blue-100 text-blue-800',
        'otro': 'bg-gray-100 text-gray-800'
      };

      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[motivo] || 'bg-gray-100 text-gray-800'}`}>
          {motivoLabels[motivo] || motivo}
        </span>
      );
    };

    const clearFilters = () => {
      setFilterPeriod('all');
      setStartDate(null);
      setEndDate(null);
      setSelectedEstado('all');
      setSelectedMotivo('all');
      setSearchTerm('');
      setLimitPerPage(20);
    };

    return (
      <Layout title="Devoluciones">
        <div className="flex flex-col mx-4 py-4">
          <div className="w-full p-6 bg-white rounded-lg shadow-md flex flex-col">

            {error && (
              <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
                <span className="block sm:inline font-medium">{error}</span>
              </div>
            )}

            {/* Panel de filtros reorganizado */}
            <div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
              {/* Primera línea: Búsqueda y botón Nueva Devolución */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
                <div className="relative flex-grow sm:mr-4">
                  <input
                    type="text"
                    placeholder="Buscar por número de devolución, venta, cliente..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 text-base placeholder-gray-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" fill="currentColor" />
                  </div>
                </div>
                
                <button
                  onClick={() => router.push('/devoluciones/nueva')}
                  className="inline-flex items-center px-6 py-2 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition duration-150 ease-in-out"
                >
                  <PlusIcon className="-ml-1 mr-3 h-5 w-5" aria-hidden="true" />
                  Nueva Devolución
                </button>
              </div>

              {/* Segunda línea: TODOS los filtros en una sola línea */}
              <div className="flex flex-wrap items-center gap-2 justify-between">
                {/* Filtros del lado izquierdo */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Botones de período */}
                  <button
                    onClick={() => handleFilterChange('all')}
                    className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${
                      filterPeriod === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => handleFilterChange('day')}
                    className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${
                      filterPeriod === 'day'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    Hoy
                  </button>
                  <button
                    onClick={() => handleFilterChange('week')}
                    className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${
                      filterPeriod === 'week'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    Esta Semana
                  </button>
                  <button
                    onClick={() => handleFilterChange('month')}
                    className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${
                      filterPeriod === 'month'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    Este Mes
                  </button>

                  {/* Selectores de fecha */}
                  <DatePicker
                    selected={startDate}
                    onChange={(date) => {
                      setStartDate(date);
                      setFilterPeriod('custom');
                    }}
                    selectsStart
                    startDate={startDate}
                    endDate={endDate}
                    placeholderText="Fecha inicio"
                    className="px-3 py-1 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm w-32"
                  />
                  <DatePicker
                    selected={endDate}
                    onChange={(date) => {
                      setEndDate(date);
                      setFilterPeriod('custom');
                    }}
                    selectsEnd
                    startDate={startDate}
                    endDate={endDate}
                    minDate={startDate}
                    placeholderText="Fecha fin"
                    className="px-3 py-1 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm w-32"
                  />

                  {/* Selector de límite */}
                  <select
                    className="px-3 py-1 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                    value={limitPerPage}
                    onChange={(e) => setLimitPerPage(Number(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>

                  {/* Filtros específicos de devoluciones */}
                  <select
                    value={selectedEstado}
                    onChange={(e) => setSelectedEstado(e.target.value)}
                    className="px-3 py-1 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="all">Estado</option>
                    <option value="solicitada">Solicitada</option>
                    <option value="en_revision">En Revisión</option>
                    <option value="aprobada">Aprobada</option>
                    <option value="rechazada">Rechazada</option>
                  </select>

                  <select
                    value={selectedMotivo}
                    onChange={(e) => setSelectedMotivo(e.target.value)}
                    className="px-3 py-1 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="all">Motivo</option>
                    <option value="no_quiere">No le gustó</option>
                    <option value="defectuoso">Producto defectuoso</option>
                    <option value="empaque_abierto">Empaque abierto</option>
                    <option value="descripcion_incorrecta">Descripción incorrecta</option>
                    <option value="otro">Otro motivo</option>
                  </select>
                </div>

                {/* Botón Limpiar del lado derecho */}
                <button 
                  onClick={clearFilters}
                  className="inline-flex items-center px-3 py-1 bg-red-50 text-red-700 rounded text-sm font-medium hover:bg-red-100 hover:text-red-800 transition-colors border border-red-200 whitespace-nowrap"
                >
                  <XMarkIcon className="h-4 w-4 mr-1" />
                  Limpiar
                </button>
              </div>
            </div>

          
            {loading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
              </div>
            ) : filteredDevoluciones.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-lg">
                No hay devoluciones registradas que coincidan con los filtros aplicados.
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto shadow-lg ring-1 ring-black ring-opacity-5 rounded-lg overflow-y-auto max-h-[60vh]">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">N° DEVOLUCIÓN</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">N° VENTA ORIGINAL</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">CLIENTE</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">FECHA SOLICITUD</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MONTO A DEVOLVER</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MOTIVO</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ESTADO</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">PROCESADO POR</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ACCIONES</th>
                    </tr>
                    </thead>
                    <tbody className="bg-white">
                    {currentDevoluciones.map((devolucion, index) => (
                        <tr key={devolucion.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900 text-left">
                            {devolucion.numeroDevolucion || 'N/A'}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">
                            {devolucion.numeroVentaOriginal}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">
                            {devolucion.clienteNombre}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">
                            {devolucion.fechaSolicitudFormatted}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black font-medium text-left">
                            S/. {parseFloat(devolucion.montoADevolver || 0).toFixed(2)}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                            {getMotivoBadge(devolucion.motivo)}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                            {getEstadoBadge(devolucion.estado)}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">
                            {devolucion.procesadoPor || devolucion.solicitadoPor || 'N/A'}
                          </td>
                          <td className="border border-gray-300 relative whitespace-nowrap px-3 py-2 text-sm font-medium text-center">
                            <div className="flex items-center space-x-2 justify-center">
                              <button
                                onClick={() => handleViewDetails(devolucion.id)}
                                className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition duration-150 ease-in-out"
                                title="Ver Detalles"
                              >
                                <EyeIcon className="h-5 w-5" />
                              </button>
                              {devolucion.estado === 'solicitada' && (
                                <>
                                  <button
                                    onClick={() => handleAprobarDevolucion(devolucion.id)}
                                    className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition duration-150 ease-in-out"
                                    title="Aprobar Devolución"
                                  >
                                    <CheckCircleIcon className="h-5 w-5" />
                                  </button>
                                  <button
                                    onClick={() => handleRechazarDevolucion(devolucion.id)}
                                    className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition duration-150 ease-in-out"
                                    title="Rechazar Devolución"
                                  >
                                    <XCircleIcon className="h-5 w-5" />
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

                {/* Controles de paginación */}
                {filteredDevoluciones.length > devolucionesPerPage && (
                  <div className="flex justify-between items-center mt-4">
                    <p className="text-sm text-gray-700">
                      Mostrando <span className="font-medium">{indexOfFirstDevolucion + 1}</span> a <span className="font-medium">{Math.min(indexOfLastDevolucion, filteredDevoluciones.length)}</span> de <span className="font-medium">{filteredDevoluciones.length}</span> resultados
                    </p>
                    <div className="flex space-x-2">
                      <button
                        onClick={goToPrevPage}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeftIcon className="h-5 w-5" />
                      </button>
                      <span className="px-3 py-1 text-sm text-gray-700">
                        Página {currentPage} de {totalPages}
                      </span>
                      <button
                        onClick={goToNextPage}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronRightIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Layout>
    );
  };

  export default DevolucionesIndexPage;