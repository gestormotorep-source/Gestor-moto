import { useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

export default function MigrarFechaRecepcion() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const handleMigrar = async () => {
    setRunning(true);
    setLog([]);

    try {
      const snap = await getDocs(collection(db, 'ingresos'));
      addLog(`📦 Encontrados ${snap.size} ingresos`);

      for (const ingresoDoc of snap.docs) {
        const data = ingresoDoc.data();

        if (data.fechaRecepcion) {
          addLog(`⏭️ ${ingresoDoc.id} ya tiene fechaRecepcion, omitiendo`);
          continue;
        }

        if (!data.fechaIngreso) {
          addLog(`⚠️ ${ingresoDoc.id} no tiene fechaIngreso, omitiendo`);
          continue;
        }

        await updateDoc(doc(db, 'ingresos', ingresoDoc.id), {
          fechaRecepcion: data.fechaIngreso, // copiar fechaIngreso como valor inicial
        });

        addLog(`✅ ${ingresoDoc.id} → fechaRecepcion copiada de fechaIngreso`);
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
      <h1 className="text-2xl font-bold mb-4">Migración — Fecha de Recepción</h1>
      <p className="text-gray-600 mb-2">
        Copia <code className="bg-gray-100 px-1 rounded">fechaIngreso</code> como valor inicial de{' '}
        <code className="bg-gray-100 px-1 rounded">fechaRecepcion</code> en todos los ingresos que no lo tengan.
      </p>
      <p className="text-amber-600 font-medium mb-6">
        ⚠️ Ejecútalo solo una vez. Los ingresos que ya tengan el campo serán omitidos.
      </p>

      <button
        onClick={handleMigrar}
        disabled={running || done}
        className="px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold disabled:bg-gray:400 mb-6 hover:bg-orange-700"
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