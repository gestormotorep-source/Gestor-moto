import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import { db } from '../../lib/firebase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar } from '../../components/ui/calendar';
import emailjs from '@emailjs/browser';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  addDoc,
  serverTimestamp,
  where,
  Timestamp,
  getDocs,
  getDoc,
  setDoc
} from 'firebase/firestore';
import {
  BanknotesIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  EyeIcon,
  ChartBarIcon,
  BuildingStorefrontIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
  DocumentTextIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

// ── DatePickerPopover (mismo diseño que ventas) ────────────────────────────
const DatePickerPopover = ({ selected, onChange, placeholder, minDate }) => {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(selected || new Date());
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const prevMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap shadow-sm"
      >
        <CalendarIcon className="h-4 w-4 text-gray-400" />
        {selected
          ? format(selected, 'dd/MM/yyyy', { locale: es })
          : <span className="text-gray-400">{placeholder}</span>
        }
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl">
          {/* Header con flechas + dropdowns */}
          <div className="flex items-center justify-between px-3 pt-3 pb-1 gap-2">
            <button
              onClick={prevMonth}
              className="flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700 shrink-0"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1">
              <select
                value={month.getMonth()}
                onChange={(e) => setMonth(m => new Date(m.getFullYear(), parseInt(e.target.value), 1))}
                className="text-sm font-semibold text-gray-800 bg-transparent border-none outline-none cursor-pointer rounded px-1 py-0.5"
              >
                {meses.map((mes, i) => (
                  <option key={i} value={i}>{mes}</option>
                ))}
              </select>

              <select
                value={month.getFullYear()}
                onChange={(e) => setMonth(m => new Date(parseInt(e.target.value), m.getMonth(), 1))}
                className="text-sm font-semibold text-gray-800 bg-transparent border-none outline-none cursor-pointer rounded px-1 py-0.5"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <button
              onClick={nextMonth}
              className="flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700 shrink-0"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          <Calendar
            mode="single"
            selected={selected}
            month={month}
            onMonthChange={setMonth}
            onSelect={(date) => {
              if (date) {
                onChange(date);
                setOpen(false);
              }
            }}
            disabled={minDate ? { before: minDate } : undefined}
            captionLayout="label"
            classNames={{
              month_caption: "hidden",
              nav: "hidden",
            }}
          />
        </div>
      )}
    </div>
  );
};

