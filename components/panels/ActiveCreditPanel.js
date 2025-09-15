// components/panels/ActiveCreditPanel
import React, { Fragment, useState, useEffect, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Select from 'react-select';

const ActiveCreditPanel = ({
  isOpen,
  onClose,
  activeCredit,
  activeCreditItems,
  clientes, // Ahora serán solo clientes con crédito activado
  setActiveCreditId,
  onUpdateCreditClient,
  onRemoveItem,
  onUpdateItemQuantity,
  pendingCredits,
  onSelectPendingCredit,
  onUpdateCreditPaymentMethod,
  onFinalizeCredit,
}) => {
  const [selectedClientOption, setSelectedClientOption] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');

  // Estados y referencias para la funcionalidad de arrastrar el modal
  const panelRef = useRef(null);
  const isDraggingRef = useRef(false);
  const initialMousePosRef = useRef({ x: 0, y: 0 });
  const initialPanelPosRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(null);

  // Debug: Agregar logs para ver qué está pasando con pendingCredits
  useEffect(() => {
    console.log('ActiveCreditPanel - pendingCredits:', pendingCredits);
    console.log('ActiveCreditPanel - pendingCredits length:', pendingCredits.length);
  }, [pendingCredits]);

  // Sincroniza la selección del cliente y el método de pago con el crédito activo
  useEffect(() => {
    if (activeCredit && clientes.length > 0) {
      // Sincronizar cliente
      const currentClient = clientes.find(c => c.id === activeCredit.clienteId);
      if (currentClient) {
        setSelectedClientOption({
          value: currentClient.id,
          label: `${currentClient.nombre} ${currentClient.apellido || ''} - ${currentClient.dni || ''}`.trim()
        });
      } else {
        setSelectedClientOption(null);
      }
      
      // Sincronizar método de pago
      setSelectedPaymentMethod(activeCredit.metodoPago || '');
    } else {
      setSelectedClientOption(null);
      setSelectedPaymentMethod('');
    }
  }, [activeCredit, clientes]);

  // Efecto para gestionar el arrastre del panel
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current || frameRef.current !== null) return;

      frameRef.current = requestAnimationFrame(() => {
          const dx = e.clientX - initialMousePosRef.current.x;
          const dy = e.clientY - initialMousePosRef.current.y;

          const newX = initialPanelPosRef.current.x + dx;
          const newY = initialPanelPosRef.current.y + dy;

          if (panelRef.current) {
              panelRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
          }

          frameRef.current = null;
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const handleMouseDown = (e) => {
    if (panelRef.current && e.target.classList.contains('drag-handle')) {
        isDraggingRef.current = true;
        initialMousePosRef.current = { x: e.clientX, y: e.clientY };
        
        const style = window.getComputedStyle(panelRef.current);
        const matrix = new DOMMatrixReadOnly(style.transform);
        initialPanelPosRef.current = { x: matrix.m41, y: matrix.m42 };

        e.preventDefault();
    }
  };

  const handleClientChange = (selectedOption) => {
    setSelectedClientOption(selectedOption);
    if (activeCredit) {
      onUpdateCreditClient(activeCredit.id, selectedOption ? selectedOption.value : null);
    }
  };

  const handlePaymentMethodChange = (e) => {
    const method = e.target.value;
    setSelectedPaymentMethod(method);
    if (activeCredit) {
      onUpdateCreditPaymentMethod(activeCredit.id, method);
    }
  };
  
  const handleFinalize = () => {
    if (!activeCredit) {
      alert("No hay un crédito activo para finalizar.");
      return;
    }
    if (activeCreditItems.length === 0) {
      alert("El crédito no puede estar vacío para finalizar.");
      return;
    }
    if (!selectedClientOption || !selectedClientOption.value) {
      alert("Por favor, selecciona un cliente para finalizar el crédito.");
      return;
    }
    onFinalizeCredit(activeCredit.id, selectedPaymentMethod);
  };

  const calculateTotal = () => {
    return activeCreditItems.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0).toFixed(2);
  };

  const clientOptions = clientes.map(cliente => ({
    value: cliente.id,
    label: `${cliente.nombre} ${cliente.apellido || ''} - ${cliente.dni || ''} ${cliente.tieneCredito ? '✓' : ''}`.trim()
  }));

  const paymentMethodOptions = [
    { value: '', label: 'Seleccionar Método de Pago' },
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'tarjeta', label: 'Tarjeta de Crédito/Débito' },
    { value: 'transferencia', label: 'Transferencia Bancaria' },
    { value: 'plin', label: 'Plin' },
    { value: 'yape', label: 'Yape' },
  ];

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-20" onClose={onClose}>
        {/* Fondo oscuro para el modal */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        {/* Contenedor principal del modal */}
        <div className="fixed inset-0 z-20 overflow-y-auto">
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
              <Dialog.Panel
                ref={panelRef}
                className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:w-full sm:max-w-lg"
                style={{ transform: `translate(0px, 0px)` }}
                onClick={e => e.stopPropagation()}
              >
                
                {/* Encabezado del panel con área de arrastre */}
                <div
                  className="drag-handle relative px-4 pt-5 sm:px-6 bg-yellow-100 cursor-grab active:cursor-grabbing"
                  onMouseDown={handleMouseDown}
                >
                  <div className="flex items-center justify-between">
                    <Dialog.Title className="text-lg font-medium text-gray-900">
                      Panel de Crédito Activo
                    </Dialog.Title>
                    <button
                      type="button"
                      className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
                      onClick={onClose}
                    >
                      <span className="sr-only">Cerrar</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Contenido del panel */}
                <div className="px-4 py-6 sm:px-6">
                  {/* SECCIÓN: Créditos Pendientes */}
                  <div className="border-b pb-4">
                    <h3 className="text-md font-semibold text-gray-800 mb-2">
                      Créditos Pendientes ({pendingCredits.length})
                    </h3>
                    {/* Debug info - puedes remover esto después */}
                    <div className="text-xs text-gray-400 mb-2">
                      Debug: {pendingCredits.length} créditos encontrados
                    </div>
                    
                    {pendingCredits.length === 0 ? (
                      <p className="text-sm text-gray-500">No hay créditos pendientes.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {pendingCredits.map(credit => {
                          // Debug log para cada crédito
                          console.log('Renderizando crédito:', credit);
                          
                          return (
                            <div
                              key={credit.id}
                              className={`p-2 border rounded-md text-sm cursor-pointer transition-colors ${
                                activeCredit && activeCredit.id === credit.id 
                                  ? 'bg-yellow-100 border-yellow-500 font-medium' 
                                  : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
                              }`}
                              onClick={() => {
                                console.log('Seleccionando crédito:', credit.id);
                                onSelectPendingCredit(credit.id);
                              }}
                            >
                              <p><strong>Número:</strong> {credit.numeroCredito || 'N/A'}</p>
                              <p><strong>Cliente:</strong> {credit.clienteNombre || 'Cliente Pendiente'}</p>
                              <p><strong>Total:</strong> S/. {parseFloat(credit.totalCredito || 0).toFixed(2)}</p>
                              <p><strong>Estado:</strong> {credit.estado || 'N/A'}</p>
                              <p className="text-xs text-gray-500">
                                Creado: {credit.fechaCreacion ? 
                                  (credit.fechaCreacion.toDate ? 
                                    new Date(credit.fechaCreacion.toDate()).toLocaleString() : 
                                    new Date(credit.fechaCreacion).toLocaleString()
                                  ) : 'N/A'
                                }
                              </p>
                              {activeCredit && activeCredit.id === credit.id && (
                                <p className="text-xs text-yellow-700 mt-1 font-medium">
                                  ✓ Crédito activo
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {activeCredit ? (
                    <div className="mt-8">
                      <h3 className="text-md font-semibold text-gray-800 mb-2">Detalles de Crédito Actual:</h3>
                      <p className="text-sm text-gray-600"><strong>ID Crédito:</strong> {activeCredit.id}</p>
                      <p className="text-sm text-gray-600"><strong>Número:</strong> {activeCredit.numeroCredito}</p>
                      <p className="text-sm text-gray-600"><strong>Estado:</strong> {activeCredit.estado}</p>

                      {/* Client Selector - Solo clientes con crédito */}
                      <div className="mt-4">
                        <label htmlFor="client-select" className="block text-sm font-medium text-gray-700 mb-1">
                          Seleccionar Cliente (Solo clientes con crédito activado):
                        </label>
                        <Select
                          id="client-select"
                          options={clientOptions}
                          value={selectedClientOption}
                          onChange={handleClientChange}
                          isClearable
                          placeholder="Buscar cliente con crédito..."
                          className="text-sm"
                          noOptionsMessage={() => "No hay clientes con crédito activado"}
                        />
                        {clientOptions.length === 0 && (
                          <p className="text-xs text-red-500 mt-1">
                            No hay clientes con la opción de crédito activada. 
                            Debe activar el crédito para al menos un cliente.
                          </p>
                        )}
                      </div>


                      {/* Lista de productos con scrollbar */}
                      <div className="flow-root mt-6">
                        <ul role="list" className="-my-6 divide-y divide-gray-200 max-h-96 overflow-y-auto">
                          {activeCreditItems.length === 0 ? (
                            <p className="py-6 text-center text-gray-500">No hay productos en este crédito.</p>
                          ) : (
                            activeCreditItems.map((item) => (
                              <li key={item.id} className="flex py-6">
                                <div className="ml-4 flex flex-1 flex-col">
                                  <div>
                                    <div className="flex justify-between text-base font-medium text-gray-900">
                                      <h3>{item.nombreProducto}</h3>
                                      <p className="ml-4">S/. {item.subtotal}</p>
                                    </div>
                                    <p className="mt-1 text-sm text-gray-500">
                                      Precio Unitario: S/. {parseFloat(item.precioVentaUnitario || 0).toFixed(2)}
                                    </p>
                                  </div>
                                  <div className="flex flex-1 items-end justify-between text-sm">
                                    <div className="flex items-center">
                                      <label htmlFor={`quantity-${item.id}`} className="sr-only">Cantidad</label>
                                      <input
                                        type="number"
                                        id={`quantity-${item.id}`}
                                        value={item.cantidad}
                                        onChange={(e) => {
                                          const newQty = parseInt(e.target.value);
                                          if (!isNaN(newQty) && newQty >= 0) {
                                            onUpdateItemQuantity(item.id, newQty, item.precioVentaUnitario);
                                          }
                                        }}
                                        min="0"
                                        className="w-16 rounded-md border border-gray-300 py-1.5 text-gray-900 shadow-sm focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm text-center"
                                      />
                                    </div>
                                    <div className="flex">
                                      <button
                                        type="button"
                                        className="font-medium text-red-600 hover:text-red-500"
                                        onClick={() => onRemoveItem(item.id, item.subtotal)}
                                      >
                                        Eliminar
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-8 text-center text-gray-500">
                      <p>No hay un crédito activo seleccionado.</p>
                      <p>Crea un nuevo crédito o selecciona uno de los pendientes arriba.</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 px-4 py-6 sm:px-6">
                  <div className="flex justify-between text-base font-medium text-gray-900">
                    <p>Subtotal:</p>
                    <p>S/. {activeCredit ? calculateTotal() : '0.00'}</p>
                  </div>
                  <div className="flex justify-between text-base font-medium text-gray-900 mt-2">
                    <p>Total Crédito:</p>
                    <p>S/. {activeCredit ? parseFloat(activeCredit.totalCredito || 0).toFixed(2) : '0.00'}</p>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-500">Este crédito quedará pendiente de pago.</p>
                  <div className="mt-6">
                    <button
                      onClick={handleFinalize}
                      className="flex items-center justify-center rounded-md border border-transparent bg-yellow-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-yellow-700 w-full disabled:bg-gray-400 disabled:cursor-not-allowed"
                      disabled={!activeCredit || activeCreditItems.length === 0 || !selectedClientOption}
                    >
                      Finalizar Crédito
                    </button>
                  </div>
                  <div className="mt-4 flex justify-center text-center text-sm text-gray-500">
                    <p>
                      o{' '}
                      <button
                        type="button"
                        className="font-medium text-yellow-600 hover:text-yellow-500"
                        onClick={onClose}
                      >
                        Continuar Comprando
                        <span aria-hidden="true"> &rarr;</span>
                      </button>
                    </p>
                  </div>
                </div>
                
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};

export default ActiveCreditPanel;