import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { generarPDFVentaCompleta } from '../../components/utils/pdfGeneratorVentas';
import { generarTicketVentaCompleta } from '../../components/utils/pdfGeneratorTicket';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  addDoc,
  where,
  limit,
  Timestamp
} from 'firebase/firestore';
import {
  ShoppingCartIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  XCircleIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  CreditCardIcon,
  TagIcon,
  CalendarIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PrinterIcon,
  XMarkIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

const VentasIndexPage = () => {
  const { user } = useAuth();
  const router = useRouter();

  const [ventas, setVentas] = useState([]);
  const [filteredVentas, setFilteredVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados para filtros
  const [filterPeriod, setFilterPeriod] = useState('day');
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  });
  const [limitPerPage, setLimitPerPage] = useState(20);
  const [selectedMetodoPago, setSelectedMetodoPago] = useState('all');
  const [selectedTipoVenta, setSelectedTipoVenta] = useState('all');
  const [selectedEstado, setSelectedEstado] = useState('all');

  // Estado para el conteo total
  const [totalVentasPeriodo, setTotalVentasPeriodo] = useState(0);
  // Estados para paginación
  const [currentPage, setCurrentPage] = useState(1);
  const ventasPerPage = 20; // Ventas por página

  useEffect(() => {
    if (!user) {
      router.push('/auth');
      return;
    }

    setLoading(true);
    setError(null);

    let constraints = [];
    const { start, end } = dateRange;

    if (start && end) {
      if (selectedEstado !== 'all') {
        constraints = [
          where('estado', '==', selectedEstado),
          where('fechaVenta', '>=', Timestamp.fromDate(start)),
          where('fechaVenta', '<=', Timestamp.fromDate(end)),
          orderBy('fechaVenta', 'desc'),
          limit(limitPerPage)
        ];
      } else {
        constraints = [
          where('fechaVenta', '>=', Timestamp.fromDate(start)),
          where('fechaVenta', '<=', Timestamp.fromDate(end)),
          orderBy('fechaVenta', 'desc'),
          limit(limitPerPage)
        ];
      }
    } else {
      if (selectedEstado !== 'all') {
        constraints = [
          where('estado', '==', selectedEstado),
          orderBy('fechaVenta', 'desc'),
          limit(limitPerPage)
        ];
      } else {
        constraints = [
          orderBy('fechaVenta', 'desc'),
          limit(limitPerPage)
        ];
      }
    }

    const q = query(collection(db, 'ventas'), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ventasList = [];
      const ventasToUpdate = [];

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const ventaData = {
          id: docSnap.id,
          ...data,
          fechaVenta: data.fechaVenta?.toDate ? data.fechaVenta.toDate() : new Date(),
          fechaVentaFormatted: data.fechaVenta?.toDate
            ? data.fechaVenta.toDate().toLocaleDateString('es-ES')
            : 'N/A',
        };

        if (!data.numeroVenta || data.numeroVenta === 'N/A' || data.numeroVenta.trim() === '') {
          ventasToUpdate.push({ id: docSnap.id, data: ventaData });
        }

        ventasList.push(ventaData);
      });

      if (ventasToUpdate.length > 0) {
        ventasToUpdate.forEach(async (venta, index) => {
          const newNumeroVenta = generateSaleNumber() + `-${index}`;
          try {
            await updateDoc(doc(db, 'ventas', venta.id), {
              numeroVenta: newNumeroVenta,
              updatedAt: serverTimestamp()
            });
          } catch (error) {
            console.error(`Error actualizando número de venta ${venta.id}:`, error);
          }
        });
      }

      setVentas(ventasList);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching ventas:", err);
      setError("Error al cargar las ventas: " + err.message);
      setLoading(false);
    });

    return () => unsubscribe();

  }, [user, router, dateRange, selectedEstado, limitPerPage]);

  const getDisplaySaleNumber = (venta) => {
    if (venta.numeroVenta && venta.numeroVenta !== 'N/A' && venta.numeroVenta.trim() !== '') {
      return venta.numeroVenta;
    }
    
    // Generar número temporal basado en el tipo y ID
    const prefix = venta.tipoVenta === 'cotizacionAprobada' ? 'VC' : 
                  venta.tipoVenta === 'credito' ? 'VCR' : 'V';
    const shortId = venta.id.slice(-6).toUpperCase();
    
    return `${prefix}-${shortId}`;
  };

  // Función para manejar cambios en filtros de período
  const handleFilterChange = (period) => {
    setFilterPeriod(period);
    const today = new Date();

    switch (period) {
      case 'day': {
        const start = new Date(today);
        start.setHours(0, 0, 0, 0);
        const end = new Date(today);
        end.setHours(23, 59, 59, 999);
        setDateRange({ start, end });
        break;
      }
      case 'week': {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        start.setHours(0, 0, 0, 0);
        const end = new Date(today);
        end.setHours(23, 59, 59, 999);
        setDateRange({ start, end });
        break;
      }
      case 'month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(today);
        end.setHours(23, 59, 59, 999);
        setDateRange({ start, end });
        break;
      }
      case 'all':
      default:
        setDateRange({ start: null, end: null });
        break;
    }
  };

  // Función para verificar si una venta incluye un método de pago específico
  const ventaIncludesPaymentMethod = (venta, methodToCheck) => {
    if (!venta) return false;

    // Si es "all", siempre retorna true
    if (methodToCheck === 'all') return true;

    // Si tiene paymentData (ventas nuevas con soporte para pagos mixtos)
    if (venta.paymentData && venta.paymentData.paymentMethods) {
      // Verificar si alguno de los métodos de pago coincide
      const hasMethod = venta.paymentData.paymentMethods.some(pm => 
        pm.method && pm.method.toLowerCase() === methodToCheck.toLowerCase() && pm.amount > 0
      );
      
      if (hasMethod) return true;
    }

    // Fallback para ventas antiguas sin paymentData - usar metodoPago directo
    if (venta.metodoPago) {
      return venta.metodoPago.toLowerCase() === methodToCheck.toLowerCase();
    }

    return false;
  };

  // Función para obtener la etiqueta de display del método de pago (incluyendo mixtos)
  const getDisplayMethodLabel = (venta) => {
    if (!venta) return 'N/A';

    // Si tiene paymentData y es mixto
    if (venta.paymentData && venta.paymentData.isMixedPayment && venta.paymentData.paymentMethods) {
      const activeMethods = venta.paymentData.paymentMethods
        .filter(pm => pm.amount > 0)
        .map(pm => getMetodoPagoLabel(pm.method))
        .join(' + ');
      
      return activeMethods || 'MIXTO';
    }

    // Si tiene paymentData pero no es mixto
    if (venta.paymentData && venta.paymentData.paymentMethods && venta.paymentData.paymentMethods.length > 0) {
      return getMetodoPagoLabel(venta.paymentData.paymentMethods[0].method);
    }

    // Fallback para ventas antiguas
    return getMetodoPagoLabel(venta.metodoPago);
  };

  // Función para obtener el ícono de display del método de pago (incluyendo mixtos)
  const getDisplayMethodIcon = (venta) => {
    if (!venta) return '💰';

    // Si tiene paymentData y es mixto
    if (venta.paymentData && venta.paymentData.isMixedPayment && venta.paymentData.paymentMethods) {
      // Para mixtos, mostrar un ícono especial o el del primer método
      const firstMethod = venta.paymentData.paymentMethods.find(pm => pm.amount > 0);
      if (firstMethod) {
        return '🔀'; // Ícono especial para pagos mixtos o usar: getMetodoPagoIcon(firstMethod.method);
      }
    }

    // Si tiene paymentData pero no es mixto
    if (venta.paymentData && venta.paymentData.paymentMethods && venta.paymentData.paymentMethods.length > 0) {
      return getMetodoPagoIcon(venta.paymentData.paymentMethods[0].method);
    }

    // Fallback para ventas antiguas
    return getMetodoPagoIcon(venta.metodoPago);
  };

  // Función para filtrar ventas
  // useEffect 2 de filtros - agrega búsqueda directa en Firestore cuando hay searchTerm
  useEffect(() => {
    let filtered = [...ventas];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(venta =>
        venta.numeroVenta?.toLowerCase().includes(lower) ||
        venta.clienteNombre?.toLowerCase().includes(lower) ||
        venta.observaciones?.toLowerCase().includes(lower) ||
        venta.tipoVenta?.toLowerCase().includes(lower)
      );

      // Si no encontró nada localmente, buscar en Firestore
      if (filtered.length === 0 && searchTerm.length >= 3) {
        const buscarEnFirestore = async () => {
          try {
            const { getDocs } = await import('firebase/firestore');
            
            const termUpper = searchTerm.toUpperCase();
            const termLower = searchTerm.toLowerCase();
            const termCapitalized = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();

            // Buscar por número de venta exacto
            const qNumero = query(
              collection(db, 'ventas'),
              where('numeroVenta', '==', termUpper),
              limit(5)
            );

            // Buscar por nombre de cliente (3 variantes de capitalización)
            const qClienteUpper = query(
              collection(db, 'ventas'),
              where('clienteNombre', '>=', termUpper),
              where('clienteNombre', '<=', termUpper + '\uf8ff'),
              orderBy('clienteNombre', 'asc'),
              limit(20)
            );

            const qClienteCapitalized = query(
              collection(db, 'ventas'),
              where('clienteNombre', '>=', termCapitalized),
              where('clienteNombre', '<=', termCapitalized + '\uf8ff'),
              orderBy('clienteNombre', 'asc'),
              limit(20)
            );

            // Ejecutar todas las queries en paralelo
            const [snapNumero, snapUpper, snapCapitalized] = await Promise.all([
              getDocs(qNumero),
              getDocs(qClienteUpper),
              getDocs(qClienteCapitalized),
            ]);

            // Combinar resultados sin duplicados
            const idsVistos = new Set();
            const resultados = [];

            [...snapNumero.docs, ...snapUpper.docs, ...snapCapitalized.docs].forEach(docSnap => {
              if (!idsVistos.has(docSnap.id)) {
                idsVistos.add(docSnap.id);
                const data = docSnap.data();
                resultados.push({
                  id: docSnap.id,
                  ...data,
                  fechaVenta: data.fechaVenta?.toDate ? data.fechaVenta.toDate() : new Date(),
                  fechaVentaFormatted: data.fechaVenta?.toDate
                    ? data.fechaVenta.toDate().toLocaleDateString('es-ES')
                    : 'N/A',
                });
              }
            });

            if (resultados.length > 0) {
              setFilteredVentas(resultados);
              setCurrentPage(1);
            }

          } catch (err) {
            console.error('Error en búsqueda directa:', err);
          }
        };

        buscarEnFirestore();
        return;
      }
    }

    if (selectedMetodoPago !== 'all') {
      filtered = filtered.filter(venta => ventaIncludesPaymentMethod(venta, selectedMetodoPago));
    }

    if (selectedTipoVenta !== 'all') {
      filtered = filtered.filter(venta => venta.tipoVenta === selectedTipoVenta);
    }

    setFilteredVentas(filtered);
    setCurrentPage(1);

  }, [searchTerm, ventas, selectedMetodoPago, selectedTipoVenta]);

  // useEffect separado solo para contar - no descarga documentos
  useEffect(() => {
    if (!user) return;
    if (filterPeriod === 'custom' && (!dateRange.start || !dateRange.end)) return;

    const contarVentas = async () => {
      try {
        const { getCountFromServer } = await import('firebase/firestore');

        let constraints = [];
        const { start, end } = dateRange;

        if (start && end) {
          constraints = [
            where('fechaVenta', '>=', Timestamp.fromDate(start)),
            where('fechaVenta', '<=', Timestamp.fromDate(end)),
          ];
        }

        if (selectedEstado !== 'all') {
          constraints.push(where('estado', '==', selectedEstado));
        }

        const q = query(collection(db, 'ventas'), ...constraints);
        const snapshot = await getCountFromServer(q);
        setTotalVentasPeriodo(snapshot.data().count);
      } catch (err) {
        console.error('Error al contar ventas:', err);
      }
    };

    contarVentas();

  }, [user, dateRange, selectedEstado, filterPeriod]);

  // Cálculos para paginación
  const totalPages = Math.ceil(filteredVentas.length / ventasPerPage);
  const indexOfLastVenta = currentPage * ventasPerPage;
  const indexOfFirstVenta = indexOfLastVenta - ventasPerPage;
  const currentVentas = filteredVentas.slice(indexOfFirstVenta, indexOfLastVenta);

  // Funciones de navegación de páginas
  const goToNextPage = () => {
    setCurrentPage(prevPage => Math.min(prevPage + 1, totalPages));
  };

  const goToPrevPage = () => {
    setCurrentPage(prevPage => Math.max(prevPage - 1, 1));
  };

  const goToPage = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handleViewDetails = (id) => {
    router.push(`/ventas/${id}`);
  };

  const handleAnularVenta = async (id) => {
    if (!window.confirm('¿Estás seguro de que deseas ANULAR esta venta? Esta acción es irreversible.')) {
      return;
    }

    try {
      const ventaRef = doc(db, 'ventas', id);
      await updateDoc(ventaRef, {
        estado: 'anulada',
        updatedAt: serverTimestamp(),
      });
      alert('Venta anulada con éxito.');
    } catch (err) {
      console.error("Error al anular venta:", err);
      setError("Error al anular la venta: " + err.message);
    }
  };

  const getMetodoPagoLabel = (metodo) => {
    const metodos = {
      efectivo: 'EFECTIVO',
      tarjeta_credito: 'T. CRÉDITO',
      tarjeta_debito: 'T. DÉBITO',
      tarjeta: 'TARJETA',
      yape: 'YAPE',
      plin: 'PLIN',
      transferencia: 'TRANSFERENCIA',
      deposito: 'DEPÓSITO',
      cheque: 'CHEQUE',
      mixto: 'MIXTO',
      otro: 'OTRO'
    };
    return metodos[metodo?.toLowerCase()] || metodo?.toUpperCase() || 'N/A';
  };

  const getMetodoPagoIcon = (metodo) => {
    switch (metodo?.toLowerCase()) {
      case 'yape':
        return '💜';
      case 'plin':
        return '💙';
      case 'efectivo':
        return '💵';
      case 'tarjeta':
      case 'tarjeta_credito':
      case 'tarjeta_debito':
        return '💳';
      case 'transferencia':
        return '🏦';
      case 'deposito':
        return '🏛️';
      case 'cheque':
        return '📄';
      default:
        return '💰';
    }
  };

  const clearFilters = () => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    setFilterPeriod('day');
    setDateRange({ start, end });
    setSelectedMetodoPago('all');
    setSelectedTipoVenta('all');
    setSelectedEstado('all');
    setSearchTerm('');
    setLimitPerPage(20);
    setCurrentPage(1);
  };

  const generateSaleNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const timestamp = Date.now();
    
    return `V-${day}${month}${year}-${timestamp.toString().slice(-4)}`;
  };

  // 2. Añade esta función después de las funciones existentes, antes del return del componente
  const handleImprimirVenta = async (venta) => {
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
      if (venta.clienteId && venta.clienteId !== 'general') {
        try {
          const clienteDoc = await getDoc(doc(db, 'clientes', venta.clienteId));
          if (clienteDoc.exists()) {
            clienteData = clienteDoc.data();
          }
        } catch (error) {
          console.warn('No se pudo obtener información del cliente:', error);
        }
      }

      // Generar PDF
      await generarPDFVentaCompleta(venta.id, venta, clienteData);
      
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
  
  const handleImprimirTicket = async (venta) => {
    try {
      // Mostrar indicador de carga específico para ticket
      const loadingToast = document.createElement('div');
      loadingToast.innerHTML = `
        <div class="fixed top-4 right-4 bg-purple-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <div class="flex items-center">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Generando Ticket...
          </div>
        </div>
      `;
      document.body.appendChild(loadingToast);

      // Obtener información del cliente si existe
      let clienteData = null;
      if (venta.clienteId && venta.clienteId !== 'general') {
        try {
          const clienteDoc = await getDoc(doc(db, 'clientes', venta.clienteId));
          if (clienteDoc.exists()) {
            clienteData = clienteDoc.data();
          }
        } catch (error) {
          console.warn('No se pudo obtener información del cliente:', error);
        }
      }

      // Generar Ticket PDF
      await generarTicketVentaCompleta(venta.id, venta, clienteData);
      
      // Mostrar mensaje de éxito
      document.body.removeChild(loadingToast);
      
      const successToast = document.createElement('div');
      successToast.innerHTML = `
        <div class="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <div class="flex items-center">
            <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            Ticket generado exitosamente
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
      const loadingElements = document.querySelectorAll('div[class*="fixed top-4 right-4 bg-purple-500"]');
      loadingElements.forEach(el => {
        if (document.body.contains(el.parentElement)) {
          document.body.removeChild(el.parentElement);
        }
      });

      console.error('Error al generar Ticket:', error);
      
      // Mostrar mensaje de error
      const errorToast = document.createElement('div');
      errorToast.innerHTML = `
        <div class="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <div class="flex items-center">
            <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
            Error al generar Ticket
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

  // 4. OPCIONAL: Si quieres un botón de impresión masiva, añade esto antes de tu tabla:
  const [selectedVentas, setSelectedVentas] = useState(new Set());

  const handleSelectVenta = (ventaId) => {
    const newSelected = new Set(selectedVentas);
    if (newSelected.has(ventaId)) {
      newSelected.delete(ventaId);
    } else {
      newSelected.add(ventaId);
    }
    setSelectedVentas(newSelected);
  };

  const handleImprimirSeleccionadas = async () => {
    if (selectedVentas.size === 0) {
      alert('Selecciona al menos una venta para imprimir');
      return;
    }

    for (const ventaId of selectedVentas) {
      const venta = filteredVentas.find(v => v.id === ventaId);
      if (venta && venta.estado !== 'anulada') {
        await handleImprimirVenta(venta);
        // Pequeña pausa entre impresiones
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setSelectedVentas(new Set()); // Limpiar selección
  };

  return (
    <Layout title="Mis Ventas">
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-6 bg-white rounded-lg shadow-md flex flex-col">

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
              <span className="block sm:inline font-medium">{error}</span>
            </div>
          )}

          {/* Panel de filtros reorganizado */}
          <div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50 relative z-20">
            {/* Primera línea: Búsqueda y botón Nueva Venta */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
              <div className="relative flex-grow sm:mr-4">
                <input
                  type="text"
                  placeholder="Buscar por número, cliente, observaciones..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 text-base placeholder-gray-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" fill="currentColor" />
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => router.push('/ventas/nueva')}
                  className="inline-flex items-center px-6 py-2 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 ease-in-out"
                >
                  <PlusIcon className="-ml-1 mr-3 h-5 w-5" aria-hidden="true" />
                  Nueva Venta Directa
                </button>
                
                {selectedVentas.size > 0 && (
                  <button
                    onClick={handleImprimirSeleccionadas}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
                  >
                    <PrinterIcon className="-ml-1 mr-2 h-4 w-4" aria-hidden="true" />
                    Imprimir Seleccionadas ({selectedVentas.size})
                  </button>
                )}
              </div>
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
                  selected={dateRange.start}
                  onChange={(date) => {
                    setFilterPeriod('custom');
                    setDateRange(prev => ({ ...prev, start: date }));
                  }}
                  selectsStart
                  startDate={dateRange.start}
                  endDate={dateRange.end}
                  placeholderText="Fecha inicio"
                  className="px-3 py-1 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm w-32"
                  popperProps={{
                    strategy: "fixed",
                    modifiers: [{ name: "preventOverflow", options: { boundary: "viewport" } }]
                  }}
                  popperClassName="z-50"
                />
                <DatePicker
                  selected={dateRange.end}
                  onChange={(date) => {
                    setFilterPeriod('custom');
                    setDateRange(prev => ({ ...prev, end: date }));
                  }}
                  selectsEnd
                  startDate={dateRange.start}
                  endDate={dateRange.end}
                  minDate={dateRange.start}
                  placeholderText="Fecha fin"
                  className="px-3 py-1 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm w-32"
                  popperProps={{
                    strategy: "fixed",
                    modifiers: [{ name: "preventOverflow", options: { boundary: "viewport" } }]
                  }}
                  popperClassName="z-50"
                />

                {/* Filtros específicos */}
                <select
                  value={selectedMetodoPago}
                  onChange={(e) => setSelectedMetodoPago(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="all">Método de Pago</option>
                  <option value="efectivo">EFECTIVO</option>
                  <option value="tarjeta">TARJETA</option>
                  <option value="yape">YAPE</option>
                  <option value="plin">PLIN</option>
                  <option value="otro">OTRO</option>
                </select>

                <select
                  value={selectedTipoVenta}
                  onChange={(e) => setSelectedTipoVenta(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="all">Tipo de Venta</option>
                  <option value="directa">Directa</option>
                  <option value="cotizacionAprobada">Cotización Aprobada</option>
                  <option value="abono">Abono</option>
                </select>

                <select
                  value={selectedEstado}
                  onChange={(e) => setSelectedEstado(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="all">Estado</option>
                  <option value="completada">Completada</option>
                  <option value="anulada">Anulada</option>
                  <option value="pendiente">Pendiente</option>
                </select>
              </div>
              {/* Selector de límite */}
                <div className="w-full sm:w-auto">
                  <select
                    id="limit-per-page"
                    className=" px-3 py-1 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
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
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            </div>
          ) : filteredVentas.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-lg">
              No hay ventas registradas que coincidan con los filtros aplicados.
            </div>
          ) : (
            <>
            {/* Indicador de total de ventas en el período */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-2">
                <span className="text-sm text-blue-600 font-medium">
                  Total en período:
                </span>
                <span className="text-lg font-bold text-blue-800">
                  {totalVentasPeriodo} ventas
                </span>
              </div>
            </div>
          </div>
              <div className="overflow-x-auto shadow-lg ring-1 ring-black ring-opacity-5 rounded-lg overflow-y-auto max-h-[60vh] relative z-10">

                <table className="min-w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    {/* AÑADIR AQUÍ - Nueva primera columna para checkbox maestro */}
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">
                      <input
                        type="checkbox"
                        checked={selectedVentas.size === currentVentas.filter(v => v.estado !== 'anulada').length && currentVentas.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedVentas(new Set(currentVentas.filter(v => v.estado !== 'anulada').map(v => v.id)));
                          } else {
                            setSelectedVentas(new Set());
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    {/* El resto de tus columnas existentes */}
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">N° VENTA</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">CLIENTE</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">FECHA VENTA</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">TOTAL</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">TIPO VENTA</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ESTADO</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MÉTODO PAGO</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">REGISTRADO POR</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ACCIONES</th>
                  </tr>
                  </thead>
                  <tbody className="bg-white">
                  {currentVentas.map((venta, index) => (
                      <tr key={venta.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {/* AÑADIR AQUÍ - Nueva primera celda para checkbox individual */}
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          {venta.estado !== 'anulada' ? (
                            <input
                              type="checkbox"
                              checked={selectedVentas.has(venta.id)}
                              onChange={() => handleSelectVenta(venta.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900 text-left">
                          {venta.numeroVenta || 'N/A'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">{venta.clienteNombre}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">{venta.fechaVentaFormatted}</td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black font-medium text-left">
                          S/. {parseFloat(venta.totalVenta || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          {venta.tipoVenta === 'cotizacionAprobada' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              <TagIcon className="h-4 w-4 mr-1" /> Aprobada (Cot.)
                            </span>
                          ) : venta.tipoVenta === 'abono' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CreditCardIcon className="h-4 w-4 mr-1" /> Abono
                            </span>
                          ) : venta.tipoVenta === 'directa' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              <ShoppingCartIcon className="h-4 w-4 mr-1" /> Directa
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-black">
                              <CurrencyDollarIcon className="h-4 w-4 mr-1" /> {venta.tipoVenta}
                            </span>
                          )}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                          {venta.estado === 'completada' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircleIcon className="h-4 w-4 mr-1" /> Completada
                            </span>
                          ) : venta.estado === 'anulada' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <XCircleIcon className="h-4 w-4 mr-1" /> Anulada
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              <span className="mr-1">{getDisplayMethodIcon(venta)}</span>
                              {venta.estado}
                            </span>
                          )}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            <span className="mr-1">{getDisplayMethodIcon(venta)}</span>
                            {getDisplayMethodLabel(venta)}
                          </span>
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">{venta.empleadoId || 'Desconocido'}</td>
                        <td className="border border-gray-300 relative whitespace-nowrap px-3 py-2 text-sm font-medium text-center">
                          <div className="flex items-center space-x-2 justify-center">
                            <button
                              onClick={() => handleViewDetails(venta.id)}
                              className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition duration-150 ease-in-out"
                              title="Ver Detalles de la Venta"
                            >
                              <EyeIcon className="h-5 w-5" />
                            </button>
                            {/* NUEVO BOTÓN - Añade este botón */}
                            <button
                              onClick={() => handleImprimirVenta(venta)}
                              className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition duration-150 ease-in-out"
                              title="Imprimir Comprobante PDF"
                              disabled={venta.estado === 'anulada'}
                            >
                              <PrinterIcon className="h-5 w-5" />
                            </button>
                            {/* Botón Ticket */}
                            <button
                              onClick={() => handleImprimirTicket(venta)}
                              className="text-purple-600 hover:text-purple-800 p-2 rounded-full hover:bg-purple-50 transition duration-150 ease-in-out"
                              title="Imprimir Ticket de Venta"
                              disabled={venta.estado === 'anulada'}
                            >
                              {/* Icono de ticket personalizado */}
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                                      d="M9 12h6m-6 4h6m2 5l-2-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12l2 2h8z" />
                              </svg>
                            </button>
                            {venta.estado === 'completada' && (
                              <button
                                onClick={() => handleAnularVenta(venta.id)}
                                className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition duration-150 ease-in-out ml-1"
                                title="Anular Venta"
                              >
                                <XCircleIcon className="h-5 w-5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Controles de paginación */}
              {filteredVentas.length > ventasPerPage && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{indexOfFirstVenta + 1}</span> a <span className="font-medium">{Math.min(indexOfLastVenta, filteredVentas.length)}</span> de <span className="font-medium">{filteredVentas.length}</span> resultados
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

export default VentasIndexPage;