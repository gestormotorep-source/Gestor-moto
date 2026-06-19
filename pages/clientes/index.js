// pages/clientes/index.js
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { useSucursal } from '../../contexts/SucursalContext';
import { collection, query, deleteDoc, doc, orderBy, onSnapshot } from 'firebase/firestore';
import { PlusIcon, PencilIcon, TrashIcon, ShoppingBagIcon, UserGroupIcon, ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, XMarkIcon, CreditCardIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';
import { useAppCache } from '../../contexts/AppCacheContext';

const ClientesPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { getCache, setCache, invalidateCache } = useAppCache();
  const { db, sucursalActiva } = useSucursal();
  const isAdmin = user?.email === 'admin@gmail.com';

  const cacheKey = `clientes_${sucursalActiva.id}`;
  const cached = getCache(cacheKey);
  const filtersChanged = useRef(false);
  const isFirstRender = useRef(true);

  const [clientes, setClientes] = useState(cached?.data || []);
  const [filteredClientes, setFilteredClientes] = useState(cached?.filtros?.filteredClientes || cached?.data || []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState(cached?.filtros?.searchTerm || '');
  const [currentPage, setCurrentPage] = useState(cached?.filtros?.currentPage || 1);
  const [filterCredito, setFilterCredito] = useState(cached?.filtros?.filterCredito || 'all');

  const clientesPerPage = 20;

  useEffect(() => {
    setClientes([]);
    setFilteredClientes([]);
  }, [sucursalActiva.id]);

  useEffect(() => {
    if (!user) { router.push('/auth'); return; }

    const hayCacheValido = getCache(cacheKey) && !filtersChanged.current;
    filtersChanged.current = false;

    if (!hayCacheValido) setLoading(true);
    setError(null);

    const q = query(collection(db, 'cliente'), orderBy('nombre', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        fechaNacimiento: d.data().fechaNacimiento || '',
      }));
      setClientes(lista);
      setLoading(false);
    }, (err) => {
      setError('Error al cargar clientes: ' + err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, router, db, sucursalActiva.id]);

  // ── Filtros locales ─────────────────────────────────────
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (cached) return;
    }
    if (!clientes.length) return;

    let filtered = [...clientes];

    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        c.nombre?.toLowerCase().includes(lower) ||
        c.apellido?.toLowerCase().includes(lower) ||
        c.dni?.toLowerCase().includes(lower) ||
        c.email?.toLowerCase().includes(lower) ||
        c.telefono?.toLowerCase().includes(lower) ||
        c.direccion?.toLowerCase().includes(lower)
      );
    }

    if (filterCredito === 'con') {
      filtered = filtered.filter(c => c.tieneCredito);
    } else if (filterCredito === 'sin') {
      filtered = filtered.filter(c => !c.tieneCredito);
    } else if (filterCredito === 'deuda') {
      filtered = filtered.filter(c => c.tieneCredito && parseFloat(c.montoCreditoActual || 0) > 0);
    }

    setFilteredClientes(filtered);
    setCurrentPage(1);
  }, [searchTerm, filterCredito, clientes]);

  // ── Persistir caché ─────────────────────────────────────
  useEffect(() => {
    if (clientes.length > 0) {
      setCache(cacheKey, clientes, {
        searchTerm,
        filteredClientes,
        filterCredito,
        currentPage,
      });
    }
  }, [clientes, filteredClientes, searchTerm, filterCredito, currentPage]);

  // ── Paginación ──────────────────────────────────────────
  const totalPages = Math.ceil(filteredClientes.length / clientesPerPage);
  const indexOfLast = currentPage * clientesPerPage;
  const indexOfFirst = indexOfLast - clientesPerPage;
  const currentClientes = filteredClientes.slice(indexOfFirst, indexOfLast);

  const clearFilters = () => {
    invalidateCache(cacheKey);
    filtersChanged.current = true;
    setSearchTerm('');
    setFilterCredito('all');
    setCurrentPage(1);
  };

  const formatBirthday = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) return 'N/A';
    return `${date.getDate()} de ${date.toLocaleString('es-ES', { month: 'long' })}`;
  };

  const handleDelete = async (clienteId) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este cliente? Esta acción es irreversible.')) return;
    try {
      await deleteDoc(doc(db, 'cliente', clienteId));
      invalidateCache(cacheKey);
    } catch (err) {
      setError('Error al eliminar el cliente: ' + err.message);
    }
  };

  if (!user) return null;

  return (
    <Layout title="Gestión de Clientes">
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-4 bg-white rounded-lg shadow-md flex flex-col">

          <div className="flex items-center mb-4">
            <UserGroupIcon className="h-8 w-8 text-green-600 mr-2" />
            <h1 className="text-xl font-bold text-gray-700">Gestión de Clientes</h1>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          {/* Panel de filtros */}
          <div className="mb-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
            {/* Primera línea: búsqueda + botón agregar */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-3">
              <div className="relative flex-grow sm:mr-4">
                <input
                  type="text"
                  placeholder="Buscar por nombre, DNI, teléfono, email o dirección..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 text-base placeholder-gray-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => router.push('/clientes/nuevo')}
                  className="inline-flex items-center justify-center px-6 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 ease-in-out whitespace-nowrap"
                >
                  <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                  Agregar Cliente
                </button>
              )}
            </div>

            {/* Segunda línea: filtros + limpiar */}
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {/* Filtro crédito */}
                <button
                  onClick={() => setFilterCredito('all')}
                  className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${filterCredito === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFilterCredito('con')}
                  className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${filterCredito === 'con' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'}`}
                >
                  Con crédito
                </button>
                <button
                  onClick={() => setFilterCredito('sin')}
                  className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${filterCredito === 'sin' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'}`}
                >
                  Sin crédito
                </button>
                <button
                  onClick={() => setFilterCredito('deuda')}
                  className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${filterCredito === 'deuda' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'}`}
                >
                  Con deuda activa
                </button>
              </div>

              <button
                onClick={clearFilters}
                className="inline-flex items-center px-3 py-1 bg-red-50 text-red-700 rounded text-sm font-medium hover:bg-red-100 hover:text-red-800 transition-colors border border-red-200 whitespace-nowrap"
              >
                <XMarkIcon className="h-4 w-4 mr-1" />
                Limpiar
              </button>
            </div>
          </div>

          {/* Indicador de total */}
          {!loading && (
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-2">
                <span className="text-sm text-blue-600 font-medium">Total:</span>
                <span className="text-lg font-bold text-blue-800">{filteredClientes.length} clientes</span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            </div>
          ) : filteredClientes.length === 0 ? (
            <p className="p-4 text-center text-gray-500">No se encontraron clientes que coincidan con la búsqueda.</p>
          ) : (
            <>
              <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 rounded-lg overflow-y-auto max-h-[60vh]">
                <table className="min-w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">NOMBRE COMPLETO</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">DNI</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">TELÉFONO</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">EMAIL</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">CUMPLEAÑOS</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">CRÉDITO</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {currentClientes.map((cliente, index) => {
                      const deuda = parseFloat(cliente.montoCreditoActual || 0);
                      const limite = parseFloat(cliente.creditoMaximo || 0);
                      const porcentaje = limite > 0 ? Math.min(100, (deuda / limite) * 100) : 0;
                      const colorBarra = porcentaje >= 90 ? 'bg-red-500' : porcentaje >= 60 ? 'bg-yellow-500' : 'bg-green-500';

                      return (
                        <tr key={cliente.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium text-black text-left">
                            {cliente.nombre} {cliente.apellido}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">{cliente.dni || 'N/A'}</td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">{cliente.telefono || 'N/A'}</td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">{cliente.email || 'N/A'}</td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">
                            {formatBirthday(cliente.fechaNacimiento)}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-sm text-center min-w-[140px]">
                            {cliente.tieneCredito ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${deuda > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                    S/. {deuda.toFixed(2)}
                                  </span>
                                  <span className="text-xs text-gray-400">/ {limite.toFixed(2)}</span>
                                </div>
                                {limite > 0 && (
                                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full ${colorBarra}`} style={{ width: `${porcentaje}%` }} />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                                Sin crédito
                              </span>
                            )}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium">
                            <div className="flex items-center space-x-2 justify-center">
                              <button
                                onClick={() => router.push(`/clientes/${cliente.id}/compras`)}
                                className="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-gray-100"
                                title="Ver Compras"
                              >
                                <ShoppingBagIcon className="h-5 w-5" />
                              </button>
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={() => router.push(`/clientes/${cliente.id}`)}
                                    className="text-green-600 hover:text-green-900 p-1 rounded-full hover:bg-gray-100"
                                    title="Editar Cliente"
                                  >
                                    <PencilIcon className="h-5 w-5" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(cliente.id)}
                                    className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-gray-100"
                                    title="Eliminar Cliente"
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

              {/* Paginación */}
              {filteredClientes.length > clientesPerPage && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{indexOfFirst + 1}</span> a{' '}
                    <span className="font-medium">{Math.min(indexOfLast, filteredClientes.length)}</span> de{' '}
                    <span className="font-medium">{filteredClientes.length}</span> resultados
                  </p>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-700">
                      Página {currentPage} de {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
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

export default ClientesPage;