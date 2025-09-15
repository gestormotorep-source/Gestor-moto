import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db, storage } from '../../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { PhotoIcon, TrashIcon, XMarkIcon, PlusIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';

const AddEditProductoPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const DEFAULT_STOCK_UMBRAL = 4; // Valor por defecto para el umbral de stock bajo

  // Estado del formulario para un producto
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    medida: '',
    marca: '',
    codigoTienda: '',
    codigoProveedor: '',
    precioCompraDefault: 0,
    precioVentaDefault: 0,
    precioVentaMinimo: 0, // NUEVO CAMPO: Precio de venta mínimo
    stockActual: 0,
    stockReferencialUmbral: DEFAULT_STOCK_UMBRAL,
    ubicacion: '',
    imageUrls: [], // CAMBIO: Ahora es un array para múltiples imágenes
    modelosCompatiblesTexto: '',
    descripcionPuntos: '',
    color: '',
  });

  const [selectedImageFiles, setSelectedImageFiles] = useState([]); // CAMBIO: Array para múltiples archivos
  const [imagePreviewUrls, setImagePreviewUrls] = useState([]); // CAMBIO: Array para múltiples previsualizaciones

  const isEditing = id !== 'nuevo';

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        router.push('/auth');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        if (isEditing) {
          const productDocRef = doc(db, 'productos', id);
          const productDocSnap = await getDoc(productDocRef);

          if (productDocSnap.exists()) {
            const productData = productDocSnap.data();
            setFormData({
              nombre: productData.nombre || '',
              descripcion: productData.descripcion || '',
              medida: productData.medida || '',
              marca: productData.marca || '',
              codigoTienda: productData.codigoTienda || '',
              codigoProveedor: productData.codigoProveedor || '',
              precioCompraDefault: productData.precioCompraDefault || 0,
              precioVentaDefault: productData.precioVentaDefault || 0,
              precioVentaMinimo: productData.precioVentaMinimo || 0, // NUEVO: Carga precio mínimo
              stockActual: productData.stockActual || 0,
              stockReferencialUmbral: productData.stockReferencialUmbral ?? DEFAULT_STOCK_UMBRAL,
              ubicacion: productData.ubicacion || '',
              // CAMBIO: Manejo de múltiples imágenes - compatibilidad con el campo anterior
              imageUrls: productData.imageUrls || (productData.imageUrl ? [productData.imageUrl] : []),
              modelosCompatiblesTexto: productData.modelosCompatiblesTexto || '',
              descripcionPuntos: productData.descripcionPuntos || productData.descripcion || '',
              color: productData.color || '',
            });
            // CAMBIO: Configurar previsualizaciones de imágenes existentes
            setImagePreviewUrls(productData.imageUrls || (productData.imageUrl ? [productData.imageUrl] : []));
          } else {
            setError('Producto no encontrado.');
            router.push('/productos');
          }
        } else {
          setFormData(prev => ({
            ...prev,
            stockReferencialUmbral: DEFAULT_STOCK_UMBRAL,
            modelosCompatiblesTexto: '',
            descripcionPuntos: '',
            color: '',
            precioVentaMinimo: 0, // Inicializa precio mínimo para nuevo producto
            imageUrls: [], // Inicializa array vacío para nuevas imágenes
          }));
          setImagePreviewUrls([]); // Inicializa previsualizaciones vacías
        }
      } catch (err) {
        console.error("Error al cargar datos:", err);
        setError("Error al cargar la información. Intente de nuevo.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, isEditing, user, router]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value,
    }));
  };

  // NUEVO: Manejo de múltiples imágenes
  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    const currentImageCount = selectedImageFiles.length + imagePreviewUrls.length - selectedImageFiles.length;
    
    // Verificar que no se excedan las 3 imágenes
    if (currentImageCount + files.length > 3) {
      setError('Máximo 3 imágenes permitidas');
      return;
    }

    setError(null);
    
    const newFiles = [...selectedImageFiles, ...files];
    const newPreviews = [...imagePreviewUrls];
    
    files.forEach(file => {
      newPreviews.push(URL.createObjectURL(file));
    });

    setSelectedImageFiles(newFiles);
    setImagePreviewUrls(newPreviews);
  };

  // NUEVO: Remover imagen específica por índice
  const handleRemoveImage = (indexToRemove) => {
    const newPreviews = imagePreviewUrls.filter((_, index) => index !== indexToRemove);
    const newFiles = selectedImageFiles.filter((_, index) => index !== indexToRemove);
    
    // Si es una imagen existente (no un archivo nuevo), agregarla a la lista de imágenes a eliminar
    const imageToRemove = imagePreviewUrls[indexToRemove];
    if (formData.imageUrls.includes(imageToRemove)) {
      // Actualizar formData para remover la URL de la imagen
      const updatedImageUrls = formData.imageUrls.filter(url => url !== imageToRemove);
      setFormData(prev => ({ ...prev, imageUrls: updatedImageUrls }));
    }
    
    setImagePreviewUrls(newPreviews);
    setSelectedImageFiles(newFiles);
  };

  const uploadImage = async (file, productId) => {
    if (!file) return null;
    const timestamp = Date.now();
    const filePath = `productos/${productId}-${timestamp}-${file.name}`;
    const imageRef = storageRef(storage, filePath);
    await uploadBytes(imageRef, file);
    return await getDownloadURL(imageRef);
  };

  const handleDeleteOldImages = async (oldImageUrls) => {
    if (!oldImageUrls || oldImageUrls.length === 0) return;
    
    for (const imageUrl of oldImageUrls) {
      try {
        const oldImageRef = storageRef(storage, imageUrl);
        await deleteObject(oldImageRef);
        console.log('Antigua imagen eliminada de Storage:', imageUrl);
      } catch (err) {
        console.warn('No se pudo eliminar la antigua imagen de Storage:', err);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      // Validación del precio mínimo
      if (formData.precioVentaMinimo > formData.precioVentaDefault) {
        setError('El precio de venta mínimo no puede ser mayor al precio de venta default');
        setSaving(false);
        return;
      }

      let finalImageUrls = [...formData.imageUrls];

      // Subir nuevas imágenes si existen
      if (selectedImageFiles.length > 0) {
        const productId = isEditing ? id : Date.now().toString();
        
        for (const file of selectedImageFiles) {
          const uploadedUrl = await uploadImage(file, productId);
          if (uploadedUrl) {
            finalImageUrls.push(uploadedUrl);
          }
        }
      }

      // Si estamos editando y había imágenes que se eliminaron, borrarlas del storage
      if (isEditing) {
        const originalImages = formData.imageUrls;
        const currentImages = imagePreviewUrls.filter(url => originalImages.includes(url));
        const imagesToDelete = originalImages.filter(url => !currentImages.includes(url));
        
        if (imagesToDelete.length > 0) {
          await handleDeleteOldImages(imagesToDelete);
        }
      }

      const productDataToSave = {
        ...formData,
        imageUrls: finalImageUrls,
        precioVentaMinimo: formData.precioVentaMinimo, // NUEVO: Guardar precio mínimo
        // Mantener compatibilidad con el campo anterior
        imageUrl: finalImageUrls.length > 0 ? finalImageUrls[0] : '',
        modelosCompatiblesIds: [],
        modelosCompatiblesTexto: formData.modelosCompatiblesTexto,
        descripcionPuntos: formData.descripcionPuntos,
        color: formData.color,
        updatedAt: serverTimestamp(),
      };

      if (!isEditing) {
        productDataToSave.createdAt = serverTimestamp();
      }

      if (isEditing) {
        await updateDoc(doc(db, 'productos', id), {
            ...productDataToSave,
            descripcion: productDataToSave.descripcionPuntos,
        });
        console.log("Producto actualizado con ID: ", id);
      } else {
        const docRef = await addDoc(collection(db, 'productos'), {
            ...productDataToSave,
            descripcion: productDataToSave.descripcionPuntos,
        });
        console.log("Producto agregado con ID: ", docRef.id);
      }
      router.push('/productos');
    } catch (err) {
      console.error("Error al guardar producto:", err);
      setError("Error al guardar el producto. Verifique los campos e intente de nuevo. Detalle: " + err.message);
      if (err.code === 'permission-denied') {
        setError('No tiene permisos para realizar esta acción. Contacte al administrador.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!user || loading) {
    return (
      <Layout title={isEditing ? "Cargando Producto" : "Cargando Formulario"}>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={isEditing ? "Editar Producto" : "Agregar Producto"}>
      <div className="max-w-4xl mx-auto p-4 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">
          {isEditing ? `Editar Producto: ${formData.nombre}` : 'Agregar Nuevo Producto'}
        </h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sección de Información Básica */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="nombre" className="block text-sm font-medium text-gray-700">Nombre del Producto</label>
              <input type="text" name="nombre" id="nombre" value={formData.nombre} onChange={handleChange} required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="marca" className="block text-sm font-medium text-gray-700">Marca</label>
              <input type="text" name="marca" id="marca" value={formData.marca} onChange={handleChange} required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="descripcionPuntos" className="block text-sm font-medium text-gray-700">Descripción por Puntos</label>
              <p className="text-sm text-gray-500 mb-2">Ingrese cada punto en una nueva línea.</p>
              <textarea name="descripcionPuntos" id="descripcionPuntos" rows="4" value={formData.descripcionPuntos} onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Ej:&#10; - Material de alta calidad&#10; - Resistente a la corrosión&#10; - Fácil de instalar"
              ></textarea>
            </div>
            <div>
              <label htmlFor="medida" className="block text-sm font-medium text-gray-700">Medida (opcional)</label>
              <input type="text" name="medida" id="medida" value={formData.medida} onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="ubicacion" className="block text-sm font-medium text-gray-700">Ubicación (Andamio)</label>
              <input type="text" name="ubicacion" id="ubicacion" value={formData.ubicacion} onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="color" className="block text-sm font-medium text-gray-700">Color (opcional)</label>
              <input type="text" name="color" id="color" value={formData.color} onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
          </div>

          {/* Sección de Códigos y Precios */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="codigoTienda" className="block text-sm font-medium text-gray-700">Código de Tienda</label>
              <input type="text" name="codigoTienda" id="codigoTienda" value={formData.codigoTienda} onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="codigoProveedor" className="block text-sm font-medium text-gray-700">Código de Proveedor (opcional)</label>
              <input type="text" name="codigoProveedor" id="codigoProveedor" value={formData.codigoProveedor} onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="precioCompraDefault" className="block text-sm font-medium text-gray-700">Precio de Compra Default</label>
              <input type="number" name="precioCompraDefault" id="precioCompraDefault" value={formData.precioCompraDefault} onChange={handleChange} required step="0.01" min="0"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="precioVentaDefault" className="block text-sm font-medium text-gray-700">Precio de Venta Default</label>
              <input type="number" name="precioVentaDefault" id="precioVentaDefault" value={formData.precioVentaDefault} onChange={handleChange} required step="0.01" min="0"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            {/* NUEVO CAMPO: Precio de Venta Mínimo */}
            <div>
              <label htmlFor="precioVentaMinimo" className="block text-sm font-medium text-gray-700">
                Precio de Venta Mínimo
              </label>
              <input type="number" name="precioVentaMinimo" id="precioVentaMinimo" value={formData.precioVentaMinimo} onChange={handleChange} required step="0.01" min="0"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="stockActual" className="block text-sm font-medium text-gray-700">Stock Actual</label>
              <input type="number" name="stockActual" id="stockActual" value={formData.stockActual} onChange={handleChange} required min="0"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="stockReferencialUmbral" className="block text-sm font-medium text-gray-700">Umbral de Stock Bajo</label>
              <input type="number" name="stockReferencialUmbral" id="stockReferencialUmbral" value={formData.stockReferencialUmbral} onChange={handleChange} required min="0"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
          </div>

          {/* Sección: Modelos Compatibles como texto libre */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Modelos Compatibles (Texto Libre)</h2>
            <p className="text-sm text-gray-500 mb-2">Ingrese los modelos compatibles, separados por comas o saltos de línea.</p>
            <textarea
              name="modelosCompatiblesTexto"
              id="modelosCompatiblesTexto"
              rows="4"
              value={formData.modelosCompatiblesTexto}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Ej: Yamaha YBR125, Honda CB190R, Pulsar NS200"
            ></textarea>
          </div>

          {/* SECCIÓN MEJORADA: Múltiples Imágenes del Producto */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              Imágenes del Producto (opcional - máximo 3)
            </h2>
            
            {/* Mostrar imágenes existentes */}
            {imagePreviewUrls.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {imagePreviewUrls.map((url, index) => (
                  <div key={index} className="relative border-2 border-gray-300 border-dashed rounded-md p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Imagen ${index + 1}`} className="w-full h-32 object-contain" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-md text-gray-600 hover:text-red-500 hover:bg-gray-100 transition-colors"
                      title="Eliminar imagen"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Botón para agregar más imágenes */}
            {imagePreviewUrls.length < 3 && (
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <PhotoIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                    >
                      <span>
                        {imagePreviewUrls.length === 0 ? 'Subir imágenes' : `Agregar imagen (${imagePreviewUrls.length}/3)`}
                      </span>
                      <input 
                        id="file-upload" 
                        name="file-upload" 
                        type="file" 
                        className="sr-only" 
                        onChange={handleImageChange} 
                        accept="image/*" 
                        multiple={imagePreviewUrls.length === 0}
                      />
                    </label>
                    <p className="pl-1">o arrastrar y soltar</p>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF hasta 10MB c/u</p>
                </div>
              </div>
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex justify-end space-x-4 mt-8">
            <button
              type="button"
              onClick={() => router.push('/productos')}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
                  {isEditing ? 'Actualizar Producto' : 'Agregar Producto'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default AddEditProductoPage;