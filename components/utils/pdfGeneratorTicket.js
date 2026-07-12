// utils/pdfGeneratorTicket.js
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const EMPRESA = {
    nombre: "GOYO MOTOR'S",
    email: 'CONTATO.GOYOMOTORS@GMAIL.COM',       
    direccion: 'AV. LOS HEROES 778 SAN JUAN DE MIRAFLORES',   
    telefono: '993393609',
    logoPath: '/logo.png',
};

// ============================================================================
// FUENTE
// ============================================================================
const loadFont = async (pdf) => {
    const paths = [
        '/fonts/Courier-PS-Regular.ttf', '/fonts/CourierPS.ttf',
        '/fonts/courier-ps.ttf', '/fonts/CourierPS-Regular.ttf', '/fonts/Courier PS.ttf',
    ];
    for (const p of paths) {
        try {
            const res = await fetch(p);
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            if (!buf.byteLength) continue;
            const b64 = toBase64(buf);
            const name = p.split('/').pop();
            pdf.addFileToVFS(name, b64);
            pdf.addFont(name, 'CP', 'normal');
            pdf.addFont(name, 'CP', 'bold');
            return 'CP';
        } catch (_) { continue; }
    }
    return 'courier';
};

const toBase64 = (buf) => {
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
};

const loadLogo = async () => {
    try {
        const res = await fetch(EMPRESA.logoPath);
        if (!res.ok) return null;
        return `data:image/png;base64,${toBase64(await res.arrayBuffer())}`;
    } catch (_) { return null; }
};

