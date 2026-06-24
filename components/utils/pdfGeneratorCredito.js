// utils/pdfGeneratorCredito.js
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const EMPRESA = {
    nombre: "GOYO MOTOR'S",
    email: 'contacto.goyomotors@gmail.com',
    direccion: 'Av. Los héroes 778 San Juan de Miraflores',
    telefono: '993393609',
    logoPath: '/logo.png',
};

// ============================================================================
// FUENTE Y LOGO (idéntico a ventas/cotizaciones)
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

// ============================================================================
// HELPERS
// ============================================================================
const getMetodoPagoLabel = (metodo) => ({
    efectivo: 'EFECTIVO', tarjeta_credito: 'TARJETA DE CREDITO',
    tarjeta_debito: 'TARJETA DE DEBITO', tarjeta: 'TARJETA',
    yape: 'YAPE', plin: 'PLIN', transferencia: 'TRANSFERENCIA BANCARIA',
    deposito: 'DEPOSITO BANCARIO', cheque: 'CHEQUE',
    mixto: 'PAGO MIXTO', otro: 'OTRO',
}[metodo?.toLowerCase()] || metodo?.toUpperCase() || 'N/A');

const getProductDetails = async (productoId) => {
    if (!productoId) return {};
    try {
        const snap = await getDoc(doc(db, 'productos', productoId));
        return snap.exists() ? snap.data() : {};
    } catch (_) { return {}; }
};

// ============================================================================
// MARCA DE AGUA Y ENCABEZADO
// ============================================================================
const drawWatermark = (pdf, logoBase64, pageWidth, pageHeight) => {
    if (!logoBase64) return;
    try {
        pdf.saveGraphicsState();
        pdf.setGState(new pdf.GState({ opacity: 0.08 }));
        const size = 120;
        pdf.addImage(logoBase64, 'PNG', (pageWidth - size) / 2, (pageHeight - size) / 2, size, size);
        pdf.setGState(new pdf.GState({ opacity: 1 }));
        pdf.restoreGraphicsState();
    } catch (_) {}
};

