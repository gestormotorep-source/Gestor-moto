import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

const ProductSearchItem = ({ producto, onSelectProduct, onClearSearch }) => {
  const [showModelos, setShowModelos] = useState(false);
  const [showDescripcion, setShowDescripcion] = useState(false);

  const handleProductClick = () => {
    onSelectProduct(producto);
    onClearSearch();
  };

  const toggleModelos = (e) => {
    e.stopPropagation();
    setShowModelos(!showModelos);
    setShowDescripcion(false); // Cerrar descripción si está abierta
  };

  const toggleDescripcion = (e) => {
    e.stopPropagation();
    setShowDescripcion(!showDescripcion);
    setShowModelos(false); // Cerrar modelos si está abierto
  };

  // Parsear descripción por puntos (separada por saltos de línea)
  const descripcionLineas = producto.descripcionPuntos
    ? producto.descripcionPuntos.split('\n').filter(l => l.trim())
    : [];

  return (
    <div
      className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
      onClick={handleProductClick}
    >
      <div className="flex items-start justify-between gap-4">
        
        {/* Información principal */}
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1 flex-1 min-w-0">
          
          {/* Nombre en dos filas - ocupa todo el ancho */}
          <div className="w-full">
            <h4 className="font-medium text-gray-900 text-sm leading-snug whitespace-normal break-words">
              {producto.nombre}
              {producto.codigoTienda && (
                <span className="text-gray-500 font-normal ml-1">({producto.codigoTienda})</span>
              )}
            </h4>
          </div>

          {/* Fila de datos: C.PROV, Marca, Color, Stock */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">

            {/* Código Proveedor */}
            {producto.codigoProveedor && (
              <div className="flex-shrink-0">
                <span className="text-xs text-gray-500 uppercase tracking-wide">C. Prov:</span>
                <span className="ml-1 text-sm text-gray-700 font-medium">{producto.codigoProveedor}</span>
              </div>
            )}

            {/* Marca */}
            <div className="flex-shrink-0">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Marca:</span>
              <span className="ml-1 text-sm text-gray-700 font-medium">{producto.marca || 'N/A'}</span>
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

            {/* Botón Descripción - solo si tiene descripción */}
            {descripcionLineas.length > 0 && (
              <div className="flex-shrink-0">
                <button
                  onClick={toggleDescripcion}
                  className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
                >
                  <span className="mr-1">Descripción</span>
                  {showDescripcion ? (
                    <ChevronUpIcon className="h-3 w-3" />
                  ) : (
                    <ChevronDownIcon className="h-3 w-3" />
                  )}
                </button>
              </div>
            )}

            {/* Botón Modelos - solo si tiene modelos */}
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

      {/* Descripción colapsable */}
      {descripcionLineas.length > 0 && showDescripcion && (
        <div
          className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs text-green-600 font-medium mb-2 uppercase tracking-wide">
            DESCRIPCIÓN:
          </div>
          <ul className="space-y-1">
            {descripcionLineas.map((linea, index) => (
              <li key={index} className="text-sm text-green-800 flex items-start gap-2">
                <span className="text-green-500 mt-0.5 flex-shrink-0">•</span>
                <span>{linea.replace(/^[-•]\s*/, '')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Modelos compatibles colapsable */}
      {producto.modelosCompatiblesTexto && showModelos && (
        <div
          className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200"
          onClick={(e) => e.stopPropagation()}
        >
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