// utils/pdfGeneratorCaja.js - VERSIÓN CON ESTILO PROFESIONAL
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Función para cargar únicamente Courier PS (consistente con otros generadores)
const loadCourierPSFont = async (pdf) => {
    try {
        const courierPaths = [
            '/fonts/Courier-PS-Regular.ttf',
            '/fonts/CourierPS.ttf',
            '/fonts/courier-ps.ttf',
            '/fonts/CourierPS-Regular.ttf',
            '/fonts/Courier PS.ttf'
        ];
        
        for (const fontPath of courierPaths) {
            try {
                console.log(`Intentando cargar Courier PS desde: ${fontPath}`);
                const response = await fetch(fontPath);
                
                if (response.ok) {
                    const fontData = await response.arrayBuffer();
                    
                    if (fontData.byteLength === 0) {
                        console.warn(`Archivo de fuente vacío: ${fontPath}`);
                        continue;
                    }
                    
                    const fontBase64 = arrayBufferToBase64(fontData);
                    
                    try {
                        const fileName = fontPath.split('/').pop();
                        pdf.addFileToVFS(fileName, fontBase64);
                        pdf.addFont(fileName, 'CourierPS', 'normal');
                        pdf.addFont(fileName, 'CourierPS', 'bold');
                        
                        console.log(`✅ Fuente CourierPS cargada exitosamente desde: ${fontPath}`);
                        return 'CourierPS';
                        
                    } catch (fontRegisterError) {
                        console.warn(`Error registrando fuente ${fontPath}:`, fontRegisterError.message);
                        continue;
                    }
                }
            } catch (fetchError) {
                console.warn(`No se pudo cargar ${fontPath}:`, fetchError.message);
                continue;
            }
        }
        
        // Si no se pudo cargar Courier PS, usar Courier por defecto
        console.log('⚠️ No se pudo cargar Courier PS, usando Courier por defecto');
        return 'courier';
        
    } catch (error) {
        console.error('Error cargando Courier PS:', error.message);
        console.log('🔄 Usando Courier como alternativa');
        return 'courier';
    }
};

