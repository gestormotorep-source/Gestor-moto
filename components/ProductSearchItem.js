import React from 'react';

const ProductSearchItem = ({ producto, onSelectProduct, onClearSearch, onOpenDetails, onOpenModels }) => {

  const handleProductClick = () => {
    onSelectProduct(producto);
    onClearSearch();
  };

  const handleDescripcionClick = (e) => {
    e.stopPropagation();
    onOpenDetails(producto);
  };

  const handleModelosClick = (e) => {
    e.stopPropagation();
    onOpenModels(producto);
  };

  const descripcionLineas = producto.descripcionPuntos
    ? producto.descripcionPuntos.split('\n').filter(l => l.trim())
    : [];

  return (
    <div
      className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
      onClick={handleProductClick}
    >
      <div className="flex items-start justify-between gap-4">
        
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1 flex-1 min-w-0">
          
          <div className="w-full">
            <h4 className="font-medium text-gray-900 text-sm leading-snug whitespace-normal break-words">
              {producto.nombre}
              {producto.codigoTienda && (
                <span className="text-gray-500 font-normal ml-1">({producto.codigoTienda})</span>
              )}
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">

            {producto.codigoProveedor && (
              <div className="flex-shrink-0">
                <span className="text-xs text-gray-500 uppercase tracking-wide">C. Prov:</span>
                <span className="ml-1 text-sm text-gray-700 font-medium">{producto.codigoProveedor}</span>
              </div>
            )}

            <div className="flex-shrink-0">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Marca:</span>
              <span className="ml-1 text-sm text-gray-700 font-medium">{producto.marca || 'N/A'}</span>
            </div>

            <div className="flex-shrink-0">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Color:</span>
              <span className="ml-1 text-sm text-gray-700 font-medium">{producto.color || 'N/A'}</span>
            </div>

            <div className="flex-shrink-0">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Stock:</span>
              <span className="ml-1 text-sm font-semibold text-gray-900">{producto.stockActual || 0}</span>
            </div>

            {/* Botón Descripción → abre ProductDetailsModal */}
            {descripcionLineas.length > 0 && (
              <div className="flex-shrink-0">
                <button
                  onClick={handleDescripcionClick}
                  className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
                >
                  Descripción
                </button>
              </div>
            )}

            {/* Botón Modelos → abre ProductModelsModal */}
            {producto.modelosCompatiblesTexto && (
              <div className="flex-shrink-0">
                <button
                  onClick={handleModelosClick}
                  className="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                >
                  Modelos
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="font-bold text-green-600 text-base">
            S/. {parseFloat(producto.precioVentaDefault || 0).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Precio Venta
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProductSearchItem;