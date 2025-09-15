// pages/clientes/activos.js
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { generarPDFCliente, generarPDFPorPeriodo } from '../../components/utils/pdfGenerator';
import {
    collection,
    query,
    where,
    onSnapshot,
    getDocs,
    orderBy,
    doc,
    getDoc,
    Timestamp
} from 'firebase/firestore';
import {
    UsersIcon,
    CreditCardIcon,
    DocumentTextIcon,
    XMarkIcon,
    PrinterIcon,
    PlusIcon
} from '@heroicons/react/24/outline';


// Modal de alerta personalizado
const CustomAlert = ({ message, onClose }) => {
    if (!message) return null;

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
            <div className="relative p-5 border w-96 shadow-lg rounded-md bg-white">
                <h3 className="lg:text-lg text-base font-bold text-gray-900">Notificación</h3>
                <p className="mt-2 text-sm text-gray-500">{message}</p>
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-auto shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                        Aceptar
                    </button>
                </div>
            </div>
        </div>
    );
};

// Modal de selección de cliente para PDF
const ClientePDFModal = ({ isOpen, onClose, clientes, onGeneratePDF, loading }) => {
    const [selectedClienteId, setSelectedClienteId] = useState('');

    if (!isOpen) return null;

    const handleGenerate = () => {
        if (!selectedClienteId) {
            onClose();
            return;
        }
        const cliente = clientes.find(c => c.id === selectedClienteId);
        if (cliente) {
            onGeneratePDF(cliente);
            onClose();
            setSelectedClienteId('');
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">Generar Reporte de Crédito</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>
                
                <div className="p-4">
                    <label htmlFor="cliente-select" className="block text-sm font-medium text-gray-700 mb-2">
                        Seleccionar Cliente:
                    </label>
                    <select
                        id="cliente-select"
                        value={selectedClienteId}
                        onChange={(e) => setSelectedClienteId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="">-- Seleccionar Cliente --</option>
                        {clientes.map(cliente => (
                            <option key={cliente.id} value={cliente.id}>
                                {cliente.nombre} {cliente.apellido} - S/. {parseFloat(cliente.montoCreditoActual || 0).toFixed(2)}
                            </option>
                        ))}
                    </select>
                </div>
                
                <div className="flex justify-end gap-3 p-4 border-t">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={!selectedClienteId || loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
                    >
                        <PrinterIcon className="h-4 w-4 mr-2" />
                        {loading ? 'Generando...' : 'Generar PDF'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ClientesConCreditoActivos = () => {
    const router = useRouter();
    const { user } = useAuth();
    const isAdmin = user?.email === 'admin@gmail.com';
    const [clientes, setClientes] = useState([]);
    const [clientesFiltrados, setClientesFiltrados] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [alertMessage, setAlertMessage] = useState('');
    const [showPDFModal, setShowPDFModal] = useState(false);
    const [generatingPDF, setGeneratingPDF] = useState(false);

    // Estados para filtros
    const [filterPeriod, setFilterPeriod] = useState('all');
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [limitPerPage, setLimitPerPage] = useState(20);

    const showAlert = (message) => setAlertMessage(message);
    const closeAlert = () => setAlertMessage('');

    // Redirigir si no está autenticado
    useEffect(() => {
        if (!user) {
            router.push('/auth');
        }
    }, [user, router]);

    // Escucha los cambios en la colección de clientes
    useEffect(() => {
        if (!user) return;

        setLoading(true);
        setError(null);

        const qClientes = query(
            collection(db, 'cliente'),
            where('tieneCredito', '==', true)
        );

        const unsubscribeClientes = onSnapshot(qClientes, (querySnapshot) => {
            const clientesList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                montoCreditoActual: doc.data().montoCreditoActual || 0,
            }));

            clientesList.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            setClientes(clientesList);
            setLoading(false);
        }, (err) => {
            setError("Error al cargar la lista de clientes con crédito. " + err.message);
            setClientes([]);
            setLoading(false);
        });

        return () => {
            unsubscribeClientes();
        };
    }, [user]);

    // Función para manejar cambios en los filtros
    const handleFilterChange = (period) => {
        setFilterPeriod(period);
        const now = new Date();
        let start, end;

        switch (period) {
            case 'day':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;
            case 'week':
                const startOfWeek = new Date(now);
                startOfWeek.setDate(now.getDate() - now.getDay());
                startOfWeek.setHours(0, 0, 0, 0);
                start = startOfWeek;
                end = new Date(startOfWeek);
                end.setDate(startOfWeek.getDate() + 6);
                end.setHours(23, 59, 59, 999);
                break;
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
            default:
                start = null;
                end = null;
        }

        setStartDate(start);
        setEndDate(end);
    };

    // Filtrar clientes según el período seleccionado
    useEffect(() => {
        const filterClientsByDate = async () => {
            if (filterPeriod === 'all' || (!startDate && !endDate)) {
                setClientesFiltrados(clientes.slice(0, limitPerPage));
                return;
            }

            if (!startDate || !endDate) {
                setClientesFiltrados(clientes.slice(0, limitPerPage));
                return;
            }

            const clientesFiltradosPromises = clientes.map(async (cliente) => {
                // Buscar créditos del cliente en el rango de fechas
                const qCreditos = query(
                    collection(db, 'creditos'),
                    where('clienteId', '==', cliente.id),
                    where('estado', '==', 'activo'),
                    where('fechaCreacion', '>=', Timestamp.fromDate(startDate)),
                    where('fechaCreacion', '<=', Timestamp.fromDate(endDate))
                );

                const creditosSnapshot = await getDocs(qCreditos);
                
                if (creditosSnapshot.empty) {
                    return null; // No incluir este cliente
                }

                return cliente;
            });

            const resultados = await Promise.all(clientesFiltradosPromises);
            const clientesConCreditos = resultados.filter(cliente => cliente !== null);
            setClientesFiltrados(clientesConCreditos.slice(0, limitPerPage));
        };

        filterClientsByDate();
    }, [clientes, filterPeriod, startDate, endDate, limitPerPage]);

    // Generar PDF detallado para un cliente específico - ACTUALIZADA PARA INCLUIR ABONOS
    const generarPDFClienteHandler = async (cliente) => {
        setGeneratingPDF(true);
        
        try {
            // Obtener créditos del cliente según el filtro actual
            let qCreditos;
            
            if (filterPeriod === 'all' || (!startDate && !endDate)) {
                qCreditos = query(
                    collection(db, 'creditos'),
                    where('clienteId', '==', cliente.id),
                    where('estado', '==', 'activo'),
                    orderBy('fechaCreacion', 'desc')
                );
            } else {
                qCreditos = query(
                    collection(db, 'creditos'),
                    where('clienteId', '==', cliente.id),
                    where('estado', '==', 'activo'),
                    where('fechaCreacion', '>=', Timestamp.fromDate(startDate)),
                    where('fechaCreacion', '<=', Timestamp.fromDate(endDate)),
                    orderBy('fechaCreacion', 'desc')
                );
            }
            
            const creditosSnapshot = await getDocs(qCreditos);
            const creditos = [];
            
            // Para cada crédito, obtener sus items
            for (const creditoDoc of creditosSnapshot.docs) {
                const creditoData = { id: creditoDoc.id, ...creditoDoc.data() };
                
                // Obtener items del crédito
                const qItems = query(
                    collection(db, 'creditos', creditoDoc.id, 'itemsCredito'),
                    orderBy('createdAt', 'asc')
                );
                const itemsSnapshot = await getDocs(qItems);
                const items = itemsSnapshot.docs.map(itemDoc => ({
                    id: itemDoc.id,
                    ...itemDoc.data()
                }));
                
                creditos.push({
                    ...creditoData,
                    items: items
                });
            }

            if (creditos.length === 0) {
                showAlert('Este cliente no tiene créditos activos para el período seleccionado.');
                return;
            }

            // OBTENER ABONOS DEL CLIENTE
            let qAbonos;
            if (filterPeriod === 'all' || (!startDate && !endDate)) {
                qAbonos = query(
                    collection(db, 'abonos'),
                    where('clienteId', '==', cliente.id),
                    orderBy('fecha', 'desc')
                );
            } else {
                qAbonos = query(
                    collection(db, 'abonos'),
                    where('clienteId', '==', cliente.id),
                    where('fecha', '>=', Timestamp.fromDate(startDate)),
                    where('fecha', '<=', Timestamp.fromDate(endDate)),
                    orderBy('fecha', 'desc')
                );
            }
            
            const abonosSnapshot = await getDocs(qAbonos);
            const abonos = abonosSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Obtener el nombre del período para el PDF
            const getPeriodoNombre = () => {
                switch (filterPeriod) {
                    case 'day': return 'HOY';
                    case 'week': return 'ESTA SEMANA';
                    case 'month': return 'ESTE MES';
                    case 'custom': return `${startDate?.toLocaleDateString('es-PE')} - ${endDate?.toLocaleDateString('es-PE')}`;
                    default: return '';
                }
            };

            // Generar PDF usando la función actualizada que incluye abonos
            const mensaje = await generarPDFCliente(cliente, creditos, abonos, getPeriodoNombre());
            showAlert(mensaje);
            
        } catch (error) {
            console.error('Error al generar PDF del cliente:', error);
            showAlert('Error al generar el reporte PDF. Por favor, inténtalo de nuevo.');
        } finally {
            setGeneratingPDF(false);
        }
    };

    // Generar PDF por período (todos los clientes del período)
    const generarPDFPorPeriodoHandler = async () => {
        setGeneratingPDF(true);
        
        try {
            if (clientesFiltrados.length === 0) {
                showAlert('No hay clientes con crédito para el período seleccionado.');
                return;
            }

            const getPeriodoNombre = () => {
                switch (filterPeriod) {
                    case 'day': return 'HOY';
                    case 'week': return 'ESTA SEMANA';
                    case 'month': return 'ESTE MES';
                    case 'custom': return `${startDate?.toLocaleDateString('es-PE')} - ${endDate?.toLocaleDateString('es-PE')}`;
                    default: return 'TODOS LOS PERÍODOS';
                }
            };

            const mensaje = await generarPDFPorPeriodo(clientesFiltrados, getPeriodoNombre());
            showAlert(mensaje);
            
        } catch (error) {
            console.error('Error al generar PDF por período:', error);
            showAlert('Error al generar el reporte PDF. Por favor, inténtalo de nuevo.');
        } finally {
            setGeneratingPDF(false);
        }
    };

    if (!user) return null;

    return (
        <Layout title="Clientes con Crédito">
            <CustomAlert message={alertMessage} onClose={closeAlert} />
            <ClientePDFModal 
                isOpen={showPDFModal}
                onClose={() => setShowPDFModal(false)}
                clientes={clientesFiltrados.filter(c => c.montoCreditoActual > 0)}
                onGeneratePDF={generarPDFClienteHandler}
                loading={generatingPDF}
            />
            
            <div className="flex flex-col mx-4 py-4">
                <div className="w-full p-4 bg-white rounded-lg shadow-md flex flex-col">


                   {/* Contenedor de Botones, Fechas y Limitador - RESPONSIVE AGRUPADO */}
<div className="flex flex-col space-y-3 lg:flex-row lg:items-center lg:gap-3 lg:space-y-0 mb-6">
    
    {/* Botones de Filtro */}
    <div className="flex flex-wrap gap-2 lg:space-x-2 lg:flex-shrink-0">
        <button
            onClick={() => handleFilterChange('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
                filterPeriod === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
            }`}
        >
            Todas
        </button>
        <button
            onClick={() => handleFilterChange('day')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
                filterPeriod === 'day'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
            }`}
        >
            Hoy
        </button>
        <button
            onClick={() => handleFilterChange('week')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
                filterPeriod === 'week'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
            }`}
        >
            Esta Semana
        </button>
        <button
            onClick={() => handleFilterChange('month')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
                filterPeriod === 'month'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
            }`}
        >
            Este Mes
        </button>
    </div>

    {/* Selectores de Fecha */}
    <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 lg:flex-shrink-0">
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
            className="w-full sm:w-40 lg:w-36 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
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
            className="w-full sm:w-40 lg:w-36 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
    </div>

    {/* Fila inferior en móvil - horizontal en desktop */}
    <div className="flex flex-wrap gap-2 lg:flex-nowrap lg:items-center lg:space-x-2">
        
        {/* Selector de límite por página */}
        <div className="flex-shrink-0">
            <select
                id="limit-per-page"
                className="w-20 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm h-[38px]"
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

        {/* Botón de Reporte por Período */}
        <button
            onClick={generarPDFPorPeriodoHandler}
            disabled={clientesFiltrados.length === 0 || generatingPDF}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
            <DocumentTextIcon className="h-4 w-4 mr-2" />
            {generatingPDF ? 'Generando...' : 'Reporte PDF'}
        </button>

        {/* Botón Nueva Cotización */}
        <button
            onClick={() => router.push('/creditos/nueva')}
            className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition duration-150 ease-in-out"
        >
            <PlusIcon className="h-5 w-5 mr-3" aria-hidden="true" />
            Nuevo Credito
        </button>
    </div>
</div>

                    {/* Estadísticas - Solo Total Adeudado y Clientes con Crédito */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <div className="flex items-center">
                                <CreditCardIcon className="h-6 w-6 text-red-600 mr-3" />
                                <div>
                                    <h3 className="text-sm font-semibold text-red-800">Total Adeudado</h3>
                                    <p className="text-xl font-bold text-red-600">
                                        S/. {clientesFiltrados.reduce((total, cliente) => total + (cliente.montoCreditoActual || 0), 0).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-center">
                                <UsersIcon className="h-6 w-6 text-blue-600 mr-3" />
                                <div>
                                    <h3 className="text-sm font-semibold text-blue-800">Clientes con Crédito</h3>
                                    <p className="text-xl font-bold text-blue-600">{clientesFiltrados.length}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Loading */}
                    {loading && (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                            <span className="block sm:inline">{error}</span>
                        </div>
                    )}

                    {/* Sin resultados */}
                    {!loading && !error && clientesFiltrados.length === 0 && (
                        <p className="p-4 text-center text-gray-500">
                            {filterPeriod === 'all' 
                                ? 'No hay clientes con crédito pendiente en este momento.'
                                : 'No hay clientes con crédito para el período seleccionado.'
                            }
                        </p>
                    )}

                    {/* Tabla de clientes */}
                    {!loading && !error && clientesFiltrados.length > 0 && (
                        <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                            <table className="min-w-full border-collapse">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-left">NOMBRE</th>
                                        <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">DNI</th>
                                        <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MONTO DEBIDO</th>
                                        <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">ACCIONES</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white">
                                    {clientesFiltrados.map((cliente, index) => (
                                        <tr key={cliente.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                                            <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-left">
                                                <div className="font-semibold">{cliente.nombre || 'N/A'} {cliente.apellido || ''}</div>
                                            </td>
                                            <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-black text-center">
                                                {cliente.dni || 'N/A'}
                                            </td>
                                            <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                                                <span className="font-bold text-red-600">
                                                    S/. {parseFloat(cliente.montoCreditoActual || 0).toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="border border-gray-300 px-3 py-2 text-sm text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {isAdmin && (<> <button
                                                        onClick={() => router.push(`/creditos/${cliente.id}`)}
                                                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs flex items-center"
                                                    >
                                                        <CreditCardIcon className="h-3 w-3 mr-1" />
                                                        Ver Detalle
                                                    </button></>)}
                                                    {cliente.montoCreditoActual > 0 && (
                                                        <button
                                                            onClick={() => generarPDFClienteHandler(cliente)}
                                                            disabled={generatingPDF}
                                                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs flex items-center disabled:bg-gray-400"
                                                        >
                                                            <PrinterIcon className="h-3 w-3 mr-1" />
                                                            PDF
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
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

export default ClientesConCreditoActivos;