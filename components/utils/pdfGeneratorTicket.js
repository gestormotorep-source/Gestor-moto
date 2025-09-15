// utils/pdfGeneratorTicket.js
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Función para cargar únicamente Courier PS (igual que en pdfGeneratorVentas.js)
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

// Función para obtener detalles del producto
const getProductDetails = async (productoId) => {
    if (!productoId) return {};
    try {
        const docRef = doc(db, "productos", productoId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : {};
    } catch (error) {
        console.error("Error al obtener detalles del producto:", error);
        return {};
    }
};

// Función para obtener etiqueta del método de pago
const getMetodoPagoLabel = (metodo) => {
    const metodos = {
        efectivo: 'EFECTIVO',
        tarjeta_credito: 'T/CREDITO',
        tarjeta_debito: 'T/DEBITO', 
        tarjeta: 'TARJETA',
        yape: 'YAPE',
        plin: 'PLIN',
        transferencia: 'TRANSFER.',
        deposito: 'DEPOSITO',
        cheque: 'CHEQUE',
        mixto: 'MIXTO',
        otro: 'OTRO'
    };
    return metodos[metodo?.toLowerCase()] || metodo?.toUpperCase() || 'EFECTIVO';
};

// Función para crear líneas decorativas
const drawStyledSeparator = (pdf, y, width, fontName, style = 'single') => {
    pdf.setLineWidth(0.1);
    const startX = 4;
    const endX = startX + width;
    
    switch(style) {
        case 'double':
            pdf.line(startX, y, endX, y);
            pdf.line(startX, y + 1, endX, y + 1);
            return y + 4;
        case 'thick':
            pdf.setLineWidth(0.3);
            pdf.line(startX, y, endX, y);
            pdf.setLineWidth(0.1);
            return y + 3;
        case 'dotted':
            // Simular línea punteada con fuente Courier PS
            pdf.setFont(fontName, 'normal');
            pdf.setFontSize(6);
            let dotLine = '';
            for (let i = 0; i < Math.floor(width / 2); i++) {
                dotLine += '.';
            }
            pdf.text(dotLine, startX, y + 1);
            return y + 3;
        default:
            pdf.line(startX, y, endX, y);
            return y + 3;
    }
};

// Función para texto centrado con Courier PS
const drawCenteredText = (pdf, text, y, fontName, width = 72, fontSize = 8, fontStyle = 'normal') => {
    pdf.setFont(fontName, fontStyle);
    pdf.setFontSize(fontSize);
    const textWidth = pdf.getTextWidth(text);
    const x = Math.max(4, (width - textWidth) / 2 + 4);
    pdf.text(text, x, y);
    return y + fontSize * 0.4 + 2;
};

// Función para texto justificado (izq/der) con Courier PS
const drawJustifiedText = (pdf, leftText, rightText, y, fontName, width = 72, fontSize = 7) => {
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(fontSize);
    
    // Texto izquierdo
    pdf.text(leftText, 4, y);
    
    // Texto derecho
    const rightWidth = pdf.getTextWidth(rightText);
    pdf.text(rightText, width - rightWidth + 4, y);
    
    return y + fontSize * 0.4 + 2;
};

// Función principal para generar ticket con Courier PS
const generarTicketVenta = async (ventaData, clienteData = null) => {
    try {
        const { jsPDF } = await import('jspdf');
        
        // Obtener items primero para cálculo preciso de altura
        const items = await getVentaItems(ventaData.id);
        
        // Calcular altura más precisa
        let estimatedHeight = 80; // Encabezado base
        
        // Altura por cada producto
        items.forEach(item => {
            const productDetails = item.nombreProducto || '';
            estimatedHeight += 12; // Altura base del producto
            
            // Altura extra si tiene código
            if (item.productoId) estimatedHeight += 4;
            
            // Altura extra si el nombre es largo
            if (productDetails.length > 35) {
                estimatedHeight += 6; // Línea adicional
            }
        });
        
        // Sección de totales
        estimatedHeight += 25;
        
        // Detalles de pago mixto
        if (ventaData.paymentData?.isMixedPayment) {
            estimatedHeight += (ventaData.paymentData.paymentMethods?.length * 4) || 8;
        }
        
        // Pie de página
        estimatedHeight += 35;
        
        // Margen de seguridad del 20%
        estimatedHeight = Math.ceil(estimatedHeight * 1.2);
        
        // Altura mínima absoluta
        estimatedHeight = Math.max(estimatedHeight, 200);
        
        console.log(`Calculando altura: ${estimatedHeight}mm para ${items.length} productos`);
        
        // Crear PDF con ancho aumentado para evitar cortes
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [80, estimatedHeight] // Ancho aumentado de 58mm a 80mm
        });

        // *** CARGAR FUENTE COURIER PS ***
        const fontName = await loadCourierPSFont(pdf);
        console.log(`Usando fuente: ${fontName}`);

        let currentY = 6;
        const ticketWidth = 72; // Ancho de trabajo aumentado de 50mm a 72mm
        
        console.log('Generando ticket profesional con Courier PS...');

        // =========================================================================
        // ENCABEZADO DE LA EMPRESA CON COURIER PS
        // =========================================================================
        
        // Información de la empresa
        pdf.setTextColor(0, 0, 0);
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(10);
        currentY = drawCenteredText(pdf, 'M&R REPUESTOS', currentY, fontName, ticketWidth, 10, 'bold');
        
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(7);
        currentY = drawCenteredText(pdf, 'RUC: 20123456789', currentY, fontName, ticketWidth, 7);
        currentY = drawCenteredText(pdf, 'DIRECCION DE TU NEGOCIO', currentY, fontName, ticketWidth, 7);
        currentY = drawCenteredText(pdf, 'CIUDAD - PAIS', currentY, fontName, ticketWidth, 7);
        currentY = drawCenteredText(pdf, 'TEL: (01) 123-456-789', currentY, fontName, ticketWidth, 7);
        
        currentY += 3;
        currentY = drawStyledSeparator(pdf, currentY, ticketWidth - 8, fontName, 'double');
        
        // Título del comprobante
        // Título del comprobante
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);
        currentY = drawCenteredText(pdf, 'BOLETA DE VENTA', currentY + 1, fontName, ticketWidth, 9, 'bold');


        // =========================================================================
        // INFORMACIÓN DE LA TRANSACCIÓN CON COURIER PS
        // =========================================================================
        
        const numeroVenta = ventaData.numeroVenta || `BV${String(Date.now()).slice(-6)}`;
        const fechaVenta = ventaData.fechaVenta?.toDate ? 
            ventaData.fechaVenta.toDate().toLocaleDateString('es-PE', { 
                day: '2-digit', month: '2-digit', year: 'numeric' 
            }) : new Date().toLocaleDateString('es-PE', { 
                day: '2-digit', month: '2-digit', year: 'numeric' 
            });
        const horaVenta = new Date().toLocaleTimeString('es-PE', { 
            hour: '2-digit', minute: '2-digit' 
        });
        
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(7);
        
        currentY = drawJustifiedText(pdf, 'BOLETA:', numeroVenta, currentY, fontName, ticketWidth, 7);
        currentY = drawJustifiedText(pdf, 'FECHA:', fechaVenta, currentY, fontName, ticketWidth, 7);
        currentY = drawJustifiedText(pdf, 'HORA:', horaVenta, currentY, fontName, ticketWidth, 7);
        
        // Información del cliente
        currentY += 2;
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(7);
        pdf.text('CLIENTE:', 4, currentY);
        currentY += 3;
        
        const clienteNombre = clienteData ? 
            `${clienteData.nombre} ${clienteData.apellido || ''}`.trim() : 
            ventaData.clienteNombre || 'CLIENTE GENERAL';
        
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(7);
        
        // Dividir nombre si es muy largo
        const maxCharsPerLine = 45; // Aumentado para el nuevo ancho
        if (clienteNombre.length > maxCharsPerLine) {
            const nombreParte1 = clienteNombre.substring(0, maxCharsPerLine);
            const nombreParte2 = clienteNombre.substring(maxCharsPerLine);
            pdf.text(nombreParte1.toUpperCase(), 4, currentY);
            currentY += 3;
            if (nombreParte2.trim()) {
                pdf.text(nombreParte2.trim().toUpperCase(), 4, currentY);
                currentY += 3;
            }
        } else {
            pdf.text(clienteNombre.toUpperCase(), 4, currentY);
            currentY += 3;
        }
        
        if (clienteData?.dni) {
            currentY = drawJustifiedText(pdf, 'DNI:', String(clienteData.dni), currentY, fontName, ticketWidth, 7);
        }
        
        // Método de pago
        let metodoPagoTexto = 'EFECTIVO';
        if (ventaData.paymentData?.isMixedPayment) {
            metodoPagoTexto = 'PAGO MIXTO';
        } else if (ventaData.paymentData?.paymentMethods?.[0]) {
            metodoPagoTexto = getMetodoPagoLabel(ventaData.paymentData.paymentMethods[0].method);
        } else if (ventaData.metodoPago) {
            metodoPagoTexto = getMetodoPagoLabel(ventaData.metodoPago);
        }
        
        currentY += 1;
        currentY = drawJustifiedText(pdf, 'PAGO:', metodoPagoTexto, currentY, fontName, ticketWidth, 7);
        
        currentY += 3;
        currentY = drawStyledSeparator(pdf, currentY, ticketWidth - 8, fontName, 'thick');

        // =========================================================================
        // TABLA DE PRODUCTOS CON FORMATO MEJORADO Y COURIER PS
        // =========================================================================
        
        // Encabezado de productos con mejor espaciado

        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text('DESCRIPCION', 6, currentY + 3);
        pdf.text('CANT', 44, currentY + 3);
        pdf.text('P.U.', 56, currentY + 3);
        pdf.text('TOTAL', 66, currentY + 3);
        currentY += 8;
        
        currentY = drawStyledSeparator(pdf, currentY - 1, ticketWidth - 8, fontName, 'single');

        // Items de la venta con mejor formato y Courier PS
        let totalVenta = 0;
        
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(8);
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const productDetails = await getProductDetails(item.productoId);
            
            // Verificar espacio disponible
            if (currentY > estimatedHeight - 50) {
                estimatedHeight += 50;
                console.log(`Extendiendo altura a: ${estimatedHeight}mm`);
            }
            
            // Código de producto (si existe)
            if (productDetails.codigoTienda) {
                pdf.setFont(fontName, 'normal');
                pdf.setFontSize(6);
                pdf.text(`COD: ${productDetails.codigoTienda}`, 6, currentY);
                currentY += 4;
            }
            
            // Nombre del producto con mejor manejo de texto largo
            const nombreProducto = (item.nombreProducto || 'PRODUCTO').toUpperCase();
            const maxProductLength = 35; // Más caracteres por el ancho aumentado
            
            if (nombreProducto.length > maxProductLength) {
                const palabras = nombreProducto.split(' ');
                let lineaActual = '';
                let lineas = [];
                
                for (const palabra of palabras) {
                    if ((lineaActual + palabra).length > maxProductLength) {
                        if (lineaActual) lineas.push(lineaActual.trim());
                        lineaActual = palabra + ' ';
                    } else {
                        lineaActual += palabra + ' ';
                    }
                }
                if (lineaActual) lineas.push(lineaActual.trim());
                
                // Escribir cada línea del nombre
                for (let j = 0; j < Math.min(lineas.length, 2); j++) {
                    pdf.setFont(fontName, 'bold');
                    pdf.setFontSize(8);
                    pdf.text(lineas[j], 6, currentY);
                    currentY += 3.5;
                }
            } else {
                pdf.setFont(fontName, 'bold');
                pdf.setFontSize(8);
                pdf.text(nombreProducto, 6, currentY);
                currentY += 3.5;
            }
            
            // Cantidad, precio y subtotal en formato tabular
            const cantidad = String(item.cantidad || 0);
            const precioUnitario = parseFloat(item.precioVentaUnitario || 0).toFixed(2);
            const subtotal = parseFloat(item.subtotal || 0).toFixed(2);
            
            pdf.setFont(fontName, 'normal');
            pdf.setFontSize(8);
            
            // Cantidad centrada en su columna
            const cantWidth = pdf.getTextWidth(cantidad);
            pdf.text(cantidad, 50 - cantWidth/2, currentY);
            
            // Precio unitario
            pdf.text(precioUnitario, 54, currentY);
            
            // Subtotal alineado a la derecha
            const subtotalWidth = pdf.getTextWidth(subtotal);
            pdf.text(subtotal, 77 - subtotalWidth, currentY);
            
            currentY += 4;
            totalVenta += parseFloat(item.subtotal || 0);
            
            // Separador entre productos (solo si no es el último)
            if (i < items.length - 1) {
                currentY = drawStyledSeparator(pdf, currentY, ticketWidth - 8, fontName, 'dotted');
                currentY += 1;
            }
        }
        
        currentY += 3;
        currentY = drawStyledSeparator(pdf, currentY, ticketWidth - 8, fontName, 'double');

        // =========================================================================
        // SECCIÓN DE TOTAL CON MEJOR FORMATO Y COURIER PS
        // =========================================================================
        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(12);
        
        const totalFinal = (ventaData.totalVenta || totalVenta).toFixed(2);
        pdf.text('TOTAL S/.', 8, currentY + 6);
        
        const totalWidth = pdf.getTextWidth(totalFinal);
        pdf.text(totalFinal, 68 - totalWidth, currentY + 6);
        
        currentY += 12;
        pdf.setTextColor(0, 0, 0); // Volver a negro

        // Detalle de pago mixto si aplica
        if (ventaData.paymentData?.isMixedPayment && ventaData.paymentData.paymentMethods) {
            currentY += 2;
            pdf.setFont(fontName, 'bold');
            pdf.setFontSize(7);
            pdf.text('DETALLE DE PAGO:', 4, currentY);
            currentY += 3;
            
            pdf.setFont(fontName, 'normal');
            pdf.setFontSize(6);
            
            ventaData.paymentData.paymentMethods
                .filter(pm => pm.amount > 0)
                .forEach(pm => {
                    const metodo = getMetodoPagoLabel(pm.method);
                    const monto = pm.amount.toFixed(2);
                    currentY = drawJustifiedText(pdf, metodo, `S/. ${monto}`, currentY, fontName, ticketWidth, 6);
                });
            
            currentY += 2;
        }

        currentY = drawStyledSeparator(pdf, currentY, ticketWidth - 8, fontName, 'double');

        // =========================================================================
        // PIE DE PÁGINA CON COURIER PS
        // =========================================================================
        
        currentY += 4;
        
        // Mensaje de agradecimiento
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);
        currentY = drawCenteredText(pdf, '¡GRACIAS POR SU COMPRA!', currentY, fontName, ticketWidth, 9, 'bold');
        
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(6);
        currentY = drawCenteredText(pdf, 'Su preferencia es importante para nosotros', currentY, fontName, ticketWidth, 6);
        
        currentY += 4;
        
        // Información de contacto
        pdf.setFontSize(6);
        currentY = drawCenteredText(pdf, 'WhatsApp: 999-123-456', currentY, fontName, ticketWidth, 6);
        currentY = drawCenteredText(pdf, 'Email: ventas@tuempresa.com', currentY, fontName, ticketWidth, 6);
        
        currentY += 3;
        
        // Información técnica del ticket
        const fechaGeneracion = new Date().toLocaleString('es-PE', {
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
        
        pdf.setFontSize(5);
        pdf.setFont(fontName, 'normal');
        currentY = drawCenteredText(pdf, `Generado: ${fechaGeneracion}`, currentY, fontName, ticketWidth, 5);

        console.log(`Ticket generado correctamente con ${fontName}. Altura final utilizada: ${currentY}mm de ${estimatedHeight}mm disponibles`);
        
        // Si se excedió la altura estimada, mostrar advertencia
        if (currentY > estimatedHeight - 10) {
            console.warn('El contenido excedió la altura estimada. Considerar aumentar el margen de seguridad.');
        }
        
        // Guardar con nombre descriptivo
        const fechaSufijo = new Date().toISOString().split('T')[0];
        const clienteSufijo = clienteNombre.replace(/\s+/g, '-').toLowerCase().substring(0, 8);
        const fileName = `ticket-${numeroVenta}-${clienteSufijo}-${fechaSufijo}.pdf`;
        
        pdf.save(fileName);
        
        return true;
        
    } catch (error) {
        console.error('Error al generar ticket:', error);
        throw error;
    }
};

// Función principal exportada
export const generarTicketVentaCompleta = async (ventaId, ventaData = null, clienteData = null) => {
    try {
        console.log('Iniciando generación de ticket con Courier PS...', { 
            ventaId, 
            hasVentaData: !!ventaData, 
            hasClienteData: !!clienteData 
        });
        
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
            throw new Error('No se pudo obtener la información de la venta');
        }
        
        let cliente = clienteData;
        if (!cliente && venta.clienteId && venta.clienteId !== 'general') {
            try {
                const clienteDoc = await getDoc(doc(db, 'clientes', venta.clienteId));
                if (clienteDoc.exists()) {
                    cliente = clienteDoc.data();
                }
            } catch (error) {
                console.warn('No se pudo obtener información del cliente:', error);
            }
        }
        
        await generarTicketVenta(venta, cliente);
        return `Ticket generado exitosamente con tipografía Courier PS para ${venta.clienteNombre || 'Cliente General'}`;
        
    } catch (error) {
        console.error('Error al generar ticket:', error);
        throw new Error('Error al generar el ticket. Por favor, inténtalo de nuevo.');
    }
};

export default { generarTicketVentaCompleta };