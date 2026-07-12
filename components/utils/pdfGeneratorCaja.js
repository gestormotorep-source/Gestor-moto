// utils/pdfGeneratorCaja.js
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const EMPRESA = {
    nombre: "GOYO MOTOR'S",
    email: 'CONTATO.GOYOMOTORS@GMAIL.COM',       
    direccion: 'AV. LOS HEROES 778 SAN JUAN DE MIRAFLORES',   
    telefono: '993393609',
    logoPath: '/logo.png',
};

// ============================================================================
// FUENTE, LOGO Y HELPERS BASE (mismo patrón que ventas/créditos)
// ============================================================================
const loadCourierPSFont = async (pdf) => {
    const courierPaths = [
        '/fonts/Courier-PS-Regular.ttf',
        '/fonts/CourierPS.ttf',
        '/fonts/courier-ps.ttf',
        '/fonts/CourierPS-Regular.ttf',
        '/fonts/Courier PS.ttf',
    ];
    for (const fontPath of courierPaths) {
        try {
            const response = await fetch(fontPath);
            if (!response.ok) continue;
            const fontData = await response.arrayBuffer();
            if (fontData.byteLength === 0) continue;
            try {
                const fontBase64 = arrayBufferToBase64(fontData);
                const fileName = fontPath.split('/').pop();
                pdf.addFileToVFS(fileName, fontBase64);
                pdf.addFont(fileName, 'CourierPS', 'normal');
                pdf.addFont(fileName, 'CourierPS', 'bold');
                return 'CourierPS';
            } catch (_) { continue; }
        } catch (_) { continue; }
    }
    return 'courier';
};

const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
    return btoa(binary);
};

const loadLogoImage = async () => {
    try {
        const response = await fetch(EMPRESA.logoPath);
        if (!response.ok) return null;
        return `data:image/png;base64,${arrayBufferToBase64(await response.arrayBuffer())}`;
    } catch (_) { return null; }
};

const getMetodoPagoLabel = (metodo) => ({
    efectivo: 'EFECTIVO', tarjeta: 'TARJETA',
    yape: 'YAPE', plin: 'PLIN', transferencia: 'TRANSFERENCIA BANCARIA',
    deposito: 'DEPOSITO BANCARIO', cheque: 'CHEQUE',
    mixto: 'PAGO MIXTO', otro: 'OTRO',
}[metodo?.toLowerCase()] || metodo?.toUpperCase() || 'N/A');

const fmtFechaHora = (f) => {
    if (!f) return 'N/A';
    const d = f.toDate ? f.toDate() : (f.seconds ? new Date(f.seconds * 1000) : new Date(f));
    return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmtHora = (f) => {
    if (!f) return 'N/A';
    const d = f.toDate ? f.toDate() : (f.seconds ? new Date(f.seconds * 1000) : new Date(f));
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
};

// ============================================================================
// MARCA DE AGUA Y ENCABEZADO
// ============================================================================
const drawWatermark = (pdf, logoBase64, pageWidth, pageHeight) => {
    if (!logoBase64) return;
    let stateAbierto = false;
    try {
        pdf.saveGraphicsState();
        stateAbierto = true;
        pdf.setGState(new pdf.GState({ opacity: 0.08 }));
        const size = 120;
        pdf.addImage(logoBase64, 'PNG', (pageWidth - size) / 2, (pageHeight - size) / 2, size, size, 'logoEmpresaCaja');
    } catch (_) {
        // noop
    } finally {
        if (stateAbierto) {
            try { pdf.setGState(new pdf.GState({ opacity: 1 })); } catch (_) {}
            try { pdf.restoreGraphicsState(); } catch (_) {}
        }
    }
};

const drawEmpresaHeader = (pdf, fontName, logoBase64, margin) => {
    let y = 15;
    const logoSize = 16;
    if (logoBase64) {
        try { pdf.addImage(logoBase64, 'PNG', margin, y - 8, logoSize, logoSize, 'logoEmpresaCaja'); }
        catch (_) {}
    }
    const textX = logoBase64 ? margin + logoSize + 4 : margin;
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.text(EMPRESA.nombre.toUpperCase(), textX, y);
    return y;
};

const drawInfoLine = (pdf, fontName, label, value, x, y) => {
    pdf.setFont(fontName, 'bold');
    pdf.text(label, x, y);
    pdf.setFont(fontName, 'normal');
    pdf.text(String(value || 'N/A'), x + pdf.getTextWidth(label) + 2, y);
};

// Título de sección con franja gris, consistente en todo el documento
const drawSectionTitle = (pdf, fontName, titulo, margin, currentY, totalWidth) => {
    pdf.setFillColor(230, 230, 230);
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.2);
    pdf.rect(margin, currentY, totalWidth, 6.5, 'FD');
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(0, 0, 0);
    pdf.text(titulo, margin + 2, currentY + 4.5);
    return currentY + 9;
};

