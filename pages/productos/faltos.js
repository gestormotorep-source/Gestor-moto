// pages/productos/faltantes.js - Versión mejorada con filtro de proveedor y selector de límite
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { useRouter } from 'next/router';
import { 
  ExclamationTriangleIcon, 
  ArchiveBoxIcon, 
  MagnifyingGlassIcon, 
  PencilIcon, 
  FunnelIcon,
  XMarkIcon,
  BuildingStorefrontIcon,
  getSortIcon 
} from '@heroicons/react/24/outline';

const ProductosFaltantesPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  
  // Estados para datos
  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [productosFaltantes, setProductosFaltantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Estados para filtros y búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProveedorId, setSelectedProveedorId] = useState('');
  const [showFilters, setShowFilters] = useState(false);
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
        const productosList = productSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProductos(productosList);

        // Cargar proveedores
        const qProveedores = query(collection(db, 'proveedores'), orderBy('nombreEmpresa', 'asc'));
        const proveedorSnapshot = await getDocs(qProveedores);
        const proveedoresList = proveedorSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProveedores(proveedoresList);

      } catch (err) {
        console.error("Error al cargar datos:", err);
        setError("Error al cargar los datos. Intente de nuevo.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, router]);

  useEffect(() => {
    // Filtrar productos faltantes con búsqueda y filtro de proveedor
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    const faltantes = productos.filter(producto => {
      // Condición principal: productos faltantes
      const currentStock = typeof producto.stockActual === 'number' ? producto.stockActual : 0;
      const thresholdStock = typeof producto.stockReferencialUmbral === 'number' ? producto.stockReferencialUmbral : 0;
      const isFaltante = currentStock <= thresholdStock;

      // Condición de búsqueda por texto
      const matchesSearch = !searchTerm || (
        (producto.nombre && producto.nombre.toLowerCase().includes(lowerCaseSearchTerm)) ||
        (producto.marca && producto.marca.toLowerCase().includes(lowerCaseSearchTerm)) ||
        (producto.codigoTienda && producto.codigoTienda.toLowerCase().includes(lowerCaseSearchTerm)) ||
        (producto.codigoProveedor && producto.codigoProveedor.toLowerCase().includes(lowerCaseSearchTerm)) ||
        (producto.ubicacion && producto.ubicacion.toLowerCase().includes(lowerCaseSearchTerm))
      );

      // Condición de filtro por proveedor
      const matchesProveedor = !selectedProveedorId || (
        // Verificar si el producto tiene este proveedor
        (producto.proveedorPrincipal === selectedProveedorId) ||
        (producto.proveedores && producto.proveedores.some(p => p.proveedorId === selectedProveedorId))
      );

      return isFaltante && matchesSearch && matchesProveedor;
    });

    setProductosFaltantes(faltantes);
  }, [productos, searchTerm, selectedProveedorId]);

  // Limitar los resultados mostrados
  const displayedProductos = productosFaltantes.slice(0, limitPerPage);

  // Función para obtener el nombre del proveedor principal
  const getProveedorNombre = (producto) => {
    if (producto.proveedorPrincipalNombre) {
      return producto.proveedorPrincipalNombre;
    }
    
    if (producto.proveedores && producto.proveedores.length > 0) {
      // Retornar el primer proveedor si no hay principal definido
      return producto.proveedores[0].nombreProveedor;
    }
    
    return 'Sin proveedor';
  };

  // Función para obtener todos los proveedores de un producto
  const getProveedoresProducto = (producto) => {
    if (producto.proveedores && producto.proveedores.length > 0) {
      return producto.proveedores.map(p => p.nombreProveedor).join(', ');
    }
    return getProveedorNombre(producto);
  };

  // Limpiar filtros
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedProveedorId('');
  };

  if (!user) {
    return null;
  }

  return (
    <Layout title="Productos Faltantes">
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-6 bg-white rounded-lg shadow-md flex flex-col">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium ${
                  showFilters ? 'bg-blue-50 text-blue-700 border-blue-300' : 'text-gray-700 bg-white hover:bg-gray-50'
                } transition-colors`}
              >
                <FunnelIcon className="h-5 w-5 mr-2" />
                Filtros
                {(searchTerm || selectedProveedorId) && (
                  <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                    !
                  </span>
                )}
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
            
          </div>

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
              <span className="block sm:inline font-medium">{error}</span>
            </div>
          )}

          {/* Panel de Filtros */}
          {showFilters && (
            <div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Filtrar Productos Faltantes</h3>
                {(searchTerm || selectedProveedorId) && (
                  <button
                    onClick={clearFilters}
                    className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <XMarkIcon className="h-4 w-4 mr-1" />
                    Limpiar filtros
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Búsqueda por texto */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Buscar producto
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Nombre, marca, código..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>
                </div>

                {/* Filtro por proveedor */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Filtrar por proveedor
                  </label>
                  <select
                    value={selectedProveedorId}
                    onChange={(e) => setSelectedProveedorId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Todos los proveedores</option>
                    {proveedores.map((proveedor) => (
                      <option key={proveedor.id} value={proveedor.id}>
                        {proveedor.nombreEmpresa}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Estadísticas de filtrado */}
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-700">
                    <strong>{productosFaltantes.length}</strong> productos faltantes encontrados
                    {productosFaltantes.length > limitPerPage && (
                      <span className="text-blue-600 ml-2">
                        (mostrando {Math.min(limitPerPage, productosFaltantes.length)})
                      </span>
                    )}
                  </span>
                  {selectedProveedorId && (
                    <span className="text-blue-600">
                      Proveedor: <strong>{proveedores.find(p => p.id === selectedProveedorId)?.nombreEmpresa}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : displayedProductos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-gray-50 rounded-lg p-4 shadow-inner">
              <ArchiveBoxIcon className="h-24 w-24 text-gray-300 mb-4" />
              {selectedProveedorId || searchTerm ? (
                <>
                  <p className="text-lg font-medium">No se encontraron productos faltantes</p>
                  <p className="text-sm text-gray-400">Intenta ajustar los filtros de búsqueda</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium">¡No hay productos faltantes en este momento!</p>
                  <p className="text-sm text-gray-400">Todo tu inventario está por encima del umbral establecido.</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto shadow-lg ring-1 ring-black ring-opacity-5 rounded-lg overflow-y-auto max-h-[70vh]">
              <table className="min-w-full border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th 
                      scope="col" 
                      className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">
                      CÓDIGO
                    </th>
                    <th 
                      scope="col" 
                      className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">
                      NOMBRE
                    </th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MARCA</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MEDIDA</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">UBICACIÓN</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">PROVEEDOR PRINCIPAL</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">TODOS LOS PROVEEDORES</th>
                    <th 
                      scope="col" 
                      className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">
                      STOCK ACTUAL
                    </th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">P. COMPRA (S/.)</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">P. VENTA (S/.)</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ACCIONES</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {displayedProductos.map((producto, index) => {
                    const deficit = (producto.stockReferencialUmbral || 0) - (producto.stockActual || 0);
                    return (
                      <tr key={producto.id} className={index % 2 === 0 ? 'bg-white' : ''}>
                        {/* CÓDIGO */}
                        <td className="border border-gray-300 px-3 py-2 text-sm text-center">
                          <div className="font-medium text-gray-900">{producto.codigoTienda || 'N/A'}</div>
                        </td>
                        
                        {/* NOMBRE */}
                        <td className="border border-gray-300 px-3 py-2 text-sm text-left">
                          <div className="font-medium text-gray-900">{producto.nombre || 'N/A'}</div>
                        </td>
                        
                        {/* MARCA */}
                        <td className="border border-gray-300 px-3 py-2 text-sm text-center text-gray-700">
                          {producto.marca || 'Sin marca'}
                        </td>
                        
                        {/* MEDIDA */}
                        <td className="border border-gray-300 px-3 py-2 text-sm text-center text-gray-700">
                          {producto.medida || 'N/A'}
                        </td>
                        
                        {/* UBICACIÓN */}
                        <td className="border border-gray-300 px-3 py-2 text-sm text-center text-gray-700">
                          {producto.ubicacion || 'N/A'}
                        </td>
                        
                        {/* PROVEEDOR PRINCIPAL */}
                        <td className="border border-gray-300 px-3 py-2 text-sm text-left">
                          <div className="flex items-center">
                            <BuildingStorefrontIcon className="h-4 w-4 text-blue-500 mr-1" />
                            <span className="text-blue-700 font-medium">{getProveedorNombre(producto)}</span>
                          </div>
                        </td>
                        
                        {/* TODOS LOS PROVEEDORES */}
                        <td className="border border-gray-300 px-3 py-2 text-sm text-gray-600 max-w-xs">
                          <div className="truncate" title={getProveedoresProducto(producto)}>
                            {getProveedoresProducto(producto)}
                          </div>
                        </td>
                        
                        {/* STOCK ACTUAL */}
                        <td className="border border-gray-300 px-3 py-2 text-sm text-center">
                          <span className="font-bold text-red-600 bg-red-100 px-2 py-1 rounded">
                            {producto.stockActual || 0}
                          </span>
                        </td>
                        
                        {/* PRECIO COMPRA */}
                        <td className="border border-gray-300 px-3 py-2 text-sm text-center text-gray-700">
                          S/. {parseFloat(producto.precioCompraDefault || 0).toFixed(2)}
                        </td>
                        
                        {/* PRECIO VENTA */}
                        <td className="border border-gray-300 px-3 py-2 text-sm text-center text-gray-700">
                          S/. {parseFloat(producto.precioVentaDefault || 0).toFixed(2)}
                        </td>
                        
                        {/* ACCIONES */}
                        <td className="border border-gray-300 px-3 py-2 text-sm text-center">
                          <button
                            onClick={() => router.push(`/productos/${producto.id}`)}
                            className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition duration-150 ease-in-out"
                            title="Editar Producto"
                          >
                            <PencilIcon className="h-5 w-5" />
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
      </div>
    </Layout>
  );
};

export default ProductosFaltantesPage;  