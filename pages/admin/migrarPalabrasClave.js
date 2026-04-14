// pages/admin/migrar-palabras-clave.js
// Página temporal - la borras después de ejecutarla UNA VEZ

import { useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

export default function MigrarPalabrasClave() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const handleMigrar = async () => {
    setRunning(true);
    setLog([]);

    try {
      const productosSnap = await getDocs(collection(db, 'productos'));
      addLog(`📦 Encontrados ${productosSnap.size} productos`);

      let count = 0;
      for (const docSnap of productosSnap.docs) {
        const d = docSnap.data();

        const palabrasClave = [...new Set(
          [d.nombre || '', d.marca || '', d.codigoTienda || '', d.codigoProveedor || '', d.modelosCompatiblesTexto || '']
            .join(' ')
            .toUpperCase()
            .split(/[\s\-\/,]+/)
            .filter(p => p.length >= 2)
        )];

        await updateDoc(doc(db, 'productos', docSnap.id), { palabrasClave });
        count++;
        addLog(`✅ (${count}/${productosSnap.size}) ${d.nombre} → ${palabrasClave.length} palabras`);
      }

      addLog('🎉 Migración completada');
      setDone(true);
    } catch (err) {
      addLog('❌ Error: ' + err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Migración de Palabras Clave</h1>
      <p className="text-gray-600 mb-6">
        Esto agrega el campo <code>palabrasClave</code> a cada producto para permitir
        búsqueda por cualquier palabra del nombre, marca o código.
        <strong> Ejecútalo solo una vez.</strong>
      </p>

      <button
        onClick={handleMigrar}
        disabled={running || done}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:bg-gray-400 mb-6"
      >
        {running ? 'Migrando...' : done ? '✅ Completado' : 'Iniciar Migración'}
      </button>

      <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
        {log.length === 0 ? (
          <p className="text-gray-500">Los logs aparecerán aquí...</p>
        ) : (
          log.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>
    </div>
  );
}