const drawTotalBar = (pdf, fontName, label, value, margin, currentY, totalWidth, color = [200, 200, 200], textColor = [0, 0, 0]) => {
    pdf.setFillColor(...color);
    pdf.setDrawColor(0, 0, 0);
    pdf.rect(margin, currentY, totalWidth, 8, 'FD');
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...textColor);
    pdf.text(label, margin + 5, currentY + 5);
    pdf.text(value, margin + totalWidth - 5, currentY + 5, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
    return currentY + 10;
};

// ============================================================================
// TABLA PROFESIONAL (con wrap dinámico + salto de página + repetir encabezado)
// ============================================================================
const drawProfessionalTable = (pdf, data, headers, colWidths, startX, startY, fontName, pageHeight, margin, logoBase64, pageWidth, alignRightFrom = null) => {
    let currentY = startY;
    const headerLineHeight = 6;
    const padding = 1;
    const lineHeightText = 3.2;
    const minRowHeight = 6;

    const colPositions = [startX];
    for (let i = 0; i < colWidths.length - 1; i++) colPositions.push(colPositions[i] + colWidths[i]);
    const tableWidth = colWidths.reduce((s, w) => s + w, 0);

    const drawHeader = (y) => {
        pdf.setFillColor(200, 200, 200);
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.2);
        pdf.rect(startX, y, tableWidth, headerLineHeight, 'FD');
        pdf.setTextColor(0, 0, 0);
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(7);
        headers.forEach((header, index) => {
            const x = colPositions[index];
            const width = colWidths[index];
            if (index === 0) pdf.line(x, y, x, y + headerLineHeight);
            pdf.line(x + width, y, x + width, y + headerLineHeight);
            let displayText = header;
            while (pdf.getTextWidth(displayText) > width - padding * 2 && displayText.length > 1)
                displayText = displayText.slice(0, -1);
            pdf.text(displayText, x + width / 2, y + headerLineHeight / 2 + 1, { align: 'center' });
        });
        return y + headerLineHeight;
    };

    currentY = drawHeader(currentY);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(7);

    data.forEach((row, rowIndex) => {
        const wrappedCells = row.map((cellData, colIndex) =>
            pdf.splitTextToSize(String(cellData || ''), colWidths[colIndex] - padding * 2)
        );
        const maxLines = Math.max(...wrappedCells.map(l => l.length), 1);
        const rowH = Math.max(minRowHeight, maxLines * lineHeightText + 2.5);

        if (currentY + rowH > pageHeight - margin - 15) {
            pdf.addPage();
            drawWatermark(pdf, logoBase64, pageWidth, pageHeight);
            currentY = margin;
            currentY = drawHeader(currentY);
            pdf.setFont(fontName, 'normal');
            pdf.setFontSize(7);
        }

        if (row._highlight === 'rojo') pdf.setFillColor(252, 226, 226);
        else if (row._highlight === 'amarillo') pdf.setFillColor(255, 243, 205);
        else if (row._highlight === 'naranja') pdf.setFillColor(255, 237, 213);
        else if (rowIndex % 2 === 0) pdf.setFillColor(248, 248, 248);
        else pdf.setFillColor(255, 255, 255);
        pdf.rect(startX, currentY, tableWidth, rowH, 'F');
        pdf.rect(startX, currentY, tableWidth, rowH, 'S');

        row.forEach((_, colIndex) => {
            const x = colPositions[colIndex];
            const width = colWidths[colIndex];
            pdf.line(x, currentY, x, currentY + rowH);
            if (colIndex === row.length - 1) pdf.line(x + width, currentY, x + width, currentY + rowH);

            const lines = wrappedCells[colIndex];
            let textAlign = 'left';
            let textX = x + padding;
            if (alignRightFrom !== null && colIndex >= alignRightFrom) {
                textAlign = 'right';
                textX = x + width - padding;
            }

            const textBlockHeight = lines.length * lineHeightText;
            const startTextY = currentY + (rowH - textBlockHeight) / 2 + lineHeightText - 0.5;
            lines.forEach((lineText, li) =>
                pdf.text(lineText, textX, startTextY + li * lineHeightText, { align: textAlign })
            );
        });

        currentY += rowH;
    });

    return currentY;
};

