// utils/pdfGeneratorCotizaciones.js
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
// FUENTE Y LOGO (idéntico a ventas)
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
            const fontBase64 = arrayBufferToBase64(fontData);
            try {
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
    const len = bytes.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
    }
    return btoa(binary);
};

const loadLogoImage = async () => {
    try {
        const response = await fetch(EMPRESA.logoPath);
        if (!response.ok) return null;
        const imageData = await response.arrayBuffer();
        return `data:image/png;base64,${arrayBufferToBase64(imageData)}`;
    } catch (_) { return null; }
};

// ============================================================================
// FIRESTORE
// ============================================================================
const getCotizacionItems = async (cotizacionId) => {
    try {
        const snap = await getDocs(collection(db, 'cotizaciones', cotizacionId, 'itemsCotizacion'));
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

const getMetodoPagoLabel = (metodo) => ({
    efectivo: 'EFECTIVO',
    tarjeta: 'TARJETA',
    yape: 'YAPE',
    plin: 'PLIN',
    transferencia: 'TRANSFERENCIA BANCARIA',
    deposito: 'DEPOSITO BANCARIO',
    cheque: 'CHEQUE',
    mixto: 'PAGO MIXTO',
    otro: 'OTRO',
}[metodo?.toLowerCase()] || metodo?.toUpperCase() || 'N/A');

// ============================================================================
// TABLA PROFESIONAL (idéntica a ventas — sin rowMeta/devEstado)
// ============================================================================
const drawProfessionalTable = (pdf, data, headers, colWidths, startX, startY, fontName, pageHeight, margin, logoBase64, pageWidth) => {
    let currentY = startY;
    const headerLineHeight = 6;
    const padding = 1;
    const lineHeightText = 3.2;
    const minRowHeight = 6;

    const colPositions = [startX];
    for (let i = 0; i < colWidths.length - 1; i++) {
        colPositions.push(colPositions[i] + colWidths[i]);
    }
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
            const maxWidth = width - padding * 2;
            while (pdf.getTextWidth(displayText) > maxWidth && displayText.length > 1)
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
        const wrappedCells = row.map((cellData, colIndex) => {
            const maxWidth = colWidths[colIndex] - padding * 2;
            return pdf.splitTextToSize(String(cellData || ''), maxWidth);
        });
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

        if (rowIndex % 2 === 0) {
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
            if (colIndex === 7) { textAlign = 'center'; textX = x + width / 2; }
            else if (colIndex >= 8) { textAlign = 'right'; textX = x + width - padding; }

            const textBlockHeight = lines.length * lineHeightText;
            const startTextY = currentY + (rowH - textBlockHeight) / 2 + lineHeightText - 0.5;
            lines.forEach((lineText, li) => {
                pdf.text(lineText, textX, startTextY + li * lineHeightText, { align: textAlign });
            });
        });

        currentY += rowH;
    });

    return currentY;
};

// ============================================================================
// ENCABEZADO Y MARCA DE AGUA (idénticos a ventas)
// ============================================================================
const drawEmpresaHeader = (pdf, fontName, logoBase64, margin, pageWidth) => {
    let y = 15;
    const logoSize = 18;
    if (logoBase64) {
        try { pdf.addImage(logoBase64, 'PNG', margin, y - 10, logoSize, logoSize, 'logoEmpresa'); }
        catch (e) { console.warn('No se pudo dibujar el logo:', e.message); }
    }
    const textX = logoBase64 ? margin + logoSize + 4 : margin;
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.text(EMPRESA.nombre.toUpperCase(), textX, y);
    return y;
};

const drawWatermark = (pdf, logoBase64, pageWidth, pageHeight) => {
    if (!logoBase64) return;
    try {
        pdf.saveGraphicsState();
        const gState = new pdf.GState({ opacity: 0.08 });
        pdf.setGState(gState);
        const size = 120;
        pdf.addImage(logoBase64, 'PNG', (pageWidth - size) / 2, (pageHeight - size) / 2, size, size, 'logoEmpresa');
        pdf.setGState(new pdf.GState({ opacity: 1 }));
        pdf.restoreGraphicsState();
    } catch (e) { console.warn('No se pudo dibujar marca de agua:', e.message); }
};

const drawInfoLine = (pdf, fontName, label, value, x, y) => {
    pdf.setFont(fontName, 'bold');
    pdf.text(label, x, y);
    pdf.setFont(fontName, 'normal');
    pdf.text(String(value || 'N/A'), x + pdf.getTextWidth(label) + 2, y);
};

