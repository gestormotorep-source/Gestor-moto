import { useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';

export default function MigrarPage() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);

  const migrar = async () => {
    setRunning(true);
    setLog(['Iniciando migración...']);

    try {
      // Cargar todas las devoluciones aprobadas
      const devSnap = await getDocs(query(
        collection(db, 'devoluciones'),
        where('estado', '==', 'aprobada')
      ));

      // Agrupar por ventaId
      const mapaPorVenta = {};
      devSnap.docs.forEach(d => {
        const data = d.data();
        const ventaId = data.ventaId;
        if (!ventaId) return;
        if (!mapaPorVenta[ventaId]) {
          mapaPorVenta[ventaId] = { totalDevuelto: 0, totalVenta: 0 };
        }
        mapaPorVenta[ventaId].totalDevuelto += parseFloat(data.montoADevolver || 0);
      });

      setLog(prev => [...prev, `Devoluciones agrupadas: ${Object.keys(mapaPorVenta).length} ventas afectadas`]);

      // Actualizar cada venta
      let actualizadas = 0;
      for (const [ventaId, datos] of Object.entries(mapaPorVenta)) {
        try {
          // Obtener totalVenta del documento
          const ventaSnap = await getDocs(query(
            collection(db, 'ventas'),
            where('__name__', '==', ventaId)
          ));

          // Usar getDoc directamente
          const { getDoc } = await import('firebase/firestore');
          const ventaDoc = await getDoc(doc(db, 'ventas', ventaId));
          if (!ventaDoc.exists()) continue;

          const montoVenta = parseFloat(ventaDoc.data().totalVenta || 0);
          const porcentaje = montoVenta > 0 ? (datos.totalDevuelto / montoVenta) * 100 : 0;
          const estadoDevolucion = porcentaje >= 99 ? 'devuelta' : 'parcial';

          await updateDoc(doc(db, 'ventas', ventaId), {
            estadoDevolucion,
            montoDevuelto: datos.totalDevuelto,
          });

          actualizadas++;
          setLog(prev => [...prev, `✅ ${ventaId}: ${estadoDevolucion} (${porcentaje.toFixed(1)}%)`]);
        } catch (err) {
          setLog(prev => [...prev, `❌ Error en ${ventaId}: ${err.message}`]);
        }
      }

      setLog(prev => [...prev, `Migración completa. ${actualizadas} ventas actualizadas.`]);
    } catch (err) {
      setLog(prev => [...prev, `Error general: ${err.message}`]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Migración: Estado de Devolución en Ventas</h1>
      <button onClick={migrar} disabled={running}
        style={{ padding: '10px 20px', background: 'orange', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
        {running ? 'Migrando...' : 'Iniciar Migración'}
      </button>
      <div style={{ marginTop: 20, fontFamily: 'monospace', background: '#f5f5f5', padding: 10, borderRadius: 8, maxHeight: 400, overflow: 'auto' }}>
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}