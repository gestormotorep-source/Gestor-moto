import { useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import { Calendar } from '../../components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  collection, query, where, orderBy, getDocs, doc, getDoc, Timestamp
} from 'firebase/firestore';
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  BanknotesIcon,
  DevicePhoneMobileIcon,
  CreditCardIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

// ── DatePickerPopover ─────────────────────────────────────────────────────
const DatePickerPopover = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(selected || new Date());
  const ref = useRef(null);

  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => currentYear - 4 + i);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm text-gray-700 hover:bg-gray-50 shadow-sm font-medium"
      >
        <CalendarIcon className="h-4 w-4 text-gray-400" />
        {selected ? format(selected, "dd 'de' MMMM 'de' yyyy", { locale: es }) : 'Seleccionar fecha'}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl">
          <div className="flex items-center justify-between px-3 pt-3 pb-1 gap-2">
            <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 hover:bg-gray-50">
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <div className="flex gap-1">
              <select value={month.getMonth()} onChange={e => setMonth(m => new Date(m.getFullYear(), parseInt(e.target.value), 1))}
                className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer">
                {meses.map((mes, i) => <option key={i} value={i}>{mes}</option>)}
              </select>
              <select value={month.getFullYear()} onChange={e => setMonth(m => new Date(parseInt(e.target.value), m.getMonth(), 1))}
                className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 hover:bg-gray-50">
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
          <Calendar mode="single" selected={selected} month={month} onMonthChange={setMonth}
            onSelect={date => { if (date) { onChange(date); setOpen(false); } }}
            captionLayout="label"
            classNames={{ month_caption: "hidden", nav: "hidden" }}
          />
        </div>
      )}
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = n => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n || 0);

const metodoPagoLabel = m => {
  const map = { efectivo:'Efectivo', yape:'Yape', plin:'Plin', tarjeta:'Tarjeta', tarjeta_credito:'T.Crédito', tarjeta_debito:'T.Débito', mixto:'Mixto' };
  return map[(m||'').toLowerCase()] || (m||'N/A');
};

const metodoBadgeClass = m => {
  const map = {
    efectivo: 'bg-green-100 text-green-800',
    yape: 'bg-purple-100 text-purple-800',
    plin: 'bg-blue-100 text-blue-800',
    tarjeta: 'bg-gray-100 text-gray-800',
    tarjeta_credito: 'bg-gray-100 text-gray-800',
    tarjeta_debito: 'bg-gray-100 text-gray-800',
    mixto: 'bg-orange-100 text-orange-800',
  };
  return map[(m||'').toLowerCase()] || 'bg-gray-100 text-gray-800';
};

// ── Main Component ─────────────────────────────────────────────────────────
const AuditoriaPage = () => {
  const { user } = useAuth();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const isAdmin = user?.role === 'admin' || user?.email === 'admin@gmail.com';

  if (!isAdmin) {
    return (
      <Layout title="Auditoría">
        <div className="flex items-center justify-center h-64">
          <p className="text-red-600 font-medium">Acceso restringido — solo administradores.</p>
        </div>
      </Layout>
    );
  }

  const cargar = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    const startOfDay = new Date(selectedDate); startOfDay.setHours(0,0,0,0);
    const endOfDay   = new Date(selectedDate); endOfDay.setHours(23,59,59,999);
    const tsStart = Timestamp.fromDate(startOfDay);
    const tsEnd   = Timestamp.fromDate(endOfDay);
    const fechaString = selectedDate.toISOString().split('T')[0];

    try {
      // ── Dinero inicial ──────────────────────────────────────────────
      let dineroInicial = 0;
      try {
        const diSnap = await getDoc(doc(db, 'dineroInicial', fechaString));
        if (diSnap.exists()) dineroInicial = parseFloat(diSnap.data().monto || 0);
      } catch {}

      // ── Ventas ─────────────────────────────────────────────────────
      const ventasSnap = await getDocs(query(
        collection(db, 'ventas'),
        where('fechaVenta', '>=', tsStart),
        where('fechaVenta', '<=', tsEnd),
        where('estado', '==', 'completada'),
        orderBy('fechaVenta', 'asc')
      ));
      const ventas = ventasSnap.docs
        .map(d => ({ id: d.id, ...d.data(), fechaVentaDate: d.data().fechaVenta?.toDate?.() || new Date() }))
        .filter(v => v.tipoVenta !== 'credito');

      // Cargar items de cada venta
      for (const v of ventas) {
        try {
          const itemsSnap = await getDocs(query(collection(db, 'ventas', v.id, 'itemsVenta'), orderBy('createdAt','asc')));
          v.items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch { v.items = []; }
      }

      // ── Abonos ─────────────────────────────────────────────────────
      let abonos = [];
      try {
        const aSnap = await getDocs(query(
          collection(db, 'abonos'),
          where('fecha', '>=', tsStart),
          where('fecha', '<=', tsEnd),
          orderBy('fecha', 'asc')
        ));
        abonos = aSnap.docs.map(d => ({ id: d.id, ...d.data(), fechaDate: d.data().fecha?.toDate?.() || new Date() }));
      } catch {}

      // ── Retiros ────────────────────────────────────────────────────
      let retiros = [];
      try {
        const rSnap = await getDocs(query(
          collection(db, 'retiros'),
          where('fecha', '>=', tsStart),
          where('fecha', '<=', tsEnd),
          orderBy('fecha', 'asc')
        ));
        retiros = rSnap.docs.map(d => ({ id: d.id, ...d.data(), fechaDate: d.data().fecha?.toDate?.() || new Date() }));
      } catch {}

      // ── Devoluciones ───────────────────────────────────────────────
      let devoluciones = [];
      try {
        const dSnap = await getDocs(query(
            collection(db, 'devoluciones'),
            where('fechaProcesamiento', '>=', tsStart),
            where('fechaProcesamiento', '<=', tsEnd),
            where('estado', 'in', ['aprobada', 'procesada'])
            // ← sin orderBy para evitar requerir índice compuesto
        ));
        devoluciones = dSnap.docs
            .map(d => ({ id: d.id, ...d.data(), fechaDate: d.data().fechaProcesamiento?.toDate?.() || new Date() }))
            .sort((a, b) => a.fechaDate - b.fechaDate);
        for (const dev of devoluciones) {
          try {
            const diSnap = await getDocs(collection(db, 'devoluciones', dev.id, 'itemsDevolucion'));
            dev.items = diSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          } catch { dev.items = []; }
        }
      } catch (e) { console.error('ERROR DEVOLUCIONES:', e); }

      // ── Excedentes créditos acumulativos ───────────────────────────────
        let excedentes = [];
        try {
        const exSnap = await getDocs(query(
            collection(db, 'creditos'),
            where('fechaSaldado', '>=', tsStart),
            where('fechaSaldado', '<=', tsEnd),
            where('tipo', '==', 'acumulativo')
        ));
        excedentes = exSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(c => parseFloat(c.excedentePagoCliente || 0) > 0);
        } catch (e) { console.warn('Error excedentes:', e); }

      // ── Calcular totales por método ────────────────────────────────
      const sumarMetodo = (obj, metodo, monto) => {
        const m = (metodo||'').toLowerCase();
        obj.total = (obj.total||0) + monto;
        if (m === 'efectivo') obj.efectivo = (obj.efectivo||0) + monto;
        else if (m === 'yape') obj.yape = (obj.yape||0) + monto;
        else if (m === 'plin') obj.plin = (obj.plin||0) + monto;
        else if (['tarjeta','tarjeta_credito','tarjeta_debito'].includes(m)) obj.tarjeta = (obj.tarjeta||0) + monto;
      };

      const totVentas = { efectivo:0, yape:0, plin:0, tarjeta:0, total:0 };
      for (const v of ventas) {
        if (v.paymentData?.isMixedPayment && v.paymentData.paymentMethods) {
          v.paymentData.paymentMethods.forEach(pm => sumarMetodo(totVentas, pm.method, parseFloat(pm.amount||0)));
        } else {
          sumarMetodo(totVentas, v.metodoPago, parseFloat(v.totalVenta||0));
        }
      }

      const totAbonos = { efectivo:0, yape:0, plin:0, tarjeta:0, total:0 };
      for (const a of abonos) sumarMetodo(totAbonos, a.metodoPago, parseFloat(a.monto||0));

      const totRetiros = { efectivo:0, yape:0, plin:0, tarjeta:0, total:0 };
      for (const r of retiros) sumarMetodo(totRetiros, r.tipo, parseFloat(r.monto||0));

      const totDev = { efectivo:0, yape:0, plin:0, tarjeta:0, total:0 };
      for (const d of devoluciones) sumarMetodo(totDev, d.metodoPagoDevolucion||d.metodoPagoOriginal, parseFloat(d.montoADevolver||0));

      const gananciaTotal = ventas.reduce((s,v) => s + parseFloat(v.gananciaTotalVenta||0), 0);

      const totExcedentes = { efectivo:0, yape:0, plin:0, tarjeta:0, total:0 };
        for (const ex of excedentes) {
        sumarMetodo(totExcedentes, ex.excedenteMetodoPago || 'efectivo', parseFloat(ex.excedentePagoCliente || 0));
        }

        // Recalcular netos incluyendo excedentes
      const netoEfectivo = totVentas.efectivo + totAbonos.efectivo - totDev.efectivo - totRetiros.efectivo - totExcedentes.efectivo;
      const netoYape     = totVentas.yape     + totAbonos.yape     - totDev.yape     - totRetiros.yape     - totExcedentes.yape;
      const netoPlin     = totVentas.plin     + totAbonos.plin     - totDev.plin     - totRetiros.plin     - totExcedentes.plin;
      const netoTarjeta  = totVentas.tarjeta  + totAbonos.tarjeta  - totDev.tarjeta  - totRetiros.tarjeta  - totExcedentes.tarjeta;
      const efectivoFisico = dineroInicial + netoEfectivo;
      const totalDia = efectivoFisico + netoYape + netoPlin + netoTarjeta;

      setData({
        dineroInicial, ventas, abonos, retiros, devoluciones,
        excedentes, totExcedentes,   // ← NUEVO
        totVentas, totAbonos, totRetiros, totDev, gananciaTotal,
        netoEfectivo, netoYape, netoPlin, netoTarjeta, efectivoFisico, totalDia,
       });

    } catch (e) {
      setError('Error al cargar datos: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Auditoría de Caja">
      <div className="flex flex-col mx-4 py-4 space-y-5">

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <DocumentTextIcon className="h-7 w-7 text-blue-600" />
                Auditoría Completa
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">Detalle total de ventas, abonos, retiros y devoluciones por día</p>
            </div>
            <div className="flex items-center gap-3">
              <DatePickerPopover selected={selectedDate} onChange={setSelectedDate} />
              {data && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Dinero Inicial:</span>
                  <span className="text-sm font-bold text-blue-800">{fmt(data.dineroInicial)}</span>
                </div>
              )}
              <button
                onClick={cargar}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm shadow-sm disabled:opacity-50 transition"
              >
                {loading
                  ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Cargando...</>
                  : <><MagnifyingGlassIcon className="h-4 w-4" />Cargar Auditoría</>
                }
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5" />{error}
          </div>
        )}

        {!data && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <DocumentTextIcon className="h-16 w-16 mx-auto text-gray-200 mb-4" />
            <p className="text-gray-400 font-medium">Selecciona una fecha y presiona <strong>Cargar Auditoría</strong></p>
          </div>
        )}

        {data && (
          <>
            {/* ── CARDS RESUMEN ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-5 text-white shadow">
                <p className="text-green-100 text-xs font-semibold uppercase tracking-wide mb-1">Efectivo Físico</p>
                <p className="text-2xl font-bold">{fmt(data.efectivoFisico)}</p>
                <p className="text-green-200 text-xs mt-1">Inicial: {fmt(data.dineroInicial)}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-5 text-white shadow">
                <p className="text-purple-100 text-xs font-semibold uppercase tracking-wide mb-1">Yape</p>
                <p className="text-2xl font-bold">{fmt(data.netoYape)}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white shadow">
                <p className="text-blue-100 text-xs font-semibold uppercase tracking-wide mb-1">Plin</p>
                <p className="text-2xl font-bold">{fmt(data.netoPlin)}</p>
              </div>
              <div className="bg-gradient-to-br from-gray-600 to-gray-700 rounded-xl p-5 text-white shadow">
                <p className="text-gray-200 text-xs font-semibold uppercase tracking-wide mb-1">Tarjeta</p>
                <p className="text-2xl font-bold">{fmt(data.netoTarjeta)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Total del Día</p>
                <p className="text-xl font-bold text-indigo-600">{fmt(data.totalDia)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Ganancia Real</p>
                <p className="text-xl font-bold text-emerald-600">{fmt(data.gananciaTotal)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Total Retiros</p>
                <p className="text-xl font-bold text-red-600">{fmt(data.totRetiros.total)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Total Devuelto</p>
                <p className="text-xl font-bold text-orange-600">{fmt(data.totDev.total)}</p>
              </div>
            </div>

            {/* ── TABLA DESGLOSE POR MÉTODO ──────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <ChartBarIcon className="h-5 w-5 text-indigo-500" />
                  Desglose por Método de Pago
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Método','Ventas','+ Abonos','- Devoluciones','- Retiros','- Excedentes','Neto','+ Inicial','= En Caja'].map(h => (
                        <th key={h} className="px-4 py-3 text-right first:text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[
                      { label:'💵 Efectivo', key:'efectivo', inicial: data.dineroInicial },
                      { label:'📱 Yape',     key:'yape',     inicial: 0 },
                      { label:'📲 Plin',     key:'plin',     inicial: 0 },
                      { label:'💳 Tarjeta',  key:'tarjeta',  inicial: 0 },
                    ].map(row => {
                        const neto = data.totVentas[row.key] + data.totAbonos[row.key] 
                                    - data.totDev[row.key] - data.totRetiros[row.key] 
                                    - (data.totExcedentes[row.key] || 0);   // ← incluir
                        const enCaja = neto + row.inicial;
                      return (
                        <tr key={row.key} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{row.label}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmt(data.totVentas[row.key])}</td>
                          <td className="px-4 py-3 text-right text-blue-600">+{fmt(data.totAbonos[row.key])}</td>
                          <td className="px-4 py-3 text-right text-orange-600">-{fmt(data.totDev[row.key])}</td>
                          <td className="px-4 py-3 text-right text-red-600">-{fmt(data.totRetiros[row.key])}</td>
                          <td className="px-4 py-3 text-right text-purple-600">-{fmt(data.totExcedentes[row.key] || 0)}</td> 
                          <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(neto)}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{row.inicial > 0 ? `+${fmt(row.inicial)}` : '—'}</td>
                          <td className="px-4 py-3 text-right font-bold text-green-700">{fmt(enCaja)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td className="px-4 py-3 font-bold text-gray-800">TOTAL</td>
                      <td className="px-4 py-3 text-right font-bold">{fmt(data.totVentas.total)}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600">+{fmt(data.totAbonos.total)}</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-600">-{fmt(data.totDev.total)}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">-{fmt(data.totRetiros.total)}</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600">-{fmt(data.totExcedentes.total)}</td>
                      <td className="px-4 py-3 text-right font-bold"></td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600">+{fmt(data.dineroInicial)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-700 text-base">{fmt(data.totalDia)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── VENTAS DETALLADAS ──────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <ShoppingCartIcon className="h-5 w-5 text-green-600" />
                  Ventas del Día
                </h2>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800">
                  {data.ventas.length} ventas · {fmt(data.totVentas.total)}
                </span>
              </div>

              <div className="divide-y divide-gray-100">
                {data.ventas.map((v, vi) => {
                  const hora = v.fechaVentaDate.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
                  const esDevuelta = v.estadoDevolucion === 'devuelta';
                  const esParcial  = v.estadoDevolucion === 'parcial';

                  // Ganancia total de items
                  const gananciaVenta = v.items.reduce((s,i) => s + parseFloat(i.gananciaTotal||0), 0);

                  return (
                    <div key={v.id} className={`${vi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      {/* Encabezado de venta */}
                      <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-gray-100">
                        <span className="font-mono font-bold text-blue-700 text-sm">{v.numeroVenta || v.id.slice(0,12).toUpperCase()}</span>
                        <span className="text-xs text-gray-400">{hora}</span>
                        <span className="text-xs text-gray-600 font-medium">👤 {v.clienteNombre}</span>

                        {/* Método de pago */}
                        {v.paymentData?.isMixedPayment
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold">
                              MIXTO: {v.paymentData.paymentMethods.filter(pm=>pm.amount>0).map(pm=>`${metodoPagoLabel(pm.method)} ${fmt(pm.amount)}`).join(' + ')}
                            </span>
                          : <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${metodoBadgeClass(v.metodoPago)}`}>
                              {metodoPagoLabel(v.metodoPago).toUpperCase()}
                            </span>
                        }

                        {esDevuelta && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-semibold">DEVUELTA</span>}
                        {esParcial  && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold">DEV. PARCIAL</span>}

                        <div className="ml-auto flex items-center gap-4 text-sm">
                          <span className="text-gray-400 text-xs">Ganancia: <span className="text-emerald-600 font-semibold">{fmt(gananciaVenta)}</span></span>
                          <span className="font-bold text-gray-900">{fmt(v.totalVenta)}</span>
                        </div>
                      </div>

                      {/* Tabla de items */}
                      {v.items.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-green-50">
                                <th className="px-3 py-2 text-left text-xs font-semibold text-green-700 uppercase tracking-wide">C. Tienda</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-green-700 uppercase tracking-wide">Producto</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-green-700 uppercase tracking-wide">Marca</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-green-700 uppercase tracking-wide">C. Proveedor</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-green-700 uppercase tracking-wide">Color</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-green-700 uppercase tracking-wide">Medida</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-green-700 uppercase tracking-wide">Cant.</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-green-700 uppercase tracking-wide">P. Compra</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-green-700 uppercase tracking-wide">P. Venta Mín.</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-green-700 uppercase tracking-wide">P. Venta</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-green-700 uppercase tracking-wide">Subtotal</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-emerald-600 uppercase tracking-wide">Ganancia</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-amber-600 uppercase tracking-wide">% Margen</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-green-700 uppercase tracking-wide">N° Lote</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {v.items.map((item, ii) => {
                                const pv  = parseFloat(item.precioVentaUnitario || 0);
                                const pc  = parseFloat(item.precioCompraUnitario || item.precioCompraDefault || 0);
                                const pvm = parseFloat(item.precioVentaMinimo || 0);
                                const qty = parseFloat(item.cantidad || 0);
                                const sub = parseFloat(item.subtotal || pv * qty);
                                const gan = typeof item.gananciaTotal === 'number' ? item.gananciaTotal : (pv - pc) * qty;
                                const margen = sub > 0 ? ((gan / sub) * 100).toFixed(1) : '0.0';

                                return (
                                  <tr key={item.id || ii} className="hover:bg-green-50/40">
                                    <td className="px-3 py-2 font-mono text-gray-500">{item.codigoTienda || '—'}</td>
                                    <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{item.nombreProducto || 'N/A'}</td>
                                    <td className="px-3 py-2 text-gray-600">{item.marca || '—'}</td>
                                    <td className="px-3 py-2 font-mono text-gray-500">{item.codigoProveedor || '—'}</td>
                                    <td className="px-3 py-2 text-gray-600">{item.color || '—'}</td>
                                    <td className="px-3 py-2 text-gray-600">{item.medida || '—'}</td>
                                    <td className="px-3 py-2 text-center font-semibold text-gray-800">{qty}</td>
                                    <td className="px-3 py-2 text-right text-amber-700">{pc > 0 ? fmt(pc) : <span className="text-gray-300">—</span>}</td>
                                    <td className="px-3 py-2 text-right text-red-500">{pvm > 0 ? fmt(pvm) : <span className="text-gray-300">—</span>}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(pv)}</td>
                                    <td className="px-3 py-2 text-right font-bold text-gray-900">{fmt(sub)}</td>
                                    <td className="px-3 py-2 text-right font-bold text-emerald-600">{fmt(gan)}</td>
                                    <td className={`px-3 py-2 text-right font-semibold ${parseFloat(margen) >= 20 ? 'text-emerald-600' : parseFloat(margen) >= 10 ? 'text-amber-600' : 'text-red-500'}`}>
                                      {margen}%
                                    </td>
                                    <td className="px-3 py-2 font-mono text-gray-400 text-xs">{item.numeroLote || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-green-50 border-t-2 border-green-200">
                              <tr>
                                <td colSpan="10" className="px-3 py-2 text-right text-xs font-bold text-gray-600">Totales venta:</td>
                                <td className="px-3 py-2 text-right font-bold text-gray-900">{fmt(v.totalVenta)}</td>
                                <td className="px-3 py-2 text-right font-bold text-emerald-600">{fmt(gananciaVenta)}</td>
                                <td colSpan="2"></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <div className="px-5 py-3 text-xs text-gray-400">Sin items registrados</div>
                      )}
                    </div>
                  );
                })}

                {data.ventas.length === 0 && (
                  <div className="px-5 py-12 text-center text-gray-400">No hay ventas para esta fecha.</div>
                )}
              </div>
            </div>

            {/* ── ABONOS ────────────────────────────────────────────────── */}
            {data.abonos.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <BanknotesIcon className="h-5 w-5 text-blue-600" />
                    Abonos de Crédito
                  </h2>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
                    {data.abonos.length} abonos · {fmt(data.totAbonos.total)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-blue-50">
                      <tr>
                        {['Hora','Cliente','Referencia Crédito','Método','Monto'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-blue-700 uppercase tracking-wide last:text-right">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.abonos.map(a => (
                        <tr key={a.id} className="hover:bg-blue-50/40">
                          <td className="px-4 py-3 text-gray-500">{a.fechaDate.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{a.clienteNombre || 'N/A'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-400">{a.ventaId || a.creditoId || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${metodoBadgeClass(a.metodoPago)}`}>
                              {metodoPagoLabel(a.metodoPago).toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-blue-700">{fmt(a.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                      <tr>
                        <td colSpan="4" className="px-4 py-3 text-right font-bold text-gray-600">Total abonado:</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700">{fmt(data.totAbonos.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── RETIROS ───────────────────────────────────────────────── */}
            {data.retiros.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <ArrowTrendingDownIcon className="h-5 w-5 text-red-600" />
                    Retiros del Día
                  </h2>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-800">
                    {data.retiros.length} retiros · {fmt(data.totRetiros.total)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-red-50">
                      <tr>
                        {['Hora','Tipo','Motivo','Realizado por','Monto'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wide last:text-right">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.retiros.map(r => (
                        <tr key={r.id} className="hover:bg-red-50/40">
                          <td className="px-4 py-3 text-gray-500">{r.fechaDate.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${metodoBadgeClass(r.tipo)}`}>
                              {(r.tipo||'N/A').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{r.motivo || '—'}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{r.realizadoPor || '—'}</td>
                          <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(r.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-red-50 border-t-2 border-red-200">
                      <tr>
                        <td colSpan="4" className="px-4 py-3 text-right font-bold text-gray-600">Total retirado:</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(data.totRetiros.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── DEVOLUCIONES ─────────────────────────────────────────── */}
            {data.devoluciones.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />
                    Devoluciones del Día
                  </h2>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-100 text-orange-800">
                    {data.devoluciones.length} devoluciones · {fmt(data.totDev.total)}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {data.devoluciones.map(dev => (
                    <div key={dev.id}>
                      <div className="px-5 py-3 bg-orange-50 flex flex-wrap items-center gap-3 border-b border-orange-100">
                        <span className="font-mono font-bold text-orange-700 text-sm">{dev.numeroDevolucion || dev.id.slice(0,8)}</span>
                        <span className="text-xs text-gray-500">Venta: <span className="font-medium text-gray-700">{dev.numeroVenta || '—'}</span></span>
                        <span className="text-xs text-gray-600">👤 {dev.clienteNombre || '—'}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${metodoBadgeClass(dev.metodoPagoDevolucion || dev.metodoPagoOriginal)}`}>
                          Devuelto por: {metodoPagoLabel(dev.metodoPagoDevolucion || dev.metodoPagoOriginal).toUpperCase()}
                        </span>
                        <span className="ml-auto font-bold text-orange-700">{fmt(dev.montoADevolver)}</span>
                      </div>
                      {dev.items?.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-orange-50">
                              <tr>
                                {['Producto','Marca','C. Proveedor','Medida','Cant. Original','Cant. Devuelta','P. Unitario','Subtotal Dev.'].map(h => (
                                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-orange-700 uppercase tracking-wide last:text-right">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-orange-50">
                              {dev.items.map((item, ii) => {
                                const cant = parseFloat(item.cantidadADevolver || 0);
                                const pv   = parseFloat(item.precioVentaUnitario || 0);
                                return (
                                  <tr key={item.id || ii} className="hover:bg-orange-50/40">
                                    <td className="px-3 py-2 font-semibold text-gray-900">{item.nombreProducto || 'N/A'}</td>
                                    <td className="px-3 py-2 text-gray-600">{item.marca || '—'}</td>
                                    <td className="px-3 py-2 font-mono text-gray-400">{item.codigoProveedor || '—'}</td>
                                    <td className="px-3 py-2 text-gray-600">{item.medida || '—'}</td>
                                    <td className="px-3 py-2 text-center text-gray-600">{item.cantidadOriginal || '—'}</td>
                                    <td className="px-3 py-2 text-center font-bold text-orange-700">{cant}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{fmt(pv)}</td>
                                    <td className="px-3 py-2 text-right font-bold text-red-600">-{fmt(cant * pv)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 bg-orange-50 border-t border-orange-200 text-right">
                  <span className="text-sm font-bold text-orange-700">Total devuelto: {fmt(data.totDev.total)}</span>
                </div>
              </div>
            )}

            {data.excedentes?.length > 0 && (
            <div className="bg-white rounded-xl border border-orange-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-orange-100 flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />
                    Excedentes — Créditos Acumulativos (Negocio debe al cliente)
                </h2>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-100 text-orange-800">
                    {data.excedentes.length} créditos · {fmt(data.totExcedentes.total)}
                </span>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-orange-50">
                    <tr>
                        {['Cliente','N° Crédito','Método Devolución','Monto a devolver'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-orange-700 uppercase tracking-wide last:text-right">{h}</th>
                        ))}
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                    {data.excedentes.map(ex => (
                        <tr key={ex.id} className="hover:bg-orange-50/40">
                        <td className="px-4 py-3 font-medium text-gray-900">{ex.clienteNombre}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{ex.numeroCredito}</td>
                        <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${metodoBadgeClass(ex.excedenteMetodoPago || 'efectivo')}`}>
                            {(ex.excedenteMetodoPago || 'efectivo').toUpperCase()}
                            </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-orange-700">
                            {fmt(ex.excedentePagoCliente)}
                        </td>
                        </tr>
                    ))}
                    </tbody>
                    <tfoot className="bg-orange-50 border-t-2 border-orange-200">
                    <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold text-gray-600">Total a devolver:</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-700">{fmt(data.totExcedentes.total)}</td>
                    </tr>
                    </tfoot>
                </table>
                </div>
            </div>
            )}

            {/* ── RESUMEN FINAL ─────────────────────────────────────────── */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 text-white shadow-lg">
              <h2 className="text-base font-bold text-slate-300 uppercase tracking-wide mb-4">Resumen Final del Día — {format(selectedDate, "dd/MM/yyyy")}</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Efectivo Físico</p>
                  <p className="text-2xl font-bold text-green-400">{fmt(data.efectivoFisico)}</p>
                  <p className="text-slate-500 text-xs">Incluye inicial {fmt(data.dineroInicial)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Yape</p>
                  <p className="text-2xl font-bold text-purple-400">{fmt(data.netoYape)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Plin</p>
                  <p className="text-2xl font-bold text-blue-400">{fmt(data.netoPlin)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Tarjeta</p>
                  <p className="text-2xl font-bold text-slate-300">{fmt(data.netoTarjeta)}</p>
                </div>
                <div className="border-l border-slate-700 pl-4">
                  <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Total en Caja</p>
                  <p className="text-3xl font-bold text-white">{fmt(data.totalDia)}</p>
                  <p className="text-slate-400 text-xs mt-1">Ganancia: <span className="text-emerald-400 font-semibold">{fmt(data.gananciaTotal)}</span></p>
                </div>
              </div>
            </div>

          </>
        )}
      </div>
    </Layout>
  );
};

export default AuditoriaPage;