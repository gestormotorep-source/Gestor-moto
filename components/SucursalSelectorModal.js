import { useSucursal } from '../contexts/SucursalContext';
import { BuildingStorefrontIcon } from '@heroicons/react/24/outline';

const SucursalSelectorModal = () => {
  const { showSelector, sucursales, seleccionarSucursal, sucursalActiva, cerrarSelectorSucursal } = useSucursal();

  if (!showSelector) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/70 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Selecciona tu sede</h2>
        <p className="text-sm text-gray-500 mb-6">
          Elige la tienda o almacén con el que vas a trabajar.
        </p>

        <div className="space-y-3">
          {sucursales.map((s) => (
            <button
              key={s.id}
              onClick={() => seleccionarSucursal(s)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors text-left
                ${sucursalActiva?.id === s.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}
              `}
            >
              <BuildingStorefrontIcon className="h-6 w-6 text-blue-600 flex-shrink-0" />
              <span className="font-medium text-gray-900">{s.nombre}</span>
            </button>
          ))}
        </div>

        {/* Si ya hay una sede activa, permitir cerrar sin cambiar */}
        {sucursalActiva && (
          <button
            onClick={cerrarSelectorSucursal}
            className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700 py-2"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
};

export default SucursalSelectorModal;