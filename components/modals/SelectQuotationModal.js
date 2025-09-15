// components/modals/SelectQuotationModal.js
import { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, PlusIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { db } from '../../lib/firebase'; // Asegúrate de que la ruta sea correcta
import { collection, query, where, getDocs, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext'; // Para obtener el usuario actual

const SelectQuotationModal = ({ isOpen, onClose, product, onAddProductToQuotation, clientes }) => {
  const { user } = useAuth();
  const [quotations, setQuotations] = useState([]);
  const [loadingQuotations, setLoadingQuotations] = useState(true);
  const [errorQuotations, setErrorQuotations] = useState(null);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const [newQuotationClient, setNewQuotationClient] = useState(''); // Para crear nueva cotización

  useEffect(() => {
    const fetchQuotations = async () => {
      if (!user) return;
      setLoadingQuotations(true);
      setErrorQuotations(null);
      try {
        // Solo cargar cotizaciones en estado 'borrador' del usuario actual
        const q = query(
          collection(db, 'cotizaciones'),
          where('estado', '==', 'borrador'),
          where('empleadoId', '==', user.email || user.uid),
          orderBy('fechaCreacion', 'desc')
        );
        const snapshot = await getDocs(q);
        const cotizacionesList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          fechaCreacionFormatted: doc.data().fechaCreacion?.toDate ? doc.data().fechaCreacion.toDate().toLocaleDateString('es-ES') : 'N/A'
        }));
        setQuotations(cotizacionesList);
      } catch (err) {
        console.error("Error fetching quotations:", err);
        setErrorQuotations("Error al cargar cotizaciones: " + err.message);
      } finally {
        setLoadingQuotations(false);
      }
    };

    if (isOpen) { // Solo cargar cuando el modal está abierto
      fetchQuotations();
    }
  }, [isOpen, user]);

  // Resetear estados al abrir/cerrar el modal
  useEffect(() => {
    if (isOpen) {
      setSelectedQuotationId('');
      setNewQuotationClient('');
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (!product && !newQuotationClient) {
      alert('Debe seleccionar un producto o un cliente para la nueva cotización.');
      return;
    }

    if (selectedQuotationId === 'new') {
      // Crear nueva cotización
      const clientObj = clientes.find(c => c.id === newQuotationClient);
      if (!clientObj) {
        alert('Debe seleccionar un cliente para la nueva cotización.');
        return;
      }
      onAddProductToQuotation(product, quantity, null, clientObj); // quantity no es relevante aquí, se maneja en el producto
    } else if (selectedQuotationId) {
      // Añadir a cotización existente
      onAddProductToQuotation(product, quantity, selectedQuotationId, null); // quantity no es relevante aquí
    } else {
      alert('Por favor, seleccione una cotización o elija crear una nueva.');
    }
  };

  // Cantidad por defecto para el producto que se va a añadir
  const [quantity, setQuantity] = useState(1);
  useEffect(() => {
    if (isOpen && product) {
      setQuantity(1); // Resetear cantidad a 1 cuando se abre con un producto
    }
  }, [isOpen, product]);


  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 flex justify-between items-center"
                >
                  {product ? `Añadir "${product.nombre}" a Cotización` : 'Gestionar Cotizaciones'}
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-white px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    onClick={onClose}
                  >
                    <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </Dialog.Title>

                <div className="mt-4">
                  {product && (
                    <>
                      <p className="text-sm text-gray-500">
                        Producto: <span className="font-semibold text-gray-800">{product.nombre}</span>
                      </p>
                      <p className="text-sm text-gray-500">
                        Precio Unitario: <span className="font-semibold text-gray-800">S/. {parseFloat(product.precioVentaDefault || 0).toFixed(2)}</span>
                      </p>
                      <div className="mt-2">
                        <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
                          Cantidad:
                        </label>
                        <input
                          type="number"
                          id="quantity"
                          min="1"
                          value={quantity}
                          onChange={(e) => setQuantity(Number(e.target.value))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        />
                      </div>
                      <hr className="my-4" />
                    </>
                  )}

                  <label htmlFor="select-quotation" className="block text-sm font-medium text-gray-700 mb-2">
                    Seleccionar Cotización existente o crear una nueva:
                  </label>
                  <select
                    id="select-quotation"
                    value={selectedQuotationId}
                    onChange={(e) => setSelectedQuotationId(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="">-- Seleccione una opción --</option>
                    <option value="new">Crear Nueva Cotización</option>
                    {loadingQuotations ? (
                      <option disabled>Cargando cotizaciones...</option>
                    ) : errorQuotations ? (
                      <option disabled>Error: {errorQuotations}</option>
                    ) : quotations.length === 0 ? (
                      <option disabled>No hay cotizaciones en borrador.</option>
                    ) : (
                      quotations.map(q => (
                        <option key={q.id} value={q.id}>
                          {q.numeroCotizacion} - {q.clienteNombre} ({q.fechaCreacionFormatted})
                        </option>
                      ))
                    )}
                  </select>

                  {selectedQuotationId === 'new' && (
                    <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                      <h4 className="text-md font-semibold text-gray-800 mb-2">Nueva Cotización</h4>
                      <label htmlFor="new-quotation-client" className="block text-sm font-medium text-gray-700">
                        Cliente para la nueva cotización:
                      </label>
                      <select
                        id="new-quotation-client"
                        value={newQuotationClient}
                        onChange={(e) => setNewQuotationClient(e.target.value)}
                        required
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="">Seleccione un cliente</option>
                        {clientes.map(cli => (
                          cli.id && (
                            <option key={cli.id} value={cli.id}>
                              {cli.nombre} {cli.apellido} ({cli.dni || cli.numeroDocumento || 'N/A'})
                            </option>
                          )
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    onClick={onClose}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    onClick={handleConfirm}
                    disabled={!selectedQuotationId || (selectedQuotationId === 'new' && !newQuotationClient)}
                  >
                    Confirmar
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default SelectQuotationModal;