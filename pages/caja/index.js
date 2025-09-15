import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import DatePicker from 'react-datepicker';
import emailjs from '@emailjs/browser';
import "react-datepicker/dist/react-datepicker.css";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  addDoc,
  serverTimestamp,
  where,
  Timestamp,
  getDocs,
  getDoc,
  setDoc
} from 'firebase/firestore';
import {
  BanknotesIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  EyeIcon,
  ChartBarIcon,
  BuildingStorefrontIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

const CajaPage = () => {
  const { user } = useAuth();
  const router = useRouter();

  const [ventas, setVentas] = useState([]);
  const [retiros, setRetiros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Estados para dinero inicial
  const [dineroInicial, setDineroInicial] = useState(0);
  const [showDineroInicialModal, setShowDineroInicialModal] = useState(false);
  const [inputDineroInicial, setInputDineroInicial] = useState('');
  const [processingDineroInicial, setProcessingDineroInicial] = useState(false);
  
  // Estados para retiro de dinero
  const [showRetiroModal, setShowRetiroModal] = useState(false);
  const [retiroAmount, setRetiroAmount] = useState('');
  const [retiroTipo, setRetiroTipo] = useState('efectivo');
  const [retiroMotivo, setRetiroMotivo] = useState('');
  const [processingRetiro, setProcessingRetiro] = useState(false);

  // Estados para detalles de ganancia
  const [showDetalleGanancia, setShowDetalleGanancia] = useState(false);
  const [detalleGananciaData, setDetalleGananciaData] = useState(null);

  // Estados para cierre de caja
  const [cajaCerrada, setCajaCerrada] = useState(false);
  const [loadingCierreCaja, setLoadingCierreCaja] = useState(false);
  const [showCierreModal, setShowCierreModal] = useState(false);

  // Estados para totales
  const [totalesDelDia, setTotalesDelDia] = useState({
    efectivo: 0,
    yape: 0,
    plin: 0,
    tarjeta: 0,
    total: 0,
    gananciaBruta: 0,
    gananciaReal: 0
  });

  const [devoluciones, setDevoluciones] = useState([]);
  const [devolucionesDelDia, setDevolucionesDelDia] = useState({
  totalDevuelto: 0,
  efectivo: 0,
  yape: 0,
  plin: 0,
  tarjeta: 0,
  delMismoDia: 0,
  deDiasAnteriores: 0,
  gananciaRealDescontada: 0
});

  const [dineroEnCaja, setDineroEnCaja] = useState({
    efectivoFisico: 0,
    digital: {
      yape: 0,
      plin: 0,
      tarjeta: 0
    },
    totalRetiros: 0
  });



  // Verificar permisos de usuario
  const isAdmin = user?.role === 'admin' || user?.email === 'admin@gmail.com';

  // Función para cargar dinero inicial del día
  const cargarDineroInicial = async (fecha) => {
    try {
      const fechaString = fecha.toISOString().split('T')[0];
      const dineroInicialDoc = await getDoc(doc(db, 'dineroInicial', fechaString));
      
      if (dineroInicialDoc.exists()) {
        const data = dineroInicialDoc.data();
        setDineroInicial(data.monto || 0);
      } else {
        setDineroInicial(0);
      }
    } catch (error) {
      console.error('Error al cargar dinero inicial:', error);
      setDineroInicial(0);
    }
  };

  // Función para establecer dinero inicial
  const establecerDineroInicial = async () => {
    if (!isAdmin) {
      alert('Solo el administrador puede establecer el dinero inicial');
      return;
    }

    if (cajaCerrada) {
      alert('No se puede modificar el dinero inicial. La caja del día ya está cerrada.');
      return;
    }

    if (!inputDineroInicial) {
      alert('Por favor ingrese el monto del dinero inicial');
      return;
    }

    const monto = parseFloat(inputDineroInicial);
    if (isNaN(monto) || monto < 0) {
      alert('El monto debe ser un número positivo o cero');
      return;
    }

    if (!window.confirm(`¿Confirma establecer S/. ${monto.toFixed(2)} como dinero inicial del día?`)) {
      return;
    }

    setProcessingDineroInicial(true);

    try {
      const fechaString = selectedDate.toISOString().split('T')[0];
      
      await setDoc(doc(db, 'dineroInicial', fechaString), {
        monto: monto,
        fecha: Timestamp.fromDate(selectedDate),
        fechaString: fechaString,
        establecidoPor: user.email,
        fechaCreacion: serverTimestamp()
      });

      setDineroInicial(monto);
      setInputDineroInicial('');
      setShowDineroInicialModal(false);
      alert('Dinero inicial establecido exitosamente');

    } catch (error) {
      console.error('Error al establecer dinero inicial:', error);
      alert('Error al establecer el dinero inicial: ' + error.message);
    } finally {
      setProcessingDineroInicial(false);
    }
  };

  // Función para verificar si la caja está cerrada
  const verificarCierreCaja = async (fecha) => {
    try {
      const fechaString = fecha.toISOString().split('T')[0]; // YYYY-MM-DD
      const cierreDoc = await getDoc(doc(db, 'cierresCaja', fechaString));
      setCajaCerrada(cierreDoc.exists());
    } catch (error) {
      console.error('Error al verificar cierre de caja:', error);
      setCajaCerrada(false);
    }
  };

  // Función corregida para cerrar la caja
const cerrarCaja = async () => {
  if (!isAdmin) {
    alert('Solo el administrador puede cerrar la caja');
    return;
  }

  if (!window.confirm('¿Está seguro de que desea cerrar la caja del día? Esta acción no se puede deshacer.')) {
    return;
  }

  setLoadingCierreCaja(true);

  try {
    const fechaString = selectedDate.toISOString().split('T')[0];
    
    // Función auxiliar para limpiar objetos de campos undefined
    const limpiarObjeto = (obj) => {
      const objetoLimpio = {};
      for (const [clave, valor] of Object.entries(obj)) {
        if (valor !== undefined && valor !== null && valor !== '') {
          // Si es un objeto Timestamp de Firebase, mantenerlo
          if (valor && typeof valor === 'object' && valor.toDate) {
            objetoLimpio[clave] = valor;
          } else if (typeof valor === 'object' && !Array.isArray(valor)) {
            // Si es un objeto, limpiar recursivamente
            const objetoAnidadoLimpio = limpiarObjeto(valor);
            if (Object.keys(objetoAnidadoLimpio).length > 0) {
              objetoLimpio[clave] = objetoAnidadoLimpio;
            }
          } else {
            objetoLimpio[clave] = valor;
          }
        }
      }
      return objetoLimpio;
    };

    // Preparar datos de devoluciones limpiando campos undefined
    const devolucionesLimpias = devoluciones.map(dev => limpiarObjeto({
      id: dev.id || '',
      numeroVenta: dev.numeroVenta || 'N/A',
      clienteNombre: dev.clienteNombre || 'Cliente no especificado',
      montoADevolver: typeof dev.montoADevolver === 'number' ? dev.montoADevolver : 0,
      metodoPagoOriginal: dev.metodoPagoOriginal || 'efectivo',
      estado: dev.estado || 'pendiente',
      fechaProcesamiento: dev.fechaProcesamiento || new Date(),
      descripcionMotivo: dev.descripcionMotivo || 'Sin descripción'
    }));

    // Preparar datos de retiros limpiando campos undefined
    const retirosLimpios = retiros.map(retiro => limpiarObjeto({
      id: retiro.id || '',
      monto: typeof retiro.monto === 'number' ? retiro.monto : 0,
      tipo: retiro.tipo || 'efectivo',
      motivo: retiro.motivo || 'Sin motivo especificado',
      fecha: retiro.fecha || new Date(),
      realizadoPor: retiro.realizadoPor || user?.email || 'Usuario no especificado'
    }));

    // Preparar datos de ventas limpiando campos undefined
    const ventasLimpias = ventas.map(venta => limpiarObjeto({
      id: venta.id || '',
      numeroVenta: venta.numeroVenta || 'N/A',
      clienteNombre: venta.clienteNombre || 'Cliente no especificado',
      totalVenta: typeof venta.totalVenta === 'number' ? venta.totalVenta : 0,
      metodoPago: venta.metodoPago || 'efectivo',
      fechaVenta: venta.fechaVenta || new Date()
    }));

    const cierreData = limpiarObjeto({
      fecha: Timestamp.fromDate(selectedDate),
      fechaString: fechaString,
      dineroInicial: typeof dineroInicial === 'number' ? dineroInicial : 0,
      totales: limpiarObjeto({
        efectivo: typeof totalesDelDia.efectivo === 'number' ? totalesDelDia.efectivo : 0,
        yape: typeof totalesDelDia.yape === 'number' ? totalesDelDia.yape : 0,
        plin: typeof totalesDelDia.plin === 'number' ? totalesDelDia.plin : 0,
        tarjeta: typeof totalesDelDia.tarjeta === 'number' ? totalesDelDia.tarjeta : 0,
        total: typeof totalesDelDia.total === 'number' ? totalesDelDia.total : 0,
        gananciaBruta: typeof totalesDelDia.gananciaBruta === 'number' ? totalesDelDia.gananciaBruta : 0,
        gananciaReal: typeof totalesDelDia.gananciaReal === 'number' ? totalesDelDia.gananciaReal : 0
      }),
      devoluciones: devolucionesLimpias,
      devolucionesDelDia: limpiarObjeto({
        totalDevuelto: typeof devolucionesDelDia.totalDevuelto === 'number' ? devolucionesDelDia.totalDevuelto : 0,
        efectivo: typeof devolucionesDelDia.efectivo === 'number' ? devolucionesDelDia.efectivo : 0,
        yape: typeof devolucionesDelDia.yape === 'number' ? devolucionesDelDia.yape : 0,
        plin: typeof devolucionesDelDia.plin === 'number' ? devolucionesDelDia.plin : 0,
        tarjeta: typeof devolucionesDelDia.tarjeta === 'number' ? devolucionesDelDia.tarjeta : 0
      }),
      retiros: retirosLimpios,
      ventas: ventasLimpias,
      resumenFinal: limpiarObjeto({
        totalVentas: ventas.length || 0,
        totalDevoluciones: devoluciones.length || 0,
        totalRetiros: retiros.length || 0,
        dineroInicial: typeof dineroInicial === 'number' ? dineroInicial : 0,
        efectivoFinal: Math.max(0, (dineroInicial || 0) + (totalesDelDia.efectivo || 0) - (dineroEnCaja.totalRetiros || 0)),
        digitalTotal: (totalesDelDia.yape || 0) + (totalesDelDia.plin || 0) + (totalesDelDia.tarjeta || 0),
        totalDevuelto: typeof devolucionesDelDia.totalDevuelto === 'number' ? devolucionesDelDia.totalDevuelto : 0
      }),
      cerradoPor: user?.email || 'Usuario no especificado',
      fechaCierre: serverTimestamp()
    });

    // Debug: mostrar los datos que se van a enviar
    console.log('Datos de cierre que se van a enviar:', cierreData);
    
    // Verificar si hay algún undefined en el nivel superior
    for (const [clave, valor] of Object.entries(cierreData)) {
      if (valor === undefined) {
        console.warn(`⚠️ Campo '${clave}' es undefined`);
        delete cierreData[clave]; // Eliminar el campo undefined
      }
    }

    await setDoc(doc(db, 'cierresCaja', fechaString), cierreData);
    
    setCajaCerrada(true);
    setShowCierreModal(false);
    alert('Caja cerrada exitosamente');

  } catch (error) {
    console.error('Error al cerrar la caja:', error);
    alert('Error al cerrar la caja: ' + error.message);
  } finally {
    setLoadingCierreCaja(false);
  }
};

// Función adicional para debug - agregar antes de la función cerrarCaja
const debugCierreCaja = () => {
  console.log('=== DEBUG CIERRE CAJA ===');
  console.log('Devoluciones:', devoluciones);
  console.log('DevolucionesDelDia:', devolucionesDelDia);
  console.log('Totales:', totalesDelDia);
  console.log('Dinero inicial:', dineroInicial);
  console.log('Dinero en caja:', dineroEnCaja);
  
  // Verificar si hay algún undefined en las devoluciones
  devoluciones.forEach((dev, index) => {
    console.log(`Devolución ${index}:`, dev);
    for (const [clave, valor] of Object.entries(dev)) {
      if (valor === undefined) {
        console.warn(`⚠️ Devolución ${index}, campo '${clave}' es undefined`);
      }
    }
  });
};

  // Función para generar reporte PDF
  // Función para generar reporte PDF y enviarlo por email - VERSIÓN CORREGIDA
  const generarReportePDF = async () => {
    try {
      setLoading(true);
      
      const { generarPDFCajaCompleta } = await import('../../components/utils/pdfGeneratorCaja');
      const fechaString = selectedDate.toISOString().split('T')[0];
      
      // Generar el PDF (descarga local)
      await generarPDFCajaCompleta(fechaString);
      
      // Enviar email con resumen de la caja
      await enviarResumenPorEmail(fechaString);
      
      alert('Reporte generado y resumen enviado por email exitosamente');
      
    } catch (error) {
      console.error('Error al generar y enviar resumen:', error);
      alert('Error al generar el reporte: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Función para enviar resumen por email - SIN ATTACHMENTS (actualizada con dinero inicial)
  const enviarResumenPorEmail = async (fechaString) => {
  try {
    const efectivoFinal = Math.max(0, dineroInicial + totalesDelDia.efectivo - dineroEnCaja.totalRetiros);
    
    const templateParams = {
      to_email: 'gestormotorep@gmail.com',
      subject: `Resumen de Caja - ${fechaString}`,
      fecha_caja: fechaString,
      dinero_inicial: formatCurrency(dineroInicial),
      total_dia: formatCurrency(totalesDelDia.total),
      efectivo: formatCurrency(totalesDelDia.efectivo),
      yape: formatCurrency(totalesDelDia.yape),
      plin: formatCurrency(totalesDelDia.plin),
      tarjeta: formatCurrency(totalesDelDia.tarjeta),
      ganancia_real: formatCurrency(totalesDelDia.gananciaReal),
      total_retiros: formatCurrency(dineroEnCaja.totalRetiros),
      total_devoluciones: formatCurrency(devolucionesDelDia.totalDevuelto), // NUEVO
      efectivo_final: formatCurrency(efectivoFinal),
      total_ventas: ventas.length,
      total_devoluciones_count: devoluciones.length, // NUEVO
      cerrado_por: user?.email || 'N/A',
      fecha_generacion: new Date().toLocaleString('es-PE'),
      detalle_retiros: retiros.length > 0 ? 
        retiros.map(r => `${r.tipo.toUpperCase()}: ${formatCurrency(r.monto)} - ${r.motivo}`).join('\n') 
        : 'No hubo retiros en el día',
      detalle_devoluciones: devoluciones.length > 0 ? // NUEVO
        devoluciones.map(d => `${d.metodoPagoOriginal?.toUpperCase()}: ${formatCurrency(d.montoADevolver)} - Venta: ${d.numeroVenta}`).join('\n')
        : 'No hubo devoluciones en el día'
    };

    const result = await emailjs.send(
      process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID,
      process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID,
      templateParams,
      process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY
    );

    console.log('Email enviado exitosamente:', result);
    
  } catch (error) {
    console.error('Error al enviar email:', error);
    throw new Error(`Error al enviar el resumen por email: ${error.text || error.message}`);
  }
};

  // Función para cargar items de ventas con campos ocultos
  const cargarItemsVentas = async (ventasList) => {
    const ventasConItems = [];
    
    for (const venta of ventasList) {
      try {
        // Cargar items de cada venta para obtener información de ganancia
        const itemsQuery = query(
          collection(db, 'ventas', venta.id, 'itemsVenta'),
          orderBy('createdAt', 'asc')
        );
        
        const itemsSnapshot = await getDocs(itemsQuery);
        const items = itemsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        ventasConItems.push({
          ...venta,
          items: items
        });
      } catch (error) {
        console.error(`Error al cargar items de venta ${venta.id}:`, error);
        // Si falla, incluir venta sin items
        ventasConItems.push({
          ...venta,
          items: []
        });
      }
    }
    
    return ventasConItems;
  };

  // Función mejorada para calcular totales con lógica de devoluciones diferenciada
const calcularTotalesConGananciaReal = async (ventasList, devolucionesList = []) => {
  let efectivo = 0, yape = 0, plin = 0, tarjeta = 0, total = 0;
  let gananciaBruta = 0, gananciaReal = 0;

  // Calcular totales de ventas (código existente)
  const ventasConItems = await cargarItemsVentas(ventasList);

  // Crear mapa de ventas del día para identificar devoluciones del mismo día
  const ventasDelDiaMap = new Map();
  ventasConItems.forEach(venta => {
    ventasDelDiaMap.set(venta.numeroVenta, venta);
  });

  ventasConItems.forEach(venta => {
    const totalVenta = parseFloat(venta.totalVenta || 0);
    total += totalVenta;
    gananciaBruta += totalVenta;

    if (venta.tipoVenta !== 'abono') {
      if (venta.gananciaTotalVenta && typeof venta.gananciaTotalVenta === 'number') {
        gananciaReal += venta.gananciaTotalVenta;
      } else if (venta.items && venta.items.length > 0) {
        const gananciaVenta = venta.items.reduce((gananciaItem, item) => {
          if (item.gananciaTotal && typeof item.gananciaTotal === 'number') {
            return gananciaItem + item.gananciaTotal;
          } else {
            const precioVenta = parseFloat(item.precioVentaUnitario || 0);
            const cantidad = parseInt(item.cantidad || 0);
            const subtotal = precioVenta * cantidad;
            const gananciaEstimada = subtotal * 0.4;
            return gananciaItem + gananciaEstimada;
          }
        }, 0);
        gananciaReal += gananciaVenta;
      } else {
        const gananciaEstimada = totalVenta * 0.4;
        gananciaReal += gananciaEstimada;
      }
    }

    // Clasificar por método de pago
    if (venta.paymentData && venta.paymentData.paymentMethods) {
      venta.paymentData.paymentMethods.forEach(pm => {
        const amount = parseFloat(pm.amount || 0);
        switch (pm.method?.toLowerCase()) {
          case 'efectivo': efectivo += amount; break;
          case 'yape': yape += amount; break;
          case 'plin': plin += amount; break;
          case 'tarjeta':
          case 'tarjeta_credito':
          case 'tarjeta_debito': tarjeta += amount; break;
          default: break;
        }
      });
    } else {
      switch (venta.metodoPago?.toLowerCase()) {
        case 'efectivo': efectivo += totalVenta; break;
        case 'yape': yape += totalVenta; break;
        case 'plin': plin += totalVenta; break;
        case 'tarjeta':
        case 'tarjeta_credito':
        case 'tarjeta_debito': tarjeta += totalVenta; break;
        default: break;
      }
    }
  });

  // NUEVA LÓGICA: Procesar devoluciones con distinción por fecha
  let devolucionesEfectivo = 0, devolucionesYape = 0, devolucionesPlin = 0, devolucionesTarjeta = 0;
  let totalDevuelto = 0;
  let gananciaRealDescontadaPorDevolucionesDelDia = 0;

  const devolucionesDelMismoDia = [];
  const devolucionesDeDiasAnteriores = [];

  // Clasificar devoluciones por fecha
  devolucionesList.forEach(devolucion => {
    if (devolucion.estado === 'aprobada') {
      const esDelMismoDia = ventasDelDiaMap.has(devolucion.numeroVenta);
      
      if (esDelMismoDia) {
        devolucionesDelMismoDia.push(devolucion);
      } else {
        devolucionesDeDiasAnteriores.push(devolucion);
      }
    }
  });

  // Procesar devoluciones del mismo día
for (const devolucion of devolucionesDelMismoDia) {
  const montoDevuelto = parseFloat(devolucion.montoADevolver || 0);
  totalDevuelto += montoDevuelto;
  
  // Restar de ganancia bruta
  gananciaBruta -= montoDevuelto;
  
  // CRÍTICO: Restar ganancia real del producto devuelto - MÉTODO CORREGIDO
  const ventaOriginal = ventasDelDiaMap.get(devolucion.numeroVenta);
  if (ventaOriginal) {
    const gananciaRealADescontar = await calcularGananciaRealADescontarPorDevolucion(devolucion, ventaOriginal);
    gananciaReal -= gananciaRealADescontar;
    gananciaRealDescontadaPorDevolucionesDelDia += gananciaRealADescontar;
  }
  
  // Clasificar por método de pago original (sin cambios)
  switch (devolucion.metodoPagoOriginal?.toLowerCase()) {
    case 'efectivo': 
      devolucionesEfectivo += montoDevuelto;
      efectivo -= montoDevuelto;
      break;
    case 'yape': 
      devolucionesYape += montoDevuelto;
      yape -= montoDevuelto;
      break;
    case 'plin': 
      devolucionesPlin += montoDevuelto;
      plin -= montoDevuelto;
      break;
    case 'tarjeta':
    case 'tarjeta_credito':
    case 'tarjeta_debito': 
      devolucionesTarjeta += montoDevuelto;
      tarjeta -= montoDevuelto;
      break;
  }
}


  // Procesar devoluciones de días anteriores
  for (const devolucion of devolucionesDeDiasAnteriores) {
    const montoDevuelto = parseFloat(devolucion.montoADevolver || 0);
    totalDevuelto += montoDevuelto;
    
    // SOLO restar de ganancia bruta (no de ganancia real)
    gananciaBruta -= montoDevuelto;
    
    // Clasificar por método de pago original
    switch (devolucion.metodoPagoOriginal?.toLowerCase()) {
      case 'efectivo': 
        devolucionesEfectivo += montoDevuelto;
        efectivo -= montoDevuelto;
        break;
      case 'yape': 
        devolucionesYape += montoDevuelto;
        yape -= montoDevuelto;
        break;
      case 'plin': 
        devolucionesPlin += montoDevuelto;
        plin -= montoDevuelto;
        break;
      case 'tarjeta':
      case 'tarjeta_credito':
      case 'tarjeta_debito': 
        devolucionesTarjeta += montoDevuelto;
        tarjeta -= montoDevuelto;
        break;
    }
  }

  // Actualizar estados
  setTotalesDelDia({
    efectivo: Math.max(0, efectivo),
    yape: Math.max(0, yape),
    plin: Math.max(0, plin),
    tarjeta: Math.max(0, tarjeta),
    total: total - totalDevuelto,
    gananciaBruta: Math.max(0, gananciaBruta),
    gananciaReal: Math.max(0, gananciaReal)
  });

  setDevolucionesDelDia({
    totalDevuelto,
    efectivo: devolucionesEfectivo,
    yape: devolucionesYape,
    plin: devolucionesPlin,
    tarjeta: devolucionesTarjeta,
    // NUEVOS CAMPOS PARA TRACKING
    delMismoDia: devolucionesDelMismoDia.length,
    deDiasAnteriores: devolucionesDeDiasAnteriores.length,
    gananciaRealDescontada: gananciaRealDescontadaPorDevolucionesDelDia
  });

  console.log('=== ANÁLISIS DE DEVOLUCIONES ===');
  console.log('Devoluciones del mismo día:', devolucionesDelMismoDia.length);
  console.log('Devoluciones de días anteriores:', devolucionesDeDiasAnteriores.length);
  console.log('Ganancia real descontada por devoluciones del día:', gananciaRealDescontadaPorDevolucionesDelDia);
};

// Función para marcar venta como parcial o totalmente devuelta
const actualizarEstadoVentaPorDevolucion = async (numeroVenta, montoDevuelto, montoTotalVenta) => {
  try {
    const ventaDoc = ventasList.find(v => v.numeroVenta === numeroVenta);
    if (!ventaDoc) return;

    const porcentajeDevuelto = (montoDevuelto / montoTotalVenta) * 100;
    let estadoDevolucion = 'sin_devolucion';
    
    if (porcentajeDevuelto >= 100) {
      estadoDevolucion = 'totalmente_devuelta';
    } else if (porcentajeDevuelto > 0) {
      estadoDevolucion = 'parcialmente_devuelta';
    }

    // Actualizar en Firestore
    await setDoc(doc(db, 'ventas', ventaDoc.id), {
      estadoDevolucion,
      montoDevuelto: montoDevuelto,
      fechaUltimaDevolucion: serverTimestamp()
    }, { merge: true });

    console.log(`Venta ${numeroVenta} marcada como: ${estadoDevolucion}`);

  } catch (error) {
    console.error('Error al actualizar estado de venta:', error);
  }
};

// Componente mejorado para mostrar devoluciones con más detalle
const DevolucionesDelDiaComponenteMejorado = () => {
  if (devoluciones.length === 0) return null;

  const devolucionesDelMismoDia = devoluciones.filter(dev => 
    ventas.some(venta => venta.numeroVenta === dev.numeroVenta)
  );
  
  const devolucionesDeDiasAnteriores = devoluciones.filter(dev => 
    !ventas.some(venta => venta.numeroVenta === dev.numeroVenta)
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <ArrowTrendingDownIcon className="h-6 w-6 text-orange-600 mr-2" />
        Devoluciones del Día ({devoluciones.length})
      </h3>

      {/* Resumen de devoluciones */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <p className="text-sm font-medium text-orange-800">Del Mismo Día</p>
          <p className="text-2xl font-bold text-orange-600">{devolucionesDelMismoDia.length}</p>
          <p className="text-xs text-orange-600">Afectan ganancia real</p>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <p className="text-sm font-medium text-yellow-800">Días Anteriores</p>
          <p className="text-2xl font-bold text-yellow-600">{devolucionesDeDiasAnteriores.length}</p>
          <p className="text-xs text-yellow-600">Solo afectan caja</p>
        </div>
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <p className="text-sm font-medium text-red-800">Total Devuelto</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(devolucionesDelDia.totalDevuelto)}</p>
          <p className="text-xs text-red-600">Impacto en caja</p>
        </div>
      </div>

      {/* Devoluciones del mismo día */}
      {devolucionesDelMismoDia.length > 0 && (
        <div className="mb-6">
          <h4 className="font-medium text-gray-900 mb-3 flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-orange-500 mr-1" />
            Devoluciones del Mismo Día ({devolucionesDelMismoDia.length})
          </h4>
          <div className="space-y-2">
            {devolucionesDelMismoDia.map((devolucion) => (
              <div key={devolucion.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border-l-4 border-orange-400">
                <div className="flex items-center space-x-3">
                  <MinusCircleIcon className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatCurrency(devolucion.montoADevolver)} - {devolucion.metodoPagoOriginal?.toUpperCase()}
                    </p>
                    <p className="text-sm text-gray-600">
                      Venta: {devolucion.numeroVenta} - {devolucion.clienteNombre}
                    </p>
                    <p className="text-xs text-orange-600">⚠️ Reduce ganancia real del día</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                    MISMO DÍA
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Devoluciones de días anteriores */}
      {devolucionesDeDiasAnteriores.length > 0 && (
        <div className="mb-6">
          <h4 className="font-medium text-gray-900 mb-3 flex items-center">
            <InformationCircleIcon className="h-5 w-5 text-yellow-500 mr-1" />
            Devoluciones de Días Anteriores ({devolucionesDeDiasAnteriores.length})
          </h4>
          <div className="space-y-2">
            {devolucionesDeDiasAnteriores.map((devolucion) => (
              <div key={devolucion.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                <div className="flex items-center space-x-3">
                  <MinusCircleIcon className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatCurrency(devolucion.montoADevolver)} - {devolucion.metodoPagoOriginal?.toUpperCase()}
                    </p>
                    <p className="text-sm text-gray-600">
                      Venta: {devolucion.numeroVenta} - {devolucion.clienteNombre}
                    </p>
                    <p className="text-xs text-yellow-600">ℹ️ Solo afecta dinero disponible</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    DÍAS ANTERIORES
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Impacto en ganancia real */}
      {devolucionesDelDia.gananciaRealDescontada > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mr-2" />
            <div>
              <p className="font-medium text-red-800">Impacto en Ganancia Real</p>
              <p className="text-sm text-red-700">
                Se descontó {formatCurrency(devolucionesDelDia.gananciaRealDescontada)} 
                de la ganancia real por devoluciones del mismo día
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Función para obtener el indicador visual de estado de venta
const obtenerIndicadorEstadoVenta = (venta, devoluciones) => {
  const devolucionesDeEstaVenta = devoluciones.filter(dev => 
    dev.numeroVenta === venta.numeroVenta && dev.estado === 'aprobada'
  );
  
  if (devolucionesDeEstaVenta.length === 0) {
    return null;
  }

  const totalDevuelto = devolucionesDeEstaVenta.reduce((sum, dev) => 
    sum + parseFloat(dev.montoADevolver || 0), 0
  );
  
  const porcentajeDevuelto = (totalDevuelto / parseFloat(venta.totalVenta || 1)) * 100;
  
  if (porcentajeDevuelto >= 100) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
        DEVUELTO TOTAL
      </span>
    );
  } else if (porcentajeDevuelto > 0) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
        DEVUELTO PARCIAL ({porcentajeDevuelto.toFixed(1)}%)
      </span>
    );
  }
  
  return null;
};

// FUNCIÓN ACTUALIZADA: obtenerDetalleGanancia - Usa ganancias específicas de devoluciones
const obtenerDetalleGanancia = async (ventaId) => {
  try {
    // Buscar la venta en el array local primero
    const venta = ventas.find(v => v.id === ventaId);
    if (!venta) {
      return {
        gananciaTotal: 0,
        metodoCalculo: 'error',
        items: [],
        error: 'Venta no encontrada'
      };
    }

    // Cargar items de la venta
    const itemsQuery = query(
      collection(db, 'ventas', ventaId, 'itemsVenta'),
      orderBy('createdAt', 'asc')
    );
    
    const itemsSnapshot = await getDocs(itemsQuery);
    const items = itemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    let gananciaTotal = 0;
    let metodoCalculo = 'estimado';

    // Calcular ganancia original de la venta
    if (venta.gananciaTotalVenta && typeof venta.gananciaTotalVenta === 'number') {
      gananciaTotal = venta.gananciaTotalVenta;
      metodoCalculo = 'campo_oculto_venta';
    } else if (items.length > 0) {
      let tieneGananciaReal = false;
      gananciaTotal = items.reduce((total, item) => {
        if (item.gananciaTotal && typeof item.gananciaTotal === 'number') {
          tieneGananciaReal = true;
          return total + item.gananciaTotal;
        } else {
          const precioVenta = parseFloat(item.precioVentaUnitario || 0);
          const cantidad = parseInt(item.cantidad || 0);
          const subtotal = precioVenta * cantidad;
          const gananciaEstimada = subtotal * 0.4;
          return total + gananciaEstimada;
        }
      }, 0);
      
      metodoCalculo = tieneGananciaReal ? 'campos_ocultos_items' : 'estimado';
    } else {
      gananciaTotal = parseFloat(venta.totalVenta || 0) * 0.4;
      metodoCalculo = 'estimado';
    }

    // ACTUALIZADO: Buscar devoluciones con ganancias específicas
    const devolucionesDeEstaVenta = devoluciones.filter(dev => 
      dev.numeroVenta === venta.numeroVenta && dev.estado === 'aprobada'
    );

    let gananciaAfectadaPorDevoluciones = 0;
    let detallesDevoluciones = [];

    if (devolucionesDeEstaVenta.length > 0) {
      for (const devolucion of devolucionesDeEstaVenta) {
        let gananciaEstaDevolucion = 0;
        
        // PRIORIDAD 1: Usar gananciaRealAfectada si existe (campo global de la devolución)
        if (devolucion.gananciaRealAfectada && typeof devolucion.gananciaRealAfectada === 'number') {
          gananciaEstaDevolucion = devolucion.gananciaRealAfectada;
          console.log(`✅ Usando gananciaRealAfectada: ${gananciaEstaDevolucion}`);
        } else {
          // PRIORIDAD 2: Cargar items específicos de la devolución
          try {
            const itemsDevolucionQuery = query(
              collection(db, 'devoluciones', devolucion.id, 'itemsDevolucion'),
              orderBy('createdAt', 'asc')
            );
            
            const itemsDevolucionSnapshot = await getDocs(itemsDevolucionQuery);
            const itemsDevolucion = itemsDevolucionSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            
            if (itemsDevolucion.length > 0) {
              // Sumar ganancia específica de cada item devuelto
              gananciaEstaDevolucion = itemsDevolucion.reduce((total, item) => {
                // Usar gananciaDevolucion (más específico)
                if (item.gananciaDevolucion && typeof item.gananciaDevolucion === 'number') {
                  return total + item.gananciaDevolucion;
                }
                
                // Usar gananciaUnitaria × cantidadADevolver
                if (item.gananciaUnitaria && typeof item.gananciaUnitaria === 'number') {
                  const cantidadDevuelta = parseInt(item.cantidadADevolver || item.cantidad || 0);
                  return total + (item.gananciaUnitaria * cantidadDevuelta);
                }
                
                // Usar gananciaTotal del item si existe
                if (item.gananciaTotal && typeof item.gananciaTotal === 'number') {
                  return total + item.gananciaTotal;
                }
                
                // Fallback: estimación
                console.warn(`⚠️ Item sin ganancia específica: ${item.nombreProducto}`);
                const precioVenta = parseFloat(item.precioVentaUnitario || 0);
                const cantidad = parseInt(item.cantidadADevolver || item.cantidad || 0);
                const subtotal = precioVenta * cantidad;
                return total + (subtotal * 0.4);
              }, 0);
              
              console.log(`✅ Ganancia calculada desde items: ${gananciaEstaDevolucion}`);
            } else {
              // FALLBACK: Método proporcional anterior
              console.warn(`⚠️ Sin items específicos, usando proporción para devolución ${devolucion.id}`);
              const proporcionDevuelta = parseFloat(devolucion.montoADevolver || 0) / parseFloat(venta.totalVenta || 1);
              gananciaEstaDevolucion = gananciaTotal * proporcionDevuelta;
            }
            
          } catch (error) {
            console.error(`Error al cargar items de devolución ${devolucion.id}:`, error);
            // Último fallback: proporción
            const proporcionDevuelta = parseFloat(devolucion.montoADevolver || 0) / parseFloat(venta.totalVenta || 1);
            gananciaEstaDevolucion = gananciaTotal * proporcionDevuelta;
          }
        }
        
        gananciaAfectadaPorDevoluciones += gananciaEstaDevolucion;
        
        // Guardar detalles de esta devolución
        detallesDevoluciones.push({
          ...devolucion,
          gananciaAfectadaCalculada: gananciaEstaDevolucion
        });
        
        console.log(`📊 Devolución ${devolucion.numeroDevolucion || devolucion.id}: ganancia afectada = ${gananciaEstaDevolucion}`);
      }
    }

    const gananciaFinal = Math.max(0, gananciaTotal - gananciaAfectadaPorDevoluciones);
    
    console.log(`=== RESUMEN DETALLE GANANCIA VENTA ${venta.numeroVenta} ===`);
    console.log(`Ganancia original: ${gananciaTotal}`);
    console.log(`Ganancia afectada por devoluciones: ${gananciaAfectadaPorDevoluciones}`);
    console.log(`Ganancia final: ${gananciaFinal}`);

    return {
      gananciaTotal,
      gananciaAfectadaPorDevoluciones,
      gananciaFinal,
      metodoCalculo,
      items,
      devoluciones: detallesDevoluciones,
      tieneDevoluciones: devolucionesDeEstaVenta.length > 0,
      
      // Campos adicionales para debugging
      devolucionesCount: devolucionesDeEstaVenta.length,
      usaGananciasEspecificas: devolucionesDeEstaVenta.some(dev => 
        dev.gananciaRealAfectada || dev.itemsDevolucion?.length > 0
      )
    };

  } catch (error) {
    console.error('Error al obtener detalle de ganancia:', error);
    return {
      gananciaTotal: 0,
      metodoCalculo: 'error',
      items: [],
      error: error.message
    };
  }
};


// FUNCIÓN AUXILIAR: Verificar consistencia de datos
const verificarConsistenciaGananciaDevoluciones = async (ventaId) => {
  try {
    const detalle = await obtenerDetalleGanancia(ventaId);
    const venta = ventas.find(v => v.id === ventaId);
    
    if (!venta || !detalle.tieneDevoluciones) {
      console.log('✅ Venta sin devoluciones o no encontrada');
      return true;
    }
    
    console.log('=== VERIFICACIÓN DE CONSISTENCIA ===');
    console.log(`Venta: ${venta.numeroVenta}`);
    console.log(`Ganancia original: ${detalle.gananciaTotal}`);
    console.log(`Ganancia afectada: ${detalle.gananciaAfectadaPorDevoluciones}`);
    console.log(`Ganancia final: ${detalle.gananciaFinal}`);
    
    // Verificar que la ganancia afectada no sea mayor que la original
    if (detalle.gananciaAfectadaPorDevoluciones > detalle.gananciaTotal) {
      console.warn('⚠️ INCONSISTENCIA: Ganancia afectada mayor que ganancia original');
      return false;
    }
    
    // Verificar que la ganancia final no sea negativa
    if (detalle.gananciaFinal < 0) {
      console.warn('⚠️ INCONSISTENCIA: Ganancia final negativa');
      return false;
    }
    
    console.log('✅ Consistencia verificada');
    return true;
    
  } catch (error) {
    console.error('Error al verificar consistencia:', error);
    return false;
  }
};

// FUNCIÓN DE DEBUG: Para inspeccionar una devolución específica
const debugDevolucion = async (devolucionId) => {
  try {
    const devolucion = devoluciones.find(d => d.id === devolucionId);
    if (!devolucion) {
      console.log('Devolución no encontrada');
      return;
    }
    
    console.log('=== DEBUG DEVOLUCIÓN ===');
    console.log('ID:', devolucion.id);
    console.log('Número:', devolucion.numeroDevolucion);
    console.log('Venta:', devolucion.numeroVenta);
    console.log('Monto devuelto:', devolucion.montoADevolver);
    console.log('Ganancia real afectada:', devolucion.gananciaRealAfectada);
    
    // Cargar items de la devolución
    const itemsQuery = query(
      collection(db, 'devoluciones', devolucionId, 'itemsDevolucion'),
      orderBy('createdAt', 'asc')
    );
    
    const itemsSnapshot = await getDocs(itemsQuery);
    const items = itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log('Items devueltos:', items.length);
    items.forEach((item, index) => {
      console.log(`Item ${index + 1}:`, {
        nombre: item.nombreProducto,
        cantidad: item.cantidadADevolver,
        gananciaUnitaria: item.gananciaUnitaria,
        gananciaDevolucion: item.gananciaDevolucion,
        gananciaTotal: item.gananciaTotal
      });
    });
    
  } catch (error) {
    console.error('Error en debug:', error);
  }
};


// COMPONENTE MEJORADO: Análisis de Ganancia con debugging
const AnalisisGananciaComponent = ({ detalle }) => {
  if (!detalle) return null;

  return (
    <div className="bg-blue-50 p-4 rounded-lg">
      <h4 className="font-medium text-gray-900 mb-3">Análisis de Ganancia</h4>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Ganancia Original:</span>
          <span className="font-semibold text-blue-600">{formatCurrency(detalle.gananciaTotal || 0)}</span>
        </div>
        
        {detalle.tieneDevoluciones && (
          <>
            <div className="flex justify-between items-center text-red-600">
              <span className="text-sm">Afectada por Devoluciones:</span>
              <span className="font-semibold">-{formatCurrency(detalle.gananciaAfectadaPorDevoluciones || 0)}</span>
            </div>
            
          
            
            <hr className="border-gray-300" />
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Ganancia Final:</span>
              <span className="font-bold text-green-600 text-lg">{formatCurrency(detalle.gananciaFinal || 0)}</span>
            </div>
          </>
        )}
        
        {!detalle.tieneDevoluciones && (
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Ganancia Final:</span>
            <span className="font-bold text-green-600 text-lg">{formatCurrency(detalle.gananciaTotal || 0)}</span>
          </div>
        )}
      </div>
      
      
    </div>
  );
};


// FUNCIÓN DE DEBUGGING: Para usar en desarrollo
const debugGananciaVenta = async (venta) => {
  console.log(`=== DEBUG GANANCIA VENTA ${venta.numeroVenta} ===`);
  
  const detalle = await obtenerDetalleGanancia(venta.id);
  
  console.log('Detalle completo:', detalle);
  
  if (detalle.tieneDevoluciones) {
    console.log('Devoluciones encontradas:', detalle.devoluciones.length);
    
    detalle.devoluciones.forEach((dev, index) => {
      console.log(`Devolución ${index + 1}:`, {
        id: dev.id,
        numeroDevolucion: dev.numeroDevolucion,
        montoADevolver: dev.montoADevolver,
        gananciaRealAfectada: dev.gananciaRealAfectada,
        gananciaAfectadaCalculada: dev.gananciaAfectadaCalculada
      });
    });
  }
  
  // Verificar consistencia
  await verificarConsistenciaGananciaDevoluciones(venta.id);
};




  // ACTUALIZAR EL MODAL para incluir el nuevo componente
const ModalDetalleGananciaMejorado = ({ show, onClose, data }) => {
  if (!show || !data) return null;

  const { venta, detalle } = data;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <InformationCircleIcon className="h-6 w-6 text-blue-600 mr-2" />
              Detalle Completo de Venta
            </h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
          </div>
          
          <div className="space-y-6 max-h-96 overflow-y-auto">
            {/* Información básica de la venta */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Información de la Venta</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600"><strong>N° Venta:</strong> {venta.numeroVenta || 'N/A'}</p>
                  <p className="text-gray-600"><strong>Cliente:</strong> {venta.clienteNombre}</p>
                  <p className="text-gray-600"><strong>Fecha:</strong> {venta.fechaVenta?.toLocaleString('es-PE')}</p>
                </div>
                <div>
                  <p className="text-gray-600"><strong>Total Venta:</strong> {formatCurrency(venta.totalVenta)}</p>
                  <p className="text-gray-600"><strong>Método Pago:</strong> {venta.metodoPago?.toUpperCase()}</p>
                  <p className="text-gray-600"><strong>Tipo Venta:</strong> {venta.tipoVenta || 'Normal'}</p>
                </div>
              </div>
            </div>

            {/* USAR EL NUEVO COMPONENTE DE ANÁLISIS */}
            <AnalisisGananciaComponent detalle={detalle} />

            {/* Devoluciones asociadas */}
            {detalle?.tieneDevoluciones && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <h4 className="font-medium text-red-900 mb-3 flex items-center">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-600 mr-1" />
                  Devoluciones Asociadas ({detalle.devoluciones.length})
                </h4>
                <div className="space-y-2">
                  {detalle.devoluciones.map((devolucion, index) => (
                    <div key={index} className="bg-white p-3 rounded border border-red-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Devuelto: {formatCurrency(devolucion.montoADevolver)}
                          </p>
                          <p className="text-xs text-gray-600">
                            Método: {devolucion.metodoPagoOriginal?.toUpperCase()}
                          </p>
                          {/* NUEVO: Mostrar ganancia afectada específica */}
                          <p className="text-xs text-red-600 font-medium">
                            Ganancia afectada: {formatCurrency(devolucion.gananciaAfectadaCalculada || 0)}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            devolucion.estado === 'aprobada' 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {devolucion.estado?.toUpperCase()}
                          </span>
                          <p className="text-xs text-gray-400 mt-1">
                            {devolucion.fechaProcesamiento?.toLocaleDateString('es-PE')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Desglose por items - mantener igual */}
            {detalle?.items && detalle.items.length > 0 && (
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Desglose por Productos ({detalle.items.length})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {detalle.items.map((item, index) => (
                    <div key={index} className="bg-white p-2 rounded border border-green-200 text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">{item.nombreProducto || 'Producto N/A'}</span>
                        <span className="text-green-600">
                          {item.gananciaTotal && typeof item.gananciaTotal === 'number' 
                            ? formatCurrency(item.gananciaTotal)
                            : `~${formatCurrency((parseFloat(item.precioVentaUnitario || 0) * parseInt(item.cantidad || 0)) * 0.4)}`
                          }
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        Cantidad: {item.cantidad} × {formatCurrency(item.precioVentaUnitario || 0)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
          
          <div className="flex justify-end mt-6">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

  // Componente para mostrar indicador de precisión de ganancia
  const IndicadorPrecisionGanancia = ({ metodoCalculo }) => {
    switch (metodoCalculo) {
      case 'campo_oculto_venta':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            ✓ Ganancia Real
          </span>
        );
      case 'campos_ocultos_items':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            ✓ Calculada
          </span>
        );
      case 'estimado':
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            ~ Estimada
          </span>
        );
    }
  };

  // FUNCIÓN ACTUALIZADA para usar la ganancia específica de cada item devuelto
const calcularGananciaRealADescontarPorDevolucion = async (devolucion, ventaOriginal) => {
  try {
    let gananciaRealADescontar = 0;
    
    // CASO 1: Si la devolución ya tiene gananciaRealAfectada calculada (nuevo sistema)
    if (devolucion.gananciaRealAfectada && typeof devolucion.gananciaRealAfectada === 'number') {
      console.log(`✅ Usando gananciaRealAfectada precalculada: ${devolucion.gananciaRealAfectada}`);
      return devolucion.gananciaRealAfectada;
    }
    
    // CASO 2: Cargar items específicos de la devolución desde su subcolección
    try {
      const itemsDevolucionQuery = query(
        collection(db, 'devoluciones', devolucion.id, 'itemsDevolucion'),
        orderBy('createdAt', 'asc')
      );
      
      const itemsDevolucionSnapshot = await getDocs(itemsDevolucionQuery);
      const itemsDevolucion = itemsDevolucionSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      if (itemsDevolucion.length > 0) {
        // NUEVO: Usar ganancia específica de cada item devuelto
        gananciaRealADescontar = itemsDevolucion.reduce((total, item) => {
          // Priorizar gananciaDevolucion (más específico)
          if (item.gananciaDevolucion && typeof item.gananciaDevolucion === 'number') {
            return total + item.gananciaDevolucion;
          }
          
          // Usar gananciaUnitaria × cantidadADevolver
          if (item.gananciaUnitaria && typeof item.gananciaUnitaria === 'number') {
            const cantidadDevuelta = parseInt(item.cantidadADevolver || item.cantidad || 0);
            return total + (item.gananciaUnitaria * cantidadDevuelta);
          }
          
          // Fallback: usar gananciaTotal del item si existe
          if (item.gananciaTotal && typeof item.gananciaTotal === 'number') {
            return total + item.gananciaTotal;
          }
          
          // Último recurso: estimación
          console.warn(`⚠️ Item sin ganancia específica, estimando: ${item.nombreProducto}`);
          const precioVenta = parseFloat(item.precioVentaUnitario || 0);
          const cantidad = parseInt(item.cantidadADevolver || item.cantidad || 0);
          const subtotal = precioVenta * cantidad;
          return total + (subtotal * 0.4);
        }, 0);
        
        console.log(`✅ Ganancia calculada desde items específicos: ${gananciaRealADescontar}`);
        return Math.max(0, gananciaRealADescontar);
      }
    } catch (error) {
      console.error('Error al cargar items de devolución:', error);
    }
    
    // CASO 3: Método anterior (proporción) - solo si no hay items específicos
    try {
      const itemsQuery = query(
        collection(db, 'ventas', ventaOriginal.id, 'itemsVenta'),
        orderBy('createdAt', 'asc')
      );
      
      const itemsSnapshot = await getDocs(itemsQuery);
      const items = itemsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      if (items.length > 0) {
        let gananciaTotalVentaReal = 0;
        let tieneGananciasReales = false;
        
        items.forEach(item => {
          if (item.gananciaTotal && typeof item.gananciaTotal === 'number') {
            gananciaTotalVentaReal += item.gananciaTotal;
            tieneGananciasReales = true;
          } else if (item.gananciaUnitaria && typeof item.gananciaUnitaria === 'number') {
            const cantidad = parseInt(item.cantidad || 0);
            gananciaTotalVentaReal += (item.gananciaUnitaria * cantidad);
            tieneGananciasReales = true;
          } else {
            const precioVenta = parseFloat(item.precioVentaUnitario || 0);
            const cantidad = parseInt(item.cantidad || 0);
            const subtotal = precioVenta * cantidad;
            gananciaTotalVentaReal += (subtotal * 0.4);
          }
        });
        
        if (tieneGananciasReales) {
          const proporcionDevuelta = parseFloat(devolucion.montoADevolver || 0) / parseFloat(ventaOriginal.totalVenta || 1);
          gananciaRealADescontar = gananciaTotalVentaReal * proporcionDevuelta;
          console.log(`⚠️ Usando método proporcional (fallback): ${gananciaRealADescontar}`);
        } else {
          gananciaRealADescontar = parseFloat(devolucion.montoADevolver || 0) * 0.4;
          console.log(`⚠️ Usando estimación general: ${gananciaRealADescontar}`);
        }
        
      } else {
        gananciaRealADescontar = parseFloat(devolucion.montoADevolver || 0) * 0.4;
        console.log(`⚠️ Sin items, usando estimación: ${gananciaRealADescontar}`);
      }
      
    } catch (error) {
      console.error('Error al cargar items para calcular ganancia:', error);
      gananciaRealADescontar = parseFloat(devolucion.montoADevolver || 0) * 0.4;
      console.log(`❌ Error, usando estimación: ${gananciaRealADescontar}`);
    }
    
    console.log(`=== RESUMEN CÁLCULO GANANCIA DEVOLUCIÓN ===`);
    console.log(`Devolución: ${devolucion.numeroDevolucion || devolucion.id}`);
    console.log(`Venta: ${ventaOriginal.numeroVenta}`);
    console.log(`Monto devuelto: ${devolucion.montoADevolver}`);
    console.log(`Ganancia real a descontar: ${gananciaRealADescontar}`);
    
    return Math.max(0, gananciaRealADescontar);
    
  } catch (error) {
    console.error('Error general al calcular ganancia a descontar:', error);
    return 0;
  }
};

// FUNCIÓN ADICIONAL: Verificar integridad de datos de devolución
const verificarIntegridadDevolucion = (devolucion) => {
  const problemas = [];
  
  if (!devolucion.gananciaRealAfectada) {
    problemas.push('No tiene gananciaRealAfectada');
  }
  
  if (!devolucion.metodoPagoOriginal) {
    problemas.push('No tiene metodoPagoOriginal');
  }
  
  if (!devolucion.numeroVenta) {
    problemas.push('No tiene numeroVenta');
  }
  
  if (problemas.length > 0) {
    console.warn(`⚠️ Problemas en devolución ${devolucion.id}:`, problemas);
    return false;
  }
  
  return true;
};

// FUNCIÓN DE MIGRACIÓN: Para actualizar devoluciones existentes (opcional)
const migrarDevolucionesExistentes = async () => {
  try {
    console.log('🔄 Iniciando migración de devoluciones...');
    
    const devolucionesQuery = query(
      collection(db, 'devoluciones'),
      where('gananciaRealAfectada', '==', null)
    );
    
    const snapshot = await getDocs(devolucionesQuery);
    let migradas = 0;
    
    for (const doc of snapshot.docs) {
      const devolucion = { id: doc.id, ...doc.data() };
      
      // Buscar venta original
      const ventasQuery = query(
        collection(db, 'ventas'),
        where('numeroVenta', '==', devolucion.numeroVenta)
      );
      
      const ventasSnapshot = await getDocs(ventasQuery);
      if (ventasSnapshot.empty) continue;
      
      const ventaOriginal = { 
        id: ventasSnapshot.docs[0].id, 
        ...ventasSnapshot.docs[0].data() 
      };
      
      // Calcular ganancia real afectada
      const gananciaRealAfectada = await calcularGananciaRealADescontarPorDevolucion(devolucion, ventaOriginal);
      
      // Actualizar devolución
      await setDoc(doc.ref, {
        gananciaRealAfectada: gananciaRealAfectada,
        fechaMigracion: serverTimestamp()
      }, { merge: true });
      
      migradas++;
      console.log(`✅ Migrada devolución ${devolucion.numeroDevolucion}: ${gananciaRealAfectada}`);
    }
    
    console.log(`🎉 Migración completada. ${migradas} devoluciones actualizadas.`);
    
  } catch (error) {
    console.error('❌ Error en migración:', error);
  }
};

  // 3. MODIFICAR EL useEffect PRINCIPAL para incluir devoluciones
useEffect(() => {
  if (!user) {
    router.push('/auth');
    return;
  }

  setLoading(true);
  setError(null);

  verificarCierreCaja(selectedDate);
  cargarDineroInicial(selectedDate);

  const startOfDay = new Date(selectedDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(selectedDate);
  endOfDay.setHours(23, 59, 59, 999);

  // Query de ventas (existente)
  const ventasQuery = query(
    collection(db, 'ventas'),
    where('fechaVenta', '>=', Timestamp.fromDate(startOfDay)),
    where('fechaVenta', '<=', Timestamp.fromDate(endOfDay)),
    where('estado', '==', 'completada'),
    orderBy('fechaVenta', 'desc')
  );

  // NUEVO: Query de devoluciones
  const devolucionesQuery = query(
    collection(db, 'devoluciones'),
    where('fechaProcesamiento', '>=', Timestamp.fromDate(startOfDay)),
    where('fechaProcesamiento', '<=', Timestamp.fromDate(endOfDay)),
    where('estado', 'in', ['aprobada', 'procesada']),
    orderBy('fechaProcesamiento', 'desc')
  );

  let ventasList = [];
  let devolucionesList = [];

  const unsubscribeVentas = onSnapshot(ventasQuery, async (snapshot) => {
    ventasList = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fechaVenta: doc.data().fechaVenta?.toDate ? doc.data().fechaVenta.toDate() : new Date(),
    }));
    
    setVentas(ventasList);
    
    // Recalcular con devoluciones
    await calcularTotalesConGananciaReal(ventasList, devolucionesList);
    setLoading(false);
  }, (err) => {
    console.error("Error fetching ventas:", err);
    setError("Error al cargar las ventas: " + err.message);
    setLoading(false);
  });

  // NUEVO: Listener para devoluciones
  const unsubscribeDevoluciones = onSnapshot(devolucionesQuery, async (snapshot) => {
    devolucionesList = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fechaProcesamiento: doc.data().fechaProcesamiento?.toDate ? doc.data().fechaProcesamiento.toDate() : new Date(),
    }));
    
    setDevoluciones(devolucionesList);
    
    // Recalcular totales con devoluciones
    if (ventasList.length > 0 || devolucionesList.length > 0) {
      await calcularTotalesConGananciaReal(ventasList, devolucionesList);
    }
  }, (err) => {
    console.error("Error fetching devoluciones:", err);
  });

  // Query de retiros (existente, sin cambios)
  const retirosQuery = query(
    collection(db, 'retiros'),
    where('fecha', '>=', Timestamp.fromDate(startOfDay)),
    where('fecha', '<=', Timestamp.fromDate(endOfDay)),
    orderBy('fecha', 'desc')
  );

  const unsubscribeRetiros = onSnapshot(retirosQuery, (snapshot) => {
    const retirosList = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fecha: doc.data().fecha?.toDate ? doc.data().fecha.toDate() : new Date(),
    }));
    
    setRetiros(retirosList);
    calcularRetiros(retirosList);
  }, (err) => {
    console.error("Error fetching retiros:", err);
  });

  return () => {
    unsubscribeVentas();
    unsubscribeDevoluciones(); // NUEVO
    unsubscribeRetiros();
  };
}, [user, router, selectedDate]);

  // 4. MODIFICAR LA FUNCIÓN calcularRetiros para considerar devoluciones
const calcularRetiros = (retirosList) => {
  const totalRetiros = retirosList.reduce((total, retiro) => {
    return total + parseFloat(retiro.monto || 0);
  }, 0);

  // MODIFICADO: Considerar devoluciones en el cálculo de efectivo físico
  const efectivoDisponible = dineroInicial + totalesDelDia.efectivo - totalRetiros;

  setDineroEnCaja(prev => ({
    ...prev,
    totalRetiros,
    efectivoFisico: Math.max(0, efectivoDisponible)
  }));
};

  const handleRetiroDinero = async () => {
    if (!isAdmin) {
      alert('Solo el administrador puede realizar retiros de dinero');
      return;
    }

    if (cajaCerrada) {
      alert('No se pueden realizar retiros. La caja del día ya está cerrada.');
      return;
    }

    if (!retiroAmount || !retiroMotivo.trim()) {
      alert('Por favor complete todos los campos');
      return;
    }

    const monto = parseFloat(retiroAmount);
    if (isNaN(monto) || monto <= 0) {
      alert('El monto debe ser un número positivo');
      return;
    }

    // Verificar si hay suficiente dinero disponible - ACTUALIZADO: incluye dinero inicial para efectivo
    const disponible = retiroTipo === 'efectivo' 
      ? dineroInicial + totalesDelDia.efectivo - dineroEnCaja.totalRetiros
      : retiroTipo === 'yape' ? totalesDelDia.yape
      : retiroTipo === 'plin' ? totalesDelDia.plin
      : totalesDelDia.tarjeta;

    if (monto > disponible) {
      alert(`No hay suficiente dinero disponible en ${retiroTipo.toUpperCase()}. Disponible: S/. ${disponible.toFixed(2)}`);
      return;
    }

    if (!window.confirm(`¿Confirma el retiro de S/. ${monto.toFixed(2)} en ${retiroTipo.toUpperCase()}?`)) {
      return;
    }

    setProcessingRetiro(true);

    try {
      await addDoc(collection(db, 'retiros'), {
        monto: monto,
        tipo: retiroTipo,
        motivo: retiroMotivo.trim(),
        fecha: serverTimestamp(),
        realizadoPor: user.email,
        fechaSeleccionada: Timestamp.fromDate(selectedDate)
      });

      // Limpiar formulario
      setRetiroAmount('');
      setRetiroMotivo('');
      setShowRetiroModal(false);
      alert('Retiro registrado exitosamente');

    } catch (error) {
      console.error('Error al registrar retiro:', error);
      alert('Error al registrar el retiro: ' + error.message);
    } finally {
      setProcessingRetiro(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount || 0);
  };

  const getPaymentMethodIcon = (method) => {
    switch (method?.toLowerCase()) {
      case 'efectivo':
        return <BanknotesIcon className="h-8 w-8" />;
      case 'yape':
        return <DevicePhoneMobileIcon className="h-8 w-8 text-purple-600" />;
      case 'plin':
        return <DevicePhoneMobileIcon className="h-8 w-8 text-blue-600" />;
      case 'tarjeta':
      case 'tarjeta_credito':
      case 'tarjeta_debito':
        return <CreditCardIcon className="h-8 w-8" />;
      default:
        return <CurrencyDollarIcon className="h-8 w-8" />;
    }
  };

  const DevolucionesDelDiaComponent = () => {
  if (devoluciones.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <ArrowTrendingDownIcon className="h-6 w-6 text-orange-600 mr-2" />
        Devoluciones del Día
      </h3>
      
      <div className="space-y-3">
        {devoluciones.map((devolucion) => (
          <div key={devolucion.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
            <div className="flex items-center space-x-3">
              <MinusCircleIcon className="h-5 w-5 text-orange-600" />
              <div>
                <p className="font-medium text-gray-900">
                  {formatCurrency(devolucion.montoADevolver)} - {devolucion.metodoPagoOriginal?.toUpperCase()}
                </p>
                <p className="text-sm text-gray-600">
                  Venta: {devolucion.numeroVenta} - {devolucion.clienteNombre}
                </p>
                <p className="text-xs text-gray-500">{devolucion.descripcionMotivo}</p>
              </div>
            </div>
            <div className="text-right">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                devolucion.estado === 'aprobada' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {devolucion.estado?.toUpperCase()}
              </span>
              <p className="text-xs text-gray-400 mt-1">
                {devolucion.fechaProcesamiento?.toLocaleTimeString('es-PE', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-right font-semibold text-orange-600">
          Total Devuelto: {formatCurrency(devolucionesDelDia.totalDevuelto)}
        </p>
      </div>
    </div>
  );
};

const mostrarDetalleGanancia = async (venta) => {
  try {
    setLoading(true); // Opcional: mostrar loading mientras se carga
    const detalle = await obtenerDetalleGanancia(venta.id);
    setDetalleGananciaData({
      venta: venta,
      detalle: detalle
    });
    setShowDetalleGanancia(true);
  } catch (error) {
    console.error('Error al mostrar detalle de ganancia:', error);
    alert('Error al cargar los detalles de la venta: ' + error.message);
  } finally {
    setLoading(false);
  }
};


  

  if (loading) {
    return (
      <Layout title="Caja">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Caja">
      <div className="flex flex-col mx-4 py-4 space-y-6">
        
        {/* Header con selector de fecha */}
<div className="bg-white rounded-lg shadow-md p-4 lg:p-6">
  <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
    {/* Título y estado */}
    <div className="flex items-center justify-center lg:justify-start space-x-3">
      <BuildingStorefrontIcon className="h-6 w-6 lg:h-8 lg:w-8 text-green-600" />
      <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Caja del Día</h1>
      {cajaCerrada && (
        <span className="inline-flex items-center px-2 py-1 lg:px-3 lg:py-1 rounded-full text-xs lg:text-sm font-medium bg-red-100 text-red-800">
          <LockClosedIcon className="h-3 w-3 lg:h-4 lg:w-4 mr-1" />
          Cerrada
        </span>
      )}
    </div>
    
    {/* Controles */}
    <div className="flex flex-col sm:flex-row lg:flex-row items-stretch lg:items-center gap-3 lg:gap-4">
      {/* Selector de fecha */}
      <div className="flex items-center justify-center space-x-2">
        <CalendarIcon className="h-4 w-4 lg:h-5 lg:w-5 text-gray-500" />
        <DatePicker
          selected={selectedDate}
          onChange={(date) => setSelectedDate(date)}
          dateFormat="dd/MM/yyyy"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm lg:text-base w-full sm:w-auto"
          maxDate={new Date()}
          disabled={false}
        />
      </div>
      
      {/* Botones de acción */}
      <div className="flex flex-col sm:flex-row lg:flex-row gap-2 lg:gap-3">
        {isAdmin && !cajaCerrada && (
          <>
            <button
              onClick={() => setShowDineroInicialModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 lg:px-4 lg:py-2 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors text-sm lg:text-base"
            >
              <BanknotesIcon className="h-4 w-4 lg:h-5 lg:w-5" />
              <span className="hidden sm:inline lg:inline">Dinero Inicial</span>
              <span className="sm:hidden lg:hidden">Inicial</span>
            </button>
            
            <button
              onClick={() => setShowRetiroModal(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 lg:px-4 lg:py-2 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors text-sm lg:text-base"
            >
              <MinusCircleIcon className="h-4 w-4 lg:h-5 lg:w-5" />
              <span className="hidden sm:inline lg:inline">Retirar Dinero</span>
              <span className="sm:hidden lg:hidden">Retirar</span>
            </button>
            
            <button
              onClick={() => setShowCierreModal(true)}
              className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 lg:px-4 lg:py-2 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors text-sm lg:text-base"
            >
              <LockClosedIcon className="h-4 w-4 lg:h-5 lg:w-5" />
              <span className="hidden sm:inline lg:inline">Cerrar Caja</span>
              <span className="sm:hidden lg:hidden">Cerrar</span>
            </button>
          </>
        )}
        
        {cajaCerrada && (
          <button
            onClick={generarReportePDF}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 lg:px-4 lg:py-2 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors text-sm lg:text-base"
          >
            <DocumentTextIcon className="h-4 w-4 lg:h-5 lg:w-5" />
            <span className="hidden sm:inline lg:inline">Generar Reporte</span>
            <span className="sm:hidden lg:hidden">Reporte</span>
          </button>
        )}
      </div>
    </div>
  </div>
</div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Dinero Inicial del Día - NUEVO COMPONENTE */}
        {dineroInicial > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <BanknotesIcon className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-900">Dinero Inicial del Día</p>
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(dineroInicial)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-blue-600">Efectivo disponible para vuelto</p>
                <p className="text-sm text-blue-500">Establecido al inicio del día</p>
              </div>
            </div>
          </div>
        )}

        {/* Resumen de Caja - Cards principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Efectivo Físico - ACTUALIZADO: incluye dinero inicial */}
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Efectivo Físico</p>
                <p className="text-2xl font-bold">{formatCurrency(Math.max(0, dineroInicial + totalesDelDia.efectivo - dineroEnCaja.totalRetiros))}</p>
                <p className="text-green-200 text-xs mt-1">💵 Dinero en caja</p>
                {dineroInicial > 0 && (
                  <p className="text-green-200 text-xs">Incluye inicial: {formatCurrency(dineroInicial)}</p>
                )}
              </div>
              <BanknotesIcon className="h-12 w-12 text-green-200" />
            </div>
          </div>

          {/* Digital - Yape */}
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Yape Digital</p>
                <p className="text-2xl font-bold">{formatCurrency(totalesDelDia.yape)}</p>
                <p className="text-purple-200 text-xs mt-1">💜 Dinero digital</p>
              </div>
              <DevicePhoneMobileIcon className="h-12 w-12 text-purple-200" />
            </div>
          </div>

          {/* Digital - Plin */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Plin Digital</p>
                <p className="text-2xl font-bold">{formatCurrency(totalesDelDia.plin)}</p>
                <p className="text-blue-200 text-xs mt-1">💙 Dinero digital</p>
              </div>
              <DevicePhoneMobileIcon className="h-12 w-12 text-blue-200" />
            </div>
          </div>

          {/* Tarjetas */}
          <div className="bg-gradient-to-br from-gray-600 to-gray-700 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-100 text-sm font-medium">Tarjetas</p>
                <p className="text-2xl font-bold">{formatCurrency(totalesDelDia.tarjeta)}</p>
                <p className="text-gray-300 text-xs mt-1">💳 Dinero digital</p>
              </div>
              <CreditCardIcon className="h-12 w-12 text-gray-300" />
            </div>
          </div>
        </div>

        {/* Ganancias y Totales */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Total del Día */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-indigo-500">
            <div className="flex items-center">
              <ChartBarIcon className="h-8 w-8 text-indigo-600 mr-3" />
              <div>
                <p className="text-gray-600 text-sm font-medium">Total del Día</p>
                <p className="text-3xl font-bold text-indigo-600">{formatCurrency(totalesDelDia.total)}</p>
              </div>
            </div>
          </div>

          {/* Ganancia Bruta */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center">
              <ArrowTrendingUpIcon className="h-8 w-8 text-green-600 mr-3" />
              <div>
                <p className="text-gray-600 text-sm font-medium">Ganancia Bruta</p>
                <p className="text-3xl font-bold text-green-600">{formatCurrency(totalesDelDia.gananciaBruta)}</p>
              </div>
            </div>
          </div>

          {/* Ganancia Real */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-emerald-500">
            <div className="flex items-center">
              <CurrencyDollarIcon className="h-8 w-8 text-emerald-600 mr-3" />
              <div>
                <p className="text-gray-600 text-sm font-medium">Ganancia Real</p>
                <p className="text-3xl font-bold text-emerald-600">{formatCurrency(totalesDelDia.gananciaReal)}</p>
                <p className="text-xs text-gray-500 mt-1">Con campos ocultos</p>
              </div>
            </div>
          </div>
        </div>

        {/* Retiros del día */}
        {retiros.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <ArrowTrendingDownIcon className="h-6 w-6 text-red-600 mr-2" />
              Retiros del Día
            </h3>
            
            <div className="space-y-3">
              {retiros.map((retiro) => (
                <div key={retiro.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center space-x-3">
                    <MinusCircleIcon className="h-5 w-5 text-red-600" />
                    <div>
                      <p className="font-medium text-gray-900">
                        {formatCurrency(retiro.monto)} - {retiro.tipo.toUpperCase()}
                      </p>
                      <p className="text-sm text-gray-600">{retiro.motivo}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">
                      {retiro.fecha?.toLocaleTimeString('es-PE', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                    <p className="text-xs text-gray-400">{retiro.realizadoPor}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-right font-semibold text-red-600">
                Total Retirado: {formatCurrency(dineroEnCaja.totalRetiros)}
              </p>
            </div>
          </div>
        )}

        <DevolucionesDelDiaComponenteMejorado />

        {/* Lista de ventas del día - MODIFICADA para mostrar estados de devolución */}
<div className="bg-white rounded-lg shadow-md p-6">
  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
    <EyeIcon className="h-6 w-6 text-blue-600 mr-2" />
    Ventas del Día ({ventas.length})
  </h3>
  
  {ventas.length === 0 ? (
    <div className="text-center py-8 text-gray-500">
      <ChartBarIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
      <p>No hay ventas registradas para esta fecha</p>
    </div>
  ) : (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse border border-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">
              N° Venta
            </th>
            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">
              Cliente
            </th>
            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">
              Hora
            </th>
            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">
              Método Pago
            </th>
            <th className="border border-gray-300 px-4 py-2 text-right text-sm font-medium text-gray-700">
              Total
            </th>
            <th className="border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700">
              Estado
            </th>
            <th className="border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((venta, index) => {
            const indicadorEstado = obtenerIndicadorEstadoVenta(venta, devoluciones);
            const tieneDevolucion = indicadorEstado !== null;
            
            return (
              <tr 
                key={venta.id} 
                className={`
                  ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  ${tieneDevolucion ? 'bg-red-25 border-red-200' : ''}
                `}
              >
                <td className="border border-gray-300 px-4 py-2 text-sm font-medium">
                  <div className="flex items-center space-x-2">
                    <span>{venta.numeroVenta || 'N/A'}</span>
                    {tieneDevolucion && (
                      <ArrowTrendingDownIcon className="h-4 w-4 text-red-500" title="Venta con devolución" />
                    )}
                  </div>
                </td>
                <td className="border border-gray-300 px-4 py-2 text-sm">
                  {venta.clienteNombre}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-sm">
                  {venta.fechaVenta?.toLocaleTimeString('es-PE', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-sm">
                  <div className="flex items-center space-x-2">
                    {getPaymentMethodIcon(venta.metodoPago)}
                    <span>{venta.metodoPago?.toUpperCase() || 'N/A'}</span>
                  </div>
                </td>
                <td className={`border border-gray-300 px-4 py-2 text-sm text-right font-medium ${
                  tieneDevolucion ? 'text-red-600' : ''
                }`}>
                  {formatCurrency(venta.totalVenta)}
                  {tieneDevolucion && (
                    <div className="text-xs text-red-500 mt-1">
                      Con devolución
                    </div>
                  )}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center">
                  {indicadorEstado || (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      COMPLETA
                    </span>
                  )}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center">
                  <button
                    onClick={() => mostrarDetalleGanancia(venta)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs flex items-center space-x-1 mx-auto"
                  >
                    <InformationCircleIcon className="h-4 w-4" />
                    <span>Detalle</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  )}
</div>


        {/* Modal de Dinero Inicial - NUEVO MODAL */}
        {showDineroInicialModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <BanknotesIcon className="h-6 w-6 text-green-600 mr-2" />
                    Establecer Dinero Inicial
                  </h3>
                  <button
                    onClick={() => setShowDineroInicialModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>
                
                <div className="space-y-4">                  
                  {dineroInicial > 0 && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">
                        <strong>Dinero inicial actual:</strong> {formatCurrency(dineroInicial)}
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nuevo Dinero Inicial (Efectivo)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={inputDineroInicial}
                      onChange={(e) => setInputDineroInicial(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Ingrese el monto en soles que se dejará como dinero inicial para vuelto
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setShowDineroInicialModal(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                    disabled={processingDineroInicial}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={establecerDineroInicial}
                    disabled={processingDineroInicial}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
                  >
                    {processingDineroInicial ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <BanknotesIcon className="h-4 w-4" />
                        <span>Establecer</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Cierre de Caja - ACTUALIZADO para mostrar dinero inicial */}
        {showCierreModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <LockClosedIcon className="h-6 w-6 text-orange-600 mr-2" />
                    Cerrar Caja del Día
                  </h3>
                  <button
                    onClick={() => setShowCierreModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex">
                      <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mr-2" />
                      <div className="text-sm">
                        <p className="font-medium text-yellow-800">¿Está seguro de cerrar la caja?</p>
                        <p className="text-yellow-700 mt-1">
                          Esta acción no se puede deshacer. Una vez cerrada, no podrá realizar más retiros ni modificaciones para esta fecha.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Resumen del Día</h4>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p><strong>Dinero Inicial:</strong> {formatCurrency(dineroInicial)}</p>
                      <p><strong>Total Ventas:</strong> {ventas.length}</p>
                      <p><strong>Total Ingresos:</strong> {formatCurrency(totalesDelDia.total)}</p>
                      <p><strong>Total Retiros:</strong> {formatCurrency(dineroEnCaja.totalRetiros)}</p>
                      <p><strong>Efectivo Final:</strong> {formatCurrency(Math.max(0, dineroInicial + totalesDelDia.efectivo - dineroEnCaja.totalRetiros))}</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setShowCierreModal(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                    disabled={loadingCierreCaja}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={cerrarCaja}
                    disabled={loadingCierreCaja}
                    className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 flex items-center space-x-2"
                  >
                    {loadingCierreCaja ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Cerrando...</span>
                      </>
                    ) : (
                      <>
                        <LockClosedIcon className="h-4 w-4" />
                        <span>Cerrar Caja</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Retiro - ACTUALIZADO para mostrar dinero inicial disponible */}
        {showRetiroModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <MinusCircleIcon className="h-6 w-6 text-red-600 mr-2" />
                    Retirar Dinero
                  </h3>
                  <button
                    onClick={() => setShowRetiroModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo de Dinero
                    </label>
                    <select
                      value={retiroTipo}
                      onChange={(e) => setRetiroTipo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500"
                    >
                      <option value="efectivo">Efectivo (S/. {(dineroInicial + totalesDelDia.efectivo - dineroEnCaja.totalRetiros).toFixed(2)} disponible)</option>
                      <option value="yape">Yape (S/. {totalesDelDia.yape.toFixed(2)} disponible)</option>
                      <option value="plin">Plin (S/. {totalesDelDia.plin.toFixed(2)} disponible)</option>
                      <option value="tarjeta">Tarjeta (S/. {totalesDelDia.tarjeta.toFixed(2)} disponible)</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Monto a Retirar
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={retiroAmount}
                      onChange={(e) => setRetiroAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500"
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Motivo del Retiro *
                    </label>
                    <textarea
                      value={retiroMotivo}
                      onChange={(e) => setRetiroMotivo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500"
                      rows="3"
                      placeholder="Describe el motivo del retiro..."
                      required
                    />
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setShowRetiroModal(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                    disabled={processingRetiro}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleRetiroDinero}
                    disabled={processingRetiro}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
                  >
                    {processingRetiro ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Procesando...</span>
                      </>
                    ) : (
                      <>
                        <MinusCircleIcon className="h-4 w-4" />
                        <span>Retirar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        

        {/* Modal de Detalle de Ganancia */}
        {showDetalleGanancia && detalleGananciaData && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            {/* Modal de Detalle de Ganancia Mejorado */}
<ModalDetalleGananciaMejorado 
  show={showDetalleGanancia} 
  onClose={() => setShowDetalleGanancia(false)}
  data={detalleGananciaData}
/>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CajaPage;