// Función auxiliar para convertir ArrayBuffer a base64
const arrayBufferToBase64 = (buffer) => {
    try {
        if (!buffer || buffer.byteLength === 0) {
            throw new Error('Buffer vacío o inválido');
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        
        const chunkSize = 0x8000; // 32KB chunks
        for (let i = 0; i < len; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
            binary += String.fromCharCode.apply(null, chunk);
        }
        
        return btoa(binary);
    } catch (error) {
        console.error('Error convirtiendo ArrayBuffer a base64:', error);
        throw error;
    }
};

// Función para obtener etiqueta del método de pago
const getMetodoPagoLabel = (metodo) => {
    const metodos = {
        efectivo: 'EFECTIVO',
        tarjeta_credito: 'TARJETA DE CREDITO',
        tarjeta_debito: 'TARJETA DE DEBITO',
        tarjeta: 'TARJETA',
        yape: 'YAPE',
        plin: 'PLIN',
        transferencia: 'TRANSFERENCIA BANCARIA',
        deposito: 'DEPOSITO BANCARIO',
        cheque: 'CHEQUE',
        mixto: 'PAGO MIXTO',
        otro: 'OTRO'
    };
    return metodos[metodo?.toLowerCase()] || metodo?.toUpperCase() || 'N/A';
};

// Función para dibujar tabla con bordes completos estilo profesional
const drawProfessionalTable = (pdf, data, headers, colWidths, startX, startY, fontName) => {
    let currentY = startY;
    const lineHeight = 6;
    const padding = 1;
    
    // Calcular posiciones X para cada columna
    const colPositions = [startX];
    for (let i = 0; i < colWidths.length - 1; i++) {
        colPositions.push(colPositions[i] + colWidths[i]);
    }
    
    const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
    
    // Dibujar encabezados con fondo gris medio
    pdf.setFillColor(200, 200, 200);
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.2);
    
    // Rectángulo de fondo para encabezados
    pdf.rect(startX, currentY, tableWidth, lineHeight, 'FD');
    
    // Texto de encabezados en negro y negrita
    pdf.setTextColor(0, 0, 0);
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(7);
    
    // Dibujar líneas verticales y texto de encabezados
    headers.forEach((header, index) => {
        const x = colPositions[index];
        const width = colWidths[index];
        
        // Línea vertical izquierda de cada columna
        if (index === 0) {
            pdf.line(x, currentY, x, currentY + lineHeight);
        }
        pdf.line(x + width, currentY, x + width, currentY + lineHeight);
        
        // Texto del encabezado centrado
        let displayText = header;
        const maxWidth = width - (padding * 2);
        
        // Truncar texto si es muy largo
        while (pdf.getTextWidth(displayText) > maxWidth && displayText.length > 1) {
            displayText = displayText.slice(0, -1);
        }
        
        pdf.text(displayText, x + width/2, currentY + lineHeight/2 + 1, { align: 'center' });
    });
    
    currentY += lineHeight;
    
    // Resetear color de texto para el contenido
    pdf.setTextColor(0, 0, 0);
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(7);
    
    // Dibujar filas de datos
    data.forEach((row, rowIndex) => {
        // Alternar colores de fila para mejor legibilidad
        if (rowIndex % 2 === 0) {
            pdf.setFillColor(248, 248, 248);
            pdf.rect(startX, currentY, tableWidth, lineHeight, 'F');
        }
        
        // Dibujar bordes de la fila
        pdf.rect(startX, currentY, tableWidth, lineHeight, 'S');
        
        row.forEach((cellData, colIndex) => {
            const x = colPositions[colIndex];
            const width = colWidths[colIndex];
            
            // Líneas verticales
            pdf.line(x, currentY, x, currentY + lineHeight);
            if (colIndex === row.length - 1) {
                pdf.line(x + width, currentY, x + width, currentY + lineHeight);
            }
            
            // Contenido de la celda
            let displayText = String(cellData || '');
            const maxWidth = width - (padding * 2);
            
            // Truncar texto si es muy largo
            while (pdf.getTextWidth(displayText) > maxWidth && displayText.length > 1) {
                displayText = displayText.slice(0, -1);
            }
            
            // Alineación según el tipo de contenido
            let textAlign = 'left';
            let textX = x + padding;
            
            // Alinear a la derecha montos (columnas que contienen 'S/.')
            if (displayText.includes('S/.') || displayText.match(/^\d+$/)) {
                textAlign = 'right';
                textX = x + width - padding;
            }
            // Centrar algunos tipos de datos
            else if (colIndex === 0 && displayText.length <= 8) { // IDs cortos, horas
                textAlign = 'center';
                textX = x + width/2;
            }
            
            pdf.text(displayText, textX, currentY + lineHeight/2 + 1, { align: textAlign });
        });
        
        currentY += lineHeight;
    });
    
    return currentY;
};

