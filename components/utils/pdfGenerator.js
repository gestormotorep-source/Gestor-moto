// utils/pdfGenerator.js - VERSIÓN CON ESTILO PROFESIONAL
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

// Función auxiliar para convertir ArrayBuffer a base64 con validación mejorada
const arrayBufferToBase64 = (buffer) => {
    try {
        if (!buffer || buffer.byteLength === 0) {
            throw new Error('Buffer vacío o inválido');
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        
        // Procesar en chunks para evitar problemas de memoria con archivos grandes
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

// Función auxiliar para obtener los detalles del producto desde Firestore
const getProductDetails = async (productoId) => {
    if (!productoId) return {};
    try {
        const docRef = doc(db, "productos", productoId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            console.log("No such document!");
            return {};
        }
    } catch (error) {
        console.error("Error al obtener detalles del producto:", error);
        return {};
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
            
            // Centrar números de cantidad
            if (colIndex === 6) { // CANT.
                textAlign = 'center';
                textX = x + width/2;
            }
            // Alinear a la derecha precios
            else if (colIndex >= 7) { // P. UNITARIO y P. TOTAL
                textAlign = 'right';
                textX = x + width - padding;
            }
            
            pdf.text(displayText, textX, currentY + lineHeight/2 + 1, { align: textAlign });
        });
        
        currentY += lineHeight;
    });
    
    return currentY;
};

