import { createContext, useContext, useState, useRef, useCallback } from 'react';

const AppCacheContext = createContext(null);

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutos

export const AppCacheProvider = ({ children }) => {
  const cacheRef = useRef({}); // { ventas: { data, filtros, timestamp }, productos: {...}, ... }

  const getCache = useCallback((key) => {
    const entry = cacheRef.current[key];
    if (!entry) return null;
    const isExpired = (Date.now() - entry.timestamp) > CACHE_DURATION_MS;
    if (isExpired) {
      delete cacheRef.current[key];
      return null;
    }
    return entry;
  }, []);

  const setCache = useCallback((key, data, filtros) => {
    cacheRef.current[key] = {
      data,
      filtros,
      timestamp: Date.now(),
    };
  }, []);

  const invalidateCache = useCallback((key) => {
    delete cacheRef.current[key];
  }, []);

  return (
    <AppCacheContext.Provider value={{ getCache, setCache, invalidateCache }}>
      {children}
    </AppCacheContext.Provider>
  );
};

export const useAppCache = () => {
  const context = useContext(AppCacheContext);
  if (!context) throw new Error('useAppCache debe usarse dentro de AppCacheProvider');
  return context;
};