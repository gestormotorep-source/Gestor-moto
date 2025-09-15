// pages/empleados/[id].js
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
import { ChevronLeftIcon, UserPlusIcon, UserIcon, BriefcaseIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';

const EmpleadoFormPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();

  const isEditing = id !== 'nuevo';

  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    email: '',
    telefono: '',
    puesto: '',
    fechaNacimiento: '', // Campo para la fecha de nacimiento
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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
          const empleadoDocRef = doc(db, 'empleado', id);
          const empleadoDocSnap = await getDoc(empleadoDocRef);

          if (empleadoDocSnap.exists()) {
            const empleadoData = empleadoDocSnap.data();
            setFormData({
              nombre: empleadoData.nombre || '',
              apellido: empleadoData.apellido || '',
              dni: empleadoData.dni || '',
              email: empleadoData.email || '',
              telefono: empleadoData.telefono || '',
              puesto: empleadoData.puesto || '',
              fechaNacimiento: empleadoData.fechaNacimiento || '', // Cargar la fecha de nacimiento
            });
          } else {
            setError('Empleado no encontrado.');
            router.push('/empleados');
          }
        } catch (err) {
          console.error("Error al cargar empleado:", err);
          setError("Error al cargar la información del empleado. Intente de nuevo.");
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false); // No hay carga si es un formulario nuevo
      }
    };

    fetchData();
  }, [id, isEditing, user, router]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const dataToSave = {
      ...formData,
      updatedAt: serverTimestamp(),
    };

    // Validación básica
    if (!dataToSave.nombre || !dataToSave.apellido || !dataToSave.dni || !dataToSave.puesto) {
      setError('Por favor, complete al menos Nombre, Apellido, DNI y Puesto.');
      setSaving(false);
      return;
    }

    try {
      if (isEditing) {
        await updateDoc(doc(db, 'empleado', id), dataToSave);
        console.log("Empleado actualizado con ID: ", id);
      } else {
        dataToSave.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'empleado'), dataToSave);
        console.log("Empleado agregado con ID: ", docRef.id);
      }
      router.push('/empleados');
    } catch (err) {
      console.error("Error al guardar empleado:", err);
      setError("Error al guardar el empleado. Verifique los campos e intente de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  if (!user || loading) {
    return (
      <Layout title={isEditing ? "Cargando Empleado" : "Cargando Formulario"}>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={isEditing ? "Editar Empleado" : "Agregar Empleado"}>
      <div className="flex flex-col mx-4 py-4">
        <div className="w-full p-4 bg-white rounded-lg shadow-md flex flex-col">
          <div className="flex items-center mb-4 justify-between">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center">
              {isEditing ? (
                <>
                  <UserIcon className="h-7 w-7 text-indigo-500 mr-2" /> Editar Empleado: {formData.nombre} {formData.apellido}
                </>
              ) : (
                <>
                  <UserPlusIcon className="h-7 w-7 text-indigo-500 mr-2" /> Agregar Nuevo Empleado
                </>
              )}
            </h1>
            <button
              onClick={() => router.push('/empleados')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-gray-600 bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              <ChevronLeftIcon className="-ml-1 mr-2 h-5 w-5" />
              Volver
            </button>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="nombre" className="block text-sm font-medium text-gray-700">Nombre</label>
                <input
                  type="text"
                  name="nombre"
                  id="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  required
                  autoComplete="given-name"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="apellido" className="block text-sm font-medium text-gray-700">Apellido</label>
                <input
                  type="text"
                  name="apellido"
                  id="apellido"
                  value={formData.apellido}
                  onChange={handleChange}
                  required
                  autoComplete="family-name"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="dni" className="block text-sm font-medium text-gray-700">DNI</label>
                <input
                  type="text"
                  name="dni"
                  id="dni"
                  value={formData.dni}
                  onChange={handleChange}
                  required
                  autoComplete="off"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="puesto" className="block text-sm font-medium text-gray-700 flex items-center">
                  <BriefcaseIcon className="h-5 w-5 text-indigo-500 mr-2" />
                  Puesto
                </label>
                <input
                  type="text"
                  name="puesto"
                  id="puesto"
                  value={formData.puesto}
                  onChange={handleChange}
                  required
                  autoComplete="organization-title"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email (Opcional)</label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  value={formData.email}
                  onChange={handleChange}
                  autoComplete="email"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="telefono" className="block text-sm font-medium text-gray-700">Teléfono (Opcional)</label>
                <input
                  type="tel"
                  name="telefono"
                  id="telefono"
                  value={formData.telefono}
                  onChange={handleChange}
                  autoComplete="tel"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              {/* Nuevo campo para la fecha de nacimiento */}
              <div>
                <label htmlFor="fechaNacimiento" className="block text-sm font-medium text-gray-700 flex items-center">
                  <CalendarDaysIcon className="h-5 w-5 text-indigo-500 mr-2" />
                  Fecha de Nacimiento
                </label>
                <input
                  type="date"
                  name="fechaNacimiento"
                  id="fechaNacimiento"
                  value={formData.fechaNacimiento}
                  onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Se usará para futuras notificaciones de cumpleaños.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                type="button"
                onClick={() => router.push('/empleados')}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${saving ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
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
                    {isEditing ? 'Actualizar Empleado' : 'Agregar Empleado'}
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

export default EmpleadoFormPage;
