// pages/admin/migrar-ingresos.js
// Página temporal - la borras después de ejecutarla UNA VEZ

import { useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

export default function MigrarIngresos() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const handleMigrar = async () => {
    setRunning(true);
    setLog([]);

    try {
      const ingresosSnap = await getDocs(collection(db, 'ingresos'));
      addLog(`📦 Encontrados ${ingresosSnap.size} ingresos`);

      await Promise.all(ingresosSnap.docs.map(async (ingresoDoc) => {
        const lotesSnap = await getDocs(
          collection(db, 'ingresos', ingresoDoc.id, 'lotes')
        );

        let totalStock = 0;
        lotesSnap.docs.forEach(l => {
          totalStock += parseFloat(l.data().cantidad || 0);
        });

        await updateDoc(doc(db, 'ingresos', ingresoDoc.id), {
          cantidadLotes: lotesSnap.size,
          totalStockIngresado: totalStock,
        });

        addLog(`✅ ${ingresoDoc.data().numeroBoleta || ingresoDoc.id} → ${lotesSnap.size} lotes, ${totalStock} unidades`);
      }));

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
      <h1 className="text-2xl font-bold mb-4">Migración de Ingresos</h1>
      <p className="text-gray-600 mb-6">
        Esto agrega <code>cantidadLotes</code> y <code>totalStockIngresado</code> 
        directamente en cada ingreso para evitar cargar subcolecciones.
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