// ── Modal Detalle Completo de Venta (rediseñado como ventas) ───────────────
const ModalDetalleVenta = ({ show, onClose, data, formatCurrency }) => {
  if (!show || !data) return null;
  const { venta, detalle } = data;

  const getEstadoClass = (estado) => {
    switch (estado) {
      case 'completada': return 'bg-green-100 text-green-800';
      case 'anulada':    return 'bg-red-100 text-red-800';
      case 'pendiente':  return 'bg-yellow-100 text-yellow-800';
      default:           return 'bg-gray-100 text-gray-800';
    }
  };

  const getMetodoPagoLabel = (metodo) => {
    const m = {
      efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin',
      tarjeta: 'Tarjeta', tarjeta_credito: 'T. Crédito',
      tarjeta_debito: 'T. Débito', transferencia: 'Transferencia',
    };
    return m[metodo?.toLowerCase()] || metodo || 'N/A';
  };

  const items = detalle?.items || [];

  // totales
  const totalCompra   = items.reduce((s, i) => s + parseFloat(i.precioCompraUnitario || i.precioCompra || 0) * parseInt(i.cantidad || 0), 0);
  const totalVentaRow = items.reduce((s, i) => s + parseFloat(i.subtotal || parseFloat(i.precioVentaUnitario || 0) * parseInt(i.cantidad || 0)), 0);
  const totalGanancia = items.reduce((s, i) => {
    if (i.gananciaTotal && typeof i.gananciaTotal === 'number') return s + i.gananciaTotal;
    const pv = parseFloat(i.precioVentaUnitario || 0);
    const pc = parseFloat(i.precioCompraUnitario || i.precioCompra || 0);
    const qty = parseInt(i.cantidad || 0);
    return s + ((pv - pc) * qty);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

        {/* Panel */}
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-7xl flex flex-col max-h-[92vh]">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <InformationCircleIcon className="h-6 w-6 text-blue-600" />
              Detalle de Venta
              <span className="text-blue-700 font-mono">#{venta.numeroVenta || venta.id?.substring(0,8).toUpperCase()}</span>
              {detalle?.tieneDevoluciones && (
                <span className="text-sm font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                  ⚠ Con Devolución
                </span>
              )}
            </h2>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* ── Contenido scrollable ── */}
          <div className="overflow-y-auto flex-1 px-8 py-5 space-y-6">

            {/* Datos generales de la venta */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 rounded-lg p-5">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Cliente</label>
                <p className="mt-0.5 text-sm font-medium text-gray-900">
                  {venta.clienteNombre}
                  {venta.clienteDNI && <span className="text-xs text-gray-500 ml-1">(DNI: {venta.clienteDNI})</span>}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Fecha</label>
                <p className="mt-0.5 text-sm text-gray-900">
                  {venta.fechaVenta instanceof Date
                    ? venta.fechaVenta.toLocaleString('es-PE', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
                    : 'N/A'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Estado</label>
                <span className={`mt-0.5 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEstadoClass(venta.estado)}`}>
                  {venta.estado?.charAt(0).toUpperCase() + venta.estado?.slice(1)}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Método de Pago</label>
                <p className="mt-0.5 text-sm text-gray-900">{getMetodoPagoLabel(venta.metodoPago)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Tipo de Venta</label>
                <p className="mt-0.5 text-sm text-gray-900">{venta.tipoVenta === 'cotizacionAprobada' ? 'Cotización Aprobada' : 'Directa'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Registrado por</label>
                <p className="mt-0.5 text-sm text-gray-900">{venta.empleadoId || 'N/A'}</p>
              </div>
              {venta.observaciones && (
                <div className="col-span-full">
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Observaciones</label>
                  <p className="mt-0.5 text-sm text-gray-900">{venta.observaciones}</p>
                </div>
              )}
            </div>

            {/* ── Tabla de productos ── */}
            <div>
              <h3 className="text-base font-semibold text-gray-800 mb-2">
                Productos Vendidos {items.length > 0 && <span className="text-gray-400 font-normal text-sm">({items.length})</span>}
              </h3>

              {items.length === 0 ? (
                <p className="text-center text-gray-500 py-6">No hay productos registrados</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 min-w-full">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Producto</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Marca</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">C. Tienda</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">C. Proveedor</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Medida</th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Cant.</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">P. Compra</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">P. Venta</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Subtotal</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-emerald-600 uppercase tracking-wider">Ganancia</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {items.map((item, idx) => {
                        const pCompra  = parseFloat(item.precioCompraUnitario || item.precioCompra || 0);
                        const pVenta   = parseFloat(item.precioVentaUnitario || 0);
                        const qty      = parseInt(item.cantidad || 0);
                        const subtotal = parseFloat(item.subtotal || pVenta * qty);
                        const ganancia = (item.gananciaTotal && typeof item.gananciaTotal === 'number')
                          ? item.gananciaTotal
                          : (pVenta - pCompra) * qty;

                        return (
                          <tr key={item.id || idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">{item.nombreProducto || 'N/A'}</td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{item.marca || <span className="text-gray-400">N/A</span>}</td>
                            <td className="px-3 py-2.5 text-gray-600 font-mono whitespace-nowrap">{item.codigoTienda || <span className="text-gray-400">N/A</span>}</td>
                            <td className="px-3 py-2.5 text-gray-600 font-mono whitespace-nowrap">{item.codigoProveedor || <span className="text-gray-400">N/A</span>}</td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{item.color || <span className="text-gray-400">N/A</span>}</td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{item.medida || <span className="text-gray-400">N/A</span>}</td>
                            <td className="px-3 py-2.5 text-center text-gray-700">{qty}</td>
                            <td className="px-3 py-2.5 text-right text-gray-500 whitespace-nowrap">
                              {pCompra > 0 ? formatCurrency(pCompra) : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">{formatCurrency(pVenta)}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(subtotal)}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-emerald-600 whitespace-nowrap">{formatCurrency(ganancia)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td colSpan="7" className="px-3 py-2.5 text-right text-sm font-semibold text-gray-600">Totales:</td>
                        <td className="px-3 py-2.5 text-right text-sm font-bold text-gray-500">{totalCompra > 0 ? formatCurrency(totalCompra) : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-sm font-bold text-gray-700">—</td>
                        <td className="px-3 py-2.5 text-right text-sm font-bold text-gray-900">{formatCurrency(totalVentaRow)}</td>
                        <td className="px-3 py-2.5 text-right text-sm font-bold text-emerald-600">{formatCurrency(totalGanancia)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* ── Análisis de ganancia ── */}
            {detalle && (
              <div className="bg-blue-50 rounded-lg p-5 border border-blue-100">
                <h4 className="font-semibold text-gray-800 mb-3">Análisis de Ganancia</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Ganancia Original:</span>
                    <span className="font-semibold text-blue-700">{formatCurrency(detalle.gananciaTotal || 0)}</span>
                  </div>
                  {detalle.tieneDevoluciones && (
                    <>
                      <div className="flex justify-between items-center text-red-600">
                        <span className="text-sm">Afectada por Devoluciones:</span>
                        <span className="font-semibold">-{formatCurrency(detalle.gananciaAfectadaPorDevoluciones || 0)}</span>
                      </div>
                      <hr className="border-gray-300" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Ganancia Final:</span>
                        <span className="font-bold text-emerald-600 text-lg">{formatCurrency(detalle.gananciaFinal || 0)}</span>
                      </div>
                    </>
                  )}
                  {!detalle.tieneDevoluciones && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Ganancia Final:</span>
                      <span className="font-bold text-emerald-600 text-lg">{formatCurrency(detalle.gananciaTotal || 0)}</span>
                    </div>
                  )}
                  <div className="pt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      detalle.metodoCalculo === 'campo_oculto_venta' ? 'bg-green-100 text-green-800' :
                      detalle.metodoCalculo === 'campos_ocultos_items' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {detalle.metodoCalculo === 'campo_oculto_venta' ? '✓ Ganancia Real' :
                       detalle.metodoCalculo === 'campos_ocultos_items' ? '✓ Calculada' : '~ Estimada'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Devoluciones asociadas ── */}
            {detalle?.tieneDevoluciones && detalle.devoluciones?.length > 0 && (
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <h4 className="font-semibold text-orange-800 mb-3 flex items-center gap-1">
                  <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />
                  Devoluciones Asociadas ({detalle.devoluciones.length})
                </h4>
                <div className="space-y-2">
                  {detalle.devoluciones.map((dev, idx) => (
                    <div key={idx} className="bg-white rounded border border-orange-200 p-3 flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Devuelto: {formatCurrency(dev.montoADevolver)}</p>
                        <p className="text-xs text-gray-600">Método: {dev.metodoPagoOriginal?.toUpperCase()}</p>
                        <p className="text-xs text-red-600 font-medium">Ganancia afectada: {formatCurrency(dev.gananciaAfectadaCalculada || 0)}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          {dev.estado?.toUpperCase()}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">{dev.fechaProcesamiento?.toLocaleDateString('es-PE')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Resumen final ── */}
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <div className="text-right space-y-1">
                {detalle?.tieneDevoluciones ? (
                  <>
                    <p className="text-sm text-gray-400">Total original</p>
                    <p className="text-lg font-semibold text-gray-400 line-through">{formatCurrency(venta.totalVenta)}</p>
                    <p className="text-2xl font-extrabold text-green-700">
                      Neto: {formatCurrency(parseFloat(venta.totalVenta || 0) - parseFloat(detalle.gananciaAfectadaPorDevoluciones || 0))}
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-extrabold text-green-700">
                    Total: {formatCurrency(venta.totalVenta)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex justify-end px-6 py-4 border-t border-gray-200 shrink-0">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// ── CajaPage principal ─────────────────────────────────────────────────────
const CajaPage = () => {
  const { user } = useAuth();
  const router = useRouter();

  const [ventas, setVentas] = useState([]);
  const [retiros, setRetiros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentPageVentas, setCurrentPageVentas] = useState(1);
  const ventasPerPageCaja = 20;

  const [dineroInicial, setDineroInicial] = useState(0);
  const [showDineroInicialModal, setShowDineroInicialModal] = useState(false);
  const [inputDineroInicial, setInputDineroInicial] = useState('');
  const [processingDineroInicial, setProcessingDineroInicial] = useState(false);

  const [showRetiroModal, setShowRetiroModal] = useState(false);
  const [retiroAmount, setRetiroAmount] = useState('');
  const [retiroTipo, setRetiroTipo] = useState('efectivo');
  const [retiroMotivo, setRetiroMotivo] = useState('');
  const [processingRetiro, setProcessingRetiro] = useState(false);

  const [showDetalleGanancia, setShowDetalleGanancia] = useState(false);
  const [detalleGananciaData, setDetalleGananciaData] = useState(null);

  const [cajaCerrada, setCajaCerrada] = useState(false);
  const [loadingCierreCaja, setLoadingCierreCaja] = useState(false);
  const [showCierreModal, setShowCierreModal] = useState(false);

  const [totalesDelDia, setTotalesDelDia] = useState({
    efectivo: 0, yape: 0, plin: 0, tarjeta: 0,
    total: 0, gananciaBruta: 0, gananciaReal: 0
  });

  const [devoluciones, setDevoluciones] = useState([]);
  const [devolucionesDelDia, setDevolucionesDelDia] = useState({
    totalDevuelto: 0, efectivo: 0, yape: 0, plin: 0, tarjeta: 0,
    delMismoDia: 0, deDiasAnteriores: 0, gananciaRealDescontada: 0
  });

  const [dineroEnCaja, setDineroEnCaja] = useState({
    efectivoFisico: 0, digital: { yape: 0, plin: 0, tarjeta: 0 }, totalRetiros: 0
  });

  const isAdmin = user?.role === 'admin' || user?.email === 'admin@gmail.com';

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(amount || 0);

  // ── Helpers (sin cambios) ────────────────────────────────────────────────
  const cargarDineroInicial = async (fecha) => {
    try {
      const fechaString = fecha.toISOString().split('T')[0];
      const snap = await getDoc(doc(db, 'dineroInicial', fechaString));
      setDineroInicial(snap.exists() ? snap.data().monto || 0 : 0);
    } catch { setDineroInicial(0); }
  };

  const verificarCierreCaja = async (fecha) => {
    try {
      const fechaString = fecha.toISOString().split('T')[0];
      const snap = await getDoc(doc(db, 'cierresCaja', fechaString));
      setCajaCerrada(snap.exists());
    } catch { setCajaCerrada(false); }
  };

  const establecerDineroInicial = async () => {
    if (!isAdmin) { alert('Solo el administrador puede establecer el dinero inicial'); return; }
    if (cajaCerrada) { alert('No se puede modificar el dinero inicial. La caja del día ya está cerrada.'); return; }
    if (!inputDineroInicial) { alert('Por favor ingrese el monto del dinero inicial'); return; }
    const monto = parseFloat(inputDineroInicial);
    if (isNaN(monto) || monto < 0) { alert('El monto debe ser un número positivo o cero'); return; }
    if (!window.confirm(`¿Confirma establecer S/. ${monto.toFixed(2)} como dinero inicial del día?`)) return;
    setProcessingDineroInicial(true);
    try {
      const fechaString = selectedDate.toISOString().split('T')[0];
      await setDoc(doc(db, 'dineroInicial', fechaString), {
        monto, fecha: Timestamp.fromDate(selectedDate), fechaString,
        establecidoPor: user.email, fechaCreacion: serverTimestamp()
      });
      setDineroInicial(monto);
      setInputDineroInicial('');
      setShowDineroInicialModal(false);
      alert('Dinero inicial establecido exitosamente');
    } catch (error) {
      alert('Error al establecer el dinero inicial: ' + error.message);
    } finally { setProcessingDineroInicial(false); }
  };

  const cerrarCaja = async () => {
    if (!isAdmin) { alert('Solo el administrador puede cerrar la caja'); return; }
    if (!window.confirm('¿Está seguro de que desea cerrar la caja del día? Esta acción no se puede deshacer.')) return;
    setLoadingCierreCaja(true);
    try {
      const fechaString = selectedDate.toISOString().split('T')[0];
      const limpiar = (obj) => {
        const r = {};
        for (const [k, v] of Object.entries(obj)) {
          if (v !== undefined && v !== null && v !== '') {
            r[k] = typeof v === 'object' && !Array.isArray(v) && !v?.toDate ? limpiar(v) : v;
          }
        }
        return r;
      };
      const cierreData = limpiar({
        fecha: Timestamp.fromDate(selectedDate), fechaString,
        dineroInicial: dineroInicial || 0,
        totales: {
          efectivo: totalesDelDia.efectivo || 0, yape: totalesDelDia.yape || 0,
          plin: totalesDelDia.plin || 0, tarjeta: totalesDelDia.tarjeta || 0,
          total: totalesDelDia.total || 0, gananciaBruta: totalesDelDia.gananciaBruta || 0,
          gananciaReal: totalesDelDia.gananciaReal || 0,
        },
        devoluciones: devoluciones.map(d => limpiar({
          id: d.id || '', numeroVenta: d.numeroVenta || 'N/A',
          clienteNombre: d.clienteNombre || '', montoADevolver: d.montoADevolver || 0,
          metodoPagoOriginal: d.metodoPagoOriginal || 'efectivo', estado: d.estado || 'pendiente',
        })),
        retiros: retiros.map(r => limpiar({
          id: r.id || '', monto: r.monto || 0, tipo: r.tipo || 'efectivo',
          motivo: r.motivo || '', realizadoPor: r.realizadoPor || '',
        })),
        ventas: ventas.map(v => limpiar({
          id: v.id || '', numeroVenta: v.numeroVenta || 'N/A',
          clienteNombre: v.clienteNombre || '', totalVenta: v.totalVenta || 0,
          metodoPago: v.metodoPago || 'efectivo',
        })),
        resumenFinal: {
          totalVentas: ventas.length || 0, totalDevoluciones: devoluciones.length || 0,
          totalRetiros: retiros.length || 0, dineroInicial: dineroInicial || 0,
          efectivoFinal: Math.max(0, (dineroInicial || 0) + (totalesDelDia.efectivo || 0) - (dineroEnCaja.totalRetiros || 0)),
          digitalTotal: (totalesDelDia.yape || 0) + (totalesDelDia.plin || 0) + (totalesDelDia.tarjeta || 0),
          totalDevuelto: devolucionesDelDia.totalDevuelto || 0,
        },
        cerradoPor: user?.email || '', fechaCierre: serverTimestamp(),
      });
      await setDoc(doc(db, 'cierresCaja', fechaString), cierreData);
      setCajaCerrada(true);
      setShowCierreModal(false);
      alert('Caja cerrada exitosamente');
    } catch (error) {
      alert('Error al cerrar la caja: ' + error.message);
    } finally { setLoadingCierreCaja(false); }
  };

  const generarReportePDF = async () => {
    try {
      setLoading(true);
      const { generarPDFCajaCompleta } = await import('../../components/utils/pdfGeneratorCaja');
      const fechaString = selectedDate.toISOString().split('T')[0];
      await generarPDFCajaCompleta(fechaString);
      alert('Reporte generado exitosamente');
    } catch (error) {
      alert('Error al generar el reporte: ' + error.message);
    } finally { setLoading(false); }
  };

  const calcularTotalesConGananciaReal = async (ventasList, devolucionesList = []) => {
    let efectivo = 0, yape = 0, plin = 0, tarjeta = 0, total = 0;
    let gananciaBruta = 0, gananciaReal = 0;

    ventasList.forEach(venta => {
      const totalVenta = parseFloat(venta.totalVenta || 0);
      total += totalVenta;
      gananciaBruta += totalVenta;
      if (venta.tipoVenta !== 'abono') {
        gananciaReal += venta.gananciaTotalVenta && typeof venta.gananciaTotalVenta === 'number'
          ? venta.gananciaTotalVenta : totalVenta * 0.4;
      }
      if (venta.paymentData?.paymentMethods) {
        venta.paymentData.paymentMethods.forEach(pm => {
          const a = parseFloat(pm.amount || 0);
          switch (pm.method?.toLowerCase()) {
            case 'efectivo': efectivo += a; break;
            case 'yape': yape += a; break;
            case 'plin': plin += a; break;
            case 'tarjeta': case 'tarjeta_credito': case 'tarjeta_debito': tarjeta += a; break;
          }
        });
      } else {
        switch (venta.metodoPago?.toLowerCase()) {
          case 'efectivo': efectivo += totalVenta; break;
          case 'yape': yape += totalVenta; break;
          case 'plin': plin += totalVenta; break;
          case 'tarjeta': case 'tarjeta_credito': case 'tarjeta_debito': tarjeta += totalVenta; break;
        }
      }
    });

    const ventasDelDiaMap = new Map();
    ventasList.forEach(v => ventasDelDiaMap.set(v.numeroVenta, v));

    let devEfectivo = 0, devYape = 0, devPlin = 0, devTarjeta = 0, totalDevuelto = 0, gananciaRealDescontada = 0;
    const delMismoDia = [], deDiasAnteriores = [];

    devolucionesList.forEach(dev => {
      if (dev.estado === 'aprobada') {
        ventasDelDiaMap.has(dev.numeroVenta) ? delMismoDia.push(dev) : deDiasAnteriores.push(dev);
      }
    });

    const procesarDev = (dev, esMismoDia) => {
      const monto = parseFloat(dev.montoADevolver || 0);
      totalDevuelto += monto;
      gananciaBruta -= monto;
      if (esMismoDia) {
        const g = dev.gananciaRealAfectada || monto * 0.4;
        gananciaReal -= g;
        gananciaRealDescontada += g;
      }
      switch (dev.metodoPagoOriginal?.toLowerCase()) {
        case 'efectivo': devEfectivo += monto; efectivo -= monto; break;
        case 'yape': devYape += monto; yape -= monto; break;
        case 'plin': devPlin += monto; plin -= monto; break;
        case 'tarjeta': case 'tarjeta_credito': case 'tarjeta_debito': devTarjeta += monto; tarjeta -= monto; break;
      }
    };

    delMismoDia.forEach(d => procesarDev(d, true));
    deDiasAnteriores.forEach(d => procesarDev(d, false));

    setTotalesDelDia({
      efectivo: Math.max(0, efectivo), yape: Math.max(0, yape),
      plin: Math.max(0, plin), tarjeta: Math.max(0, tarjeta),
      total: total - totalDevuelto,
      gananciaBruta: Math.max(0, gananciaBruta),
      gananciaReal: Math.max(0, gananciaReal),
    });

    setDevolucionesDelDia({
      totalDevuelto, efectivo: devEfectivo, yape: devYape, plin: devPlin, tarjeta: devTarjeta,
      delMismoDia: delMismoDia.length, deDiasAnteriores: deDiasAnteriores.length, gananciaRealDescontada,
    });
  };

  const calcularRetiros = (retirosList) => {
    const totalRetiros = retirosList.reduce((t, r) => t + parseFloat(r.monto || 0), 0);
    setDineroEnCaja(prev => ({
      ...prev, totalRetiros,
      efectivoFisico: Math.max(0, dineroInicial + totalesDelDia.efectivo - totalRetiros),
    }));
  };

  // ── obtenerDetalleGanancia ───────────────────────────────────────────────
  const obtenerDetalleGanancia = async (ventaId) => {
    try {
      const venta = ventas.find(v => v.id === ventaId);
      if (!venta) return { gananciaTotal: 0, metodoCalculo: 'error', items: [], error: 'Venta no encontrada' };

      const itemsSnap = await getDocs(query(
        collection(db, 'ventas', ventaId, 'itemsVenta'), orderBy('createdAt', 'asc')
      ));
      const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      let gananciaTotal = 0, metodoCalculo = 'estimado';
      if (venta.gananciaTotalVenta && typeof venta.gananciaTotalVenta === 'number') {
        gananciaTotal = venta.gananciaTotalVenta;
        metodoCalculo = 'campo_oculto_venta';
      } else if (items.length > 0) {
        let tieneReal = false;
        gananciaTotal = items.reduce((t, item) => {
          if (item.gananciaTotal && typeof item.gananciaTotal === 'number') { tieneReal = true; return t + item.gananciaTotal; }
          const pv = parseFloat(item.precioVentaUnitario || 0);
          const qty = parseInt(item.cantidad || 0);
          return t + pv * qty * 0.4;
        }, 0);
        metodoCalculo = tieneReal ? 'campos_ocultos_items' : 'estimado';
      } else {
        gananciaTotal = parseFloat(venta.totalVenta || 0) * 0.4;
      }

      const devolucionesVenta = devoluciones.filter(d => d.numeroVenta === venta.numeroVenta && d.estado === 'aprobada');
      let gananciaAfectadaPorDevoluciones = 0;
      const detallesDevoluciones = [];

      for (const dev of devolucionesVenta) {
        let g = dev.gananciaRealAfectada || 0;
        if (!g) {
          const devItemsSnap = await getDocs(collection(db, 'devoluciones', dev.id, 'itemsDevolucion'));
          const devItems = devItemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          g = devItems.length > 0
            ? devItems.reduce((t, i) => {
                if (i.gananciaDevolucion) return t + i.gananciaDevolucion;
                if (i.gananciaUnitaria) return t + i.gananciaUnitaria * parseInt(i.cantidadADevolver || 0);
                return t + parseFloat(i.precioVentaUnitario || 0) * parseInt(i.cantidadADevolver || 0) * 0.4;
              }, 0)
            : gananciaTotal * (parseFloat(dev.montoADevolver || 0) / parseFloat(venta.totalVenta || 1));
        }
        gananciaAfectadaPorDevoluciones += g;
        detallesDevoluciones.push({ ...dev, gananciaAfectadaCalculada: g });
      }

      return {
        gananciaTotal, gananciaAfectadaPorDevoluciones,
        gananciaFinal: Math.max(0, gananciaTotal - gananciaAfectadaPorDevoluciones),
        metodoCalculo, items,
        devoluciones: detallesDevoluciones,
        tieneDevoluciones: devolucionesVenta.length > 0,
      };
    } catch (err) {
      return { gananciaTotal: 0, metodoCalculo: 'error', items: [], error: err.message };
    }
  };

  const mostrarDetalleGanancia = async (venta) => {
    try {
      setLoading(true);
      const detalle = await obtenerDetalleGanancia(venta.id);
      setDetalleGananciaData({ venta, detalle });
      setShowDetalleGanancia(true);
    } catch (error) {
      alert('Error: ' + error.message);
    } finally { setLoading(false); }
  };

  const obtenerIndicadorEstadoVenta = (venta, devoluciones) => {
    const devs = devoluciones.filter(d => d.numeroVenta === venta.numeroVenta && d.estado === 'aprobada');
    if (!devs.length) return null;
    const totalDev = devs.reduce((s, d) => s + parseFloat(d.montoADevolver || 0), 0);
    const pct = (totalDev / parseFloat(venta.totalVenta || 1)) * 100;
    if (pct >= 100) return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">DEVUELTO TOTAL</span>
    );
    if (pct > 0) return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">DEV. PARCIAL ({pct.toFixed(0)}%)</span>
    );
    return null;
  };

  const handleRetiroDinero = async () => {
    if (!isAdmin) { alert('Solo el administrador puede realizar retiros'); return; }
    if (cajaCerrada) { alert('No se pueden realizar retiros. La caja está cerrada.'); return; }
    if (!retiroAmount || !retiroMotivo.trim()) { alert('Por favor complete todos los campos'); return; }
    const monto = parseFloat(retiroAmount);
    if (isNaN(monto) || monto <= 0) { alert('El monto debe ser un número positivo'); return; }
    const disponible = retiroTipo === 'efectivo' ? dineroInicial + totalesDelDia.efectivo - dineroEnCaja.totalRetiros
      : retiroTipo === 'yape' ? totalesDelDia.yape
      : retiroTipo === 'plin' ? totalesDelDia.plin : totalesDelDia.tarjeta;
    if (monto > disponible) {
      alert(`No hay suficiente dinero en ${retiroTipo.toUpperCase()}. Disponible: S/. ${disponible.toFixed(2)}`);
      return;
    }
    if (!window.confirm(`¿Confirma el retiro de S/. ${monto.toFixed(2)} en ${retiroTipo.toUpperCase()}?`)) return;
    setProcessingRetiro(true);
    try {
      await addDoc(collection(db, 'retiros'), {
        monto, tipo: retiroTipo, motivo: retiroMotivo.trim(),
        fecha: serverTimestamp(), realizadoPor: user.email,
        fechaSeleccionada: Timestamp.fromDate(selectedDate),
      });
      setRetiroAmount(''); setRetiroMotivo(''); setShowRetiroModal(false);
      alert('Retiro registrado exitosamente');
    } catch (error) {
      alert('Error al registrar el retiro: ' + error.message);
    } finally { setProcessingRetiro(false); }
  };

  const getPaymentMethodIcon = (method) => {
    switch (method?.toLowerCase()) {
      case 'efectivo': return <BanknotesIcon className="h-8 w-8" />;
      case 'yape': return <DevicePhoneMobileIcon className="h-8 w-8 text-purple-600" />;
      case 'plin': return <DevicePhoneMobileIcon className="h-8 w-8 text-blue-600" />;
      case 'tarjeta': case 'tarjeta_credito': case 'tarjeta_debito': return <CreditCardIcon className="h-8 w-8" />;
      default: return <CurrencyDollarIcon className="h-8 w-8" />;
    }
  };

  // ── useEffect principal ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { router.push('/auth'); return; }
    setLoading(true); setError(null);
    verificarCierreCaja(selectedDate);
    cargarDineroInicial(selectedDate);

    const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);

    let ventasList = [], devolucionesList = [];

    const unsubVentas = onSnapshot(
      query(collection(db, 'ventas'),
        where('fechaVenta', '>=', Timestamp.fromDate(startOfDay)),
        where('fechaVenta', '<=', Timestamp.fromDate(endOfDay)),
        where('estado', '==', 'completada'), orderBy('fechaVenta', 'desc')),
      async (snap) => {
        ventasList = snap.docs.map(d => ({
          id: d.id, ...d.data(),
          fechaVenta: d.data().fechaVenta?.toDate ? d.data().fechaVenta.toDate() : new Date(),
        }));
        setVentas(ventasList);
        await calcularTotalesConGananciaReal(ventasList, devolucionesList);
        setLoading(false);
      },
      (err) => { setError('Error al cargar ventas: ' + err.message); setLoading(false); }
    );

    const unsubDevoluciones = onSnapshot(
      query(collection(db, 'devoluciones'),
        where('fechaProcesamiento', '>=', Timestamp.fromDate(startOfDay)),
        where('fechaProcesamiento', '<=', Timestamp.fromDate(endOfDay)),
        where('estado', 'in', ['aprobada', 'procesada']), orderBy('fechaProcesamiento', 'desc')),
      async (snap) => {
        devolucionesList = snap.docs.map(d => ({
          id: d.id, ...d.data(),
          fechaProcesamiento: d.data().fechaProcesamiento?.toDate ? d.data().fechaProcesamiento.toDate() : new Date(),
        }));
        setDevoluciones(devolucionesList);
        await calcularTotalesConGananciaReal(ventasList, devolucionesList);
      },
      (err) => { console.error('Error devoluciones:', err); }
    );

    const unsubRetiros = onSnapshot(
      query(collection(db, 'retiros'),
        where('fecha', '>=', Timestamp.fromDate(startOfDay)),
        where('fecha', '<=', Timestamp.fromDate(endOfDay)),
        orderBy('fecha', 'desc')),
      (snap) => {
        const list = snap.docs.map(d => ({
          id: d.id, ...d.data(),
          fecha: d.data().fecha?.toDate ? d.data().fecha.toDate() : new Date(),
        }));
        setRetiros(list);
        calcularRetiros(list);
      },
      (err) => { console.error('Error retiros:', err); }
    );

    return () => { unsubVentas(); unsubDevoluciones(); unsubRetiros(); };
  }, [user, router, selectedDate]);

  const totalPagesVentas = Math.ceil(ventas.length / ventasPerPageCaja);
  const indexOfLastVenta  = currentPageVentas * ventasPerPageCaja;
  const indexOfFirstVenta = indexOfLastVenta - ventasPerPageCaja;
  const currentVentasCaja = ventas.slice(indexOfFirstVenta, indexOfLastVenta);

  // ── DevolucionesComponent ────────────────────────────────────────────────
  const DevolucionesDelDiaComponenteMejorado = () => {
    if (!devoluciones.length) return null;
    const delMismoDia       = devoluciones.filter(d => ventas.some(v => v.numeroVenta === d.numeroVenta));
    const deDiasAnteriores  = devoluciones.filter(d => !ventas.some(v => v.numeroVenta === d.numeroVenta));
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <ArrowTrendingDownIcon className="h-6 w-6 text-orange-600 mr-2" />
          Devoluciones del Día ({devoluciones.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
            <p className="text-sm font-medium text-orange-800">Del Mismo Día</p>
            <p className="text-2xl font-bold text-orange-600">{delMismoDia.length}</p>
            <p className="text-xs text-orange-600">Afectan ganancia real</p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <p className="text-sm font-medium text-yellow-800">Días Anteriores</p>
            <p className="text-2xl font-bold text-yellow-600">{deDiasAnteriores.length}</p>
            <p className="text-xs text-yellow-600">Solo afectan caja</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <p className="text-sm font-medium text-red-800">Total Devuelto</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(devolucionesDelDia.totalDevuelto)}</p>
            <p className="text-xs text-red-600">Impacto en caja</p>
          </div>
        </div>
        {delMismoDia.length > 0 && (
          <div className="mb-4 space-y-2">
            <h4 className="font-medium text-gray-900 mb-2 flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 text-orange-500 mr-1" />
              Mismo Día ({delMismoDia.length})
            </h4>
            {delMismoDia.map(dev => (
              <div key={dev.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border-l-4 border-orange-400">
                <div>
                  <p className="font-medium text-gray-900">{formatCurrency(dev.montoADevolver)} - {dev.metodoPagoOriginal?.toUpperCase()}</p>
                  <p className="text-sm text-gray-600">Venta: {dev.numeroVenta} - {dev.clienteNombre}</p>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">MISMO DÍA</span>
              </div>
            ))}
          </div>
        )}
        {deDiasAnteriores.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-gray-900 mb-2 flex items-center">
              <InformationCircleIcon className="h-5 w-5 text-yellow-500 mr-1" />
              Días Anteriores ({deDiasAnteriores.length})
            </h4>
            {deDiasAnteriores.map(dev => (
              <div key={dev.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                <div>
                  <p className="font-medium text-gray-900">{formatCurrency(dev.montoADevolver)} - {dev.metodoPagoOriginal?.toUpperCase()}</p>
                  <p className="text-sm text-gray-600">Venta: {dev.numeroVenta} - {dev.clienteNombre}</p>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">DÍAS ANT.</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) return (
    <Layout title="Caja">
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    </Layout>
  );

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <Layout title="Caja">
      <div className="flex flex-col mx-4 py-4 space-y-6">

        {/* ── Header con DatePickerPopover ── */}
        <div className="bg-white rounded-lg shadow-md p-4 lg:p-6">
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
            <div className="flex items-center space-x-3">
              <BuildingStorefrontIcon className="h-7 w-7 text-green-600" />
              <h1 className="text-xl font-bold text-gray-900">Caja del Día</h1>
              {cajaCerrada && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  <LockClosedIcon className="h-3.5 w-3.5 mr-1" /> Cerrada
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* ── DatePickerPopover ── */}
              <div className="flex items-center gap-2">
                <DatePickerPopover
                  selected={selectedDate}
                  onChange={(date) => setSelectedDate(date)}
                  placeholder="Seleccionar fecha"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {isAdmin && !cajaCerrada && (
                  <>
                    <button onClick={() => setShowDineroInicialModal(true)}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 text-sm">
                      <BanknotesIcon className="h-4 w-4" /> Dinero Inicial
                    </button>
                    <button onClick={() => setShowRetiroModal(true)}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 text-sm">
                      <MinusCircleIcon className="h-4 w-4" /> Retirar
                    </button>
                    <button onClick={() => setShowCierreModal(true)}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 text-sm">
                      <LockClosedIcon className="h-4 w-4" /> Cerrar Caja
                    </button>
                  </>
                )}
                {cajaCerrada && (
                  <button onClick={generarReportePDF}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 text-sm">
                    <DocumentTextIcon className="h-4 w-4" /> Generar Reporte
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 mr-2" />{error}
          </div>
        )}

        {/* Dinero Inicial */}
        {dineroInicial > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BanknotesIcon className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">Dinero Inicial del Día</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(dineroInicial)}</p>
              </div>
            </div>
            <p className="text-xs text-blue-500">Efectivo disponible para vuelto</p>
          </div>
        )}

        {/* Cards principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Efectivo Físico</p>
                <p className="text-2xl font-bold">{formatCurrency(Math.max(0, dineroInicial + totalesDelDia.efectivo - dineroEnCaja.totalRetiros))}</p>
                {dineroInicial > 0 && <p className="text-green-200 text-xs mt-1">Incluye inicial: {formatCurrency(dineroInicial)}</p>}
              </div>
              <BanknotesIcon className="h-12 w-12 text-green-200" />
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Yape Digital</p>
                <p className="text-2xl font-bold">{formatCurrency(totalesDelDia.yape)}</p>
              </div>
              <DevicePhoneMobileIcon className="h-12 w-12 text-purple-200" />
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Plin Digital</p>
                <p className="text-2xl font-bold">{formatCurrency(totalesDelDia.plin)}</p>
              </div>
              <DevicePhoneMobileIcon className="h-12 w-12 text-blue-200" />
            </div>
          </div>
          <div className="bg-gradient-to-br from-gray-600 to-gray-700 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-100 text-sm font-medium">Tarjetas</p>
                <p className="text-2xl font-bold">{formatCurrency(totalesDelDia.tarjeta)}</p>
              </div>
              <CreditCardIcon className="h-12 w-12 text-gray-300" />
            </div>
          </div>
        </div>

        {/* Ganancias */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-indigo-500">
            <div className="flex items-center">
              <ChartBarIcon className="h-8 w-8 text-indigo-600 mr-3" />
              <div>
                <p className="text-gray-600 text-sm font-medium">Total del Día</p>
                <p className="text-3xl font-bold text-indigo-600">{formatCurrency(totalesDelDia.total)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center">
              <ArrowTrendingUpIcon className="h-8 w-8 text-green-600 mr-3" />
              <div>
                <p className="text-gray-600 text-sm font-medium">Ganancia Bruta</p>
                <p className="text-3xl font-bold text-green-600">{formatCurrency(totalesDelDia.gananciaBruta)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-emerald-500">
            <div className="flex items-center">
              <CurrencyDollarIcon className="h-8 w-8 text-emerald-600 mr-3" />
              <div>
                <p className="text-gray-600 text-sm font-medium">Ganancia Real</p>
                <p className="text-3xl font-bold text-emerald-600">{formatCurrency(totalesDelDia.gananciaReal)}</p>
                <p className="text-xs text-gray-500 mt-1">Con campos ocultos</p>
              </div>
            </div>
          </div>
        </div>

        {/* Retiros */}
        {retiros.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <ArrowTrendingDownIcon className="h-6 w-6 text-red-600 mr-2" /> Retiros del Día
            </h3>
            <div className="space-y-3">
              {retiros.map(retiro => (
                <div key={retiro.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center space-x-3">
                    <MinusCircleIcon className="h-5 w-5 text-red-600" />
                    <div>
                      <p className="font-medium text-gray-900">{formatCurrency(retiro.monto)} - {retiro.tipo.toUpperCase()}</p>
                      <p className="text-sm text-gray-600">{retiro.motivo}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">{retiro.fecha?.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' })}</p>
                    <p className="text-xs text-gray-400">{retiro.realizadoPor}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 text-right">
              <p className="font-semibold text-red-600">Total Retirado: {formatCurrency(dineroEnCaja.totalRetiros)}</p>
            </div>
          </div>
        )}

        <DevolucionesDelDiaComponenteMejorado />

        {/* ── Tabla de Ventas ── */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <EyeIcon className="h-6 w-6 text-blue-600 mr-2" /> Ventas del Día ({ventas.length})
          </h3>
          {ventas.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <ChartBarIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No hay ventas registradas para esta fecha</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">N° Venta</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Cliente</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Hora</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Método Pago</th>
                    <th className="border border-gray-300 px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                    <th className="border border-gray-300 px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Estado</th>
                    <th className="border border-gray-300 px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {currentVentasCaja.map((venta, index) => {
                    const indicador = obtenerIndicadorEstadoVenta(venta, devoluciones);
                    return (
                      <tr key={venta.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 px-3 py-2 text-sm font-medium">
                          <div className="flex items-center gap-1">
                            {venta.numeroVenta || 'N/A'}
                            {indicador && <ArrowTrendingDownIcon className="h-4 w-4 text-red-400" />}
                          </div>
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">{venta.clienteNombre}</td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">
                          {venta.fechaVenta?.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' })}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">
                          <div className="flex items-center gap-1">
                            {getPaymentMethodIcon(venta.metodoPago)}
                            <span className="text-xs">{venta.metodoPago?.toUpperCase() || 'N/A'}</span>
                          </div>
                        </td>
                        <td className={`border border-gray-300 px-3 py-2 text-sm text-right font-medium ${indicador ? 'text-red-600' : ''}`}>
                          {formatCurrency(venta.totalVenta)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-center">
                          {indicador || (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">COMPLETA</span>
                          )}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-center">
                          <button
                            onClick={() => mostrarDetalleGanancia(venta)}
                            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs flex items-center gap-1 mx-auto"
                          >
                            <InformationCircleIcon className="h-4 w-4" /> Detalle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {ventas.length > ventasPerPageCaja && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-gray-700">
                    Mostrando {indexOfFirstVenta + 1} a {Math.min(indexOfLastVenta, ventas.length)} de {ventas.length} ventas
                  </p>
                  <div className="flex space-x-2">
                    <button onClick={() => setCurrentPageVentas(p => Math.max(p - 1, 1))} disabled={currentPageVentas === 1}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                      <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-700">Página {currentPageVentas} de {totalPagesVentas}</span>
                    <button onClick={() => setCurrentPageVentas(p => Math.min(p + 1, totalPagesVentas))} disabled={currentPageVentas === totalPagesVentas}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                      <ChevronRightIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Modales ── */}

        {/* Dinero Inicial */}
        {showDineroInicialModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <BanknotesIcon className="h-6 w-6 text-green-600" /> Dinero Inicial
                </h3>
                <button onClick={() => setShowDineroInicialModal(false)} className="text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              {dineroInicial > 0 && (
                <div className="bg-gray-50 p-3 rounded-lg mb-4 text-sm text-gray-600">
                  Actual: <strong>{formatCurrency(dineroInicial)}</strong>
                </div>
              )}
              <label className="block text-sm font-medium text-gray-700 mb-1">Nuevo monto (S/.)</label>
              <input type="number" step="0.01" min="0" value={inputDineroInicial}
                onChange={e => setInputDineroInicial(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 mb-4"
                placeholder="0.00" />
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDineroInicialModal(false)} disabled={processingDineroInicial}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Cancelar</button>
                <button onClick={establecerDineroInicial} disabled={processingDineroInicial}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                  {processingDineroInicial ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Guardando...</> : 'Establecer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Retiro */}
        {showRetiroModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <MinusCircleIcon className="h-6 w-6 text-red-600" /> Retirar Dinero
                </h3>
                <button onClick={() => setShowRetiroModal(false)} className="text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Dinero</label>
                  <select value={retiroTipo} onChange={e => setRetiroTipo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500">
                    <option value="efectivo">Efectivo (S/. {(dineroInicial + totalesDelDia.efectivo - dineroEnCaja.totalRetiros).toFixed(2)} disp.)</option>
                    <option value="yape">Yape (S/. {totalesDelDia.yape.toFixed(2)} disp.)</option>
                    <option value="plin">Plin (S/. {totalesDelDia.plin.toFixed(2)} disp.)</option>
                    <option value="tarjeta">Tarjeta (S/. {totalesDelDia.tarjeta.toFixed(2)} disp.)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                  <input type="number" step="0.01" value={retiroAmount} onChange={e => setRetiroAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
                  <textarea value={retiroMotivo} onChange={e => setRetiroMotivo(e.target.value)} rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500"
                    placeholder="Describe el motivo del retiro..." />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowRetiroModal(false)} disabled={processingRetiro}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Cancelar</button>
                <button onClick={handleRetiroDinero} disabled={processingRetiro}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                  {processingRetiro ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Procesando...</> : 'Retirar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cierre de Caja */}
        {showCierreModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <LockClosedIcon className="h-6 w-6 text-orange-600" /> Cerrar Caja
                </h3>
                <button onClick={() => setShowCierreModal(false)} className="text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-700">Esta acción no se puede deshacer. Una vez cerrada, no podrá realizar retiros ni modificaciones.</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600 space-y-1">
                <p><strong>Dinero Inicial:</strong> {formatCurrency(dineroInicial)}</p>
                <p><strong>Total Ventas:</strong> {ventas.length}</p>
                <p><strong>Total Ingresos:</strong> {formatCurrency(totalesDelDia.total)}</p>
                <p><strong>Total Retiros:</strong> {formatCurrency(dineroEnCaja.totalRetiros)}</p>
                <p><strong>Efectivo Final:</strong> {formatCurrency(Math.max(0, dineroInicial + totalesDelDia.efectivo - dineroEnCaja.totalRetiros))}</p>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowCierreModal(false)} disabled={loadingCierreCaja}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Cancelar</button>
                <button onClick={cerrarCaja} disabled={loadingCierreCaja}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2">
                  {loadingCierreCaja ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Cerrando...</> : <><LockClosedIcon className="h-4 w-4" />Cerrar Caja</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal Detalle Venta (nuevo) ── */}
        <ModalDetalleVenta
          show={showDetalleGanancia}
          onClose={() => setShowDetalleGanancia(false)}
          data={detalleGananciaData}
          formatCurrency={formatCurrency}
        />

      </div>
    </Layout>
  );
};

export default CajaPage;