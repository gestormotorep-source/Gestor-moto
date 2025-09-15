// pages/proveedores/[id].js
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
import { CloudArrowUpIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline'; // Añadido BuildingOfficeIcon

const AddEditProveedorPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    nombreEmpresa: '',
    contactoPrincipal: '',
    ruc: '',
    telefono: '',
    email: '',
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
          const proveedorDocRef = doc(db, 'proveedores', id);
          const proveedorDocSnap = await getDoc(proveedorDocRef);

          if (proveedorDocSnap.exists()) {
            const proveedorData = proveedorDocSnap.data();
            setFormData({
              nombreEmpresa: proveedorData.nombreEmpresa || '',
              contactoPrincipal: proveedorData.contactoPrincipal || '',
              ruc: proveedorData.ruc || '',
              telefono: proveedorData.telefono || '',
              email: proveedorData.email || '',
            });
          } else {
            setError('Proveedor no encontrado.');
            router.push('/proveedores');
          }
        } catch (err) {
          console.error("Error al cargar proveedor:", err);
          setError("Error al cargar la información del proveedor. Intente de nuevo.");
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

    try {
      const proveedorDataToSave = {
        ...formData,
        updatedAt: serverTimestamp(),
      };

      if (isEditing) {
        await updateDoc(doc(db, 'proveedores', id), proveedorDataToSave);
        console.log("Proveedor actualizado con ID: ", id);
      } else {
        proveedorDataToSave.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'proveedores'), proveedorDataToSave);
        console.log("Proveedor agregado con ID: ", docRef.id);
      }
      router.push('/proveedores');
    } catch (err) {
      console.error("Error al guardar proveedor:", err);
      setError("Error al guardar el proveedor. Verifique los campos e intente de nuevo. Detalle: " + err.message);
      if (err.code === 'permission-denied') {
        setError('No tiene permisos para realizar esta acción. Contacte al administrador.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!user || loading) {
    return (
      <Layout title={isEditing ? "Cargando Proveedor" : "Cargando Formulario"}>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={isEditing ? "Editar Proveedor" : "Agregar Proveedor"}>
      <div className="max-w-4xl mx-auto p-4 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">
          {isEditing ? `Editar Proveedor: ${formData.nombreEmpresa}` : 'Agregar Nuevo Proveedor'}
        </h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="nombreEmpresa" className="block text-sm font-medium text-gray-700">Nombre de la Empresa</label>
              <input type="text" name="nombreEmpresa" id="nombreEmpresa" value={formData.nombreEmpresa} onChange={handleChange} required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="contactoPrincipal" className="block text-sm font-medium text-gray-700">Contacto Principal</label>
              <input type="text" name="contactoPrincipal" id="contactoPrincipal" value={formData.contactoPrincipal} onChange={handleChange} required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="ruc" className="block text-sm font-medium text-gray-700">RUC</label>
              <input type="text" name="ruc" id="ruc" value={formData.ruc} onChange={handleChange} required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="telefono" className="block text-sm font-medium text-gray-700">Teléfono</label>
              <input type="tel" name="telefono" id="telefono" value={formData.telefono} onChange={handleChange} required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
              <input type="email" name="email" id="email" value={formData.email} onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>
          </div>

          <div className="flex justify-end space-x-4 mt-8">
            <button
              type="button"
              onClick={() => router.push('/proveedores')}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
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
                  <CloudArrowUpIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                  {isEditing ? 'Actualizar Proveedor' : 'Agregar Proveedor'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default AddEditProveedorPage;