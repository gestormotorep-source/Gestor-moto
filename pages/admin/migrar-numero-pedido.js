import { useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, updateDoc, doc, orderBy, query } from 'firebase/firestore';

export default function MigrarNumeroPedido() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const handleMigrar = async () => {
    setRunning(true);
    setLog([]);

    try {
      // Traer todos los ingresos ordenados por fecha de creación
      const ingresosSnap = await getDocs(
        query(collection(db, 'ingresos'), orderBy('createdAt', 'asc'))
      );
      addLog(`📦 Encontrados ${ingresosSnap.size} ingresos`);

      let contador = 1;

      for (const ingresoDoc of ingresosSnap.docs) {
        const data = ingresoDoc.data();

        // Si ya tiene numeroPedido, saltar
        if (data.numeroPedido) {
          addLog(`⏭️ ${ingresoDoc.id} ya tiene numeroPedido (${data.numeroPedido}), omitiendo`);
          contador++;
          continue;
        }

        const numeroPedido = `N°-${String(contador).padStart(7, '0')}`;

        await updateDoc(doc(db, 'ingresos', ingresoDoc.id), {
          numeroPedido,
        });

        addLog(`✅ ${ingresoDoc.id} → ${numeroPedido} | Boleta: ${data.numeroBoleta || 'sin boleta'}`);
        contador++;
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
      <h1 className="text-2xl font-bold mb-4">Migración — Número de Pedido</h1>
      <p className="text-gray-600 mb-2">
        Asigna <code className="bg-gray-100 px-1 rounded">numeroPedido</code> secuencial a todos los ingresos existentes,
        ordenados por fecha de creación. 
      </p>
      <p className="text-amber-600 font-medium mb-6">
        ⚠️ Ejecútalo solo una vez. Los ingresos que ya tengan el campo serán omitidos.
      </p>

      <button
        onClick={handleMigrar}
        disabled={running || done}
        className="px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold disabled:bg-gray-400 mb-6 hover:bg-orange-700 transition-colors"
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