// ============================================================================
// GENERADOR PRINCIPAL
// ============================================================================
const generarPDFCotizacion = async (cotizacionData, clienteData = null) => {
    try {
        const { jsPDF } = await import('jspdf');

        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

        const [fontName, logoBase64] = await Promise.all([
            loadCourierPSFont(pdf),
            loadLogoImage(),
        ]);

        const pageWidth = pdf.internal.pageSize.width;
        const pageHeight = pdf.internal.pageSize.height;
        drawWatermark(pdf, logoBase64, pageWidth, pageHeight);

        const margin = 10;
        const totalWidth = pageWidth - 2 * margin;

        let currentY = drawEmpresaHeader(pdf, fontName, logoBase64, margin, pageWidth);

        // Número de cotización (derecha)
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(12);
        const numeroCotizacion = cotizacionData.numeroCotizacion || `COT-${cotizacionData.id?.slice(-8) || 'N/A'}`;
        pdf.text(`COTIZACION NRO. ${numeroCotizacion}`, pageWidth - margin, currentY, { align: 'right' });
        currentY += 9;

        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');

        // Dirección y contacto (igual layout que ventas)
        pdf.text(`DIRECCION: ${EMPRESA.direccion}`, margin, currentY);
        pdf.text(`EMAIL: ${EMPRESA.email}`, margin, currentY + 4);
        pdf.text(`TELEFONO: ${EMPRESA.telefono}`, pageWidth * 0.6, currentY);
        currentY += 13;

        // Fecha de cotización
        const fechaCotizacion = (() => {
            const f = cotizacionData.fechaCreacion;
            if (!f) return new Date().toLocaleDateString('es-PE');
            if (f?.toDate) return f.toDate().toLocaleDateString('es-PE');         // Timestamp real
            if (f?.seconds) return new Date(f.seconds * 1000).toLocaleDateString('es-PE'); // objeto plano
            const parsed = new Date(f);
            return isNaN(parsed) ? new Date().toLocaleDateString('es-PE') : parsed.toLocaleDateString('es-PE'); // string
        })();

        drawInfoLine(pdf, fontName, 'FECHA DE COTIZACION: ', fechaCotizacion, margin, currentY);

        // Estado
        const estadoLabels = {
            pendiente: 'PENDIENTE', borrador: 'BORRADOR', confirmada: 'CONFIRMADA',
            cancelada: 'CANCELADA', enviada: 'ENVIADA',
        };
        const estadoTexto = estadoLabels[cotizacionData.estado] || cotizacionData.estado?.toUpperCase() || 'PENDIENTE';
        drawInfoLine(pdf, fontName, 'ESTADO: ', estadoTexto, pageWidth * 0.6, currentY);
        currentY += 5;

        // Método de pago
        let metodoPagoTexto = '';
        let esPagoMixto = false;
        if (cotizacionData.paymentData?.isMixedPayment && cotizacionData.paymentData.paymentMethods) {
            metodoPagoTexto = cotizacionData.paymentData.paymentMethods
                .filter(pm => pm.amount > 0)
                .map(pm => `${getMetodoPagoLabel(pm.method)}: S/. ${pm.amount.toFixed(2)}`)
                .join(', ') || 'PAGO MIXTO';
            esPagoMixto = true;
        } else if (cotizacionData.paymentData?.paymentMethods?.length > 0) {
            metodoPagoTexto = getMetodoPagoLabel(cotizacionData.paymentData.paymentMethods[0].method);
        } else {
            metodoPagoTexto = getMetodoPagoLabel(cotizacionData.metodoPago);
        }

        const anchoMetodoPago = pdf.getTextWidth(`METODO DE PAGO: ${metodoPagoTexto}`);
        const espacioDisponible = pageWidth / 2 - margin - 4;

        if (esPagoMixto || anchoMetodoPago > espacioDisponible) {
            drawInfoLine(pdf, fontName, 'METODO DE PAGO: ', metodoPagoTexto, margin, currentY);
            currentY += 5;
        } else {
            drawInfoLine(pdf, fontName, 'METODO DE PAGO: ', metodoPagoTexto, margin, currentY);
            if (cotizacionData.validezDias)
                drawInfoLine(pdf, fontName, 'VALIDA POR: ', `${cotizacionData.validezDias} DIAS`, pageWidth * 0.6, currentY);
            currentY += 5;
        }

        pdf.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 5;

        // =====================================================================
        // CLIENTE (mismo layout que ventas)
        // =====================================================================
        pdf.setFontSize(8);

        const clienteNombre = clienteData
            ? `${clienteData.nombre} ${clienteData.apellido || ''}`.trim()
            : cotizacionData.clienteNombre || 'Cliente General';

        const tieneEmpleado = !!cotizacionData.empleadoAsignadoNombre;
        const tienePlaca = !!cotizacionData.placaMoto;
        const tieneExtras = tieneEmpleado || tienePlaca;

        const dniVal = clienteData?.dni || cotizacionData.clienteDNI;
        drawInfoLine(pdf, fontName, 'CLIENTE: ', clienteNombre.toUpperCase(), margin, currentY);
        if (dniVal) drawInfoLine(pdf, fontName, 'DNI: ', String(dniVal), margin, currentY + 5);
        if (cotizacionData.empleadoId)
            drawInfoLine(pdf, fontName, 'REGISTRADO POR: ', cotizacionData.empleadoId, margin, currentY + 10);

        const colDerecha = pageWidth * 0.6;
        const maxWidthDerecha = pageWidth - margin - colDerecha - 2;
        const obsLineHeight = 3.5;
        let alturaIzquierda = 12;
        let alturaDerecha = 0;

        if (tieneExtras) {
            if (tieneEmpleado) {
                drawInfoLine(pdf, fontName, 'EMPLEADO: ', cotizacionData.empleadoAsignadoNombre.toUpperCase(), colDerecha, currentY);
                alturaDerecha = Math.max(alturaDerecha, 5);
            }
            if (tienePlaca) {
                drawInfoLine(pdf, fontName, 'PLACA MOTO: ', cotizacionData.placaMoto.toUpperCase(), colDerecha, currentY + 5);
                alturaDerecha = Math.max(alturaDerecha, 10);
            }
            if (cotizacionData.modeloMoto) {
                drawInfoLine(pdf, fontName, 'MODELO MOTO: ', cotizacionData.modeloMoto.toUpperCase(), colDerecha, currentY + 10);
                alturaDerecha = Math.max(alturaDerecha, 15);
            }
            if (cotizacionData.observaciones) {
                const labelObs = 'OBSERVACIONES: ';
                const labelObsW = pdf.getTextWidth(labelObs);
                const obsLines = pdf.splitTextToSize(cotizacionData.observaciones.toUpperCase(), maxWidthDerecha - labelObsW);
                const obsOffsetY = currentY + (cotizacionData.modeloMoto ? 15 : 10);
                pdf.setFont(fontName, 'bold');
                pdf.text(labelObs, colDerecha, obsOffsetY);
                pdf.setFont(fontName, 'normal');
                pdf.text(obsLines, colDerecha + labelObsW, obsOffsetY);
                alturaDerecha = Math.max(alturaDerecha, (cotizacionData.modeloMoto ? 15 : 10) + obsLines.length * obsLineHeight);
            }
            
        } else {
            if (cotizacionData.observaciones) {
                const labelObs = 'OBSERVACIONES: ';
                const labelObsW = pdf.getTextWidth(labelObs);
                const obsLines = pdf.splitTextToSize(cotizacionData.observaciones.toUpperCase(), maxWidthDerecha - labelObsW);
                pdf.setFont(fontName, 'bold');
                pdf.text(labelObs, colDerecha, currentY);
                pdf.setFont(fontName, 'normal');
                pdf.text(obsLines, colDerecha + labelObsW, currentY);
                alturaDerecha = Math.max(alturaDerecha, obsLines.length * obsLineHeight);
            }
        }

        currentY += Math.max(alturaIzquierda, alturaDerecha) + 2;

        // =====================================================================
        // TABLA DE PRODUCTOS
        // =====================================================================
        const items = await getCotizacionItems(cotizacionData.id);

        // Detalles de producto en paralelo, deduplicados por productoId
        const productosUnicos = [...new Set(items.map(i => i.productoId).filter(Boolean))];
        const detallesPorProducto = {};
        await Promise.all(productosUnicos.map(async (productoId) => {
            detallesPorProducto[productoId] = await getProductDetails(productoId);
        }));

        const tableHeaders = ['COD. T.', 'COD.PROV.', 'DESCRIPCION', 'COLOR', 'MARCA', 'UBICACION', 'MEDIDA', 'CANT', 'P.U.', 'P.T.'];
        const colWidths = [
            totalWidth * 0.08,
            totalWidth * 0.10,
            totalWidth * 0.27,
            totalWidth * 0.07,
            totalWidth * 0.09,
            totalWidth * 0.10,
            totalWidth * 0.07,
            totalWidth * 0.06,
            totalWidth * 0.08,
            totalWidth * 0.08,
        ];

        const tableData = [];
        let totalCotizacion = 0;

        const itemsOrdenados = [...items].sort((a, b) => {
            const nombreA = a.nombrePersonalizado || a.nombreProducto || '';
            const nombreB = b.nombrePersonalizado || b.nombreProducto || '';
            return nombreA.localeCompare(nombreB, 'es');
        });

        for (const item of itemsOrdenados) {
            const det = detallesPorProducto[item.productoId] || {};

            // nombrePersonalizado tiene prioridad (igual que ventas)
            const nombreAMostrar = item.nombrePersonalizado
                ? item.nombrePersonalizado
                : (item.nombreProducto || 'N/A');

            tableData.push([
                (det.codigoTienda || item.codigoTienda || 'N/A').toString().toUpperCase(),
                (det.codigoProveedor || item.codigoProveedor || 'N/A').toString().toUpperCase(),
                nombreAMostrar.toString().toUpperCase(),
                (det.color || item.color || 'N/A').toString().toUpperCase(),
                (det.marca || item.marca || 'N/A').toString().toUpperCase(),
                (det.ubicacion || 'N/A').toString().toUpperCase(),
                (det.medida || 'N/A').toString().toUpperCase(),
                String(item.cantidad || 0),
                parseFloat(item.precioVentaUnitario || 0).toFixed(2),
                parseFloat(item.subtotal || 0).toFixed(2),
            ]);
            totalCotizacion += parseFloat(item.subtotal || 0);
        }

        currentY = drawProfessionalTable(
            pdf, tableData, tableHeaders, colWidths,
            margin, currentY, fontName,
            pageHeight, margin, logoBase64, pageWidth
        );

        currentY += 3;

        // =====================================================================
        // TOTAL
        // =====================================================================
        if (currentY + 8 > pageHeight - margin - 30) {
            pdf.addPage();
            drawWatermark(pdf, logoBase64, pageWidth, pageHeight);
            currentY = margin;
        }

        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);
        pdf.setFillColor(200, 200, 200);
        pdf.setDrawColor(0, 0, 0);
        pdf.rect(margin, currentY, totalWidth, 8, 'FD');
        pdf.text('TOTAL DE LA COTIZACION:', margin + 5, currentY + 5);
        pdf.text(`S/. ${(cotizacionData.totalCotizacion || totalCotizacion).toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
        currentY += 13;

        // =====================================================================
        // TÉRMINOS Y CONDICIONES
        // =====================================================================
        if (currentY > pageHeight - 45) {
            pdf.addPage();
            drawWatermark(pdf, logoBase64, pageWidth, pageHeight);
            currentY = margin;
        }

        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text('TERMINOS Y CONDICIONES:', margin, currentY);
        currentY += 6;

        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(8);
        const terminos = [
            `• ESTA COTIZACION TIENE UNA VALIDEZ DE ${cotizacionData.validezDias || 7} DIAS DESDE LA FECHA DE EMISION.`,
            '• LOS PRECIOS ESTAN SUJETOS A CAMBIOS SIN PREVIO AVISO.',
            '• PARA CONFIRMAR SU PEDIDO, COMUNIQUESE CON NOSOTROS.',
        ];
        if (cotizacionData.estado === 'confirmada')
            terminos.push('• ESTA COTIZACION HA SIDO CONFIRMADA Y CONVERTIDA EN VENTA.');

        terminos.forEach(t => {
            pdf.text(t, margin + 5, currentY);
            currentY += 4;
        });

        // Pie de página
        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        pdf.text(
            `COTIZACION GENERADA EL ${new Date().toLocaleString('es-PE')}`,
            pageWidth / 2, pageHeight - 10, { align: 'center' }
        );

        const fechaSufijo = new Date().toISOString().split('T')[0];
        const clienteSufijo = clienteNombre.replace(/\s+/g, '-').toLowerCase().substring(0, 15);
        const fileName = `cotizacion-${numeroCotizacion.replace(/[^a-zA-Z0-9]/g, '-')}-${clienteSufijo}-${fechaSufijo}.pdf`;

        const pdfBlob = pdf.output('blob');
        return { url: URL.createObjectURL(pdfBlob), fileName };

    } catch (error) {
        console.error('Error al generar PDF de cotización:', error);
        throw error;
    }
};

// ============================================================================
// EXPORT
// ============================================================================
export const generarPDFCotizacionCompleta = async (cotizacionId, cotizacionData = null, clienteData = null) => {
    try {
        let cotizacion = cotizacionData;
        if (!cotizacion && cotizacionId) {
            const snap = await getDoc(doc(db, 'cotizaciones', cotizacionId));
            if (snap.exists()) cotizacion = { id: snap.id, ...snap.data() };
            else throw new Error('Cotización no encontrada');
        }
        if (!cotizacion) throw new Error('No se pudo obtener la información de la cotización');

        let cliente = clienteData;
        if (!cliente && cotizacion.clienteId && cotizacion.clienteId !== 'general') {
            try {
                const snap = await getDoc(doc(db, 'clientes', cotizacion.clienteId));
                if (snap.exists()) cliente = snap.data();
            } catch (_) {}
        }

        return await generarPDFCotizacion(cotizacion, cliente);
    } catch (error) {
        console.error('Error al generar PDF de cotización:', error);
        throw new Error('Error al generar la cotización. Por favor, inténtalo de nuevo.');
    }
};

export default { generarPDFCotizacionCompleta };