const generarPDFCaja = async (cierreData) => {
    try {
        const { jsPDF } = await import('jspdf');
        
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4',
        });
        
        // Cargar fuente Courier PS
        const fontName = await loadCourierPSFont(pdf);
        
        const pageWidth = pdf.internal.pageSize.width;
        const pageHeight = pdf.internal.pageSize.height;
        const margin = 10;
        const totalWidth = pageWidth - 2 * margin;
        
        let currentY = 15;

        // =========================================================================
        // ENCABEZADO LIMPIO - DISTRIBUIDO EN DOS COLUMNAS SIN FONDO GRIS
        // =========================================================================

        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(12);
        pdf.setTextColor(0, 0, 0);
        
        // Título de la empresa (izquierda) - TODO EN MAYÚSCULAS
        pdf.text('MOTORES & REPUESTOS SAC', margin, currentY);
        
        // Tipo de reporte (derecha) - TODO EN MAYÚSCULAS
        pdf.text('REPORTE DE CAJA', pageWidth - margin, currentY, { align: 'right' });
        currentY += 8;

        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        
        // COLUMNA IZQUIERDA - Información principal
        pdf.text('R.U.C: 20123456789', margin, currentY);
        pdf.text('EMAIL: MOTORESREPUESTOS@MAIL.COM', margin, currentY + 4);
        pdf.text('REPORTE GENERADO DESDE TIENDA AV.LOS MOTORES 456 SAN BORJA', margin, currentY + 8);
        
        // COLUMNA DERECHA - Información de contacto
        pdf.text('DIRECCION: AV. LOS MOTORES 456, SAN BORJA', pageWidth / 2, currentY);
        pdf.text('TELEFONO: 999 888 777', pageWidth / 2, currentY + 4);
        
        currentY += 18;
        
        // Información del reporte
        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        
        const fechaCierre = cierreData.fecha?.toDate ? 
            cierreData.fecha.toDate().toLocaleDateString('es-PE') : 
            (cierreData.fechaString ? new Date(cierreData.fechaString).toLocaleDateString('es-PE') : new Date().toLocaleDateString('es-PE'));
        
        pdf.text('FECHA DE CAJA:', margin, currentY);
        pdf.text(fechaCierre, margin + 25, currentY);

        pdf.text('CERRADA POR:', pageWidth / 2, currentY);
        pdf.text((cierreData.cerradoPor || 'N/A').toUpperCase(), pageWidth / 2 + 25, currentY);
        currentY += 5;

        pdf.text('FECHA DE CIERRE:', margin, currentY);
        const fechaCierreCompleta = cierreData.fechaCierre?.toDate ? 
            cierreData.fechaCierre.toDate().toLocaleString('es-PE') : 
            new Date().toLocaleString('es-PE');
        pdf.text(fechaCierreCompleta, margin + 30, currentY);
        currentY += 5;

        // Línea divisora
        pdf.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 8;

        // =========================================================================
        // RESUMEN DE TOTALES CON TABLA PROFESIONAL
        // =========================================================================

        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text('RESUMEN DE TOTALES DEL DIA:', margin, currentY);
        currentY += 8;

        // Headers y datos para tabla de resumen
        const resumenHeaders = ['METODO DE PAGO', 'MONTO'];
        const resumenColWidths = [totalWidth * 0.6, totalWidth * 0.4];
        
        const resumenData = [
            ['EFECTIVO', `S/. ${(cierreData.totales?.efectivo || 0).toFixed(2)}`],
            ['YAPE', `S/. ${(cierreData.totales?.yape || 0).toFixed(2)}`],
            ['PLIN', `S/. ${(cierreData.totales?.plin || 0).toFixed(2)}`],
            ['TARJETAS', `S/. ${(cierreData.totales?.tarjeta || 0).toFixed(2)}`],
        ];

        // Dibujar tabla de resumen
        currentY = drawProfessionalTable(pdf, resumenData, resumenHeaders, resumenColWidths, margin, currentY, fontName);
        currentY += 5;

        // Total general con estilo destacado
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);
        
        // Fondo para el total general
        pdf.setFillColor(200, 200, 200);
        pdf.setDrawColor(0, 0, 0);
        pdf.rect(margin, currentY, totalWidth, 8, 'FD');
        
        pdf.text('TOTAL GENERAL:', margin + 5, currentY + 5);
        pdf.text(`S/. ${(cierreData.totales?.total || 0).toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
        
        currentY += 15;

        // =========================================================================
        // DEVOLUCIONES DEL DÍA CON TABLA PROFESIONAL
        // =========================================================================

        if (cierreData.devoluciones && cierreData.devoluciones.length > 0) {
            // Verificar si necesitamos nueva página
            if (currentY > pageHeight - 100) {
                pdf.addPage();
                currentY = 15;
            }
            
            pdf.setFont(fontName, 'bold');
            pdf.setFontSize(8);
            pdf.text(`DEVOLUCIONES DEL DIA (${cierreData.devoluciones.length}):`, margin, currentY);
            currentY += 8;

            // Headers de la tabla de devoluciones
            const devolucionesHeaders = ['N° VENTA', 'CLIENTE', 'MONTO', 'METODO', 'ESTADO'];
            const devolucionesColWidths = [
                totalWidth * 0.15, // N° Venta
                totalWidth * 0.30, // Cliente  
                totalWidth * 0.20, // Monto
                totalWidth * 0.20, // Método Pago
                totalWidth * 0.15  // Estado
            ];
            
            // Preparar datos de devoluciones
            const devolucionesData = cierreData.devoluciones.map(devolucion => [
                (devolucion.numeroVenta || 'N/A').toString().toUpperCase(),
                (devolucion.clienteNombre || 'N/A').toString().toUpperCase(),
                `S/. ${(devolucion.montoADevolver || 0).toFixed(2)}`,
                getMetodoPagoLabel(devolucion.metodoPagoOriginal),
                (devolucion.estado || 'N/A').toString().toUpperCase()
            ]);

            // Dibujar tabla de devoluciones
            currentY = drawProfessionalTable(pdf, devolucionesData, devolucionesHeaders, devolucionesColWidths, margin, currentY, fontName);
            currentY += 5;

            // Total de devoluciones con estilo destacado
            pdf.setFont(fontName, 'bold');
            pdf.setFontSize(9);
            
            const totalDevoluciones = cierreData.devolucionesDelDia?.totalDevuelto || 
                cierreData.devoluciones.reduce((total, dev) => total + (dev.montoADevolver || 0), 0);
            
            // Fondo para total de devoluciones
            pdf.setFillColor(255, 220, 220); // Rojo claro
            pdf.rect(margin, currentY, totalWidth, 8, 'FD');
            
            pdf.text('TOTAL DEVOLUCIONES:', margin + 5, currentY + 5);
            pdf.text(`S/. ${totalDevoluciones.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
            currentY += 15;
        }

        // =========================================================================
        // RETIROS DEL DÍA CON TABLA PROFESIONAL
        // =========================================================================

        if (cierreData.retiros && cierreData.retiros.length > 0) {
            // Verificar si necesitamos nueva página
            if (currentY > pageHeight - 100) {
                pdf.addPage();
                currentY = 15;
            }
            
            pdf.setFont(fontName, 'bold');
            pdf.setFontSize(8);
            pdf.text(`RETIROS DEL DIA (${cierreData.retiros.length}):`, margin, currentY);
            currentY += 8;

            // Headers de la tabla de retiros
            const retirosHeaders = ['HORA', 'TIPO', 'MONTO', 'MOTIVO', 'REALIZADO POR'];
            const retirosColWidths = [
                totalWidth * 0.12, // Hora
                totalWidth * 0.12, // Tipo  
                totalWidth * 0.18, // Monto
                totalWidth * 0.38, // Motivo
                totalWidth * 0.20  // Realizado por
            ];
            
            // Preparar datos de retiros
            const retirosData = cierreData.retiros.map(retiro => {
                const fechaRetiro = retiro.fecha?.toDate ? retiro.fecha.toDate() : new Date();
                const horaRetiro = fechaRetiro.toLocaleTimeString('es-PE', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                return [
                    horaRetiro,
                    (retiro.tipo || 'N/A').toString().toUpperCase(),
                    `S/. ${(retiro.monto || 0).toFixed(2)}`,
                    (retiro.motivo || 'N/A').toString().toUpperCase(),
                    (retiro.realizadoPor || 'N/A').toString().toUpperCase()
                ];
            });

            // Dibujar tabla de retiros
            currentY = drawProfessionalTable(pdf, retirosData, retirosHeaders, retirosColWidths, margin, currentY, fontName);
            currentY += 5;

            // Total de retiros con estilo destacado
            pdf.setFont(fontName, 'bold');
            pdf.setFontSize(9);
            
            const totalRetiros = cierreData.retiros.reduce((total, retiro) => total + (retiro.monto || 0), 0);
            
            // Fondo para total de retiros
            pdf.setFillColor(255, 240, 220); // Naranja claro
            pdf.rect(margin, currentY, totalWidth, 8, 'FD');
            
            pdf.text('TOTAL RETIROS:', margin + 5, currentY + 5);
            pdf.text(`S/. ${totalRetiros.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
            currentY += 15;
        }

        // =========================================================================
        // ANÁLISIS DE GANANCIAS CON ESTILO PROFESIONAL
        // =========================================================================

        // Verificar si necesitamos nueva página
        if (currentY > pageHeight - 80) {
            pdf.addPage();
            currentY = 15;
        }

        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text('ANALISIS DE GANANCIAS:', margin, currentY);
        currentY += 8;

        // Tabla de ganancias
        const gananciasHeaders = ['CONCEPTO', 'MONTO'];
        const gananciasColWidths = [totalWidth * 0.6, totalWidth * 0.4];
        
        const gananciasData = [
            ['GANANCIA BRUTA', `S/. ${(cierreData.totales?.gananciaBruta || 0).toFixed(2)}`],
            ['GANANCIA REAL', `S/. ${(cierreData.totales?.gananciaReal || 0).toFixed(2)}`]
        ];

        // Dibujar tabla de ganancias
        currentY = drawProfessionalTable(pdf, gananciasData, gananciasHeaders, gananciasColWidths, margin, currentY, fontName);
        currentY += 10;

        // =========================================================================
        // RESUMEN FINAL CON TABLA PROFESIONAL
        // =========================================================================

        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text('RESUMEN FINAL DE CAJA:', margin, currentY);
        currentY += 8;

        const resumenFinal = cierreData.resumenFinal || {};
        const dineroInicial = cierreData.dineroInicial || 0;

        // Tabla de resumen final
        const finalHeaders = ['CONCEPTO', 'CANTIDAD/MONTO'];
        const finalColWidths = [totalWidth * 0.6, totalWidth * 0.4];
        
        const finalData = [
            ['DINERO INICIAL', `S/. ${dineroInicial.toFixed(2)}`],
            ['TOTAL DE VENTAS DEL DIA', `${resumenFinal.totalVentas || 0}`],
            ['TOTAL DE RETIROS', `${resumenFinal.totalRetiros || 0}`],
            ['EFECTIVO FINAL EN CAJA', `S/. ${(resumenFinal.efectivoFinal || 0).toFixed(2)}`],
            ['TOTAL DIGITAL (YAPE + PLIN + TARJETA)', `S/. ${(resumenFinal.digitalTotal || 0).toFixed(2)}`]
        ];

        // Agregar devoluciones si existen
        if (cierreData.devoluciones && cierreData.devoluciones.length > 0) {
            finalData.splice(2, 0, ['TOTAL DE DEVOLUCIONES', `${resumenFinal.totalDevoluciones || 0}`]);
        }

        // Dibujar tabla de resumen final
        currentY = drawProfessionalTable(pdf, finalData, finalHeaders, finalColWidths, margin, currentY, fontName);
        currentY += 10;

        // =========================================================================
        // INFORMACIÓN ADICIONAL
        // =========================================================================
        
        // Verificar si necesitamos nueva página
        if (currentY > pageHeight - 60) {
            pdf.addPage();
            currentY = 15;
        }
        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text('INFORMACION IMPORTANTE:', margin, currentY);
        currentY += 6;
        
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(8);
        pdf.text('• ESTE REPORTE REFLEJA EL ESTADO DE LA CAJA AL MOMENTO DEL CIERRE.', margin + 5, currentY);
        currentY += 4;
        pdf.text('• LOS MONTOS DIGITALES (YAPE, PLIN, TARJETA) SE MANTIENEN EN LAS CUENTAS RESPECTIVAS.', margin + 5, currentY);
        currentY += 4;
        pdf.text('• EL EFECTIVO FINAL DEBE COINCIDIR CON EL DINERO FISICO EN CAJA.', margin + 5, currentY);
        currentY += 4;
        pdf.text('• LAS DEVOLUCIONES YA ESTAN DESCONTADAS DE LOS TOTALES POR METODO DE PAGO.', margin + 5, currentY);
        currentY += 4;
        pdf.text('• CONSERVE ESTE DOCUMENTO PARA AUDITORIAS Y CONTROLES INTERNOS.', margin + 5, currentY);
        currentY += 8;

        // Pie de página
        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        pdf.text(`REPORTE GENERADO EL ${new Date().toLocaleString('es-PE')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        
        return pdf;
        
    } catch (error) {
        console.error('Error al generar PDF de caja:', error);
        throw error;
    }
};
    
// Función principal exportada
export const generarPDFCajaCompleta = async (fechaString) => {
    try {
        // Obtener datos del cierre de caja desde Firestore
        const cierreDoc = await getDoc(doc(db, 'cierresCaja', fechaString));
        
        if (!cierreDoc.exists()) {
            throw new Error('No se encontro el cierre de caja para esta fecha');
        }
        
        const cierreData = cierreDoc.data();
        
        const pdf = await generarPDFCaja(cierreData);
        
        // Guardar PDF
        const fechaSufijo = fechaString.replace(/\//g, '-');
        const fileName = `reporte-caja-${fechaSufijo}.pdf`;
        pdf.save(fileName);
        
        return `Reporte de caja generado exitosamente para ${fechaString}`;
        
    } catch (error) {
        console.error('Error al generar PDF de caja:', error);
        throw new Error('Error al generar el reporte de caja. Por favor, intentalo de nuevo.');
    }
};

export default { generarPDFCajaCompleta };