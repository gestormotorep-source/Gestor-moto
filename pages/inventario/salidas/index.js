// pages/inventario/salidas/index.js
import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import Layout from '../../../components/Layout';
import { db } from '../../../lib/firebase';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore'; // Importar doc y getDoc
import { MinusIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';

const SalidasPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [salidasDataRaw, setSalidasDataRaw] = useState([]); // Almacenará la data cruda de salidas, incluyendo subcolecciones
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayedItems, setDisplayedItems] = useState([]); // Estos son los ítems aplanados que se muestran en la tabla

  useEffect(() => {
    const fetchSalidas = async () => {
      if (!user) {
        router.push('/auth');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const salidasCollectionRef = collection(db, 'salidas');
        const qSalidas = query(salidasCollectionRef, orderBy('fechaSalida', 'desc'));
        const querySnapshotSalidas = await getDocs(qSalidas);

        const loadedSalidas = []; // Aquí guardaremos la estructura anidada de salida y sus items

        for (const docSalida of querySnapshotSalidas.docs) {
          const salidaData = {
            id: docSalida.id,
            ...docSalida.data(),
            // Formatear la fecha para la visualización, pero mantener la original para ordenar si es necesario
            fechaSalidaFormatted: docSalida.data().fechaSalida?.toDate().toLocaleDateString('es-ES', {
              year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            }) || 'N/A',
            items: []
          };

          // Obtener nombre del cliente
          if (salidaData.clienteId) {
            const clienteRef = doc(db, 'cliente', salidaData.clienteId);
            const clienteSnap = await getDoc(clienteRef);
            if (clienteSnap.exists()) {
              salidaData.nombreCliente = `${clienteSnap.data().nombre} ${clienteSnap.data().apellido || ''}`;
            } else {
              salidaData.nombreCliente = 'Cliente Desconocido';
            }
          } else {
            salidaData.nombreCliente = 'N/A';
          }


          const itemsSalidaCollectionRef = collection(db, 'salidas', docSalida.id, 'itemsSalida');
          const qItemsSalida = query(itemsSalidaCollectionRef, orderBy('nombreProducto', 'asc'));
          const querySnapshotItemsSalida = await getDocs(qItemsSalida);

          querySnapshotItemsSalida.docs.forEach(docItem => {
            const itemData = {
              id: docItem.id,
              ...docItem.data()
            };
            salidaData.items.push(itemData);
          });
          loadedSalidas.push(salidaData);
        }

        setSalidasDataRaw(loadedSalidas); // Guardar la data anidada
      } catch (err) {
        console.error("Error al cargar salidas:", err);
        setError("Error al cargar la información de salidas. Intente de nuevo.");
      } finally {
        setLoading(false);
      }
    };

    fetchSalidas();
    // Se ejecuta al montar el componente y cuando el usuario cambia.
    // Esto asegura que al volver de 'nueva.js', los datos se recarguen.
  }, [user, router]); // Mantener router aquí por si en el futuro se necesita router.query

  // useEffect para aplanar los datos y aplicar el filtro
  useEffect(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const flattenedAndFiltered = [];

    salidasDataRaw.forEach(salida => {
      salida.items.forEach(item => {
        // Crear un objeto aplanado para cada item, incluyendo datos de la salida principal
        const flattenedItem = {
          ...item,
          salidaPrincipalId: salida.id,
          salidaObservaciones: salida.observaciones || 'N/A',
          fechaSalidaPrincipal: salida.fechaSalidaFormatted,
          registradoPor: salida.empleadoId || 'Desconocido',
          nombreCliente: salida.nombreCliente, // Usamos el nombre del cliente ya resuelto
          tipoSalida: salida.tipoSalida,
          esCotizacion: salida.esCotizacion,
          // Extraer los lotes para mostrar en una cadena si existen
          lotesExtraidosString: item.lotesExtraidos && item.lotesExtraidos.length > 0
            ? item.lotesExtraidos.map(l => `${l.loteDocId.substring(0, 5)}... (${l.qty}u)`).join(', ')
            : 'N/A',
        };

        // Aplicar el filtro aquí
        const nombreProductoMatch = flattenedItem.nombreProducto && typeof flattenedItem.nombreProducto === 'string'
                                    ? flattenedItem.nombreProducto.toLowerCase().includes(lowerCaseSearchTerm)
                                    : false;

        const loteMatch = flattenedItem.lotesExtraidosString && typeof flattenedItem.lotesExtraidosString === 'string'
                          ? flattenedItem.lotesExtraidosString.toLowerCase().includes(lowerCaseSearchTerm)
                          : false;

        const observacionesMatch = flattenedItem.salidaObservaciones && typeof flattenedItem.salidaObservaciones === 'string'
                                   ? flattenedItem.salidaObservaciones.toLowerCase().includes(lowerCaseSearchTerm)
                                   : false;

        const clienteMatch = flattenedItem.nombreCliente && typeof flattenedItem.nombreCliente === 'string'
                             ? flattenedItem.nombreCliente.toLowerCase().includes(lowerCaseSearchTerm)
                             : false;

        if (nombreProductoMatch || loteMatch || observacionesMatch || clienteMatch) {
          flattenedAndFiltered.push(flattenedItem);
        }
      });
    });
    setDisplayedItems(flattenedAndFiltered);
  }, [searchTerm, salidasDataRaw]); // Este useEffect se dispara cuando el término de búsqueda cambia o la data raw cambia

  if (!user) {
    return null; // O un spinner/mensaje de carga de usuario
  }

  return (
    <Layout title="Registro de Salidas">
      <div className="max-w-7xl mx-auto p-4 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-gray-800 flex items-center">
          <DocumentTextIcon className="h-7 w-7 text-red-500 mr-2" />
          Registro de Salidas
        </h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <input
            type="text"
            placeholder="Buscar por producto, lote, cliente u observaciones..."
            className="w-full md:w-1/3 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button
            onClick={() => router.push('/inventario/salidas/nueva')}
            className="ml-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <MinusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Registrar Nueva Salida
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
          </div>
        ) : displayedItems.length === 0 ? (
          <p className="text-gray-500">No se encontraron registros de salidas.</p>
        ) : (
          <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Producto</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Cantidad</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Lote(s) Extraído(s)</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Precio Venta Unitario</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Fecha de Salida</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Cliente / Observaciones</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Tipo / Cotización</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Registrado Por</th>
                  {/* <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                    <span className="sr-only">Editar</span>
                  </th> */}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {displayedItems.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{item.nombreProducto}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{item.cantidad}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{item.lotesExtraidosString}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">S/. {parseFloat(item.precioVentaUnitario || 0).toFixed(2)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{item.fechaSalidaPrincipal}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{item.nombreCliente} / {item.salidaObservaciones}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{item.tipoSalida} / {item.esCotizacion ? 'Sí' : 'No'}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{item.registradoPor}</td>
                    {/* <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                      <a href="#" className="text-red-600 hover:text-red-900">Editar<span className="sr-only">, {item.nombreProducto}</span></a>
                    </td> */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SalidasPage;