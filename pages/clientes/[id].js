// pages/clientes/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { useSucursal } from '../../contexts/SucursalContext';
import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { UserPlusIcon, UserIcon, GiftIcon, CreditCardIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const AddEditClientePage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const { db } = useSucursal();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    telefono: '',
    email: '',
    direccion: '',
    fechaNacimiento: '',
    tieneCredito: false,
    montoCreditoActual: 0,
    creditoMaximo: 0,
  });

  const isEditing = id !== 'nuevo';

  useEffect(() => {
    const fetchData = async () => {
      if (!user) { router.push('/auth'); return; }
      setLoading(true);
      setError(null);

      if (isEditing) {
        try {
          const clienteDocRef = doc(db, 'cliente', id);
          const clienteDocSnap = await getDoc(clienteDocRef);
          if (clienteDocSnap.exists()) {
            const d = clienteDocSnap.data();
            setFormData({
              nombre: d.nombre || '',
              apellido: d.apellido || '',
              dni: d.dni || '',
              telefono: d.telefono || '',
              email: d.email || '',
              direccion: d.direccion || '',
              fechaNacimiento: d.fechaNacimiento || '',
              tieneCredito: d.tieneCredito || false,
              montoCreditoActual: parseFloat(d.montoCreditoActual || 0),
              creditoMaximo: parseFloat(d.creditoMaximo || 0),
            });
          } else {
            setError('Cliente no encontrado.');
            router.push('/clientes');
          }
        } catch (err) {
          setError("Error al cargar la información del cliente.");
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, isEditing, user, router, db]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!formData.nombre || !formData.apellido || !formData.telefono || !formData.dni) {
      setError('Por favor, complete al menos Nombre, Apellido, DNI y Teléfono.');
      setSaving(false);
      return;
    }

    const creditoMaximo = parseFloat(formData.creditoMaximo || 0);
    if (formData.tieneCredito && creditoMaximo <= 0) {
      setError('Debe establecer un crédito máximo mayor a 0 para clientes con crédito.');
      setSaving(false);
      return;
    }

    const dataToSave = {
      nombre: formData.nombre,
      apellido: formData.apellido,
      dni: formData.dni,
      telefono: formData.telefono,
      email: formData.email,
      direccion: formData.direccion,
      fechaNacimiento: formData.fechaNacimiento,
      tieneCredito: formData.tieneCredito,
      // montoCreditoActual NUNCA se toca desde aquí en edición
      // solo se inicializa en 0 al crear
      creditoMaximo: formData.tieneCredito ? creditoMaximo : 0,
      updatedAt: serverTimestamp(),
    };

    try {
      if (isEditing) {
        // No sobreescribir montoCreditoActual al editar
        await updateDoc(doc(db, 'cliente', id), dataToSave);
      } else {
        // Solo al crear, inicializar en 0
        await addDoc(collection(db, 'cliente'), {
          ...dataToSave,
          montoCreditoActual: 0,
          createdAt: serverTimestamp(),
        });
      }
      router.push('/clientes');
    } catch (err) {
      setError("Error al guardar el cliente: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!user || loading) {
    return (
      <Layout title={isEditing ? "Cargando Cliente" : "Cargando Formulario"}>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={isEditing ? "Editar Cliente" : "Agregar Cliente"}>
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-4 bg-white rounded-lg shadow-md flex flex-col">
          <h1 className="text-2xl font-bold mb-6 text-gray-800 flex items-center">
            {isEditing ? (
              <><UserIcon className="h-7 w-7 text-green-500 mr-2" /> Editar Cliente: {formData.nombre} {formData.apellido}</>
            ) : (
              <><UserPlusIcon className="h-7 w-7 text-green-500 mr-2" /> Agregar Nuevo Cliente</>
            )}
          </h1>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Nombre */}
              <div>
                <label htmlFor="nombre" className="block text-sm font-medium text-gray-700">Nombre</label>
                <input type="text" name="nombre" id="nombre" value={formData.nombre} onChange={handleChange} required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>

              {/* Apellido */}
              <div>
                <label htmlFor="apellido" className="block text-sm font-medium text-gray-700">Apellido</label>
                <input type="text" name="apellido" id="apellido" value={formData.apellido} onChange={handleChange} required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>

              {/* DNI */}
              <div>
                <label htmlFor="dni" className="block text-sm font-medium text-gray-700">DNI</label>
                <input type="text" name="dni" id="dni" value={formData.dni} onChange={handleChange} required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>

              {/* Teléfono */}
              <div>
                <label htmlFor="telefono" className="block text-sm font-medium text-gray-700">Teléfono</label>
                <input type="tel" name="telefono" id="telefono" value={formData.telefono} onChange={handleChange} required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>

              {/* Fecha de Nacimiento */}
              <div>
                <label htmlFor="fechaNacimiento" className="block text-sm font-medium text-gray-700 flex items-center">
                  <GiftIcon className="h-5 w-5 text-green-500 mr-2" />
                  Fecha de Nacimiento
                </label>
                <input type="date" name="fechaNacimiento" id="fechaNacimiento" value={formData.fechaNacimiento} onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                <p className="mt-1 text-xs text-gray-500">Para notificaciones de cumpleaños.</p>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email (Opcional)</label>
                <input type="email" name="email" id="email" value={formData.email} onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>

              {/* Dirección */}
              <div className="md:col-span-2">
                <label htmlFor="direccion" className="block text-sm font-medium text-gray-700">Dirección (Opcional)</label>
                <input type="text" name="direccion" id="direccion" value={formData.direccion} onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>

              {/* Sección de Crédito */}
              <div className="md:col-span-2">
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  
                  {/* Header de la sección */}
                  <div className="bg-gray-50 px-5 py-4 border-b border-gray-200 flex items-center gap-3">
                    <CreditCardIcon className="h-5 w-5 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Configuración de Crédito</span>
                  </div>

                  <div className="p-5">
                    {/* Toggle de crédito - estilo moderno */}
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-sm font-medium text-gray-800">¿Este cliente tiene crédito habilitado?</p>
                        <p className="text-xs text-gray-500 mt-0.5">Permite realizar ventas a crédito y controlar su límite</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, tieneCredito: !prev.tieneCredito }))}
                        className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                          formData.tieneCredito ? 'bg-green-500' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            formData.tieneCredito ? 'translate-x-7' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Campos de crédito - solo visibles si tieneCredito */}
                    {formData.tieneCredito && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-gray-100">

                        {/* Crédito Máximo */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <label htmlFor="creditoMaximo" className="block text-sm font-semibold text-blue-800 mb-1 flex items-center gap-2">
                            <ShieldCheckIcon className="h-4 w-4" />
                            Crédito Máximo (S/.)
                          </label>
                          <input
                            type="number"
                            name="creditoMaximo"
                            id="creditoMaximo"
                            value={formData.creditoMaximo}
                            onChange={handleChange}
                            min="0"
                            step="0.01"
                            onWheel={(e) => e.target.blur()}
                            className="mt-1 block w-full px-3 py-2 border border-blue-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                          />
                          <p className="mt-2 text-xs text-blue-700">
                            Límite máximo de deuda permitida. No se podrán registrar ventas a crédito que superen este monto.
                          </p>
                        </div>

                        {/* Deuda actual - solo lectura en edición */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <label className="block text-sm font-semibold text-gray-600 mb-1 flex items-center gap-2">
                            <CreditCardIcon className="h-4 w-4" />
                            Deuda Actual (S/.)
                          </label>
                          <div className="mt-1 flex items-center">
                            <span className={`text-2xl font-bold ${
                              formData.montoCreditoActual > 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              S/. {parseFloat(formData.montoCreditoActual || 0).toFixed(2)}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-gray-500">
                            {isEditing
                              ? 'La deuda actual se actualiza automáticamente desde el módulo de Créditos. No es editable aquí.'
                              : 'Se iniciará en S/. 0.00 al crear el cliente. Se irá sumando desde el módulo de Créditos.'
                            }
                          </p>
                          {/* Barra de progreso si hay crédito máximo */}
                          {formData.creditoMaximo > 0 && (
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-gray-500 mb-1">
                                <span>Uso del crédito</span>
                                <span>{Math.min(100, Math.round((formData.montoCreditoActual / formData.creditoMaximo) * 100))}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all ${
                                    (formData.montoCreditoActual / formData.creditoMaximo) >= 0.9
                                      ? 'bg-red-500'
                                      : (formData.montoCreditoActual / formData.creditoMaximo) >= 0.6
                                      ? 'bg-yellow-500'
                                      : 'bg-green-500'
                                  }`}
                                  style={{ width: `${Math.min(100, (formData.montoCreditoActual / formData.creditoMaximo) * 100)}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>S/. 0</span>
                                <span>S/. {parseFloat(formData.creditoMaximo).toFixed(2)}</span>
                              </div>
                            </div>
                          )}
                        </div>

                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Botones */}
            <div className="flex justify-end space-x-4 mt-8">
              <button
                type="button"
                onClick={() => router.push('/clientes')}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {isEditing ? 'Actualizando...' : 'Agregando...'}
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="-ml-1 mr-2 h-5 w-5" />
                    {isEditing ? 'Actualizar Cliente' : 'Agregar Cliente'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default AddEditClientePage;  