// ============================================================================
// GENERADOR PRINCIPAL
// ============================================================================
const generarPDFCaja = async (cierreData) => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    const [fontName, logoBase64] = await Promise.all([
        loadCourierPSFont(pdf),
        loadLogoImage(),
    ]);

    const pageWidth  = pdf.internal.pageSize.width;
    const pageHeight = pdf.internal.pageSize.height;
    const margin     = 10;
    const totalWidth = pageWidth - 2 * margin;

    const ensureSpace = (alturaNecesaria, y) => {
        if (y + alturaNecesaria > pageHeight - margin) {
            pdf.addPage();
            drawWatermark(pdf, logoBase64, pageWidth, pageHeight);
            return margin;
        }
        return y;
    };

    drawWatermark(pdf, logoBase64, pageWidth, pageHeight);

    let currentY = drawEmpresaHeader(pdf, fontName, logoBase64, margin);

    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(12);
    pdf.text('REPORTE DE CIERRE DE CAJA', pageWidth - margin, currentY, { align: 'right' });
    currentY += 9;

    pdf.setFontSize(8);
    pdf.setFont(fontName, 'normal');
    pdf.text(`DIRECCION: ${EMPRESA.direccion}`, margin, currentY);
    pdf.text(`EMAIL: ${EMPRESA.email}`, margin, currentY + 4);
    pdf.text(`TELEFONO: ${EMPRESA.telefono}`, pageWidth * 0.6, currentY);
    currentY += 13;

    // ── Info general del cierre ─────────────────────────────────────────
    const fechaCierreReporte = cierreData.fecha?.toDate
        ? cierreData.fecha.toDate().toLocaleDateString('es-PE')
        : (cierreData.fechaString ? new Date(cierreData.fechaString).toLocaleDateString('es-PE') : new Date().toLocaleDateString('es-PE'));

    drawInfoLine(pdf, fontName, 'FECHA DE CAJA: ', fechaCierreReporte, margin, currentY);
    drawInfoLine(pdf, fontName, 'CERRADO POR: ', (cierreData.cerradoPor || 'N/A').toUpperCase(), pageWidth * 0.6, currentY);
    currentY += 5;
    drawInfoLine(pdf, fontName, 'FECHA DE CIERRE: ', fmtFechaHora(cierreData.fechaCierre), margin, currentY);
    drawInfoLine(pdf, fontName, 'DINERO INICIAL: ', `S/. ${parseFloat(cierreData.dineroInicial || 0).toFixed(2)}`, pageWidth * 0.6, currentY);
    currentY += 6;

    pdf.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 5;

    // ════════════════════════════════════════════════════════════════════
    // 1. VENTAS DEL DÍA
    // ════════════════════════════════════════════════════════════════════
    const ventas = cierreData.ventas || [];
    currentY = ensureSpace(20, currentY);
    currentY = drawSectionTitle(pdf, fontName, `1. VENTAS DEL DIA (${ventas.length})`, margin, currentY, totalWidth);

    if (ventas.length === 0) {
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(8);
        pdf.text('No se registraron ventas en este día.', margin + 2, currentY + 4);
        currentY += 9;
    } else {
        const ventasHeaders = ['HORA', 'N° VENTA', 'CLIENTE', 'METODO DE PAGO', 'MONTO'];
        const ventasColWidths = [totalWidth * 0.10, totalWidth * 0.18, totalWidth * 0.32, totalWidth * 0.25, totalWidth * 0.15];

        const ventasData = ventas.map(v => {
            let metodoStr;
            if (v.paymentData?.isMixedPayment && v.paymentData.paymentMethods?.length) {
                metodoStr = v.paymentData.paymentMethods
                    .filter(pm => pm.amount > 0)
                    .map(pm => `${getMetodoPagoLabel(pm.method)}: S/.${parseFloat(pm.amount).toFixed(2)}`)
                    .join(' / ');
            } else {
                metodoStr = getMetodoPagoLabel(v.metodoPago);
            }
            return [
                fmtHora(v.fechaVenta),
                (v.numeroVenta || 'N/A').toString().toUpperCase(),
                (v.clienteNombre || 'N/A').toString().toUpperCase(),
                metodoStr,
                `S/. ${parseFloat(v.totalVenta || 0).toFixed(2)}`,
            ];
        });

        currentY = drawProfessionalTable(pdf, ventasData, ventasHeaders, ventasColWidths, margin, currentY, fontName, pageHeight, margin, logoBase64, pageWidth, 4);
        currentY += 3;

        const totalVentasBrutoSumado = ventas.reduce((s, v) => s + parseFloat(v.totalVenta || 0), 0);
        currentY = ensureSpace(10, currentY);
        currentY = drawTotalBar(pdf, fontName, 'TOTAL VENTAS DEL DIA:', `S/. ${totalVentasBrutoSumado.toFixed(2)}`, margin, currentY, totalWidth);
    }
    currentY += 4;

    // ════════════════════════════════════════════════════════════════════
    // 2. ABONOS DE CRÉDITO DEL DÍA
    // ════════════════════════════════════════════════════════════════════
    const abonos = cierreData.abonos || [];
    if (abonos.length > 0) {
        currentY = ensureSpace(20, currentY);
        currentY = drawSectionTitle(pdf, fontName, `2. ABONOS DE CREDITO DEL DIA (${abonos.length})`, margin, currentY, totalWidth);

        const abonosHeaders = ['HORA', 'REFERENCIA', 'CLIENTE', 'METODO', 'MONTO'];
        const abonosColWidths = [totalWidth * 0.10, totalWidth * 0.22, totalWidth * 0.33, totalWidth * 0.20, totalWidth * 0.15];

        const abonosData = abonos.map(a => [
            fmtHora(a.fechaVenta),
            (a.creditoId ? `CRED. ${a.creditoId.slice(-6).toUpperCase()}` : (a.ventaId || 'N/A')).toString().toUpperCase(),
            (a.clienteNombre || 'N/A').toString().toUpperCase(),
            getMetodoPagoLabel(a.metodoPago),
            `S/. ${parseFloat(a.monto || 0).toFixed(2)}`,
        ]);

        currentY = drawProfessionalTable(pdf, abonosData, abonosHeaders, abonosColWidths, margin, currentY, fontName, pageHeight, margin, logoBase64, pageWidth, 4);
        currentY += 3;

        const totalAbonos = abonos.reduce((s, a) => s + parseFloat(a.monto || 0), 0);
        currentY = ensureSpace(10, currentY);
        currentY = drawTotalBar(pdf, fontName, 'TOTAL ABONADO A CREDITOS:', `S/. ${totalAbonos.toFixed(2)}`, margin, currentY, totalWidth, [220, 230, 245]);
        currentY += 4;
    }

    // ════════════════════════════════════════════════════════════════════
    // 3. TOTALES BRUTOS POR MÉTODO (SOLO VENTAS, SIN DESCUENTOS)
    // ════════════════════════════════════════════════════════════════════
    currentY = ensureSpace(40, currentY);
    currentY = drawSectionTitle(pdf, fontName, '3. TOTALES BRUTOS POR METODO DE PAGO (SOLO VENTAS)', margin, currentY, totalWidth);

    const brutos = cierreData.totalesBrutos || {};
    const brutosHeaders = ['METODO DE PAGO', 'MONTO BRUTO'];
    const brutosColWidths = [totalWidth * 0.6, totalWidth * 0.4];
    const brutosData = [
        ['EFECTIVO', `S/. ${parseFloat(brutos.efectivo || 0).toFixed(2)}`],
        ['YAPE', `S/. ${parseFloat(brutos.yape || 0).toFixed(2)}`],
        ['PLIN', `S/. ${parseFloat(brutos.plin || 0).toFixed(2)}`],
        ['TARJETAS', `S/. ${parseFloat(brutos.tarjeta || 0).toFixed(2)}`],
    ];
    currentY = drawProfessionalTable(pdf, brutosData, brutosHeaders, brutosColWidths, margin, currentY, fontName, pageHeight, margin, logoBase64, pageWidth, 1);
    currentY += 3;

    const totalBruto = parseFloat(brutos.efectivo || 0) + parseFloat(brutos.yape || 0) + parseFloat(brutos.plin || 0) + parseFloat(brutos.tarjeta || 0);
    currentY = ensureSpace(10, currentY);
    currentY = drawTotalBar(pdf, fontName, 'TOTAL BRUTO DE VENTAS:', `S/. ${totalBruto.toFixed(2)}`, margin, currentY, totalWidth);
    currentY += 4;

    // ════════════════════════════════════════════════════════════════════
    // 4. DEVOLUCIONES DEL DÍA
    // ════════════════════════════════════════════════════════════════════
    const devoluciones = cierreData.devoluciones || [];
    const devResumen = cierreData.devolucionesResumen || {};

    if (devoluciones.length > 0) {
        currentY = ensureSpace(20, currentY);
        currentY = drawSectionTitle(pdf, fontName, `4. DEVOLUCIONES DEL DIA (${devoluciones.length})`, margin, currentY, totalWidth);

        const delMismoDia = devoluciones.filter(d => d.esMismoDia);
        const deDiasAnteriores = devoluciones.filter(d => !d.esMismoDia);

        const devHeaders = ['N° VENTA', 'CLIENTE', 'MONTO', 'METODO DEV.', 'ESTADO'];
        const devColWidths = [totalWidth * 0.16, totalWidth * 0.30, totalWidth * 0.18, totalWidth * 0.21, totalWidth * 0.15];

        const buildDevRow = (d, highlight) => {
            const row = [
                (d.numeroVenta || 'N/A').toString().toUpperCase(),
                (d.clienteNombre || 'N/A').toString().toUpperCase(),
                `S/. ${parseFloat(d.montoADevolver || 0).toFixed(2)}`,
                getMetodoPagoLabel(d.metodoPagoDevolucion || d.metodoPagoOriginal),
                (d.estado || 'N/A').toString().toUpperCase(),
            ];
            row._highlight = highlight;
            return row;
        };

        if (delMismoDia.length > 0) {
            pdf.setFont(fontName, 'bold');
            pdf.setFontSize(7.5);
            pdf.text(`MISMO DIA — AFECTAN GANANCIA REAL (${delMismoDia.length}):`, margin, currentY + 3);
            currentY += 6;
            const dataMismoDia = delMismoDia.map(d => buildDevRow(d, 'amarillo'));
            currentY = drawProfessionalTable(pdf, dataMismoDia, devHeaders, devColWidths, margin, currentY, fontName, pageHeight, margin, logoBase64, pageWidth, 2);
            currentY += 4;
        }

        if (deDiasAnteriores.length > 0) {
            currentY = ensureSpace(15, currentY);
            pdf.setFont(fontName, 'bold');
            pdf.setFontSize(7.5);
            pdf.text(`DIAS ANTERIORES — SOLO AFECTAN CAJA (${deDiasAnteriores.length}):`, margin, currentY + 3);
            currentY += 6;
            const dataAnteriores = deDiasAnteriores.map(d => buildDevRow(d, 'rojo'));
            currentY = drawProfessionalTable(pdf, dataAnteriores, devHeaders, devColWidths, margin, currentY, fontName, pageHeight, margin, logoBase64, pageWidth, 2);
            currentY += 4;
        }

        // Desglose por método de pago de las devoluciones
        currentY = ensureSpace(30, currentY);
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(7.5);
        pdf.text('IMPACTO DE DEVOLUCIONES POR METODO DE PAGO:', margin, currentY + 3);
        currentY += 6;
        const impactoHeaders = ['METODO', 'MONTO DEVUELTO'];
        const impactoColWidths = [totalWidth * 0.6, totalWidth * 0.4];
        const impactoData = [
            ['EFECTIVO', `-S/. ${parseFloat(devResumen.efectivo || 0).toFixed(2)}`],
            ['YAPE', `-S/. ${parseFloat(devResumen.yape || 0).toFixed(2)}`],
            ['PLIN', `-S/. ${parseFloat(devResumen.plin || 0).toFixed(2)}`],
            ['TARJETA', `-S/. ${parseFloat(devResumen.tarjeta || 0).toFixed(2)}`],
        ];
        currentY = drawProfessionalTable(pdf, impactoData, impactoHeaders, impactoColWidths, margin, currentY, fontName, pageHeight, margin, logoBase64, pageWidth, 1);
        currentY += 3;

        currentY = ensureSpace(20, currentY);
        currentY = drawTotalBar(pdf, fontName, 'TOTAL DEVUELTO (IMPACTO EN CAJA):', `-S/. ${parseFloat(devResumen.totalDevuelto || 0).toFixed(2)}`, margin, currentY, totalWidth, [255, 220, 220]);
        currentY = drawTotalBar(pdf, fontName, 'GANANCIA REAL DESCONTADA (MISMO DIA):', `-S/. ${parseFloat(devResumen.gananciaRealDescontada || 0).toFixed(2)}`, margin, currentY, totalWidth, [255, 243, 205]);
        currentY += 4;
    }

    // ════════════════════════════════════════════════════════════════════
    // 5. EXCEDENTES — NEGOCIO DEBE AL CLIENTE
    // ════════════════════════════════════════════════════════════════════
    const excedentes = cierreData.excedentes || [];
    if (excedentes.length > 0) {
        currentY = ensureSpace(20, currentY);
        currentY = drawSectionTitle(pdf, fontName, `5. EXCEDENTES DE CREDITO — NEGOCIO DEBE AL CLIENTE (${excedentes.length})`, margin, currentY, totalWidth);

        const excHeaders = ['CLIENTE', 'N° CREDITO', 'METODO', 'MONTO'];
        const excColWidths = [totalWidth * 0.38, totalWidth * 0.27, totalWidth * 0.20, totalWidth * 0.15];
        const excData = excedentes.map(e => {
            const row = [
                (e.clienteNombre || 'N/A').toString().toUpperCase(),
                (e.numeroCredito || 'N/A').toString().toUpperCase(),
                getMetodoPagoLabel(e.metodoPago),
                `S/. ${parseFloat(e.monto || 0).toFixed(2)}`,
            ];
            row._highlight = 'naranja';
            return row;
        });
        currentY = drawProfessionalTable(pdf, excData, excHeaders, excColWidths, margin, currentY, fontName, pageHeight, margin, logoBase64, pageWidth, 3);
        currentY += 3;

        const totalExcedentes = excedentes.reduce((s, e) => s + parseFloat(e.monto || 0), 0);
        currentY = ensureSpace(10, currentY);
        currentY = drawTotalBar(pdf, fontName, 'TOTAL A DEVOLVER AL CLIENTE:', `S/. ${totalExcedentes.toFixed(2)}`, margin, currentY, totalWidth, [255, 237, 213], [180, 80, 0]);
        currentY += 4;
    }

    // ════════════════════════════════════════════════════════════════════
    // 6. RETIROS DEL DÍA
    // ════════════════════════════════════════════════════════════════════
    const retiros = cierreData.retiros || [];
    if (retiros.length > 0) {
        currentY = ensureSpace(20, currentY);
        currentY = drawSectionTitle(pdf, fontName, `6. RETIROS DEL DIA (${retiros.length})`, margin, currentY, totalWidth);

        const retHeaders = ['HORA', 'TIPO', 'MONTO', 'MOTIVO', 'REALIZADO POR'];
        const retColWidths = [totalWidth * 0.12, totalWidth * 0.13, totalWidth * 0.15, totalWidth * 0.38, totalWidth * 0.22];
        const retData = retiros.map(r => [
            fmtHora(r.fecha),
            (r.tipo || 'N/A').toString().toUpperCase(),
            `S/. ${parseFloat(r.monto || 0).toFixed(2)}`,
            (r.motivo || 'N/A').toString().toUpperCase(),
            (r.realizadoPor || 'N/A').toString().toUpperCase(),
        ]);
        currentY = drawProfessionalTable(pdf, retData, retHeaders, retColWidths, margin, currentY, fontName, pageHeight, margin, logoBase64, pageWidth, 2);
        currentY += 3;

        const totalRetiros = retiros.reduce((s, r) => s + parseFloat(r.monto || 0), 0);
        currentY = ensureSpace(10, currentY);
        currentY = drawTotalBar(pdf, fontName, 'TOTAL RETIRADO:', `S/. ${totalRetiros.toFixed(2)}`, margin, currentY, totalWidth, [255, 240, 220]);
        currentY += 4;
    }

    // ════════════════════════════════════════════════════════════════════
    // 7. RESUMEN NETO POR MÉTODO DE PAGO (después de devoluciones/retiros/excedentes)
    // ════════════════════════════════════════════════════════════════════
    currentY = ensureSpace(40, currentY);
    currentY = drawSectionTitle(pdf, fontName, '7. RESUMEN NETO POR METODO DE PAGO (DESPUES DE DESCUENTOS)', margin, currentY, totalWidth);

    const totales = cierreData.totales || {};
    const netoHeaders = ['METODO DE PAGO', 'MONTO NETO'];
    const netoColWidths = [totalWidth * 0.6, totalWidth * 0.4];
    const netoData = [
        ['EFECTIVO', `S/. ${parseFloat(totales.efectivo || 0).toFixed(2)}`],
        ['YAPE', `S/. ${parseFloat(totales.yape || 0).toFixed(2)}`],
        ['PLIN', `S/. ${parseFloat(totales.plin || 0).toFixed(2)}`],
        ['TARJETAS', `S/. ${parseFloat(totales.tarjeta || 0).toFixed(2)}`],
    ];
    currentY = drawProfessionalTable(pdf, netoData, netoHeaders, netoColWidths, margin, currentY, fontName, pageHeight, margin, logoBase64, pageWidth, 1);
    currentY += 3;

    currentY = ensureSpace(10, currentY);
    currentY = drawTotalBar(pdf, fontName, 'TOTAL NETO DEL DIA (CON DINERO INICIAL):', `S/. ${parseFloat(totales.total || 0).toFixed(2)}`, margin, currentY, totalWidth);
    currentY += 4;

    // ════════════════════════════════════════════════════════════════════
    // 8. ANÁLISIS DE GANANCIAS
    // ════════════════════════════════════════════════════════════════════
    currentY = ensureSpace(35, currentY);
    currentY = drawSectionTitle(pdf, fontName, '8. ANALISIS DE GANANCIAS', margin, currentY, totalWidth);

    currentY = drawTotalBar(pdf, fontName, 'GANANCIA BRUTA:', `S/. ${parseFloat(totales.gananciaBruta || 0).toFixed(2)}`, margin, currentY, totalWidth, [220, 240, 220]);
    currentY = drawTotalBar(pdf, fontName, 'GANANCIA REAL (DESCONTANDO DEVOLUCIONES DEL MISMO DIA):', `S/. ${parseFloat(totales.gananciaReal || 0).toFixed(2)}`, margin, currentY, totalWidth, [200, 230, 200]);
    currentY += 4;

    // ════════════════════════════════════════════════════════════════════
    // 9. RESUMEN FINAL DE CAJA (CUADRE)
    // ════════════════════════════════════════════════════════════════════
    currentY = ensureSpace(60, currentY);
    currentY = drawSectionTitle(pdf, fontName, '9. RESUMEN FINAL DE CAJA — CUADRE', margin, currentY, totalWidth);

    const resumenFinal = cierreData.resumenFinal || {};
    const dineroEnCaja = cierreData.dineroEnCaja || {};

    const finalHeaders = ['CONCEPTO', 'VALOR'];
    const finalColWidths = [totalWidth * 0.65, totalWidth * 0.35];
    const finalData = [
        ['DINERO INICIAL', `S/. ${parseFloat(cierreData.dineroInicial || 0).toFixed(2)}`],
        ['(+) VENTAS EN EFECTIVO (NETO)', `S/. ${parseFloat(totales.efectivo || 0).toFixed(2)}`],
        ['(-) TOTAL RETIROS', `S/. ${parseFloat(dineroEnCaja.totalRetiros || 0).toFixed(2)}`],
        ['= EFECTIVO FISICO ESPERADO EN CAJA', `S/. ${parseFloat(resumenFinal.efectivoFinal || 0).toFixed(2)}`],
        ['YAPE EN CUENTA (NETO)', `S/. ${parseFloat(dineroEnCaja.yape || 0).toFixed(2)}`],
        ['PLIN EN CUENTA (NETO)', `S/. ${parseFloat(dineroEnCaja.plin || 0).toFixed(2)}`],
        ['TARJETA EN CUENTA (NETO)', `S/. ${parseFloat(dineroEnCaja.tarjeta || 0).toFixed(2)}`],
        ['TOTAL DIGITAL (YAPE + PLIN + TARJETA)', `S/. ${parseFloat(resumenFinal.digitalTotal || 0).toFixed(2)}`],
        ['N° DE VENTAS DEL DIA', `${resumenFinal.totalVentas || 0}`],
        ['N° DE ABONOS DE CREDITO', `${resumenFinal.totalAbonos || 0}`],
        ['N° DE DEVOLUCIONES', `${resumenFinal.totalDevoluciones || 0}`],
        ['N° DE RETIROS', `${resumenFinal.totalRetiros || 0}`],
        ['N° DE EXCEDENTES PENDIENTES', `${resumenFinal.totalExcedentes || 0}`],
    ];

    if (parseFloat(resumenFinal.totalExcedentePendiente || 0) > 0) {
        finalData.push(['TOTAL EXCEDENTE PENDIENTE DE DEVOLVER', `S/. ${parseFloat(resumenFinal.totalExcedentePendiente).toFixed(2)}`]);
    }

    currentY = drawProfessionalTable(pdf, finalData, finalHeaders, finalColWidths, margin, currentY, fontName, pageHeight, margin, logoBase64, pageWidth, 1);
    currentY += 4;

    const granTotal = parseFloat(resumenFinal.efectivoFinal || 0) + parseFloat(resumenFinal.digitalTotal || 0);
    currentY = ensureSpace(10, currentY);
    currentY = drawTotalBar(pdf, fontName, 'GRAN TOTAL EN CAJA (FISICO + DIGITAL):', `S/. ${granTotal.toFixed(2)}`, margin, currentY, totalWidth, [200, 220, 255]);
    currentY += 4;

    // ════════════════════════════════════════════════════════════════════
    // INFORMACIÓN IMPORTANTE
    // ════════════════════════════════════════════════════════════════════
    currentY = ensureSpace(40, currentY);
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(8);
    pdf.text('INFORMACION IMPORTANTE:', margin, currentY);
    currentY += 6;

    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(8);
    [
        '• ESTE REPORTE REFLEJA EL ESTADO DE LA CAJA AL MOMENTO DEL CIERRE.',
        '• LOS MONTOS DIGITALES (YAPE, PLIN, TARJETA) SE MANTIENEN EN LAS CUENTAS RESPECTIVAS, NO EN EFECTIVO FISICO.',
        '• EL EFECTIVO FISICO ESPERADO DEBE COINCIDIR CON EL DINERO CONTADO FISICAMENTE EN CAJA.',
        '• LAS DEVOLUCIONES, RETIROS Y EXCEDENTES YA ESTAN DESCONTADOS DE LOS TOTALES NETOS POR METODO DE PAGO.',
        '• LOS EXCEDENTES PENDIENTES SON MONTOS QUE EL NEGOCIO AUN DEBE DEVOLVER A CLIENTES.',
        '• CONSERVE ESTE DOCUMENTO PARA AUDITORIAS Y CONTROLES INTERNOS.',
    ].forEach(t => {
        currentY = ensureSpace(5, currentY);
        pdf.text(t, margin + 5, currentY);
        currentY += 4;
    });

    pdf.setFontSize(8);
    pdf.setFont(fontName, 'normal');
    pdf.text(`REPORTE GENERADO EL ${new Date().toLocaleString('es-PE')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

    return pdf;
};

// ============================================================================
// EXPORT PRINCIPAL
// ============================================================================
export const generarPDFCajaCompleta = async (fechaString) => {
    try {
        const cierreDoc = await getDoc(doc(db, 'cierresCaja', fechaString));
        if (!cierreDoc.exists()) {
            throw new Error('No se encontro el cierre de caja para esta fecha');
        }
        const cierreData = cierreDoc.data();
        const pdf = await generarPDFCaja(cierreData);

        const fechaSufijo = fechaString.replace(/\//g, '-');
        const fileName = `reporte-caja-${fechaSufijo}.pdf`;
        pdf.save(fileName);

        return `Reporte de caja generado exitosamente para ${fechaString}`;
    } catch (error) {
        console.error('Error al generar PDF de caja:', error);
        throw new Error('Error al generar el reporte de caja. Por favor, inténtalo de nuevo.');
    }
};
export default { generarPDFCajaCompleta };