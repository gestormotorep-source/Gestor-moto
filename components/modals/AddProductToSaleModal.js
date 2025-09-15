// components/modals/AddProductToSaleModal.js
import { useState, Fragment, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const AddProductToSaleModal = ({ isOpen, onClose, product, onAdd, clientes, activeSale, selectedClientForActiveSale }) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState('');

  // Resetea la cantidad y clientId cada vez que el modal se abre para un nuevo producto/tipo
  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      // Si hay una venta activa y un cliente asociado, precargarlo
      if (activeSale && activeSale.clientId && selectedClientForActiveSale) {
        setSelectedClientId(activeSale.clientId);
      } else {
        // Sino, precargar el cliente "no registrado" si existe
        const clienteNoRegistrado = clientes.find(c => c.id === 'cliente-no-registrado');
        setSelectedClientId(clienteNoRegistrado?.id || '');
      }
    }
  }, [isOpen, product, activeSale, clientes, selectedClientForActiveSale]);

  if (!isOpen || !product) {
    return null;
  }

  const handleConfirmAdd = () => {
    if (quantity <= 0) {
      alert('La cantidad debe ser mayor a 0.');
      return;
    }
    if (!selectedClientId) {
        alert('Debe seleccionar un cliente para la venta.');
        return;
    }
    onAdd(product, quantity, selectedClientId); // Llama a la función de adición del padre
  };

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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 flex justify-between items-center"
                >
                  Añadir Producto a Venta
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-white px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    onClick={onClose}
                  >
                    <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </Dialog.Title>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Estás añadiendo: <span className="font-semibold text-gray-800">{product.nombre}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Precio Unitario: <span className="font-semibold text-gray-800">S/. {parseFloat(product.precioVentaDefault || 0).toFixed(2)}</span>
                  </p>

                  <div className="mt-4">
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

                  {/* Selector de Cliente para Ventas */}
                  <div className="mt-4">
                    <label htmlFor="clientSelect" className="block text-sm font-medium text-gray-700">
                      Seleccionar Cliente:
                    </label>
                    <select
                      id="clientSelect"
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
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
                    {selectedClientForActiveSale && (
                      <p className="mt-1 text-xs text-blue-600">
                          Venta activa para: {selectedClientForActiveSale.nombre} {selectedClientForActiveSale.apellido || ''}
                      </p>
                    )}
                  </div>

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
                    onClick={handleConfirmAdd}
                  >
                    Confirmar Añadir
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

export default AddProductToSaleModal;