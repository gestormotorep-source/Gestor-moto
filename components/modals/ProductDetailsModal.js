// components/ProductDetailsModal.js
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function ProductDetailsModal({ isOpen, onClose, product /* , modelosMoto ya no lo necesitamos */ }) {
  if (!isOpen || !product) return null;

  const descriptionPoints = product.descripcionPuntos ? product.descripcionPuntos.split(/\n/).filter(point => point.trim()) : [];

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as="div"
          className="fixed inset-0 bg-black bg-opacity-75"
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        />

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as="div"
              className="w-full max-w-sm transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all relative"
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel>
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>

                {/* Aplica la fuente aquí */}
                <div className="mt-2 text-gray-500 font-simplified-arabic">
                  {descriptionPoints.length > 0 ? (
                    <div className="flex justify-center items-center">
                      <div className="w-full max-w-xs border border-gray-200 rounded-lg overflow-hidden">
                        {/* Título de la tabla con el nombre del producto y el código del proveedor */}
                        <div className="bg-gray-200 py-2 text-center font-bold text-gray-800">
                          Descripción del {product.nombre} {product.codigoProveedor && `(${product.codigoProveedor})`}
                        </div>
                        {/* Iterar sobre los puntos de descripción y mostrarlos en celdas */}
                        {descriptionPoints.map((point, index) =>
                          point.trim() ? (
                            <div key={index} className="px-4 py-2 text-black border-b border-gray-200 last:border-b-0">
                              {point.trim()}
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center">No hay descripción registrada para este producto.</p>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}