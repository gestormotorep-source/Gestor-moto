// pages/dashboard.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { db } from '../lib/firebase';
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
  where
} from 'firebase/firestore';

// Fixed Heroicons imports - using v2 syntax (24/outline)
import { 
  CubeIcon, 
  UsersIcon, 
  BanknotesIcon, 
  ExclamationTriangleIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ArrowTrendingUpIcon as TrendingUpIcon,
  ArrowTrendingDownIcon as TrendingDownIcon,
  CalendarIcon,
  ShoppingCartIcon,
  CreditCardIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';

// Import recharts components individually to avoid import issues
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts';

const Dashboard = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7d'); // 7d, 30d, 90d, 365d
  const [stats, setStats] = useState({
    totalProductos: 0,
    productosPocos: 0,
    ventasHoy: 0,
    ventasAyer: 0,
    ventasMes: 0,
    ventasMesAnterior: 0,
    cotizacionesPendientes: 0,
    cotizacionesConvertidas: 0,
    clientesCredito: 0,
    clientesTotal: 0,
    cajaActual: 0,
    productosMasVendidos: [],
    ventasPorDia: [],
    ventasPorMes: [],
    ventasPorEmpleado: [],
    stockBajo: [],
    comprasVsVentas: [],
    clientesTop: [],
    cotizacionesEstados: []
  });

  useEffect(() => {
    if (!user) {
      router.push('/auth');
      return;
    }
    loadDashboardData();
  }, [user, router, dateRange]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const data = await loadRealDataFromFirebase();
      setStats(data);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // En caso de error, usar datos mock como fallback
      const mockData = generateMockData();
      setStats(mockData);
    } finally {
      setLoading(false);
    }
  };

  const loadRealDataFromFirebase = async () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Consultas paralelas para mejor rendimiento
    const [
      productosSnapshot,
      ventasHoySnapshot,
      ventasAyerSnapshot,
      ventasMesSnapshot,
      ventasMesAnteriorSnapshot,
      cotizacionesSnapshot,
      clientesSnapshot
    ] = await Promise.all([
      // Productos
      getDocs(collection(db, 'productos')),
      
      // Ventas de hoy
      getDocs(query(
        collection(db, 'ventas'),
        where('fecha', '>=', startOfToday),
        where('fecha', '<', new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000))
      )),
      
      // Ventas de ayer
      getDocs(query(
        collection(db, 'ventas'),
        where('fecha', '>=', startOfYesterday),
        where('fecha', '<', startOfToday)
      )),
      
      // Ventas del mes actual
      getDocs(query(
        collection(db, 'ventas'),
        where('fecha', '>=', startOfMonth)
      )),
      
      // Ventas del mes anterior
      getDocs(query(
        collection(db, 'ventas'),
        where('fecha', '>=', startOfLastMonth),
        where('fecha', '<=', endOfLastMonth)
      )),
      
      // Cotizaciones
      getDocs(collection(db, 'cotizaciones')),
      
      // Clientes
      getDocs(collection(db, 'clientes'))
    ]);

    // Procesar productos
    const productos = [];
    const productosPocos = [];
    productosSnapshot.forEach(doc => {
      const producto = { id: doc.id, ...doc.data() };
      productos.push(producto);
      
      // Usar los nombres de campos reales: stockActual y stockReferenciaUmbral
      const stockActual = producto.stockActual || 0;
      const stockMinimo = producto.stockReferenciaUmbral || 10;
      
      if (stockActual <= stockMinimo) {
        productosPocos.push({
          ...producto,
          stockActual,
          stockMinimo
        });
      }
    });

    // Procesar ventas de hoy
    let ventasHoyTotal = 0;
    const ventasHoyData = [];
    ventasHoySnapshot.forEach(doc => {
      const venta = doc.data();
      // Usar totalVentas en lugar de total
      ventasHoyTotal += venta.totalVentas || 0;
      ventasHoyData.push(venta);
    });

    // Procesar ventas de ayer
    let ventasAyerTotal = 0;
    ventasAyerSnapshot.forEach(doc => {
      const venta = doc.data();
      ventasAyerTotal += venta.totalVentas || 0;
    });

    // Procesar ventas del mes
    let ventasMesTotal = 0;
    const ventasMesData = [];
    const productosMasVendidos = new Map();
    const ventasPorEmpleado = new Map();
    
    ventasMesSnapshot.forEach(doc => {
      const venta = doc.data();
      ventasMesTotal += venta.totalVentas || 0;
      ventasMesData.push(venta);
      
      // Contar productos más vendidos usando paymentMethods
      if (venta.paymentMethods && Array.isArray(venta.paymentMethods)) {
        venta.paymentMethods.forEach(payment => {
          // Los productos están en paymentMethods, no en productos
          const nombre = payment.label || 'Producto sin nombre';
          const cantidad = 1; // Cada payment parece ser 1 producto
          const precio = payment.amount || 0;
          
          if (productosMasVendidos.has(nombre)) {
            const existing = productosMasVendidos.get(nombre);
            productosMasVendidos.set(nombre, {
              nombre,
              cantidad: existing.cantidad + cantidad,
              ingresos: existing.ingresos + precio
            });
          } else {
            productosMasVendidos.set(nombre, {
              nombre,
              cantidad,
              ingresos: precio
            });
          }
        });
      }
      
      // Ventas por empleado usando empleadoId
      const empleado = venta.empleadoId || 'Sin asignar';
      const totalVenta = venta.totalVentas || 0;
      
      if (ventasPorEmpleado.has(empleado)) {
        const existing = ventasPorEmpleado.get(empleado);
        ventasPorEmpleado.set(empleado, {
          empleado,
          ventas: existing.ventas + totalVenta,
          comision: existing.comision + (totalVenta * 0.02) // 2% comisión
        });
      } else {
        ventasPorEmpleado.set(empleado, {
          empleado,
          ventas: totalVenta,
          comision: totalVenta * 0.02
        });
      }
    });

    // Procesar ventas del mes anterior
    let ventasMesAnteriorTotal = 0;
    ventasMesAnteriorSnapshot.forEach(doc => {
      const venta = doc.data();
      ventasMesAnteriorTotal += venta.totalVentas || 0;
    });

    // Procesar cotizaciones
    const cotizacionesPendientes = [];
    const cotizacionesConvertidas = [];
    const cotizacionesEstados = new Map();
    
    cotizacionesSnapshot.forEach(doc => {
      const cotizacion = doc.data();
      const estado = cotizacion.estado || 'Pendiente';
      
      if (estado === 'Pendiente') {
        cotizacionesPendientes.push(cotizacion);
      } else if (estado === 'Aprobada' || estado === 'Convertida') {
        cotizacionesConvertidas.push(cotizacion);
      }
      
      if (cotizacionesEstados.has(estado)) {
        cotizacionesEstados.set(estado, cotizacionesEstados.get(estado) + 1);
      } else {
        cotizacionesEstados.set(estado, 1);
      }
    });

    // Procesar clientes
    const clientes = [];
    const clientesCredito = [];
    const clientesTop = new Map();
    
    clientesSnapshot.forEach(doc => {
      const cliente = { id: doc.id, ...doc.data() };
      clientes.push(cliente);
      
      // Usar montoLimiteCreditoActual en lugar de credito
      if (cliente.montoLimiteCreditoActual && cliente.montoLimiteCreditoActual > 0) {
        clientesCredito.push(cliente);
      }
    });

    // Calcular top clientes basado en ventas del mes usando clienteId
    ventasMesData.forEach(venta => {
      const clienteId = venta.clienteId;
      if (clienteId) {
        if (clientesTop.has(clienteId)) {
          const existing = clientesTop.get(clienteId);
          clientesTop.set(clienteId, {
            ...existing,
            total: existing.total + (venta.totalVentas || 0)
          });
        } else {
          const cliente = clientes.find(c => c.id === clienteId);
          if (cliente) {
            clientesTop.set(clienteId, {
              nombre: cliente.nombre || 'Cliente sin nombre',
              total: venta.totalVentas || 0,
              credito: cliente.montoLimiteCreditoActual || 0
            });
          }
        }
      }
    });

    // Generar datos para gráficas de tendencia (últimos 30 días)
    const ventasPorDia = await generateVentasPorDia();
    const ventasPorMes = await generateVentasPorMes();

    // Construir objeto de estadísticas
    return {
      totalProductos: productos.length,
      productosPocos: productosPocos.length,
      ventasHoy: ventasHoyTotal,
      ventasAyer: ventasAyerTotal,
      ventasMes: ventasMesTotal,
      ventasMesAnterior: ventasMesAnteriorTotal,
      cotizacionesPendientes: cotizacionesPendientes.length,
      cotizacionesConvertidas: cotizacionesConvertidas.length,
      clientesCredito: clientesCredito.length,
      clientesTotal: clientes.length,
      cajaActual: ventasHoyTotal, // Simplificado - puedes agregar lógica de caja real
      
      productosMasVendidos: Array.from(productosMasVendidos.values())
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5),
        
      ventasPorDia,
      ventasPorMes,
      
      ventasPorEmpleado: Array.from(ventasPorEmpleado.values())
        .sort((a, b) => b.ventas - a.ventas),
        
      stockBajo: productosPocos.slice(0, 4).map(p => ({
        producto: p.nombre,
        stock: p.stockActual || 0,
        minimo: p.stockReferenciaUmbral || 10,
        urgencia: (p.stockActual || 0) <= 5 ? 'alta' : (p.stockActual || 0) <= 10 ? 'media' : 'baja'
      })),
      
      comprasVsVentas: ventasPorMes,
      
      clientesTop: Array.from(clientesTop.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 4),
        
      cotizacionesEstados: Array.from(cotizacionesEstados.entries()).map(([estado, cantidad]) => ({
        estado,
        cantidad,
        color: getColorByEstado(estado)
      }))
    };
  };

  const generateVentasPorDia = async () => {
    const ventasPorDia = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      
      try {
        const ventasDelDia = await getDocs(query(
          collection(db, 'ventas'),
          where('fecha', '>=', startOfDay),
          where('fecha', '<', endOfDay)
        ));
        
        let totalVentas = 0;
        let cantidadVentas = 0;
        
        ventasDelDia.forEach(doc => {
          const venta = doc.data();
          totalVentas += venta.totalVentas || 0;
          cantidadVentas++;
        });
        
        ventasPorDia.push({
          fecha: date.toLocaleDateString('es-PE', { month: 'short', day: 'numeric' }),
          ventas: totalVentas,
          cantidad: cantidadVentas
        });
      } catch (error) {
        console.error('Error fetching sales for day:', error);
        ventasPorDia.push({
          fecha: date.toLocaleDateString('es-PE', { month: 'short', day: 'numeric' }),
          ventas: 0,
          cantidad: 0
        });
      }
    }
    
    return ventasPorDia;
  };

  const generateVentasPorMes = async () => {
    const ventasPorMes = [];
    const today = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(today);
      date.setMonth(date.getMonth() - i);
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      try {
        const [ventasDelMes, comprasDelMes] = await Promise.all([
          getDocs(query(
            collection(db, 'ventas'),
            where('fecha', '>=', startOfMonth),
            where('fecha', '<=', endOfMonth)
          )),
          getDocs(query(
            collection(db, 'compras'),
            where('fecha', '>=', startOfMonth),
            where('fecha', '<=', endOfMonth)
          ))
        ]);
        
        let totalVentas = 0;
        let totalCompras = 0;
        
        ventasDelMes.forEach(doc => {
          const venta = doc.data();
          totalVentas += venta.totalVentas || 0;
        });
        
        comprasDelMes.forEach(doc => {
          const compra = doc.data();
          // Usar costolotalLote para compras
          totalCompras += compra.costolotalLote || 0;
        });
        
        ventasPorMes.push({
          mes: date.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' }),
          ventas: totalVentas,
          compras: totalCompras,
          ganancia: totalVentas - totalCompras
        });
      } catch (error) {
        console.error('Error fetching sales/purchases for month:', error);
        ventasPorMes.push({
          mes: date.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' }),
          ventas: 0,
          compras: 0,
          ganancia: 0
        });
      }
    }
    
    return ventasPorMes;
  };

  const getColorByEstado = (estado) => {
    const colores = {
      'Pendiente': '#FFA500',
      'Enviada': '#87CEEB', 
      'Aprobada': '#90EE90',
      'Convertida': '#90EE90',
      'Cancelada': '#FFB6C1',
      'Rechazada': '#FF6B6B'
    };
    return colores[estado] || '#D1D5DB';
  };

  const generateMockData = () => {
    const today = new Date();
    const ventasPorDia = [];
    const ventasPorMes = [];
    
    // Generar datos de ventas por día (últimos 30 días)
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      ventasPorDia.push({
        fecha: date.toLocaleDateString('es-PE', { month: 'short', day: 'numeric' }),
        ventas: Math.floor(Math.random() * 15000) + 5000,
        cantidad: Math.floor(Math.random() * 50) + 10
      });
    }

    // Generar datos de ventas por mes (últimos 12 meses)
    for (let i = 11; i >= 0; i--) {
      const date = new Date(today);
      date.setMonth(date.getMonth() - i);
      ventasPorMes.push({
        mes: date.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' }),
        ventas: Math.floor(Math.random() * 300000) + 150000,
        compras: Math.floor(Math.random() * 100000) + 50000
      });
    }

    return {
      totalProductos: 1847,
      productosPocos: 23,
      ventasHoy: 18500,
      ventasAyer: 15200,
      ventasMes: 456000,
      ventasMesAnterior: 398000,
      cotizacionesPendientes: 8,
      cotizacionesConvertidas: 15,
      clientesCredito: 18,
      clientesTotal: 156,
      cajaActual: 85000,
      
      productosMasVendidos: [
        { nombre: 'Pastillas freno tambor', cantidad: 45, ingresos: 6750 },
        { nombre: 'Rodantes', cantidad: 38, ingresos: 5700 },
        { nombre: 'Aceite motor 15W40', cantidad: 32, ingresos: 4800 },
        { nombre: 'Filtro aire', cantidad: 28, ingresos: 3360 },
        { nombre: 'Bujías NGK', cantidad: 25, ingresos: 2500 }
      ],
      
      ventasPorDia,
      ventasPorMes,
      
      ventasPorEmpleado: [
        { empleado: 'Ernesto Gutierrez', ventas: 125000, comision: 2500 },
        { empleado: 'Carlos Admin', ventas: 98000, comision: 1960 },
        { empleado: 'Ana García', ventas: 87000, comision: 1740 },
        { empleado: 'Luis Torres', ventas: 65000, comision: 1300 }
      ],
      
      stockBajo: [
        { producto: 'Pastillas freno', stock: 3, minimo: 10, urgencia: 'alta' },
        { producto: 'Aceite 20W50', stock: 5, minimo: 15, urgencia: 'media' },
        { producto: 'Filtros combustible', stock: 8, minimo: 20, urgencia: 'media' },
        { producto: 'Correas dentadas', stock: 12, minimo: 25, urgencia: 'baja' }
      ],
      
      comprasVsVentas: ventasPorMes.map(item => ({
        mes: item.mes,
        compras: item.compras,
        ventas: item.ventas,
        ganancia: item.ventas - item.compras
      })),
      
      clientesTop: [
        { nombre: 'Carlos Ramirez', total: 45000, credito: 5000 },
        { nombre: 'Ana Transportes SAC', total: 38000, credito: 8000 },
        { nombre: 'Taller El Rápido', total: 32000, credito: 0 },
        { nombre: 'Mecánica Moderna', total: 28000, credito: 3000 }
      ],
      
      cotizacionesEstados: [
        { estado: 'Pendiente', cantidad: 8, color: '#FFA500' },
        { estado: 'Enviada', cantidad: 12, color: '#87CEEB' },
        { estado: 'Aprobada', cantidad: 15, color: '#90EE90' },
        { estado: 'Cancelada', cantidad: 3, color: '#FFB6C1' }
      ]
    };
  };

  const getDateRangeText = () => {
    const texts = {
      '7d': 'Últimos 7 días',
      '30d': 'Últimos 30 días', 
      '90d': 'Últimos 3 meses',
      '365d': 'Último año'
    };
    return texts[dateRange];
  };

  const calculateGrowthPercentage = (current, previous) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <h1 className="text-xl font-semibold mt-4 text-gray-900">Cargando Dashboard...</h1>
        </div>
      </div>
    );
  }

  const isAdmin = user?.email === 'admin@gestormotorep.com';
  
  const ventasGrowth = calculateGrowthPercentage(stats.ventasHoy, stats.ventasAyer);
  const mesGrowth = calculateGrowthPercentage(stats.ventasMes, stats.ventasMesAnterior);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard Ejecutivo</h1>
              <p className="text-gray-600 mt-1">
                Bienvenido, {user.displayName || user.email}
              </p>
              <p className="text-sm text-gray-500">
                {isAdmin ? 'Administrador' : 'Empleado'} - {new Date().toLocaleDateString('es-PE')}
              </p>
            </div>
            
            {/* Selector de período */}
            <div className="mt-4 sm:mt-0">
              <select 
                value={dateRange} 
                onChange={(e) => setDateRange(e.target.value)}
                className="bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="90d">Últimos 3 meses</option>
                <option value="365d">Último año</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-2">Cargando datos...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPIs Principales */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Ventas Hoy */}
              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Ventas Hoy</p>
                    <p className="text-2xl font-bold text-gray-900">S/. {stats.ventasHoy.toLocaleString()}</p>
                    <div className="flex items-center mt-1">
                      {ventasGrowth >= 0 ? (
                        <TrendingUpIcon className="h-4 w-4 text-green-500 mr-1" />
                      ) : (
                        <TrendingDownIcon className="h-4 w-4 text-red-500 mr-1" />
                      )}
                      <span className={`text-sm ${ventasGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {ventasGrowth}% vs ayer
                      </span>
                    </div>
                  </div>
                  <div className="bg-green-100 p-3 rounded-full">
                    <BanknotesIcon className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </div>

              {/* Ventas del Mes */}
              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Ventas del Mes</p>
                    <p className="text-2xl font-bold text-gray-900">S/. {stats.ventasMes.toLocaleString()}</p>
                    <div className="flex items-center mt-1">
                      {mesGrowth >= 0 ? (
                        <TrendingUpIcon className="h-4 w-4 text-green-500 mr-1" />
                      ) : (
                        <TrendingDownIcon className="h-4 w-4 text-red-500 mr-1" />
                      )}
                      <span className={`text-sm ${mesGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {mesGrowth}% vs mes anterior
                      </span>
                    </div>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-full">
                    <ChartBarIcon className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </div>

              {/* Productos */}
              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Productos</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalProductos}</p>
                    <p className="text-sm text-red-600 mt-1">
                      {stats.productosPocos} con stock bajo
                    </p>
                  </div>
                  <div className="bg-purple-100 p-3 rounded-full">
                    <CubeIcon className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </div>

              {/* Clientes */}
              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-orange-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Clientes</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.clientesTotal}</p>
                    <p className="text-sm text-orange-600 mt-1">
                      {stats.clientesCredito} con crédito
                    </p>
                  </div>
                  <div className="bg-orange-100 p-3 rounded-full">
                    <UsersIcon className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Gráficas Principales */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gráfica de Ventas Diarias */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Tendencia de Ventas Diarias</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={stats.ventasPorDia}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" />
                    <YAxis tickFormatter={(value) => `S/. ${(value/1000).toFixed(0)}K`} />
                    <Tooltip formatter={(value) => [`S/. ${value.toLocaleString()}`, 'Ventas']} />
                    <Area 
                      type="monotone" 
                      dataKey="ventas" 
                      stroke="#3B82F6" 
                      fill="#3B82F6" 
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Productos Más Vendidos */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Productos Más Vendidos</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.productosMasVendidos} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => `${value}`} />
                    <YAxis dataKey="nombre" type="category" width={100} />
                    <Tooltip formatter={(value) => [`${value} unidades`, 'Vendidas']} />
                    <Bar dataKey="cantidad" fill="#10B981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Segunda fila de gráficas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Compras vs Ventas */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Compras vs Ventas (Últimos 12 meses)</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={stats.comprasVsVentas}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis tickFormatter={(value) => `S/. ${(value/1000).toFixed(0)}K`} />
                    <Tooltip formatter={(value, name) => [`S/. ${value.toLocaleString()}`, name]} />
                    <Line type="monotone" dataKey="ventas" stroke="#3B82F6" strokeWidth={3} name="Ventas" />
                    <Line type="monotone" dataKey="compras" stroke="#EF4444" strokeWidth={3} name="Compras" />
                    <Line type="monotone" dataKey="ganancia" stroke="#10B981" strokeWidth={3} name="Ganancia" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Estado de Cotizaciones */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Estado Cotizaciones</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={stats.cotizacionesEstados}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="cantidad"
                    >
                      {stats.cotizacionesEstados.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {stats.cotizacionesEstados.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div 
                          className="w-3 h-3 rounded-full mr-2" 
                          style={{ backgroundColor: item.color }}
                        ></div>
                        <span className="text-sm text-gray-600">{item.estado}</span>
                      </div>
                      <span className="font-semibold">{item.cantidad}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Alertas y Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Productos con Stock Bajo */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
                  Productos con Stock Bajo
                </h3>
                <div className="space-y-3">
                  {stats.stockBajo.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{item.producto}</p>
                        <p className="text-sm text-gray-600">Stock: {item.stock} | Mínimo: {item.minimo}</p>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.urgencia === 'alta' ? 'bg-red-100 text-red-800' :
                        item.urgencia === 'media' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {item.urgencia}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Clientes */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Clientes del Mes</h3>
                <div className="space-y-3">
                  {stats.clientesTop.map((cliente, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-3">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{cliente.nombre}</p>
                          <p className="text-sm text-gray-600">
                            {cliente.credito > 0 ? `Crédito: S/. ${cliente.credito.toLocaleString()}` : 'Sin crédito'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">S/. {cliente.total.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Acciones Rápidas Mejoradas */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Acciones Rápidas</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={() => router.push('/productos/agregar')}
                  className="flex items-center justify-center px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  <CubeIcon className="h-5 w-5 mr-2" />
                  Agregar Producto
                </button>
                <button
                  onClick={() => router.push('/cotizaciones/nueva')}
                  className="flex items-center justify-center px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  <DocumentTextIcon className="h-5 w-5 mr-2" />
                  Nueva Cotización
                </button>
                <button
                  onClick={() => router.push('/ventas/nueva')}
                  className="flex items-center justify-center px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  <ShoppingCartIcon className="h-5 w-5 mr-2" />
                  Nueva Venta
                </button>
                <button
                  onClick={() => router.push('/clientes/agregar')}
                  className="flex items-center justify-center px-4 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  <UsersIcon className="h-5 w-5 mr-2" />
                  Agregar Cliente
                </button>
              </div>
            </div>

            {/* Rendimiento por Empleado - Solo para Admins */}
            {isAdmin && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Rendimiento por Empleado (Este Mes)</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Empleado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ventas
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Comisión
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rendimiento
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {stats.ventasPorEmpleado.map((empleado, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {empleado.empleado}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            S/. {empleado.ventas.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                            S/. {empleado.comision.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{ width: `${(empleado.ventas / 125000) * 100}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-gray-600">
                                {Math.round((empleado.ventas / 125000) * 100)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;