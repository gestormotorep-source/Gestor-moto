import { useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, updateDoc, doc, getDoc } from 'firebase/firestore';

export default function MigrarDevoluciones() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const handleMigrar = async () => {
    setRunning(true);
    setLog([]);

    try {
      const devolucionesSnap = await getDocs(collection(db, 'devoluciones'));
      addLog(`📦 Encontradas ${devolucionesSnap.size} devoluciones`);

      await Promise.all(devolucionesSnap.docs.map(async (devDoc) => {
        const data = devDoc.data();

        // Solo migrar si faltan los campos
        if (data.clienteNombre && data.numeroVenta) {
          addLog(`⏭️ ${devDoc.id} ya tiene los campos, omitiendo`);
          return;
        }

        let clienteNombre = data.clienteNombre || 'N/A';
        let numeroVenta = data.numeroVenta || data.numeroVentaOriginal || 'N/A';

        // Buscar en la venta relacionada si faltan datos
        if (data.ventaId && (clienteNombre === 'N/A' || numeroVenta === 'N/A')) {
          try {
            const ventaSnap = await getDoc(doc(db, 'ventas', data.ventaId));
            if (ventaSnap.exists()) {
              const ventaData = ventaSnap.data();
              clienteNombre = ventaData.clienteNombre || clienteNombre;
              numeroVenta = ventaData.numeroVenta || numeroVenta;
            }
          } catch (e) {
            addLog(`⚠️ No se pudo obtener venta para ${devDoc.id}`);
          }
        }

        await updateDoc(doc(db, 'devoluciones', devDoc.id), {
          clienteNombre,
          numeroVenta,
        });

        addLog(`✅ ${devDoc.id} → Cliente: ${clienteNombre} | Venta: ${numeroVenta}`);
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
      <h1 className="text-2xl font-bold mb-4">Migración de Devoluciones</h1>
      <p className="text-gray-600 mb-6">
        Agrega <code>clienteNombre</code> y <code>numeroVenta</code> directamente en cada devolución
        para evitar cargar la venta relacionada cada vez. <strong>Ejecútalo solo una vez.</strong>
      </p>

      <button
        onClick={handleMigrar}
        disabled={running || done}
        className="px-6 py-3 bg-orange-600 text-white rounded-lg disabled:bg-gray-400 mb-6"
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