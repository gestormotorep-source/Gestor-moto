// pages/cotizaciones/index.js

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import { generarPDFCotizacionCompleta } from '../../components/utils/pdfGeneratorCotizaciones';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  addDoc,
  limit,
  getDoc // ¡Importante! Importar la función limit de Firestore
} from 'firebase/firestore';
import { useRouter } from 'next/router';
import {
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  DocumentTextIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PrinterIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const CotizacionesIndexPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCotizaciones, setFilteredCotizaciones] = useState([]);

  // Estados para paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [cotizacionesPerPage] = useState(10); // Puedes cambiar esto según necesites

  // Función para consumir stock de lotes según FIFO (AGREGAR AL INICIO DEL ARCHIVO)
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

// Función para recalcular precio de compra del producto (AGREGAR AL INICIO DEL ARCHIVO)
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


  // Estados para el filtrado por fecha
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  // Nuevo estado para el limitador de registros
  const [limitPerPage, setLimitPerPage] = useState(20);

  // Cálculos de paginación
  const indexOfLastCotizacion = currentPage * cotizacionesPerPage;
  const indexOfFirstCotizacion = indexOfLastCotizacion - cotizacionesPerPage;
  const currentCotizaciones = filteredCotizaciones.slice(indexOfFirstCotizacion, indexOfLastCotizacion);
  const totalPages = Math.ceil(filteredCotizaciones.length / cotizacionesPerPage);

  // Funciones de paginación
  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const goToPrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  // useEffect para obtener las cotizaciones
  useEffect(() => {
    const fetchCotizaciones = async () => {
      if (!user) {
        router.push('/auth');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const cotizacionesCollectionRef = collection(db, 'cotizaciones');
        let baseQuery;

        const isAdmin = user?.email === 'admin@gmail.com';
        if (!isAdmin) {
          baseQuery = query(
            cotizacionesCollectionRef,
            where('empleadoId', '==', user.email || user.uid)
          );
        } else {
          baseQuery = query(cotizacionesCollectionRef);
        }

        let startOfPeriod = null;
        let endOfPeriod = null;

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (filterPeriod === 'day') {
          startOfPeriod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endOfPeriod = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        } else if (filterPeriod === 'week') {
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          startOfPeriod = new Date(now.setDate(diff));
          endOfPeriod = new Date(startOfPeriod);
          endOfPeriod.setDate(startOfPeriod.getDate() + 6);
          endOfPeriod.setHours(23, 59, 59, 999);
        } else if (filterPeriod === 'month') {
          startOfPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
          endOfPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        } else if (startDate && endDate) {
          startOfPeriod = new Date(startDate);
          endOfPeriod = new Date(endDate);
          endOfPeriod.setHours(23, 59, 59, 999);
        }

        let qCotizaciones;
        if (startOfPeriod && endOfPeriod) {
          qCotizaciones = query(
            baseQuery,
            where('fechaCreacion', '>=', startOfPeriod),
            where('fechaCreacion', '<=', endOfPeriod),
            orderBy('fechaCreacion', 'desc'),
            limit(limitPerPage) // Aplica el limitador a la consulta
          );
        } else {
          qCotizaciones = query(
            baseQuery,
            orderBy('fechaCreacion', 'desc'),
            limit(limitPerPage) // Aplica el limitador
          );
        }

        const querySnapshotCotizaciones = await getDocs(qCotizaciones);

        const loadedCotizaciones = [];
        for (const docCotizacion of querySnapshotCotizaciones.docs) {
          const data = docCotizacion.data();
          const cotizacionData = {
            id: docCotizacion.id,
            ...data,
            fechaCreacion:
              data.fechaCreacion?.toDate().toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }) || 'N/A',
            estado: data.estado,
            metodoPago: data.metodoPago || 'N/A',
          };
          loadedCotizaciones.push(cotizacionData);
        }

        setCotizaciones(loadedCotizaciones);
      } catch (err) {
        console.error('Error al cargar cotizaciones:', err);
        setError('Error al cargar la información de cotizaciones. Intente de nuevo.');
      } finally {
        setLoading(false);
      }
    };

    fetchCotizaciones();
  }, [user, router, filterPeriod, startDate, endDate, limitPerPage]);

  useEffect(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const filtered = cotizaciones.filter((cotizacion) => {
      const numeroCotizacionMatch =
        cotizacion.numeroCotizacion && typeof cotizacion.numeroCotizacion === 'string'
          ? cotizacion.numeroCotizacion.toLowerCase().includes(lowerCaseSearchTerm)
          : false;

      const clienteMatch =
        cotizacion.clienteNombre && typeof cotizacion.clienteNombre === 'string'
          ? cotizacion.clienteNombre.toLowerCase().includes(lowerCaseSearchTerm)
          : false;

      const observacionesMatch =
        cotizacion.observaciones && typeof cotizacion.observaciones === 'string'
          ? cotizacion.observaciones.toLowerCase().includes(lowerCaseSearchTerm)
          : false;

      const estadoMatch =
        cotizacion.estado && typeof cotizacion.estado === 'string'
          ? cotizacion.estado.toLowerCase().includes(lowerCaseSearchTerm)
          : false;

      const metodoPagoMatch =
        cotizacion.metodoPago && typeof cotizacion.metodoPago === 'string'
          ? cotizacion.metodoPago.toLowerCase().includes(lowerCaseSearchTerm)
          : false;

      return (
        numeroCotizacionMatch ||
        clienteMatch ||
        observacionesMatch ||
        estadoMatch ||
        metodoPagoMatch
      );
    });
    setFilteredCotizaciones(filtered);
    // Reset página al cambiar los filtros
    setCurrentPage(1);
  }, [searchTerm, cotizaciones]);

