// components/modals/ImageModal.js
import React, { useState, useEffect } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const ImageModal = ({ imageUrl, imageUrls, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Normalizar imágenes - compatibilidad con ambos formatos
  const images = React.useMemo(() => {
    console.log('ImageModal - imageUrl:', imageUrl);
    console.log('ImageModal - imageUrls:', imageUrls);
    
    let imagesToProcess = [];
    
    // CAMBIO PRINCIPAL: Priorizar imageUrls (array) si existe y tiene elementos
    if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
      imagesToProcess = imageUrls;
      console.log('Usando imageUrls array:', imagesToProcess);
    }
    // Si imageUrls es string (caso edge), convertir a array
    else if (imageUrls && typeof imageUrls === 'string' && imageUrls.trim() !== '') {
      // MEJORA: Si el string contiene múltiples URLs separadas por coma, dividirlas
      if (imageUrls.includes(',')) {
        imagesToProcess = imageUrls.split(',').map(url => url.trim());
      } else {
        imagesToProcess = [imageUrls];
      }
      console.log('Usando imageUrls string convertido:', imagesToProcess);
    }
    // Fallback a imageUrl (string singular) para compatibilidad
    else if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') {
      imagesToProcess = [imageUrl];
      console.log('Usando imageUrl fallback:', imagesToProcess);
    }
    
    // Filtrar URLs vacías, nulas o inválidas (SIN limitar a 3, permitir todas las válidas)
    const validImages = imagesToProcess
      .filter(url => {
        if (!url) return false;
        const cleanUrl = url.toString().trim();
        const isValid = cleanUrl !== '' && 
                       cleanUrl !== 'null' && 
                       cleanUrl !== 'undefined' && 
                       cleanUrl !== 'false' &&
                       cleanUrl.length > 10; // URLs deben tener longitud mínima razonable
        console.log(`Validando URL: ${cleanUrl} -> ${isValid}`);
        return isValid;
      });
    
    console.log('ImageModal - Imágenes procesadas:', validImages);
    console.log('ImageModal - Total de imágenes válidas:', validImages.length);
    
    return validImages;
  }, [imageUrl, imageUrls]);

  // Resetear índice cuando cambian las imágenes
  useEffect(() => {
    setCurrentIndex(0);
    console.log('Reseteando índice a 0. Total imágenes:', images.length);
  }, [images]);

  // No mostrar modal si no hay imágenes
  if (!images || images.length === 0) {
    console.log('No hay imágenes válidas para mostrar');
    return null;
  }

  const goToPrevious = () => {
    setCurrentIndex(prev => {
      const newIndex = prev === 0 ? images.length - 1 : prev - 1;
      console.log(`Navegando a imagen anterior: ${newIndex}`);
      return newIndex;
    });
  };

  const goToNext = () => {
    setCurrentIndex(prev => {
      const newIndex = prev === images.length - 1 ? 0 : prev + 1;
      console.log(`Navegando a imagen siguiente: ${newIndex}`);
      return newIndex;
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      goToPrevious();
    } else if (e.key === 'ArrowRight') {
      goToNext();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" 
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div 
        className="relative bg-white p-2 rounded-lg max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl" 
        onClick={e => e.stopPropagation()}
      >
        {/* Botón de cerrar */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 bg-gray-200 rounded-full text-gray-700 hover:bg-gray-300 z-20 transition-colors"
          title="Cerrar (Esc)"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>

        {/* Contador de imágenes (solo si hay más de una) */}
        {images.length > 1 && (
          <div className="absolute top-2 left-2 px-3 py-1 bg-black bg-opacity-60 text-white text-sm rounded-full z-20">
            {currentIndex + 1} / {images.length}
          </div>
        )}

        {/* Contenedor de la imagen */}
        <div className="relative flex justify-center items-center min-h-[300px] max-h-[80vh]">
          <img 
            src={images[currentIndex]} 
            alt={`Imagen del Producto ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain rounded"
            onLoad={() => {
              console.log(`Imagen ${currentIndex + 1} cargada correctamente:`, images[currentIndex]);
            }}
            onError={(e) => {
              console.error(`Error cargando imagen ${currentIndex + 1}:`, images[currentIndex]);
              e.target.src = '/placeholder-image.png'; // Imagen por defecto si falla
              e.target.alt = 'Imagen no disponible';
            }}
          />

          {/* Flecha izquierda (solo si hay más de una imagen) */}
          {images.length > 1 && (
            <button
              onClick={goToPrevious}
              className="absolute left-2 top-1/2 transform -translate-y-1/2 p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition-all duration-200 z-10"
              title="Imagen anterior (←)"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
          )}

          {/* Flecha derecha (solo si hay más de una imagen) */}
          {images.length > 1 && (
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition-all duration-200 z-10"
              title="Imagen siguiente (→)"
            >
              <ChevronRightIcon className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Indicadores de puntos (solo si hay más de una imagen) */}
        {images.length > 1 && (
          <div className="flex justify-center mt-4 space-x-2">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  console.log(`Saltando a imagen ${index + 1}`);
                  setCurrentIndex(index);
                }}
                className={`w-3 h-3 rounded-full transition-all duration-200 ${
                  currentIndex === index
                    ? 'bg-blue-500 scale-110'
                    : 'bg-gray-300 hover:bg-gray-400'
                }`}
                title={`Ir a imagen ${index + 1}`}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default ImageModal;