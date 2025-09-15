// pages/inventario/ingresos/index.js
import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import Layout from '../../../components/Layout';
import { db } from '../../../lib/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  doc, 
  deleteDoc, 
  runTransaction,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { PlusIcon, ArrowDownTrayIcon, TrashIcon, EyeIcon, CheckCircleIcon, ExclamationCircleIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const IngresosPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [ingresos, setIngresos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredIngresos, setFilteredIngresos] = useState([]);

  // Estados para filtros de fecha
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  
  // Estados para paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [ingresosPerPage, setIngresosPerPage] = useState(20);

  useEffect(() => {
    const fetchIngresos = async () => {
      if (!user) {
        router.push('/auth');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const ingresosCollectionRef = collection(db, 'ingresos');
        const qIngresos = query(ingresosCollectionRef, orderBy('fechaIngreso', 'desc'));
        const querySnapshotIngresos = await getDocs(qIngresos);

        const loadedIngresos = [];
        for (const docIngreso of querySnapshotIngresos.docs) {
          const ingresoData = docIngreso.data();
          
          // Cargar los lotes asociados a este ingreso
          const lotesCollectionRef = collection(db, 'ingresos', docIngreso.id, 'lotes');
          const lotesSnapshot = await getDocs(lotesCollectionRef);
          const lotesCount = lotesSnapshot.size;
          
          // Calcular el total de lotes para mostrar información más detallada
          let totalStockIngresado = 0;
          lotesSnapshot.docs.forEach(loteDoc => {
            const loteData = loteDoc.data();
            totalStockIngresado += parseFloat(loteData.cantidad || 0);
          });

          const processedIngreso = {
            id: docIngreso.id,
            ...ingresoData,
            // Mantener el timestamp original para filtrado
            fechaIngresoOriginal: ingresoData.fechaIngreso,
            // Formatear la fecha para visualización
            fechaIngreso: ingresoData.fechaIngreso?.toDate().toLocaleDateString('es-ES', {
              year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            }) || 'N/A',
            // Usar el campo correcto para el costo total
            costoTotalIngreso: ingresoData.costoTotalIngreso || 0,
            // Agregar información de lotes
            cantidadLotes: lotesCount,
            totalStockIngresado: totalStockIngresado,
            // Asegurarse de que el estado esté presente
            estado: ingresoData.estado || 'pendiente',
          };
          
          loadedIngresos.push(processedIngreso);
        }

        setIngresos(loadedIngresos);
      } catch (err) {
        console.error("Error al cargar ingresos:", err);
        setError("Error al cargar la información de ingresos. Intente de nuevo.");
      } finally {
        setLoading(false);
      }
    };

    fetchIngresos();
  }, [user, router]);

  // Función para filtrar por fechas
  const filterByDatePeriod = (ingresos, period, customStartDate, customEndDate) => {
    const now = new Date();
    let filterStartDate, filterEndDate;

    switch (period) {
      case 'day':
        filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        filterEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
      case 'week':
        const dayOfWeek = now.getDay();
        const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToSubtract);
        filterEndDate = new Date(filterStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        filterEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          filterStartDate = new Date(customStartDate);
          filterEndDate = new Date(customEndDate);
          filterEndDate.setHours(23, 59, 59, 999);
        } else {
          return ingresos;
        }
        break;
      default:
        return ingresos;
    }

    return ingresos.filter(ingreso => {
      if (!ingreso.fechaIngresoOriginal) return false;
      const ingresoDate = ingreso.fechaIngresoOriginal.toDate ? 
        ingreso.fechaIngresoOriginal.toDate() : 
        new Date(ingreso.fechaIngresoOriginal);
      return ingresoDate >= filterStartDate && ingresoDate <= filterEndDate;
    });
  };

  // Función para manejar cambios de filtro de período
  const handleFilterChange = (period) => {
    setFilterPeriod(period);
    if (period !== 'custom') {
      setStartDate(null);
      setEndDate(null);
    }
  };

  useEffect(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    
    // Primero aplicar filtro de búsqueda por texto
    let filtered = ingresos.filter(ingreso => {
      const numeroBoletaMatch = ingreso.numeroBoleta && typeof ingreso.numeroBoleta === 'string'
        ? ingreso.numeroBoleta.toLowerCase().includes(lowerCaseSearchTerm)
        : false;

      const proveedorMatch = ingreso.proveedorNombre && typeof ingreso.proveedorNombre === 'string'
        ? ingreso.proveedorNombre.toLowerCase().includes(lowerCaseSearchTerm)
        : false;

      const observacionesMatch = ingreso.observaciones && typeof ingreso.observaciones === 'string'
        ? ingreso.observaciones.toLowerCase().includes(lowerCaseSearchTerm)
        : false;

      const fechaIngresoMatch = ingreso.fechaIngreso && typeof ingreso.fechaIngreso === 'string'
        ? ingreso.fechaIngreso.toLowerCase().includes(lowerCaseSearchTerm)
        : false;

      // Usar el campo correcto
      const costoTotalMatch = ingreso.costoTotalIngreso && typeof ingreso.costoTotalIngreso === 'number'
        ? ingreso.costoTotalIngreso.toFixed(2).includes(lowerCaseSearchTerm)
        : false;

      const estadoMatch = ingreso.estado && typeof ingreso.estado === 'string'
        ? ingreso.estado.toLowerCase().includes(lowerCaseSearchTerm)
        : false;

      return numeroBoletaMatch || proveedorMatch || observacionesMatch || fechaIngresoMatch || costoTotalMatch || estadoMatch;
    });

    // Luego aplicar filtro de fechas
    filtered = filterByDatePeriod(filtered, filterPeriod, startDate, endDate);

    setFilteredIngresos(filtered);
    
    // Resetear a la primera página cuando cambian los filtros
    setCurrentPage(1);
  }, [searchTerm, ingresos, filterPeriod, startDate, endDate]);

  // Lógica de paginación
  const totalPages = Math.ceil(filteredIngresos.length / ingresosPerPage);
  const indexOfLastIngreso = currentPage * ingresosPerPage;
  const indexOfFirstIngreso = indexOfLastIngreso - ingresosPerPage;
  const currentIngresos = filteredIngresos.slice(indexOfFirstIngreso, indexOfLastIngreso);

  // Funciones de navegación de paginación
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Función para cambiar el número de elementos por página
  const handlePageSizeChange = (newSize) => {
    setIngresosPerPage(newSize);
    setCurrentPage(1); // Resetear a la primera página
  };

  // Función corregida para handleConfirmarRecepcion en index.js
  const handleConfirmarRecepcion = async (ingresoId) => {
    if (!window.confirm('¿Estás seguro de que quieres CONFIRMAR la recepción de esta boleta de ingreso? Esto agregará los productos al stock actual.')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await runTransaction(db, async (transaction) => {
        const ingresoRef = doc(db, 'ingresos', ingresoId);
        const ingresoSnap = await transaction.get(ingresoRef);

        if (!ingresoSnap.exists()) {
          throw new Error("Boleta de ingreso no encontrada.");
        }

        const currentIngresoData = ingresoSnap.data();
        if (currentIngresoData.estado === 'recibido') {
          throw new Error("Esta boleta de ingreso ya ha sido confirmada.");
        }

        // CAMBIO 1: Obtener lotes tanto de subcolección como de colección principal
        console.log('Obteniendo lotes de subcolección...');
        const lotesIngresoCollectionRef = collection(db, 'ingresos', ingresoId, 'lotes');
        const lotesIngresoSnapshot = await getDocs(lotesIngresoCollectionRef);

        // También obtener lotes de la colección principal
        console.log('Obteniendo lotes de colección principal...');
        const lotesPrincipalesRef = collection(db, 'lotes');
        const qLotesPrincipales = query(lotesPrincipalesRef, where('ingresoId', '==', ingresoId));
        const lotesPrincipalesSnapshot = await getDocs(qLotesPrincipales);

        if (lotesIngresoSnapshot.empty && lotesPrincipalesSnapshot.empty) {
          throw new Error("No se encontraron lotes asociados a esta boleta de ingreso.");
        }

        // CAMBIO 2: Procesar lotes de ambas fuentes
        const productoRefsAndData = [];

        // Procesar lotes de subcolección
        for (const loteDoc of lotesIngresoSnapshot.docs) {
          const loteData = loteDoc.data();
          const productoRef = doc(db, 'productos', loteData.productoId);
          const productoSnap = await transaction.get(productoRef);

          if (productoSnap.exists()) {
            productoRefsAndData.push({
              loteDocRef: loteDoc.ref,
              loteData: loteData,
              productoRef: productoRef,
              currentProductoData: productoSnap.data(),
              esLotePrincipal: false
            });
          } else {
            console.warn(`Producto con ID ${loteData.productoId} no encontrado en subcolección`);
          }
        }

        // Procesar lotes de colección principal
        for (const loteDoc of lotesPrincipalesSnapshot.docs) {
          const loteData = loteDoc.data();
          
          // Evitar duplicados si el producto ya está en la lista
          const yaExiste = productoRefsAndData.some(item => 
            item.loteData.productoId === loteData.productoId && 
            item.loteData.numeroLote === loteData.numeroLote
          );
          
          if (!yaExiste) {
            const productoRef = doc(db, 'productos', loteData.productoId);
            const productoSnap = await transaction.get(productoRef);

            if (productoSnap.exists()) {
              productoRefsAndData.push({
                loteDocRef: loteDoc.ref,
                loteData: loteData,
                productoRef: productoRef,
                currentProductoData: productoSnap.data(),
                esLotePrincipal: true
              });
            } else {
              console.warn(`Producto con ID ${loteData.productoId} no encontrado en colección principal`);
            }
          }
        }

        console.log(`Procesando ${productoRefsAndData.length} lotes únicos...`);

        // CAMBIO 3: Proceder con las escrituras
        for (const { loteDocRef, loteData, productoRef, currentProductoData, esLotePrincipal } of productoRefsAndData) {
          const currentStock = typeof currentProductoData.stockActual === 'number' ? currentProductoData.stockActual : 0;
          const cantidadIngresada = typeof loteData.cantidad === 'number' ? loteData.cantidad : 0;
          const newStock = currentStock + cantidadIngresada;

          console.log(`Actualizando stock del producto ${loteData.productoId}: ${currentStock} + ${cantidadIngresada} = ${newStock}`);

          // Actualizar stock actual del producto
          transaction.update(productoRef, {
            stockActual: newStock,
            updatedAt: serverTimestamp()
          });

          // Actualizar el lote para marcar que está en inventario
          transaction.update(loteDocRef, {
            stockRestante: cantidadIngresada,
            estado: 'activo',
            updatedAt: serverTimestamp()
          });

          console.log(`${esLotePrincipal ? 'Lote principal' : 'Sublote'} actualizado: ${loteData.numeroLote}`);
        }

        // CAMBIO 4: Actualizar el estado del ingreso
        transaction.update(ingresoRef, { 
          estado: 'recibido',
          fechaConfirmacion: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      alert('Recepción de mercadería confirmada y stock actualizado con éxito.');
      // Refrescar la lista
      setIngresos(prevIngresos =>
        prevIngresos.map(ing =>
          ing.id === ingresoId ? { ...ing, estado: 'recibido' } : ing
        )
      );
    } catch (err) {
      console.error("Error al confirmar recepción:", err);
      setError("Error al confirmar la recepción. " + err.message);
      alert('Hubo un error al confirmar la recepción: ' + err.message);
    } finally {
      setLoading(false);
    }
  };  

  const handleDeleteIngreso = async (ingresoId, estadoIngreso) => {
    let confirmMessage = '¿Estás seguro de que quieres eliminar esta boleta de ingreso?';
    if (estadoIngreso === 'recibido') {
      confirmMessage += '\nADVERTENCIA: Esta boleta ya fue confirmada y sus productos se agregaron al stock. Eliminarla NO revertirá automáticamente el stock.';
    } else {
      confirmMessage += '\nEsto eliminará todos los lotes asociados.';
    }

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await runTransaction(db, async (transaction) => {
        const ingresoRef = doc(db, 'ingresos', ingresoId);
        
        // Eliminar los lotes (CAMBIO: usar 'lotes' en lugar de 'itemsIngreso')
        const lotesRef = collection(db, 'ingresos', ingresoId, 'lotes');
        const lotesSnapshot = await getDocs(lotesRef);

        const deleteLotesPromises = lotesSnapshot.docs.map(loteDoc =>
          transaction.delete(doc(db, 'ingresos', ingresoId, 'lotes', loteDoc.id))
        );
        await Promise.all(deleteLotesPromises);

        // Eliminar el documento de ingreso principal
        transaction.delete(ingresoRef);
      });

      alert('Boleta de ingreso eliminada con éxito.');
      setIngresos(prevIngresos => prevIngresos.filter(ing => ing.id !== ingresoId));
    } catch (err) {
      console.error("Error al eliminar boleta de ingreso:", err);
      setError("Error al eliminar la boleta de ingreso. " + err.message);
      alert('Hubo un error al eliminar la boleta de ingreso: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (ingresoId) => {
    router.push(`/inventario/ingresos/${ingresoId}`);
  };

  if (!user) {
    return null;
  }

  return (
    <Layout title="Registro de Ingresos de Mercadería">
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-6 bg-white rounded-lg shadow-md flex flex-col">

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
              <span className="block sm:inline font-medium">{error}</span>
            </div>
          )}

          {/* Sección de Filtros y Búsqueda (Responsive - Una línea) */}
<div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
  {/* En desktop: Una sola línea horizontal | En móvil: Stack vertical */}
  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
    
    {/* Campo de Búsqueda */}
    <div className="relative w-full lg:flex-1 lg:max-w-xl">
      <input
        type="text"
        placeholder="Buscar por número de boleta, proveedor, observaciones, fecha o estado..."
        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base placeholder-gray-400"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
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

    {/* Selector de límite por página */}
    <div className="w-full sm:w-auto">
      <select
        value={ingresosPerPage}
        onChange={(e) => handlePageSizeChange(Number(e.target.value))}
        className="w-full sm:w-28 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
      >
        <option value={10}>10</option>
        <option value={20}>20</option>
        <option value={50}>50</option>
        <option value={100}>100</option>
      </select>
    </div>

    {/* Botón de Acción Principal */}
    <div className="w-full sm:w-auto">
      <button
        onClick={() => router.push('/inventario/ingresos/nuevo')}
        className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out whitespace-nowrap"
      >
        <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
        Registrar Nueva Boleta
      </button>
    </div>

  </div>
</div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : currentIngresos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-gray-50 rounded-lg p-4 shadow-inner">
              <ArrowDownTrayIcon className="h-24 w-24 text-gray-300 mb-4" />
              <p className="text-lg font-medium">No se encontraron boletas de ingreso.</p>
              <p className="text-sm text-gray-400">¡Empieza registrando una nueva boleta de ingreso!</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto shadow-lg ring-1 ring-black ring-opacity-5 rounded-lg overflow-y-auto max-h-[60vh]">
                <table className="min-w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">N° BOLETA</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">PROVEEDOR</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">FECHA DE INGRESO</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">LOTES</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">STOCK</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">COSTO TOTAL</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ESTADO</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">OBSERVACIONES</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">REGISTRADO POR</th>
                      <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {currentIngresos.map((ingreso, index) => (
                      <tr key={ingreso.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-left">
                          {ingreso.numeroBoleta || 'N/A'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-left">{ingreso.proveedorNombre}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-left">{ingreso.fechaIngreso}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {ingreso.cantidadLotes || 0} lotes
                          </span>
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 font-medium text-center">
                          {ingreso.totalStockIngresado || 0} 
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 font-medium text-left">
                          S/. {parseFloat(ingreso.costoTotalIngreso || 0).toFixed(2)}
                        </td> 
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          {ingreso.estado === 'recibido' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircleIcon className="h-4 w-4 mr-1" /> Recibido
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <ExclamationCircleIcon className="h-4 w-4 mr-1" /> Pendiente
                            </span>
                          )}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700 text-left max-w-xs truncate" title={ingreso.observaciones || 'N/A'}>
                          {ingreso.observaciones || 'N/A'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-left">{ingreso.empleadoId || 'Desconocido'}</td>
                        <td className="border border-gray-300 relative whitespace-nowrap px-3 py-2 text-sm font-medium text-center">
                          <div className="flex items-center space-x-2 justify-center">
                            {ingreso.estado === 'pendiente' && (
                              <button
                                onClick={() => handleConfirmarRecepcion(ingreso.id)}
                                className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition duration-150 ease-in-out"
                                title="Confirmar Recepción de Mercadería"
                              >
                                <CheckCircleIcon className="h-5 w-5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleViewDetails(ingreso.id)}
                              className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition duration-150 ease-in-out"
                              title="Ver Detalles de la Boleta"
                            >
                              <EyeIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteIngreso(ingreso.id, ingreso.estado)}
                              className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition duration-150 ease-in-out ml-1"
                              title="Eliminar Boleta de Ingreso Completa"
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
              {filteredIngresos.length > ingresosPerPage && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{indexOfFirstIngreso + 1}</span> a <span className="font-medium">{Math.min(indexOfLastIngreso, filteredIngresos.length)}</span> de <span className="font-medium">{filteredIngresos.length}</span> resultados
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
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default IngresosPage;