// ============================================================================
// FIRESTORE
// ============================================================================
const getVentaItems = async (ventaId) => {
    try {
        const snap = await getDocs(collection(db, 'ventas', ventaId, 'itemsVenta'));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (_) { return []; }
};

const getProductDetails = async (productoId) => {
    if (!productoId) return {};
    try {
        const snap = await getDoc(doc(db, 'productos', productoId));
        return snap.exists() ? snap.data() : {};
    } catch (_) { return {}; }
};

const getMetodoPagoLabel = (m) => ({
    efectivo: 'EFECTIVO', tarjeta: 'TARJETA',
    yape: 'YAPE', plin: 'PLIN', transferencia: 'TRANSFERENCIA',
    deposito: 'DEPOSITO', cheque: 'CHEQUE', mixto: 'PAGO MIXTO', otro: 'OTRO',
}[m?.toLowerCase()] || m?.toUpperCase() || 'EFECTIVO');

const getTipoVentaLabel = (t) => ({
    ventaDirecta: 'Venta Directa', cotizacionAprobada: 'Cot. Aprobada',
    credito: 'Venta a Credito', abono: 'Abono a Credito',
}[t] || 'Venta Directa');

// ============================================================================
// MEDIDAS
// ============================================================================
const PW  = 80;
const ML  = 5;
const MR  = 5;
const TW  = PW - ML - MR; // 70mm

// ============================================================================
// PRIMITIVAS
// ============================================================================
const setCB = (pdf, fn, sz) => { pdf.setFont(fn, 'bold');   pdf.setFontSize(sz); };
const setCN = (pdf, fn, sz) => { pdf.setFont(fn, 'normal'); pdf.setFontSize(sz); };

// Texto centrado — retorna y siguiente
const cText = (pdf, text, y, fn, sz, bold = false) => {
    bold ? setCB(pdf, fn, sz) : setCN(pdf, fn, sz);
    const w = pdf.getTextWidth(text);
    pdf.text(text, ML + (TW - w) / 2, y);
    return y + sz * 0.35 + 1.5;
};

// Clave : Valor con columnas fijas
const kvLine = (pdf, key, val, y, fn, sz, keyW = 16) => {
    setCB(pdf, fn, sz);
    pdf.text(key, ML, y);
    setCN(pdf, fn, sz);
    pdf.text(`: ${val}`, ML + keyW, y);
    return y + sz * 0.35 + 1.5;
};

// Línea horizontal simple
const hLine = (pdf, y, lw = 0.3) => {
    pdf.setDrawColor(0); pdf.setLineWidth(lw);
    pdf.line(ML, y, ML + TW, y);
    return y + 1.5;
};

// Doble línea compacta (gap de 0.8mm entre las dos)
const dblLine = (pdf, y) => {
    pdf.setDrawColor(0); pdf.setLineWidth(0.5);
    pdf.line(ML, y,        ML + TW, y);
    pdf.line(ML, y + 0.8,  ML + TW, y + 0.8);
    pdf.setLineWidth(0.2);
    return y + 2.5; // espacio post-doble-línea muy compacto
};

// Línea punteada centrada
const dashedLine = (pdf, y, fn) => {
    setCN(pdf, fn, 6);
    const dash = '-'.repeat(54);
    const dw = pdf.getTextWidth(dash);
    pdf.text(dash, ML + (TW - dw) / 2, y);
    return y + 2;
};

// ============================================================================
// GENERADOR
// ============================================================================
const generarTicket = async (ventaData, clienteData) => {
    const { jsPDF } = await import('jspdf');
    const items = await getVentaItems(ventaData.id);

    let h = 110;
    items.forEach(() => { h += 15; });
    if (ventaData.paymentData?.isMixedPayment) h += 20;
    if (ventaData.observaciones) h += Math.ceil(ventaData.observaciones.length / 55) * 4 + 16;
    h += 40;
    h = Math.max(Math.ceil(h * 1.2), 200);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PW, h] });

    // Negro puro y máxima densidad de texto
    pdf.setTextColor(0, 0, 0);

    const [fn, logoB64] = await Promise.all([loadFont(pdf), loadLogo()]);

    let y = 7;

    // =========================================================================
    // ENCABEZADO
    // =========================================================================
    if (logoB64) {
        try {
            const ls = 15;
            pdf.addImage(logoB64, 'PNG', ML + (TW - ls) / 2, y, ls, ls);
            y += ls + 2;
        } catch (_) {}
    }

    // Nombre empresa — bold grande, centrado
    setCB(pdf, fn, 15);
    const nw = pdf.getTextWidth(EMPRESA.nombre.toUpperCase());
    pdf.text(EMPRESA.nombre.toUpperCase(), ML + (TW - nw) / 2, y);
    y += 7;

    y = cText(pdf, EMPRESA.direccion,      y, fn, 7);
    y = cText(pdf, `Tel: ${EMPRESA.telefono}`, y, fn, 7);
    y = cText(pdf, EMPRESA.email,           y, fn, 7);
    y += 1.5;

    y = dashedLine(pdf, y, fn);
    y += 3;
    y = cText(pdf, 'COMPROBANTE DE VENTA', y, fn, 10, true);
    y += 0;
    y = dashedLine(pdf, y, fn);
    y += 2.5;

    // =========================================================================
    // DATOS TRANSACCIÓN
    // =========================================================================
    const numeroVenta = ventaData.numeroVenta || `V-${ventaData.id?.slice(-8) || 'N/A'}`;
    const fechaObj = ventaData.fechaVenta?.toDate ? ventaData.fechaVenta.toDate() : new Date();
    const fechaVenta = fechaObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaVenta = fechaObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

    setCN(pdf, fn, 7.5);
    pdf.text(`N\u00BA ${numeroVenta}`, ML, y);
    y += 4;
    y = kvLine(pdf, 'TIPO',  getTipoVentaLabel(ventaData.tipoVenta).toUpperCase(), y, fn, 7.5);
    y = kvLine(pdf, 'FECHA', fechaVenta.toUpperCase(),  y, fn, 7.5);
    y = kvLine(pdf, 'HORA',  horaVenta.toUpperCase(),   y, fn, 7.5);
    y += 0.5;
    y = dashedLine(pdf, y, fn);
    y += 1.5;

    // =========================================================================
    // CLIENTE
    // =========================================================================
    const clienteNombre = clienteData
        ? `${clienteData.nombre} ${clienteData.apellido || ''}`.trim()
        : ventaData.clienteNombre || 'Cliente General';
    const dniVal = clienteData?.dni || ventaData.clienteDNI;

    y = kvLine(pdf, 'CLIENTE',  clienteNombre.toUpperCase(),  y, fn, 7.5);
    if (dniVal) y = kvLine(pdf, 'DNI', String(dniVal).toUpperCase(), y, fn, 7.5);
    if (ventaData.empleadoAsignadoNombre)
        y = kvLine(pdf, 'ATENDIDO', ventaData.empleadoAsignadoNombre.toUpperCase(), y, fn, 7.5);
    if (ventaData.placaMoto)
        y = kvLine(pdf, 'PLACA', ventaData.placaMoto.toUpperCase(), y, fn, 7.5);
    if (ventaData.modeloMoto)
        y = kvLine(pdf, 'MODELO', ventaData.modeloMoto.toUpperCase(), y, fn, 7.5);
    y += 0.5;
    y = dashedLine(pdf, y, fn);
    y += 2.5;

    // =========================================================================
    // TABLA DE PRODUCTOS
    // Columnas (mm desde ML, TW=70):
    //   DESCRIPCION  0..38  (36mm wrap) — código debajo del nombre
    //   CANT         centro en ML+44
    //   P.U.         centro en ML+55
    //   TOTAL        borde derecho ML+TW
    // =========================================================================
    const CC   = ML + 44;
    const CPU  = ML + 55;
    const C4   = ML + TW;
    const DMAX = 35;

    setCB(pdf, fn, 7);
    pdf.text('DESCRIPCION', ML, y);
    const chW = pdf.getTextWidth('CANT');
    pdf.text('CANT', CC - chW / 2, y);
    const phW = pdf.getTextWidth('P.U.');
    pdf.text('P.U.', CPU - phW / 2, y);
    const thW = pdf.getTextWidth('TOTAL');
    pdf.text('TOTAL', C4 - thW, y);
    y += 3.5;
    y = dashedLine(pdf, y, fn);
    y += 1;

    // Detalles en paralelo
    const productosUnicos = [...new Set(items.map(i => i.productoId).filter(Boolean))];
    const detallesPorProducto = {};
    await Promise.all(productosUnicos.map(async (pid) => {
        detallesPorProducto[pid] = await getProductDetails(pid);
    }));

    let totalVenta = 0;

    const itemsOrdenados = [...items].sort((a, b) => {
        const nombreA = a.nombrePersonalizado || a.nombreProducto || '';
        const nombreB = b.nombrePersonalizado || b.nombreProducto || '';
        return nombreA.localeCompare(nombreB, 'es');
    });

    for (const item of itemsOrdenados) {
        const det    = detallesPorProducto[item.productoId] || {};
        const nombre = (item.nombrePersonalizado || item.nombreProducto || 'N/A');
        const codigo = det.codigoTienda || '';
        const cant   = String(item.cantidad || 0);
        const pu     = parseFloat(item.precioVentaUnitario || 0).toFixed(2);
        const sub    = parseFloat(item.subtotal || 0).toFixed(2);
        totalVenta  += parseFloat(item.subtotal || 0);

        // Nombre bold con wrap
        setCB(pdf, fn, 7.5);
        const nLines = pdf.splitTextToSize(nombre.toUpperCase(), DMAX);
        nLines.forEach((line, li) => pdf.text(line, ML, y + li * 3.4));
        const nombreH = nLines.length * 3.4;

        // Código debajo del nombre (pequeño, normal)
        if (codigo) {
            setCN(pdf, fn, 6);
            pdf.text(codigo.toUpperCase(), ML, y + nombreH);
        }
        const descH = nombreH + (codigo ? 3 : 0);

        // Números alineados con la primera línea del nombre
        setCN(pdf, fn, 7.5);
        const cW = pdf.getTextWidth(cant);
        pdf.text(cant, CC - cW / 2, y);
        const pW = pdf.getTextWidth(pu);
        pdf.text(pu, CPU - pW / 2, y);
        const sW = pdf.getTextWidth(sub);
        pdf.text(sub, C4 - sW, y);

        y += descH + 2;
    }

    y += 1;
    y = dashedLine(pdf, y, fn);
    y += 2;

    // =========================================================================
    // SUBTOTAL / DESCUENTO / TOTAL
    // =========================================================================
    const totalFinal = (ventaData.totalVenta || totalVenta).toFixed(2);
    const descuento  = parseFloat(ventaData.descuento || 0).toFixed(2);

    // Subtotal — texto justificado
    setCB(pdf, fn, 8);
    pdf.text('SUBTOTAL', ML, y);
    setCN(pdf, fn, 8);
    const stW = pdf.getTextWidth(`S/ ${totalFinal}`);
    pdf.text(`S/ ${totalFinal}`, C4 - stW, y);
    y += 4;

    // Descuento
    setCB(pdf, fn, 8);
    pdf.text('DESCUENTO', ML, y);
    setCN(pdf, fn, 8);
    const dsW = pdf.getTextWidth(`S/ ${descuento}`);
    pdf.text(`S/ ${descuento}`, C4 - dsW, y);
    y += 3;

    y = hLine(pdf, y, 0.5);
    y += 2.5;

    // TOTAL A PAGAR — centrado completo
    setCB(pdf, fn, 11);
    const totalStr = `TOTAL A PAGAR    S/ ${totalFinal}`;
    const tsW = pdf.getTextWidth(totalStr);
    pdf.text(totalStr, ML + (TW - tsW) / 2, y);
    y += 6;

    // =========================================================================
    // MÉTODO DE PAGO — centrado entre doble línea compactas
    // =========================================================================
    let metodoPagoTexto = 'EFECTIVO';
    if (ventaData.paymentData?.isMixedPayment) {
        metodoPagoTexto = 'PAGO MIXTO';
    } else if (ventaData.paymentData?.paymentMethods?.[0]) {
        metodoPagoTexto = getMetodoPagoLabel(ventaData.paymentData.paymentMethods[0].method);
    } else if (ventaData.metodoPago) {
        metodoPagoTexto = getMetodoPagoLabel(ventaData.metodoPago);
    }

    y = dashedLine(pdf, y, fn);
    y += 3;
    y = cText(pdf, `PAGO:  ${metodoPagoTexto}`, y, fn, 9, true);
    y += 1;
    y = dashedLine(pdf, y, fn);
    y += 2.5;

    // Detalle pago mixto
    if (ventaData.paymentData?.isMixedPayment && ventaData.paymentData.paymentMethods) {
        setCB(pdf, fn, 7);
        pdf.text('Detalle de pago:', ML, y);
        y += 3.5;
        ventaData.paymentData.paymentMethods
            .filter(pm => pm.amount > 0)
            .forEach(pm => {
                setCN(pdf, fn, 7);
                pdf.text(`  ${getMetodoPagoLabel(pm.method)}`, ML, y);
                const mW = pdf.getTextWidth(`S/ ${pm.amount.toFixed(2)}`);
                pdf.text(`S/ ${pm.amount.toFixed(2)}`, C4 - mW, y);
                y += 3.2;
            });
        y += 1.5;
        y = dashedLine(pdf, y, fn);
        y += 2.5;
    }

    // =========================================================================
    // OBSERVACIONES
    // =========================================================================
    if (ventaData.observaciones) {
        setCB(pdf, fn, 7.5);
        pdf.text('OBSERVACION:', ML, y);
        y += 3.5;
        const obsLines = pdf.splitTextToSize(ventaData.observaciones.toUpperCase(), TW);
        setCN(pdf, fn, 7.5);
        obsLines.forEach(line => { pdf.text(line, ML, y); y += 3.5; });
        y += 2;
        y = dashedLine(pdf, y, fn);
        y += 3;
    }

    // =========================================================================
    // PIE DE PÁGINA
    // =========================================================================
    y += 1;
    y = cText(pdf, '!GRACIAS POR SU COMPRA!', y, fn, 10, true);
    y += 2;
    y = dashedLine(pdf, y, fn);
    y += 1.5;
    y = cText(pdf, 'Conserve este comprobante', y, fn, 7);
    y = cText(pdf, 'para cualquier cambio o consulta.', y, fn, 7);
    y += 3;

    const fechaGen = new Date().toLocaleString('es-PE', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
    y = cText(pdf, `Generado: ${fechaGen}`, y, fn, 7);

    const fechaSufijo = new Date().toISOString().split('T')[0];
    const clienteSufijo = clienteNombre.replace(/\s+/g, '-').toLowerCase().substring(0, 10);
    const fileName = `ticket-${numeroVenta.replace(/[^a-zA-Z0-9]/g, '-')}-${clienteSufijo}-${fechaSufijo}.pdf`;

    const blob = pdf.output('blob');
    return { url: URL.createObjectURL(blob), fileName };
};

// ============================================================================
// EXPORT
// ============================================================================
export const generarTicketVentaCompleta = async (ventaId, ventaData = null, clienteData = null) => {
    try {
        let venta = ventaData;
        if (!venta && ventaId) {
            const snap = await getDoc(doc(db, 'ventas', ventaId));
            if (snap.exists()) venta = { id: snap.id, ...snap.data() };
            else throw new Error('Venta no encontrada');
        }
        if (!venta) throw new Error('No se pudo obtener la venta');

        let cliente = clienteData;
        if (!cliente && venta.clienteId && venta.clienteId !== 'general') {
            try {
                const snap = await getDoc(doc(db, 'clientes', venta.clienteId));
                if (snap.exists()) cliente = snap.data();
            } catch (_) {}
        }

        return await generarTicket(venta, cliente);
    } catch (error) {
        console.error('Error al generar ticket:', error);
        throw new Error('Error al generar el ticket. Por favor, intentalo de nuevo.');
    }
};

export default { generarTicketVentaCompleta };