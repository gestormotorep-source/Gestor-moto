// pages/clientes/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { UserPlusIcon, UserIcon, GiftIcon } from '@heroicons/react/24/outline'; // Se añade GiftIcon para cumpleaños

const AddEditClientePage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();

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
    fechaNacimiento: '', // Nuevo campo para el cumpleaños (formato YYYY-MM-DD)
    tieneCredito: false, // Por defecto no tiene crédito
    montoCreditoActual: 0, // Por defecto 0
  });

  const isEditing = id !== 'nuevo';

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        router.push('/auth');
        return;
      }

      setLoading(true);
      setError(null);

      if (isEditing) {
        try {
          const clienteDocRef = doc(db, 'cliente', id); // Colección 'cliente' en singular
          const clienteDocSnap = await getDoc(clienteDocRef);

          if (clienteDocSnap.exists()) {
            const clienteData = clienteDocSnap.data();
            setFormData({
              nombre: clienteData.nombre || '',
              apellido: clienteData.apellido || '',
              dni: clienteData.dni || '',
              telefono: clienteData.telefono || '',
              email: clienteData.email || '',
              direccion: clienteData.direccion || '',
              fechaNacimiento: clienteData.fechaNacimiento || '', // Cargar fecha de nacimiento
              tieneCredito: clienteData.tieneCredito || false,
              montoCreditoActual: parseFloat(clienteData.montoCreditoActual || 0),
            });
          } else {
            setError('Cliente no encontrado.');
            router.push('/clientes');
          }
        } catch (err) {
          console.error("Error al cargar cliente:", err);
          setError("Error al cargar la información del cliente. Intente de nuevo.");
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false); // No loading if it's a new form
      }
    };

    fetchData();
  }, [id, isEditing, user, router]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Convertir montoCreditoActual a número si tiene crédito
    const dataToSave = {
      ...formData,
      montoCreditoActual: formData.tieneCredito ? parseFloat(formData.montoCreditoActual) : 0,
      updatedAt: serverTimestamp(),
    };

    // Validación básica
    if (!dataToSave.nombre || !dataToSave.apellido || !dataToSave.telefono || !dataToSave.dni) {
      setError('Por favor, complete al menos Nombre, Apellido, DNI y Teléfono.');
      setSaving(false);
      return;
    }
    if (isNaN(dataToSave.montoCreditoActual)) {
      setError('El monto de crédito debe ser un número válido.');
      setSaving(false);
      return;
    }

    try {
      if (isEditing) {
        await updateDoc(doc(db, 'cliente', id), dataToSave); // Colección 'cliente' en singular
        console.log("Cliente actualizado con ID: ", id);
      } else {
        dataToSave.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'cliente'), dataToSave); // Colección 'cliente' en singular
        console.log("Cliente agregado con ID: ", docRef.id);
      }
      router.push('/clientes');
    } catch (err) {
      console.error("Error al guardar cliente:", err);
      setError("Error al guardar el cliente. Verifique los campos e intente de nuevo. Detalle: " + err.message);
      if (err.code === 'permission-denied') {
        setError('No tiene permisos para realizar esta acción. Contacte al administrador.');
      }
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
      {/* Contenedor principal para margen */}
      <div className="flex flex-col mx-4 py-4">
        {/* Contenedor del card blanco */}
        <div className="w-full p-4 bg-white rounded-lg shadow-md flex flex-col">
          <h1 className="text-2xl font-bold mb-6 text-gray-800 flex items-center">
            {isEditing ? (
              <>
                <UserIcon className="h-7 w-7 text-green-500 mr-2" /> Editar Cliente: {formData.nombre} {formData.apellido}
              </>
            ) : (
              <>
                <UserPlusIcon className="h-7 w-7 text-green-500 mr-2" /> Agregar Nuevo Cliente
              </>
            )}
          </h1>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="nombre" className="block text-sm font-medium text-gray-700">Nombre</label>
                <input type="text" name="nombre" id="nombre" value={formData.nombre} onChange={handleChange} required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>
              <div>
                <label htmlFor="apellido" className="block text-sm font-medium text-gray-700">Apellido</label>
                <input type="text" name="apellido" id="apellido" value={formData.apellido} onChange={handleChange} required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>
              <div>
                <label htmlFor="dni" className="block text-sm font-medium text-gray-700">DNI</label>
                <input type="text" name="dni" id="dni" value={formData.dni} onChange={handleChange} required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>
              <div>
                <label htmlFor="telefono" className="block text-sm font-medium text-gray-700">Teléfono</label>
                <input type="tel" name="telefono" id="telefono" value={formData.telefono} onChange={handleChange} required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>
              <div> {/* Campo de Cumpleaños, ahora solo ocupa 1 columna */}
                <label htmlFor="fechaNacimiento" className="block text-sm font-medium text-gray-700 flex items-center">
                  <GiftIcon className="h-5 w-5 text-green-500 mr-2" />
                  Fecha de Nacimiento (Cumpleaños)
                </label>
                <input
                  type="date"
                  name="fechaNacimiento"
                  id="fechaNacimiento"
                  value={formData.fechaNacimiento}
                  onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Se usará para futuras notificaciones de cumpleaños.
                </p>
              </div>
              <div> {/* Email ahora está en la otra columna, al lado de Cumpleaños */}
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email (Opcional)</label>
                <input type="email" name="email" id="email" value={formData.email} onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>
              <div className="md:col-span-2"> {/* Dirección sí sigue ocupando 2 columnas para espacios más largos */}
                <label htmlFor="direccion" className="block text-sm font-medium text-gray-700">Dirección (Opcional)</label>
                <input type="text" name="direccion" id="direccion" value={formData.direccion} onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              </div>

              {/* Sección de Crédito */}
              <div className="md:col-span-2 bg-gray-50 p-4 rounded-md">
                <div className="flex items-center">
                  <input
                    id="tieneCredito"
                    name="tieneCredito"
                    type="checkbox"
                    checked={formData.tieneCredito}
                    onChange={handleChange}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <label htmlFor="tieneCredito" className="ml-2 block text-sm font-medium text-gray-900">
                    ¿Este cliente tiene crédito?
                  </label>
                </div>
                {formData.tieneCredito && (
                  <div className="mt-4">
                    <label htmlFor="montoCreditoActual" className="block text-sm font-medium text-gray-700">Monto de Crédito Actual</label>
                    <input type="number" name="montoCreditoActual" id="montoCreditoActual" value={formData.montoCreditoActual} onChange={handleChange} step="0.01"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                    <p className="mt-1 text-xs text-gray-500">Este es el monto actual que el cliente debe. Se actualizará en la sección de Créditos.</p>
                  </div>
                )}
              </div>
            </div>

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
                className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {isEditing ? 'Actualizando...' : 'Agregando...'}
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
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