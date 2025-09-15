import { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { 
  XMarkIcon, 
  CurrencyDollarIcon,
  CreditCardIcon,
  BanknotesIcon,
  DevicePhoneMobileIcon,
  PlusIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

const PAYMENT_METHODS = [
  {
    method: 'efectivo',
    label: 'EFECTIVO',
    icon: '💵'
  },
  {
    method: 'tarjeta',
    label: 'TARJETA',
    icon: '💳'
  },
  {
    method: 'transferencia',
    label: 'TRANSFERENCIA',
    icon: '🏦'
  },
  {
    method: 'yape',
    label: 'YAPE',
    icon: '📱'
  },
  {
    method: 'plin',
    label: 'PLIN',
    icon: '📱'
  }
];

const MixedPaymentModal = ({ 
  isOpen, 
  onClose, 
  totalAmount, 
  onPaymentConfirm, 
  initialPaymentMethod = 'efectivo' 
}) => {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [isMixedPayment, setIsMixedPayment] = useState(false);
  const [error, setError] = useState('');

  // Inicializar métodos de pago cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      const initialMethod = PAYMENT_METHODS.find(pm => pm.method === initialPaymentMethod) || PAYMENT_METHODS[0];
      setPaymentMethods([
        {
          ...initialMethod,
          amount: totalAmount
        }
      ]);
      setIsMixedPayment(false);
      setError('');
    }
  }, [isOpen, totalAmount, initialPaymentMethod]);

  // Agregar nuevo método de pago
  const addPaymentMethod = () => {
    // Encontrar un método que no esté siendo usado
    const usedMethods = paymentMethods.map(pm => pm.method);
    const availableMethod = PAYMENT_METHODS.find(pm => !usedMethods.includes(pm.method));
    
    if (availableMethod) {
      setPaymentMethods(prev => [
        ...prev,
        {
          ...availableMethod,
          amount: 0
        }
      ]);
      setIsMixedPayment(true);
    }
  };

  // Remover método de pago
  const removePaymentMethod = (index) => {
    if (paymentMethods.length > 1) {
      const newMethods = paymentMethods.filter((_, i) => i !== index);
      setPaymentMethods(newMethods);
      
      if (newMethods.length === 1) {
        setIsMixedPayment(false);
      }
    }
  };

  // Cambiar método de pago
  const changePaymentMethod = (index, newMethod) => {
    const methodData = PAYMENT_METHODS.find(pm => pm.method === newMethod);
    if (methodData) {
      const newMethods = [...paymentMethods];
      newMethods[index] = {
        ...methodData,
        amount: newMethods[index].amount
      };
      setPaymentMethods(newMethods);
    }
  };

  // Cambiar monto de un método de pago
  const changePaymentAmount = (index, amount) => {
    const numAmount = parseFloat(amount) || 0;
    if (numAmount >= 0) {
      const newMethods = [...paymentMethods];
      newMethods[index].amount = numAmount;
      setPaymentMethods(newMethods);
    }
  };

  // Calcular totales
  const totalPaid = paymentMethods.reduce((sum, pm) => sum + pm.amount, 0);
  const remaining = totalAmount - totalPaid;
  const isBalanced = Math.abs(remaining) < 0.01;

  // Confirmar pago
  const handleConfirm = () => {
    setError('');

    // Validaciones
    if (totalPaid <= 0) {
      setError('El monto total del pago debe ser mayor a 0.');
      return;
    }

    if (!isBalanced) {
      setError(`El pago no está balanceado. Falta: S/. ${remaining.toFixed(2)}`);
      return;
    }

    // Validar que todos los métodos tengan monto > 0
    const validMethods = paymentMethods.filter(pm => pm.amount > 0);
    if (validMethods.length === 0) {
      setError('Debe asignar un monto a al menos un método de pago.');
      return;
    }

    // Crear datos de pago
    const paymentData = {
      totalAmount: totalAmount,
      paymentMethods: validMethods,
      isMixedPayment: validMethods.length > 1
    };

    onPaymentConfirm(paymentData);
  };

  // Auto-distribuir el monto restante en el último método
  const autoDistribute = () => {
    if (paymentMethods.length > 0 && remaining > 0) {
      const newMethods = [...paymentMethods];
      const lastIndex = newMethods.length - 1;
      newMethods[lastIndex].amount += remaining;
      setPaymentMethods(newMethods);
    }
  };

  // Obtener métodos disponibles para agregar
  const getAvailableMethods = () => {
    const usedMethods = paymentMethods.map(pm => pm.method);
    return PAYMENT_METHODS.filter(pm => !usedMethods.includes(pm.method));
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
                  className="text-lg font-medium leading-6 text-gray-900 flex items-center justify-between"
                >
                  <span className="flex items-center">
                    <CreditCardIcon className="h-6 w-6 mr-2 text-blue-600" />
                    Configurar Pago
                  </span>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600"
                    onClick={onClose}
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </Dialog.Title>

                <div className="mt-4">
                  {/* Información del total */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Total a pagar:</span>
                      <span className="text-xl font-bold text-gray-900">S/. {totalAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Error message */}
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                      <span className="text-sm">{error}</span>
                    </div>
                  )}

                  {/* Métodos de pago */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        Métodos de pago:
                      </label>
                      {getAvailableMethods().length > 0 && (
                        <button
                          type="button"
                          onClick={addPaymentMethod}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-full text-blue-700 bg-blue-100 hover:bg-blue-200"
                        >
                          <PlusIcon className="h-4 w-4 mr-1" />
                          Agregar
                        </button>
                      )}
                    </div>

                    {paymentMethods.map((pm, index) => (
                      <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                        <span className="text-lg">{pm.icon}</span>
                        
                        <select
                          value={pm.method}
                          onChange={(e) => changePaymentMethod(index, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                        >
                          {PAYMENT_METHODS.map((method) => {
                            const isUsed = paymentMethods.some((p, i) => i !== index && p.method === method.method);
                            return (
                              <option 
                                key={method.method} 
                                value={method.method}
                                disabled={isUsed}
                              >
                                {method.label}
                              </option>
                            );
                          })}
                        </select>

                        <div className="flex items-center">
                          <span className="text-sm text-gray-500 mr-2">S/.</span>
                          <input
                            type="number"
                            value={pm.amount}
                            onChange={(e) => changePaymentAmount(index, e.target.value)}
                            min="0"
                            step="0.01"
                            className="w-24 px-2 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm text-right"
                            placeholder="0.00"
                          />
                        </div>

                        {paymentMethods.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePaymentMethod(index)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Resumen del pago */}
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total pagado:</span>
                      <span className="font-medium">S/. {totalPaid.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Restante:</span>
                      <span className={`font-medium ${remaining > 0.01 ? 'text-red-600' : remaining < -0.01 ? 'text-orange-600' : 'text-green-600'}`}>
                        S/. {remaining.toFixed(2)}
                      </span>
                    </div>
                    {remaining > 0.01 && (
                      <button
                        type="button"
                        onClick={autoDistribute}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Auto-completar restante
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex space-x-3">
                  <button
                    type="button"
                    className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    onClick={onClose}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!isBalanced || totalPaid <= 0}
                    className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CurrencyDollarIcon className="h-4 w-4 mr-2" />
                    Confirmar Pago
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

export default MixedPaymentModal;   