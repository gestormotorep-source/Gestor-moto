// pages/admin/diagnostico-lote-especifico.js
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

const DiagnosticoLoteEspecificoPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loteEncontrado, setLoteEncontrado] = useState(null);
  const [ingresoAsociado, setIngresoAsociado] = useState(null);
  const [productoAsociado, setProductoAsociado] = useState(null);
  
  // Búsqueda por número de lote
  const [numeroLoteBusqueda, setNumeroLoteBusqueda] = useState('');
  
  // Búsqueda por producto (últimos lotes)
  const [productoIdBusqueda, setProductoIdBusqueda] = useState('');
  const [ultimosLotes, setUltimosLotes] = useState([]);

  const addLog = (msg) => setLogs(prev => [...prev, msg]);

  const buscarPorNumeroLote = async () => {
    if (!numeroLoteBusqueda.trim()) {
      alert('Ingresa un número de lote');
      return;
    }
    
    setLoading(true);
    setLogs([]);
    setLoteEncontrado(null);
    setIngresoAsociado(null);
    setProductoAsociado(null);
    
    try {
      addLog(`🔍 Buscando lote: ${numeroLoteBusqueda}...`);
      
      const q = query(
        collection(db, 'lotes'),
        where('numeroLote', '==', numeroLoteBusqueda.trim().toUpperCase())
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        addLog('❌ No se encontró ningún lote con ese número.');
        return;
      }
      
      const loteDoc = snap.docs[0];
      const loteData = loteDoc.data();
      const lote = { id: loteDoc.id, ...loteData };
      
      setLoteEncontrado(lote);
      addLog(`✅ Lote encontrado: ${lote.id}`);
      addLog(`   • Número: ${lote.numeroLote}`);
      addLog(`   • Producto: ${lote.nombreProducto} (${lote.productoId})`);
      addLog(`   • Ingreso ID: ${lote.ingresoId}`);
      addLog(`   • Estado: ${lote.estado}`);
      addLog(`   • Cantidad inicial: ${lote.cantidadInicial}`);
      addLog(`   • Stock restante: ${lote.stockRestante}`);
      addLog(`   • Fecha creación: ${lote.createdAt?.toDate?.().toLocaleString() || 'N/A'}`);
      
      // Buscar ingreso asociado
      if (lote.ingresoId) {
        addLog(`\n📦 Buscando ingreso ${lote.ingresoId}...`);
        const ingresoRef = doc(db, 'ingresos', lote.ingresoId);
        const ingresoSnap = await getDoc(ingresoRef);
        
        if (ingresoSnap.exists()) {
          const ingresoData = ingresoSnap.data();
          setIngresoAsociado({ id: ingresoSnap.id, ...ingresoData });
          addLog(`✅ Ingreso encontrado`);
          addLog(`   • Estado: ${ingresoData.estado}`);
          addLog(`   • Número boleta: ${ingresoData.numeroBoleta || 'N/A'}`);
          addLog(`   • Fecha recepción: ${ingresoData.fechaRecepcion?.toDate?.().toLocaleString() || 'N/A'}`);
          addLog(`   • Fecha confirmación: ${ingresoData.fechaConfirmacion?.toDate?.().toLocaleString() || 'N/A'}`);
        } else {
          addLog(`❌ Ingreso no encontrado`);
        }
      }
      
      // Buscar producto asociado
      if (lote.productoId) {
        addLog(`\n🛍️ Buscando producto ${lote.productoId}...`);
        const productoRef = doc(db, 'productos', lote.productoId);
        const productoSnap = await getDoc(productoRef);
        
        if (productoSnap.exists()) {
          const productoData = productoSnap.data();
          setProductoAsociado({ id: productoSnap.id, ...productoData });
          addLog(`✅ Producto encontrado`);
          addLog(`   • Nombre: ${productoData.nombre}`);
          addLog(`   • Stock actual: ${productoData.stockActual}`);
          addLog(`   • Stock umbral: ${productoData.stockReferencialUmbral}`);
        } else {
          addLog(`❌ Producto no encontrado`);
        }
      }
      
      // Análisis
      addLog(`\n📊 ANÁLISIS:`);
      if (lote.estado === 'pendiente' && lote.stockRestante > 0) {
        addLog(`⚠️ PROBLEMA DETECTADO: Lote pendiente con stockRestante > 0`);
        addLog(`   Esto NO debería pasar. Los lotes pendientes deben tener stockRestante = 0`);
      } else if (lote.estado === 'pendiente' && lote.stockRestante === 0) {
        addLog(`✅ CORRECTO: Lote pendiente con stockRestante = 0`);
      } else if (lote.estado === 'activo' && lote.stockRestante > 0) {
        addLog(`✅ CORRECTO: Lote activo con stockRestante = ${lote.stockRestante}`);
      }
      
      if (lote.stockRestante !== 0 && lote.estado === 'pendiente') {
        addLog(`\n🔧 SOLUCIÓN SUGERIDA:`);
        addLog(`   Ejecutar update en Firestore:`);
        addLog(`   collection('lotes').doc('${lote.id}').update({`);
        addLog(`     stockRestante: 0,`);
        addLog(`     updatedAt: serverTimestamp()`);
        addLog(`   })`);
      }
      
    } catch (err) {
      addLog('❌ Error: ' + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const buscarUltimosLotesPorProducto = async () => {
    if (!productoIdBusqueda.trim()) {
      alert('Ingresa un ID de producto');
      return;
    }
    
    setLoading(true);
    setLogs([]);
    setUltimosLotes([]);
    
    try {
      addLog(`🔍 Buscando últimos 10 lotes del producto: ${productoIdBusqueda}...`);
      
      const q = query(
        collection(db, 'lotes'),
        where('productoId', '==', productoIdBusqueda.trim()),
        orderBy('fechaIngreso', 'desc'),
        limit(10)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        addLog('❌ No se encontraron lotes de este producto.');
        return;
      }
      
      const lotes = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      
      setUltimosLotes(lotes);
      addLog(`✅ Se encontraron ${lotes.length} lotes`);
      
      lotes.forEach((lote, i) => {
        addLog(`\n${i + 1}. Lote ${lote.numeroLote}`);
        addLog(`   • Estado: ${lote.estado}`);
        addLog(`   • Stock restante: ${lote.stockRestante}`);
        addLog(`   • Cantidad inicial: ${lote.cantidadInicial}`);
        addLog(`   • Fecha: ${lote.fechaIngreso?.toDate?.().toLocaleString() || 'N/A'}`);
      });
      
    } catch (err) {
      addLog('❌ Error: ' + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const corregirLote = async (loteId) => {
    if (!window.confirm('¿Corregir este lote estableciendo stockRestante = 0?')) return;
    
    setLoading(true);
    try {
      const { updateDoc, serverTimestamp } = await import('firebase/firestore');
      const loteRef = doc(db, 'lotes', loteId);
      await updateDoc(loteRef, {
        stockRestante: 0,
        updatedAt: serverTimestamp(),
      });
      alert('✅ Lote corregido. Recarga la página para ver los cambios.');
      addLog(`✅ Lote ${loteId} corregido exitosamente`);
    } catch (err) {
      alert('❌ Error: ' + err.message);
      addLog('❌ Error al corregir: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Layout title="Diagnóstico de Lote Específico">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">🔍 Diagnóstico de Lote Específico</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Búsqueda por número de lote */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Buscar por Número de Lote</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={numeroLoteBusqueda}
                onChange={(e) => setNumeroLoteBusqueda(e.target.value)}
                placeholder="Ej: L240101-ABC1"
                className="flex-1 px-3 py-2 border rounded"
              />
              <button
                onClick={buscarPorNumeroLote}
                disabled={loading || !numeroLoteBusqueda.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>
          
          {/* Búsqueda por producto */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Buscar Últimos Lotes por Producto</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={productoIdBusqueda}
                onChange={(e) => setProductoIdBusqueda(e.target.value)}
                placeholder="ID del producto"
                className="flex-1 px-3 py-2 border rounded"
              />
              <button
                onClick={buscarUltimosLotesPorProducto}
                disabled={loading || !productoIdBusqueda.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>
        </div>
        
        {/* Logs */}
        {logs.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded p-4 mb-6 max-h-96 overflow-y-auto font-mono text-sm">
            {logs.map((log, i) => (
              <div key={i} className="mb-1 whitespace-pre-wrap">{log}</div>
            ))}
          </div>
        )}
        
        {/* Resultado: Lote encontrado */}
        {loteEncontrado && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">📦 Lote Encontrado</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">ID</p>
                <p className="font-mono text-sm">{loteEncontrado.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Número de Lote</p>
                <p className="font-mono text-lg font-bold">{loteEncontrado.numeroLote}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Estado</p>
                <span className={`inline-flex px-2 py-1 rounded text-sm font-medium ${
                  loteEncontrado.estado === 'activo' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {loteEncontrado.estado}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600">Stock Restante</p>
                <p className={`text-lg font-bold ${
                  loteEncontrado.stockRestante > 0 && loteEncontrado.estado === 'pendiente'
                    ? 'text-red-600'
                    : 'text-gray-900'
                }`}>
                  {loteEncontrado.stockRestante}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Cantidad Inicial</p>
                <p className="text-lg">{loteEncontrado.cantidadInicial}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fecha Creación</p>
                <p className="text-sm">{loteEncontrado.createdAt?.toDate?.().toLocaleString() || 'N/A'}</p>
              </div>
            </div>
            
            {loteEncontrado.estado === 'pendiente' && loteEncontrado.stockRestante > 0 && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
                <p className="text-red-800 font-bold mb-2">⚠️ PROBLEMA DETECTADO</p>
                <p className="text-sm text-red-700 mb-3">
                  Este lote está en estado <strong>pendiente</strong> pero tiene <strong>stockRestante = {loteEncontrado.stockRestante}</strong>.
                  Debería tener stockRestante = 0.
                </p>
                <button
                  onClick={() => corregirLote(loteEncontrado.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                >
                  Corregir (poner stockRestante = 0)
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Ingreso asociado */}
        {ingresoAsociado && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">📋 Ingreso Asociado</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Estado</p>
                <span className={`inline-flex px-2 py-1 rounded text-sm font-medium ${
                  ingresoAsociado.estado === 'recibido' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {ingresoAsociado.estado}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600">Número Boleta</p>
                <p className="text-sm">{ingresoAsociado.numeroBoleta || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fecha Recepción</p>
                <p className="text-sm">{ingresoAsociado.fechaRecepcion?.toDate?.().toLocaleString() || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fecha Confirmación</p>
                <p className="text-sm">{ingresoAsociado.fechaConfirmacion?.toDate?.().toLocaleString() || 'N/A'}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Producto asociado */}
        {productoAsociado && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">🛍️ Producto Asociado</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Nombre</p>
                <p className="text-sm">{productoAsociado.nombre}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Stock Actual</p>
                <p className="text-lg font-bold">{productoAsociado.stockActual}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Stock Umbral</p>
                <p className="text-sm">{productoAsociado.stockReferencialUmbral}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Últimos lotes de un producto */}
        {ultimosLotes.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Últimos Lotes del Producto</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left">Lote</th>
                    <th className="px-3 py-2 text-center">Estado</th>
                    <th className="px-3 py-2 text-center">Stock Restante</th>
                    <th className="px-3 py-2 text-center">Cant. Inicial</th>
                    <th className="px-3 py-2 text-left">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimosLotes.map(lote => (
                    <tr key={lote.id} className="border-b">
                      <td className="px-3 py-2 font-mono">{lote.numeroLote}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                          lote.estado === 'activo' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {lote.estado}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-center font-bold ${
                        lote.stockRestante > 0 && lote.estado === 'pendiente'
                          ? 'text-red-600'
                          : 'text-gray-900'
                      }`}>
                        {lote.stockRestante}
                      </td>
                      <td className="px-3 py-2 text-center">{lote.cantidadInicial}</td>
                      <td className="px-3 py-2 text-sm">
                        {lote.fechaIngreso?.toDate?.().toLocaleString() || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default DiagnosticoLoteEspecificoPage;