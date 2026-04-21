// pages/admin/migrar-palabras-clave.js
// ⚠️  PÁGINA TEMPORAL — bórrala después de ejecutarla UNA VEZ

import { useState, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';

// ─────────────────────────────────────────────
//  CONFIGURACIÓN
// ─────────────────────────────────────────────
const MIN_PREFIX_LENGTH = 3;   // prefijos de 3+ letras  (CEN → CENTRIFUGO ✅)
const BATCH_SIZE        = 400; // Firestore permite máx 500 ops por batch

// ─────────────────────────────────────────────
//  LÓGICA DE GENERACIÓN DE PALABRAS CLAVE
// ─────────────────────────────────────────────

/**
 * Genera prefijos de una palabra a partir de MIN_PREFIX_LENGTH.
 * "CENTRIFUGO" → ["CEN","CENT","CENTR","CENTRI","CENTRIF","CENTRIFU","CENTRIFUG","CENTRIFUGO"]
 */
function generarPrefijos(palabra) {
  const prefijos = [];
  for (let i = MIN_PREFIX_LENGTH; i <= palabra.length; i++) {
    prefijos.push(palabra.slice(0, i));
  }
  return prefijos;
}

/**
 * Genera el array completo de palabrasClave para un producto.
 * Incluye:
 *  - Palabras completas del nombre, marca, medida, codigoTienda, codigoProveedor
 *  - Prefijos de cada una de esas palabras
 *  - El código de proveedor/tienda completo (para búsqueda exacta)
 */
function generarPalabrasClave(data) {
  const fuentes = [
    data.nombre             || '',
    data.marca              || '',
    data.medida             || '',
    data.codigoTienda       || '',
    data.codigoProveedor    || '',
    data.modelosCompatiblesTexto || '',
  ];

  const texto = fuentes.join(' ').toUpperCase();

  // Separar por espacios, guiones, barras, comas
  const palabras = texto
    .split(/[\s\-\/,\.]+/)
    .map(p => p.trim())
    .filter(p => p.length >= 2); // ignorar tokens de 1 letra

  const set = new Set();

  for (const palabra of palabras) {
    // Agregar palabra completa
    set.add(palabra);

    // Agregar prefijos si la palabra es suficientemente larga
    if (palabra.length >= MIN_PREFIX_LENGTH) {
      generarPrefijos(palabra).forEach(p => set.add(p));
    }
  }

  // Garantizar que los códigos exactos siempre estén
  if (data.codigoTienda    && data.codigoTienda.trim())    set.add(data.codigoTienda.trim().toUpperCase());
  if (data.codigoProveedor && data.codigoProveedor.trim()) set.add(data.codigoProveedor.trim().toUpperCase());

  return [...set];
}

// ─────────────────────────────────────────────
//  COMPONENTE
// ─────────────────────────────────────────────
export default function MigrarPalabrasClave() {
  const [log,     setLog]     = useState([]);
  const [running, setRunning] = useState(false);
  const [done,    setDone]    = useState(false);
  const [stats,   setStats]   = useState(null);
  const logRef = useRef(null);

  const addLog = (msg, type = 'info') => {
    setLog(prev => [...prev, { msg, type, ts: Date.now() }]);
    // auto-scroll
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 50);
  };

  const handleMigrar = async () => {
    setRunning(true);
    setLog([]);
    setStats(null);

    try {
      // 1. LEER TODOS LOS PRODUCTOS
      addLog('📦 Leyendo productos de Firestore...', 'info');
      const productosSnap = await getDocs(collection(db, 'productos'));
      const total = productosSnap.size;
      addLog(`✅ Encontrados ${total} productos`, 'success');

      if (total === 0) {
        addLog('⚠️  No hay productos para migrar.', 'warn');
        setDone(true);
        setRunning(false);
        return;
      }

      // 2. PROCESAR EN LOTES (batch writes)
      const docs = productosSnap.docs;
      let procesados = 0;
      let totalPalabras = 0;
      let loteNum = 0;

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        loteNum++;
        const chunk = docs.slice(i, i + BATCH_SIZE);
        const batch  = writeBatch(db);

        for (const docSnap of chunk) {
          const data           = docSnap.data();
          const palabrasClave  = generarPalabrasClave(data);
          totalPalabras       += palabrasClave.length;

          batch.update(doc(db, 'productos', docSnap.id), { palabrasClave });
        }

        await batch.commit();
        procesados += chunk.length;

        addLog(
          `💾 Lote ${loteNum}: ${chunk.length} productos guardados (${procesados}/${total})`,
          'success'
        );
      }

      // 3. RESUMEN
      const promedio = (totalPalabras / total).toFixed(1);
      setStats({ total, lotes: loteNum, totalPalabras, promedio });
      addLog('', 'separator');
      addLog(`🎉 Migración completada: ${total} productos en ${loteNum} lote(s)`, 'success');
      addLog(`📊 Promedio de ${promedio} palabras clave por producto`, 'info');
      addLog(`🔍 Ahora "CEN" encontrará "CENTRIFUGO", "BUJ" encontrará "BUJIA", etc.`, 'info');
      setDone(true);

    } catch (err) {
      addLog('❌ Error: ' + err.message, 'error');
      console.error(err);
    } finally {
      setRunning(false);
    }
  };

  // ── Preview: muestra cómo quedaría un producto de ejemplo
  const ejemplo = generarPalabrasClave({
    nombre: 'ZAPATA CENTRIFUGO GY6150',
    marca: 'NGK',
    codigoTienda: 'ZAP-001',
    codigoProveedor: '2262',
    medida: 'PZA',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: '2rem', fontFamily: 'monospace' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ color: '#f1f5f9', fontSize: '1.5rem', fontWeight: 700, marginBottom: '.5rem' }}>
            🔧 Migración de Palabras Clave
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '.9rem', lineHeight: 1.6 }}>
            Agrega prefijos de búsqueda a cada producto para que <strong style={{ color: '#38bdf8' }}>«CEN»</strong> encuentre{' '}
            <strong style={{ color: '#38bdf8' }}>«CENTRIFUGO»</strong>,{' '}
            <strong style={{ color: '#38bdf8' }}>«BUJ»</strong> encuentre <strong style={{ color: '#38bdf8' }}>«BUJIA»</strong>, etc.
            <br />
            <span style={{ color: '#f87171' }}>⚠️  Ejecuta esto UNA SOLA VEZ y luego borra la página.</span>
          </p>
        </div>

        {/* PREVIEW */}
        <div style={{
          background: '#1e293b', borderRadius: 8, padding: '1rem 1.25rem',
          marginBottom: '1.5rem', border: '1px solid #334155'
        }}>
          <p style={{ color: '#94a3b8', fontSize: '.8rem', marginBottom: '.5rem' }}>
            EJEMPLO — «ZAPATA CENTRIFUGO GY6150» generará {ejemplo.length} entradas:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ejemplo.map(p => (
              <span key={p} style={{
                background: p.length < 8 ? '#0f4c75' : '#1e3a5f',
                color: p.length < 8 ? '#7dd3fc' : '#93c5fd',
                fontSize: '.7rem', padding: '2px 6px', borderRadius: 4
              }}>{p}</span>
            ))}
          </div>
        </div>

        {/* CONFIG */}
        <div style={{
          background: '#1e293b', borderRadius: 8, padding: '1rem 1.25rem',
          marginBottom: '1.5rem', border: '1px solid #334155',
          display: 'flex', gap: '2rem'
        }}>
          <div>
            <p style={{ color: '#64748b', fontSize: '.75rem', marginBottom: 2 }}>PREFIJO MÍNIMO</p>
            <p style={{ color: '#f1f5f9', fontSize: '1.1rem', fontWeight: 700 }}>{MIN_PREFIX_LENGTH} letras</p>
          </div>
          <div>
            <p style={{ color: '#64748b', fontSize: '.75rem', marginBottom: 2 }}>TAMAÑO DE LOTE</p>
            <p style={{ color: '#f1f5f9', fontSize: '1.1rem', fontWeight: 700 }}>{BATCH_SIZE} docs</p>
          </div>
          <div>
            <p style={{ color: '#64748b', fontSize: '.75rem', marginBottom: 2 }}>CAMPOS INCLUIDOS</p>
            <p style={{ color: '#f1f5f9', fontSize: '.85rem' }}>nombre · marca · medida · codigoTienda · codigoProveedor</p>
          </div>
        </div>

        {/* BOTÓN */}
        <button
          onClick={handleMigrar}
          disabled={running || done}
          style={{
            padding: '0.75rem 2rem',
            background: done ? '#166534' : running ? '#334155' : '#0284c7',
            color: done ? '#86efac' : '#f1f5f9',
            border: 'none', borderRadius: 8,
            fontSize: '1rem', fontWeight: 700, cursor: running || done ? 'not-allowed' : 'pointer',
            marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 8,
            transition: 'background .2s'
          }}
        >
          {running && (
            <span style={{
              display: 'inline-block', width: 16, height: 16,
              border: '2px solid #94a3b8', borderTopColor: '#f1f5f9',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite'
            }} />
          )}
          {running ? 'Migrando...' : done ? '✅ Migración completada' : '🚀 Iniciar Migración'}
        </button>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* STATS */}
        {stats && (
          <div style={{
            background: '#14532d', border: '1px solid #166534', borderRadius: 8,
            padding: '1rem 1.25rem', marginBottom: '1.5rem',
            display: 'flex', gap: '2rem', flexWrap: 'wrap'
          }}>
            <div>
              <p style={{ color: '#86efac', fontSize: '.75rem' }}>PRODUCTOS</p>
              <p style={{ color: '#dcfce7', fontSize: '1.4rem', fontWeight: 700 }}>{stats.total}</p>
            </div>
            <div>
              <p style={{ color: '#86efac', fontSize: '.75rem' }}>LOTES ESCRITOS</p>
              <p style={{ color: '#dcfce7', fontSize: '1.4rem', fontWeight: 700 }}>{stats.lotes}</p>
            </div>
            <div>
              <p style={{ color: '#86efac', fontSize: '.75rem' }}>TOTAL ENTRADAS</p>
              <p style={{ color: '#dcfce7', fontSize: '1.4rem', fontWeight: 700 }}>{stats.totalPalabras.toLocaleString()}</p>
            </div>
            <div>
              <p style={{ color: '#86efac', fontSize: '.75rem' }}>PROMEDIO / PRODUCTO</p>
              <p style={{ color: '#dcfce7', fontSize: '1.4rem', fontWeight: 700 }}>{stats.promedio}</p>
            </div>
          </div>
        )}

        {/* LOG */}
        <div
          ref={logRef}
          style={{
            background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8,
            padding: '1rem', maxHeight: 380, overflowY: 'auto',
            fontSize: '.8rem', lineHeight: 1.7
          }}
        >
          {log.length === 0 ? (
            <p style={{ color: '#475569' }}>Los logs aparecerán aquí cuando inicies la migración...</p>
          ) : (
            log.map((entry, i) => (
              entry.type === 'separator'
                ? <hr key={i} style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '8px 0' }} />
                : <div key={i} style={{
                    color: entry.type === 'error'   ? '#f87171'
                         : entry.type === 'success' ? '#4ade80'
                         : entry.type === 'warn'    ? '#fbbf24'
                         : '#94a3b8'
                  }}>
                    {entry.msg}
                  </div>
            ))
          )}
        </div>

        {/* INSTRUCCIONES POST */}
        {done && (
          <div style={{
            marginTop: '1.5rem', background: '#1e293b', borderRadius: 8,
            padding: '1rem 1.25rem', border: '1px solid #334155'
          }}>
            <p style={{ color: '#f1f5f9', fontWeight: 700, marginBottom: '.5rem' }}>
              ✅ Próximos pasos:
            </p>
            <ol style={{ color: '#94a3b8', paddingLeft: '1.2rem', lineHeight: 2, fontSize: '.875rem' }}>
              <li>Actualiza tu función <code style={{ color: '#38bdf8' }}>searchProducts</code> con el filtro <code style={{ color: '#38bdf8' }}>includes()</code> (ver abajo)</li>
              <li>Prueba buscar «CEN» o «BUJ» en tu buscador</li>
              <li>Borra este archivo <code style={{ color: '#f87171' }}>pages/admin/migrar-palabras-clave.js</code></li>
              <li>Al crear/editar productos en el futuro, usa la misma función <code style={{ color: '#38bdf8' }}>generarPalabrasClave()</code></li>
            </ol>
          </div>
        )}

      </div>
    </div>
  );
}