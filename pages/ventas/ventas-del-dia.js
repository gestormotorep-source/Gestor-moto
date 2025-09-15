// pages/ventas/ventas-del-dia.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout'; // Importa tu Layout
import { db } from '../../lib/firebase'; // Asegúrate de la ruta correcta a Firebase
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import DatePicker from 'react-datepicker'; // Importa DatePicker
import 'react-datepicker/dist/react-datepicker.css'; // Importa los estilos del DatePicker

import {
  CalendarDaysIcon,
  CurrencyDollarIcon,
  TagIcon,
  UserIcon,
  ClockIcon,
  ShoppingCartIcon, // Para tipo de venta 'Directa'
  DocumentTextIcon, // Para tipo de venta 'Cotización'
  ArchiveBoxIcon // Usado en StockActualPage para "no data", lo replicamos aquí
} from '@heroicons/react/24/outline'; // Importa los iconos necesarios

const VentasDelDiaPage = () => {
  const router = useRouter();
  const { user } = useAuth(); // Obtén el usuario del contexto de autenticación

  const [selectedDate, setSelectedDate] = useState(new Date()); // Estado para la fecha seleccionada
  const [ventas, setVentas] = useState([]); // Lista de ventas cargadas
  const [loading, setLoading] = useState(true); // Estado de carga
  const [error, setError] = useState(null); // Estado de error
  const [totalVentasDia, setTotalVentasDia] = useState(0); // Total de ventas del día

  useEffect(() => {
    const fetchVentasDelDia = async () => {
      // Si no hay usuario, redirige a la página de autenticación.
      // Esto es crucial para proteger la ruta.
      if (!user) {
        router.push('/auth');
        return;
      }

      setLoading(true);
      setError(null);
      setVentas([]); // Limpia las ventas anteriores al cargar
      setTotalVentasDia(0); // Reinicia el total

      try {
        // Clonar la fecha para evitar mutar el estado original de `selectedDate`
        const dateForQuery = new Date(selectedDate);
        // Establecer el inicio y fin del día seleccionado para la consulta de Firebase
        const startOfDay = new Date(dateForQuery.setHours(0, 0, 0, 0));
        const endOfDay = new Date(dateForQuery.setHours(23, 59, 59, 999));

        const ventasCollectionRef = collection(db, 'ventas');
        const q = query(
          ventasCollectionRef,
          where('fechaVenta', '>=', startOfDay),
          where('fechaVenta', '<=', endOfDay),
          orderBy('fechaVenta', 'desc') // Ordenar las ventas por fecha de forma descendente
        );

        const querySnapshot = await getDocs(q);
        const loadedVentas = [];
        let currentDayTotal = 0;

        querySnapshot.docs.forEach(doc => {
          const ventaData = doc.data();
          loadedVentas.push({
            id: doc.id,
            ...ventaData,
            // Formatear la hora de la venta para mostrar solo HH:MM
            fechaVenta: ventaData.fechaVenta?.toDate ? ventaData.fechaVenta.toDate().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
          });
          // Sumar al total del día, asegurándose de que totalVenta sea un número
          currentDayTotal += typeof ventaData.totalVenta === 'number' ? ventaData.totalVenta : 0;
        });

        setVentas(loadedVentas);
        setTotalVentasDia(currentDayTotal);
      } catch (err) {
        console.error("Error al cargar ventas del día:", err);
        setError("Error al cargar las ventas para esta fecha. Por favor, intente de nuevo más tarde.");
      } finally {
        setLoading(false);
      }
    };

    fetchVentasDelDia();
  }, [selectedDate, user, router]); // Dependencias: se re-ejecuta cuando la fecha o el usuario cambian

  // Si el usuario no está autenticado, no renderiza nada hasta que router.push redirija
  if (!user) {
    return null;
  }

  return (
    // Envuelve toda la página con el componente Layout
    <Layout title="Ventas del Día">
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-6 bg-white rounded-lg shadow-md flex flex-col">

          {/* Mensaje de error */}
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
              <span className="block sm:inline font-medium">{error}</span>
            </div>
          )}

          {/* Sección de control de fecha y resumen, similar a la barra de búsqueda de StockActualPage */}
          <div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50 flex-shrink-0 flex flex-col sm:flex-row items-center justify-between">
            <div className="flex items-center space-x-3 mb-4 sm:mb-0">
              <label htmlFor="date-picker" className="text-sm font-medium text-gray-700">Seleccionar Fecha:</label>
              <DatePicker
                id="date-picker"
                selected={selectedDate}
                onChange={(date) => setSelectedDate(date)}
                dateFormat="dd/MM/yyyy"
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>
            {/* Resumen de totales */}
            <div className="text-sm text-gray-700 sm:text-right">
              <p className="flex items-center text-lg font-medium justify-end sm:justify-start">
                <CurrencyDollarIcon className="h-6 w-6 mr-2 text-green-600" />
                Total Ventas: <span className="font-bold text-green-700 ml-1">S/. {totalVentasDia.toFixed(2)}</span>
              </p>
              <p className="flex items-center mt-1 justify-end sm:justify-start">
                <TagIcon className="h-6 w-6 mr-2 text-blue-600" />
                N° de Ventas: <span className="font-medium ml-1">{ventas.length}</span>
              </p>
            </div>
          </div>

          {/* Indicador de carga */}
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="ml-4 text-gray-600">Cargando ventas...</p>
            </div>
          ) : (
            <>
              {/* Mensaje si no hay ventas (similar a StockActualPage) */}
              {ventas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-gray-50 rounded-lg p-4 shadow-inner">
                  <ArchiveBoxIcon className="h-24 w-24 text-gray-300 mb-4" /> {/* Usamos ArchiveBoxIcon para coherencia visual */}
                  <p className="text-lg font-medium">No se encontraron ventas para esta fecha.</p>
                  <p className="text-sm text-gray-400">Selecciona otra fecha para ver su historial.</p>
                </div>
              ) : (
                <div className="overflow-x-auto shadow-lg ring-1 ring-black ring-opacity-5 rounded-lg overflow-y-auto max-h-[70vh]">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">HORA</th>
                        <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">CLIENTE</th>
                        <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">TOTAL</th>
                        <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">TIPO VENTA</th>
                        <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">MÉTODO PAGO</th>
                        <th scope="col" className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 text-center">REGISTRADO POR</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {ventas.map((venta, index) => (
                        <tr key={venta.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900 text-center">
                            <div className="flex items-center justify-center">
                              <ClockIcon className="h-4 w-4 mr-1 text-gray-500" />
                              {venta.fechaVenta}
                            </div>
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-left">
                            <div className="flex items-center">
                              <UserIcon className="h-4 w-4 mr-1 text-gray-500" />
                              {venta.clienteNombre || 'N/A'}
                            </div>
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 font-medium text-left">
                            S/. {parseFloat(venta.totalVenta || 0).toFixed(2)}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-center">
                            {venta.tipoVenta === 'cotizacionAprobada' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                <DocumentTextIcon className="h-4 w-4 mr-1" /> Cotización
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                <ShoppingCartIcon className="h-4 w-4 mr-1" /> Directa
                              </span>
                            )}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-left">
                            {venta.metodoPago || 'N/A'}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-3 py-2 text-sm text-gray-700 text-left">
                            {venta.empleadoId || 'Desconocido'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default VentasDelDiaPage;