import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

/**
 * Componente individual para cada producto en la lista de búsqueda
 * Incluye funcionalidad colapsable para mostrar/ocultar modelos compatibles
 */
const ProductSearchItem = ({ producto, onSelectProduct, onClearSearch }) => {
  const [showModelos, setShowModelos] = useState(false);

  const handleProductClick = () => {
    onSelectProduct(producto);
    onClearSearch();
  };

  const toggleModelos = (e) => {
    e.stopPropagation(); // Evitar que se ejecute handleProductClick
    setShowModelos(!showModelos);
  };

  return (
    <div
      className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
      onClick={handleProductClick}
    >
      <div className="flex items-center justify-between gap-6">
        {/* Información principal del producto */}
        <div className="flex items-center gap-6 flex-1 min-w-0">
          {/* Nombre y código */}
          <div className="min-w-0 flex-shrink-0">
            <h4 className="font-medium text-gray-900 truncate text-sm">
              {producto.nombre} ({producto.codigoTienda})
            </h4>
          </div>
          
          {/* Marca */}
          <div className="flex-shrink-0">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Marca:</span>
            <span className="ml-1 text-sm text-gray-700 font-medium">{producto.marca}</span>
          </div>
          
          {/* Color */}
          <div className="flex-shrink-0">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Color:</span>
            <span className="ml-1 text-sm text-gray-700 font-medium">{producto.color || 'N/A'}</span>
          </div>
          
          {/* Stock */}
          <div className="flex-shrink-0">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Stock:</span>
            <span className="ml-1 text-sm font-semibold text-gray-900">{producto.stockActual || 0}</span>
          </div>
          
          {/* Botón de modelos compatibles - solo si existen */}
          {producto.modelosCompatiblesTexto && (
            <div className="flex-shrink-0">
              <button
                onClick={toggleModelos}
                className="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                <span className="mr-1">Modelos</span>
                {showModelos ? (
                  <ChevronUpIcon className="h-3 w-3" />
                ) : (
                  <ChevronDownIcon className="h-3 w-3" />
                )}
              </button>
            </div>
          )}
        </div>
        
        {/* Precio */}
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-green-600 text-base">
            S/. {parseFloat(producto.precioVentaDefault || 0).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Precio Venta
          </p>
        </div>
      </div>
      
      {/* Modelos compatibles colapsables */}
      {producto.modelosCompatiblesTexto && showModelos && (
        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200 animate-fadeIn">
          <div className="text-xs text-blue-600 font-medium mb-1 uppercase tracking-wide">
            MODELOS COMPATIBLES:
          </div>
          <div className="text-sm text-blue-800 break-words leading-relaxed">
            {producto.modelosCompatiblesTexto}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductSearchItem;