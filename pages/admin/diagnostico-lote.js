// pages/admin/diagnostico-lote.js
// ⚠️ BORRAR DESPUÉS DE USAR
import { useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';

export default function DiagnosticoLote() {
  const [loteId, setLoteId] = useState('L260522-HCMV');
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  // ── 1. Diagnosticar un lote específico ──────────────────────────────────
  const diagnosticar = async () => {
    setRunning(true);
    setLog([]);

    try {
      addLog(`🔍 Buscando lote con numeroLote = "${loteId}"...`);

      const lotesSnap = await getDocs(
        query(collection(db, 'lotes'), where('numeroLote', '==', loteId))
      );

      if (lotesSnap.empty) {
        addLog('❌ Lote no encontrado en colección "lotes"');
        setRunning(false);
        return;
      }

      for (const loteDoc of lotesSnap.docs) {
        const lote = loteDoc.data();
        addLog('');
        addLog(`📦 Lote encontrado: ${loteDoc.id}`);
        addLog(`   numeroLote:    ${lote.numeroLote}`);
        addLog(`   productoId:    ${lote.productoId}`);
        addLog(`   stockRestante: ${lote.stockRestante}`);
        addLog(`   estado:        ${lote.estado}`);
        addLog(`   ingresoId:     ${lote.ingresoId}`);

        if (lote.estado === 'pendiente') {
          addLog(`   ⚠️ El lote está en estado PENDIENTE — esto causa el problema`);
        }

        addLog('');
        addLog(`🛒 Verificando producto "${lote.productoId}"...`);
        const productoRef = doc(db, 'productos', lote.productoId);
        const productoSnap = await getDoc(productoRef);

        if (!productoSnap.exists()) {
          addLog(`❌ Producto ${lote.productoId} NO EXISTE en Firestore`);
        } else {
          const producto = productoSnap.data();
          addLog(`✅ Producto encontrado: "${producto.nombre}"`);
          addLog(`   stockActual en Firestore: ${producto.stockActual}`);
          addLog(`   stockRestante del lote:   ${lote.stockRestante}`);

          if ((producto.stockActual || 0) !== lote.stockRestante) {
            addLog('   ⚠️ DESINCRONIZACIÓN DETECTADA');
          } else {
            addLog('   ✅ Stock coincide');
          }
        }
      }

      addLog('');
      addLog('🔍 Buscando producto "ACEITE MOTUL 7100 20W-50" por nombre...');
      const productosSnap = await getDocs(
        query(
          collection(db, 'productos'),
          where('nombre', '>=', 'ACEITE MOTUL 7100 20W'),
          where('nombre', '<=', 'ACEITE MOTUL 7100 20W\uf8ff')
        )
      );

      if (productosSnap.empty) {
        addLog('❌ Producto no encontrado por nombre');
      } else {
        productosSnap.docs.forEach(p => {
          addLog(`✅ Producto: "${p.data().nombre}"`);
          addLog(`   ID: ${p.id}`);
          addLog(`   stockActual: ${p.data().stockActual}`);
        });
      }

    } catch (err) {
      addLog(`❌ Error: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  // ── 2. Activar lotes PENDIENTES con stock y sincronizar productos ────────
  const activarLotesPendientes = async () => {
    setRunning(true);
    setLog([]);

    try {
      addLog('🔍 Buscando lotes con estado = "pendiente" y stockRestante > 0...');

      const lotesSnap = await getDocs(
        query(
          collection(db, 'lotes'),
          where('estado', '==', 'pendiente'),
          where('stockRestante', '>', 0)
        )
      );

      if (lotesSnap.empty) {
        addLog('ℹ️ No hay lotes pendientes con stock > 0');
        setRunning(false);
        return;
      }

      addLog(`📦 ${lotesSnap.docs.length} lotes pendientes encontrados`);
      addLog('');

      let activados = 0;
      let errores = 0;

      for (const loteDoc of lotesSnap.docs) {
        const lote = loteDoc.data();
        addLog(`────────────────────────────────`);
        addLog(`Lote: ${lote.numeroLote} (${loteDoc.id})`);
        addLog(`  stockRestante: ${lote.stockRestante}`);
        addLog(`  productoId:    ${lote.productoId}`);

        try {
          // 1. Activar el lote
          await updateDoc(loteDoc.ref, { estado: 'activo' });
          addLog(`  ✅ Lote activado (pendiente → activo)`);

          // 2. Actualizar el producto si existe
          const productoRef = doc(db, 'productos', lote.productoId);
          const productoSnap = await getDoc(productoRef);

          if (productoSnap.exists()) {
            const stockActual = productoSnap.data().stockActual || 0;
            const nuevoStock  = stockActual + parseFloat(lote.stockRestante || 0);
            await updateDoc(productoRef, { stockActual: nuevoStock });
            addLog(`  ✅ Producto "${productoSnap.data().nombre}"`);
            addLog(`     stockActual: ${stockActual} → ${nuevoStock}`);
            activados++;
          } else {
            addLog(`  ❌ Producto ${lote.productoId} no encontrado — lote activado sin stock`);
            errores++;
          }
        } catch (err) {
          addLog(`  ❌ Error: ${err.message}`);
          errores++;
        }
      }

      addLog('');
      addLog('════════════════════════════════');
      addLog(`✅ Lotes activados con stock:   ${activados}`);
      addLog(`❌ Errores:                     ${errores}`);
      addLog('════════════════════════════════');
      addLog('🎉 ¡Proceso completado! Recarga la app para ver los cambios.');

    } catch (err) {
      addLog(`❌ Error general: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  // ── 3. Fix manual: fuerza sync de todos los lotes activos ───────────────
  const fixManual = async () => {
    setRunning(true);
    setLog([]);

    try {
      addLog('🔧 Recalculando stock de todos los lotes activos con stockRestante > 0...');

      const lotesSnap = await getDocs(
        query(
          collection(db, 'lotes'),
          where('estado', '==', 'activo'),
          where('stockRestante', '>', 0)
        )
      );

      addLog(`📦 ${lotesSnap.docs.length} lotes activos con stock`);

      // Sumar stock por producto
      const stockPorProducto = {};
      lotesSnap.docs.forEach(d => {
        const { productoId, stockRestante } = d.data();
        if (!productoId) return;
        stockPorProducto[productoId] = (stockPorProducto[productoId] || 0) + parseFloat(stockRestante || 0);
      });

      addLog(`🛒 ${Object.keys(stockPorProducto).length} productos a actualizar`);
      addLog('');

      let actualizados = 0;
      let errores = 0;

      for (const [productoId, stockReal] of Object.entries(stockPorProducto)) {
        try {
          const productoRef  = doc(db, 'productos', productoId);
          const productoSnap = await getDoc(productoRef);

          if (!productoSnap.exists()) {
            addLog(`❌ Producto ${productoId} no existe — omitido`);
            errores++;
            continue;
          }

          const nombre        = productoSnap.data().nombre || productoId;
          const stockAnterior = productoSnap.data().stockActual || 0;

          await updateDoc(productoRef, { stockActual: stockReal });
          addLog(`✅ "${nombre}": ${stockAnterior} → ${stockReal}`);
          actualizados++;
        } catch (err) {
          addLog(`❌ Producto ${productoId}: ${err.message}`);
          errores++;
        }
      }

      addLog('');
      addLog('════════════════════════════════');
      addLog(`✅ Actualizados: ${actualizados}`);
      addLog(`❌ Errores:      ${errores}`);
      addLog('════════════════════════════════');
      addLog('🎉 ¡Fix manual completado!');

    } catch (err) {
      addLog(`❌ Error: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ padding: 32, fontFamily: 'monospace', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>🔬 Diagnóstico y Fix de Stock</h1>
      <p style={{ color: '#666', marginBottom: 8 }}>
        Herramienta para diagnosticar y corregir desincronizaciones de stock entre lotes y productos.
      </p>
      <p style={{ color: 'red', fontWeight: 'bold', marginBottom: 24 }}>
        ⚠️ Borrar este archivo después de usar.
      </p>

      {/* Fila 1: diagnóstico de lote específico */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={loteId}
          onChange={e => setLoteId(e.target.value)}
          placeholder="Número de lote (ej: L260522-HCMV)"
          style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6, width: 280, fontSize: 14 }}
        />
        <button onClick={diagnosticar} disabled={running}
          style={{ padding: '10px 20px', background: running ? '#93c5fd' : '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'monospace', fontSize: 14 }}>
          🔍 Diagnosticar lote
        </button>
      </div>

      {/* Fila 2: fixes globales */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={activarLotesPendientes} disabled={running}
          style={{ padding: '10px 20px', background: running ? '#fcd34d' : '#d97706', color: 'white', border: 'none', borderRadius: 6, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'monospace', fontSize: 14 }}>
          ⚡ Activar lotes PENDIENTES con stock
        </button>
        <button onClick={fixManual} disabled={running}
          style={{ padding: '10px 20px', background: running ? '#86efac' : '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'monospace', fontSize: 14 }}>
          🔧 Recalcular stock (todos los activos)
        </button>
      </div>

      {/* Descripción de cada botón */}
      <div style={{ marginBottom: 24, fontSize: 12, color: '#555', lineHeight: 2, background: '#f9fafb', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <div><strong>🔍 Diagnosticar lote:</strong> Muestra el estado exacto de un lote en Firestore y su producto asociado.</div>
        <div><strong>⚡ Activar lotes PENDIENTES:</strong> Busca lotes con estado=pendiente y stock &gt; 0, los activa y suma el stock al producto. <strong style={{color:'#d97706'}}>Usa este primero si el lote dice "pendiente".</strong></div>
        <div><strong>🔧 Recalcular stock:</strong> Recalcula stockActual de todos los productos sumando sus lotes activos. Úsalo después del anterior.</div>
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={{
          background: '#1e1e1e', color: '#d4d4d4', padding: 16,
          borderRadius: 8, maxHeight: 600, overflowY: 'auto',
          fontSize: 13, lineHeight: 1.8,
        }}>
          {log.map((line, i) => (
            <div key={i} style={{
              color: line.includes('❌') ? '#f87171'
                   : line.includes('✅') ? '#4ade80'
                   : line.includes('⚠️') ? '#fbbf24'
                   : line.includes('🎉') ? '#60a5fa'
                   : line.includes('════') ? '#4b5563'
                   : line.includes('────') ? '#4b5563'
                   : '#d4d4d4'
            }}>
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}