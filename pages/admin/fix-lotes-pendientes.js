// pages/admin/fix-lotes-pendientes.js
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';

const FixLotesPendientesPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [lotesAfectados, setLotesAfectados] = useState([]);
  
  // Filtros específicos
  const [ingresoIdsInput, setIngresoIdsInput] = useState('');
  const [soloMostrar, setSoloMostrar] = useState(true);

  const addLog = (msg) => setLogs(prev => [...prev, msg]);

  const parseIngresoIds = () => {
    if (!ingresoIdsInput.trim()) return [];
    return ingresoIdsInput
      .split(/[,\s]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);
  };

  const buscarLotesConProblema = async () => {
    if (!user) return;
    
    setLoading(true);
    setLogs([]);
    setLotesAfectados([]);
    
    try {
      const ingresoIds = parseIngresoIds();
      
      if (ingresoIds.length > 0) {
        addLog(`🔍 Buscando lotes pendientes con stockRestante > 0 SOLO en los ingresos especificados...`);
        addLog(`📋 Ingresos a verificar: ${ingresoIds.join(', ')}`);
      } else {
        addLog('🔍 Buscando lotes pendientes con stockRestante > 0 en TODA la base de datos...');
        addLog('⚠️ ADVERTENCIA: No especificaste ingresos. Se buscará en TODOS los lotes pendientes.');
        addLog('💡 Sugerencia: Especifica números de ingreso para una búsqueda más segura.');
      }
      
      let lotesConProblema = [];
      
      if (ingresoIds.length > 0) {
        // Búsqueda específica por ingresos
        for (const ingresoId of ingresoIds) {
          addLog(`\n📦 Verificando ingreso: ${ingresoId}...`);
          
          // Verificar si el ingreso existe
          const ingresoRef = doc(db, 'ingresos', ingresoId);
          const ingresoSnap = await getDoc(ingresoRef);
          
          if (!ingresoSnap.exists()) {
            addLog(`   ❌ Ingreso ${ingresoId} no encontrado`);
            continue;
          }
          
          const ingresoData = ingresoSnap.data();
          addLog(`   ✅ Ingreso encontrado - Estado: ${ingresoData.estado || 'N/A'}, Boleta: ${ingresoData.numeroBoleta || 'N/A'}`);
          
          // Buscar lotes de este ingreso
          const q = query(
            collection(db, 'lotes'),
            where('ingresoId', '==', ingresoId),
            where('estado', '==', 'pendiente')
          );
          const snap = await getDocs(q);
          
          if (snap.empty) {
            addLog(`   ℹ️ No hay lotes pendientes en este ingreso`);
            continue;
          }
          
          snap.docs.forEach(d => {
            const data = d.data();
            const stockRestante = parseFloat(data.stockRestante || 0);
            
            if (stockRestante > 0) {
              lotesConProblema.push({
                id: d.id,
                numeroLote: data.numeroLote,
                nombreProducto: data.nombreProducto,
                stockRestante: stockRestante,
                ingresoId: data.ingresoId,
                cantidad: data.cantidad,
              });
              addLog(`   ⚠️ Lote ${data.numeroLote} (${data.nombreProducto}): stockRestante = ${stockRestante} (debería ser 0)`);
            } else {
              addLog(`   ✅ Lote ${data.numeroLote}: OK (stockRestante = 0)`);
            }
          });
        }
      } else {
        // Búsqueda general en TODOS los lotes pendientes
        const q = query(collection(db, 'lotes'), where('estado', '==', 'pendiente'));
        const snap = await getDocs(q);
        
        addLog(`\n📊 Se encontraron ${snap.size} lotes pendientes en total...`);
        addLog('⏳ Analizando uno por uno...');
        
        snap.docs.forEach(d => {
          const data = d.data();
          const stockRestante = parseFloat(data.stockRestante || 0);
          
          if (stockRestante > 0) {
            lotesConProblema.push({
              id: d.id,
              numeroLote: data.numeroLote,
              nombreProducto: data.nombreProducto,
              stockRestante: stockRestante,
              ingresoId: data.ingresoId,
              cantidad: data.cantidad,
            });
            addLog(`⚠️ Lote ${data.numeroLote} (${data.nombreProducto}) - Ingreso ${data.ingresoId}: stockRestante = ${stockRestante}`);
          }
        });
      }
      
      if (lotesConProblema.length === 0) {
        addLog('\n✅ ¡No se encontraron lotes con problema! Todo está correcto.');
      } else {
        addLog(`\n📊 RESUMEN: ${lotesConProblema.length} lote(s) con stockRestante > 0 en estado pendiente`);
      }
      
      setLotesAfectados(lotesConProblema);
      
    } catch (err) {
      addLog('❌ Error: ' + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const corregirLotes = async () => {
    if (!user) return;
    if (lotesAfectados.length === 0) return;
    
    if (!window.confirm(`⚠️ ¿Estás SEGURO de que deseas corregir ${lotesAfectados.length} lote(s)?\n\nEsto establecerá stockRestante = 0 en todos los lotes listados.\n\nEsta acción NO se puede deshacer.`)) {
      return;
    }
    
    // Doble confirmación si son muchos lotes
    if (lotesAfectados.length >= 10) {
      if (!window.confirm(`⚠️⚠️ ADVERTENCIA: Vas a modificar ${lotesAfectados.length} lotes.\n\n¿Estás ABSOLUTAMENTE SEGURO? Revisa bien la lista antes de continuar.`)) {
        return;
      }
    }
    
    setLoading(true);
    setLogs(prev => [...prev, '\n🔧 INICIANDO CORRECCIÓN...']);
    
    try {
      let corregidos = 0;
      let errores = 0;
      const erroresDetallados = [];
      
      for (const lote of lotesAfectados) {
        try {
          // Verificación previa
          const loteRef = doc(db, 'lotes', lote.id);
          const loteSnap = await getDoc(loteRef);
          
          if (!loteSnap.exists()) {
            addLog(`❌ Lote ${lote.numeroLote} (ID: ${lote.id}) ya no existe`);
            errores++;
            continue;
          }
          
          const currentData = loteSnap.data();
          if (currentData.estado !== 'pendiente') {
            addLog(`⚠️ Lote ${lote.numeroLote} ya no está pendiente (estado: ${currentData.estado}), se omite`);
            continue;
          }
          
          if (parseFloat(currentData.stockRestante || 0) === 0) {
            addLog(`ℹ️ Lote ${lote.numeroLote} ya tiene stockRestante = 0, se omite`);
            continue;
          }
          
          // Corrección
          await updateDoc(loteRef, {
            stockRestante: 0,
            updatedAt: serverTimestamp(),
          });
          
          addLog(`✅ Lote ${lote.numeroLote} corregido: ${currentData.stockRestante} → 0`);
          corregidos++;
          
        } catch (err) {
          const errorMsg = `❌ Error corrigiendo lote ${lote.numeroLote}: ${err.message}`;
          addLog(errorMsg);
          erroresDetallados.push(`${lote.numeroLote}: ${err.message}`);
          errores++;
        }
      }
      
      addLog(`\n${'='.repeat(50)}`);
      addLog(`✅ PROCESO COMPLETADO`);
      addLog(`   • Lotes corregidos: ${corregidos}`);
      addLog(`   • Errores: ${errores}`);
      if (errores > 0) {
        addLog(`\n❌ Errores detallados:`);
        erroresDetallados.forEach(msg => addLog(`   - ${msg}`));
      }
      addLog(`${'='.repeat(50)}`);
      
      setLotesAfectados([]);
      
    } catch (err) {
      addLog('❌ Error general: ' + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const ingresoIds = parseIngresoIds();

  return (
    <Layout title="Fix Lotes Pendientes">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">🔧 Fix Lotes Pendientes con Stock Incorrecto</h1>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800 font-bold mb-2">⚠️ IMPORTANTE - LEER ANTES DE USAR:</p>
          <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
            <li>Este script busca lotes con <code>estado = 'pendiente'</code> que tienen <code>stockRestante {'>'} 0</code></li>
            <li>Los corrige estableciendo <code>stockRestante = 0</code></li>
            <li><strong>RECOMENDADO:</strong> Especifica los IDs de ingreso para limitar la búsqueda</li>
            <li>Si no especificas ingresos, buscará en TODA la base de datos (más lento y riesgoso)</li>
          </ul>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">1️⃣ Especificar Ingresos (Opcional pero Recomendado)</h2>
          <p className="text-gray-600 text-sm mb-3">
            Ingresa los IDs de los ingresos problemáticos separados por comas. 
            Si lo dejas vacío, buscará en TODOS los lotes pendientes.
          </p>
          <input
            type="text"
            value={ingresoIdsInput}
            onChange={(e) => setIngresoIdsInput(e.target.value)}
            placeholder="Ej: abc123xyz, def456uvw"
            className="w-full px-3 py-2 border border-gray-300 rounded mb-3"
          />
          <div className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              id="soloMostrar"
              checked={soloMostrar}
              onChange={(e) => setSoloMostrar(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="soloMostrar" className="text-sm text-gray-700">
              Solo mostrar, no corregir (útil para revisar primero)
            </label>
          </div>
          
          <button
            onClick={buscarLotesConProblema}
            disabled={loading}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
          >
            {loading ? '🔍 Buscando...' : '🔍 Buscar Lotes con Problema'}
          </button>
        </div>
        
        {logs.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded p-4 mb-6 max-h-96 overflow-y-auto font-mono text-xs">
            {logs.map((log, i) => (
              <div key={i} className="mb-1 whitespace-pre-wrap">{log}</div>
            ))}
          </div>
        )}
        
        {lotesAfectados.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-red-600">
              ⚠️ Se Encontraron {lotesAfectados.length} Lote(s) con Problema
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-red-50 border-b-2 border-red-200">
                    <th className="px-3 py-3 text-left">Lote</th>
                    <th className="px-3 py-3 text-left">Producto</th>
                    <th className="px-3 py-3 text-center">Stock Actual</th>
                    <th className="px-3 py-3 text-center">Debería Ser</th>
                    <th className="px-3 py-3 text-left">Ingreso ID</th>
                  </tr>
                </thead>
                <tbody>
                  {lotesAfectados.map(lote => (
                    <tr key={lote.id} className="border-b hover:bg-red-50">
                      <td className="px-3 py-3 font-mono font-bold text-blue-700">{lote.numeroLote}</td>
                      <td className="px-3 py-3">{lote.nombreProducto}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-block px-2 py-1 bg-red-100 text-red-700 rounded font-bold">
                          {lote.stockRestante}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded font-bold">
                          0
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-gray-600">{lote.ingresoId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {!soloMostrar && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 font-bold mb-2">⚠️ ¿Corregir estos {lotesAfectados.length} lote(s)?</p>
                <p className="text-sm text-red-700 mb-3">
                  Se establecerá <code>stockRestante = 0</code> en todos los lotes listados.
                  Esta acción NO se puede deshacer.
                </p>
                <button
                  onClick={corregirLotes}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-semibold"
                >
                  {loading ? '🔧 Corrigiendo...' : `✅ Corregir ${lotesAfectados.length} Lote(s)`}
                </button>
              </div>
            )}
            
            {soloMostrar && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800 font-bold">ℹ️ Modo "Solo Mostrar"</p>
                <p className="text-sm text-blue-700">
                  Has activado la opción "Solo mostrar". Para corregir los lotes, 
                  desmarca esa casilla y vuelve a buscar.
                </p>
              </div>
            )}
          </div>
        )}
        
        {lotesAfectados.length === 0 && logs.length > 0 && !loading && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <p className="text-green-800 font-bold text-lg">✅ ¡Todo Correcto!</p>
            <p className="text-green-700">No se encontraron lotes pendientes con stock incorrecto.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default FixLotesPendientesPage;