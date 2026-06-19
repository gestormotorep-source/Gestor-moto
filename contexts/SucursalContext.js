import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { DB_POR_SUCURSAL } from '../lib/firebase';

const SucursalContext = createContext(null);

const SUCURSALES_DISPONIBLES = [
  { id: 'principal', nombre: 'Tienda Principal' },
  { id: 'almacen', nombre: 'Almacén' },
];

const STORAGE_KEY = 'sucursalActivaId';
const DEFAULT_SUCURSAL = SUCURSALES_DISPONIBLES[0]; // 'principal'

export const SucursalProvider = ({ children }) => {
  const { user } = useAuth();
  const [sucursalActiva, setSucursalActiva] = useState(DEFAULT_SUCURSAL);
  const [showSelector, setShowSelector] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!user) {
      setSucursalActiva(DEFAULT_SUCURSAL);
      setInitialized(false);
      return;
    }

    if (initialized) return;

    const savedId = typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null;

    const saved = SUCURSALES_DISPONIBLES.find(s => s.id === savedId);

    // Si hay algo guardado, úsalo. Si no, queda "principal" por default
    // (sin abrir el modal automáticamente).
    setSucursalActiva(saved || DEFAULT_SUCURSAL);
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

  // DB activa según la sede seleccionada
  const db = DB_POR_SUCURSAL[sucursalActiva.id] || DB_POR_SUCURSAL.principal;

  return (
    <SucursalContext.Provider value={{
      sucursalActiva,
      sucursales: SUCURSALES_DISPONIBLES,
      seleccionarSucursal,
      showSelector,
      abrirSelectorSucursal,
      cerrarSelectorSucursal,
      db,
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