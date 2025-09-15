// pages/inventario/lotes/index.js - Sistema de lotes agrupados por producto

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../contexts/AuthContext';
import Layout from '../../../components/Layout';
import { db } from '../../../lib/firebase';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { 
  MagnifyingGlassIcon, 
  HashtagIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  FunnelIcon,
  EyeIcon,
  ArrowsUpDownIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

const LotesPage = () => {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [lotesAgrupados, setLotesAgrupados] = useState([]);

  // Estados de filtros y búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredLotes, setFilteredLotes] = useState([]);
  const [estadoFilter, setEstadoFilter] = useState('');
  const [productoFilter, setProductoFilter] = useState('');
  const [sortBy, setSortBy] = useState('fechaIngreso');
  const [sortOrder, setSortOrder] = useState('desc');

  // Estados de vista
  const [showFilters, setShowFilters] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [limitPerPage, setLimitPerPage] = useState(20);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        router.push('/auth');
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        // Cargar productos
        const qProducts = query(collection(db, 'productos'), orderBy('nombre', 'asc'));
        const productSnapshot = await getDocs(qProducts);
        const productsList = productSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProductos(productsList);

        // Cargar lotes
        console.log('Cargando lotes desde colección principal...');
        const qLotes = query(
          collection(db, 'lotes'),
          orderBy('fechaIngreso', 'desc')
        );
        const lotesSnapshot = await getDocs(qLotes);
        
        console.log(`Encontrados ${lotesSnapshot.docs.length} lotes`);

        // Procesar cada lote con validación de datos
        const lotesData = [];
        lotesSnapshot.docs.forEach((doc, index) => {
          try {
            const loteData = doc.data();
            
            if (!doc.id) {
              console.warn(`Lote en índice ${index} no tiene ID válido`);
              return;
            }

            const loteProcessed = {
              id: doc.id,
              // Campos del producto
              productoId: loteData.productoId || null,
              nombreProducto: loteData.nombreProducto || 'Sin nombre',
              codigoTienda: loteData.codigoTienda || 'Sin código',
              
              // Campos del lote
              numeroLote: loteData.numeroLote || 'Sin número',
              cantidad: loteData.cantidad || 0,
              cantidadInicial: loteData.cantidadInicial || loteData.cantidad || 0,
              stockRestante: loteData.stockRestante !== undefined ? loteData.stockRestante : loteData.cantidad || 0,
              precioCompraUnitario: loteData.precioCompraUnitario || 0,
              subtotal: loteData.subtotal || 0,
              
              // Fechas y estado
              fechaIngreso: loteData.fechaIngreso || loteData.createdAt || null,
              fechaVencimiento: loteData.fechaVencimiento || null,
              estado: loteData.estado || 'activo',
              
              // Referencias
              ingresoId: loteData.ingresoId || null,
              
              // Para compatibilidad con código existente
              fechaCreacion: loteData.fechaIngreso || loteData.createdAt || null,
            };

            lotesData.push(loteProcessed);
          } catch (docError) {
            console.error(`Error procesando lote en índice ${index}:`, docError);
          }
        });

        console.log(`Procesados ${lotesData.length} lotes válidos`);
        setLotes(lotesData);

        // Agrupar lotes por producto
        const agrupados = agruparLotesPorProducto(lotesData);
        setLotesAgrupados(agrupados);

      } catch (err) {
        console.error("Error al cargar datos:", err);
        setError("Error al cargar los datos: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    if (router.isReady) {
      fetchData();
    }
  }, [user, router.isReady]);

  // Función para agrupar lotes por producto
  const agruparLotesPorProducto = (lotesData) => {
    const agrupados = {};
    
    lotesData.forEach(lote => {
      const productoId = lote.productoId || 'sin-producto';
      
      if (!agrupados[productoId]) {
        agrupados[productoId] = {
          productoId: productoId,
          nombreProducto: lote.nombreProducto,
          codigoTienda: lote.codigoTienda,
          lotes: [],
          // Estadísticas consolidadas
          totalStock: 0,
          stockActivo: 0,
          totalLotes: 0,
          lotesActivos: 0,
          precioPromedio: 0,
          fechaUltimoIngreso: null,
          estadoGeneral: 'activo'
        };
      }
      
      agrupados[productoId].lotes.push(lote);
    });

    // Calcular estadísticas para cada grupo
    Object.values(agrupados).forEach(grupo => {
      grupo.totalLotes = grupo.lotes.length;
      grupo.lotesActivos = grupo.lotes.filter(l => l.estado === 'activo').length;
      grupo.totalStock = grupo.lotes.reduce((sum, l) => sum + parseFloat(l.stockRestante || 0), 0);
      grupo.stockActivo = grupo.lotes.filter(l => l.estado === 'activo').reduce((sum, l) => sum + parseFloat(l.stockRestante || 0), 0);
      
      // Calcular precio promedio ponderado
      let totalValor = 0;
      let totalCantidad = 0;
      grupo.lotes.forEach(lote => {
        const stock = parseFloat(lote.stockRestante || 0);
        const precio = parseFloat(lote.precioCompraUnitario || 0);
        if (stock > 0) {
          totalValor += stock * precio;
          totalCantidad += stock;
        }
      });
      grupo.precioPromedio = totalCantidad > 0 ? totalValor / totalCantidad : 0;
      
      // Encontrar fecha de último ingreso
      grupo.fechaUltimoIngreso = grupo.lotes.reduce((latest, lote) => {
        if (!lote.fechaIngreso) return latest;
        const fecha = lote.fechaIngreso.toDate ? lote.fechaIngreso.toDate() : new Date(lote.fechaIngreso);
        if (!latest) return fecha;
        return fecha > latest ? fecha : latest;
      }, null);
      
      // Determinar estado general
      if (grupo.stockActivo === 0) {
        grupo.estadoGeneral = 'agotado';
      } else if (grupo.stockActivo <= 5) {
        grupo.estadoGeneral = 'stock-bajo';
      } else {
        grupo.estadoGeneral = 'activo';
      }
      
      // Ordenar lotes por fecha de ingreso (más reciente primero)
      grupo.lotes.sort((a, b) => {
        const fechaA = a.fechaIngreso ? (a.fechaIngreso.toDate ? a.fechaIngreso.toDate() : new Date(a.fechaIngreso)) : new Date(0);
        const fechaB = b.fechaIngreso ? (b.fechaIngreso.toDate ? b.fechaIngreso.toDate() : new Date(b.fechaIngreso)) : new Date(0);
        return fechaB - fechaA;
      });
    });

    return Object.values(agrupados);
  };

  // Aplicar filtros y búsqueda
  useEffect(() => {
    let filtered = [...lotesAgrupados];

    // Filtro por búsqueda
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(grupo => 
        (grupo.nombreProducto || '').toLowerCase().includes(searchLower) ||
        (grupo.codigoTienda || '').toLowerCase().includes(searchLower) ||
        grupo.lotes.some(lote => (lote.numeroLote || '').toLowerCase().includes(searchLower))
      );
    }

    // Filtro por estado
    if (estadoFilter) {
      if (estadoFilter === 'activo') {
        filtered = filtered.filter(grupo => grupo.estadoGeneral === 'activo');
      } else if (estadoFilter === 'agotado') {
        filtered = filtered.filter(grupo => grupo.estadoGeneral === 'agotado');
      }
    }

    // Filtro por producto
    if (productoFilter) {
      filtered = filtered.filter(grupo => grupo.productoId === productoFilter);
    }

    // Ordenamiento
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'nombreProducto':
          aValue = (a.nombreProducto || '').toLowerCase();
          bValue = (b.nombreProducto || '').toLowerCase();
          break;
        case 'stockRestante':
          aValue = a.stockActivo;
          bValue = b.stockActivo;
          break;
        case 'fechaIngreso':
        default:
          aValue = a.fechaUltimoIngreso || new Date(0);
          bValue = b.fechaUltimoIngreso || new Date(0);
          break;
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    setFilteredLotes(filtered);
  }, [lotes, lotesAgrupados, searchTerm, estadoFilter, productoFilter, sortBy, sortOrder]);

  // Obtener estadísticas
  const getEstadisticas = () => {
    const total = lotesAgrupados.length;
    const activos = lotesAgrupados.filter(g => g.estadoGeneral === 'activo').length;
    const agotados = lotesAgrupados.filter(g => g.estadoGeneral === 'agotado').length;
    const stockBajo = lotesAgrupados.filter(g => g.estadoGeneral === 'stock-bajo').length;
    
    return { total, activos, agotados, stockBajo };
  };

  const estadisticas = getEstadisticas();

  // Limitar los resultados mostrados
  const displayedLotes = filteredLotes.slice(0, limitPerPage);

  const getEstadoBadge = (estado, stockRestante) => {
    if (estado === 'agotado') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <XCircleIcon className="h-3 w-3 mr-1" />
          Agotado
        </span>
      );
    }
    
    if (estado === 'stock-bajo') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
          Stock Bajo
        </span>
      );
    }
    
    if (estado === 'activo') {
      const stock = parseFloat(stockRestante || 0);
      if (stock <= 5) {
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
            Stock Bajo
          </span>
        );
      }
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircleIcon className="h-3 w-3 mr-1" />
          Activo
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <ClockIcon className="h-3 w-3 mr-1" />
        {estado}
      </span>
    );
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Error formateando fecha:', error);
      return 'Fecha inválida';
    }
  };

  const toggleProductExpansion = (productoId) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productoId)) {
      newExpanded.delete(productoId);
    } else {
      newExpanded.add(productoId);
    }
    setExpandedProducts(newExpanded);
  };

  if (!router.isReady || !user || loading) {
    return (
      <Layout title="Cargando Lotes">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Gestión de Lotes de Inventario">
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-full mx-auto px-6 sm:px-8 lg:px-12">
          {error && (
            <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 max-w-md">
              {error}
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold text-white flex items-center">
                    <HashtagIcon className="h-8 w-8 mr-3" />
                    Gestión de Lotes
                  </h1>
                  <p className="text-blue-100 mt-1">
                    Control detallado de lotes agrupados por producto
                  </p>
                </div>
              </div>
            </div>

            {/* Estadísticas */}
            <div className="p-6 bg-gray-50 border-b">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">{estadisticas.total}</div>
                  <div className="text-sm text-gray-600">Productos</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{estadisticas.activos}</div>
                  <div className="text-sm text-gray-600">Activos</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-600">{estadisticas.stockBajo}</div>
                  <div className="text-sm text-gray-600">Stock Bajo</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">{estadisticas.agotados}</div>
                  <div className="text-sm text-gray-600">Agotados</div>
                </div>
              </div>
            </div>

            {/* Controles de búsqueda y filtros */}
            <div className="p-6">
              <div className="flex flex-col lg:flex-row gap-4 mb-4">
                <div className="flex-1">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar por producto, lote, código..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`inline-flex items-center px-4 py-2 border rounded-lg font-medium transition-colors ${
                    showFilters 
                      ? 'border-blue-500 text-blue-700 bg-blue-50' 
                      : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                  }`}
                >
                  <FunnelIcon className="h-5 w-5 mr-2" />
                  Filtros
                </button>

                {/* Selector de límite por página */}
                <div className="flex-none min-w-[50px]">
                  <select
                    value={limitPerPage}
                    onChange={(e) => setLimitPerPage(Number(e.target.value))}
                    className="mt-0 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm h-[38px]"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {/* Panel de filtros expandible */}
              {showFilters && (
                <div className="bg-gray-50 p-4 rounded-lg border mb-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Estado
                      </label>
                      <select
                        value={estadoFilter}
                        onChange={(e) => setEstadoFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Todos los estados</option>
                        <option value="activo">Activo</option>
                        <option value="agotado">Agotado</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Producto
                      </label>
                      <select
                        value={productoFilter}
                        onChange={(e) => setProductoFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Todos los productos</option>
                        {productos.map((producto) => (
                          <option key={producto.id} value={producto.id}>
                            {producto.codigoTienda} - {producto.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Ordenar por
                      </label>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="fechaIngreso">Fecha de ingreso</option>
                        <option value="nombreProducto">Nombre del producto</option>
                        <option value="stockRestante">Stock restante</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Orden
                      </label>
                      <button
                        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                        className="w-full inline-flex items-center justify-center px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500"
                      >
                        <ArrowsUpDownIcon className="h-5 w-5 mr-2" />
                        {sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
                    <div className="text-sm text-gray-600">
                      {filteredLotes.length} producto{filteredLotes.length !== 1 ? 's' : ''} encontrado{filteredLotes.length !== 1 ? 's' : ''}
                    </div>
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setEstadoFilter('');
                        setProductoFilter('');
                        setSortBy('fechaIngreso');
                        setSortOrder('desc');
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Limpiar filtros
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Contenido principal - Vista agrupada */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            {displayedLotes.length === 0 ? (
              <div className="text-center py-12">
                <ArchiveBoxIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  {lotes.length === 0 ? 'No hay lotes registrados' : 'No se encontraron lotes'}
                </h3>
                <p className="text-gray-500">
                  {lotes.length === 0 
                    ? 'Los lotes se crean automáticamente cuando registras ingresos de inventario'
                    : 'Intenta ajustar tus filtros de búsqueda'
                  }
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {displayedLotes.map((grupo) => (
                  <div key={grupo.productoId} className="p-6">
                    {/* Encabezado del grupo */}
                    <div 
                      className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-3 rounded-lg -m-3"
                      onClick={() => toggleProductExpansion(grupo.productoId)}
                    >
                      <div className="flex items-center flex-1 min-w-0">
                        <div className="flex-shrink-0 mr-3">
                          {expandedProducts.has(grupo.productoId) ? (
                            <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                          ) : (
                            <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">
                                {grupo.codigoTienda}
                              </h3>
                              <p className="text-sm text-gray-500">
                                {grupo.nombreProducto}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">
                            Stock: {grupo.stockActivo} unidades
                          </div>
                          <div className="text-xs text-gray-500">
                            {grupo.totalLotes} lote{grupo.totalLotes !== 1 ? 's' : ''} • 
                            Precio prom: S/. {(grupo.precioPromedio || 0).toFixed(2)}
                          </div>
                        </div>
                        
                        <div className="flex-shrink-0">
                          {getEstadoBadge(grupo.estadoGeneral, grupo.stockActivo)}
                        </div>
                      </div>
                    </div>

                    {/* Detalles expandibles */}
                    {expandedProducts.has(grupo.productoId) && (
                      <div className="mt-4 ml-8">
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">
                            Lotes individuales ({grupo.lotes.length})
                          </h4>
                          
                          <div className="space-y-3">
                            {grupo.lotes.map((lote) => (
                              <div key={lote.id} className="bg-white p-3 rounded border border-gray-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-4">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      {lote.numeroLote}
                                    </span>
                                    
                                    <div className="text-sm">
                                      <span className="font-medium">Stock: {lote.stockRestante || 0}</span>
                                      <span className="text-gray-500"> / {lote.cantidadInicial || 0}</span>
                                    </div>
                                    
                                    <div className="text-sm text-gray-600">
                                      Precio: S/. {parseFloat(lote.precioCompraUnitario || 0).toFixed(2)}
                                    </div>
                                    
                                    <div className="text-sm text-gray-500">
                                      Ingreso: {formatDate(lote.fechaIngreso)}
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center space-x-2">
                                    {getEstadoBadge(lote.estado, lote.stockRestante)}
                                    
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/inventario/lotes/${lote.id}`);
                                      }}
                                      className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors"
                                      title="Ver detalles"
                                    >
                                      <EyeIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default LotesPage;