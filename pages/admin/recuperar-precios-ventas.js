import { useState } from 'react';
import { db } from '../../lib/firebase';
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  orderBy,
} from 'firebase/firestore';

export default function RecuperarPreciosDesdeVentas() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const handleRecuperar = async () => {
    setRunning(true);
    setLog([]);

    try {
      // 1. Cargar todos los productos afectados (precioVentaDefault === 0)
      const productosSnap = await getDocs(collection(db, 'productos'));
      const afectados = new Map(); // productoId → { nombre, precioVentaDefault actual }

      productosSnap.docs.forEach(d => {
        const data = d.data();
        if (parseFloat(data.precioVentaDefault || 0) === 0) {
          afectados.set(d.id, { nombre: data.nombre, precio: 0 });
        }
      });

      addLog(`📦 Total productos: ${productosSnap.size}`);
      addLog(`⚠️  Con precioVentaDefault en 0: ${afectados.size}`);
      addLog('─────────────────────────────────────────');

      if (afectados.size === 0) {
        addLog('✅ No hay productos afectados. Todo está bien.');
        setDone(true);
        setRunning(false);
        return;
      }

      // 2. Recorrer todas las ventas para recuperar el último precio de venta de cada producto
      const preciosRecuperados = new Map(); // productoId → precioVentaUnitario más reciente

      addLog('🔍 Leyendo ventas...');
      const ventasSnap = await getDocs(
        query(collection(db, 'ventas'), orderBy('fechaVenta', 'desc'))
      );
      addLog(`📋 Ventas encontradas: ${ventasSnap.size}`);

      for (const ventaDoc of ventasSnap.docs) {
        // Solo necesitamos seguir si quedan productos sin recuperar
        if (preciosRecuperados.size >= afectados.size) break;

        const itemsSnap = await getDocs(
          collection(db, 'ventas', ventaDoc.id, 'itemsVenta')
        );

        for (const itemDoc of itemsSnap.docs) {
          const item = itemDoc.data();
          const pid = item.productoId;

          // Solo nos interesan productos afectados que aún no recuperamos
          if (afectados.has(pid) && !preciosRecuperados.has(pid)) {
            const precio = parseFloat(item.precioVentaUnitario || 0);
            if (precio > 0) {
              preciosRecuperados.set(pid, precio);
            }
          }
        }
      }

      addLog(`💰 Precios recuperados desde ventas: ${preciosRecuperados.size}`);
      addLog(`❓ Sin historial de ventas: ${afectados.size - preciosRecuperados.size}`);
      addLog('─────────────────────────────────────────');

      // 3. Actualizar productos con los precios recuperados
      let ok = 0;
      let sinPrecio = 0;

      for (const [productoId, info] of afectados) {
        const precioRecuperado = preciosRecuperados.get(productoId);

        if (precioRecuperado && precioRecuperado > 0) {
          await updateDoc(doc(db, 'productos', productoId), {
            precioVentaDefault: precioRecuperado,
            // precioVentaMinimo lo dejamos para ingresar manualmente
            // porque no se guardaba en las ventas
          });
          addLog(`✅ ${info.nombre} → S/. ${precioRecuperado.toFixed(2)}`);
          ok++;
        } else {
          addLog(`⏭️  ${info.nombre} → sin ventas registradas, requiere ingreso manual`);
          sinPrecio++;
        }
      }

      addLog('─────────────────────────────────────────');
      addLog(`🎉 Completado:`);
      addLog(`   ✅ Recuperados: ${ok}`);
      addLog(`   ✏️  Requieren ingreso manual: ${sinPrecio}`);
      addLog(`   ⚠️  NOTA: precioVentaMinimo debe ingresarse manualmente en cada producto`);
      setDone(true);

    } catch (err) {
      addLog('❌ Error: ' + err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Recuperar Precios desde Ventas</h1>
      <p className="text-gray-600 mb-2">
        Recorre todas las ventas registradas y recupera el último <code>precioVentaDefault</code>
        de cada producto afectado. <strong>Ejecútalo solo una vez.</strong>
      </p>
      <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-lg p-3 mb-6 text-sm">
        ⚠️ <strong>Limitación:</strong> <code>precioVentaMinimo</code> no se guardaba en las ventas,
        por lo que deberá ingresarse manualmente en los productos que lo requieran.
      </div>

      <button
        onClick={handleRecuperar}
        disabled={running || done}
        className="px-6 py-3 bg-red-600 text-white rounded-lg disabled:bg-gray-400 mb-6 font-semibold"
      >
        {running ? 'Recuperando...' : done ? '✅ Completado' : '🔧 Iniciar Recuperación'}
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