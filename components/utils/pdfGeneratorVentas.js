// utils/pdfGeneratorVentas.js
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Función para cargar únicamente Courier PS
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

// Función para obtener los items de la venta
const getVentaItems = async (ventaId) => {
    try {
        const itemsRef = collection(db, 'ventas', ventaId, 'itemsVenta');
        const itemsSnapshot = await getDocs(itemsRef);
        
        const items = [];
        for (const itemDoc of itemsSnapshot.docs) {
            const itemData = itemDoc.data();
            items.push({
                id: itemDoc.id,
                ...itemData
            });
        }
        
        return items;
    } catch (error) {
        console.error('Error al obtener items de la venta:', error);
        return [];
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

// Función para obtener etiqueta del tipo de venta
const getTipoVentaLabel = (tipo) => {
    const tipos = {
        directa: 'VENTA DIRECTA',
        cotizacionAprobada: 'COTIZACION APROBADA',
        abono: 'ABONO A CREDITO',
        credito: 'VENTA A CREDITO'
    };
    return tipos[tipo] || tipo?.toUpperCase() || 'VENTA DIRECTA';
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
    
    // Dibujar encabezados con fondo gris medio (igual que el total)
    pdf.setFillColor(200, 200, 200); // Mismo gris que "TOTAL DE LA VENTA"
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.2); // Bordes más delgados
    
    // Rectángulo de fondo para encabezados
    pdf.rect(startX, currentY, tableWidth, lineHeight, 'FD');
    
    // Texto de encabezados en negro y negrita
    pdf.setTextColor(0, 0, 0); // Texto negro
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
            pdf.setFillColor(248, 248, 248); // Gris muy claro
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

// Función principal para generar el PDF de venta
const generarPDFVenta = async (ventaData, clienteData = null) => {
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
        
        // Número de venta (derecha) - TODO EN MAYÚSCULAS
        const numeroVenta = ventaData.numeroVenta || `V-${ventaData.id?.slice(-8) || 'N/A'}`;
        pdf.text(`VENTA NRO. ${numeroVenta}`, pageWidth - margin, currentY, { align: 'right' });
        currentY += 8;

        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        
        // COLUMNA IZQUIERDA - Información principal
        pdf.text('R.U.C: 20123456789', margin, currentY);
        pdf.text('EMAIL: MOTORESREPUESTOS@MAIL.COM', margin, currentY + 4);
        pdf.text('VENTA REALIZADA EN TIENDA AV.LOS MOTORES 456 SAN BORJA', margin, currentY + 8);
        
        // COLUMNA DERECHA - Información de contacto
        pdf.text('DIRECCION: AV. LOS MOTORES 456, SAN BORJA', pageWidth / 2, currentY);
        pdf.text('TELEFONO: 999 888 777', pageWidth / 2, currentY + 4);
        
        currentY += 18;
        
        // Información de la venta
        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        
        const fechaVenta = ventaData.fechaVenta?.toDate ? 
            ventaData.fechaVenta.toDate().toLocaleDateString('es-PE') : 
            (ventaData.fechaVenta ? new Date(ventaData.fechaVenta).toLocaleDateString('es-PE') : new Date().toLocaleDateString('es-PE'));
        
        pdf.text('FECHA DE VENTA:', margin, currentY);
        pdf.text(fechaVenta, margin + 30, currentY);

        pdf.text('TIPO DE VENTA:', pageWidth / 2, currentY);
        pdf.text(getTipoVentaLabel(ventaData.tipoVenta), pageWidth / 2 + 25, currentY);
        currentY += 5;

        // Método de pago y Estado en la misma línea
        pdf.text('METODO DE PAGO:', margin, currentY);
        
        // Manejar métodos de pago mixtos
        let metodoPagoTexto = '';
        if (ventaData.paymentData && ventaData.paymentData.isMixedPayment && ventaData.paymentData.paymentMethods) {
            const metodosActivos = ventaData.paymentData.paymentMethods
                .filter(pm => pm.amount > 0)
                .map(pm => `${getMetodoPagoLabel(pm.method)}: S/. ${pm.amount.toFixed(2)}`)
                .join(', ');
            metodoPagoTexto = metodosActivos || 'PAGO MIXTO';
        } else if (ventaData.paymentData && ventaData.paymentData.paymentMethods && ventaData.paymentData.paymentMethods.length > 0) {
            metodoPagoTexto = getMetodoPagoLabel(ventaData.paymentData.paymentMethods[0].method);
        } else {
            metodoPagoTexto = getMetodoPagoLabel(ventaData.metodoPago);
        }
        
        pdf.text(metodoPagoTexto, margin + 35, currentY);

        // Estado de la venta (MISMA LÍNEA que método de pago)
        pdf.text('ESTADO:', pageWidth / 2, currentY);
        const estadoTexto = ventaData.estado === 'completada' ? 'COMPLETADA' : 
                           ventaData.estado === 'anulada' ? 'ANULADA' : 
                           ventaData.estado?.toUpperCase() || 'PENDIENTE';
        pdf.text(estadoTexto, pageWidth / 2 + 15, currentY);
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
        
        const clienteNombre = clienteData ? 
            `${clienteData.nombre} ${clienteData.apellido || ''}` : 
            ventaData.clienteNombre || 'Cliente General';
        pdf.text(clienteNombre.toUpperCase(), margin + 15, currentY);
        currentY += 5;
        
        if (clienteData && clienteData.dni) {
            pdf.setFont(fontName, 'bold');
            pdf.text('DNI:', margin, currentY);
            pdf.setFont(fontName, 'normal');
            pdf.text(String(clienteData.dni), margin + 15, currentY);
            currentY += 5;
        }

        if (ventaData.observaciones) {
            pdf.setFont(fontName, 'bold');
            pdf.text('OBSERVACIONES:', margin, currentY);
            pdf.setFont(fontName, 'normal');
            const maxWidth = totalWidth - 30;
            const lines = pdf.splitTextToSize(ventaData.observaciones.toUpperCase(), maxWidth);
            pdf.text(lines, margin + 30, currentY);
            currentY += lines.length * 4;
        }
        
        currentY += 5;
        
        // =========================================================================
        // TABLA PROFESIONAL CON BORDES COMPLETOS
        // =========================================================================

        // Obtener items de la venta
        const items = await getVentaItems(ventaData.id);
        
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
        let totalVenta = 0;

        for (const item of items) {
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
            totalVenta += parseFloat(item.subtotal || 0);
        }

        // Dibujar la tabla profesional
        currentY = drawProfessionalTable(pdf, tableData, tableHeaders, colWidths, margin, currentY, fontName);
        
        currentY += 5;
        
        // =========================================================================
        // FILA DE TOTAL CON ESTILO PROFESIONAL
        // =========================================================================
        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);
        
        // Fondo para la fila de total
        pdf.setFillColor(200, 200, 200);
        pdf.setDrawColor(0, 0, 0);
        pdf.rect(margin, currentY, totalWidth, 8, 'FD');
        
        // Texto "TOTAL DE LA VENTA"
        pdf.text('TOTAL DE LA VENTA:', margin + 5, currentY + 5);
        
        // Monto total alineado a la derecha
        pdf.text(`S/. ${(ventaData.totalVenta || totalVenta).toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
        
        currentY += 15;

        // =========================================================================
        // INFORMACIÓN ADICIONAL
        // =========================================================================
        
        if (currentY > pageHeight - 40) {
            pdf.addPage();
            currentY = 15;
        }
        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text('INFORMACION IMPORTANTE:', margin, currentY);
        currentY += 6;
        
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(8);
        pdf.text('• ESTE DOCUMENTO ES UN COMPROBANTE DE SU COMPRA.', margin + 5, currentY);
        currentY += 4;
        pdf.text('• PARA CUALQUIER RECLAMO O CONSULTA, COMUNIQUESE CON NOSOTROS.', margin + 5, currentY);
        currentY += 4;
        pdf.text('• CONSERVE ESTE DOCUMENTO COMO GARANTIA DE SU COMPRA.', margin + 5, currentY);
        currentY += 4;
        
        if (ventaData.tipoVenta === 'cotizacionAprobada') {
            pdf.text('• ESTA VENTA FUE GENERADA A PARTIR DE UNA COTIZACION APROBADA.', margin + 5, currentY);
            currentY += 4;
        }
        
        currentY += 4;

        // Pie de página
        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        pdf.text(`COMPROBANTE GENERADO EL ${new Date().toLocaleString('es-PE')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        
        // Guardar PDF
        const fechaSufijo = new Date().toISOString().split('T')[0];
        const clienteSufijo = clienteNombre.replace(/\s+/g, '-').toLowerCase();
        const fileName = `venta-${numeroVenta.replace(/[^a-zA-Z0-9]/g, '-')}-${clienteSufijo}-${fechaSufijo}.pdf`;
        pdf.save(fileName);
        
        return true;
        
    } catch (error) {
        console.error('Error al generar PDF de venta:', error);
        throw error;
    }
};

// Función principal exportada
export const generarPDFVentaCompleta = async (ventaId, ventaData = null, clienteData = null) => {
    try {
        // Si no se proporciona ventaData, obtenerla desde Firestore
        let venta = ventaData;
        if (!venta && ventaId) {
            const ventaDoc = await getDoc(doc(db, 'ventas', ventaId));
            if (ventaDoc.exists()) {
                venta = { id: ventaDoc.id, ...ventaDoc.data() };
            } else {
                throw new Error('Venta no encontrada');
            }
        }
        
        if (!venta) {
            throw new Error('No se pudo obtener la informacion de la venta');
        }
        
        // Si no se proporciona clienteData y hay un clienteId, obtenerlo
        let cliente = clienteData;
        if (!cliente && venta.clienteId && venta.clienteId !== 'general') {
            try {
                const clienteDoc = await getDoc(doc(db, 'clientes', venta.clienteId));
                if (clienteDoc.exists()) {
                    cliente = clienteDoc.data();
                }
            } catch (error) {
                console.warn('No se pudo obtener informacion del cliente:', error);
            }
        }
        
        await generarPDFVenta(venta, cliente);
        return `Comprobante de venta generado exitosamente para ${venta.clienteNombre || 'Cliente General'}`;
        
    } catch (error) {
        console.error('Error al generar PDF de venta:', error);
        throw new Error('Error al generar el comprobante de venta. Por favor, intentalo de nuevo.');
    }
};

export default { generarPDFVentaCompleta };