const drawEmpresaHeader = (pdf, fontName, logoBase64, margin, pageWidth) => {
    let y = 15;
    const logoSize = 18;
    if (logoBase64) {
        try { pdf.addImage(logoBase64, 'PNG', margin, y - 10, logoSize, logoSize); }
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

// ============================================================================
// TABLA PROFESIONAL (mismo patrón que ventas — con wrap dinámico)
// ============================================================================
const drawProfessionalTable = (pdf, data, headers, colWidths, startX, startY, fontName, pageHeight, margin, logoBase64, pageWidth) => {
    let currentY = startY;
    const headerLineHeight = 6;
    const padding = 1;
    const lineHeightText = 3.2;
    const minRowHeight = 6;

    const colPositions = [startX];
    for (let i = 0; i < colWidths.length - 1; i++)
        colPositions.push(colPositions[i] + colWidths[i]);
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

        // Color de fondo
        if (row._devuelto) {
            pdf.setFillColor(252, 226, 226); // rojo claro para devueltos
            pdf.rect(startX, currentY, tableWidth, rowH, 'F');
        } else if (rowIndex % 2 === 0) {
            pdf.setFillColor(248, 248, 248);
            pdf.rect(startX, currentY, tableWidth, rowH, 'F');
        }
        pdf.rect(startX, currentY, tableWidth, rowH, 'S');

        row.forEach((_, colIndex) => {
            const x = colPositions[colIndex];
            const width = colWidths[colIndex];
            pdf.line(x, currentY, x, currentY + rowH);
            if (colIndex === row.length - 1)
                pdf.line(x + width, currentY, x + width, currentY + rowH);

            const lines = wrappedCells[colIndex];
            let textAlign = 'left';
            let textX = x + padding;
            if (colIndex === 6) { textAlign = 'center'; textX = x + width / 2; }
            else if (colIndex >= 7) { textAlign = 'right'; textX = x + width - padding; }

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
// GENERADOR PRINCIPAL — crédito individual
// ============================================================================
const generarPDFCredito = async (cliente, creditos, abonos = [], periodo = '') => {
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

    drawWatermark(pdf, logoBase64, pageWidth, pageHeight);

    let currentY = drawEmpresaHeader(pdf, fontName, logoBase64, margin, pageWidth);

    // Título / número de crédito
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(12);
    const tituloReporte = periodo
        ? `REPORTE CREDITOS - ${periodo.toUpperCase()}`
        : `CREDITO NRO. ${creditos[0]?.numeroCredito || 'N/A'}`;
    pdf.text(tituloReporte, pageWidth - margin, currentY, { align: 'right' });
    currentY += 9;

    pdf.setFontSize(8);
    pdf.setFont(fontName, 'normal');
    pdf.text(`DIRECCION: ${EMPRESA.direccion}`, margin, currentY);
    pdf.text(`EMAIL: ${EMPRESA.email}`, margin, currentY + 4);
    pdf.text(`TELEFONO: ${EMPRESA.telefono}`, pageWidth * 0.6, currentY);
    currentY += 13;

    // Fecha de apertura del crédito
    const fechaCredito = (() => {
        const f = creditos[0]?.fechaApertura || creditos[0]?.fechaCreacion;
        if (!f) return new Date().toLocaleDateString('es-PE');
        if (f?.toDate) return f.toDate().toLocaleDateString('es-PE');
        if (f?.seconds) return new Date(f.seconds * 1000).toLocaleDateString('es-PE');
        return new Date().toLocaleDateString('es-PE');
    })();

    drawInfoLine(pdf, fontName, 'FECHA DE APERTURA: ', fechaCredito, margin, currentY);
    drawInfoLine(pdf, fontName, 'TIPO: ', 'CREDITO ACUMULATIVO', pageWidth * 0.6, currentY);
    currentY += 5;

    pdf.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 5;

    // ── Cliente ────────────────────────────────────────────────────────
    pdf.setFontSize(8);
    drawInfoLine(pdf, fontName, 'CLIENTE: ',
        `${cliente.nombre} ${cliente.apellido || ''}`.trim().toUpperCase(), margin, currentY);
    if (cliente.dni)
        drawInfoLine(pdf, fontName, 'DNI: ', String(cliente.dni), pageWidth * 0.6, currentY);
    currentY += 5;
    currentY += 3;

    // ── Tabla de productos ─────────────────────────────────────────────
    // Recopilar todos los items de todos los créditos (para el caso de reporte multi-crédito)
    const tableHeaders = ['COD.', 'DESCRIPCION', 'COLOR', 'MARCA', 'UBICACION', 'MEDIDA', 'CANT', 'P.U.', 'P.T.'];
    const colWidths = [
        totalWidth * 0.10,
        totalWidth * 0.30,
        totalWidth * 0.08,
        totalWidth * 0.10,
        totalWidth * 0.12,
        totalWidth * 0.08,
        totalWidth * 0.06,
        totalWidth * 0.08,
        totalWidth * 0.08,
    ];

    const tableData = [];
    let totalActivos   = 0;
    let totalDevueltos = 0;

    const todosLosItems = creditos.flatMap(c => c.items || []);
    const productosUnicos = [...new Set(todosLosItems.map(i => i.productoId).filter(Boolean))];
    const detallesPorProducto = {};
    await Promise.all(productosUnicos.map(async (pid) => {
        detallesPorProducto[pid] = await getProductDetails(pid);
    }));

    for (const item of todosLosItems) {
        const det = detallesPorProducto[item.productoId] || {};
        const esDevuelto = item.estado === 'devuelto';
        const nombreAMostrar = item.nombrePersonalizado
            ? item.nombrePersonalizado
            : (item.nombreProducto || 'N/A');

        const row = [
            (det.codigoTienda || item.codigoTienda || 'N/A').toString().toUpperCase(),
            nombreAMostrar.toString().toUpperCase(),
            (det.color || item.color || 'N/A').toString().toUpperCase(),
            (det.marca || item.marca || 'N/A').toString().toUpperCase(),
            (det.ubicacion || 'N/A').toString().toUpperCase(),
            (det.medida || item.medida || 'N/A').toString().toUpperCase(),
            String(item.cantidad || 0),
            parseFloat(item.precioVentaUnitario || 0).toFixed(2),
            parseFloat(item.subtotal || 0).toFixed(2),
        ];
        row._devuelto = esDevuelto;
        tableData.push(row);

        if (esDevuelto) totalDevueltos += parseFloat(item.subtotal || 0);
        else            totalActivos   += parseFloat(item.subtotal || 0);
    }

    currentY = drawProfessionalTable(
        pdf, tableData, tableHeaders, colWidths,
        margin, currentY, fontName,
        pageHeight, margin, logoBase64, pageWidth
    );

    // Leyenda si hay devueltos
    const hayDevueltos = tableData.some(r => r._devuelto);
    if (hayDevueltos) {
        currentY += 3;
        pdf.setFontSize(6.5);
        pdf.setFont(fontName, 'normal');
        pdf.setFillColor(252, 226, 226);
        pdf.rect(margin, currentY - 2.5, 3, 3, 'F');
        pdf.text('PRODUCTO DEVUELTO', margin + 4, currentY);
        currentY += 5;
    }

    currentY += 3;

    // ── TOTAL DEL CREDITO (bruto, sin descontar devoluciones — igual que ventas) ──
    const totalBruto = totalActivos + totalDevueltos;

    if (currentY + 8 > pageHeight - margin - 30) {
        pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin;
    }

    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(9);
    pdf.setFillColor(200, 200, 200);
    pdf.setDrawColor(0, 0, 0);
    pdf.rect(margin, currentY, totalWidth, 8, 'FD');
    pdf.text('TOTAL DEL CREDITO:', margin + 5, currentY + 5);
    pdf.text(`S/. ${totalBruto.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
    currentY += 13;

    // ── HISTORIAL DE ABONOS (estilo lista, igual que ventas) ──
    const totalAbonado = abonos.reduce((s, a) => s + parseFloat(a.monto || 0), 0);

    if (abonos.length > 0) {
        if (currentY + 20 > pageHeight - margin) {
            pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin;
        }

        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);
        pdf.text(`ABONOS REGISTRADOS (${abonos.length}):`, margin, currentY);
        currentY += 5;

        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(7.5);

        abonos.forEach(abono => {
            if (currentY + 5 > pageHeight - margin) {
                pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin;
            }
            const f = abono.fecha;
            const fechaAbono = f?.toDate
                ? f.toDate().toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : (f?.seconds ? new Date(f.seconds * 1000).toLocaleDateString('es-PE') : 'N/A');

            let metodoPagoStr;
            if (abono.paymentData?.isMixedPayment && abono.paymentData.paymentMethods) {
                metodoPagoStr = abono.paymentData.paymentMethods
                    .filter(pm => pm.amount > 0)
                    .map(pm => `${getMetodoPagoLabel(pm.method)}: S/.${parseFloat(pm.amount).toFixed(2)}`)
                    .join(' / ');
            } else {
                metodoPagoStr = getMetodoPagoLabel(abono.metodoPago);
            }

            pdf.text(
                `${fechaAbono}  -  S/. ${parseFloat(abono.monto || 0).toFixed(2)}  -  ${metodoPagoStr}  -  ${abono.descripcion || 'Abono a credito'}`,
                margin + 2, currentY
            );
            currentY += 4;
        });

        currentY += 1;
        pdf.setFont(fontName, 'bold');
        pdf.text(`TOTAL ABONADO: S/. ${totalAbonado.toFixed(2)}`, pageWidth - margin, currentY, { align: 'right' });
        currentY += 8;
    }

    // ── DEVOLUCIONES REGISTRADAS (estilo lista, igual que ventas) ──
    const itemsDevueltos = todosLosItems.filter(i => i.estado === 'devuelto');

    if (itemsDevueltos.length > 0) {
        if (currentY + 20 > pageHeight - margin) {
            pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin;
        }

        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);
        pdf.text('DEVOLUCIONES REGISTRADAS:', margin, currentY);
        currentY += 6;

        itemsDevueltos.forEach(item => {
            if (currentY + 9 > pageHeight - margin) {
                pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin;
            }

            const fechaDev = (() => {
                const f = item.fechaDevolucion;
                if (!f) return 'N/A';
                if (f.toDate) return f.toDate().toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' });
                if (f.seconds) return new Date(f.seconds * 1000).toLocaleDateString('es-PE');
                return 'N/A';
            })();

            pdf.setFillColor(255, 243, 224);
            pdf.rect(margin, currentY - 3, totalWidth, 5, 'F');
            pdf.setFont(fontName, 'bold');
            pdf.setFontSize(7.5);
            pdf.text(`DEVOLUCION  -  ${fechaDev}`, margin + 2, currentY);
            if (item.metodoPagoDevolucion) {
                pdf.text(`DEVUELTO POR: ${item.metodoPagoDevolucion.toUpperCase()}`, pageWidth - margin - 2, currentY, { align: 'right' });
            }
            currentY += 5;

            pdf.setFont(fontName, 'normal');
            pdf.setFontSize(7);
            const nombreItemDev = item.nombrePersonalizado || item.nombreProducto || 'N/A';
            pdf.text(
                `  - ${nombreItemDev.toUpperCase()}  x${item.cantidad}   - S/. ${parseFloat(item.subtotal || 0).toFixed(2)}`,
                margin + 2, currentY
            );
            currentY += 6;
        });

        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text(`TOTAL DEVUELTO: - S/. ${totalDevueltos.toFixed(2)}`, pageWidth - margin, currentY, { align: 'right' });
        currentY += 8;
    }

    // ── RESUMEN FINAL (saldo pendiente / excedente — al final, como NETO COBRADO en ventas) ──
    const credito        = creditos[0];
    const montoPagado    = parseFloat(credito?.montoPagado || totalAbonado);
    const saldoPendiente = parseFloat(credito?.saldoPendiente ?? (totalBruto - montoPagado));
    const excedente      = parseFloat(credito?.excedentePagoCliente || 0);

    if (currentY + 15 > pageHeight - margin) {
        pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin;
    }

    const saldoColor = saldoPendiente > 0 ? [255, 200, 200] : [220, 240, 220];
    pdf.setFillColor(...saldoColor);
    pdf.setDrawColor(0, 0, 0);
    pdf.rect(margin, currentY, totalWidth, 8, 'FD');
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(saldoPendiente > 0 ? 150 : 0, 0, 0);
    pdf.text('SALDO PENDIENTE:', margin + 5, currentY + 5);
    pdf.text(`S/. ${saldoPendiente.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
    currentY += 10;

    if (excedente > 0) {
        if (currentY + 10 > pageHeight - margin) {
            pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin;
        }
        pdf.setFillColor(255, 237, 213);
        pdf.rect(margin, currentY, totalWidth, 8, 'FD');
        pdf.setTextColor(180, 80, 0);
        pdf.text('NEGOCIO DEBE AL CLIENTE:', margin + 5, currentY + 5);
        pdf.text(`S/. ${excedente.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
        pdf.setTextColor(0, 0, 0);
        currentY += 10;
    }

    currentY += 3;

    // ── Información adicional ──────────────────────────────────────────
    if (currentY > pageHeight - 50) {
        pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin;
    }

    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(8);
    pdf.text('INFORMACION IMPORTANTE:', margin, currentY);
    currentY += 6;

    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(8);
    [
        '• ESTE DOCUMENTO ES UN RESUMEN DEL ESTADO ACTUAL DE SU CREDITO.',
        '• PARA CUALQUIER CONSULTA O ACLARACION, COMUNIQUESE CON NOSOTROS.',
        '• CONSERVE ESTE DOCUMENTO PARA SUS REGISTROS.',
    ].forEach(t => { pdf.text(t, margin + 5, currentY); currentY += 4; });

    pdf.setFontSize(8);
    pdf.setFont(fontName, 'normal');
    pdf.text(
        `REPORTE GENERADO EL ${new Date().toLocaleString('es-PE')}`,
        pageWidth / 2, pageHeight - 10, { align: 'center' }
    );

    const fechaSufijo   = new Date().toISOString().split('T')[0];
    const clienteSufijo = `${cliente.nombre || ''}`.replace(/\s+/g, '-').toLowerCase().substring(0, 15);
    const fileName = `credito-${(creditos[0]?.numeroCredito || 'N-A').replace(/[^a-zA-Z0-9]/g, '-')}-${clienteSufijo}-${fechaSufijo}.pdf`;
    const pdfBlob = pdf.output('blob');
    return { url: URL.createObjectURL(pdfBlob), fileName };
};

// ============================================================================
// GENERADOR DE REPORTE POR PERÍODO (todos los clientes)
// ============================================================================
const generarPDFResumenPeriodo = async (clientesConCreditos, periodo) => {
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

    drawWatermark(pdf, logoBase64, pageWidth, pageHeight);

    let currentY = drawEmpresaHeader(pdf, fontName, logoBase64, margin, pageWidth);

    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(12);
    pdf.text(`REPORTE DE CREDITOS - ${periodo.toUpperCase()}`, pageWidth - margin, currentY, { align: 'right' });
    currentY += 9;

    pdf.setFontSize(8);
    pdf.setFont(fontName, 'normal');
    pdf.text(`DIRECCION: ${EMPRESA.direccion}`, margin, currentY);
    pdf.text(`EMAIL: ${EMPRESA.email}`, margin, currentY + 4);
    pdf.text(`TELEFONO: ${EMPRESA.telefono}`, pageWidth * 0.6, currentY);
    currentY += 13;

    pdf.setFontSize(8);
    pdf.text(`FECHA DE GENERACION: ${new Date().toLocaleDateString('es-PE')}`, margin, currentY);
    currentY += 8;

    pdf.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 5;

    if (clientesConCreditos.length === 0) {
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(10);
        pdf.text('No hay créditos activos para el período seleccionado.', margin, currentY);
        currentY += 10;
    } else {
        // ── Tabla resumen: CLIENTE | DNI | TOTAL CREDITO | ABONADO | SALDO PENDIENTE ──
        const tableHeaders = ['CLIENTE', 'DNI', 'TOTAL CREDITO', 'ABONADO', 'SALDO PENDIENTE'];
        const colWidths = [
            totalWidth * 0.35,
            totalWidth * 0.15,
            totalWidth * 0.17,
            totalWidth * 0.17,
            totalWidth * 0.16,
        ];

        const tableData = clientesConCreditos.map(c => [
            (c.clienteNombre || 'N/A').toString().toUpperCase(),
            String(c.dni || 'N/A'),
            `S/. ${parseFloat(c.montoTotal || 0).toFixed(2)}`,
            `S/. ${parseFloat(c.montoPagado || 0).toFixed(2)}`,
            `S/. ${parseFloat(c.saldoPendiente || 0).toFixed(2)}`,
        ]);

        currentY = drawProfessionalTable(
            pdf, tableData, tableHeaders, colWidths,
            margin, currentY, fontName,
            pageHeight, margin, logoBase64, pageWidth
        );

        currentY += 5;

        // ── Totales generales (calculados a partir del saldo real, no de un flag) ──
        const totalCreditoGeneral = clientesConCreditos.reduce((s, c) => s + parseFloat(c.montoTotal || 0), 0);
        const totalAbonadoGeneral = clientesConCreditos.reduce((s, c) => s + parseFloat(c.montoPagado || 0), 0);
        const totalSaldoGeneral   = clientesConCreditos.reduce((s, c) => s + parseFloat(c.saldoPendiente || 0), 0);

        if (currentY + 32 > pageHeight - margin - 20) {
            pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin;
        }

        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);

        pdf.setFillColor(220, 230, 245);
        pdf.setDrawColor(0, 0, 0);
        pdf.rect(margin, currentY, totalWidth, 8, 'FD');
        pdf.text('TOTAL CREDITO OTORGADO:', margin + 5, currentY + 5);
        pdf.text(`S/. ${totalCreditoGeneral.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
        currentY += 9;

        pdf.setFillColor(220, 240, 220);
        pdf.rect(margin, currentY, totalWidth, 8, 'FD');
        pdf.text('TOTAL ABONADO:', margin + 5, currentY + 5);
        pdf.text(`S/. ${totalAbonadoGeneral.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
        currentY += 9;

        pdf.setFillColor(255, 200, 200);
        pdf.rect(margin, currentY, totalWidth, 8, 'FD');
        pdf.text('TOTAL GENERAL ADEUDADO:', margin + 5, currentY + 5);
        pdf.text(`S/. ${totalSaldoGeneral.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
        currentY += 13;

        // ── Estadísticas ──
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text('ESTADISTICAS:', margin, currentY);
        currentY += 6;

        pdf.setFont(fontName, 'normal');
        pdf.text(`TOTAL DE CLIENTES CON CREDITO ACTIVO: ${clientesConCreditos.length}`, margin + 5, currentY);
        currentY += 4;
        pdf.text(
            `PROMEDIO DE SALDO PENDIENTE POR CLIENTE: S/. ${(totalSaldoGeneral / clientesConCreditos.length).toFixed(2)}`,
            margin + 5, currentY
        );
        currentY += 4;
    }

    // Pie
    pdf.setFontSize(8);
    pdf.setFont(fontName, 'normal');
    pdf.text(
        `REPORTE GENERADO EL ${new Date().toLocaleString('es-PE')}`,
        pageWidth / 2, pageHeight - 10, { align: 'center' }
    );

    const fechaSufijo   = new Date().toISOString().split('T')[0];
    const periodoSufijo = periodo.toLowerCase().replace(/\s+/g, '-');
    const fileName      = `reporte-creditos-${periodoSufijo}-${fechaSufijo}.pdf`;
    const pdfBlob = pdf.output('blob');
    return { url: URL.createObjectURL(pdfBlob), fileName };
};

// ============================================================================
// EXPORTS
// ============================================================================
export const generarPDFCliente = async (cliente, creditos, abonos = [], periodo = '') => {
    try {
        return await generarPDFCredito(cliente, creditos, abonos, periodo);
    } catch (error) {
        console.error('Error al generar PDF de crédito:', error);
        throw new Error('Error al generar el reporte PDF. Por favor, inténtalo de nuevo.');
    }
};

export const generarPDFPorPeriodo = async (clientesConCreditos, periodo) => {
    try {
        return await generarPDFResumenPeriodo(clientesConCreditos, periodo);
    } catch (error) {
        console.error('Error al generar PDF por período:', error);
        throw new Error('Error al generar el reporte PDF. Por favor, inténtalo de nuevo.');
    }
};

export default { generarPDFCliente, generarPDFPorPeriodo };