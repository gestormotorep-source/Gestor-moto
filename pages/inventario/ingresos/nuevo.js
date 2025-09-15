// pages/inventario/ingresos/nuevo.js
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../contexts/AuthContext';
import Layout from '../../../components/Layout';
import { db } from '../../../lib/firebase';
import { 
  collection,
  getDocs,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { 
  ArrowDownTrayIcon, 
  PlusIcon, 
  MagnifyingGlassIcon, 
  TrashIcon,
  ArrowLeftIcon,
  PencilIcon,
  XMarkIcon,
  HashtagIcon
} from '@heroicons/react/24/outline';

const NuevoIngresoPage = () => {
  const router = useRouter();
  const { user } = useAuth();

  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [proveedores, setProveedores] = useState([]);

  const [ingresoPrincipalData, setIngresoPrincipalData] = useState({
    numeroBoleta: '',
    proveedorId: '',
    observaciones: '',
  });

  // Estados para búsqueda mejorada
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProductos, setFilteredProductos] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [itemsIngreso, setItemsIngreso] = useState([]);

  // Estados para modal de cantidad con lote
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [precioCompra, setPrecioCompra] = useState(0);
  const [numeroLote, setNumeroLote] = useState('');

  // Estados para modal de edición con lote
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editPrecio, setEditPrecio] = useState(0);
  const [editNumeroLote, setEditNumeroLote] = useState('');

  // Función para generar número de lote automático
  const generateLoteNumber = () => {
    const fecha = new Date();
    const year = fecha.getFullYear().toString().slice(-2);
    const month = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const day = fecha.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `L${year}${month}${day}-${random}`;
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        router.push('/auth');
        return;
      }
      
      setLoadingData(true);
      setError(null);
      
      try {
        const qProducts = query(collection(db, 'productos'), orderBy('nombre', 'asc'));
        const productSnapshot = await getDocs(qProducts);
        const productsList = productSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProducts(productsList);

        const qProveedores = query(collection(db, 'proveedores'), orderBy('nombreEmpresa', 'asc'));
        const proveedorSnapshot = await getDocs(qProveedores);
        const proveedoresList = proveedorSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProveedores(proveedoresList);

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
  }, [user, router.isReady]);

  // Búsqueda de productos
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

        return nombre.includes(searchTermLower) ||
               marca.includes(searchTermLower) ||
               codigoTienda.includes(searchTermLower) ||
               codigoProveedor.includes(searchTermLower) ||
               descripcion.includes(searchTermLower);
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

  const handleIngresoPrincipalChange = (e) => {
    const { name, value } = e.target;
    setIngresoPrincipalData(prev => ({ ...prev, [name]: value }));
  };

  // Abrir modal de cantidad para agregar producto
  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setPrecioCompra(parseFloat(product.precioCompraDefault || 0));
    setQuantity(1);
    setNumeroLote(generateLoteNumber()); // Generar número de lote automático
    setShowQuantityModal(true);
    setSearchTerm(''); // Limpiar búsqueda
  };

  // Agregar producto al ingreso con lote
  const handleAddProductToIngreso = async () => {
    if (!selectedProduct) return;

    // Validar que el número de lote no esté duplicado
    const loteExists = itemsIngreso.some(item => item.numeroLote === numeroLote.trim());
    if (loteExists) {
      alert('Ya existe un producto con este número de lote. Por favor, use un número diferente.');
      return;
    }

    if (!numeroLote.trim()) {
      alert('Debe ingresar un número de lote.');
      return;
    }

    const newItem = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      productoId: selectedProduct.id,
      nombreProducto: selectedProduct.nombre,
      marca: selectedProduct.marca || '',
      medida: selectedProduct.medida || '',
      codigoTienda: selectedProduct.codigoTienda || '',
      color: selectedProduct.color || '',
      numeroLote: numeroLote.trim(),
      cantidad: quantity,
      precioCompraUnitario: precioCompra.toFixed(2),
      stockRestanteLote: quantity, // Stock inicial del lote
      subtotal: (quantity * precioCompra).toFixed(2),
      fechaVencimiento: null, // Opcional: agregar después si es necesario
    };

    setItemsIngreso(prev => [...prev, newItem]);
    setShowQuantityModal(false);
    setError(null);
  };

  // Abrir modal de edición
  const handleEditItem = (item) => {
    setEditingItem(item);
    setEditQuantity(item.cantidad);
    setEditPrecio(parseFloat(item.precioCompraUnitario || 0));
    setEditNumeroLote(item.numeroLote);
    setShowEditItemModal(true);
  };

  // Actualizar item con validación de lote
  const handleUpdateItem = async () => {
    if (!editingItem) return;

    // Validar que el número de lote no esté duplicado (excepto el actual)
    const loteExists = itemsIngreso.some(item => 
      item.id !== editingItem.id && item.numeroLote === editNumeroLote.trim()
    );
    if (loteExists) {
      alert('Ya existe un producto con este número de lote. Por favor, use un número diferente.');
      return;
    }

    if (!editNumeroLote.trim()) {
      alert('Debe ingresar un número de lote.');
      return;
    }

    const newItems = [...itemsIngreso];
    const index = newItems.findIndex(item => item.id === editingItem.id);
    
    if (index !== -1) {
      newItems[index] = {
        ...newItems[index],
        numeroLote: editNumeroLote.trim(),
        cantidad: editQuantity,
        precioCompraUnitario: editPrecio.toFixed(2),
        stockRestanteLote: editQuantity, // Actualizar stock del lote
        subtotal: (editQuantity * editPrecio).toFixed(2),
      };
      setItemsIngreso(newItems);
    }
    
    setShowEditItemModal(false);
  };

  const removeItem = (index) => {
    if (window.confirm('¿Está seguro de que desea eliminar este lote del ingreso?')) {
      setItemsIngreso(prevItems => prevItems.filter((_, i) => i !== index));
    }
  };