// Función para generar el PDF con un diseño de crédito profesional
const generarPDF = async (cliente, creditos, abonos = [], periodo = '') => {
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
        
        // Número de crédito o reporte (derecha) - TODO EN MAYÚSCULAS
        const tituloReporte = periodo ? 
            `REPORTE CREDITOS - ${periodo.toUpperCase()}` : 
            `CREDITO NRO. ${creditos[0]?.numeroCredito || 'N/A'}`;
        pdf.text(tituloReporte, pageWidth - margin, currentY, { align: 'right' });
        currentY += 8;

        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        
        // COLUMNA IZQUIERDA - Información principal
        pdf.text('R.U.C: 20123456789', margin, currentY);
        pdf.text('EMAIL: MOTORESREPUESTOS@MAIL.COM', margin, currentY + 4);
        pdf.text('CREDITO REALIZADO EN TIENDA AV.LOS MOTORES 456 SAN BORJA', margin, currentY + 8);
        
        // COLUMNA DERECHA - Información de contacto
        pdf.text('DIRECCION: AV. LOS MOTORES 456, SAN BORJA', pageWidth / 2, currentY);
        pdf.text('TELEFONO: 999 888 777', pageWidth / 2, currentY + 4);
        
        currentY += 18;
        
        // Información del crédito
        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        
        const fechaCreacion = creditos[0]?.fechaCreacion?.toDate ? 
            creditos[0].fechaCreacion.toDate().toLocaleDateString('es-PE') : 
            new Date().toLocaleDateString('es-PE');
        
        pdf.text('FECHA DE CREACION:', margin, currentY);
        pdf.text(fechaCreacion, margin + 35, currentY);

        pdf.text('FORMA DE PAGO:', pageWidth / 2, currentY);
        pdf.text('TODOS LOS MEDIOS DE PAGO', pageWidth / 2 + 30, currentY);
        currentY += 5;

        // Línea divisora
        pdf.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 5;

        // =========================================================================
        // INFORMACIÓN DEL CLIENTE
        // =========================================================================

        pdf.setFontSize(8);
        pdf.setFont(fontName, 'bold');
        pdf.text('CLIENTE:', margin, currentY);
        pdf.setFont(fontName, 'normal');
        pdf.text(`${cliente.nombre} ${cliente.apellido || ''}`.toUpperCase(), margin + 15, currentY);
        currentY += 5;
        
        pdf.setFont(fontName, 'bold');
        pdf.text('DNI:', margin, currentY);
        pdf.setFont(fontName, 'normal');
        pdf.text(String(cliente.dni || 'N/A'), margin + 15, currentY);
        currentY += 5;
        
        // =========================================================================
        // TABLA PROFESIONAL CON BORDES COMPLETOS
        // =========================================================================

        // Headers de la tabla - TODO EN MAYÚSCULAS
        const tableHeaders = ['COD.', 'DESCRIPCION', 'COLOR', 'MARCA', 'UBICACION', 'MEDIDA', 'CANT', 'P.U.', 'P.T.'];
        
        // Anchos de columnas optimizados para el estilo profesional
        const colWidths = [
            totalWidth * 0.10, // Código
            totalWidth * 0.32, // Descripción
            totalWidth * 0.08, // Color
            totalWidth * 0.10, // Marca
            totalWidth * 0.12, // Ubicación
            totalWidth * 0.08, // Medida
            totalWidth * 0.06, // Cant.
            totalWidth * 0.07, // P.U.
            totalWidth * 0.07  // P.T.
        ];

        // Preparar datos para la tabla
        const tableData = [];
        let totalOriginalCredito = 0;

        // Procesar items
        for (const credito of creditos) {
            if (credito.items && credito.items.length > 0) {
                for (const item of credito.items) {
                    // Obtener los detalles del producto
                    const productDetails = await getProductDetails(item.productoId);
                    
                    // Datos del item - TODO EN MAYÚSCULAS
                    const itemRow = [
                        (productDetails.codigoTienda || 'N/A').toString().toUpperCase(),
                        (item.nombreProducto || 'N/A').toString().toUpperCase(),
                        (productDetails.color || 'N/A').toString().toUpperCase(),
                        (productDetails.marca || 'N/A').toString().toUpperCase(),
                        (productDetails.ubicacion || 'N/A').toString().toUpperCase(),
                        (productDetails.medida || 'N/A').toString().toUpperCase(),
                        String(item.cantidad || 0),
                        `${parseFloat(item.precioVentaUnitario || 0).toFixed(2)}`,
                        `${parseFloat(item.subtotal || 0).toFixed(2)}`
                    ];
                    
                    tableData.push(itemRow);
                    totalOriginalCredito += parseFloat(item.subtotal || 0);
                }
            }
        }

        // Dibujar la tabla profesional
        currentY = drawProfessionalTable(pdf, tableData, tableHeaders, colWidths, margin, currentY, fontName);
        
        currentY += 5;

        // =========================================================================
        // FILA DE TOTAL CON ESTILO PROFESIONAL
        // =========================================================================
        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);
        
        // Fondo para la fila de total del crédito
        pdf.setFillColor(200, 200, 200);
        pdf.setDrawColor(0, 0, 0);
        pdf.rect(margin, currentY, totalWidth, 8, 'FD');
        
        // Texto "TOTAL DEL CREDITO"
        pdf.text('TOTAL DEL CREDITO:', margin + 5, currentY + 5);
        
        // Monto total alineado a la derecha
        pdf.text(`S/. ${totalOriginalCredito.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
        
        currentY += 10;

        // =========================================================================
        // SECCIÓN DE DESGLOSE FINANCIERO CON ESTILO PROFESIONAL
        // =========================================================================
        
        // Filtrar y calcular totales solo de abonos activos (no procesados/saldados)
        const abonosActivos = abonos.filter(abono => 
            abono.estado !== 'procesado' && 
            abono.estado !== 'saldado' && 
            abono.estado !== 'cancelado'
        );
        const totalAbonosActivos = abonosActivos.reduce((sum, abono) => sum + (abono.monto || 0), 0);
        const saldoPendiente = totalOriginalCredito - totalAbonosActivos;
        
        pdf.setFontSize(8);
        

        // SALDO PENDIENTE con estilo destacado
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);
        
        // Fondo para saldo pendiente
        const saldoColor = saldoPendiente > 0 ? [255, 200, 200] : [200, 255, 200]; // Rojo claro o verde claro
        pdf.setFillColor(...saldoColor);
        pdf.rect(margin, currentY, totalWidth, 8, 'FD');
        
        pdf.setTextColor(saldoPendiente > 0 ? 150 : 0, 0, 0); // Rojo oscuro o negro
        pdf.text('SALDO PENDIENTE:', margin + 5, currentY + 5);
        pdf.text(`S/. ${saldoPendiente.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
        currentY += 15;
        
        // Resetear color del texto
        pdf.setTextColor(0, 0, 0);

        // =========================================================================
        // HISTORIAL DE ABONOS CON TABLA PROFESIONAL (SOLO ABONOS ACTIVOS)
        // =========================================================================
        
        if (abonosActivos && abonosActivos.length > 0) {
            // Verificar si necesitamos nueva página
            if (currentY > pageHeight - 80) {
                pdf.addPage();
                currentY = 15;
            }
            
            pdf.setFont(fontName, 'bold');
            pdf.setFontSize(8);
            pdf.text(`HISTORIAL DE ABONOS PENDIENTES (${abonosActivos.length}):`, margin, currentY);
            currentY += 8;
            
            // Encabezados de la tabla de abonos
            const abonosHeaders = ['FECHA', 'MONTO', 'METODO DE PAGO', 'ESTADO'];
            const abonosColWidths = [40, 30, 50, 30];
            
            // Preparar datos de abonos activos únicamente
            const abonosData = abonosActivos.map(abono => [
                abono.fecha?.toDate ? 
                    abono.fecha.toDate().toLocaleDateString('es-PE') : 
                    (abono.fecha && new Date(abono.fecha.seconds * 1000).toLocaleDateString('es-PE')) || 'N/A',
                `${(abono.monto || 0).toFixed(2)}`,
                getMetodoPagoLabel(abono.metodoPago),
                abono.estado ? abono.estado.toUpperCase() : 'ACTIVO'
            ]);
            
            // Dibujar tabla de abonos activos
            currentY = drawProfessionalTable(pdf, abonosData, abonosHeaders, abonosColWidths, margin, currentY, fontName);
            currentY += 10;
        }

        // =========================================================================
        // INFORMACIÓN ADICIONAL
        // =========================================================================
        
        if (currentY > pageHeight - 50) {
            pdf.addPage();
            currentY = 15;
        }
        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text('INFORMACION IMPORTANTE:', margin, currentY);
        currentY += 6;
        
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(8);
        pdf.text('• ESTE DOCUMENTO ES UN RESUMEN DEL ESTADO ACTUAL DE SU CREDITO.', margin + 5, currentY);
        currentY += 4;
        pdf.text('• PARA CUALQUIER CONSULTA O ACLARACION, COMUNIQUESE CON NOSOTROS.', margin + 5, currentY);
        currentY += 4;
        pdf.text('• CONSERVE ESTE DOCUMENTO PARA SUS REGISTROS.', margin + 5, currentY);
        currentY += 8;

        // Pie de página
        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        pdf.text(`REPORTE GENERADO EL ${new Date().toLocaleString('es-PE')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        
        // Guardar PDF
        const fechaSufijo = new Date().toISOString().split('T')[0];
        const periodoSufijo = periodo ? `-${periodo.toLowerCase().replace(/\s+/g, '-')}` : '';
        const clienteSufijo = cliente ? `-${cliente.nombre.replace(/\s+/g, '-')}` : '-todos-los-clientes';
        const fileName = `reporte-creditos${clienteSufijo}${periodoSufijo}-${fechaSufijo}.pdf`;
        pdf.save(fileName);
        
        return true;
        
    } catch (error) {
        console.error('Error al generar PDF:', error);
        throw error;
    }
};

// Función principal para generar PDF de un cliente específico
export const generarPDFCliente = async (cliente, creditos, abonos = [], periodo = '') => {
    try {
        await generarPDF(cliente, creditos, abonos, periodo);
        return `Reporte PDF generado exitosamente para ${cliente.nombre} ${cliente.apellido || ''}`;
    } catch (error) {
        throw new Error('Error al generar el reporte PDF. Por favor, inténtalo de nuevo.');
    }
};

// Función para generar PDF de múltiples clientes con tabla profesional
export const generarPDFPorPeriodo = async (clientesConCreditos, periodo) => {
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
        // ENCABEZADO PROFESIONAL
        // =========================================================================
        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(14);
        pdf.text('MOTORES & REPUESTOS SAC', pageWidth / 2, currentY, { align: 'center' });
        currentY += 8;

        pdf.setFontSize(12);
        pdf.text(`REPORTE DE CREDITOS - ${periodo.toUpperCase()}`, pageWidth / 2, currentY, { align: 'center' });
        currentY += 10;

        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        pdf.text(`FECHA DE GENERACION: ${new Date().toLocaleDateString('es-PE')}`, pageWidth / 2, currentY, { align: 'center' });
        currentY += 15;

        // =========================================================================
        // TABLA PROFESIONAL DE RESUMEN
        // =========================================================================
        
        const tableHeaders = ['CLIENTE', 'DNI', 'MONTO ADEUDADO'];
        const colWidths = [totalWidth * 0.5, totalWidth * 0.2, totalWidth * 0.3];
        
        // Preparar datos
        const tableData = clientesConCreditos.map(cliente => [
            `${cliente.nombre} ${cliente.apellido || ''}`.toUpperCase(),
            String(cliente.dni || 'N/A'),
            `${parseFloat(cliente.montoCreditoActual || 0).toFixed(2)}`
        ]);
        
        // Dibujar tabla de resumen
        currentY = drawProfessionalTable(pdf, tableData, tableHeaders, colWidths, margin, currentY, fontName);
        currentY += 10;

        // =========================================================================
        // TOTAL GENERAL CON ESTILO PROFESIONAL
        // =========================================================================
        
        const totalGeneral = clientesConCreditos.reduce((sum, cliente) => 
            sum + parseFloat(cliente.montoCreditoActual || 0), 0);
        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);
        
        // Fondo para el total general
        pdf.setFillColor(200, 200, 200);
        pdf.setDrawColor(0, 0, 0);
        pdf.rect(margin, currentY, totalWidth, 8, 'FD');
        
        pdf.text('TOTAL GENERAL:', margin + 5, currentY + 5);
        pdf.text(`S/. ${totalGeneral.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
        
        currentY += 15;

        // =========================================================================
        // ESTADÍSTICAS ADICIONALES
        // =========================================================================
        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text('ESTADISTICAS:', margin, currentY);
        currentY += 6;
        
        pdf.setFont(fontName, 'normal');
        pdf.text(`TOTAL DE CLIENTES CON CREDITO: ${clientesConCreditos.length}`, margin + 5, currentY);
        currentY += 4;
        pdf.text(`PROMEDIO POR CLIENTE: S/. ${clientesConCreditos.length > 0 ? (totalGeneral / clientesConCreditos.length).toFixed(2) : '0.00'}`, margin + 5, currentY);
        currentY += 4;
        
        // Pie de página
        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        pdf.text(`REPORTE GENERADO EL ${new Date().toLocaleString('es-PE')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

        // Guardar PDF
        const fechaSufijo = new Date().toISOString().split('T')[0];
        const periodoSufijo = periodo.toLowerCase().replace(/\s+/g, '-');
        const fileName = `reporte-creditos-${periodoSufijo}-${fechaSufijo}.pdf`;
        pdf.save(fileName);
        
        return `Reporte PDF generado exitosamente - ${periodo}`;
        
    } catch (error) {
        console.error('Error al generar PDF por período:', error);
        throw new Error('Error al generar el reporte PDF. Por favor, inténtalo de nuevo.');
    }
};

export default { generarPDFCliente, generarPDFPorPeriodo };