// pages/productos/index.js
import { useState, useEffect, Fragment } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import * as XLSX from 'xlsx';
import { db } from '../../lib/firebase';
import {
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  where,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  PencilIcon,
  PlusIcon,
  TrashIcon,
  PhotoIcon,
  EyeIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  ChevronUpIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';

import ImageModal from '../../components/modals/ImageModal';
import ProductDetailsModal from '../../components/modals/ProductDetailsModal';
import ProductModelsModal from '../../components/modals/ProductModelsModal';
import ConfirmModal from '../../components/modals/ConfirmModal';
import AlertModal from '../../components/modals/AlertModal';

const ProductosPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.email === 'admin@gmail.com';
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  

  // Estados para los filtros
  const [filterNombre, setFilterNombre] = useState('');
  const [filterCodigoProveedor, setFilterCodigoProveedor] = useState('');
  const [filterMarca, setFilterMarca] = useState(''); // Cambiado de filterColor
  const [filterCodigoTienda, setFilterCodigoTienda] = useState('');
  const [filterUbicacion, setFilterUbicacion] = useState('');
  const [filterModelosCompatibles, setFilterModelosCompatibles] = useState('');
  const [filterMedida, setFilterMedida] = useState('');

  const [filteredProductos, setFilteredProductos] = useState([]);

  // Estados para ordenamiento
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' o 'desc'

  // Estados para la paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [productsPerPage, setProductsPerPage] = useState(10);
  const totalPages = Math.ceil(filteredProductos.length / productsPerPage);

  // Estados para los modales
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isProductDetailsModalOpen, setIsProductDetailsModalOpen] = useState(false);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState(null);
  const [isProductModelsModalOpen, setIsProductModelsModalOpen] = useState(false);
  const [selectedProductForModels, setSelectedProductForModels] = useState(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  // Función para manejar el ordenamiento
  const handleSort = (columnKey) => {
    let newDirection = 'asc';
    
    // Si ya estamos ordenando por esta columna, cambiar dirección
    if (sortColumn === columnKey) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }
    
    setSortColumn(columnKey);
    setSortDirection(newDirection);
    
    // Aplicar el ordenamiento
    const sortedProducts = [...filteredProductos].sort((a, b) => {
      let aValue = a[columnKey] || '';
      let bValue = b[columnKey] || '';
      
      // Convertir a string para comparación consistente
      aValue = aValue.toString().toLowerCase();
      bValue = bValue.toString().toLowerCase();
      
      // Para código de tienda, intentar comparación numérica si es posible
      if (columnKey === 'codigoTienda') {
        // Extraer números del código para ordenamiento numérico
        const aNumeric = aValue.match(/\d+/);
        const bNumeric = bValue.match(/\d+/);
        
        if (aNumeric && bNumeric) {
          const aNum = parseInt(aNumeric[0]);
          const bNum = parseInt(bNumeric[0]);
          
          if (aNum !== bNum) {
            return newDirection === 'asc' ? aNum - bNum : bNum - aNum;
          }
        }
      }
      
      // Comparación alfabética estándar
      if (aValue < bValue) {
        return newDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return newDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
    
    setFilteredProductos(sortedProducts);
    setCurrentPage(1); // Resetear a la primera página al ordenar
  };

  // Función para mostrar el icono de ordenamiento
  const getSortIcon = (columnKey) => {
    if (sortColumn !== columnKey) {
      return null;
    }
    
    return sortDirection === 'asc' ? (
      <ChevronUpIcon className="h-4 w-4 inline ml-1" />
    ) : (
      <ChevronDownIcon className="h-4 w-4 inline ml-1" />
    );
  };

  // Función para recalcular el precio de compra de un producto basado en FIFO
  const recalcularPrecioCompraFIFO = async (productoId) => {
    try {
      // Buscar todos los lotes activos del producto, ordenados por fecha de ingreso (FIFO)
      const lotesQuery = query(
        collection(db, 'lotes'),
        where('productoId', '==', productoId),
        where('stockRestante', '>', 0),
        where('estado', '==', 'activo'),
        orderBy('fechaIngreso', 'asc')
      );
      
      const lotesSnapshot = await getDocs(lotesQuery);
      
      let nuevoPrecioCompra = 0;
      let stockTotal = 0;
      
      // Si hay lotes disponibles, tomar el precio del primer lote (más antiguo)
      if (!lotesSnapshot.empty) {
        const primerLote = lotesSnapshot.docs[0].data();
        nuevoPrecioCompra = parseFloat(primerLote.precioCompraUnitario || 0);
        
        // Calcular stock total de todos los lotes activos
        lotesSnapshot.docs.forEach(doc => {
          stockTotal += parseInt(doc.data().stockRestante || 0);
        });
      }
      
      // Actualizar el producto con el nuevo precio y stock
      await updateDoc(doc(db, 'productos', productoId), {
        precioCompraDefault: nuevoPrecioCompra,
        stockActual: stockTotal,
        updatedAt: serverTimestamp()
      });
      
      return { nuevoPrecioCompra, stockTotal };
      
    } catch (error) {
      console.error(`Error al recalcular precio FIFO para producto ${productoId}:`, error);
      throw error;
    }
  };

  // Función para actualizar precios de todos los productos
  const actualizarTodosLosPrecios = async () => {
    if (!window.confirm('¿Está seguro de que desea recalcular los precios de compra de todos los productos basado en sus lotes disponibles? Esta operación puede tomar unos momentos.')) {
      return;
    }
    
    setUpdatingPrices(true);
    let actualizados = 0;
    let errores = 0;
    
    try {
      for (const producto of productos) {
        try {
          await recalcularPrecioCompraFIFO(producto.id);
          actualizados++;
        } catch (error) {
          console.error(`Error al actualizar producto ${producto.id}:`, error);
          errores++;
        }
      }
      
      // Recargar la lista de productos
      await fetchProductos();
      
      setAlertMessage(`Actualización completa: ${actualizados} productos actualizados${errores > 0 ? `, ${errores} errores` : ''}.`);
      setIsAlertModalOpen(true);
      
    } catch (error) {
      console.error('Error general al actualizar precios:', error);
      setError('Error al actualizar los precios. Intente de nuevo.');
    } finally {
      setUpdatingPrices(false);
    }
  };

  // Función para recalcular precio de un producto específico
  const recalcularProductoEspecifico = async (productoId) => {
    try {
      const resultado = await recalcularPrecioCompraFIFO(productoId);
      
      // Actualizar el producto en la lista local
      setProductos(prevProductos => 
        prevProductos.map(p => 
          p.id === productoId 
            ? { 
                ...p, 
                precioCompraDefault: resultado.nuevoPrecioCompra,
                stockActual: resultado.stockTotal 
              }
            : p
        )
      );
      
      setFilteredProductos(prevFiltered => 
        prevFiltered.map(p => 
          p.id === productoId 
            ? { 
                ...p, 
                precioCompraDefault: resultado.nuevoPrecioCompra,
                stockActual: resultado.stockTotal 
              }
            : p
        )
      );
      
      setAlertMessage(`Precio actualizado: S/. ${resultado.nuevoPrecioCompra.toFixed(2)} (Stock: ${resultado.stockTotal})`);
      setIsAlertModalOpen(true);
      
    } catch (error) {
      console.error('Error al recalcular producto específico:', error);
      setError('Error al recalcular el precio. Intente de nuevo.');
    }
  };

  // Función para cargar todos los productos
  const fetchProductos = async () => {
    if (!user) {
      router.push('/auth');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qProductos = query(collection(db, 'productos'), orderBy('nombre', 'asc'));
      const productosSnapshot = await getDocs(qProductos);
      const productosList = productosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProductos(productosList);
      setFilteredProductos(productosList);
    } catch (err) {
      console.error("Error al cargar productos:", err);
      setError("Error al cargar la información de productos. Intente de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductos();
  }, [user, router]);

  // Lógica de filtrado combinada
  const applyFilters = () => {
  const lowerFilterNombre = filterNombre.toLowerCase();
  const lowerFilterCodigoProveedor = filterCodigoProveedor.toLowerCase();
  const lowerFilterMarca = filterMarca.toLowerCase(); // Cambiado de filterColor
  const lowerFilterCodigoTienda = filterCodigoTienda.toLowerCase();
  const lowerFilterUbicacion = filterUbicacion.toLowerCase();
  const lowerFilterModelosCompatibles = filterModelosCompatibles.toLowerCase();
  const lowerFilterMedida = filterMedida.toLowerCase();

  const filtered = productos.filter(producto => {
    const matchesNombre = producto.nombre.toLowerCase().includes(lowerFilterNombre);
    const matchesCodigoProveedor = (producto.codigoProveedor && producto.codigoProveedor.toLowerCase().includes(lowerFilterCodigoProveedor)) || lowerFilterCodigoProveedor === '';
    const matchesMarca = (producto.marca && producto.marca.toLowerCase().includes(lowerFilterMarca)) || lowerFilterMarca === ''; // Cambiado de matchesColor
    const matchesCodigoTienda = producto.codigoTienda.toLowerCase().includes(lowerFilterCodigoTienda);
    const matchesUbicacion = (producto.ubicacion && producto.ubicacion.toLowerCase().includes(lowerFilterUbicacion)) || lowerFilterUbicacion === '';
    const matchesModelosCompatibles = (producto.modelosCompatiblesTexto && producto.modelosCompatiblesTexto.toLowerCase().includes(lowerFilterModelosCompatibles)) || lowerFilterModelosCompatibles === '';
    const matchesMedida = (producto.medida && producto.medida.toLowerCase().includes(lowerFilterMedida)) || lowerFilterMedida === '';

    return matchesNombre && matchesCodigoTienda && matchesCodigoProveedor && matchesUbicacion && matchesModelosCompatibles && matchesMarca && matchesMedida; // Cambiado matchesColor por matchesMarca
  });
  
  setFilteredProductos(filtered);
  setCurrentPage(1); // Resetear a la primera página al aplicar filtros
  
  // Limpiar el ordenamiento al aplicar filtros
  setSortColumn(null);
  setSortDirection('asc');
};

  const handleSearchClick = () => {
    applyFilters();
  };

  const handleClearFilters = () => {
  setFilterNombre('');
  setFilterCodigoProveedor('');
  setFilterCodigoTienda('');
  setFilterUbicacion('');
  setFilterModelosCompatibles('');
  setFilterMarca(''); // Cambiado de setFilterColor
  setFilterMedida('');
  setFilteredProductos(productos);
  setCurrentPage(1);
  
  // Limpiar el ordenamiento
  setSortColumn(null);
  setSortDirection('asc');
};


  const handleDelete = async (productId) => {
    try {
      await deleteDoc(doc(db, 'productos', productId));
      setProductos(prevProductos => prevProductos.filter(p => p.id !== productId));
      setFilteredProductos(prevFiltered => prevFiltered.filter(p => p.id !== productId));
      setAlertMessage('Producto eliminado con éxito.');
      setIsAlertModalOpen(true);
    } catch (err) {
      console.error("Error al eliminar producto:", err);
      setError("Error al eliminar el producto. " + err.message);
      setAlertMessage('Hubo un error al eliminar el producto.');
      setIsAlertModalOpen(true);
    } finally {
      setIsConfirmModalOpen(false); // Cierra el modal de confirmación
    }
  };

  const confirmDelete = (productId) => {
    setConfirmMessage('¿Estás seguro de que quieres eliminar este producto? Esta acción es irreversible.');
    setConfirmAction(() => () => handleDelete(productId));
    setIsConfirmModalOpen(true);
  };

  // Funciones para los modales
  const openImageModal = (producto) => {
  setSelectedProductForDetails(producto);
  setIsImageModalOpen(true);
};
  const closeImageModal = () => {
  setIsImageModalOpen(false);
  setSelectedProductForDetails(null);
};

  const openProductDetailsModal = (product) => {
    setSelectedProductForDetails(product);
    setIsProductDetailsModalOpen(true);
  };
  const closeProductDetailsModal = () => {
    setSelectedProductForDetails(null);
    setIsProductDetailsModalOpen(false);
  };

  const openProductModelsModal = (product) => {
    setSelectedProductForModels(product);
    setIsProductModelsModalOpen(true);
  };
  const closeProductModelsModal = () => {
    setSelectedProductForModels(null);
    setIsProductModelsModalOpen(false);
  };

  // Función para determinar si el stock está bajo
  const isLowStock = (stockActual, stockUmbral) => {
    return stockActual <= stockUmbral;
  };

  // Función para determinar si un producto tiene precio desactualizado
  const needsPriceUpdate = (producto) => {
    // Lógica para determinar si el precio podría estar desactualizado
    // Por ejemplo, si no se ha actualizado en los últimos 30 días
    const lastUpdate = producto.updatedAt?.toDate() || new Date(0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return lastUpdate < thirtyDaysAgo;
  };

  // Lógica de paginación
  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = filteredProductos.slice(indexOfFirstProduct, indexOfLastProduct);

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };


  // Agrega estos estados adicionales en el componente ProductosPage
const [isImportModalOpen, setIsImportModalOpen] = useState(false);
const [importFile, setImportFile] = useState(null);
const [isImporting, setIsImporting] = useState(false);
const [importResults, setImportResults] = useState(null);
const [previewData, setPreviewData] = useState([]);

// Función para procesar el archivo Excel
const handleFileSelect = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  setImportFile(file);
  
  // Leer y previsualizar el archivo
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      // Mostrar solo los primeros 5 registros para previsualización
      setPreviewData(jsonData.slice(0, 5));
    } catch (error) {
      console.error('Error al leer el archivo:', error);
      setAlertMessage('Error al leer el archivo Excel. Verifique que el formato sea correcto.');
      setIsAlertModalOpen(true);
    }
  };
  reader.readAsArrayBuffer(file);
};

// Función para validar los datos del Excel
const validateExcelData = (data) => {
  const errors = [];
  // Campos que NO pueden estar vacíos (pero sí pueden ser 0)
  const requiredTextFields = ['nombre', 'marca'];
  // Campos que deben estar presentes y ser números (pueden ser 0)
  const requiredNumericFields = ['precioCompraDefault', 'precioVentaDefault', 'precioVentaMinimo', 'stockActual'];
  
  data.forEach((row, index) => {
    const rowNumber = index + 1;
    
    // Validar campos de texto obligatorios
    requiredTextFields.forEach(field => {
      if (!row[field] || row[field].toString().trim() === '') {
        errors.push(`Fila ${rowNumber}: El campo '${field}' es obligatorio`);
      }
    });
    
    // Validar campos numéricos obligatorios (pueden ser 0 pero no vacíos)
    requiredNumericFields.forEach(field => {
      if (row[field] === undefined || row[field] === null || row[field] === '') {
        errors.push(`Fila ${rowNumber}: El campo '${field}' es obligatorio`);
      } else if (isNaN(parseFloat(row[field]))) {
        errors.push(`Fila ${rowNumber}: El campo '${field}' debe ser un número válido`);
      } else if (parseFloat(row[field]) < 0) {
        errors.push(`Fila ${rowNumber}: El campo '${field}' no puede ser negativo`);
      }
    });
    
    // Validar campos numéricos opcionales
    const optionalNumericFields = ['stockReferencialUmbral'];
    optionalNumericFields.forEach(field => {
      if (row[field] && row[field] !== '' && isNaN(parseFloat(row[field]))) {
        errors.push(`Fila ${rowNumber}: El campo '${field}' debe ser un número válido`);
      }
      if (row[field] && parseFloat(row[field]) < 0) {
        errors.push(`Fila ${rowNumber}: El campo '${field}' no puede ser negativo`);
      }
    });
    
    // Validar que el precio mínimo no sea mayor al precio de venta (solo si ambos son > 0)
    const precioVenta = parseFloat(row.precioVentaDefault || 0);
    const precioMinimo = parseFloat(row.precioVentaMinimo || 0);
    if (precioVenta > 0 && precioMinimo > precioVenta) {
      errors.push(`Fila ${rowNumber}: El precio de venta mínimo no puede ser mayor al precio de venta default`);
    }
    
    // Validar URLs de imágenes
    if (row.imageUrls && row.imageUrls.toString().trim() !== '') {
      const urls = row.imageUrls.toString().split(',').map(url => url.trim()).filter(url => url);
      if (urls.length > 3) {
        errors.push(`Fila ${rowNumber}: Máximo 3 URLs de imágenes permitidas`);
      }
    }
  });
  
  return errors;
};

// Función para procesar e importar los datos
const processExcelImport = async () => {
  if (!importFile) return;
  
  setIsImporting(true);
  
  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        // Validar datos
        const validationErrors = validateExcelData(jsonData);
        if (validationErrors.length > 0) {
          setAlertMessage(`Errores de validación:\n${validationErrors.slice(0, 10).join('\n')}${validationErrors.length > 10 ? '\n... y más errores.' : ''}`);
          setIsAlertModalOpen(true);
          setIsImporting(false);
          return;
        }
        
        let successCount = 0;
        let errorCount = 0;
        const errorDetails = [];
        
        // Procesar cada producto
        for (const [index, row] of jsonData.entries()) {
          try {
            // Procesar URLs de imágenes
            const imageUrls = row.imageUrls 
              ? row.imageUrls.split(',').map(url => url.trim()).filter(url => url)
              : [];
            
            const productData = {
              nombre: row.nombre?.toString().trim(),
              descripcion: row.descripcionPuntos?.toString().trim() || '',
              descripcionPuntos: row.descripcionPuntos?.toString().trim() || '',
              medida: row.medida?.toString().trim() || '',
              marca: row.marca?.toString().trim(),
              codigoTienda: row.codigoTienda?.toString().trim() || '',
              codigoProveedor: row.codigoProveedor?.toString().trim() || '',
              precioCompraDefault: parseFloat(row.precioCompraDefault || 0),
              precioVentaDefault: parseFloat(row.precioVentaDefault || 0),
              precioVentaMinimo: parseFloat(row.precioVentaMinimo || 0),
              stockActual: parseInt(row.stockActual || 0),
              stockReferencialUmbral: parseInt(row.stockReferencialUmbral || 4),
              ubicacion: row.ubicacion?.toString().trim() || '',
              imageUrls: imageUrls,
              imageUrl: imageUrls.length > 0 ? imageUrls[0] : '', // Compatibilidad con campo anterior
              modelosCompatiblesTexto: row.modelosCompatiblesTexto?.toString().trim() || '',
              modelosCompatiblesIds: [],
              color: row.color?.toString().trim() || '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            };
            
            await addDoc(collection(db, 'productos'), productData);
            successCount++;
          } catch (error) {
            errorCount++;
            errorDetails.push(`Fila ${index + 1}: ${error.message}`);
            console.error(`Error al importar fila ${index + 1}:`, error);
          }
        }
        
        // Actualizar lista de productos
        await fetchProductos();
        
        // Mostrar resultados
        const resultMessage = `Importación completada:\n✅ ${successCount} productos importados exitosamente\n${errorCount > 0 ? `❌ ${errorCount} errores` : ''}${errorDetails.length > 0 ? '\n\nPrimeros errores:\n' + errorDetails.slice(0, 5).join('\n') : ''}`;
        
        setImportResults({
          success: successCount,
          errors: errorCount,
          details: errorDetails
        });
        
        setAlertMessage(resultMessage);
        setIsAlertModalOpen(true);
        setIsImportModalOpen(false);
        
      } catch (error) {
        console.error('Error al procesar el archivo:', error);
        setAlertMessage('Error al procesar el archivo Excel. Verifique que el formato sea correcto.');
        setIsAlertModalOpen(true);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsArrayBuffer(importFile);
    
  } catch (error) {
    console.error('Error en la importación:', error);
    setAlertMessage('Error durante la importación. Intente de nuevo.');
    setIsAlertModalOpen(true);
    setIsImporting(false);
  }
};

// Función para descargar la plantilla Excel
const downloadExcelTemplate = () => {
  const templateData = [
    {
      nombre: 'Ejemplo Producto 1',
      descripcionPuntos: '- Característica 1\n- Característica 2\n- Característica 3',
      medida: '1.2m',
      marca: 'YAMAHA',
      codigoTienda: 'PROD001',
      codigoProveedor: 'YAM-001',
      precioCompraDefault: 25.50,
      precioVentaDefault: 45.00,
      precioVentaMinimo: 35.00,
      stockActual: 50,
      stockReferencialUmbral: 5,
      ubicacion: 'A-1-3',
      imageUrls: 'https://ejemplo.com/img1.jpg,https://ejemplo.com/img2.jpg',
      modelosCompatiblesTexto: 'YBR 125, FZ-16, XTZ 125',
      color: 'Negro'
    }
  ];

  // Crear plantilla vacía
  const emptyTemplate = [{
    nombre: '',
    descripcionPuntos: '',
    medida: '',
    marca: '',
    codigoTienda: '',
    codigoProveedor: '',
    precioCompraDefault: '',
    precioVentaDefault: '',
    precioVentaMinimo: '',
    stockActual: '',
    stockReferencialUmbral: '',
    ubicacion: '',
    imageUrls: '',
    modelosCompatiblesTexto: '',
    color: ''
  }];

  const wb = XLSX.utils.book_new();
  
  // Hoja para llenar
  const ws1 = XLSX.utils.json_to_sheet(emptyTemplate);
  XLSX.utils.book_append_sheet(wb, ws1, 'Plantilla');
  
  // Hoja de ejemplos
  const ws2 = XLSX.utils.json_to_sheet(templateData);
  XLSX.utils.book_append_sheet(wb, ws2, 'Ejemplos');

  XLSX.writeFile(wb, 'plantilla_productos.xlsx');
};

  const ImportExcelModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4" id="modal-title">
                  Importar Productos desde Excel
                </h3>
                
                <div className="space-y-4">
                  {/* Botón para descargar plantilla */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-900 mb-2">Paso 1: Descargar Plantilla</h4>
                    <p className="text-blue-700 mb-3">Primero descarga la plantilla Excel con el formato correcto:</p>
                    <button
                      onClick={downloadExcelTemplate}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      📥 Descargar Plantilla Excel
                    </button>
                  </div>

                  {/* Seleccionar archivo */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-2">Paso 2: Seleccionar Archivo</h4>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileSelect}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>

                  {/* Previsualización */}
                  {previewData.length > 0 && (
                    <div className="bg-green-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-green-900 mb-2">Vista Previa (primeros 5 registros):</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="bg-gray-200">
                              <th className="px-2 py-1 text-left">Nombre</th>
                              <th className="px-2 py-1 text-left">Marca</th>
                              <th className="px-2 py-1 text-left">Precio Compra</th>
                              <th className="px-2 py-1 text-left">Precio Venta</th>
                              <th className="px-2 py-1 text-left">Stock</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewData.map((row, index) => (
                              <tr key={index} className="border-b">
                                <td className="px-2 py-1">{row.nombre || 'N/A'}</td>
                                <td className="px-2 py-1">{row.marca || 'N/A'}</td>
                                <td className="px-2 py-1">{row.precioCompraDefault || 'N/A'}</td>
                                <td className="px-2 py-1">{row.precioVentaDefault || 'N/A'}</td>
                                <td className="px-2 py-1">{row.stockActual || 'N/A'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-green-700 text-sm mt-2">
                        Se encontraron {previewData.length} registros. ¿Los datos se ven correctos?
                      </p>
                    </div>
                  )}

                  {/* Instrucciones */}
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-yellow-900 mb-2">Instrucciones importantes:</h4>
                    <ul className="text-yellow-800 text-sm space-y-1">
                      <li>• Los campos obligatorios son: nombre, marca, precioCompraDefault, precioVentaDefault, precioVentaMinimo, stockActual</li>
                      <li>• Los precios deben ser números decimales (ej: 25.50)</li>
                      <li>• El stock debe ser un número entero</li>
                      <li>• Para múltiples imágenes, separe las URLs con comas (máximo 3)</li>
                      <li>• El precio mínimo no puede ser mayor al precio de venta</li>
                      <li>• Esta operación no se puede deshacer</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
              onClick={processExcelImport}
              disabled={!importFile || isImporting}
            >
              {isImporting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Importando...
                </>
              ) : (
                'Importar Productos'
              )}
            </button>
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={onClose}
              disabled={isImporting}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

  if (!user) {
    return null;
  }

  return (
    <Layout title="Gestión de Productos">
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-4 bg-white rounded-lg shadow-md flex flex-col">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          {/* Sección de Filtros y Botones */}
<div className="mb-4 border border-gray-200 rounded-lg p-3 lg:p-4 bg-gray-50 flex-shrink-0">
  {/* Primera línea - Filtros de búsqueda */}
  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 2xl:grid-cols-8 gap-3 mb-4">
    {/* Nombre */}
    <div className="col-span-1">
      <label htmlFor="filterNombre" className="block text-xs font-medium text-gray-700 mb-1">NOMBRE</label>
      <input
        type="text"
        id="filterNombre"
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
        value={filterNombre}
        onChange={(e) => setFilterNombre(e.target.value)}
        placeholder="Nombre..."
      />
    </div>

    {/* Código Tienda */}
    <div className="col-span-1">
      <label htmlFor="filterCodigoTienda" className="block text-xs font-medium text-gray-700 mb-1">C. TIENDA</label>
      <input
        type="text"
        id="filterCodigoTienda"
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
        value={filterCodigoTienda}
        onChange={(e) => setFilterCodigoTienda(e.target.value)}
        placeholder="Cód. Tienda..."
      />
    </div>

    {/* Código Proveedor */}
    <div className="col-span-1">
      <label htmlFor="filterCodigoProveedor" className="block text-xs font-medium text-gray-700 mb-1">C. PROVEEDOR</label>
      <input
        type="text"
        id="filterCodigoProveedor"
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
        value={filterCodigoProveedor}
        onChange={(e) => setFilterCodigoProveedor(e.target.value)}
        placeholder="Cód. Proveedor..."
      />
    </div>

    {/* Marca */}
    <div className="col-span-1">
      <label htmlFor="filterMarca" className="block text-xs font-medium text-gray-700 mb-1">MARCA</label>
      <input
        type="text"
        id="filterMarca"
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
        value={filterMarca}
        onChange={(e) => setFilterMarca(e.target.value)}
        placeholder="Marca..."
      />
    </div>

    {/* Medida */}
    <div className="col-span-1">
      <label htmlFor="filterMedida" className="block text-xs font-medium text-gray-700 mb-1">MEDIDA</label>
      <input
        type="text"
        id="filterMedida"
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
        value={filterMedida}
        onChange={(e) => setFilterMedida(e.target.value)}
        placeholder="Medida..."
      />
    </div>

    {/* Ubicación */}
    <div className="col-span-1">
      <label htmlFor="filterUbicacion" className="block text-xs font-medium text-gray-700 mb-1">UBICACION</label>
      <input
        type="text"
        id="filterUbicacion"
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
        value={filterUbicacion}
        onChange={(e) => setFilterUbicacion(e.target.value)}
        placeholder="Ubicación..."
      />
    </div>

    {/* Modelos Compatibles */}
    <div className="col-span-1 sm:col-span-2 md:col-span-1 lg:col-span-1 xl:col-span-1 2xl:col-span-1">
      <label htmlFor="filterModelosCompatibles" className="block text-xs font-medium text-gray-700 mb-1">MODELOS COMPATIBLES</label>
      <input
        type="text"
        id="filterModelosCompatibles"
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
        value={filterModelosCompatibles}
        onChange={(e) => setFilterModelosCompatibles(e.target.value)}
        placeholder="Ej: Yamaha, Honda..."
      />
    </div>

    {/* Selector de productos por página */}
    <div className="col-span-1 2xl:col-span-1">
      <label htmlFor="products-per-page" className="block text-xs font-medium text-gray-700 mb-1">MOSTRAR:</label>
      <select
        id="products-per-page"
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
        value={productsPerPage}
        onChange={(e) => {
          setProductsPerPage(Number(e.target.value));
          setCurrentPage(1);
        }}
      >
        <option value={10}>10</option>
        <option value={20}>20</option>
        <option value={50}>50</option>
        <option value={100}>100</option>
      </select>
    </div>
  </div>

  {/* Segunda línea - Botones de acción */}
  <div className="flex flex-wrap items-center gap-2 lg:gap-3">
    <button
      onClick={handleSearchClick}
      className="inline-flex items-center px-3 lg:px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      title="Buscar"
    >
      <MagnifyingGlassIcon className="h-4 w-4 lg:h-5 lg:w-5 mr-1 lg:mr-2" aria-hidden="true" />
      <span className="hidden sm:inline">Buscar</span>
      <span className="sm:hidden">Buscar</span>
    </button>

    <button
      onClick={handleClearFilters}
      className="inline-flex items-center px-3 lg:px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      title="Limpiar Filtros"
    >
      <ArrowPathIcon className="h-4 w-4 lg:h-5 lg:w-5 mr-1 lg:mr-2" aria-hidden="true" />
      <span className="hidden md:inline">Limpiar Filtros</span>
      <span className="md:hidden">Limpiar</span>
    </button>

    <button
      onClick={actualizarTodosLosPrecios}
      disabled={updatingPrices}
      className="inline-flex items-center px-3 lg:px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
      title="Recalcular todos los precios basado en lotes FIFO"
    >
      {updatingPrices ? (
        <svg className="animate-spin h-4 w-4 lg:h-5 lg:w-5 mr-1 lg:mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
        </svg>
      ) : (
        <CurrencyDollarIcon className="h-4 w-4 lg:h-5 lg:w-5 mr-1 lg:mr-2" aria-hidden="true" />
      )}
      <span className="hidden md:inline">{updatingPrices ? 'Actualizando...' : 'Actualizar Precios'}</span>
      <span className="md:hidden">{updatingPrices ? 'Actualizando...' : 'Precios'}</span>
    </button>

    {isAdmin && (
      <>
        <button
          onClick={() => setIsImportModalOpen(true)}
          className="inline-flex items-center px-3 lg:px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          title="Importar productos desde Excel"
        >
          <svg className="h-4 w-4 lg:h-5 lg:w-5 mr-1 lg:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="hidden lg:inline">Importar Excel</span>
          <span className="lg:hidden">Import</span>
        </button>

        <button
          onClick={() => router.push('/productos/nuevo')}
          className="inline-flex items-center px-3 lg:px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          title="Agregar Producto"
        >
          <PlusIcon className="h-4 w-4 lg:h-5 lg:w-5 mr-1 lg:mr-2" aria-hidden="true" />
          <span className="hidden md:inline">Agregar Producto</span>
          <span className="md:hidden">Agregar</span>
        </button>
      </>
    )}
  </div>
</div>

          {/* Tabla de Productos */}
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredProductos.length === 0 ? (
            <p className="p-4 text-center text-gray-500">No se encontraron productos que coincidan con los filtros aplicados.</p>
          ) : (
            <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg overflow-y-auto">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-gray-100">
                  <tr>
                    <th 
                      scope="col" 
                      className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center cursor-pointer hover:bg-gray-200 select-none"
                      onClick={() => handleSort('codigoTienda')}>
                      C. TIENDA
                      {getSortIcon('codigoTienda')}
                    </th>
                    <th 
                      scope="col" 
                      className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center cursor-pointer hover:bg-gray-200 select-none"
                      onClick={() => handleSort('nombre')}>
                      NOMBRE
                      {getSortIcon('nombre')}
                    </th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MARCA</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">C. Proveedor</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">COLOR</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MEDIDA</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">UBICACION</th>
                    <th 
                      scope="col" 
                      className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center cursor-pointer hover:bg-gray-200 select-none"
                      onClick={() => handleSort('stockActual')}
                    >
                      STOCK
                      {getSortIcon('stockActual')}
                    </th>
                    {isAdmin && (<> <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">COSTO (S/.)</th></>)}
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">VENTA (S/.)</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">VENTA MIN (S/.)</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ACCIONES</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {currentProducts.map((producto, index) => {
                    const lowStock = isLowStock(producto.stockActual, producto.stockReferencialUmbral);
                    const rowBgClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                    const textColorClass = lowStock ? 'text-red-600 font-semibold' : 'text-black';
                    const priceNeedsUpdate = needsPriceUpdate(producto);
                    
                    return (
                      <tr key={producto.id} className={rowBgClass}>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>
                          {producto.codigoTienda}
                        </td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium text-left ${textColorClass}`}>
                          {producto.nombre}
                        </td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>
                          {producto.marca || 'N/A'}
                        </td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>
                          {producto.codigoProveedor}
                        </td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>
                          {producto.color || 'N/A'}
                        </td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>
                          {producto.medida || 'N/A'}
                        </td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>
                          {producto.ubicacion || 'N/A'}
                        </td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-semibold text-center ${textColorClass}`}>
                          {producto.stockActual}
                          {lowStock && <span className="ml-1 text-red-500">⚠</span>}
                        </td>
                        {isAdmin && (<> <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center ${textColorClass} relative`}>
                          <div className="flex items-center justify-center">
                            <span>S/. {parseFloat(producto.precioCompraDefault || 0).toFixed(2)}</span>
                            {priceNeedsUpdate && (
                              <ExclamationTriangleIcon 
                                className="h-4 w-4 ml-1 text-orange-500" 
                                title="Precio podría estar desactualizado - Recalcular basado en lotes FIFO"
                              />
                            )}
                          </div>
                        </td></>)}
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center ${textColorClass}`}>
                          S/. {parseFloat(producto.precioVentaDefault || 0).toFixed(2)}
                        </td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center ${textColorClass}`}>
                          S/. {parseFloat(producto.precioVentaMinimo || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 relative whitespace-nowrap px-3 py-2 text-left text-sm font-medium">
                          <div className="flex items-center space-x-1 justify-center">
                            <button
                              onClick={() => openImageModal(producto)}
                              className="text-gray-600 hover:text-gray-900 p-1 rounded-full hover:bg-gray-100"
                              title="Ver Imágenes"
                              disabled={!producto.imageUrl && (!producto.imageUrls || producto.imageUrls.length === 0)}
                            >
                              <PhotoIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => openProductModelsModal(producto)}
                              className="text-purple-600 hover:text-purple-900 p-1 rounded-full hover:bg-gray-100"
                              title="Ver Modelos Compatibles"
                              disabled={!producto.modelosCompatiblesTexto || producto.modelosCompatiblesTexto.trim() === ''}
                            >
                              <ListBulletIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => openProductDetailsModal(producto)}
                              className="text-emerald-600 hover:text-emerald-900 p-1 rounded-full hover:bg-gray-100"
                              title="Ver Detalles Completos"
                            >
                              <EyeIcon className="h-5 w-5" />
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => router.push(`/productos/${producto.id}`)}
                                  className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-gray-100"
                                  title="Editar Producto"
                                >
                                  <PencilIcon className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => confirmDelete(producto.id)}
                                  className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-gray-100"
                                  title="Eliminar Producto"
                                >
                                  <TrashIcon className="h-5 w-5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Controles de paginación */}
          {filteredProductos.length > productsPerPage && (
            <div className="flex justify-between items-center mt-4">
              <p className="text-sm text-gray-700">
                Mostrando <span className="font-medium">{indexOfFirstProduct + 1}</span> a <span className="font-medium">{Math.min(indexOfLastProduct, filteredProductos.length)}</span> de <span className="font-medium">{filteredProductos.length}</span> resultados
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
      </div>

      {/* Modales */}
      {isImageModalOpen && (
        <ImageModal 
          imageUrl={selectedProductForDetails?.imageUrl} 
          imageUrls={selectedProductForDetails?.imageUrls} 
          onClose={closeImageModal} 
        />
      )}
      {isAdmin && (
        <ImportExcelModal 
          isOpen={isImportModalOpen} 
          onClose={() => {
            setIsImportModalOpen(false);
            setImportFile(null);
            setPreviewData([]);
          }} 
        />
      )}
      <ProductDetailsModal isOpen={isProductDetailsModalOpen} onClose={closeProductDetailsModal} product={selectedProductForDetails} />
      <ProductModelsModal isOpen={isProductModelsModalOpen} onClose={closeProductModelsModal} product={selectedProductForModels} />
      <ConfirmModal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)} onConfirm={confirmAction} message={confirmMessage} />
      <AlertModal isOpen={isAlertModalOpen} onClose={() => setIsAlertModalOpen(false)} message={alertMessage} />
    </Layout>
  );
};

export default ProductosPage;