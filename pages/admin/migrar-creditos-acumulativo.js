// pages/admin/migrar-creditos-fusion.js
// ═══════════════════════════════════════════════════════════════════════════
//  MIGRACIÓN FUSIÓN: N créditos viejos por cliente → 1 crédito acumulativo
//  - Crea un doc NUEVO tipo 'acumulativo' con TODOS los items juntos
//  - Actualiza todos los abonos para apuntar al nuevo creditoId
//  - Marca los docs viejos como estado: 'migrado' (NO los elimina)
//  - Actualiza cliente.montoCreditoActual con el saldo real
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc,
  writeBatch, serverTimestamp, Timestamp, updateDoc
} from 'firebase/firestore';

// ── Utilidades ───────────────────────────────────────────────────────────────
const normalizarFecha = (fecha) => {
  if (!fecha) return serverTimestamp();
  if (fecha?.toDate) return fecha;
  if (fecha?.seconds) return new Timestamp(fecha.seconds, fecha.nanoseconds || 0);
  if (fecha instanceof Date) return Timestamp.fromDate(fecha);
  if (typeof fecha === 'string') return Timestamp.fromDate(new Date(fecha));
  return serverTimestamp();
};

const genNumeroCreditoNuevo = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'ACU-';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

// ── Componente principal ─────────────────────────────────────────────────────
const MigrarCreditosFusionPage = () => {
  const { user } = useAuth();
  const router   = useRouter();

  const [fase, setFase]         = useState('idle');
  const [preview, setPreview]   = useState([]); // array de grupos por cliente
  const [log, setLog]           = useState([]);
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 });
  const [error, setError]       = useState(null);

  const isAdmin = user?.role === 'admin' || user?.email === 'admin@gmail.com';

  const addLog = (msg, tipo = 'info') =>
    setLog(prev => [...prev, { msg, tipo, ts: new Date().toLocaleTimeString('es-PE') }]);

  // ── FASE 1: Analizar — agrupar créditos viejos por clienteId ─────────────
  const analizar = async () => {
    setFase('analizando');
    setLog([]);
    setPreview([]);
    setError(null);

    try {
      addLog('Buscando todos los créditos activos...');

      const snap = await getDocs(query(
        collection(db, 'creditos'),
        where('estado', '==', 'activo')
      ));

      // Tomar TODOS los activos (incluso los ya migrados a acumulativo pero que son múltiples por cliente)
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      addLog(`Total créditos activos encontrados: ${todos.length}`);

      // Agrupar por cliente primero para detectar cuáles tienen más de 1 doc
      const gruposTemp = {};
      for (const c of todos) {
        const cid = c.clienteId || '__sin_cliente__';
        if (!gruposTemp[cid]) gruposTemp[cid] = [];
        gruposTemp[cid].push(c);
      }

      // Incluir clientes con MÁS DE UN crédito activo (necesitan fusión)
      // O clientes con exactamente 1 crédito pero que NO sea acumulativo (necesitan conversión)
      const gruposAFusionar = Object.entries(gruposTemp).filter(([, creditos]) =>
        creditos.length > 1 || creditos[0]?.tipo !== 'acumulativo'
      );

      const viejos = gruposAFusionar.flatMap(([, creditos]) => creditos);

      addLog(`Créditos que necesitan fusión: ${viejos.length} (de ${gruposAFusionar.length} cliente(s))`);

      if (viejos.length === 0) {
        addLog('Todos los clientes ya tienen exactamente 1 crédito acumulativo. ✓', 'success');
        setFase('done');
        return;
      }

      // ── Construir grupos desde gruposAFusionar ───────────────────────────
      const grupos = {};
      for (const [cid, creditos] of gruposAFusionar) {
        grupos[cid] = { clienteId: cid, creditos };
      }

      addLog(`Clientes afectados: ${Object.keys(grupos).length}`);

      // ── Para cada grupo, cargar items + abonos ───────────────────────────
      const resultado = [];

      for (const [clienteId, grupo] of Object.entries(grupos)) {

        // Obtener datos del cliente
        let clienteNombre = '', clienteDNI = '';
        try {
          const cSnap = await getDoc(doc(db, 'cliente', clienteId));
          if (cSnap.exists()) {
            clienteNombre = `${cSnap.data().nombre} ${cSnap.data().apellido || ''}`.trim();
            clienteDNI    = cSnap.data().dni || '';
          }
        } catch {}

        // Si algún crédito ya tiene nombre, usarlo de fallback
        if (!clienteNombre) {
          clienteNombre = grupo.creditos[0]?.clienteNombre || clienteId;
          clienteDNI    = grupo.creditos[0]?.clienteDNI    || '';
        }

        let todosLosItems   = [];
        let todosLosAbonos  = [];
        const idsAbonosVis  = new Set();

        for (const credito of grupo.creditos) {
          // Items de este crédito
          const itemsSnap = await getDocs(
            collection(db, 'creditos', credito.id, 'itemsCredito')
          );
          const items = itemsSnap.docs.map(d => ({
            ...d.data(),
            _origenCreditoId: credito.id,  // para trazabilidad
            _origenItemId:    d.id,
          }));
          todosLosItems = [...todosLosItems, ...items];

          // Abonos de este crédito (por creditoId y por ventaId)
          const [s1, s2] = await Promise.all([
            getDocs(query(collection(db, 'abonos'), where('creditoId', '==', credito.id))),
            credito.ventaId
              ? getDocs(query(collection(db, 'abonos'), where('ventaId', '==', credito.ventaId)))
              : Promise.resolve({ docs: [] }),
          ]);
          [...s1.docs, ...s2.docs].forEach(d => {
            if (!idsAbonosVis.has(d.id)) {
              idsAbonosVis.add(d.id);
              todosLosAbonos.push({ id: d.id, ...d.data() });
            }
          });
        }

        // Ordenar abonos por fecha asc
        todosLosAbonos.sort((a, b) => {
          const fa = a.fecha?.toDate ? a.fecha.toDate() : new Date((a.fecha?.seconds || 0) * 1000);
          const fb = b.fecha?.toDate ? b.fecha.toDate() : new Date((b.fecha?.seconds || 0) * 1000);
          return fa - fb;
        });

        const montoTotal     = todosLosItems.reduce((s, i) => s + parseFloat(i.subtotal || 0), 0);
        const montoPagado    = todosLosAbonos.reduce((s, a) => s + parseFloat(a.monto   || 0), 0);
        const saldoPendiente = Math.max(0, montoTotal - montoPagado);

        resultado.push({
          clienteId,
          clienteNombre,
          clienteDNI,
          creditos:        grupo.creditos,          // docs viejos a marcar como 'migrado'
          items:           todosLosItems,
          abonos:          todosLosAbonos,
          montoTotal,
          montoPagado,
          saldoPendiente,
          nuevoCreditoId:  doc(collection(db, 'creditos')).id, // pre-generar ID
          numeroCredito:   genNumeroCreditoNuevo(),
        });

        addLog(
          `  ✓ ${clienteNombre} | ${grupo.creditos.length} crédito(s) viejos → ` +
          `${todosLosItems.length} items, ${todosLosAbonos.length} abonos | ` +
          `Total: S/. ${montoTotal.toFixed(2)} | Abonado: S/. ${montoPagado.toFixed(2)} | Saldo: S/. ${saldoPendiente.toFixed(2)}`
        );
      }

      setPreview(resultado);
      setFase('preview');
      addLog('\nAnálisis completo. Revisa y confirma.', 'success');

    } catch (e) {
      setError(e.message);
      setFase('error');
      addLog('ERROR: ' + e.message, 'error');
    }
  };

  // ── FASE 2: Ejecutar fusión ──────────────────────────────────────────────
  const ejecutarFusion = async () => {
    const totalCredViejos = preview.reduce((s, g) => s + g.creditos.length, 0);
    if (!window.confirm(
      `¿Confirmas fusionar ${totalCredViejos} créditos viejos de ${preview.length} clientes ` +
      `en ${preview.length} créditos acumulativos nuevos?\n\n` +
      `Los docs viejos quedarán con estado "migrado" (no se eliminan).`
    )) return;

    setFase('migrando');
    setProgreso({ actual: 0, total: preview.length });
    addLog('\n=== INICIANDO FUSIÓN ===', 'info');

    let exitosos = 0, fallidos = 0;

    for (let i = 0; i < preview.length; i++) {
      const grupo = preview[i];
      setProgreso({ actual: i + 1, total: preview.length });

      try {
        // ── Firestore tiene límite de 500 ops por batch
        //    Usamos múltiples batches si hay muchos items/abonos

        // BATCH A: crear doc nuevo + marcar viejos como migrado
        const batchA = writeBatch(db);

        // 1. Crear el crédito acumulativo nuevo
        const nuevoCreditoRef = doc(db, 'creditos', grupo.nuevoCreditoId);
        batchA.set(nuevoCreditoRef, {
          tipo:             'acumulativo',
          estado:           'activo',
          clienteId:        grupo.clienteId,
          clienteNombre:    grupo.clienteNombre,
          clienteDNI:       grupo.clienteDNI,
          numeroCredito:    grupo.numeroCredito,
          montoTotal:       grupo.montoTotal,
          montoPagado:      grupo.montoPagado,
          saldoPendiente:   grupo.saldoPendiente,
          fechaApertura:    normalizarFecha(
            grupo.creditos[0]?.fechaCreacion || grupo.creditos[0]?.createdAt
          ),
          creadoEn:         serverTimestamp(),
          migradoEn:        serverTimestamp(),
          migradoPor:       user.email || user.uid,
          migradoVersion:   'v3-fusion',
          creditosOrigen:   grupo.creditos.map(c => c.id), // trazabilidad
        });

        // 2. Marcar cada crédito viejo como 'migrado'
        for (const creditoViejo of grupo.creditos) {
          batchA.update(doc(db, 'creditos', creditoViejo.id), {
            estado:          'migrado',
            migradoEn:       serverTimestamp(),
            migradoA:        grupo.nuevoCreditoId,
          });
        }

        await batchA.commit();

        // BATCH B: crear items en subcollection del nuevo crédito
        // Firestore permite máx 500 ops por batch; procesamos en chunks de 400
        const itemChunks = chunkArray(grupo.items, 400);
        for (const chunk of itemChunks) {
          const batchItems = writeBatch(db);
          for (const item of chunk) {
            const { _origenCreditoId, _origenItemId, ...itemData } = item;
            const nuevoItemRef = doc(collection(db, 'creditos', grupo.nuevoCreditoId, 'itemsCredito'));
            batchItems.set(nuevoItemRef, {
              ...itemData,
              estado:               itemData.estado           || 'activo',
              fechaAgregado:        normalizarFecha(itemData.createdAt || itemData.fechaCreacion || itemData.fechaAgregado),
              nombreProducto:       itemData.nombreProducto   || itemData.nombre           || '',
              precioVentaUnitario:  itemData.precioVentaUnitario || itemData.precioUnitario || 0,
              precioCompraUnitario: itemData.precioCompraUnitario|| itemData.precioCompra   || 0,
              subtotal:             itemData.subtotal          || 0,
              cantidad:             itemData.cantidad          || 1,
              marca:                itemData.marca             || '',
              medida:               itemData.medida            || '',
              codigoTienda:         itemData.codigoTienda      || '',
              codigoProveedor:      itemData.codigoProveedor   || '',
              color:                itemData.color             || '',
              loteId:               itemData.loteId            || null,
              numeroLote:           itemData.numeroLote        || null,
              origenCreditoId:      _origenCreditoId,  // trazabilidad
              origenItemId:         _origenItemId,
            });
          }
          await batchItems.commit();
        }

        // BATCH C: actualizar abonos para que apunten al nuevo creditoId
        const abonoChunks = chunkArray(grupo.abonos, 400);
        for (const chunk of abonoChunks) {
          const batchAbonos = writeBatch(db);
          for (const abono of chunk) {
            batchAbonos.update(doc(db, 'abonos', abono.id), {
              creditoId:  grupo.nuevoCreditoId,
              clienteId:  grupo.clienteId,
              tipo:       'acumulativo',
              fecha:      normalizarFecha(abono.fecha || abono.createdAt),
              migrado:    true,
            });
          }
          await batchAbonos.commit();
        }

        // BATCH D: actualizar montoCreditoActual del cliente
        await updateDoc(doc(db, 'cliente', grupo.clienteId), {
          montoCreditoActual: grupo.saldoPendiente,
          tieneCredito:       grupo.saldoPendiente > 0,
        });

        addLog(
          `  ✓ [${i+1}/${preview.length}] ${grupo.clienteNombre} — ` +
          `${grupo.creditos.length} crédito(s) viejos fusionados → nuevo ID: ${grupo.nuevoCreditoId.slice(0, 8)}... | ` +
          `${grupo.items.length} items, ${grupo.abonos.length} abonos | Saldo: S/. ${grupo.saldoPendiente.toFixed(2)}`,
          'success'
        );
        exitosos++;

      } catch (e) {
        addLog(`  ✗ [${i+1}/${preview.length}] ${grupo.clienteNombre} FALLÓ: ${e.message}`, 'error');
        fallidos++;
      }
    }

    addLog('\n=== FUSIÓN COMPLETADA ===', 'success');
    addLog(`✓ Exitosos: ${exitosos}`, 'success');
    if (fallidos > 0) addLog(`✗ Fallidos: ${fallidos}`, 'error');
    setFase('done');
  };

  if (!isAdmin) {
    return (
      <Layout title="Acceso denegado">
        <div className="flex items-center justify-center h-64">
          <p className="text-red-600 font-medium">Solo administradores.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Migrar Créditos — Fusión">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Migración Fusión: N créditos → 1 acumulativo
          </h1>
          <p className="text-sm text-gray-500 mb-4">
            Agrupa todos los créditos viejos de cada cliente en un único crédito acumulativo nuevo.
            <strong className="text-orange-600"> No toca stock.</strong>
          </p>

          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-900 space-y-1 mb-5">
            <p className="font-bold">⚠️ Lo que hace este script:</p>
            <p>✓ Agrupa todos los créditos viejos de cada cliente en un NUEVO doc acumulativo</p>
            <p>✓ Copia TODOS los items de todos los créditos al nuevo doc (subcollection itemsCredito)</p>
            <p>✓ Redirige todos los abonos al nuevo creditoId</p>
            <p>✓ Marca los docs viejos como <code>estado: &apos;migrado&apos;</code> (NO los elimina)</p>
            <p>✓ Actualiza <code>montoCreditoActual</code> del cliente al saldo real</p>
            <p>✓ Usa batches múltiples para soportar clientes con muchos items/abonos</p>
          </div>

          <div className="flex gap-3 flex-wrap">
            {fase === 'idle' && (
              <button onClick={analizar}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm">
                1. Analizar (sin cambios)
              </button>
            )}
            {fase === 'analizando' && (
              <button disabled className="px-5 py-2.5 bg-blue-400 text-white rounded-lg font-semibold text-sm flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Analizando...
              </button>
            )}
            {fase === 'preview' && (
              <>
                <button onClick={ejecutarFusion}
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm">
                  2. Confirmar Fusión ({preview.length} clientes)
                </button>
                <button onClick={() => { setFase('idle'); setLog([]); setPreview([]); }}
                  className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold text-sm">
                  Cancelar
                </button>
              </>
            )}
            {fase === 'migrando' && (
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600" />
                <span className="text-sm font-medium text-gray-700">
                  Fusionando {progreso.actual} / {progreso.total}...
                </span>
                <div className="w-48 bg-gray-200 rounded-full h-2">
                  <div className="bg-green-600 h-2 rounded-full transition-all"
                    style={{ width: `${(progreso.actual / progreso.total) * 100}%` }} />
                </div>
              </div>
            )}
            {fase === 'done' && (
              <div className="flex gap-3 flex-wrap">
                <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg font-semibold text-sm">
                  ✓ Fusión completada
                </span>
                <button onClick={() => router.push('/creditos/activos')}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-sm">
                  Ver Créditos Activos
                </button>
                <button onClick={() => { setFase('idle'); setLog([]); setPreview([]); }}
                  className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold text-sm">
                  Nueva Migración
                </button>
              </div>
            )}
            {fase === 'error' && (
              <div className="flex gap-3">
                <span className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-semibold">
                  ✗ Error: {error}
                </span>
                <button onClick={() => { setFase('idle'); setLog([]); setPreview([]); setError(null); }}
                  className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold text-sm">
                  Reintentar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabla preview */}
        {preview.length > 0 && fase === 'preview' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">
                Clientes a fusionar ({preview.length})
              </h2>
              <span className="text-xs text-gray-400">Revisa antes de confirmar</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Cliente','DNI','Créditos viejos','Items','Abonos','Total','Abonado','Saldo'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map(g => (
                    <tr key={g.clienteId} className="hover:bg-blue-50/40">
                      <td className="px-4 py-3 font-medium text-gray-900">{g.clienteNombre}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{g.clienteDNI || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                          {g.creditos.length} doc{g.creditos.length !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-blue-600">{g.items.length}</td>
                      <td className="px-4 py-3 text-center font-semibold text-purple-600">{g.abonos.length}</td>
                      <td className="px-4 py-3 font-semibold">S/. {g.montoTotal.toFixed(2)}</td>
                      <td className="px-4 py-3 text-green-700">S/. {g.montoPagado.toFixed(2)}</td>
                      <td className="px-4 py-3 font-bold text-red-600">S/. {g.saldoPendiente.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan="5" className="px-4 py-3 font-bold text-gray-700">TOTALES</td>
                    <td className="px-4 py-3 font-bold">S/. {preview.reduce((s,g)=>s+g.montoTotal,0).toFixed(2)}</td>
                    <td className="px-4 py-3 font-bold text-green-700">S/. {preview.reduce((s,g)=>s+g.montoPagado,0).toFixed(2)}</td>
                    <td className="px-4 py-3 font-bold text-red-600">S/. {preview.reduce((s,g)=>s+g.saldoPendiente,0).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Detalle por cliente */}
            <div className="px-5 py-4 border-t border-gray-100 space-y-4">
              <h3 className="text-sm font-bold text-gray-700">Detalle de créditos viejos por cliente</h3>
              {preview.map(g => (
                <div key={g.clienteId} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-xs font-bold text-orange-800 mb-2">
                    {g.clienteNombre} — {g.creditos.length} crédito(s) a fusionar
                  </p>
                  <div className="space-y-1">
                    {g.creditos.map(c => (
                      <div key={c.id} className="flex justify-between text-xs text-orange-700">
                        <span className="font-mono">{c.id.slice(0, 12)}...</span>
                        <span>tipo: {c.tipo || 'legacy'}</span>
                        <span className="text-orange-500">→ estado: migrado</span>
                      </div>
                    ))}
                  </div>
                  {g.abonos.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-orange-200 space-y-1">
                      <p className="text-xs font-semibold text-green-700">Abonos a redirigir ({g.abonos.length}):</p>
                      {g.abonos.map(a => {
                        const fs = a.fecha?.toDate
                          ? a.fecha.toDate().toLocaleString('es-PE', { day:'2-digit', month:'short', year:'numeric' })
                          : a.fecha?.seconds
                            ? new Date(a.fecha.seconds * 1000).toLocaleDateString('es-PE')
                            : 'fecha desconocida';
                        return (
                          <div key={a.id} className="flex justify-between text-xs text-green-700">
                            <span>S/. {parseFloat(a.monto||0).toFixed(2)} — {a.metodoPago || 'N/A'}</span>
                            <span>{fs}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Log terminal */}
        {log.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-5 font-mono text-xs space-y-0.5 max-h-96 overflow-y-auto">
            <p className="text-gray-400 mb-3 font-sans text-sm font-semibold">Log de ejecución</p>
            {log.map((entry, i) => (
              <p key={i} className={
                entry.tipo === 'error'   ? 'text-red-400' :
                entry.tipo === 'success' ? 'text-green-400' :
                'text-gray-300'
              }>
                <span className="text-gray-600">[{entry.ts}]</span> {entry.msg}
              </p>
            ))}
          </div>
        )}

      </div>
    </Layout>
  );
};

// ── Helper: partir array en chunks ──────────────────────────────────────────
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export default MigrarCreditosFusionPage;