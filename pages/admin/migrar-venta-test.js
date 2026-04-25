import { useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

const VENTA_ID = 'Sj8gpdmHHLExHYwpvOL8';

export default function MigrarVentaTest() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const handleMigrar = async () => {
    setRunning(true);
    setLog([]);

    try {
      const itemsSnap = await getDocs(collection(db, 'ventas', VENTA_ID, 'itemsVenta'));
      addLog(`📦 Encontrados ${itemsSnap.size} items en venta ${VENTA_ID}`);

      for (const itemDoc of itemsSnap.docs) {
        const item = itemDoc.data();
        const precioVenta = parseFloat(item.precioVentaUnitario || 0);
        const cantidad = parseFloat(item.cantidad || 0);
        const subtotalGuardado = parseFloat(item.subtotal || 0);
        const subtotalCorrecto = parseFloat((precioVenta * cantidad).toFixed(2));

        addLog(`📌 ${item.nombreProducto}`);
        addLog(`   precio=${precioVenta} | cant=${cantidad} | subtotal guardado=${subtotalGuardado} | subtotal correcto=${subtotalCorrecto}`);

        if (Math.abs(subtotalGuardado - subtotalCorrecto) > 0.01) {
          await updateDoc(doc(db, 'ventas', VENTA_ID, 'itemsVenta', itemDoc.id), {
            subtotal: subtotalCorrecto
          });
          addLog(`   ✅ Corregido: ${subtotalGuardado} → ${subtotalCorrecto}`);
        } else {
          addLog(`   ⏭️ Sin cambios necesarios`);
        }
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
      <h1 className="text-2xl font-bold mb-2">Migrar Venta Test</h1>
      <p className="text-gray-500 mb-1 text-sm">Venta ID: <code className="bg-gray-100 px-1 rounded">{VENTA_ID}</code></p>
      <p className="text-gray-600 mb-6 text-sm">
        Recalcula el <code>subtotal</code> de cada item como <code>precioVentaUnitario × cantidad</code> y actualiza en Firestore si hay discrepancia.
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