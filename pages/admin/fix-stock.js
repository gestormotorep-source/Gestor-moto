// pages/admin/fix-stock.js
// ⚠️ BORRAR ESTE ARCHIVO DESPUÉS DE USARLO
import { useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

export default function FixStock() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const fix = async () => {
    setRunning(true);
    setLog([]);
    setDone(false);

    try {
      addLog('📦 Leyendo lotes activos...');

      // 1. Traer todos los lotes activos
      const lotesSnap = await getDocs(
        query(collection(db, 'lotes'), where('estado', '==', 'activo'))
      );

      addLog(`✅ ${lotesSnap.docs.length} lotes activos encontrados`);

      // 2. Sumar stockRestante por productoId
      const stockPorProducto = {};
      lotesSnap.docs.forEach(d => {
        const { productoId, stockRestante, numeroLote } = d.data();
        if (!productoId) return;
        const stock = parseFloat(stockRestante || 0);
        stockPorProducto[productoId] = (stockPorProducto[productoId] || 0) + stock;
        addLog(`   Lote ${numeroLote || d.id} → producto ${productoId}: +${stock}`);
      });

      addLog('');
      addLog('🛒 Actualizando productos...');

      // 3. Actualizar cada producto con el stock real
      let actualizados = 0;
      let noEncontrados = 0;

      for (const [productoId, stockReal] of Object.entries(stockPorProducto)) {
        try {
          await updateDoc(doc(db, 'productos', productoId), {
            stockActual: stockReal,
          });
          addLog(`✅ Producto ${productoId} → stockActual = ${stockReal}`);
          actualizados++;
        } catch (err) {
          addLog(`❌ Producto ${productoId} no encontrado — omitido (${err.message})`);
          noEncontrados++;
        }
      }

      // 4. Productos que no tienen lotes activos → stockActual = 0
      addLog('');
      addLog('🔍 Buscando productos sin lotes activos...');
      const productosSnap = await getDocs(collection(db, 'productos'));
      let ceroStock = 0;

      for (const p of productosSnap.docs) {
        if (!(p.id in stockPorProducto)) {
          try {
            await updateDoc(doc(db, 'productos', p.id), { stockActual: 0 });
            addLog(`⚠️ Producto ${p.data().nombre || p.id} → sin lotes activos, stockActual = 0`);
            ceroStock++;
          } catch (err) {
            addLog(`❌ Error en producto ${p.id}: ${err.message}`);
          }
        }
      }

      addLog('');
      addLog('════════════════════════════════');
      addLog(`✅ Actualizados con stock: ${actualizados}`);
      addLog(`⚠️ Puestos en 0 (sin lotes): ${ceroStock}`);
      addLog(`❌ No encontrados/errores: ${noEncontrados}`);
      addLog('════════════════════════════════');
      addLog('🎉 ¡Sincronización completada!');

    } catch (err) {
      addLog(`❌ Error general: ${err.message}`);
    } finally {
      setRunning(false);
      setDone(true);
    }
  };

  return (
    <div style={{ padding: 32, fontFamily: 'monospace', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>🔧 Fix Stock — Sincronizar productos con lotes</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Este script recalcula el <code>stockActual</code> de cada producto sumando el <code>stockRestante</code> de sus lotes activos.
        <br />
        <strong style={{ color: 'red' }}>⚠️ Borra este archivo después de usarlo.</strong>
      </p>

      <button
        onClick={fix}
        disabled={running}
        style={{
          padding: '12px 32px',
          background: running ? '#ccc' : '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          cursor: running ? 'not-allowed' : 'pointer',
          marginBottom: 24,
        }}
      >
        {running ? '⏳ Ejecutando...' : '▶️ Ejecutar Fix'}
      </button>

      {log.length > 0 && (
        <div style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 8,
          maxHeight: 500,
          overflowY: 'auto',
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          {log.map((line, i) => (
            <div key={i} style={{
              color: line.startsWith('✅') ? '#4ade80'
                   : line.startsWith('❌') ? '#f87171'
                   : line.startsWith('⚠️') ? '#fbbf24'
                   : line.startsWith('🎉') ? '#60a5fa'
                   : '#d4d4d4'
            }}>
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      )}

      {done && (
        <p style={{ marginTop: 16, color: 'green', fontWeight: 'bold' }}>
          ✅ Proceso terminado. Recarga la app para ver los cambios.
        </p>
      )}
    </div>
  );
}