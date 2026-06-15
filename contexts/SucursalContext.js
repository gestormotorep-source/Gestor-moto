import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const SucursalContext = createContext(null);

// Lista fija por ahora (luego puede venir de Firestore, colección 'sucursales')
const SUCURSALES_DISPONIBLES = [
  { id: 'principal', nombre: 'Tienda Principal', dbName: '(default)' },
  { id: 'almacen', nombre: 'Almacén', dbName: 'almacen' },
];

const STORAGE_KEY = 'sucursalActivaId';

export const SucursalProvider = ({ children }) => {
  const { user } = useAuth();
  const [sucursalActiva, setSucursalActiva] = useState(null);
  const [showSelector, setShowSelector] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Al iniciar sesión, intentar recuperar sede guardada o pedir selección
  useEffect(() => {
    if (!user) {
      setSucursalActiva(null);
      setInitialized(false);
      return;
    }

    if (initialized) return;

    const savedId = typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null;

    const saved = SUCURSALES_DISPONIBLES.find(s => s.id === savedId);

    if (saved) {
      setSucursalActiva(saved);
    } else {
      // No hay sede guardada -> mostrar selector
      setShowSelector(true);
    }

    setInitialized(true);
  }, [user, initialized]);

  const seleccionarSucursal = (sucursal) => {
    setSucursalActiva(sucursal);
    setShowSelector(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, sucursal.id);
    }
  };

  const abrirSelectorSucursal = () => setShowSelector(true);
  const cerrarSelectorSucursal = () => setShowSelector(false);

  return (
    <SucursalContext.Provider value={{
      sucursalActiva,
      sucursales: SUCURSALES_DISPONIBLES,
      seleccionarSucursal,
      showSelector,
      abrirSelectorSucursal,
      cerrarSelectorSucursal,
    }}>
      {children}
    </SucursalContext.Provider>
  );
};

export const useSucursal = () => {
  const context = useContext(SucursalContext);
  if (!context) throw new Error('useSucursal debe usarse dentro de SucursalProvider');
  return context;
};