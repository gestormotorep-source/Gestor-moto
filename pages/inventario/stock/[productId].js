// pages/inventario/stock/[productId].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../contexts/AuthContext';
import Layout from '../../../components/Layout';
import { db } from '../../../lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { CubeTransparentIcon, ArrowLeftIcon, CalendarDaysIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

const ProductLotesDetail = () => {
  const router = useRouter();
  const { productId } = router.query;
  const { user } = useAuth();

  const [product, setProduct] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProductAndLotes = async () => {
      if (!user) {
        router.push('/auth');
        return;
      }
      if (!productId) return;

      setLoading(true);
      setError(null);
      try {
        // 1. Obtener detalles del producto principal
        const productRef = doc(db, 'productos', productId);
        const productSnap = await getDoc(productRef);

        if (!productSnap.exists()) {
          setError("Producto no encontrado.");
          setLoading(false);
          return;
        }
        setProduct({ id: productSnap.id, ...productSnap.data() });

        // 2. Buscar ítems de ingreso (lotes) para este producto
        const allIngresosRefs = collection(db, 'ingresos');
        const querySnapshotIngresos = await getDocs(allIngresosRefs);

        const loadedLotes = [];
        // Almacenar los datos de ingresos en un mapa para acceso rápido por ID
        const ingresosMap = new Map();
        querySnapshotIngresos.docs.forEach(docIngreso => {
          ingresosMap.set(docIngreso.id, docIngreso.data());
        });

        for (const docIngreso of querySnapshotIngresos.docs) {
          const itemsIngresoCollectionRef = collection(db, 'ingresos', docIngreso.id, 'itemsIngreso');
          const qItemsIngreso = query(
            itemsIngresoCollectionRef,
            where('productoId', '==', productId)
          );
          const querySnapshotItemsIngreso = await getDocs(qItemsIngreso);

          querySnapshotItemsIngreso.docs.forEach(docItem => {
            const ingresoData = ingresosMap.get(docIngreso.id); // Obtener los datos del ingreso padre
            loadedLotes.push({
              id: docItem.id,
              lotePrincipalId: docIngreso.id,
              numeroBoleta: ingresoData?.numeroBoleta || 'N/A',
              // Almacena el timestamp original para ordenar
              fechaIngresoTimestamp: ingresoData?.fechaIngreso?.toMillis() || 0,
              // Formatea la fecha solo para la visualización
              fechaIngresoPrincipal: ingresoData?.fechaIngreso?.toDate().toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }) || 'N/A',
              observacionesLotePrincipal: ingresoData?.observaciones || 'Sin observaciones',
              ...docItem.data()
            });
          });
        }

        // Ordenar los lotes por la fecha de ingreso (usando el timestamp)
        loadedLotes.sort((a, b) => a.fechaIngresoTimestamp - b.fechaIngresoTimestamp);

        setLotes(loadedLotes);

      } catch (err) {
        console.error("Error al cargar detalles de producto y lotes:", err);
        setError("Error al cargar la información de los lotes. " + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProductAndLotes();
  }, [user, productId, router]);

  if (!user || loading) {
    return (
      <Layout title="Cargando Detalles del Lote">
        <div className="flex justify-center items-center h-screen">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Error">
        <div className="max-w-7xl mx-auto p-4 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
          <span className="block sm:inline font-medium">{error}</span>
          <Link href="/inventario/stock"
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Volver al Stock Actual
          </Link>
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout title="Producto No Encontrado">
        <div className="max-w-7xl mx-auto p-4 bg-white rounded-lg shadow-md">
          <p className="text-gray-600 text-lg">El producto solicitado no existe o fue eliminado.</p>
          <Link href="/inventario/stock"
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Volver al Stock Actual
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`Lotes de ${product.nombre}`}>
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-6 bg-white rounded-lg shadow-md flex flex-col">
          <div className="flex items-center mb-6">
            <Link href="/inventario/stock"
              className="inline-flex items-center p-2 mr-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition duration-150 ease-in-out" title="Volver al Stock Actual">
              <ArrowLeftIcon className="h-6 w-6" />
            </Link>
            <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
              <CubeTransparentIcon className="h-8 w-8 text-indigo-600 mr-3" />
              Lotes de: {product.nombre}
            </h1>
          </div>

          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Detalles del Producto</h2>
              <p className="text-sm text-gray-700"><span className="font-medium">Nombre:</span> {product.nombre || 'N/A'}</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Marca:</span> {product.marca || 'N/A'}</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Código Tienda:</span> {product.codigoTienda || 'N/A'}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Información de Inventario</h2>
              <p className="text-sm text-gray-700"><span className="font-medium">Stock Total:</span> <span className="font-bold text-lg text-indigo-700">{product.stockActual || 0} unidades</span></p>
              <p className="text-sm text-gray-700"><span className="font-medium">Umbral Mínimo:</span> {product.stockReferencialUmbral || 0}</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Ubicación:</span> {product.ubicacion || 'N/A'}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Precios</h2>
              <p className="text-sm text-gray-700"><span className="font-medium">Costo Promedio:</span> S/. {parseFloat(product.precioCompraDefault || 0).toFixed(2)}</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Precio Venta Sug.:</span> S/. {parseFloat(product.precioVentaDefault || 0).toFixed(2)}</p>
            </div>
          </div>

          <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center">
            <CalendarDaysIcon className="h-6 w-6 text-gray-600 mr-2" />
            Detalle de Lotes Individuales
          </h2>

          {lotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500 bg-gray-50 rounded-lg p-4 shadow-inner">
              <ArchiveBoxIcon className="h-20 w-20 text-gray-300 mb-4" />
              <p className="text-md font-medium">No se encontraron lotes registrados para este producto.</p>
              <p className="text-sm text-gray-400">Puede agregar lotes mediante la sección de "Ingresos".</p>
            </div>
          ) : (
            <div className="overflow-x-auto shadow-lg ring-1 ring-black ring-opacity-5 rounded-lg overflow-y-auto max-h-[60vh]">
              <table className="min-w-full border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-left">N° Boleta/Comprobante</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-left">Fecha Ingreso Lote</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-left">Cant. Inicial</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-left">Stock Actual Lote</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-left">Costo Unitario (S/.)</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-left">Lote Interno</th>
                    <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-left">Observaciones del Ingreso</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {lotes.map((lote, index) => (
                    <tr key={lote.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900 text-left">{lote.numeroBoleta || 'N/A'}</td>
                      <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-left">
                        {lote.fechaIngresoPrincipal || 'N/A'}
                      </td>
                      <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-left">{lote.cantidad || 0}</td>
                      <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-bold text-indigo-700 text-left">
                        {lote.stockRestanteLote || 0}
                      </td>
                      {/* Celdas con el estilo de celda deseado */}
                      <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-left">S/. {parseFloat(lote.precioCompraUnitario || 0).toFixed(2)}</td> {/* CORREGIDO AQUÍ */}
                      <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-left">{lote.lote || 'N/A'}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700 text-left">{lote.observacionesLotePrincipal || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ProductLotesDetail;