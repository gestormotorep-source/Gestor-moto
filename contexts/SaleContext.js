// contexts/SaleContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

const SaleContext = createContext();

export const SaleProvider = ({ children }) => {
  const [activeSale, setActiveSale] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedSale = localStorage.getItem('activeSale');
      return savedSale ? JSON.parse(savedSale) : null;
    }
    return null;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (activeSale) {
        localStorage.setItem('activeSale', JSON.stringify(activeSale));
      } else {
        localStorage.removeItem('activeSale');
      }
    }
  }, [activeSale]);

  const startNewSale = (saleId, clientId) => {
    setActiveSale({ saleId, clientId });
  };

  const clearActiveSale = () => {
    setActiveSale(null);
  };

  return (
    <SaleContext.Provider value={{ activeSale, startNewSale, clearActiveSale }}>
      {children}
    </SaleContext.Provider>
  );
};

export const useSale = () => useContext(SaleContext);