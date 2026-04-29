// pages/productos/index.js
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import * as XLSX from 'xlsx';
import { db } from '../../lib/firebase';
import { useAppCache } from '../../contexts/AppCacheContext';
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
  serverTimestamp,
  limit,
  startAfter,
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
  const isAdmin = user?.email === 'admin@gmail.com' || user?.email === 'admin2@gmail.com';

  // ── Cache ────────────────────────────────────────────────────────────────
  const { getCache, setCache, invalidateCache } = useAppCache();
  const cached = getCache('productos');
  const isFirstRender = useRef(true);
  const filtersChanged = useRef(false);

  // ── Estados principales — inicializados desde cache ──────────────────────
  const [productos, setProductos] = useState(cached?.data || []);
  const [filteredProductos, setFilteredProductos] = useState(
    cached?.filtros?.filteredProductos || cached?.data || []
  );
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [totalProductos, setTotalProductos] = useState(
    cached?.filtros?.totalProductos || 0
  );

  // ── Filtros — rehidratados desde cache ───────────────────────────────────
  const [filterNombre, setFilterNombre] = useState(
    cached?.filtros?.filterNombre || ''
  );
  const [filterCodigoProveedor, setFilterCodigoProveedor] = useState(
    cached?.filtros?.filterCodigoProveedor || ''
  );
  const [filterMarca, setFilterMarca] = useState(
    cached?.filtros?.filterMarca || ''
  );
  const [filterCodigoTienda, setFilterCodigoTienda] = useState(
    cached?.filtros?.filterCodigoTienda || ''
  );
  const [filterUbicacion, setFilterUbicacion] = useState(
    cached?.filtros?.filterUbicacion || ''
  );
  const [filterModelosCompatibles, setFilterModelosCompatibles] = useState(
    cached?.filtros?.filterModelosCompatibles || ''
  );
  const [filterMedida, setFilterMedida] = useState(
    cached?.filtros?.filterMedida || ''
  );

  // ── Ordenamiento — rehidratado desde cache ───────────────────────────────
  const [sortColumn, setSortColumn] = useState(
    cached?.filtros?.sortColumn || null
  );
  const [sortDirection, setSortDirection] = useState(
    cached?.filtros?.sortDirection || 'asc'
  );

  // ── Paginación — rehidratada desde cache ─────────────────────────────────
  const [currentPage, setCurrentPage] = useState(
    cached?.filtros?.currentPage || 1
  );
  const [productsPerPage, setProductsPerPage] = useState(
    cached?.filtros?.productsPerPage || 10
  );

  const totalPages = Math.ceil(filteredProductos.length / productsPerPage);

  // ── Modales ───────────────────────────────────────────────────────────────
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

  // Import Excel
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [previewData, setPreviewData] = useState([]);

  // ── Carga de productos — respeta cache ────────────────────────────────────
  const fetchProductos = async (forceReload = false) => {
    if (!user) { router.push('/auth'); return; }

    // Si hay cache y no es una recarga forzada, no volver a Firestore
    if (cached && !forceReload && !filtersChanged.current) {
      setLoading(false);
      return;
    }

    filtersChanged.current = false;
    setLoading(true);
    setError(null);

    try {
      // Primera carga rápida: 50 productos para mostrar inmediato
      const qFirst = query(
        collection(db, 'productos'),
        orderBy('nombre', 'asc'),
        limit(50)
      );
      const firstSnapshot = await getDocs(qFirst);
      const firstBatch = firstSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      // Mostrar los primeros 50 inmediatamente
      setProductos(firstBatch);
      setFilteredProductos(firstBatch);
      setLoading(false); // UI disponible de inmediato

      // Cargar el resto en background sin bloquear
      if (firstSnapshot.docs.length === 50) {
        const qRest = query(
          collection(db, 'productos'),
          orderBy('nombre', 'asc'),
          startAfter(firstSnapshot.docs[firstSnapshot.docs.length - 1])
        );
        const restSnapshot = await getDocs(qRest);
        const restBatch = restSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        const allProducts = [...firstBatch, ...restBatch];
        setProductos(allProducts);
        setFilteredProductos(allProducts);
        setTotalProductos(allProducts.length);
        // Guardar TODO en cache solo cuando ya tenemos el array completo
        setCache('productos', allProducts, {
          filteredProductos: allProducts,
          filterNombre: '',
          filterCodigoProveedor: '',
          filterMarca: '',
          filterCodigoTienda: '',
          filterUbicacion: '',
          filterModelosCompatibles: '',
          filterMedida: '',
          sortColumn: null,
          sortDirection: 'asc',
          currentPage: 1,
          productsPerPage,
          totalProductos: allProducts.length,
        });
      } else {
        setTotalProductos(firstBatch.length);
        setCache('productos', firstBatch, {
          filteredProductos: firstBatch,
          filterNombre: '',
          filterCodigoProveedor: '',
          filterMarca: '',
          filterCodigoTienda: '',
          filterUbicacion: '',
          filterModelosCompatibles: '',
          filterMedida: '',
          sortColumn: null,
          sortDirection: 'asc',
          currentPage: 1,
          productsPerPage,
          totalProductos: firstBatch.length,
        });
      }
    } catch (err) {
      console.error('Error al cargar productos:', err);
      setError('Error al cargar productos.');
      setLoading(false);
    }
  };

  // ── useEffect principal — solo carga si no hay cache ─────────────────────
  useEffect(() => {
    if (!user) return;

    if (cached && !filtersChanged.current) {
      // Cache válido: restaurar estado sin ir a Firestore
      setProductos(cached.data);
      if (cached.filtros?.filteredProductos?.length > 0) {
        setFilteredProductos(cached.filtros.filteredProductos);
      } else {
        setFilteredProductos(cached.data);
      }
      setLoading(false);
      return;
    }

    fetchProductos();
  }, [user]);

  // ── Persistir cache cuando cambia algo relevante ──────────────────────────
  // Solo persistimos cuando hay datos reales (no en el primer render vacío)
  useEffect(() => {
    if (productos.length === 0) return;
    // No sobreescribir cache con datos parciales durante la carga en background
    if (loading) return;

    setCache('productos', productos, {
      filteredProductos,
      filterNombre,
      filterCodigoProveedor,
      filterMarca,
      filterCodigoTienda,
      filterUbicacion,
      filterModelosCompatibles,
      filterMedida,
      sortColumn,
      sortDirection,
      currentPage,
      productsPerPage,
      totalProductos,
    });
  }, [
    productos, filteredProductos,
    filterNombre, filterCodigoProveedor, filterMarca, filterCodigoTienda,
    filterUbicacion, filterModelosCompatibles, filterMedida,
    sortColumn, sortDirection, currentPage, productsPerPage, totalProductos,
  ]);

  // ── Filtros con debounce — igual que ventas, no afectan la carga ─────────
  useEffect(() => {
    // En primer render con cache válido, ya tenemos filteredProductos restaurado
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (cached?.filtros?.filteredProductos?.length > 0) {
        return; // ya restaurado arriba, no volver a filtrar
      }
    }

    if (productos.length === 0) return;

    const timeoutId = setTimeout(() => {
      applyFilters();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [
    filterNombre, filterCodigoTienda, filterCodigoProveedor,
    filterMarca, filterModelosCompatibles, productos
  ]);

  // ── Lógica de filtrado ────────────────────────────────────────────────────
  const applyFilters = async () => {
    const hayFiltros = filterNombre || filterCodigoTienda || filterCodigoProveedor ||
      filterMarca || filterModelosCompatibles;

    if (!hayFiltros) {
      setFilteredProductos(productos);
      setCurrentPage(1);
      setSortColumn(null);
      setSortDirection('asc');
      return;
    }

    const palabrasNombre = filterNombre.trim()
      ? filterNombre.trim().toUpperCase().split(/[\s\-\/\.]+/).filter(p => p.length >= 2)
      : [];

    const lowerFilterCodigoProveedor = filterCodigoProveedor.toLowerCase();
    const lowerFilterMarca = filterMarca.toLowerCase();
    const lowerFilterCodigoTienda = filterCodigoTienda.toLowerCase();
    const lowerFilterModelosCompatibles = filterModelosCompatibles.toLowerCase();

    const matchesSecondaryFilters = (producto) => {
      if (lowerFilterCodigoTienda && !producto.codigoTienda?.toLowerCase().includes(lowerFilterCodigoTienda)) return false;
      if (lowerFilterCodigoProveedor && !producto.codigoProveedor?.toLowerCase().includes(lowerFilterCodigoProveedor)) return false;
      if (lowerFilterMarca && !producto.marca?.toLowerCase().includes(lowerFilterMarca)) return false;
      if (lowerFilterModelosCompatibles && !producto.modelosCompatiblesTexto?.toLowerCase().includes(lowerFilterModelosCompatibles)) return false;
      return true;
    };

    const matchesNombrePalabrasClave = (producto) => {
      if (palabrasNombre.length === 0) return true;
      const claves = producto.palabrasClave || [];
      return palabrasNombre.every(palabra =>
        claves.some(clave => clave.includes(palabra))
      );
    };

    // PASO 1: Filtrar localmente — instantáneo, sin Firestore
    const localFiltered = productos.filter(producto =>
      matchesNombrePalabrasClave(producto) && matchesSecondaryFilters(producto)
    );

    if (localFiltered.length > 0) {
      setFilteredProductos(localFiltered);
      setCurrentPage(1);
      setSortColumn(null);
      setSortDirection('asc');
      return;
    }

    // PASO 2: No encontró nada localmente → buscar en Firestore
    try {
      setLoading(true);
      const resultados = new Map();

      if (palabrasNombre.length > 0) {
        const q = query(
          collection(db, 'productos'),
          where('palabrasClave', 'array-contains', palabrasNombre[0]),
          limit(100)
        );
        const snapshot = await getDocs(q);
        let candidatos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        candidatos = candidatos.filter(p => {
          const claves = p.palabrasClave || [];
          return palabrasNombre.every(palabra => claves.some(clave => clave.includes(palabra)));
        });
        candidatos.forEach(p => resultados.set(p.id, p));

        const termOriginal = filterNombre.trim().toUpperCase();
        const porCodigo = await Promise.all([
          getDocs(query(collection(db, 'productos'), where('codigoTienda', '==', termOriginal), limit(5))),
          getDocs(query(collection(db, 'productos'), where('codigoProveedor', '==', termOriginal), limit(5)))
        ]);
        porCodigo.forEach(snap => {
          snap.docs.forEach(d => {
            if (!resultados.has(d.id)) resultados.set(d.id, { id: d.id, ...d.data() });
          });
        });
      }

      if (filterCodigoTienda) {
        const snap = await getDocs(query(
          collection(db, 'productos'),
          where('codigoTienda', '==', filterCodigoTienda.toUpperCase()),
          limit(20)
        ));
        snap.docs.forEach(d => {
          if (!resultados.has(d.id)) resultados.set(d.id, { id: d.id, ...d.data() });
        });
      }

      if (filterCodigoProveedor) {
        const snap = await getDocs(query(
          collection(db, 'productos'),
          where('codigoProveedor', '==', filterCodigoProveedor.toUpperCase()),
          limit(20)
        ));
        snap.docs.forEach(d => {
          if (!resultados.has(d.id)) resultados.set(d.id, { id: d.id, ...d.data() });
        });
      }

      if (filterMarca) {
        const termUpper = filterMarca.toUpperCase();
        const snap = await getDocs(query(
          collection(db, 'productos'),
          where('marca', '>=', termUpper),
          where('marca', '<=', termUpper + '\uf8ff'),
          limit(50)
        ));
        snap.docs.forEach(d => {
          if (!resultados.has(d.id)) resultados.set(d.id, { id: d.id, ...d.data() });
        });
      }

      const finalResults = Array.from(resultados.values()).filter(producto =>
        matchesNombrePalabrasClave(producto) && matchesSecondaryFilters(producto)
      );

      setFilteredProductos(finalResults);
      setCurrentPage(1);
      setSortColumn(null);
      setSortDirection('asc');
    } catch (err) {
      console.error('Error en búsqueda Firestore:', err);
      setError('Error al buscar productos');
    } finally {
      setLoading(false);
    }
  };

  // ── Ordenamiento ──────────────────────────────────────────────────────────
  const handleSort = (columnKey) => {
    let newDirection = 'asc';
    if (sortColumn === columnKey) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }
    setSortColumn(columnKey);
    setSortDirection(newDirection);

    const sortedProducts = [...filteredProductos].sort((a, b) => {
      let aValue = (a[columnKey] || '').toString().toLowerCase();
      let bValue = (b[columnKey] || '').toString().toLowerCase();

      if (columnKey === 'codigoTienda') {
        const aNum = aValue.match(/\d+/);
        const bNum = bValue.match(/\d+/);
        if (aNum && bNum) {
          const diff = parseInt(aNum[0]) - parseInt(bNum[0]);
          if (diff !== 0) return newDirection === 'asc' ? diff : -diff;
        }
      }

      if (aValue < bValue) return newDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return newDirection === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredProductos(sortedProducts);
    setCurrentPage(1);
  };

  const getSortIcon = (columnKey) => {
    if (sortColumn !== columnKey) return null;
    return sortDirection === 'asc'
      ? <ChevronUpIcon className="h-4 w-4 inline ml-1" />
      : <ChevronDownIcon className="h-4 w-4 inline ml-1" />;
  };

  // ── FIFO helpers ──────────────────────────────────────────────────────────
  const recalcularPrecioCompraFIFO = async (productoId) => {
    try {
      const lotesQuery = query(
        collection(db, 'lotes'),
        where('productoId', '==', productoId),
        where('stockRestante', '>', 0),
        where('estado', '==', 'activo'),
        orderBy('fechaIngreso', 'asc')
      );
      const lotesSnapshot = await getDocs(lotesQuery);

      let nuevoPrecioCompra = 0, nuevoPrecioVenta = 0, nuevoPrecioVentaMinimo = 0, stockTotal = 0;

      if (!lotesSnapshot.empty) {
        const primerLote = lotesSnapshot.docs[0].data();
        nuevoPrecioCompra = parseFloat(primerLote.precioCompraUnitario || 0);
        nuevoPrecioVenta = parseFloat(primerLote.precioVentaUnitario || 0);
        nuevoPrecioVentaMinimo = parseFloat(primerLote.precioVentaMinimoUnitario || 0);
        lotesSnapshot.docs.forEach(d => { stockTotal += parseInt(d.data().stockRestante || 0); });
      }

      await updateDoc(doc(db, 'productos', productoId), {
        precioCompraDefault: nuevoPrecioCompra,
        precioVentaDefault: nuevoPrecioVenta,
        precioVentaMinimo: nuevoPrecioVentaMinimo,
        stockActual: stockTotal,
        updatedAt: serverTimestamp()
      });

      return { nuevoPrecioCompra, nuevoPrecioVenta, nuevoPrecioVentaMinimo, stockTotal };
    } catch (error) {
      console.error(`Error FIFO para producto ${productoId}:`, error);
      throw error;
    }
  };

  const actualizarTodosLosPrecios = async () => {
    if (!window.confirm('¿Recalcular precios de todos los productos?')) return;
    setUpdatingPrices(true);
    let actualizados = 0, errores = 0;

    const BATCH_SIZE = 10;
    for (let i = 0; i < productos.length; i += BATCH_SIZE) {
      const batch = productos.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (producto) => {
        try { await recalcularPrecioCompraFIFO(producto.id); actualizados++; }
        catch { errores++; }
      }));
    }

    // Forzar recarga y actualizar cache
    invalidateCache('productos');
    filtersChanged.current = true;
    await fetchProductos(true);
    setAlertMessage(`Actualización completa: ${actualizados} actualizados${errores > 0 ? `, ${errores} errores` : ''}.`);
    setIsAlertModalOpen(true);
    setUpdatingPrices(false);
  };

  const recalcularProductoEspecifico = async (productoId) => {
    try {
      const resultado = await recalcularPrecioCompraFIFO(productoId);

      const updater = (list) => list.map(p =>
        p.id === productoId
          ? { ...p, precioCompraDefault: resultado.nuevoPrecioCompra, stockActual: resultado.stockTotal, precioVentaDefault: resultado.nuevoPrecioVenta, precioVentaMinimo: resultado.nuevoPrecioVentaMinimo }
          : p
      );

      setProductos(updater);
      setFilteredProductos(updater);
      setAlertMessage(`Precio actualizado: S/. ${resultado.nuevoPrecioCompra.toFixed(2)} (Stock: ${resultado.stockTotal})`);
      setIsAlertModalOpen(true);
    } catch (error) {
      setError('Error al recalcular el precio. Intente de nuevo.');
    }
  };

  // ── Limpiar filtros ───────────────────────────────────────────────────────
  const handleClearFilters = () => {
    // NO invalidamos el cache de datos — solo reseteamos los filtros visuales
    setFilterNombre('');
    setFilterCodigoProveedor('');
    setFilterCodigoTienda('');
    setFilterUbicacion('');
    setFilterModelosCompatibles('');
    setFilterMarca('');
    setFilterMedida('');
    setFilteredProductos(productos); // restaurar lista completa desde memoria
    setCurrentPage(1);
    setSortColumn(null);
    setSortDirection('asc');
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (productId) => {
    try {
      await deleteDoc(doc(db, 'productos', productId));
      const updater = (list) => list.filter(p => p.id !== productId);
      const newProductos = updater(productos);
      setProductos(newProductos);
      setFilteredProductos(updater);
      // Actualizar cache tras eliminar
      setCache('productos', newProductos, {
        filteredProductos: newProductos,
        filterNombre, filterCodigoProveedor, filterMarca, filterCodigoTienda,
        filterUbicacion, filterModelosCompatibles, filterMedida,
        sortColumn, sortDirection, currentPage, productsPerPage,
        totalProductos: newProductos.length,
      });
      setAlertMessage('Producto eliminado con éxito.');
      setIsAlertModalOpen(true);
    } catch (err) {
      setError('Error al eliminar el producto. ' + err.message);
      setAlertMessage('Hubo un error al eliminar el producto.');
      setIsAlertModalOpen(true);
    } finally {
      setIsConfirmModalOpen(false);
    }
  };

  const confirmDelete = (productId) => {
    setConfirmMessage('¿Estás seguro de que quieres eliminar este producto? Esta acción es irreversible.');
    setConfirmAction(() => () => handleDelete(productId));
    setIsConfirmModalOpen(true);
  };

  // ── Modales helpers ───────────────────────────────────────────────────────
  const openImageModal = (producto) => { setSelectedProductForDetails(producto); setIsImageModalOpen(true); };
  const closeImageModal = () => { setIsImageModalOpen(false); setSelectedProductForDetails(null); };
  const openProductDetailsModal = (product) => { setSelectedProductForDetails(product); setIsProductDetailsModalOpen(true); };
  const closeProductDetailsModal = () => { setSelectedProductForDetails(null); setIsProductDetailsModalOpen(false); };
  const openProductModelsModal = (product) => { setSelectedProductForModels(product); setIsProductModelsModalOpen(true); };
  const closeProductModelsModal = () => { setSelectedProductForModels(null); setIsProductModelsModalOpen(false); };

  // ── Helpers de display ────────────────────────────────────────────────────
  const isLowStock = (stockActual, stockUmbral) => stockActual <= stockUmbral;
  const needsPriceUpdate = (producto) => {
    const lastUpdate = producto.updatedAt?.toDate() || new Date(0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return lastUpdate < thirtyDaysAgo;
  };

  // ── Paginación ────────────────────────────────────────────────────────────
  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = filteredProductos.slice(indexOfFirstProduct, indexOfLastProduct);

  // ── Import Excel ──────────────────────────────────────────────────────────
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        setPreviewData(jsonData.slice(0, 5));
      } catch (error) {
        setAlertMessage('Error al leer el archivo Excel. Verifique el formato.');
        setIsAlertModalOpen(true);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const validateExcelData = (data) => {
    const errors = [];
    const requiredTextFields = ['nombre', 'marca'];
    const requiredNumericFields = ['precioCompraDefault', 'precioVentaDefault', 'precioVentaMinimo', 'stockActual'];
    data.forEach((row, index) => {
      const rowNumber = index + 1;
      requiredTextFields.forEach(field => {
        if (!row[field] || row[field].toString().trim() === '') errors.push(`Fila ${rowNumber}: '${field}' es obligatorio`);
      });
      requiredNumericFields.forEach(field => {
        if (row[field] === undefined || row[field] === null || row[field] === '') errors.push(`Fila ${rowNumber}: '${field}' es obligatorio`);
        else if (isNaN(parseFloat(row[field]))) errors.push(`Fila ${rowNumber}: '${field}' debe ser número`);
        else if (parseFloat(row[field]) < 0) errors.push(`Fila ${rowNumber}: '${field}' no puede ser negativo`);
      });
      const pv = parseFloat(row.precioVentaDefault || 0);
      const pm = parseFloat(row.precioVentaMinimo || 0);
      if (pv > 0 && pm > pv) errors.push(`Fila ${rowNumber}: precio mínimo no puede superar al precio de venta`);
      if (row.imageUrls && row.imageUrls.toString().split(',').filter(u => u.trim()).length > 3)
        errors.push(`Fila ${rowNumber}: máximo 3 imágenes`);
    });
    return errors;
  };

  const processExcelImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        const errors = validateExcelData(jsonData);
        if (errors.length > 0) {
          setAlertMessage(`Errores:\n${errors.slice(0, 10).join('\n')}`);
          setIsAlertModalOpen(true);
          setIsImporting(false);
          return;
        }
        let successCount = 0, errorCount = 0;
        const errorDetails = [];
        for (const [index, row] of jsonData.entries()) {
          try {
            const imageUrls = row.imageUrls ? row.imageUrls.split(',').map(u => u.trim()).filter(u => u) : [];
            await addDoc(collection(db, 'productos'), {
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
              imageUrls,
              imageUrl: imageUrls[0] || '',
              modelosCompatiblesTexto: row.modelosCompatiblesTexto?.toString().trim() || '',
              modelosCompatiblesIds: [],
              color: row.color?.toString().trim() || '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            successCount++;
          } catch (err) {
            errorCount++;
            errorDetails.push(`Fila ${index + 1}: ${err.message}`);
          }
        }
        // Invalidar cache y recargar tras importar
        invalidateCache('productos');
        filtersChanged.current = true;
        await fetchProductos(true);
        setAlertMessage(`Importación completa:\n✅ ${successCount} importados${errorCount > 0 ? `\n❌ ${errorCount} errores` : ''}`);
        setIsAlertModalOpen(true);
        setIsImportModalOpen(false);
      } catch (err) {
        setAlertMessage('Error al procesar el archivo Excel.');
        setIsAlertModalOpen(true);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsArrayBuffer(importFile);
  };

  const downloadExcelTemplate = () => {
    const templateData = [{
      nombre: 'Ejemplo Producto 1',
      descripcionPuntos: '- Característica 1\n- Característica 2',
      medida: '1.2m', marca: 'YAMAHA',
      codigoTienda: 'PROD001', codigoProveedor: 'YAM-001',
      precioCompraDefault: 25.50, precioVentaDefault: 45.00, precioVentaMinimo: 35.00,
      stockActual: 50, stockReferencialUmbral: 5,
      ubicacion: 'A-1-3', imageUrls: 'https://ejemplo.com/img1.jpg',
      modelosCompatiblesTexto: 'YBR 125, FZ-16', color: 'Negro'
    }];
    const emptyTemplate = [{ nombre: '', descripcionPuntos: '', medida: '', marca: '', codigoTienda: '', codigoProveedor: '', precioCompraDefault: '', precioVentaDefault: '', precioVentaMinimo: '', stockActual: '', stockReferencialUmbral: '', ubicacion: '', imageUrls: '', modelosCompatiblesTexto: '', color: '' }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(emptyTemplate), 'Plantilla');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(templateData), 'Ejemplos');
    XLSX.writeFile(wb, 'plantilla_productos.xlsx');
  };

  // ── ImportExcelModal ──────────────────────────────────────────────────────
  const ImportExcelModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75" />
          <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
          <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
            <div className="bg-white px-6 py-5">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Importar Productos desde Excel</h3>
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">Paso 1: Descargar Plantilla</h4>
                  <button onClick={downloadExcelTemplate} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
                    📥 Descargar Plantilla Excel
                  </button>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">Paso 2: Seleccionar Archivo</h4>
                  <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                </div>
                {previewData.length > 0 && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-900 mb-2">Vista Previa (primeros 5 registros):</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead><tr className="bg-gray-200">
                          <th className="px-2 py-1 text-left">Nombre</th>
                          <th className="px-2 py-1 text-left">Marca</th>
                          <th className="px-2 py-1 text-left">P. Compra</th>
                          <th className="px-2 py-1 text-left">P. Venta</th>
                          <th className="px-2 py-1 text-left">Stock</th>
                        </tr></thead>
                        <tbody>{previewData.map((row, i) => (
                          <tr key={i} className="border-b">
                            <td className="px-2 py-1">{row.nombre || 'N/A'}</td>
                            <td className="px-2 py-1">{row.marca || 'N/A'}</td>
                            <td className="px-2 py-1">{row.precioCompraDefault || 'N/A'}</td>
                            <td className="px-2 py-1">{row.precioVentaDefault || 'N/A'}</td>
                            <td className="px-2 py-1">{row.stockActual || 'N/A'}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-yellow-900 mb-2">Instrucciones:</h4>
                  <ul className="text-yellow-800 text-sm space-y-1">
                    <li>• Obligatorios: nombre, marca, precioCompraDefault, precioVentaDefault, precioVentaMinimo, stockActual</li>
                    <li>• Los precios deben ser decimales (ej: 25.50), el stock entero</li>
                    <li>• Máximo 3 URLs de imágenes separadas por comas</li>
                    <li>• El precio mínimo no puede superar el precio de venta</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-3 flex flex-row-reverse gap-2">
              <button onClick={processExcelImport} disabled={!importFile || isImporting}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2">
                {isImporting && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                {isImporting ? 'Importando...' : 'Importar Productos'}
              </button>
              <button onClick={onClose} disabled={isImporting}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!user) return null;

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <Layout title="Gestión de Productos">
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-4 bg-white rounded-lg shadow-md flex flex-col">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* ── Filtros y botones ── */}
          <div className="mb-4 border border-gray-200 rounded-lg p-3 bg-gray-50 flex-shrink-0">

            {/* Fila 1: Filtros */}
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div className="flex-grow min-w-[160px]">
                <label className="block text-xs font-medium text-gray-700 mb-1">NOMBRE</label>
                <input type="text"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  value={filterNombre} onChange={e => setFilterNombre(e.target.value)} placeholder="Nombre..." />
              </div>
              <div className="w-32">
                <label className="block text-xs font-medium text-gray-700 mb-1">C. TIENDA</label>
                <input type="text"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  value={filterCodigoTienda} onChange={e => setFilterCodigoTienda(e.target.value)} placeholder="Cód. Tienda..." />
              </div>
              <div className="w-36">
                <label className="block text-xs font-medium text-gray-700 mb-1">C. PROVEEDOR</label>
                <input type="text"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  value={filterCodigoProveedor} onChange={e => setFilterCodigoProveedor(e.target.value)} placeholder="Cód. Proveedor..." />
              </div>
              <div className="w-28">
                <label className="block text-xs font-medium text-gray-700 mb-1">MARCA</label>
                <input type="text"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  value={filterMarca} onChange={e => setFilterMarca(e.target.value)} placeholder="Marca..." />
              </div>
              <div className="w-36">
                <label className="block text-xs font-medium text-gray-700 mb-1">M COMPATIBLES</label>
                <input type="text"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  value={filterModelosCompatibles} onChange={e => setFilterModelosCompatibles(e.target.value)} placeholder="Ej: Yamaha..." />
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-700 mb-1">MOSTRAR</label>
                <select
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  value={productsPerPage}
                  onChange={e => { setProductsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <button onClick={handleClearFilters}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 self-end">
                <ArrowPathIcon className="h-4 w-4 mr-1" /> Limpiar
              </button>
            </div>

            {/* Fila 2: Botones de acción */}
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <button onClick={() => router.push('/productos/nuevo')}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                  <PlusIcon className="h-4 w-4 mr-1" /> Agregar Producto
                </button>
              )}
              <button onClick={actualizarTodosLosPrecios} disabled={updatingPrices}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                {updatingPrices
                  ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1" />Actualizando...</>
                  : <><CurrencyDollarIcon className="h-4 w-4 mr-1" />Act. Precios</>}
              </button>
              {isAdmin && (
                <button onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700">
                  <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Importar Excel
                </button>
              )}
              {/* Indicador total en cache */}
              {totalProductos > 0 && (
                <span className="text-xs text-gray-400 ml-auto">
                  {totalProductos} productos cargados
                  {filteredProductos.length !== totalProductos && ` · ${filteredProductos.length} filtrados`}
                </span>
              )}
            </div>
          </div>

          {/* ── Tabla ── */}
          {loading ? (
            <div className="flex flex-col justify-center items-center h-64 gap-3">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
              <p className="text-sm text-gray-500">Cargando productos...</p>
            </div>
          ) : filteredProductos.length === 0 ? (
            <p className="p-4 text-center text-gray-500">No se encontraron productos que coincidan con los filtros.</p>
          ) : (
            <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg overflow-y-auto max-h-[65vh]">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-gray-100">
                  <tr>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center cursor-pointer hover:bg-gray-200 select-none"
                      onClick={() => handleSort('codigoTienda')}>
                      C. TIENDA {getSortIcon('codigoTienda')}
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center cursor-pointer hover:bg-gray-200 select-none"
                      onClick={() => handleSort('nombre')}>
                      NOMBRE {getSortIcon('nombre')}
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MARCA</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">C. PROVEEDOR</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">COLOR</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MEDIDA</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">UBICACION</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center cursor-pointer hover:bg-gray-200 select-none"
                      onClick={() => handleSort('stockActual')}>
                      STOCK {getSortIcon('stockActual')}
                    </th>
                    {isAdmin && (
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">COSTO (S/.)</th>
                    )}
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">VENTA MIN (S/.)</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">VENTA (S/.)</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ACCIONES</th>
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
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>{producto.codigoTienda}</td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium text-left ${textColorClass}`}>{producto.nombre}</td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>{producto.marca || 'N/A'}</td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>{producto.codigoProveedor}</td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>{producto.color || 'N/A'}</td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>{producto.medida || 'N/A'}</td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-left ${textColorClass}`}>{producto.ubicacion || 'N/A'}</td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-semibold text-center ${textColorClass}`}>
                          {producto.stockActual}
                          {lowStock && <span className="ml-1 text-red-500">⚠</span>}
                        </td>
                        {isAdmin && (
                          <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center ${textColorClass}`}>
                            <div className="flex items-center justify-center gap-1">
                              S/. {parseFloat(producto.precioCompraDefault || 0).toFixed(2)}
                              {priceNeedsUpdate && (
                                <ExclamationTriangleIcon className="h-4 w-4 text-orange-500" title="Precio podría estar desactualizado" />
                              )}
                            </div>
                          </td>
                        )}
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center ${textColorClass}`}>
                          S/. {parseFloat(producto.precioVentaMinimo || 0).toFixed(2)}
                        </td>
                        <td className={`border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center ${textColorClass}`}>
                          S/. {parseFloat(producto.precioVentaDefault || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium">
                          <div className="flex items-center space-x-1 justify-center">
                            <button onClick={() => openImageModal(producto)}
                              className="text-gray-600 hover:text-gray-900 p-1 rounded-full hover:bg-gray-100"
                              title="Ver Imágenes"
                              disabled={!producto.imageUrl && (!producto.imageUrls || producto.imageUrls.length === 0)}>
                              <PhotoIcon className="h-5 w-5" />
                            </button>
                            <button onClick={() => openProductModelsModal(producto)}
                              className="text-purple-600 hover:text-purple-900 p-1 rounded-full hover:bg-gray-100"
                              title="Ver Modelos Compatibles"
                              disabled={!producto.modelosCompatiblesTexto || producto.modelosCompatiblesTexto.trim() === ''}>
                              <ListBulletIcon className="h-5 w-5" />
                            </button>
                            <button onClick={() => openProductDetailsModal(producto)}
                              className="text-emerald-600 hover:text-emerald-900 p-1 rounded-full hover:bg-gray-100"
                              title="Ver Detalles">
                              <EyeIcon className="h-5 w-5" />
                            </button>
                            {isAdmin && (
                              <>
                                <button onClick={() => router.push(`/productos/${producto.id}`)}
                                  className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-gray-100"
                                  title="Editar">
                                  <PencilIcon className="h-5 w-5" />
                                </button>
                                <button onClick={() => confirmDelete(producto.id)}
                                  className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-gray-100"
                                  title="Eliminar">
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

          {/* ── Paginación ── */}
          {filteredProductos.length > productsPerPage && (
            <div className="flex justify-between items-center mt-4">
              <p className="text-sm text-gray-700">
                Mostrando <span className="font-medium">{indexOfFirstProduct + 1}</span> a{' '}
                <span className="font-medium">{Math.min(indexOfLastProduct, filteredProductos.length)}</span> de{' '}
                <span className="font-medium">{filteredProductos.length}</span> resultados
              </p>
              <div className="flex space-x-2">
                <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">Página {currentPage} de {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modales ── */}
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
          onClose={() => { setIsImportModalOpen(false); setImportFile(null); setPreviewData([]); }}
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