const handleSubmit = async (e) => {
  e.preventDefault();
  setSaving(true);
  setError(null);

  const proveedorSeleccionado = proveedores.find(p => p.id === ingresoPrincipalData.proveedorId);
  if (!proveedorSeleccionado) {
    setError('Por favor, seleccione un proveedor válido.');
    setSaving(false);
    return;
  }

  if (itemsIngreso.length === 0) {
    setError('Debe añadir al menos un producto al ingreso.');
    setSaving(false);
    return;
  }

  // Validar que todos los lotes tengan números únicos
  const lotes = itemsIngreso.map(item => item.numeroLote);
  const lotesUnicos = [...new Set(lotes)];
  if (lotes.length !== lotesUnicos.length) {
    setError('Hay números de lote duplicados. Cada producto debe tener un número de lote único.');
    setSaving(false);
    return;
  }

  // Validar ítems
  const validItems = itemsIngreso.every(item => {
    const cantidad = parseFloat(item.cantidad);
    const precio = parseFloat(item.precioCompraUnitario);
    return (
      item.productoId &&
      item.numeroLote.trim() &&
      !isNaN(cantidad) && cantidad > 0 &&
      !isNaN(precio) && precio >= 0
    );
  });

  if (!validItems) {
    setError('Por favor, asegúrese de que todos los ítems tengan un producto, número de lote, cantidad (>0) y precio de compra (>=0) válidos.');
    setSaving(false);
    return;
  }

  let costoTotalIngreso = 0;
  itemsIngreso.forEach(item => {
    costoTotalIngreso += parseFloat(item.subtotal || 0);
  });

  try {
    console.log('Iniciando proceso de registro de ingreso...');
    
    // Crear fecha actual para usar en lugar de serverTimestamp en arrays
    const fechaActual = new Date();
    
    // 1. Crear el documento de ingreso principal
    console.log('Creando documento de ingreso...');
    const ingresoDocRef = await addDoc(collection(db, 'ingresos'), {
      numeroBoleta: ingresoPrincipalData.numeroBoleta.trim() || null,
      proveedorId: ingresoPrincipalData.proveedorId,
      proveedorNombre: proveedorSeleccionado.nombreEmpresa,
      observaciones: ingresoPrincipalData.observaciones.trim() || null,
      costoTotalIngreso: parseFloat(costoTotalIngreso.toFixed(2)),
      cantidadLotes: itemsIngreso.length,
      fechaIngreso: serverTimestamp(),
      empleadoId: user.email || user.uid,
      estado: 'pendiente',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log('Ingreso creado con ID:', ingresoDocRef.id);

    // 2. Crear lotes en colección principal
    console.log('Creando lotes en colección principal...');
    const lotesPrincipalesPromises = itemsIngreso.map(async (item, index) => {
      try {
        const loteRef = await addDoc(collection(db, 'lotes'), {
          ingresoId: ingresoDocRef.id,
          productoId: item.productoId,
          nombreProducto: item.nombreProducto,
          marca: item.marca || '',
          codigoTienda: item.codigoTienda || '',
          color: item.color || '',
          numeroLote: item.numeroLote,
          cantidad: parseFloat(item.cantidad),
          cantidadInicial: parseFloat(item.cantidad),
          stockRestante: parseFloat(item.cantidad),
          precioCompraUnitario: parseFloat(item.precioCompraUnitario),
          subtotal: parseFloat(item.subtotal),
          proveedorId: ingresoPrincipalData.proveedorId,
          proveedorNombre: proveedorSeleccionado.nombreEmpresa,
          fechaIngreso: serverTimestamp(),
          fechaVencimiento: item.fechaVencimiento || null,
          estado: 'activo',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log(`Lote ${index + 1} creado:`, loteRef.id);
        return loteRef;
      } catch (err) {
        console.error(`Error creando lote ${index + 1}:`, err);
        throw err;
      }
    });

    // 3. Crear lotes en subcolección
    console.log('Creando lotes en subcolección...');
    const lotesSubcoleccionPromises = itemsIngreso.map(async (item, index) => {
      try {
        const loteRef = await addDoc(collection(ingresoDocRef, 'lotes'), {
          productoId: item.productoId,
          nombreProducto: item.nombreProducto,
          marca: item.marca || '',
          codigoTienda: item.codigoTienda || '',
          color: item.color || '',
          numeroLote: item.numeroLote,
          cantidad: parseFloat(item.cantidad),
          cantidadInicial: parseFloat(item.cantidad),
          stockRestante: parseFloat(item.cantidad),
          precioCompraUnitario: parseFloat(item.precioCompraUnitario),
          subtotal: parseFloat(item.subtotal),
          proveedorId: ingresoPrincipalData.proveedorId,
          proveedorNombre: proveedorSeleccionado.nombreEmpresa,
          fechaIngreso: serverTimestamp(),
          fechaVencimiento: item.fechaVencimiento || null,
          estado: 'activo',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log(`Sublote ${index + 1} creado:`, loteRef.id);
        return loteRef;
      } catch (err) {
        console.error(`Error creando sublote ${index + 1}:`, err);
        throw err;
      }
    });

    // Ejecutar creación de lotes
    await Promise.all(lotesPrincipalesPromises);
    console.log('Todos los lotes principales creados');
    
    await Promise.all(lotesSubcoleccionPromises);
    console.log('Todos los sublotes creados');

    // 4. ACTUALIZAR PRODUCTOS - SECUENCIAL para mejor debugging
    console.log('Iniciando actualización de productos...');
    const productosAActualizar = [...new Set(itemsIngreso.map(item => item.productoId))];
    console.log('Productos a actualizar:', productosAActualizar);

    for (let i = 0; i < productosAActualizar.length; i++) {
      const productoId = productosAActualizar[i];
      console.log(`Procesando producto ${i + 1}/${productosAActualizar.length}: ${productoId}`);
      
      try {
        const productoRef = doc(db, 'productos', productoId);
        console.log('Obteniendo documento del producto...');
        const productoDoc = await getDoc(productoRef);
        
        if (productoDoc.exists()) {
          console.log('Producto encontrado');
          const productoData = productoDoc.data();
          console.log('Datos actuales del producto:', {
            nombre: productoData.nombre,
            proveedores: productoData.proveedores || 'No tiene',
            proveedorPrincipal: productoData.proveedorPrincipal || 'No tiene'
          });
          
          let proveedoresArray = Array.isArray(productoData.proveedores) ? productoData.proveedores : [];
          console.log('Array actual de proveedores:', proveedoresArray);
          
          // Buscar si el proveedor ya existe
          const proveedorIndex = proveedoresArray.findIndex(p => p.proveedorId === ingresoPrincipalData.proveedorId);
          console.log('Índice del proveedor en array:', proveedorIndex);
          
          // Calcular datos del proveedor
          const itemsDelProducto = itemsIngreso.filter(item => item.productoId === productoId);
          const precioPromedio = itemsDelProducto.reduce((sum, item) => sum + parseFloat(item.precioCompraUnitario || 0), 0) / itemsDelProducto.length;
          const cantidadTotal = itemsDelProducto.reduce((sum, item) => sum + parseFloat(item.cantidad || 0), 0);
          
          // CAMBIO IMPORTANTE: usar Date() en lugar de serverTimestamp() dentro del array
          const proveedorInfo = {
            proveedorId: ingresoPrincipalData.proveedorId,
            nombreProveedor: proveedorSeleccionado.nombreEmpresa,
            ultimoIngreso: fechaActual, // Usar Date() en lugar de serverTimestamp()
            precioCompraPromedio: parseFloat(precioPromedio.toFixed(2)),
            cantidadTotalIngresada: cantidadTotal
          };
          
          console.log('Info del proveedor a guardar:', proveedorInfo);
          
          if (proveedorIndex >= 0) {
            console.log('Actualizando proveedor existente');
            const proveedorExistente = proveedoresArray[proveedorIndex];
            proveedoresArray[proveedorIndex] = {
              ...proveedorInfo,
              cantidadTotalIngresada: (proveedorExistente.cantidadTotalIngresada || 0) + cantidadTotal
            };
          } else {
            console.log('Agregando nuevo proveedor');
            proveedoresArray.push(proveedorInfo);
          }
          
          console.log('Nuevo array de proveedores:', proveedoresArray);
          
          // Preparar datos para actualizar
          const updateData = {
            proveedores: proveedoresArray,
            proveedorPrincipal: ingresoPrincipalData.proveedorId,
            proveedorPrincipalNombre: proveedorSeleccionado.nombreEmpresa,
            ultimaFechaIngreso: serverTimestamp(), // serverTimestamp está OK aquí porque no está en array
            updatedAt: serverTimestamp()
          };
          
          console.log('Datos a actualizar:', updateData);
          
          // Actualizar el producto
          await updateDoc(productoRef, updateData);
          console.log('Producto actualizado exitosamente');
          
          // Verificar la actualización
          const verificacion = await getDoc(productoRef);
          if (verificacion.exists()) {
            const datosVerificados = verificacion.data();
            console.log('Verificación - Proveedores guardados:', datosVerificados.proveedores);
            console.log('Verificación - Proveedor principal:', datosVerificados.proveedorPrincipal);
          }
          
        } else {
          console.warn(`Producto ${productoId} no encontrado`);
        }
      } catch (err) {
        console.error(`Error al actualizar producto ${productoId}:`, err);
        // Continuar con el siguiente producto en lugar de fallar todo
      }
    }

    console.log('Proceso completado exitosamente');

    alert(`Ingreso registrado exitosamente!\n\n${itemsIngreso.length} lotes creados\n${productosAActualizar.length} productos procesados\nTotal: S/. ${costoTotalIngreso.toFixed(2)}`);
    
    router.push('/inventario/ingresos');

  } catch (err) {
    console.error("Error general en el proceso:", err);
    setError("Error al registrar el ingreso: " + err.message);
  } finally {
    setSaving(false);
  }
};

  const totalGeneralIngreso = itemsIngreso.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0).toFixed(2);

  if (!router.isReady || !user || loadingData) {
    return (
      <Layout title="Cargando Formulario de Ingreso">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Registrar Nuevo Ingreso con Lotes">
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-full mx-auto px-6 sm:px-8 lg:px-12">
          {error && (
            <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 max-w-md">
              {error}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-6 p-6">
              
              {/* Panel Izquierdo - Información del Ingreso */}
              <div className="col-span-12 lg:col-span-4">
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">Nuevo Ingreso con Lotes</h2>
                    <button
                      onClick={() => router.push('/inventario/ingresos')}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <ArrowLeftIcon className="h-4 w-4 mr-1" />
                      Volver
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Número de Boleta */}
                    <div>
                      <label htmlFor="numeroBoleta" className="block text-sm font-medium text-gray-700 mb-2">
                        Número de Boleta (Opcional)
                      </label>
                      <input
                        type="text"
                        name="numeroBoleta"
                        id="numeroBoleta"
                        value={ingresoPrincipalData.numeroBoleta}
                        onChange={handleIngresoPrincipalChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Ej: B-00001"
                      />
                    </div>

                    {/* Proveedor */}
                    <div>
                      <label htmlFor="proveedorId" className="block text-sm font-medium text-gray-700 mb-2">
                        Proveedor
                      </label>
                      <select
                        id="proveedorId"
                        name="proveedorId"
                        value={ingresoPrincipalData.proveedorId}
                        onChange={handleIngresoPrincipalChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Seleccione un proveedor</option>
                        {proveedores.map((prov) => (
                          <option key={prov.id} value={prov.id}>
                            {prov.nombreEmpresa}
                          </option>
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
                        value={ingresoPrincipalData.observaciones}
                        onChange={handleIngresoPrincipalChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Notas adicionales sobre este ingreso..."
                      />
                    </div>

                    {/* Resumen del Ingreso */}
                    <div className="border-t border-gray-200 pt-4">
                      <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">Cantidad de Lotes:</span>
                          <span className="text-base font-semibold text-gray-900">{itemsIngreso.length}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">Total del Ingreso:</span>
                          <span className="text-lg font-bold text-gray-900">S/. {totalGeneralIngreso}</span>
                        </div>
                      </div>
                    </div>

                    {/* Botón Submit */}
                    <div className="pt-4">
                      <button
                        type="submit"
                        disabled={saving || itemsIngreso.length === 0 || !ingresoPrincipalData.proveedorId}
                        className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent text-base font-semibold rounded-lg shadow-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
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
                            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                            Registrar Ingreso
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Panel Derecho - Buscador y Lotes */}
              <div className="col-span-12 lg:col-span-8">
                {/* Buscador de Productos */}
                <div className="bg-white border border-gray-200 rounded-lg mb-6 relative">
                  <div className="p-4">
                    <h2 className="text-lg font-semibold mb-4 text-gray-800">Buscar Productos para Lotes</h2>
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar productos por nombre, marca, código..."
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
            onClick={() => handleSelectProduct(producto)}
          >
            <div className="flex items-center justify-between gap-4">
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
                
                {/* Stock */}
                <div className="flex-shrink-0">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Stock:</span>
                  <span className="ml-1 text-sm font-semibold text-gray-900">{producto.stockActual || 0}</span>
                </div>
              </div>
              
              {/* Precio */}
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-blue-600 text-base">
                  S/. {parseFloat(producto.precioCompraDefault || 0).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Precio Compra
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
                </div>

                {/* Lotes del Ingreso */}
                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                      <HashtagIcon className="h-6 w-6 mr-2 text-blue-600" />
                      Lotes del Ingreso
                    </h3>
                  </div>

                  <div className="p-4">
                    {itemsIngreso.length === 0 ? (
                      <div className="text-center py-12">
                        <HashtagIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <h4 className="text-lg font-medium text-gray-600 mb-2">No hay lotes en este ingreso</h4>
                        <p className="text-gray-500">Cada producto que agregues tendrá su número de lote único</p>
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
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">CANT.</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">P. COMPRA</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">SUBTOTAL</th>
                                <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">ACCIONES</th>
                              </tr>
                            </thead>
                            
                            <tbody>
                              {itemsIngreso.map((item, index) => (
                                <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm text-gray-900 font-medium">
                                      {item.codigoTienda || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-sm text-gray-900 font-medium">
                                      {item.nombreProducto || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      {item.numeroLote}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-sm text-gray-900 font-medium">
                                      {item.marca || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-sm text-gray-900 font-medium">
                                      {item.medida || 'N/A'}
                                    </span>
                                  </td>                        
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm font-medium text-gray-900">
                                      {item.cantidad}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm font-medium text-gray-900">
                                      S/. {parseFloat(item.precioCompraUnitario || 0).toFixed(2)}
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
                                        title="Editar Lote"
                                      >
                                        <PencilIcon className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeItem(index)}
                                        className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors"
                                        title="Eliminar Lote"
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
                              <h3 className="text-lg font-semibold">Total del Ingreso</h3>
                              <p className="text-blue-100 text-sm">{itemsIngreso.length} lote{itemsIngreso.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl font-bold">
                                S/. {totalGeneralIngreso}
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

      {/* Modal de Cantidad con Lote */}
      {showQuantityModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowQuantityModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-3xl sm:p-6">
              <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                <button
                  type="button"
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  onClick={() => setShowQuantityModal(false)}
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                  <HashtagIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                  <h3 className="text-xl font-semibold leading-6 text-gray-900 mb-4">
                    Crear Nuevo Lote
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
                            <span className="font-medium text-gray-700">Stock actual: </span>
                            <span className="text-gray-600">{selectedProduct.stockActual || 0}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Color: </span>
                            <span className="text-gray-600">{selectedProduct.color || 'N/A'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Número de Lote */}
                      <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          <HashtagIcon className="h-4 w-4 inline mr-1" />
                          Número de Lote
                        </label>
                        <div className="flex">
                          <input
                            type="text"
                            value={numeroLote}
                            onChange={(e) => setNumeroLote(e.target.value)}
                            className="flex-1 px-4 py-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-mono"
                            placeholder="Ej: L240915-ABC1"
                          />
                          <button
                            type="button"
                            onClick={() => setNumeroLote(generateLoteNumber())}
                            className="px-4 py-3 bg-blue-100 border border-l-0 border-gray-300 rounded-r-lg hover:bg-blue-200 transition-colors text-sm"
                            title="Generar nuevo número"
                          >
                            🎲
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Cada lote debe tener un número único. Se genera automáticamente pero puedes cambiarlo.
                        </p>
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
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-3">
                            Precio de Compra (S/.)
                          </label>
                          <input
                            type="number"
                            value={precioCompra}
                            onChange={(e) => setPrecioCompra(parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                          />
                        </div>
                      </div>

                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200 mt-6">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-medium text-gray-700">Subtotal del Lote:</span>
                          <span className="font-bold text-blue-800 text-2xl">S/. {(quantity * precioCompra).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 sm:flex sm:flex-row-reverse gap-3">
                <button
                  type="button"
                  className="inline-flex w-full justify-center rounded-md bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-500 sm:w-auto disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  onClick={handleAddProductToIngreso}
                  disabled={quantity <= 0 || precioCompra < 0 || !numeroLote.trim()}
                >
                  Crear Lote
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

      {/* Modal de Edición de Lote */}
      {showEditItemModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowEditItemModal(false)}></div>
            <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-3xl sm:p-6">
              <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                <button
                  type="button"
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
                    Editar Lote
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

                      {/* Número de Lote en edición */}
                      <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          <HashtagIcon className="h-4 w-4 inline mr-1" />
                          Número de Lote
                        </label>
                        <div className="flex">
                          <input
                            type="text"
                            value={editNumeroLote}
                            onChange={(e) => setEditNumeroLote(e.target.value)}
                            className="flex-1 px-4 py-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-mono"
                            placeholder="Ej: L240915-ABC1"
                          />
                          <button
                            type="button"
                            onClick={() => setEditNumeroLote(generateLoteNumber())}
                            className="px-4 py-3 bg-blue-100 border border-l-0 border-gray-300 rounded-r-lg hover:bg-blue-200 transition-colors text-sm"
                            title="Generar nuevo número"
                          >
                            🎲
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Debe ser único entre todos los lotes del ingreso.
                        </p>
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
                            Precio de Compra (S/.)
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

              <div className="mt-6 sm:flex sm:flex-row-reverse gap-3">
                <button
                  type="button"
                  className="inline-flex w-full justify-center rounded-md bg-yellow-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-yellow-500 sm:w-auto disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  onClick={handleUpdateItem}
                  disabled={editQuantity <= 0 || editPrecio < 0 || !editNumeroLote.trim()}
                >
                  Actualizar Lote
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
    </Layout>
  );
};

export default NuevoIngresoPage;