// pages/inventario/ingresos/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../contexts/AuthContext';
import Layout from '../../../components/Layout';
import { db } from '../../../lib/firebase';
import { doc, getDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { 
  ArrowLeftIcon, 
  CubeTransparentIcon,
  ClipboardDocumentListIcon,
  BuildingOfficeIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
  HashtagIcon
} from '@heroicons/react/24/outline';

const IngresoDetailsPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();

  const [ingreso, setIngreso] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchIngresoDetails = async () => {
      if (!user) {
        router.push('/auth');
        return;
      }
      if (!id) return;

      setLoading(true);
      setError(null);
      try {
        // 1. Obtener el documento principal del ingreso
        const ingresoDocRef = doc(db, 'ingresos', id);
        const ingresoDocSnap = await getDoc(ingresoDocRef);

        if (!ingresoDocSnap.exists()) {
          setError('Boleta de ingreso no encontrada.');
          setLoading(false);
          return;
        }

        const ingresoData = {
          id: ingresoDocSnap.id,
          ...ingresoDocSnap.data(),
          fechaIngreso: ingresoDocSnap.data().fechaIngreso?.toDate().toLocaleDateString('es-ES', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
          }) || 'N/A',
        };
        setIngreso(ingresoData);

        // 2. Obtener los lotes de la subcolección 'lotes'
        const lotesCollectionRef = collection(db, 'ingresos', id, 'lotes');
        const qLotes = query(lotesCollectionRef, orderBy('nombreProducto', 'asc'));
        const querySnapshotLotes = await getDocs(qLotes);

        const loadedLotes = querySnapshotLotes.docs.map(docLote => ({
          id: docLote.id,
          ...docLote.data(),
        }));
        setLotes(loadedLotes);

      } catch (err) {
        console.error("Error al cargar detalles del ingreso:", err);
        setError("Error al cargar los detalles de la boleta de ingreso. Intente de nuevo.");
      } finally {
        setLoading(false);
      }
    };

    fetchIngresoDetails();
  }, [id, user, router]);

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <Layout title="Cargando Detalles de Ingreso">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Error al Cargar Ingreso">
        <div className="min-h-screen bg-gray-50 py-6">
          <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-12">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                <span className="block sm:inline">{error}</span>
              </div>
              <button
                onClick={() => router.push('/inventario/ingresos')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <ArrowLeftIcon className="-ml-1 mr-2 h-5 w-5" />
                Volver a Ingresos
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!ingreso) {
    return (
      <Layout title="Boleta No Encontrada">
        <div className="min-h-screen bg-gray-50 py-6">
          <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-12">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <p className="text-gray-600 mb-4">No se pudo cargar la boleta de ingreso.</p>
              <button
                onClick={() => router.push('/inventario/ingresos')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <ArrowLeftIcon className="-ml-1 mr-2 h-5 w-5" />
                Volver a Ingresos
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const getEstadoBadge = (estado) => {
    const estadoConfig = {
      'pendiente': { 
        bg: 'bg-yellow-100', 
        text: 'text-yellow-800', 
        label: 'Pendiente',
        border: 'border-yellow-200'
      },
      'recibido': { 
        bg: 'bg-green-100', 
        text: 'text-green-800', 
        label: 'Confirmado',
        border: 'border-green-200'
      },
      'cancelado': { 
        bg: 'bg-red-100', 
        text: 'text-red-800', 
        label: 'Cancelado',
        border: 'border-red-200'
      }
    };
    
    const config = estadoConfig[estado] || estadoConfig['pendiente'];
    
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.bg} ${config.text} ${config.border}`}>
        {config.label}
      </span>
    );
  };

  const totalCantidadLotes = lotes.reduce((sum, lote) => sum + (lote.cantidad || 0), 0);

  return (
    <Layout title={`Boleta ${ingreso.numeroBoleta || ingreso.id.substring(0, 8)}`}>
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-8">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <CubeTransparentIcon className="h-8 w-8 text-white mr-3" />
                  <div>
                    <h1 className="text-2xl font-bold text-white">
                      Boleta {ingreso.numeroBoleta || `#${ingreso.id.substring(0, 8)}`}
                    </h1>
                    <p className="text-blue-100 mt-1">
                      Detalles de la boleta de ingreso con lotes
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/inventario/ingresos')}
                  className="inline-flex items-center px-4 py-2 border border-blue-500 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-300 transition-colors"
                >
                  <ArrowLeftIcon className="-ml-1 mr-2 h-5 w-5" />
                  Volver a Boletas
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Información de la Boleta */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                
                {/* Información General */}
                <div className="lg:col-span-2">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <ClipboardDocumentListIcon className="h-5 w-5 text-blue-600 mr-2" />
                      Información General
                    </h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center">
                          <BuildingOfficeIcon className="h-4 w-4 text-gray-500 mr-2" />
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Proveedor</p>
                            <p className="text-sm font-medium text-gray-900">{ingreso.proveedorNombre || 'N/A'}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center">
                          <CalendarDaysIcon className="h-4 w-4 text-gray-500 mr-2" />
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha de Ingreso</p>
                            <p className="text-sm font-medium text-gray-900">{ingreso.fechaIngreso}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center">
                          <UserIcon className="h-4 w-4 text-gray-500 mr-2" />
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Registrado por</p>
                            <p className="text-sm font-medium text-gray-900">{ingreso.empleadoId || 'Desconocido'}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Estado</p>
                          {getEstadoBadge(ingreso.estado)}
                        </div>
                        
                        <div className="flex items-center">
                          <BanknotesIcon className="h-4 w-4 text-gray-500 mr-2" />
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Costo Total</p>
                            <p className="text-lg font-bold text-green-600">S/. {parseFloat(ingreso.costoTotalIngreso || 0).toFixed(2)}</p>
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total de Lotes</p>
                          <p className="text-sm font-medium text-gray-900">{lotes.length} lotes</p>
                        </div>
                        
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stock Total</p>
                          <p className="text-sm font-medium text-gray-900">{totalCantidadLotes} unidades</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Observaciones */}
                <div>
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-6 h-full">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <ChatBubbleLeftRightIcon className="h-5 w-5 text-gray-600 mr-2" />
                      Observaciones
                    </h3>
                    <div className="bg-white rounded-md p-4 border border-gray-200">
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {ingreso.observaciones || 'Sin observaciones registradas'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lista de Lotes */}
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                    <HashtagIcon className="h-6 w-6 text-blue-600 mr-2" />
                    Lotes en esta Boleta
                    <span className="ml-2 bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded-full">
                      {lotes.length} lote{lotes.length !== 1 ? 's' : ''}
                    </span>
                  </h2>
                </div>

                <div className="p-6">
                  {lotes.length === 0 ? (
                    <div className="text-center py-12">
                      <HashtagIcon className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                      <h4 className="text-lg font-medium text-gray-600 mb-2">No hay lotes registrados</h4>
                      <p className="text-gray-500">Esta boleta no contiene lotes</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead className="bg-blue-50">
                            <tr className="border-b border-gray-300">
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wide">Producto</th>
                              <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">Lote</th>
                              <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">Código</th>
                              <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">Marca</th>
                              <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">Color</th>
                              <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">Cantidad</th>
                              <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">P. Compra</th>
                              <th className="px-3 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wide">Subtotal</th>
                            </tr>
                          </thead>
                          
                          <tbody>
                            {lotes.map((lote, index) => (
                              <tr key={lote.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-4 py-4">
                                  <div className="font-medium text-gray-900 text-sm">
                                    {lote.nombreProducto || 'N/A'}
                                  </div>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {lote.numeroLote || 'N/A'}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-sm text-gray-900 font-medium bg-gray-100 px-2 py-1 rounded">
                                    {lote.codigoTienda || 'N/A'}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-sm text-gray-700">
                                    {lote.marca || 'Sin marca'}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-sm text-gray-600">
                                    {lote.color || 'N/A'}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-sm font-medium text-gray-900 bg-blue-100 px-2 py-1 rounded">
                                    {lote.cantidad || 0}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-sm font-medium text-green-700">
                                    S/. {parseFloat(lote.precioCompraUnitario || 0).toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="text-sm font-semibold text-gray-900">
                                    S/. {parseFloat(lote.subtotal || 0).toFixed(2)}
                                  </span>
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
                            <h3 className="text-lg font-semibold">Total de la Boleta</h3>
                            <p className="text-blue-100 text-sm">{lotes.length} lote{lotes.length !== 1 ? 's' : ''} • {totalCantidadLotes} unidades</p>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold">
                              S/. {parseFloat(ingreso.costoTotalIngreso || 0).toFixed(2)}
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
    </Layout>
  );
};

export default IngresoDetailsPage;