// pages/inventario/ingresos/editar/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useRef } from 'react';
import { useAuth } from '../../../../contexts/AuthContext';
import Layout from '../../../../components/Layout';
import { db } from '../../../../lib/firebase';
import {
  collection, getDocs, doc, addDoc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, where, limit
} from 'firebase/firestore';
import {
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  ArrowLeftIcon,
  PencilIcon,
  XMarkIcon,
  HashtagIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { Calendar } from '../../../../components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const EditarIngresoPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();

  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [ingreso, setIngreso] = useState(null);

  // Campos principales editables
  const [numeroBoleta, setNumeroBoleta] = useState('');
  const [numeroPedido, setNumeroPedido] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [fechaRecepcion, setFechaRecepcion] = useState(null);

  // Modal umbral
  const [showUmbralEdit, setShowUmbralEdit] = useState(false);
  const [nuevoUmbral, setNuevoUmbral] = useState(0);

  // Lotes anteriores
  const [lotesAnteriores, setLotesAnteriores] = useState([]);

  // Búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProductos, setFilteredProductos] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Items del ingreso (lotes nuevos pendientes de guardar)
  const [itemsIngreso, setItemsIngreso] = useState([]);
  // Lotes existentes (ya guardados en Firestore)
  const [lotesExistentes, setLotesExistentes] = useState([]);

  // Modal cantidad (agregar nuevo lote)
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [precioCompra, setPrecioCompra] = useState(0);
  const [numeroLote, setNumeroLote] = useState('');
  const [precioVenta, setPrecioVenta] = useState(0);
  const [precioVentaMinimo, setPrecioVentaMinimo] = useState(0);

  // Modal edición de item nuevo (pendiente)
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editPrecio, setEditPrecio] = useState(0);
  const [editNumeroLote, setEditNumeroLote] = useState('');
  const [showEditUmbralItem, setShowEditUmbralItem] = useState(false);
  const [editUmbralItem, setEditUmbralItem] = useState(0);

  // Modal edición de lote existente
  const [showEditLoteModal, setShowEditLoteModal] = useState(false);
  const [editingLote, setEditingLote] = useState(null);
  const [editLoteQuantity, setEditLoteQuantity] = useState(1);
  const [editLotePrecio, setEditLotePrecio] = useState(0);
  const [editLoteNumero, setEditLoteNumero] = useState('');
  const [editLotePrecioVenta, setEditLotePrecioVenta] = useState(0);
  const [editLotePrecioVentaMinimo, setEditLotePrecioVentaMinimo] = useState(0);
  const [lotesAnterioresEdit, setLotesAnterioresEdit] = useState([]);
  const [showUmbralEditLote, setShowUmbralEditLote] = useState(false);
  const [nuevoUmbralLote, setNuevoUmbralLote] = useState(0);
  const [editPrecioVenta, setEditPrecioVenta] = useState(0);
  const [editPrecioVentaMinimo, setEditPrecioVentaMinimo] = useState(0);
  const [editLotesAnteriores, setEditLotesAnteriores] = useState([]);

  const generateLoteNumber = () => {
    const fecha = new Date();
    const year = fecha.getFullYear().toString().slice(-2);
    const month = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const day = fecha.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `L${year}${month}${day}-${random}`;
  };

  // Cargar ingreso + lotes existentes + proveedores
  useEffect(() => {
    if (!user) { router.push('/auth'); return; }
    if (!id || !router.isReady) return;

    const fetchData = async () => {
      setLoadingData(true);
      setError(null);
      try {
        const qProv = query(collection(db, 'proveedores'), orderBy('nombreEmpresa', 'asc'));
        const provSnap = await getDocs(qProv);
        setProveedores(provSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const ingresoSnap = await getDoc(doc(db, 'ingresos', id));
        if (!ingresoSnap.exists()) { setError('Ingreso no encontrado.'); return; }
        const data = ingresoSnap.data();
        setIngreso({ id: ingresoSnap.id, ...data });
        setNumeroBoleta(data.numeroBoleta || '');
        setNumeroPedido(data.numeroPedido || '');
        setObservaciones(data.observaciones || '');
        setProveedorId(data.proveedorId || '');

        const fechaRef = data.fechaRecepcion || data.fechaIngreso;
        if (fechaRef?.toDate) {
          setFechaRecepcion(fechaRef.toDate());
        }

        // Cargar subcolección
        const lotesSnap = await getDocs(
          query(collection(db, 'ingresos', id, 'lotes'), orderBy('nombreProducto', 'asc'))
        );

        // Cargar lotes principales para complementar precioVentaUnitario y precioVentaMinimoUnitario
        // que la subcolección puede no tener en ingresos anteriores al fix de nuevo.js
        const lotesPrincipalesSnap = await getDocs(
          query(collection(db, 'lotes'), where('ingresoId', '==', id))
        );

        // Indexar por numeroLote para cruce rápido
        const lotesPrincipalesMap = {};
        lotesPrincipalesSnap.docs.forEach(d => {
          const data = d.data();
          lotesPrincipalesMap[data.numeroLote] = data;
        });

        // Combinar: subcolección como base, rellenar precios faltantes desde colección principal
        const lotesCompletos = lotesSnap.docs.map(d => {
          const sub = { id: d.id, ...d.data() };
          const principal = lotesPrincipalesMap[sub.numeroLote] || {};
          return {
            ...sub,
            precioVentaUnitario:       (sub.precioVentaUnitario != null && sub.precioVentaUnitario !== 0)
                                         ? sub.precioVentaUnitario
                                         : (principal.precioVentaUnitario ?? 0),
            precioVentaMinimoUnitario: (sub.precioVentaMinimoUnitario != null && sub.precioVentaMinimoUnitario !== 0)
                                         ? sub.precioVentaMinimoUnitario
                                         : (principal.precioVentaMinimoUnitario ?? 0),
          };
        });

        setLotesExistentes(lotesCompletos);

      } catch (err) {
        setError('Error al cargar: ' + err.message);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [user, id, router.isReady]);

  // Búsqueda de productos con debounce
  const searchProducts = async (term) => {
    if (!term.trim()) { setFilteredProductos([]); return; }
    setIsSearching(true);
    try {
      const idsVistos = new Set();
      let candidatos = [];
      const termUpper = term.trim().toUpperCase();
      const palabras = termUpper.split(/[\s\-\/\.]+/).filter(p => p.length >= 1);

      if (palabras.length > 0) {
        const queries = palabras.flatMap(palabra => [
          getDocs(query(collection(db, 'productos'), where('palabrasClave', 'array-contains', palabra), limit(200))),
          getDocs(query(collection(db, 'productos'), where('nombre', '>=', palabra), where('nombre', '<=', palabra + '\uf8ff'), limit(100))),
        ]);
        queries.push(
          getDocs(query(collection(db, 'productos'), where('codigoTienda', '==', termUpper), limit(5))),
          getDocs(query(collection(db, 'productos'), where('codigoProveedor', '==', termUpper), limit(5))),
          getDocs(query(collection(db, 'productos'), where('codigoTienda', '>=', termUpper), where('codigoTienda', '<=', termUpper + '\uf8ff'), limit(50))),
          getDocs(query(collection(db, 'productos'), where('codigoProveedor', '>=', termUpper), where('codigoProveedor', '<=', termUpper + '\uf8ff'), limit(50))),
        );
        const resultados = await Promise.all(queries);
        resultados.forEach(snap => {
          snap.docs.forEach(d => {
            if (!idsVistos.has(d.id)) { idsVistos.add(d.id); candidatos.push({ id: d.id, ...d.data() }); }
          });
        });
        candidatos = candidatos.filter(p => {
          const nombreUpper = (p.nombre || '').toUpperCase();
          const claves = (p.palabrasClave || []);
          const codigoTienda = (p.codigoTienda || '').toUpperCase();
          const codigoProveedor = (p.codigoProveedor || '').toUpperCase();
          return palabras.every(palabra =>
            nombreUpper.includes(palabra) ||
            claves.some(clave => clave.includes(palabra)) ||
            codigoTienda.includes(palabra) ||
            codigoProveedor.includes(palabra)
          );
        });
      }
      setFilteredProductos(candidatos);
    } catch (err) {
      console.error('Error buscando productos:', err);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchTerm.trim()) searchProducts(searchTerm);
      else setFilteredProductos([]);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const obtenerLotesAnteriores = async (productoId) => {
    try {
      const q = query(
        collection(db, 'lotes'),
        where('productoId', '==', productoId),
        orderBy('fechaIngreso', 'desc'),
        limit(5)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({
        numeroLote: d.data().numeroLote,
        precio: parseFloat(d.data().precioCompraUnitario || 0),
        precioVenta: parseFloat(d.data().precioVentaUnitario || 0),
        stockRestante: d.data().stockRestante ?? 0,
        fecha: d.data().fechaIngreso?.toDate?.() || null,
        estado: d.data().estado
      }));
    } catch (err) {
      return [];
    }
  };

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setPrecioCompra(parseFloat(product.precioCompraDefault || 0));
    setQuantity(1);
    setNumeroLote(generateLoteNumber());
    setShowQuantityModal(true);
    setSearchTerm('');
    setLotesAnteriores([]);
    obtenerLotesAnteriores(product.id).then(lotes => setLotesAnteriores(lotes));
    setShowUmbralEdit(false);
    setNuevoUmbral(product.stockReferencialUmbral || 4);
    setPrecioVenta(parseFloat(product.precioVentaDefault || 0));
    setPrecioVentaMinimo(parseFloat(product.precioVentaMinimo || 0));
  };

  const handleAddProductToIngreso = () => {
    if (!selectedProduct) return;

    const todosLosLotes = [
      ...itemsIngreso.map(i => i.numeroLote),
      ...lotesExistentes.map(l => l.numeroLote)
    ];
    if (todosLosLotes.includes(numeroLote.trim())) {
      alert('Ya existe un lote con este número. Use uno diferente.');
      return;
    }
    if (!numeroLote.trim()) { alert('Debe ingresar un número de lote.'); return; }

    const mismoNombreOtroId = itemsIngreso.filter(item =>
      item.nombreProducto === selectedProduct.nombre &&
      item.productoId !== selectedProduct.id
    );
    if (mismoNombreOtroId.length > 0) {
      const confirmar = window.confirm(
        `⚠️ ATENCIÓN: Ya tienes lotes de "${selectedProduct.nombre}" con un producto DIFERENTE en este ingreso.\n\n` +
        `Producto seleccionado ahora:\n` +
        `  • C.Proveedor: ${selectedProduct.codigoProveedor || 'Sin código'}\n` +
        `  • Marca: ${selectedProduct.marca || 'Sin marca'}\n` +
        `  • ID: ${selectedProduct.id}\n\n` +
        `¿Estás seguro que este es el producto correcto?`
      );
      if (!confirmar) return;
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
      stockActual: selectedProduct.stockActual || 0,
      precioCompraUnitario: precioCompra.toFixed(2),
      stockRestanteLote: quantity,
      subtotal: (quantity * precioCompra).toFixed(2),
      fechaVencimiento: null,
      nuevoUmbral: showUmbralEdit ? nuevoUmbral : null,
      precioVentaUnitario: precioVenta.toFixed(2),
      precioVentaMinimoUnitario: precioVentaMinimo.toFixed(2),
      esNuevo: true,
    };

    setItemsIngreso(prev => [...prev, newItem]);
    setShowQuantityModal(false);
  };

  // Editar lote NUEVO (pendiente)
  const handleEditItem = (item) => {
    setEditingItem(item);
    setEditQuantity(Number(item.cantidad));
    setEditPrecio(Number(item.precioCompraUnitario));
    setEditNumeroLote(item.numeroLote);
    setEditPrecioVenta(Number(item.precioVentaUnitario || 0));
    setEditPrecioVentaMinimo(Number(item.precioVentaMinimoUnitario || 0));
    setEditLotesAnteriores([]);
    obtenerLotesAnteriores(item.productoId).then(lotes => setEditLotesAnteriores(lotes));
    setShowEditItemModal(true);
    setEditUmbralItem(0);
  };

  const handleUpdateItem = () => {
    if (!editingItem) return;
    const loteExists = [
      ...itemsIngreso.filter(i => i.id !== editingItem.id).map(i => i.numeroLote),
      ...lotesExistentes.map(l => l.numeroLote)
    ].includes(editNumeroLote.trim());
    if (loteExists) { alert('Número de lote duplicado.'); return; }
    if (!editNumeroLote.trim()) { alert('Ingrese número de lote.'); return; }
    if (editQuantity <= 0) { alert('Cantidad debe ser mayor a 0.'); return; }

    setItemsIngreso(prev => prev.map(item => {
      if (item.id !== editingItem.id) return item;
      return {
        ...item,
        numeroLote: editNumeroLote.trim(),
        cantidad: Number(editQuantity),
        precioCompraUnitario: Number(editPrecio).toFixed(2),
        precioVentaUnitario: Number(editPrecioVenta).toFixed(2),
        precioVentaMinimoUnitario: Number(editPrecioVentaMinimo).toFixed(2),
        nuevoUmbral: showEditUmbralItem ? editUmbralItem : item.nuevoUmbral, // ← AQUÍ
        stockRestanteLote: Number(editQuantity),
        subtotal: (Number(editQuantity) * Number(editPrecio)).toFixed(2),
      };
    }));
    setShowEditItemModal(false);
  };

  const removeItem = (index) => {
    if (window.confirm('¿Eliminar este lote?')) {
      setItemsIngreso(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Editar lote EXISTENTE (ya en Firestore)
  const handleEditLoteExistente = async (lote) => {  // ← agregar async
    setEditingLote(lote);
    setEditLoteQuantity(Number(lote.cantidad));
    setEditLotePrecio(Number(lote.precioCompraUnitario));
    setEditLoteNumero(lote.numeroLote);
    setEditLotePrecioVenta(Number(lote.precioVentaUnitario || 0));
    setEditLotePrecioVentaMinimo(Number(lote.precioVentaMinimoUnitario || 0));
    setShowUmbralEditLote(false);
    setLotesAnterioresEdit([]);
    obtenerLotesAnteriores(lote.productoId).then(lotes => setLotesAnterioresEdit(lotes));

    // ← NUEVO: leer umbral real desde Firestore en lugar de hardcodear 0
    try {
      const prodSnap = await getDoc(doc(db, 'productos', lote.productoId));
      if (prodSnap.exists()) {
        setNuevoUmbralLote(prodSnap.data().stockReferencialUmbral ?? 0);
      }
    } catch (err) {
      console.error('Error leyendo umbral:', err);
      setNuevoUmbralLote(0);
    }

    setShowEditLoteModal(true);
  };

  const handleUpdateLoteExistente = async () => {
    if (!editingLote) return;
    const loteExists = [
      ...lotesExistentes.filter(l => l.id !== editingLote.id).map(l => l.numeroLote),
      ...itemsIngreso.map(i => i.numeroLote)
    ].includes(editLoteNumero.trim());
    if (loteExists) { alert('Número de lote duplicado.'); return; }
    if (!editLoteNumero.trim()) { alert('Ingrese número de lote.'); return; }
    if (editLoteQuantity <= 0) { alert('Cantidad debe ser mayor a 0.'); return; }

    try {
      const updatePayload = {
        numeroLote: editLoteNumero.trim(),
        cantidad: Number(editLoteQuantity),
        cantidadInicial: Number(editLoteQuantity),
        stockRestante: Number(editLoteQuantity),
        precioCompraUnitario: Number(editLotePrecio),
        precioVentaUnitario: Number(editLotePrecioVenta),
        precioVentaMinimoUnitario: Number(editLotePrecioVentaMinimo),
        subtotal: Number(editLoteQuantity) * Number(editLotePrecio),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'ingresos', id, 'lotes', editingLote.id), updatePayload);

      const lotePrincipalSnap = await getDocs(
        query(collection(db, 'lotes'), where('ingresoId', '==', id), where('numeroLote', '==', editingLote.numeroLote), limit(1))
      );
      if (!lotePrincipalSnap.empty) {
        await updateDoc(doc(db, 'lotes', lotePrincipalSnap.docs[0].id), updatePayload);
      }

      // Actualizar umbral si fue editado
      if (showUmbralEditLote && nuevoUmbralLote >= 0) {
        await updateDoc(doc(db, 'productos', editingLote.productoId), {
          stockReferencialUmbral: nuevoUmbralLote,
          updatedAt: serverTimestamp(),
        });
      }

      setLotesExistentes(prev => prev.map(l => {
        if (l.id !== editingLote.id) return l;
        return {
          ...l,
          numeroLote: editLoteNumero.trim(),
          cantidad: Number(editLoteQuantity),
          precioCompraUnitario: Number(editLotePrecio),
          precioVentaUnitario: Number(editLotePrecioVenta),
          precioVentaMinimoUnitario: Number(editLotePrecioVentaMinimo),
          subtotal: Number(editLoteQuantity) * Number(editLotePrecio),
        };
      }));
      setShowEditLoteModal(false);
    } catch (err) {
      setError('Error al actualizar lote: ' + err.message);
    }
  };

  const handleRemoveLoteExistente = async (lote) => {
    if (!window.confirm('¿Eliminar este lote existente? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDoc(doc(db, 'ingresos', id, 'lotes', lote.id));
      const lotePrincipalSnap = await getDocs(
        query(collection(db, 'lotes'), where('ingresoId', '==', id), where('numeroLote', '==', lote.numeroLote), limit(1))
      );
      if (!lotePrincipalSnap.empty) {
        await deleteDoc(doc(db, 'lotes', lotePrincipalSnap.docs[0].id));
      }
      setLotesExistentes(prev => prev.filter(l => l.id !== lote.id));
    } catch (err) {
      setError('Error al eliminar lote: ' + err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const proveedorSeleccionado = proveedores.find(p => p.id === proveedorId);
    if (!proveedorSeleccionado) { setError('Seleccione un proveedor.'); setSaving(false); return; }

    try {
      const fechaActual = new Date();

      const updateData = {
        numeroBoleta: numeroBoleta.trim() || null,
        numeroPedido: numeroPedido.trim() || null,
        observaciones: observaciones.trim() || null,
        proveedorId,
        proveedorNombre: proveedorSeleccionado.nombreEmpresa,
        updatedAt: serverTimestamp(),
      };

      if (fechaRecepcion) {
        const fecha = new Date(fechaRecepcion);
        fecha.setHours(12, 0, 0, 0);
        updateData.fechaRecepcion = fecha;
      }

      await updateDoc(doc(db, 'ingresos', id), updateData);

      if (itemsIngreso.length > 0) {
        for (const item of itemsIngreso) {
          await addDoc(collection(db, 'ingresos', id, 'lotes'), {
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
            proveedorId,
            proveedorNombre: proveedorSeleccionado.nombreEmpresa,
            fechaIngreso: serverTimestamp(),
            fechaVencimiento: item.fechaVencimiento || null,
            estado: 'activo',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          await addDoc(collection(db, 'lotes'), {
            ingresoId: id,
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
            precioVentaUnitario: parseFloat(item.precioVentaUnitario),
            precioVentaMinimoUnitario: parseFloat(item.precioVentaMinimoUnitario),
            subtotal: parseFloat(item.subtotal),
            proveedorId,
            proveedorNombre: proveedorSeleccionado.nombreEmpresa,
            fechaIngreso: serverTimestamp(),
            fechaVencimiento: item.fechaVencimiento || null,
            estado: 'activo',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (item.nuevoUmbral !== null && item.nuevoUmbral !== undefined) {
            await updateDoc(doc(db, 'productos', item.productoId), {
              stockReferencialUmbral: item.nuevoUmbral,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      const todosLotes = [
        ...lotesExistentes,
        ...itemsIngreso.map(i => ({ subtotal: parseFloat(i.subtotal), cantidad: parseFloat(i.cantidad) }))
      ];
      const costoTotal = todosLotes.reduce((sum, l) => sum + parseFloat(l.subtotal || 0), 0);
      const totalStock = todosLotes.reduce((sum, l) => sum + parseFloat(l.cantidad || 0), 0);
      const cantidadLotes = todosLotes.length;

      await updateDoc(doc(db, 'ingresos', id), {
        costoTotalIngreso: parseFloat(costoTotal.toFixed(2)),
        totalStockIngresado: totalStock,
        cantidadLotes,
        updatedAt: serverTimestamp(),
      });

      alert('Ingreso actualizado exitosamente.');
      router.push(`/inventario/ingresos/${id}`);
    } catch (err) {
      setError('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const DatePickerPopover = ({ selected, onChange, placeholder, minDate }) => {
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(selected || new Date());
    const ref = useRef(null);

    useEffect(() => {
      const handler = (e) => {
        if (ref.current && !ref.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);

    const prevMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    const nextMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));

    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - 1 + i);

    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
        >
          <CalendarIcon className="h-4 w-4 text-gray-400" />
          {selected
            ? format(selected, 'dd/MM/yyyy', { locale: es })
            : <span className="text-gray-400">{placeholder}</span>
          }
        </button>

        {open && (
          <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl">
            <div className="flex items-center justify-between px-3 pt-3 pb-1 gap-2">
              <button type="button" onClick={prevMonth}
                className="flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700 shrink-0">
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1">
                <select value={month.getMonth()}
                  onChange={(e) => setMonth(m => new Date(m.getFullYear(), parseInt(e.target.value), 1))}
                  className="text-sm font-semibold text-gray-800 bg-transparent border-none outline-none cursor-pointer rounded px-1 py-0.5">
                  {meses.map((mes, i) => <option key={i} value={i}>{mes}</option>)}
                </select>
                <select value={month.getFullYear()}
                  onChange={(e) => setMonth(m => new Date(parseInt(e.target.value), m.getMonth(), 1))}
                  className="text-sm font-semibold text-gray-800 bg-transparent border-none outline-none cursor-pointer rounded px-1 py-0.5">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button type="button" onClick={nextMonth}
                className="flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700 shrink-0">
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <Calendar
              mode="single"
              selected={selected}
              month={month}
              onMonthChange={setMonth}
              onSelect={(date) => { if (date) { onChange(date); setOpen(false); } }}
              disabled={minDate ? { before: minDate } : undefined}
              captionLayout="label"
              classNames={{ month_caption: "hidden", nav: "hidden" }}
            />
          </div>
        )}
      </div>
    );
  };

  const todosLosLotes = [...lotesExistentes, ...itemsIngreso];
  const totalGeneral = todosLosLotes.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0).toFixed(2);

  if (!router.isReady || !user || loadingData) {
    return (
      <Layout title="Cargando Ingreso">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Editar Ingreso">
      <div className="max-w-full">
        {error && (
          <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 max-w-md">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-6 p-6">

            {/* Panel Izquierdo */}
            <div className="col-span-12 lg:col-span-4">
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">Editar Ingreso</h2>
                  <button
                    onClick={() => router.push('/inventario/ingresos')}
                    className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <ArrowLeftIcon className="h-4 w-4 mr-1" />
                    Volver
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Número de Boleta / Factura
                    </label>
                    <input
                      type="text"
                      value={numeroBoleta}
                      onChange={(e) => setNumeroBoleta(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: B-00001"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Número de Pedido (Opcional)
                    </label>
                    <input
                      type="text"
                      value={numeroPedido}
                      onChange={(e) => setNumeroPedido(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                      placeholder="N°-0000001"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha de Recepción
                    </label>
                    <p className="text-xs text-gray-500 mb-2">Fecha física de llegada de mercadería.</p>
                    <DatePickerPopover
                      selected={fechaRecepcion}
                      onChange={(date) => setFechaRecepcion(date)}
                      placeholder="Seleccionar fecha"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Proveedor
                    </label>
                    <select
                      value={proveedorId}
                      onChange={(e) => setProveedorId(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Seleccione un proveedor</option>
                      {proveedores.map((prov) => (
                        <option key={prov.id} value={prov.id}>{prov.nombreEmpresa}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Observaciones (Opcional)
                    </label>
                    <textarea
                      rows="3"
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Notas adicionales..."
                    />
                  </div>

                  {/* Resumen */}
                  <div className="border-t border-gray-200 pt-4">
                    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Total de Lotes:</span>
                        <span className="text-base font-semibold text-gray-900">{todosLosLotes.length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Lotes existentes:</span>
                        <span className="text-sm text-gray-600">{lotesExistentes.length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Lotes nuevos:</span>
                        <span className="text-sm text-blue-600 font-medium">{itemsIngreso.length}</span>
                      </div>
                      <div className="flex justify-between items-center border-t pt-2">
                        <span className="text-sm font-medium text-gray-700">Total:</span>
                        <span className="text-lg font-bold text-gray-900">S/. {totalGeneral}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={saving || !proveedorId}
                      className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent text-base font-semibold rounded-lg shadow-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                          Guardando...
                        </>
                      ) : (
                        <>
                          <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                          Guardar Cambios
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Panel Derecho */}
            <div className="col-span-12 lg:col-span-8">

              {/* Buscador — igual al nuevo.js */}
              <div className="bg-white border border-gray-200 rounded-lg mb-6 relative">
                <div className="p-4">
                  <h2 className="text-lg font-semibold mb-4 text-gray-800">Agregar Nuevo Lote</h2>
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
                    {searchTerm.trim() === '' ? 'Escribe para buscar productos...' : `${filteredProductos.length} productos encontrados`}
                  </div>
                </div>

                {/* Dropdown igual al nuevo.js */}
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
                            className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                            onClick={() => handleSelectProduct(producto)}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex flex-col gap-1 flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-900 text-sm">{producto.nombre}</h4>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                                  {producto.codigoTienda && (
                                    <span>C.Tienda: <span className="font-mono font-semibold text-gray-700">{producto.codigoTienda}</span></span>
                                  )}
                                  {producto.codigoProveedor && (
                                    <span className="text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">
                                      C.Prov: <span className="font-mono">{producto.codigoProveedor}</span>
                                    </span>
                                  )}
                                  {producto.marca && (
                                    <span>Marca: <span className="font-semibold text-gray-700">{producto.marca}</span></span>
                                  )}
                                  {producto.medida && (
                                    <span>Medida: <span className="font-semibold text-gray-700">{producto.medida}</span></span>
                                  )}
                                  <span>Stock: <span className="font-bold text-gray-900">{producto.stockActual || 0}</span></span>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-bold text-blue-600 text-base">S/. {parseFloat(producto.precioCompraDefault || 0).toFixed(2)}</p>
                                <p className="text-xs text-gray-500 uppercase tracking-wide">Precio Compra</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tabla de lotes */}
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                    <HashtagIcon className="h-6 w-6 mr-2 text-blue-600" />
                    Lotes del Ingreso
                  </h3>
                </div>

                <div className="p-4">
                  {todosLosLotes.length === 0 ? (
                    <div className="text-center py-12">
                      <HashtagIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                      <h4 className="text-lg font-medium text-gray-600 mb-2">No hay lotes</h4>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead className="bg-blue-50">
                            <tr className="border-b border-gray-300">
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">ESTADO</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">C. TIENDA</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">PRODUCTO</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">LOTE</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">MARCA</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">CANT.</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">P. COMPRA</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">SUBTOTAL</th>
                              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">ACCIONES</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lotesExistentes.map((lote, index) => (
                              <tr key={lote.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-3 py-3 text-center">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                    Guardado
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-center text-sm text-gray-900 font-medium">{lote.codigoTienda || 'N/A'}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 font-medium">{lote.nombreProducto || 'N/A'}</td>
                                <td className="px-3 py-3 text-center">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {lote.numeroLote}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-900">{lote.marca || 'N/A'}</td>
                                <td className="px-3 py-3 text-center text-sm font-medium text-gray-900">{lote.cantidad}</td>
                                <td className="px-3 py-3 text-center text-sm font-medium text-gray-900">
                                  S/. {parseFloat(lote.precioCompraUnitario || 0).toFixed(2)}
                                </td>
                                <td className="px-3 py-3 text-center text-sm font-semibold text-gray-900">
                                  S/. {parseFloat(lote.subtotal || 0).toFixed(2)}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <div className="flex justify-center space-x-2">
                                    <button onClick={() => handleEditLoteExistente(lote)}
                                      className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50">
                                      <PencilIcon className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => handleRemoveLoteExistente(lote)}
                                      className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50">
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {itemsIngreso.map((item, index) => (
                              <tr key={item.id} className="bg-blue-50">
                                <td className="px-3 py-3 text-center">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                    Nuevo
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-center text-sm text-gray-900 font-medium">{item.codigoTienda || 'N/A'}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 font-medium">{item.nombreProducto || 'N/A'}</td>
                                <td className="px-3 py-3 text-center">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    {item.numeroLote}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-900">{item.marca || 'N/A'}</td>
                                <td className="px-3 py-3 text-center text-sm font-medium text-gray-900">{item.cantidad}</td>
                                <td className="px-3 py-3 text-center text-sm font-medium text-gray-900">
                                  S/. {parseFloat(item.precioCompraUnitario || 0).toFixed(2)}
                                </td>
                                <td className="px-3 py-3 text-center text-sm font-semibold text-gray-900">
                                  S/. {parseFloat(item.subtotal || 0).toFixed(2)}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <div className="flex justify-center space-x-2">
                                    <button onClick={() => handleEditItem(item)}
                                      className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50">
                                      <PencilIcon className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => removeItem(index)}
                                      className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50">
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 border-t border-gray-300">
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="text-lg font-semibold">Total del Ingreso</h3>
                            <p className="text-blue-100 text-sm">{todosLosLotes.length} lote{todosLosLotes.length !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="text-3xl font-bold">S/. {totalGeneral}</div>
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

      {/* ===================== MODAL AGREGAR NUEVO LOTE — igual al nuevo.js ===================== */}
      {showQuantityModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowQuantityModal(false)}></div>
            <div className="relative bg-white rounded-xl shadow-xl w-[95vw] max-w-7xl p-10">

              <button type="button" onClick={() => setShowQuantityModal(false)}
                className="absolute right-4 top-4 rounded-md text-gray-400 hover:text-gray-500">
                <XMarkIcon className="h-6 w-6" />
              </button>

              <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <HashtagIcon className="h-7 w-7 text-blue-600" />
                Crear Nuevo Lote
              </h3>

              {selectedProduct && (
                <div className="grid grid-cols-2 gap-8 items-stretch">

                  {/* COLUMNA IZQUIERDA */}
                  <div className="flex flex-col gap-4 h-full">
                    <div className="bg-gray-50 p-5 rounded-lg border-2 border-blue-200">
                      <h4 className="font-bold text-xl text-gray-900 mb-1">{selectedProduct.nombre}</h4>
                      {selectedProduct.codigoProveedor && (
                        <div className="mb-3">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold bg-blue-100 text-blue-800 font-mono">
                            C. Proveedor: {selectedProduct.codigoProveedor}
                          </span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="font-medium text-gray-600">C. Tienda: </span><span className="text-gray-800">{selectedProduct.codigoTienda || 'N/A'}</span></div>
                        <div><span className="font-medium text-gray-600">Marca: </span><span className="text-gray-800">{selectedProduct.marca || 'Sin marca'}</span></div>
                        <div><span className="font-medium text-gray-600">Medida: </span><span className="text-gray-800">{selectedProduct.medida || 'N/A'}</span></div>
                        <div><span className="font-medium text-gray-600">Color: </span><span className="text-gray-800">{selectedProduct.color || 'N/A'}</span></div>
                        <div><span className="font-medium text-gray-600">Stock actual: </span><span className="font-bold text-gray-900">{selectedProduct.stockActual || 0}</span></div>
                        <div><span className="font-medium text-gray-600">ID: </span><span className="text-gray-400 text-xs font-mono">{selectedProduct.id}</span></div>
                      </div>
                    </div>

                    {lotesAnteriores.length > 0 ? (
                      <div className="border border-amber-200 rounded-lg overflow-hidden flex-1">
                        <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Lotes anteriores de este producto</span>
                        </div>
                        <div className="divide-y divide-amber-100 overflow-y-auto max-h-64">
                          {lotesAnteriores.map((lote, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-3">
                              <div>
                                <span className="text-sm font-mono text-gray-700">{lote.numeroLote}</span>
                                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${lote.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {lote.estado}
                                </span>
                                {/* Stock del lote */}
                                <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                  lote.stockRestante <= 0 
                                    ? 'bg-red-100 text-red-700' 
                                    : lote.stockRestante <= 5 
                                      ? 'bg-amber-100 text-amber-700' 
                                      : 'bg-blue-100 text-blue-700'
                                }`}>
                                  Stock: {lote.stockRestante}
                                </span>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {lote.fecha ? lote.fecha.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                                </p>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-amber-800">C: S/. {lote.precio.toFixed(2)}</div>
                                {lote.precioVenta > 0 && (
                                  <div className="text-sm font-semibold text-green-700">V: S/. {lote.precioVenta.toFixed(2)}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 border border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                        Sin lotes anteriores
                      </div>
                    )}

                    {/* Umbral */}
                    <div>
                      {!showUmbralEdit ? (
                        <button type="button" onClick={() => setShowUmbralEdit(true)}
                          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                          ✏️ Editar stock mínimo
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                          <label className="text-sm font-medium text-blue-700 whitespace-nowrap">
                            Stock mínimo (actual: {nuevoUmbralLote}):
                          </label>
                          <input type="number" value={nuevoUmbral} onChange={(e) => setNuevoUmbral(parseInt(e.target.value) || 0)}
                            min="0" onWheel={(e) => e.target.blur()}
                            className="w-24 px-2 py-1 border border-blue-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500" />
                          <button type="button" onClick={() => setShowUmbralEdit(false)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* COLUMNA DERECHA */}
                  <div className="flex flex-col gap-5 h-full">
                    {/* Número de lote */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <HashtagIcon className="h-4 w-4 inline mr-1" />
                        Número de Lote
                      </label>
                      <div className="flex">
                        <input type="text" value={numeroLote} onChange={(e) => setNumeroLote(e.target.value)}
                          className="flex-1 px-4 py-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 text-base font-mono"
                          placeholder="Ej: L240915-ABC1" />
                        <button type="button" onClick={() => setNumeroLote(generateLoteNumber())}
                          className="px-4 py-3 bg-blue-100 border border-l-0 border-gray-300 rounded-r-lg hover:bg-blue-200 text-base">
                          🎲
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Se genera automáticamente pero puedes cambiarlo.</p>
                    </div>

                    {/* 4 campos 2x2 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad</label>
                        <input type="number" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                          min="1" onWheel={(e) => e.target.blur()}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Compra (S/.)</label>
                        <input type="number" value={precioCompra} onChange={(e) => setPrecioCompra(parseFloat(e.target.value) || 0)}
                          min="0" step="0.01" onWheel={(e) => e.target.blur()}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Venta (S/.)</label>
                        <input type="number" value={precioVenta} onChange={(e) => setPrecioVenta(parseFloat(e.target.value) || 0)}
                          min="0" step="0.01" onWheel={(e) => e.target.blur()}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Precio Venta Mínimo (S/.)</label>
                        <input type="number" value={precioVentaMinimo} onChange={(e) => setPrecioVentaMinimo(parseFloat(e.target.value) || 0)}
                          min="0" step="0.01" onWheel={(e) => e.target.blur()}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base" />
                      </div>
                    </div>

                    {/* Subtotal + botones al fondo */}
                    <div className="mt-auto flex flex-col gap-4">
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-5 rounded-lg border border-blue-200">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-medium text-gray-700">Subtotal del Lote:</span>
                          <span className="font-bold text-blue-800 text-2xl">S/. {(quantity * precioCompra).toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setShowQuantityModal(false)}
                          className="px-6 py-3 rounded-lg bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-semibold text-base">
                          Cancelar
                        </button>
                        <button type="button" onClick={handleAddProductToIngreso}
                          disabled={quantity <= 0 || precioCompra < 0 || !numeroLote.trim()}
                          className="px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold text-base hover:bg-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                          Agregar Lote
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL EDITAR LOTE NUEVO (pendiente) ===================== */}
      {showEditItemModal && editingItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowEditItemModal(false)}></div>
            <div className="relative bg-white rounded-xl shadow-xl w-[95vw] max-w-7xl p-10">

              <button type="button" onClick={() => setShowEditItemModal(false)}
                className="absolute right-4 top-4 rounded-md text-gray-400 hover:text-gray-500">
                <XMarkIcon className="h-6 w-6" />
              </button>

              <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <PencilIcon className="h-7 w-7 text-yellow-500" />
                Editar Lote Nuevo
              </h3>

              <div className="grid grid-cols-2 gap-8 items-stretch">

                {/* COLUMNA IZQUIERDA */}
                <div className="flex flex-col gap-4 h-full">
                  <div className="bg-gray-50 p-5 rounded-lg border-2 border-yellow-200">
                    <h4 className="font-bold text-xl text-gray-900 mb-1">{editingItem.nombreProducto}</h4>
                    {editingItem.codigoProveedor && (
                      <div className="mb-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold bg-blue-100 text-blue-800 font-mono">
                          C. Proveedor: {editingItem.codigoProveedor}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="font-medium text-gray-600">C. Tienda: </span><span className="text-gray-800">{editingItem.codigoTienda || 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-600">Marca: </span><span className="text-gray-800">{editingItem.marca || 'Sin marca'}</span></div>
                      <div><span className="font-medium text-gray-600">Medida: </span><span className="text-gray-800">{editingItem.medida || 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-600">Color: </span><span className="text-gray-800">{editingItem.color || 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-600">Stock actual: </span><span className="font-bold text-gray-900">{editingItem.stockActual ?? 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-600">ID: </span><span className="text-gray-400 text-xs font-mono">{editingItem.productoId}</span></div>
                    </div>
                  </div>

                  {editLotesAnteriores.length > 0 ? (
                    <div className="border border-amber-200 rounded-lg overflow-hidden flex-1">
                      <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Lotes anteriores de este producto</span>
                      </div>
                      <div className="divide-y divide-amber-100 overflow-y-auto max-h-64">
                        {editLotesAnteriores.map((lote, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <span className="text-sm font-mono text-gray-700">{lote.numeroLote}</span>
                              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${lote.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {lote.estado}
                              </span>
                              {/* Stock del lote */}
                              <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                lote.stockRestante <= 0 
                                  ? 'bg-red-100 text-red-700' 
                                  : lote.stockRestante <= 5 
                                    ? 'bg-amber-100 text-amber-700' 
                                    : 'bg-blue-100 text-blue-700'
                              }`}>
                                Stock: {lote.stockRestante}
                              </span>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {lote.fecha ? lote.fecha.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-amber-800">C: S/. {lote.precio.toFixed(2)}</div>
                              {lote.precioVenta > 0 && (
                                <div className="text-sm font-semibold text-green-700">V: S/. {lote.precioVenta.toFixed(2)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 border border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                      Sin lotes anteriores
                    </div>
                  )}
                </div>

                {/* COLUMNA DERECHA */}
                <div className="flex flex-col gap-5 h-full">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <HashtagIcon className="h-4 w-4 inline mr-1" />
                      Número de Lote
                    </label>
                    <div className="flex">
                      <input type="text" value={editNumeroLote} onChange={(e) => setEditNumeroLote(e.target.value)}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-yellow-500 text-base font-mono"
                        placeholder="Ej: L240915-ABC1" />
                      <button type="button" onClick={() => setEditNumeroLote(generateLoteNumber())}
                        className="px-4 py-3 bg-yellow-100 border border-l-0 border-gray-300 rounded-r-lg hover:bg-yellow-200 text-base">
                        🎲
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Debe ser único entre todos los lotes del ingreso.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad</label>
                      <input type="number" value={editQuantity} onChange={(e) => setEditQuantity(parseInt(e.target.value) || 1)}
                        min="1" onWheel={(e) => e.target.blur()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 text-base" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Compra (S/.)</label>
                      <input type="number" value={editPrecio} onChange={(e) => setEditPrecio(parseFloat(e.target.value) || 0)}
                        min="0" step="0.01" onWheel={(e) => e.target.blur()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 text-base" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Venta (S/.)</label>
                      <input type="number" value={editPrecioVenta} onChange={(e) => setEditPrecioVenta(parseFloat(e.target.value) || 0)}
                        min="0" step="0.01" onWheel={(e) => e.target.blur()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 text-base" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Precio Venta Mínimo (S/.)</label>
                      <input type="number" value={editPrecioVentaMinimo} onChange={(e) => setEditPrecioVentaMinimo(parseFloat(e.target.value) || 0)}
                        min="0" step="0.01" onWheel={(e) => e.target.blur()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 text-base" />
                    </div>
                  </div>

                  <div className="mt-auto flex flex-col gap-4">
                    <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-5 rounded-lg border border-yellow-200">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-gray-700">Nuevo Subtotal:</span>
                        <span className="font-bold text-yellow-800 text-2xl">S/. {(editQuantity * editPrecio).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => setShowEditItemModal(false)}
                        className="px-6 py-3 rounded-lg bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-semibold text-base">
                        Cancelar
                      </button>
                      <button type="button" onClick={handleUpdateItem}
                        disabled={editQuantity <= 0 || editPrecio < 0 || !editNumeroLote.trim()}
                        className="px-6 py-3 rounded-lg bg-yellow-500 text-white font-semibold text-base hover:bg-yellow-400 disabled:bg-gray-400 disabled:cursor-not-allowed">
                        Actualizar Lote
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL EDITAR LOTE EXISTENTE — layout grande igual al de crear lote ===================== */}
      {showEditLoteModal && editingLote && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowEditLoteModal(false)}></div>
            <div className="relative bg-white rounded-xl shadow-xl w-[95vw] max-w-7xl p-10">

              <button type="button" onClick={() => setShowEditLoteModal(false)}
                className="absolute right-4 top-4 rounded-md text-gray-400 hover:text-gray-500">
                <XMarkIcon className="h-6 w-6" />
              </button>

              <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <PencilIcon className="h-7 w-7 text-blue-600" />
                Editar Lote Existente
              </h3>

              <div className="grid grid-cols-2 gap-8 items-stretch">

                {/* COLUMNA IZQUIERDA */}
                <div className="flex flex-col gap-4 h-full">
                  <div className="bg-gray-50 p-5 rounded-lg border-2 border-blue-200">
                    <h4 className="font-bold text-xl text-gray-900 mb-1">{editingLote.nombreProducto}</h4>
                    {editingLote.codigoProveedor && (
                      <div className="mb-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold bg-blue-100 text-blue-800 font-mono">
                          C. Proveedor: {editingLote.codigoProveedor}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="font-medium text-gray-600">C. Tienda: </span><span className="text-gray-800">{editingLote.codigoTienda || 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-600">Marca: </span><span className="text-gray-800">{editingLote.marca || 'Sin marca'}</span></div>
                      <div><span className="font-medium text-gray-600">Medida: </span><span className="text-gray-800">{editingLote.medida || 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-600">Color: </span><span className="text-gray-800">{editingLote.color || 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-600">Lote actual: </span><span className="font-bold text-blue-700 font-mono">{editingLote.numeroLote}</span></div>
                      <div><span className="font-medium text-gray-600">Estado: </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${editingLote.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {editingLote.estado || 'activo'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {lotesAnterioresEdit.length > 0 ? (
                    <div className="border border-amber-200 rounded-lg overflow-hidden flex-1">
                      <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Lotes anteriores de este producto</span>
                      </div>
                      <div className="divide-y divide-amber-100 overflow-y-auto max-h-64">
                        {lotesAnterioresEdit.map((lote, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <span className="text-sm font-mono text-gray-700">{lote.numeroLote}</span>
                              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${lote.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {lote.estado}
                              </span>
                              {/* Stock del lote */}
                              <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                lote.stockRestante <= 0 
                                  ? 'bg-red-100 text-red-700' 
                                  : lote.stockRestante <= 5 
                                    ? 'bg-amber-100 text-amber-700' 
                                    : 'bg-blue-100 text-blue-700'
                              }`}>
                                Stock: {lote.stockRestante}
                              </span>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {lote.fecha ? lote.fecha.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-amber-800">C: S/. {lote.precio.toFixed(2)}</div>
                              {lote.precioVenta > 0 && (
                                <div className="text-sm font-semibold text-green-700">V: S/. {lote.precioVenta.toFixed(2)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 border border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                      Sin lotes anteriores
                    </div>
                  )}

                  {/* Umbral */}
                  <div>
                    {!showEditUmbralItem ? (
                      <button type="button" onClick={() => setShowEditUmbralItem(true)}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                        ✏️ Editar stock mínimo
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                        <label className="text-sm font-medium text-blue-700 whitespace-nowrap">Stock mínimo:</label>
                        <input type="number" value={editUmbralItem} onChange={(e) => setEditUmbralItem(parseInt(e.target.value) || 0)}
                          min="0" onWheel={(e) => e.target.blur()}
                          className="w-24 px-2 py-1 border border-blue-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500" />
                        <button type="button" onClick={() => setShowEditUmbralItem(false)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* COLUMNA DERECHA */}
                <div className="flex flex-col gap-5 h-full">
                  {/* Número de lote */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <HashtagIcon className="h-4 w-4 inline mr-1" />
                      Número de Lote
                    </label>
                    <div className="flex">
                      <input type="text" value={editLoteNumero} onChange={(e) => setEditLoteNumero(e.target.value)}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 text-base font-mono"
                        placeholder="Ej: L240915-ABC1" />
                      <button type="button" onClick={() => setEditLoteNumero(generateLoteNumber())}
                        className="px-4 py-3 bg-blue-100 border border-l-0 border-gray-300 rounded-r-lg hover:bg-blue-200 text-base">
                        🎲
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Debe ser único entre todos los lotes del ingreso.</p>
                  </div>

                  {/* 4 campos 2x2 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad</label>
                      <input type="number" value={editLoteQuantity} onChange={(e) => setEditLoteQuantity(parseInt(e.target.value) || 1)}
                        min="1" onWheel={(e) => e.target.blur()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Compra (S/.)</label>
                      <input type="number" value={editLotePrecio} onChange={(e) => setEditLotePrecio(parseFloat(e.target.value) || 0)}
                        min="0" step="0.01" onWheel={(e) => e.target.blur()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Precio de Venta (S/.)</label>
                      <input type="number" value={editLotePrecioVenta} onChange={(e) => setEditLotePrecioVenta(parseFloat(e.target.value) || 0)}
                        min="0" step="0.01" onWheel={(e) => e.target.blur()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Precio Venta Mínimo (S/.)</label>
                      <input type="number" value={editLotePrecioVentaMinimo} onChange={(e) => setEditLotePrecioVentaMinimo(parseFloat(e.target.value) || 0)}
                        min="0" step="0.01" onWheel={(e) => e.target.blur()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base" />
                    </div>
                  </div>

                  {/* Subtotal + botones al fondo */}
                  <div className="mt-auto flex flex-col gap-4">
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-5 rounded-lg border border-blue-200">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-gray-700">Subtotal del Lote:</span>
                        <span className="font-bold text-blue-800 text-2xl">S/. {(editLoteQuantity * editLotePrecio).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => setShowEditLoteModal(false)}
                        className="px-6 py-3 rounded-lg bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 font-semibold text-base">
                        Cancelar
                      </button>
                      <button type="button" onClick={handleUpdateLoteExistente}
                        disabled={editLoteQuantity <= 0 || editLotePrecio < 0 || !editLoteNumero.trim()}
                        className="px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold text-base hover:bg-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                        Guardar Cambios
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default EditarIngresoPage;