// FUNCIÓN PRINCIPAL ACTUALIZADA - handleConfirmarCotizacion CON MANEJO DE ITEMS YA SEPARADOS
const handleConfirmarCotizacion = async (cotizacionId) => {
  if (
    !window.confirm(
      '¿Estás seguro de que quieres CONFIRMAR esta cotización? Esto la convertirá en una VENTA y consumirá stock de lotes según los items ya calculados.'
    )
  ) {
    return;
  }

  setLoading(true);
  setError(null);
  try {
    await runTransaction(db, async (transaction) => {
      // ===== FASE 1: TODAS LAS LECTURAS =====
      
      // Leer cotización
      const cotizacionRef = doc(db, 'cotizaciones', cotizacionId);
      const cotizacionSnap = await transaction.get(cotizacionRef);

      if (!cotizacionSnap.exists()) {
        throw new Error('Cotización no encontrada.');
      }

      const currentCotizacionData = cotizacionSnap.data();
      if (
        currentCotizacionData.estado === 'confirmada' ||
        currentCotizacionData.estado === 'cancelada'
      ) {
        throw new Error('Esta cotización ya ha sido confirmada o cancelada.');
      }

      // Leer items de cotización
      const itemsCotizacionCollectionRef = collection(
        db,
        'cotizaciones',
        cotizacionId,
        'itemsCotizacion'
      );
      const itemsCotizacionSnapshot = await getDocs(itemsCotizacionCollectionRef);

      if (itemsCotizacionSnapshot.empty) {
        throw new Error('No se encontraron productos asociados a esta cotización.');
      }

      // Leer todos los datos necesarios
      const itemsData = [];
      const productosAActualizar = new Map();
      const lotesAActualizar = new Map();
      const lotesData = new Map();

      for (const itemDoc of itemsCotizacionSnapshot.docs) {
        const itemData = itemDoc.data();
        
        // Leer producto
        const productoRef = doc(db, 'productos', itemData.productoId);
        const productoSnap = await transaction.get(productoRef);

        if (!productoSnap.exists()) {
          throw new Error(
            `Producto con ID ${itemData.productoId} no encontrado. No se puede confirmar la venta.`
          );
        }

        const productoData = productoSnap.data();
        const currentStock = typeof productoData.stockActual === 'number' ? productoData.stockActual : 0;
        const cantidadVendida = typeof itemData.cantidad === 'number' ? itemData.cantidad : 0;

        // Acumular stock usado por producto
        const stockUsadoProducto = productosAActualizar.get(itemData.productoId)?.stockUsado || 0;
        const nuevoStockUsado = stockUsadoProducto + cantidadVendida;
        
        if (currentStock < nuevoStockUsado) {
          throw new Error(
            `Stock insuficiente para el producto "${itemData.nombreProducto}". Stock actual: ${currentStock}, Cantidad total solicitada: ${nuevoStockUsado}.`
          );
        }

        productosAActualizar.set(itemData.productoId, {
          productoRef: productoRef,
          currentProductoData: productoData,
          stockUsado: nuevoStockUsado
        });

        // Si tiene loteId, leer el lote
        if (itemData.loteId) {
          if (!lotesData.has(itemData.loteId)) {
            const loteRef = doc(db, 'lotes', itemData.loteId);
            const loteSnap = await transaction.get(loteRef);
            
            if (!loteSnap.exists()) {
              throw new Error(`Lote con ID ${itemData.loteId} no encontrado.`);
            }

            const loteData = loteSnap.data();
            lotesData.set(itemData.loteId, {
              ref: loteRef,
              data: loteData,
              stockUsado: 0
            });
          }

          // Acumular stock usado del lote
          const loteInfo = lotesData.get(itemData.loteId);
          const nuevoStockUsadoLote = loteInfo.stockUsado + cantidadVendida;
          
          if (loteInfo.data.stockRestante < nuevoStockUsadoLote) {
            throw new Error(
              `Stock insuficiente en el lote ${loteInfo.data.numeroLote}. Disponible: ${loteInfo.data.stockRestante}, Solicitado: ${nuevoStockUsadoLote}`
            );
          }

          loteInfo.stockUsado = nuevoStockUsadoLote;
        } else {
          // Para FIFO, leer lotes disponibles
          const lotesQuery = query(
            collection(db, 'lotes'),
            where('productoId', '==', itemData.productoId),
            where('stockRestante', '>', 0),
            where('estado', '==', 'activo'),
            orderBy('fechaIngreso', 'asc')
          );
          
          const lotesSnapshot = await getDocs(lotesQuery);
          let cantidadPendienteFIFO = cantidadVendida;
          
          for (const loteDoc of lotesSnapshot.docs) {
            if (cantidadPendienteFIFO <= 0) break;
            
            const loteId = loteDoc.id;
            const loteData = loteDoc.data();
            
            if (!lotesData.has(loteId)) {
              lotesData.set(loteId, {
                ref: doc(db, 'lotes', loteId),
                data: loteData,
                stockUsado: 0
              });
            }
            
            const consumir = Math.min(cantidadPendienteFIFO, loteData.stockRestante - lotesData.get(loteId).stockUsado);
            lotesData.get(loteId).stockUsado += consumir;
            cantidadPendienteFIFO -= consumir;
          }
          
          if (cantidadPendienteFIFO > 0) {
            throw new Error(`Stock insuficiente. Faltan ${cantidadPendienteFIFO} unidades del producto ${itemData.nombreProducto}.`);
          }
        }

        itemsData.push({
          itemData: itemData,
          productoRef: productoRef,
          currentProductoData: productoData
        });
      }

      // ===== FASE 2: TODAS LAS ESCRITURAS =====

      // Crear venta
      const newVentaRef = doc(collection(db, 'ventas'));
      const clienteNombre = currentCotizacionData.clienteNombre || 'Cliente No Especificado';
      const numeroVenta = `V-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      transaction.set(newVentaRef, {
        numeroVenta: numeroVenta,
        cotizacionId: cotizacionId,
        clienteId: currentCotizacionData.clienteId,
        clienteNombre: clienteNombre,
        clienteDNI: currentCotizacionData.clienteDNI || null,
        totalVenta: currentCotizacionData.totalCotizacion,
        gananciaTotalVenta: currentCotizacionData.gananciaTotalCotizacion || 0,
        fechaVenta: serverTimestamp(),
        empleadoId: user.email || user.uid,
        observaciones: (currentCotizacionData.observaciones || '') + ' - Convertido de cotización',
        estado: 'completada',
        metodoPago: currentCotizacionData.metodoPago || 'efectivo',
        tipoVenta: 'cotizacionAprobada',
        paymentData: currentCotizacionData.paymentData || {
          totalAmount: currentCotizacionData.totalCotizacion,
          paymentMethods: [{
            method: currentCotizacionData.metodoPago || 'efectivo',
            amount: currentCotizacionData.totalCotizacion,
            label: (currentCotizacionData.metodoPago || 'efectivo').toUpperCase(),
            icon: '💵'
          }],
          isMixedPayment: false
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Actualizar lotes
      const todosLosMovimientos = [];
      for (const [loteId, loteInfo] of lotesData) {
        if (loteInfo.stockUsado > 0) {
          const nuevoStock = loteInfo.data.stockRestante - loteInfo.stockUsado;
          
          transaction.update(loteInfo.ref, {
            stockRestante: nuevoStock,
            estado: nuevoStock <= 0 ? 'agotado' : 'activo',
            updatedAt: serverTimestamp()
          });
        }
      }

      // Crear items de venta y movimientos
      for (const { itemData } of itemsData) {
        const cantidadVendida = parseFloat(itemData.cantidad);
        
        // Crear item de venta
        transaction.set(doc(collection(newVentaRef, 'itemsVenta')), {
          productoId: itemData.productoId,
          nombreProducto: itemData.nombreProducto,
          marca: itemData.marca || '',
          codigoTienda: itemData.codigoTienda || '',
          descripcion: itemData.descripcion || '',
          color: itemData.color || '',
          cantidad: itemData.cantidad,
          precioVentaUnitario: itemData.precioVentaUnitario,
          subtotal: itemData.subtotal,
          loteId: itemData.loteId || null,
          numeroLote: itemData.numeroLote || null,
          precioCompraUnitario: itemData.precioCompraUnitario || 0,
          gananciaUnitaria: itemData.gananciaUnitaria || 0,
          gananciaTotal: itemData.gananciaTotal || 0,
          loteOriginal: itemData.loteOriginal || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Registrar movimientos
        if (itemData.loteId) {
          // Item con lote específico
          const loteInfo = lotesData.get(itemData.loteId);
          const movimientoRef = doc(collection(db, 'movimientosLotes'));
          transaction.set(movimientoRef, {
            ventaId: newVentaRef.id,
            numeroVenta: numeroVenta,
            cotizacionId: cotizacionId,
            productoId: itemData.productoId,
            nombreProducto: itemData.nombreProducto,
            loteId: itemData.loteId,
            numeroLote: loteInfo.data.numeroLote,
            cantidadConsumida: cantidadVendida,
            precioCompraUnitario: parseFloat(itemData.precioCompraUnitario || 0),
            stockRestanteLote: loteInfo.data.stockRestante - cantidadVendida,
            tipoMovimiento: 'cotizacion-confirmada',
            fechaMovimiento: serverTimestamp(),
            empleadoId: user.email || user.uid,
            createdAt: serverTimestamp()
          });
        } else {
          // Item FIFO - crear movimientos para cada lote usado
          let cantidadPendiente = cantidadVendida;
          const lotesUsados = Array.from(lotesData.entries())
            .filter(([loteId, loteInfo]) => loteInfo.data.productoId === itemData.productoId)
            .sort((a, b) => new Date(a[1].data.fechaIngreso.seconds * 1000) - new Date(b[1].data.fechaIngreso.seconds * 1000));

          for (const [loteId, loteInfo] of lotesUsados) {
            if (cantidadPendiente <= 0) break;
            
            const consumir = Math.min(cantidadPendiente, loteInfo.stockUsado);
            if (consumir > 0) {
              const movimientoRef = doc(collection(db, 'movimientosLotes'));
              transaction.set(movimientoRef, {
                ventaId: newVentaRef.id,
                numeroVenta: numeroVenta,
                cotizacionId: cotizacionId,
                productoId: itemData.productoId,
                nombreProducto: itemData.nombreProducto,
                loteId: loteId,
                numeroLote: loteInfo.data.numeroLote,
                cantidadConsumida: consumir,
                precioCompraUnitario: loteInfo.data.precioCompraUnitario,
                stockRestanteLote: loteInfo.data.stockRestante - loteInfo.stockUsado,
                tipoMovimiento: 'cotizacion-confirmada-fifo',
                fechaMovimiento: serverTimestamp(),
                empleadoId: user.email || user.uid,
                createdAt: serverTimestamp()
              });
              
              cantidadPendiente -= consumir;
            }
          }
        }
      }

      // Actualizar productos
      for (const [productoId, productoInfo] of productosAActualizar) {
        const currentStock = typeof productoInfo.currentProductoData.stockActual === 'number' ? productoInfo.currentProductoData.stockActual : 0;
        const newStock = currentStock - productoInfo.stockUsado;
        
        transaction.update(productoInfo.productoRef, {
          stockActual: newStock,
          updatedAt: serverTimestamp(),
        });

        // Recalcular precio de compra (buscar primer lote disponible)
        const lotesDisponibles = Array.from(lotesData.entries())
          .filter(([loteId, loteInfo]) => 
            loteInfo.data.productoId === productoId && 
            (loteInfo.data.stockRestante - loteInfo.stockUsado) > 0
          )
          .sort((a, b) => new Date(a[1].data.fechaIngreso.seconds * 1000) - new Date(b[1].data.fechaIngreso.seconds * 1000));

        const nuevoPrecioCompra = lotesDisponibles.length > 0 
          ? parseFloat(lotesDisponibles[0][1].data.precioCompraUnitario || 0)
          : 0;

        transaction.update(productoInfo.productoRef, {
          precioCompraDefault: nuevoPrecioCompra
        });
      }

      // Crear pagos
      const paymentData = currentCotizacionData.paymentData;
      if (paymentData && paymentData.isMixedPayment) {
        for (const paymentMethod of paymentData.paymentMethods) {
          if (paymentMethod.amount > 0) {
            const paymentRef = doc(collection(db, 'pagos'));
            transaction.set(paymentRef, {
              ventaId: newVentaRef.id,
              numeroVenta: numeroVenta,
              cotizacionId: cotizacionId,
              metodoPago: paymentMethod.method,
              monto: paymentMethod.amount,
              clienteId: currentCotizacionData.clienteId,
              clienteNombre: clienteNombre,
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
          ventaId: newVentaRef.id,
          numeroVenta: numeroVenta,
          cotizacionId: cotizacionId,
          metodoPago: currentCotizacionData.metodoPago || 'efectivo',
          monto: currentCotizacionData.totalCotizacion,
          clienteId: currentCotizacionData.clienteId,
          clienteNombre: clienteNombre,
          empleadoId: user.email || user.uid,
          fechaPago: serverTimestamp(),
          estado: 'completado',
          tipo: 'venta',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Marcar cotización como confirmada
      transaction.update(cotizacionRef, { 
        estado: 'confirmada', 
        fechaConfirmacion: serverTimestamp(),
        ventaGeneradaId: newVentaRef.id,
        numeroVentaGenerada: numeroVenta,
        updatedAt: serverTimestamp() 
      });
    });

    alert('Cotización confirmada exitosamente. Stock descontado según los lotes ya calculados.');
    setCotizaciones((prevCotizaciones) =>
      prevCotizaciones.map((cot) =>
        cot.id === cotizacionId ? { ...cot, estado: 'confirmada' } : cot
      )
    );
  } catch (err) {
    console.error('Error al confirmar cotización:', err);
    setError('Error al confirmar la cotización. ' + err.message);
    alert('Hubo un error al confirmar la cotización: ' + err.message);
  } finally {
    setLoading(false);
  }
};

  const handleCancelarCotizacion = async (cotizacionId) => {
    if (
      !window.confirm(
        '¿Estás seguro de que quieres CANCELAR esta cotización? Esto la marcará como inactiva y no afectará el stock.'
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const cotizacionRef = doc(db, 'cotizaciones', cotizacionId);
      await updateDoc(cotizacionRef, {
        estado: 'cancelada',
        updatedAt: serverTimestamp(),
      });

      alert('Cotización cancelada con éxito.');
      setCotizaciones((prevCotizaciones) =>
        prevCotizaciones.map((cot) =>
          cot.id === cotizacionId ? { ...cot, estado: 'cancelada' } : cot
        )
      );
    } catch (err) {
      console.error('Error al cancelar cotización:', err);
      setError('Error al cancelar la cotización. ' + err.message);
      alert('Hubo un error al cancelar la cotización: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCotizacion = async (cotizacionId, estadoCotizacion) => {
    let confirmMessage = '¿Estás seguro de que quieres ELIMINAR esta cotización?';
    if (estadoCotizacion === 'confirmada') {
      confirmMessage +=
        '\nADVERTENCIA: Esta cotización ya fue confirmada y convertida en venta. Eliminarla NO revertirá la venta ni el stock. Deberás ajustar el inventario y ventas manualmente si deseas corregir.';
    } else if (estadoCotizacion === 'cancelada') {
      confirmMessage += '\nEsta cotización está cancelada. Eliminarla no tiene impacto en el stock.';
    } else {
      confirmMessage +=
        '\nEsto eliminará todos los productos asociados y NO afectará el stock (ya que la cotización aún no había sido confirmada).';
    }

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await runTransaction(db, async (transaction) => {
        const cotizacionRef = doc(db, 'cotizaciones', cotizacionId);

        const itemsRef = collection(db, 'cotizaciones', cotizacionId, 'itemsCotizacion');
        const itemsSnapshot = await getDocs(itemsRef);

        itemsSnapshot.docs.forEach((itemDoc) => {
          transaction.delete(doc(db, 'cotizaciones', cotizacionId, 'itemsCotizacion', itemDoc.id));
        });

        transaction.delete(cotizacionRef);
      });

      alert('Cotización eliminada con éxito.');
      setCotizaciones((prevCotizaciones) =>
        prevCotizaciones.filter((cot) => cot.id !== cotizacionId)
      );
    } catch (err) {
      console.error('Error al eliminar cotización:', err);
      setError('Error al eliminar la cotización. ' + err.message);
      alert('Hubo un error al eliminar la cotización: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditCotizacion = (cotizacionId) => {
    router.push(`/cotizaciones/${cotizacionId}`);
  };

  const handleViewDetails = (cotizacionId) => {
    router.push(`/cotizaciones/${cotizacionId}`);
  };

  const handleFilterChange = (period) => {
    setFilterPeriod(period);
    setStartDate(null);
    setEndDate(null);
  };

  // 2. FUNCIÓN PARA IMPRIMIR COTIZACIÓN - Añade esta función después de tus funciones existentes

  const handleImprimirCotizacion = async (cotizacion) => {
    try {
      // Mostrar indicador de carga
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

      // Obtener información del cliente si existe
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

      // Generar PDF
      await generarPDFCotizacionCompleta(cotizacion.id, cotizacion, clienteData);
      
      // Mostrar mensaje de éxito
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
      // Remover indicador de carga si existe
      const loadingElements = document.querySelectorAll('div[class*="fixed top-4 right-4 bg-blue-500"]');
      loadingElements.forEach(el => {
        if (document.body.contains(el.parentElement)) {
          document.body.removeChild(el.parentElement);
        }
      });

      console.error('Error al generar PDF:', error);
      
      // Mostrar mensaje de error
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

  const [selectedCotizaciones, setSelectedCotizaciones] = useState(new Set());

  const handleSelectCotizacion = (cotizacionId) => {
    const newSelected = new Set(selectedCotizaciones);
    if (newSelected.has(cotizacionId)) {
      newSelected.delete(cotizacionId);
    } else {
      newSelected.add(cotizacionId);
    }
    setSelectedCotizaciones(newSelected);
  };

  const handleImprimirSeleccionadas = async () => {
    if (selectedCotizaciones.size === 0) {
      alert('Selecciona al menos una cotización para imprimir');
      return;
    }

    for (const cotizacionId of selectedCotizaciones) {
      const cotizacion = filteredCotizaciones.find(v => v.id === cotizacionId);
      if (cotizacion) {
        await handleImprimirCotizacion(cotizacion);
        // Pequeña pausa entre impresiones
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setSelectedCotizaciones(new Set()); // Limpiar selección
  };

  if (!user) {
    return null;
  }

  return (
    <Layout title="Mis Cotizaciones">
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-6 bg-white rounded-lg shadow-md flex flex-col">
          {error && (
            <div
              className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg relative mb-6"
              role="alert"
            >
              <span className="block sm:inline font-medium">{error}</span>
            </div>
          )}

          {/* Sección de Filtros y Búsqueda (Responsive) */}
<div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
  {/* En desktop: Una sola línea horizontal | En móvil: Stack vertical */}
  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
    
    {/* Campo de Búsqueda */}
    <div className="relative w-full lg:flex-1 lg:max-w-xl">
      <input
        type="text"
        placeholder="Buscar por número, cliente, observaciones, estado..."
        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base placeholder-gray-400"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
      </div>
    </div>

    {/* Botones de Filtro */}
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => handleFilterChange('all')}
        className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
          filterPeriod === 'all'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
        }`}
      >
        Todas
      </button>
      <button
        onClick={() => handleFilterChange('day')}
        className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
          filterPeriod === 'day'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
        }`}
      >
        Hoy
      </button>
      <button
        onClick={() => handleFilterChange('week')}
        className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
          filterPeriod === 'week'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
        }`}
      >
        Esta Semana
      </button>
      <button
        onClick={() => handleFilterChange('month')}
        className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
          filterPeriod === 'month'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
        }`}
      >
        Este Mes
      </button>
    </div>

    {/* Selectores de Fecha */}
    <div className="flex flex-col sm:flex-row gap-2">
      <DatePicker
        selected={startDate}
        onChange={(date) => {
          setStartDate(date);
          setFilterPeriod('custom');
        }}
        selectsStart
        startDate={startDate}
        endDate={endDate}
        placeholderText="Fecha de inicio"
        className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
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
        placeholderText="Fecha de fin"
        className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
      />
    </div>

    {/* Selector de límite */}
    <div className="w-full sm:w-auto">
      <select
        id="limit-per-page"
        className="w-full sm:w-28 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
        value={limitPerPage}
        onChange={(e) => {
          setLimitPerPage(Number(e.target.value));
        }}
      >
        <option value={10}>10</option>
        <option value={20}>20</option>
        <option value={50}>50</option>
        <option value={100}>100</option>
      </select>
    </div>

    {/* Botones de Acción */}
    <div className="flex flex-col sm:flex-row gap-2">
      <button
        onClick={() => router.push('/cotizaciones/nueva')}
        className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out whitespace-nowrap"
      >
        <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
        Nueva Cotización
      </button>
      
      {selectedCotizaciones.size > 0 && (
        <button
          onClick={handleImprimirSeleccionadas}
          className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 ease-in-out whitespace-nowrap"
        >
          <PrinterIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
          Imprimir ({selectedCotizaciones.size})
        </button>
      )}
    </div>

  </div>
</div>
          {/* Fin de la Sección de Filtros y Búsqueda */}

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredCotizaciones.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-gray-50 rounded-lg p-4 shadow-inner">
              <DocumentTextIcon className="h-24 w-24 text-gray-300 mb-4" />
              <p className="text-lg font-medium">No se encontraron cotizaciones.</p>
              <p className="text-sm text-gray-400">¡Empieza creando una nueva cotización!</p>
            </div>
          ) : (
            <div>
              <div className="overflow-x-auto shadow-lg ring-1 ring-black ring-opacity-5 rounded-lg overflow-y-auto max-h-[60vh]">
                <table className="min-w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">
                        <input
                          type="checkbox"
                          checked={selectedCotizaciones.size === currentCotizaciones.length && currentCotizaciones.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCotizaciones(new Set(currentCotizaciones.map(c => c.id)));
                            } else {
                              setSelectedCotizaciones(new Set());
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th
                        scope="col"
                        className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center"
                      >
                        N° COTIZACIÓN
                      </th>
                      <th
                        scope="col"
                        className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center"
                      >
                        CLIENTE
                      </th>
                      <th
                        scope="col"
                        className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center"
                      >
                        FECHA CREACIÓN
                      </th>
                      <th
                        scope="col"
                        className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center"
                      >
                        TOTAL
                      </th>
                      <th
                        scope="col"
                        className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center"
                      >
                        ESTADO
                      </th>
                      <th
                        scope="col"
                        className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center"
                      >
                        MÉTODO DE PAGO
                      </th>
                      <th
                        scope="col"
                        className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center"
                      >
                        REGISTRADO POR
                      </th>
                      <th
                        scope="col"
                        className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center"
                      >
                        ACCIONES
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {currentCotizaciones.map((cotizacion, index) => (
                      <tr key={cotizacion.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          <input
                            type="checkbox"
                            checked={selectedCotizaciones.has(cotizacion.id)}
                            onChange={() => handleSelectCotizacion(cotizacion.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium text-black text-left">
                          {cotizacion.numeroCotizacion || 'N/A'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">
                          {cotizacion.clienteNombre}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">
                          {cotizacion.fechaCreacion}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black font-medium text-left">
                          S/. {parseFloat(cotizacion.totalCotizacion || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          {cotizacion.estado === 'confirmada' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircleIcon className="h-4 w-4 mr-1" /> Confirmada
                            </span>
                          ) : cotizacion.estado === 'cancelada' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <XCircleIcon className="h-4 w-4 mr-1" /> Cancelada
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <DocumentTextIcon className="h-4 w-4 mr-1" /> Pendiente
                            </span>
                          )}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">
                          {cotizacion.metodoPago || 'N/A'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">
                          {cotizacion.empleadoId || 'Desconocido'}
                        </td>
                        <td className="border border-gray-300 relative whitespace-nowrap px-3 py-2 text-sm font-medium text-center">
                          <div className="flex items-center space-x-2 justify-center">
                            {(cotizacion.estado === 'pendiente' ||
                              cotizacion.estado === 'borrador') && (
                              <>
                                <button
                                  onClick={() => handleConfirmarCotizacion(cotizacion.id)}
                                  className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition duration-150 ease-in-out"
                                  title="Confirmar Cotización (Convertir a Venta)"
                                >
                                  <CheckCircleIcon className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => handleCancelarCotizacion(cotizacion.id)}
                                  className="text-orange-600 hover:text-orange-800 p-2 rounded-full hover:bg-orange-50 transition duration-150 ease-in-out"
                                  title="Cancelar Cotización"
                                >
                                  <XCircleIcon className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => handleEditCotizacion(cotizacion.id)}
                                  className="text-purple-600 hover:text-purple-800 p-2 rounded-full hover:bg-purple-50 transition duration-150 ease-in-out"
                                  title="Editar Cotización"
                                >
                                  <PencilIcon className="h-5 w-5" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleViewDetails(cotizacion.id)}
                              className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition duration-150 ease-in-out"
                              title="Ver Detalles de la Cotización"
                            >
                              <EyeIcon className="h-5 w-5" />
                            </button>
                            {/* NUEVO BOTÓN - Imprimir PDF */}
                            <button
                              onClick={() => handleImprimirCotizacion(cotizacion)}
                              className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition duration-150 ease-in-out"
                              title="Generar PDF de Cotización"
                              disabled={false} // Las cotizaciones siempre pueden imprimirse
                            >
                              <PrinterIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCotizacion(cotizacion.id, cotizacion.estado)}
                              className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition duration-150 ease-in-out ml-1"
                              title="Eliminar Cotización"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Controles de paginación */}
              {filteredCotizaciones.length > cotizacionesPerPage && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{indexOfFirstCotizacion + 1}</span> a <span className="font-medium">{Math.min(indexOfLastCotizacion, filteredCotizaciones.length)}</span> de <span className="font-medium">{filteredCotizaciones.length}</span> resultados
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

export default CotizacionesIndexPage;