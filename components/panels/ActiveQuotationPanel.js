// components/panels/ActiveQuotationPanel
import React, { Fragment, useState, useEffect, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Select from 'react-select';

const ActiveQuotationPanel = ({
  isOpen,
  onClose,
  activeQuotation,
  activeQuotationItems,
  clientes,
  empleados, // Nuevo prop para empleados
  setActiveQuotationId,
  onUpdateQuotationClient,
  onUpdateQuotationEmployee, // Nueva función para actualizar empleado
  onUpdateQuotationPlaca, // Nueva función para actualizar placa
  onRemoveItem,
  onUpdateItemQuantity,
  pendingQuotations,
  onSelectPendingQuotation,
  onUpdateQuotationPaymentMethod,
  onFinalizeQuotation,
}) => {
  const [selectedClientOption, setSelectedClientOption] = useState(null);
  const [selectedEmployeeOption, setSelectedEmployeeOption] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [placaMoto, setPlacaMoto] = useState('');

  // Estados y referencias para la funcionalidad de arrastrar el modal
  const panelRef = useRef(null);
  const isDraggingRef = useRef(false);
  const initialMousePosRef = useRef({ x: 0, y: 0 });
  const initialPanelPosRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(null);

  // Sincroniza la selección del cliente, empleado, método de pago y placa con la cotización activa
  useEffect(() => {
    if (activeQuotation) {
      // Sincronizar cliente
      if (clientes.length > 0) {
        const currentClient = clientes.find(c => c.id === activeQuotation.clienteId);
        if (currentClient) {
          setSelectedClientOption({
            value: currentClient.id,
            label: `${currentClient.nombre} ${currentClient.apellido || ''} - ${currentClient.dni || ''}`.trim()
          });
        } else {
          setSelectedClientOption(null);
        }
      }

      // Sincronizar empleado
      if (empleados && empleados.length > 0) {
        const currentEmployee = empleados.find(e => e.id === activeQuotation.empleadoAsignadoId);
        if (currentEmployee) {
          setSelectedEmployeeOption({
            value: currentEmployee.id,
            label: `${currentEmployee.nombre} ${currentEmployee.apellido || ''} - ${currentEmployee.puesto || ''}`.trim()
          });
        } else {
          setSelectedEmployeeOption(null);
        }
      }
      
      // Sincronizar método de pago
      setSelectedPaymentMethod(activeQuotation.metodoPago || '');

      // Sincronizar placa de moto
      setPlacaMoto(activeQuotation.placaMoto || '');
    } else {
      setSelectedClientOption(null);
      setSelectedEmployeeOption(null);
      setSelectedPaymentMethod('');
      setPlacaMoto('');
    }
  }, [activeQuotation, clientes, empleados]);

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
    if (activeQuotation) {
      onUpdateQuotationClient(activeQuotation.id, selectedOption ? selectedOption.value : null);
    }
  };

  const handleEmployeeChange = (selectedOption) => {
    setSelectedEmployeeOption(selectedOption);
    if (activeQuotation) {
      onUpdateQuotationEmployee(activeQuotation.id, selectedOption ? selectedOption.value : null);
    }
  };

  const handlePaymentMethodChange = (e) => {
    const method = e.target.value;
    setSelectedPaymentMethod(method);
    if (activeQuotation) {
      onUpdateQuotationPaymentMethod(activeQuotation.id, method);
    }
  };

  const handlePlacaChange = (e) => {
    const placa = e.target.value;
    setPlacaMoto(placa);
    if (activeQuotation) {
      onUpdateQuotationPlaca(activeQuotation.id, placa);
    }
  };
  
  const handleFinalize = () => {
    if (!activeQuotation) {
      console.error("No hay una cotización activa para finalizar.");
      return;
    }
    if (activeQuotationItems.length === 0) {
      console.error("La cotización no puede estar vacía para finalizar.");
      return;
    }
    if (!selectedClientOption || !selectedClientOption.value) {
      console.error("Por favor, selecciona un cliente para finalizar la cotización.");
      return;
    }
    onFinalizeQuotation(activeQuotation.id, selectedPaymentMethod);
  };

  const calculateTotal = () => {
    return activeQuotationItems.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0).toFixed(2);
  };

  const clientOptions = clientes.map(cliente => ({
    value: cliente.id,
    label: `${cliente.nombre} ${cliente.apellido || ''} - ${cliente.dni || ''}`.trim()
  }));

  const employeeOptions = empleados ? empleados.map(empleado => ({
    value: empleado.id,
    label: `${empleado.nombre} ${empleado.apellido || ''} - ${empleado.puesto || ''}`.trim()
  })) : [];

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
                
                <div
                  className="drag-handle relative px-4 pt-5 sm:px-6 bg-gray-100 cursor-grab active:cursor-grabbing"
                  onMouseDown={handleMouseDown}
                >
                  <div className="flex items-center justify-between">
                    <Dialog.Title className="text-lg font-medium text-gray-900">
                      Panel de Cotización Activa
                    </Dialog.Title>
                    <button
                      type="button"
                      className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                      onClick={onClose}
                    >
                      <span className="sr-only">Cerrar</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="px-4 py-6 sm:px-6">
                  {/* SECCIÓN: Cotizaciones Pendientes */}
                  <div className="border-b pb-4">
                    <h3 className="text-md font-semibold text-gray-800 mb-2">Cotizaciones Pendientes</h3>
                    {pendingQuotations.length === 0 ? (
                      <p className="text-sm text-gray-500">No hay cotizaciones pendientes.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {pendingQuotations.map(quote => (
                          <div
                            key={quote.id}
                            className={`p-2 border rounded-md text-sm cursor-pointer ${activeQuotation && activeQuotation.id === quote.id ? 'bg-blue-100 border-blue-500 font-medium' : 'bg-gray-50 hover:bg-gray-100'}`}
                            onClick={() => onSelectPendingQuotation(quote.id)}
                          >
                            <p><strong>Número:</strong> {quote.numeroCotizacion}</p>
                            <p><strong>Cliente:</strong> {quote.clienteNombre}</p>
                            <p><strong>Total:</strong> S/. {parseFloat(quote.totalCotizacion || 0).toFixed(2)}</p>
                            <p className="text-xs text-gray-500">
                              Creada: {quote.fechaCreacion ? new Date(quote.fechaCreacion.toDate()).toLocaleString() : 'N/A'}
                            </p>
                            {activeQuotation && activeQuotation.id === quote.id && <p className="text-xs text-blue-700 mt-1">Cotización activa</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {activeQuotation ? (
                    <div className="mt-8">
                      <h3 className="text-md font-semibold text-gray-800 mb-2">Detalles de Cotización Actual:</h3>
                      <p className="text-sm text-gray-600"><strong>ID Cotización:</strong> {activeQuotation.id}</p>
                      <p className="text-sm text-gray-600"><strong>Número:</strong> {activeQuotation.numeroCotizacion}</p>

                      {/* Client Selector */}
                      <div className="mt-4">
                        <label htmlFor="client-select" className="block text-sm font-medium text-gray-700 mb-1">
                          Seleccionar Cliente:
                        </label>
                        <Select
                          id="client-select"
                          options={clientOptions}
                          value={selectedClientOption}
                          onChange={handleClientChange}
                          isClearable
                          placeholder="Buscar o seleccionar cliente..."
                          className="text-sm"
                        />
                      </div>

                      {/* Employee Selector */}
                      <div className="mt-4">
                        <label htmlFor="employee-select" className="block text-sm font-medium text-gray-700 mb-1">
                          Empleado Asignado (Opcional):
                        </label>
                        <Select
                          id="employee-select"
                          options={employeeOptions}
                          value={selectedEmployeeOption}
                          onChange={handleEmployeeChange}
                          isClearable
                          placeholder="Buscar o seleccionar empleado..."
                          className="text-sm"
                        />
                      </div>

                      {/* Placa Moto Field */}
                      <div className="mt-4">
                        <label htmlFor="placa-moto" className="block text-sm font-medium text-gray-700 mb-1">
                          Placa de Moto (Opcional):
                        </label>
                        <input
                          type="text"
                          id="placa-moto"
                          value={placaMoto}
                          onChange={handlePlacaChange}
                          placeholder="Ej: ABC-123"
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                      </div>

                      {/* Payment Method Selector */}
                      <div className="mt-4">
                        <label htmlFor="payment-method-select" className="block text-sm font-medium text-gray-700 mb-1">
                          Método de Pago:
                        </label>
                        <select
                          id="payment-method-select"
                          value={selectedPaymentMethod}
                          onChange={handlePaymentMethodChange}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                          {paymentMethodOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Lista de productos con scrollbar */}
                      <div className="flow-root mt-6">
                        <ul role="list" className="-my-6 divide-y divide-gray-200 max-h-96 overflow-y-auto">
                          {activeQuotationItems.length === 0 ? (
                            <p className="py-6 text-center text-gray-500">No hay productos en esta cotización.</p>
                          ) : (
                            activeQuotationItems.map((item) => (
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
                                        className="w-16 rounded-md border border-gray-300 py-1.5 text-gray-900 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-center"
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
                      <p>No hay una cotización activa seleccionada.</p>
                      <p>Crea una nueva cotización o selecciona una de las pendientes.</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 px-4 py-6 sm:px-6">
                  <div className="flex justify-between text-base font-medium text-gray-900">
                    <p>Subtotal:</p>
                    <p>S/. {activeQuotation ? calculateTotal() : '0.00'}</p>
                  </div>
                  <div className="flex justify-between text-base font-medium text-gray-900 mt-2">
                    <p>Total Cotización:</p>
                    <p>S/. {activeQuotation ? parseFloat(activeQuotation.totalCotizacion || 0).toFixed(2) : '0.00'}</p>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-500">El IGV y otros impuestos se aplicarán al finalizar.</p>
                  <div className="mt-6">
                    <button
                      onClick={handleFinalize}
                      className="flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700 w-full"
                      disabled={!activeQuotation || activeQuotationItems.length === 0}
                    >
                      Finalizar Cotización
                    </button>
                  </div>
                  <div className="mt-4 flex justify-center text-center text-sm text-gray-500">
                    <p>
                      o{' '}
                      <button
                        type="button"
                        className="font-medium text-indigo-600 hover:text-indigo-500"
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

export default ActiveQuotationPanel;  