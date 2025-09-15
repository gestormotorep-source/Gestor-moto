// utils/pdfGeneratorCotizaciones.js - VERSIÓN CON ESTILO PROFESIONAL
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Función para cargar únicamente Courier PS (igual que ventas)
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

// FUNCIÓN CORREGIDA PARA MANEJAR FECHAS DE FIRESTORE
const formatFirestoreDate = (timestamp) => {
    try {
        if (!timestamp) {
            return new Date().toLocaleDateString('es-PE');
        }

        // Si es un Timestamp de Firestore
        if (timestamp.toDate && typeof timestamp.toDate === 'function') {
            return timestamp.toDate().toLocaleDateString('es-PE');
        }
        
        // Si es un objeto con seconds y nanoseconds (formato Firestore)
        if (timestamp.seconds !== undefined) {
            return new Date(timestamp.seconds * 1000).toLocaleDateString('es-PE');
        }
        
        // Si es una fecha estándar
        if (timestamp instanceof Date) {
            return timestamp.toLocaleDateString('es-PE');
        }
        
        // Si es un string o número, intentar parsearlo
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('es-PE');
        }
        
        // Si no se puede parsear, devolver fecha actual
        console.warn('No se pudo parsear la fecha:', timestamp);
        return new Date().toLocaleDateString('es-PE');
        
    } catch (error) {
        console.error('Error formateando fecha:', error);
        return new Date().toLocaleDateString('es-PE');
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

// FUNCIÓN CORREGIDA PARA OBTENER DATOS DEL EMPLEADO
const getEmpleadoDetails = async (empleadoId) => {
    if (!empleadoId) return null;
    
    try {
        const empleadoRef = doc(db, 'empleado', empleadoId);
        const empleadoSnap = await getDoc(empleadoRef);
        
        if (empleadoSnap.exists()) {
            const data = empleadoSnap.data();
            return {
                nombre: data.nombre || '',
                apellido: data.apellido || '',
                puesto: data.puesto || '',
                nombreCompleto: `${data.nombre || ''} ${data.apellido || ''}`.trim()
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error al obtener datos del empleado:', error);
        return null;
    }
};

// Función para obtener los items de la cotización
const getCotizacionItems = async (cotizacionId) => {
    try {
        const itemsRef = collection(db, 'cotizaciones', cotizacionId, 'itemsCotizacion');
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
        console.error('Error al obtener items de la cotización:', error);
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

// Función para obtener etiqueta del estado de cotización
const getEstadoCotizacionLabel = (estado) => {
    const estados = {
        pendiente: 'PENDIENTE',
        borrador: 'BORRADOR',
        confirmada: 'CONFIRMADA',
        cancelada: 'CANCELADA',
        enviada: 'ENVIADA',
        aprobada: 'APROBADA',
        rechazada: 'RECHAZADA'
    };
    return estados[estado] || estado?.toUpperCase() || 'PENDIENTE';
};

// Función para dibujar tabla con bordes completos estilo profesional (igual que ventas)
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
    pdf.setFillColor(200, 200, 200); // Mismo gris que "TOTAL DE LA COTIZACION"
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

// FUNCIÓN PRINCIPAL CORREGIDA PARA GENERAR EL PDF DE COTIZACIÓN CON ESTILO PROFESIONAL
const generarPDFCotizacion = async (cotizacionData, clienteData = null) => {
    try {
        const { jsPDF } = await import('jspdf');
        
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4',
        });
        
        // Cargar fuente Courier PS (igual que ventas)
        const fontName = await loadCourierPSFont(pdf);
        
        const pageWidth = pdf.internal.pageSize.width;
        const pageHeight = pdf.internal.pageSize.height;
        const margin = 10;
        const totalWidth = pageWidth - 2 * margin;
        
        let currentY = 15;

        // =========================================================================
        // ENCABEZADO LIMPIO - DISTRIBUIDO EN DOS COLUMNAS SIN FONDO GRIS (IGUAL QUE VENTAS)
        // =========================================================================

        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(12);
        pdf.setTextColor(0, 0, 0);
        
        // Título de la empresa (izquierda) - TODO EN MAYÚSCULAS
        pdf.text('MOTORES & REPUESTOS SAC', margin, currentY);
        
        // Número de cotización (derecha) - TODO EN MAYÚSCULAS
        const numeroCotizacion = cotizacionData.numeroCotizacion || `COT-${cotizacionData.id?.slice(-8) || 'N/A'}`;
        pdf.text(`COTIZACION NRO. ${numeroCotizacion}`, pageWidth - margin, currentY, { align: 'right' });
        currentY += 8;

        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        
        // COLUMNA IZQUIERDA - Información principal
        pdf.text('R.U.C: 20123456789', margin, currentY);
        pdf.text('EMAIL: MOTORESREPUESTOS@MAIL.COM', margin, currentY + 4);
        pdf.text('COTIZACION GENERADA EN TIENDA AV.LOS MOTORES 456 SAN BORJA', margin, currentY + 8);
        
        // COLUMNA DERECHA - Información de contacto
        pdf.text('DIRECCION: AV. LOS MOTORES 456, SAN BORJA', pageWidth / 2, currentY);
        pdf.text('TELEFONO: 999 888 777', pageWidth / 2, currentY + 4);
        
        currentY += 18;
        
        // INFORMACIÓN DE LA COTIZACIÓN MEJORADA
        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        
        // CORREGIR EL MANEJO DE FECHAS
        const fechaCotizacion = formatFirestoreDate(cotizacionData.fechaCreacion);
        
        pdf.text('FECHA DE COTIZACION:', margin, currentY);
        pdf.text(fechaCotizacion, margin + 35, currentY);

        pdf.text('ESTADO:', pageWidth / 2, currentY);
        pdf.text(getEstadoCotizacionLabel(cotizacionData.estado), pageWidth / 2 + 15, currentY);
        currentY += 5;

        // Método de pago preferido
        pdf.text('METODO DE PAGO:', margin, currentY);
        const metodoPagoTexto = getMetodoPagoLabel(cotizacionData.metodoPago);
        pdf.text(metodoPagoTexto, margin + 35, currentY);

        // Validez de la cotización en la misma línea
        if (cotizacionData.validezDias) {
            pdf.text('VALIDA POR:', pageWidth / 2, currentY);
            pdf.text(`${cotizacionData.validezDias} DIAS`, pageWidth / 2 + 25, currentY);
        }
        currentY += 5;

        // Línea divisora
        pdf.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 5;

        // =========================================================================
        // INFORMACIÓN DEL CLIENTE (IGUAL QUE VENTAS)
        // =========================================================================

        pdf.setFontSize(8);
        pdf.setFont(fontName, 'bold');
        pdf.text('CLIENTE:', margin, currentY);
        pdf.setFont(fontName, 'normal');
        
        const clienteNombre = clienteData ? 
            `${clienteData.nombre} ${clienteData.apellido || ''}` : 
            cotizacionData.clienteNombre || 'Cliente General';
        pdf.text(clienteNombre.toUpperCase(), margin + 15, currentY);
        currentY += 5;
        
        if (clienteData && clienteData.dni) {
            pdf.setFont(fontName, 'bold');
            pdf.text('DNI:', margin, currentY);
            pdf.setFont(fontName, 'normal');
            pdf.text(String(clienteData.dni), margin + 15, currentY);
            currentY += 5;
        }

        // CORREGIR LA INFORMACIÓN DEL EMPLEADO
        // Usar empleadoAsignadoId para obtener los datos del empleado
        if (cotizacionData.empleadoAsignadoId) {
            const empleadoData = await getEmpleadoDetails(cotizacionData.empleadoAsignadoId);
            
            if (empleadoData) {
                pdf.setFont(fontName, 'bold');
                pdf.text('EMPLEADO ASIGNADO:', margin, currentY);
                pdf.setFont(fontName, 'normal');
                pdf.text(empleadoData.nombreCompleto.toUpperCase(), margin + 40, currentY);
                currentY += 5;
            }
        }

        if (cotizacionData.placaMoto) {
            pdf.setFont(fontName, 'bold');
            pdf.text('PLACA MOTO:', pageWidth / 2, currentY - 5);
            pdf.setFont(fontName, 'normal');
            pdf.text(cotizacionData.placaMoto.toUpperCase(), pageWidth / 2 + 25, currentY - 5);
        }

        if (cotizacionData.observaciones) {
            pdf.setFont(fontName, 'bold');
            pdf.text('OBSERVACIONES:', margin, currentY);
            pdf.setFont(fontName, 'normal');
            // Dividir texto largo en múltiples líneas si es necesario
            const maxWidth = totalWidth - 30;
            const lines = pdf.splitTextToSize(cotizacionData.observaciones.toUpperCase(), maxWidth);
            pdf.text(lines, margin + 30, currentY);
            currentY += lines.length * 4;
        }
        
        currentY += 5;
        
        // =========================================================================
        // TABLA PROFESIONAL CON BORDES COMPLETOS (IGUAL QUE VENTAS)
        // =========================================================================

        // Obtener items de la cotización
        const items = await getCotizacionItems(cotizacionData.id);
        
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
        let totalCotizacion = 0;

        // Procesar items
        for (const item of items) {
            // Obtener los detalles del producto
            const productDetails = await getProductDetails(item.productoId);
            
            // Datos del item - TODO EN MAYÚSCULAS
            const itemRow = [
                (productDetails.codigoTienda || item.codigoTienda || 'N/A').toString().toUpperCase(),
                (item.nombreProducto || 'N/A').toString().toUpperCase(),
                (productDetails.color || item.color || 'N/A').toString().toUpperCase(),
                (productDetails.marca || item.marca || 'N/A').toString().toUpperCase(),
                (productDetails.ubicacion || 'N/A').toString().toUpperCase(),
                (productDetails.medida || 'N/A').toString().toUpperCase(),
                String(item.cantidad || 0),
                `${parseFloat(item.precioVentaUnitario || 0).toFixed(2)}`,
                `${parseFloat(item.subtotal || 0).toFixed(2)}`
            ];
            
            tableData.push(itemRow);
            totalCotizacion += parseFloat(item.subtotal || 0);
        }

        // Dibujar la tabla profesional
        currentY = drawProfessionalTable(pdf, tableData, tableHeaders, colWidths, margin, currentY, fontName);
        
        currentY += 5;

        // =========================================================================
        // FILA DE TOTAL CON ESTILO PROFESIONAL (IGUAL QUE VENTAS)
        // =========================================================================
        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(9);
        
        // Fondo para la fila de total
        pdf.setFillColor(200, 200, 200);
        pdf.setDrawColor(0, 0, 0);
        pdf.rect(margin, currentY, totalWidth, 8, 'FD');
        
        // Texto "TOTAL DE LA COTIZACION"
        pdf.text('TOTAL DE LA COTIZACION:', margin + 5, currentY + 5);
        
        // Monto total alineado a la derecha
        pdf.text(`S/. ${(cotizacionData.totalCotizacion || totalCotizacion).toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
        
        currentY += 15;
        
        // Resetear color del texto
        pdf.setTextColor(0, 0, 0);

        // =========================================================================
        // INFORMACIÓN ADICIONAL DE COTIZACIÓN (MEJORADA)
        // =========================================================================
        
        if (currentY > pageHeight - 50) {
            pdf.addPage();
            currentY = 15;
        }
        
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8);
        pdf.text('TERMINOS Y CONDICIONES:', margin, currentY);
        currentY += 6;
        
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(8);
        pdf.text('• ESTA COTIZACION TIENE UNA VALIDEZ DE 7 DIAS DESDE LA FECHA DE EMISION.', margin + 5, currentY);
        currentY += 4;
        pdf.text('• LOS PRECIOS ESTAN SUJETOS A CAMBIOS SIN PREVIO AVISO.', margin + 5, currentY);
        currentY += 4;
        pdf.text('• PARA CONFIRMAR SU PEDIDO, COMUNIQUESE CON NOSOTROS.', margin + 5, currentY);
        currentY += 4;
        
        if (cotizacionData.validezDias) {
            pdf.text(`• ESTA COTIZACION ES VALIDA POR ${cotizacionData.validezDias} DIAS.`, margin + 5, currentY);
            currentY += 4;
        }
        
        if (cotizacionData.estado === 'confirmada') {
            pdf.text('• ESTA COTIZACION HA SIDO CONFIRMADA Y CONVERTIDA EN VENTA.', margin + 5, currentY);
            currentY += 4;
        }
        
        currentY += 4;

        // Pie de página
        pdf.setFontSize(8);
        pdf.setFont(fontName, 'normal');
        pdf.text(`COTIZACION GENERADA EL ${new Date().toLocaleString('es-PE')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        
        // Guardar PDF
        const fechaSufijo = new Date().toISOString().split('T')[0];
        const clienteSufijo = clienteNombre.replace(/\s+/g, '-').toLowerCase();
        const fileName = `cotizacion-${numeroCotizacion.replace(/[^a-zA-Z0-9]/g, '-')}-${clienteSufijo}-${fechaSufijo}.pdf`;
        pdf.save(fileName);
        
        return true;
        
    } catch (error) {
        console.error('Error al generar PDF de cotización:', error);
        throw error;
    }
};

// FUNCIÓN PRINCIPAL EXPORTADA CORREGIDA
export const generarPDFCotizacionCompleta = async (cotizacionId, cotizacionData = null, clienteData = null) => {
    try {
        // Si no se proporciona cotizacionData, obtenerla desde Firestore
        let cotizacion = cotizacionData;
        if (!cotizacion && cotizacionId) {
            const cotizacionDoc = await getDoc(doc(db, 'cotizaciones', cotizacionId));
            if (cotizacionDoc.exists()) {
                cotizacion = { id: cotizacionDoc.id, ...cotizacionDoc.data() };
            } else {
                throw new Error('Cotización no encontrada');
            }
        }
        
        if (!cotizacion) {
            throw new Error('No se pudo obtener la información de la cotización');
        }
        
        // CORREGIR LA REFERENCIA A LA COLECCIÓN DE CLIENTES
        let cliente = clienteData;
        if (!cliente && cotizacion.clienteId && cotizacion.clienteId !== 'general') {
            try {
                const clienteDoc = await getDoc(doc(db, 'cliente', cotizacion.clienteId)); // CAMBIÉ 'clientes' por 'cliente'
                if (clienteDoc.exists()) {
                    cliente = clienteDoc.data();
                }
            } catch (error) {
                console.warn('No se pudo obtener información del cliente:', error);
            }
        }
        
        await generarPDFCotizacion(cotizacion, cliente);
        return `Cotización generada exitosamente para ${cotizacion.clienteNombre || 'Cliente General'}`;
        
    } catch (error) {
        console.error('Error al generar PDF de cotización:', error);
        throw new Error('Error al generar la cotización. Por favor, inténtalo de nuevo.');
    }
};

export default { generarPDFCotizacionCompleta };