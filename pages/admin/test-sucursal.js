// pages/test-sucursal.js
import { useSucursal } from '../../contexts/SucursalContext';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export default function TestSucursal() {
  const { sucursalActiva, db, seleccionarSucursal, sucursales } = useSucursal();
  const [count, setCount] = useState(null);

  useEffect(() => {
    getDocs(collection(db, 'productos')).then(snap => setCount(snap.size));
  }, [db]);

  return (
    <div style={{ padding: 40 }}>
      <h1>Sede activa: {sucursalActiva.nombre}</h1>
      <p>Productos encontrados: {count === null ? 'cargando...' : count}</p>
      {sucursales.map(s => (
        <button key={s.id} onClick={() => seleccionarSucursal(s)} style={{ marginRight: 10 }}>
          {s.nombre}
        </button>
      ))}
    </div>
  );
}