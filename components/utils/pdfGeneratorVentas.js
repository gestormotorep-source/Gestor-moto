    // utils/pdfGeneratorVentas.js
    import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
    import { db } from '../../lib/firebase';

    const EMPRESA = {
        nombre: 'GOYO MOTOR\'S',                                 
        email: 'CONTATO.GOYOMOTORS@GMAIL.COM',       
        direccion: 'AV. LOS HEROES 778 SAN JUAN DE MIRAFLORES',       
        telefono: '993393609',              
        logoPath: '/logo.png',                              };

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
                    const response = await fetch(fontPath);
                    if (response.ok) {
                        const fontData = await response.arrayBuffer();
                        if (fontData.byteLength === 0) continue;

                        const fontBase64 = arrayBufferToBase64(fontData);
                        try {
                            const fileName = fontPath.split('/').pop();
                            pdf.addFileToVFS(fileName, fontBase64);
                            pdf.addFont(fileName, 'CourierPS', 'normal');
                            pdf.addFont(fileName, 'CourierPS', 'bold');
                            return 'CourierPS';
                        } catch (fontRegisterError) {
                            continue;
                        }
                    }
                } catch (fetchError) {
                    continue;
                }
            }
            return 'courier';
        } catch (error) {
            console.error('Error cargando Courier PS:', error.message);
            return 'courier';
        }
    };

    // Función para cargar el logo de la empresa como base64
    const loadLogoImage = async () => {
        try {
            const response = await fetch(EMPRESA.logoPath);
            if (!response.ok) {
                console.warn('No se pudo cargar el logo desde', EMPRESA.logoPath);
                return null;
            }
            const imageData = await response.arrayBuffer();
            const base64 = arrayBufferToBase64(imageData);
            return `data:image/png;base64,${base64}`;
        } catch (error) {
            console.warn('Error cargando el logo:', error.message);
            return null;
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
            }
            return {};
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
            return itemsSnapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() }));
        } catch (error) {
            console.error('Error al obtener items de la venta:', error);
            return [];
        }
    };

    // Función para obtener devoluciones aprobadas de la venta (con sus items)
    // NOTA: paraleliza la lectura de itemsDevolucion de cada devolución con Promise.all
    // en vez de un for...of secuencial, para reducir el tiempo antes de poder
    // empezar a dibujar el PDF.
    const getDevolucionesVenta = async (ventaId) => {
        try {
            const qDev = query(
                collection(db, 'devoluciones'),
                where('ventaId', '==', ventaId),
                where('estado', '==', 'aprobada')
            );
            const devSnap = await getDocs(qDev);

            const devoluciones = await Promise.all(devSnap.docs.map(async (devDoc) => {
                const devData = { id: devDoc.id, ...devDoc.data() };
                const itemsDevSnap = await getDocs(
                    collection(db, 'devoluciones', devDoc.id, 'itemsDevolucion')
                );
                devData.items = itemsDevSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                return devData;
            }));

            devoluciones.sort((a, b) => {
                const fa = a.fechaSolicitud?.toDate ? a.fechaSolicitud.toDate() : new Date(0);
                const fb = b.fechaSolicitud?.toDate ? b.fechaSolicitud.toDate() : new Date(0);
                return fb - fa;
            });

            return devoluciones;
        } catch (error) {
            console.error('Error al obtener devoluciones de la venta:', error);
            return [];
        }
    };

    // Función para obtener abonos de la venta (si es venta a crédito)
    const getAbonosVenta = async (ventaId) => {
        try {
            const qAbonos = query(collection(db, 'abonos'), where('ventaId', '==', ventaId));
            const abonosSnap = await getDocs(qAbonos);
            const abonos = abonosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            abonos.sort((a, b) => {
                const fa = a.fecha?.toDate ? a.fecha.toDate() : new Date(0);
                const fb = b.fecha?.toDate ? b.fecha.toDate() : new Date(0);
                return fa - fb;
            });
            return abonos;
        } catch (error) {
            console.error('Error al obtener abonos de la venta:', error);
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
            ventaDirecta: 'VENTA DIRECTA',
            cotizacionAprobada: 'COTIZACION APROBADA',
            abono: 'ABONO A CREDITO',
            credito: 'VENTA A CREDITO'
        };
        return tipos[tipo] || tipo?.toUpperCase() || 'VENTA DIRECTA';
    };

    // Determina el estado de devolución de un item específico, dado el set de devoluciones
    // Retorna: null (sin devolución), 'parcial', 'total'
    //
    // NOTA IMPORTANTE: cuando un mismo producto (mismo productoId, incluso mismo loteId)
    // aparece varias veces en una venta (ej. "VARIOS REPUESTOS" agregado 3 veces con
    // distinto nombrePersonalizado), comparar solo por productoId+loteId hace que TODOS
    // esos items hermanos se marquen como devueltos aunque solo se haya devuelto uno.
    // Por eso usamos como fuente de verdad el campo ventaItemId, que vincula la
    // devolución al item EXACTO de itemsVenta (guardado al crear la devolución en
    // pages/devoluciones/nueva.js). Si una devolución antigua no tiene ventaItemId,
    // caemos al comportamiento anterior por productoId+loteId como fallback.
    const getEstadoDevolucionItem = (item, devolucionesVenta) => {
        let cantidadDevuelta = 0;

        devolucionesVenta.forEach(dev => {
            (dev.items || []).forEach(devItem => {
                if (devItem.ventaItemId) {
                    // Match exacto: solo afecta al item específico de la venta
                    if (devItem.ventaItemId === item.id) {
                        cantidadDevuelta += parseFloat(devItem.cantidadADevolver || 0);
                    }
                    return;
                }
                // Fallback para devoluciones antiguas sin ventaItemId
                const mismoProducto = devItem.productoId === item.productoId;
                const mismoLote = !item.loteId || !devItem.loteId || devItem.loteId === item.loteId;
                if (mismoProducto && mismoLote) {
                    cantidadDevuelta += parseFloat(devItem.cantidadADevolver || 0);
                }
            });
        });

        if (cantidadDevuelta <= 0) return null;
        if (cantidadDevuelta >= parseFloat(item.cantidad || 0)) return 'total';
        return 'parcial';
    };

    // Función para dibujar tabla con bordes completos estilo profesional
    // Soporta una columna extra de estado de devolución (devEstado) por fila.
    //
    // FIX: antes el texto largo se truncaba carácter por carácter hasta que entraba
    // en una sola línea (slice(0, -1) en bucle), perdiendo info (ej. nombres de
    // producto largos). Ahora cada celda usa pdf.splitTextToSize para hacer wrap
    // a varias líneas, y la altura de la fila se calcula dinámicamente según la
    // celda con más líneas. El texto se centra verticalmente dentro de la fila.
    const drawProfessionalTable = (pdf, data, headers, colWidths, startX, startY, fontName, pageHeight, margin, rowMeta = [], logoBase64 = null, pageWidth = 210) => {
        let currentY = startY;
        const headerLineHeight = 6;
        const padding = 1;
        const lineHeightText = 3.2; // alto de cada línea de texto dentro de una celda
        const minRowHeight = 6;

        const colPositions = [startX];
        for (let i = 0; i < colWidths.length - 1; i++) {
            colPositions.push(colPositions[i] + colWidths[i]);
        }

        const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);

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
                const maxWidth = width - (padding * 2);
                while (pdf.getTextWidth(displayText) > maxWidth && displayText.length > 1) {
                    displayText = displayText.slice(0, -1);
                }
                pdf.text(displayText, x + width / 2, y + headerLineHeight / 2 + 1, { align: 'center' });
            });

            return y + headerLineHeight;
        };

        currentY = drawHeader(currentY);

        pdf.setTextColor(0, 0, 0);
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(7);

        data.forEach((row, rowIndex) => {
            const meta = rowMeta[rowIndex] || {};

            // Pre-calcular líneas envueltas por celda y la altura final de la fila
            const wrappedCells = row.map((cellData, colIndex) => {
                const width = colWidths[colIndex];
                const maxWidth = width - (padding * 2);
                const text = String(cellData || '');
                return pdf.splitTextToSize(text, maxWidth);
            });

            const maxLines = Math.max(...wrappedCells.map(lines => lines.length), 1);
            const rowH = Math.max(minRowHeight, maxLines * lineHeightText + 2.5);

            // Salto de página si no entra la fila
            if (currentY + rowH > pageHeight - margin - 15) {
                pdf.addPage();
                drawWatermark(pdf, logoBase64, pageWidth, pageHeight);
                currentY = margin;
                currentY = drawHeader(currentY);
                pdf.setFont(fontName, 'normal');
                pdf.setFontSize(7);
            }

            // Color de fondo: rojo claro si devuelto total, amarillo claro si parcial, alterno normal si no
            if (meta.devEstado === 'total') {
                pdf.setFillColor(252, 226, 226);
                pdf.rect(startX, currentY, tableWidth, rowH, 'F');
            } else if (meta.devEstado === 'parcial') {
                pdf.setFillColor(255, 243, 205);
                pdf.rect(startX, currentY, tableWidth, rowH, 'F');
            } else if (rowIndex % 2 === 0) {
                pdf.setFillColor(248, 248, 248);
                pdf.rect(startX, currentY, tableWidth, rowH, 'F');
            }

            pdf.rect(startX, currentY, tableWidth, rowH, 'S');

            row.forEach((cellData, colIndex) => {
                const x = colPositions[colIndex];
                const width = colWidths[colIndex];

                pdf.line(x, currentY, x, currentY + rowH);
                if (colIndex === row.length - 1) {
                    pdf.line(x + width, currentY, x + width, currentY + rowH);
                }

                const lines = wrappedCells[colIndex];

                let textAlign = 'left';
                let textX = x + padding;
                if (colIndex === 7) { // CANT.
                    textAlign = 'center';
                    textX = x + width / 2;
                } else if (colIndex >= 8) { // P.U. y P.T.
                    textAlign = 'right';
                    textX = x + width - padding;
                }

                // Centrar verticalmente el bloque de líneas dentro de la celda
                const textBlockHeight = lines.length * lineHeightText;
                const startTextY = currentY + (rowH - textBlockHeight) / 2 + lineHeightText - 0.5;

                lines.forEach((lineText, lineIndex) => {
                    pdf.text(lineText, textX, startTextY + (lineIndex * lineHeightText), { align: textAlign });
                });
            });

            currentY += rowH;
        });

        return currentY;
    };

    // Dibuja el encabezado de empresa con logo, en cada página que lo necesite
    const drawEmpresaHeader = (pdf, fontName, logoBase64, margin, pageWidth) => {
        let y = 15;
        const logoSize = 18;

        if (logoBase64) {
            try {
                pdf.addImage(logoBase64, 'PNG', margin, y - 10, logoSize, logoSize, 'logoEmpresa');
            } catch (e) {
                console.warn('No se pudo dibujar el logo:', e.message);
            }
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
            // jsPDF no tiene setGlobalAlpha nativo, usamos GState
            const gState = new pdf.GState({ opacity: 0.08 });
            pdf.setGState(gState);
            const size = 120; // tamaño grande centrado
            const x = (pageWidth - size) / 2;
            const y = (pageHeight - size) / 2;
            pdf.addImage(logoBase64, 'PNG', x, y, size, size, 'logoEmpresa');
            // Restaurar opacidad normal
            const gStateNormal = new pdf.GState({ opacity: 1 });
            pdf.setGState(gStateNormal);
            pdf.restoreGraphicsState();
        } catch (e) {
            console.warn('No se pudo dibujar marca de agua:', e.message);
        }
    };

    // Función para dibujar fila de información clave-valor en dos columnas
    const drawInfoLine = (pdf, fontName, label, value, x, y) => {
        pdf.setFont(fontName, 'bold');
        pdf.text(label, x, y);
        pdf.setFont(fontName, 'normal');
        const labelWidth = pdf.getTextWidth(label) + 2;
        pdf.text(String(value || 'N/A'), x + labelWidth, y);
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

            // Fuente y logo se cargan en paralelo; ninguno depende del otro
            const [fontName, logoBase64] = await Promise.all([
                loadCourierPSFont(pdf),
                loadLogoImage()
            ]);

            const pageWidth = pdf.internal.pageSize.width;
            const pageHeight = pdf.internal.pageSize.height;
            drawWatermark(pdf, logoBase64, pageWidth, pageHeight);


            const margin = 10;
            const totalWidth = pageWidth - 2 * margin;

            let currentY = drawEmpresaHeader(pdf, fontName, logoBase64, margin, pageWidth);

            // Número de venta (derecha)
            pdf.setFont(fontName, 'bold');
            pdf.setFontSize(12);
            const numeroVenta = ventaData.numeroVenta || `V-${ventaData.id?.slice(-8) || 'N/A'}`;
            pdf.text(`VENTA NRO. ${numeroVenta}`, pageWidth - margin, currentY, { align: 'right' });
            currentY += 9;

            pdf.setFontSize(8);
pdf.setFont(fontName, 'normal');

// COLUMNA IZQUIERDA: DIRECCION + EMAIL
pdf.text(`DIRECCION: ${EMPRESA.direccion}`, margin, currentY);
pdf.text(`EMAIL: ${EMPRESA.email}`, margin, currentY + 4);

// COLUMNA DERECHA: TELEFONO
pdf.text(`TELEFONO: ${EMPRESA.telefono}`, pageWidth * 0.6, currentY);

currentY += 13;

// Estado de devolución
const estadoDevVenta = ventaData.estadoDevolucion;

const fechaVenta = ventaData.fechaVenta?.toDate ?
    ventaData.fechaVenta.toDate().toLocaleDateString('es-PE') :
    (ventaData.fechaVenta ? new Date(ventaData.fechaVenta).toLocaleDateString('es-PE') : new Date().toLocaleDateString('es-PE'));

drawInfoLine(pdf, fontName, 'FECHA DE VENTA: ', fechaVenta, margin, currentY);
drawInfoLine(pdf, fontName, 'TIPO DE VENTA: ', getTipoVentaLabel(ventaData.tipoVenta), pageWidth * 0.6, currentY);
currentY += 5;

let metodoPagoTexto = '';
let esPagoMixto = false;
if (ventaData.paymentData && ventaData.paymentData.isMixedPayment && ventaData.paymentData.paymentMethods) {
    const metodosActivos = ventaData.paymentData.paymentMethods
        .filter(pm => pm.amount > 0)
        .map(pm => `${getMetodoPagoLabel(pm.method)}: S/. ${pm.amount.toFixed(2)}`)
        .join(', ');
    metodoPagoTexto = metodosActivos || 'PAGO MIXTO';
    esPagoMixto = true;
} else if (ventaData.paymentData && ventaData.paymentData.paymentMethods && ventaData.paymentData.paymentMethods.length > 0) {
    metodoPagoTexto = getMetodoPagoLabel(ventaData.paymentData.paymentMethods[0].method);
} else {
    metodoPagoTexto = getMetodoPagoLabel(ventaData.metodoPago);
}

let estadoTexto;
if (estadoDevVenta === 'devuelta') estadoTexto = 'DEVUELTA';
else if (estadoDevVenta === 'parcial') estadoTexto = 'DEVOLUCION PARCIAL';
else if (ventaData.estado === 'completada') estadoTexto = 'COMPLETADA';
else if (ventaData.estado === 'anulada') estadoTexto = 'ANULADA';
else estadoTexto = ventaData.estado?.toUpperCase() || 'PENDIENTE';

pdf.setFont(fontName, 'normal');
const anchoMetodoPago = pdf.getTextWidth(`METODO DE PAGO: ${metodoPagoTexto}`);
const espacioDisponible = (pageWidth / 2) - margin - 4;

if (esPagoMixto || anchoMetodoPago > espacioDisponible) {
    drawInfoLine(pdf, fontName, 'METODO DE PAGO: ', metodoPagoTexto, margin, currentY);
    currentY += 5;
    drawInfoLine(pdf, fontName, 'ESTADO: ', estadoTexto, margin, currentY);
    currentY += 5;
} else {
    drawInfoLine(pdf, fontName, 'METODO DE PAGO: ', metodoPagoTexto, margin, currentY);
    drawInfoLine(pdf, fontName, 'ESTADO: ', estadoTexto, pageWidth * 0.6, currentY);
    currentY += 5;
}

pdf.line(margin, currentY, pageWidth - margin, currentY);
currentY += 5;

// =========================================================================
// INFORMACIÓN DEL CLIENTE
// =========================================================================

pdf.setFontSize(8);
const clienteNombre = clienteData ?
    `${clienteData.nombre} ${clienteData.apellido || ''}` :
    ventaData.clienteNombre || 'Cliente General';

const tieneEmpleado = !!ventaData.empleadoAsignadoNombre;
const tienePlaca    = !!ventaData.placaMoto;
const tieneModelo   = !!ventaData.modeloMoto;
const tieneExtras   = tieneEmpleado || tienePlaca || tieneModelo;

const dniVal = clienteData?.dni || ventaData.clienteDNI;
drawInfoLine(pdf, fontName, 'CLIENTE: ', clienteNombre.toUpperCase(), margin, currentY);
if (dniVal) drawInfoLine(pdf, fontName, 'DNI: ', String(dniVal), margin, currentY + 5);
if (ventaData.empleadoId) drawInfoLine(pdf, fontName, 'REGISTRADO POR: ', ventaData.empleadoId, margin, currentY + 10);

const colDerecha = pageWidth * 0.6;
const maxWidthDerecha = pageWidth - margin - colDerecha - 2;
const obsLineHeight = 3.5;

// Columna izquierda siempre ocupa 3 filas (cliente, dni, registrado por)
let alturaIzquierda = 12; // currentY + 0, +5, +10 → el último está en +10, ocupa hasta +15 aprox

let alturaDerecha = 0;

if (tieneExtras) {
    if (tieneEmpleado) {
        drawInfoLine(pdf, fontName, 'EMPLEADO: ', ventaData.empleadoAsignadoNombre.toUpperCase(), colDerecha, currentY);
        alturaDerecha = Math.max(alturaDerecha, 5);
    }
    if (tienePlaca) {
        drawInfoLine(pdf, fontName, 'PLACA MOTO: ', ventaData.placaMoto.toUpperCase(), colDerecha, currentY + 5);
        alturaDerecha = Math.max(alturaDerecha, 10);
    }
    if (tieneModelo) {
        drawInfoLine(pdf, fontName, 'MODELO MOTO: ', ventaData.modeloMoto.toUpperCase(), colDerecha, currentY + 10);
        alturaDerecha = Math.max(alturaDerecha, 15);
    }
    if (ventaData.observaciones) {
        const labelObs = 'OBSERVACIONES: ';
        const labelObsW = pdf.getTextWidth(labelObs);
        const obsLines = pdf.splitTextToSize(ventaData.observaciones.toUpperCase(), maxWidthDerecha - labelObsW);
        const obsOffsetY = currentY + (tieneModelo ? 15 : tienePlaca ? 10 : 5);
        pdf.setFont(fontName, 'bold');
        pdf.text(labelObs, colDerecha, obsOffsetY);
        pdf.setFont(fontName, 'normal');
        pdf.text(obsLines, colDerecha + labelObsW, obsOffsetY);
        alturaDerecha = Math.max(alturaDerecha, (tieneModelo ? 15 : tienePlaca ? 10 : 5) + obsLines.length * obsLineHeight);
    }
} else {
    if (ventaData.observaciones) {
        const labelObs = 'OBSERVACIONES: ';
        const labelObsW = pdf.getTextWidth(labelObs);
        const obsLines = pdf.splitTextToSize(ventaData.observaciones.toUpperCase(), maxWidthDerecha - labelObsW);
        pdf.setFont(fontName, 'bold');
        pdf.text(labelObs, colDerecha, currentY);
        pdf.setFont(fontName, 'normal');
        pdf.text(obsLines, colDerecha + labelObsW, currentY);
        alturaDerecha = Math.max(alturaDerecha, obsLines.length * obsLineHeight);
    }
}

// El bloque cliente ocupa hasta donde llegue el más alto de las dos columnas + padding
currentY += Math.max(alturaIzquierda, alturaDerecha) + 2;


            // =========================================================================
            // TABLA DE PRODUCTOS
            // =========================================================================

            // Items, devoluciones y abonos no dependen entre sí: se cargan en paralelo
            // en vez de uno tras otro (antes era secuencial y era el principal cuello
            // de botella antes de que apareciera el modal con la vista previa).
            const [items, devolucionesVenta, abonosVenta] = await Promise.all([
                getVentaItems(ventaData.id),
                getDevolucionesVenta(ventaData.id),
                ventaData.tipoVenta === 'credito' ? getAbonosVenta(ventaData.id) : Promise.resolve([])
            ]);

            // Detalles de producto: se piden una sola vez por productoId ÚNICO
            // (antes se pedía 1 por cada item, incluso si 3 items repetían el mismo
            // productoId con distinto nombrePersonalizado, como "VARIOS REPUESTOS"),
            // y todos en paralelo en vez de un await dentro de un for secuencial.
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
                totalWidth * 0.08
            ];

            const tableData = [];
            const rowMeta = [];
            let totalVenta = 0;

            for (const item of items) {
                const productDetails = detallesPorProducto[item.productoId] || {};
                const devEstado = getEstadoDevolucionItem(item, devolucionesVenta);

                // Si el item tiene sobrenombre (nombrePersonalizado), ese es el nombre
                // que debe verse en el comprobante — NO el nombre genérico del producto
                // (ej: "VARIOS REPUESTOS"). El nombre genérico solo se usa si no hay sobrenombre.
                const nombreAMostrar = item.nombrePersonalizado
                    ? item.nombrePersonalizado
                    : (item.nombreProducto || 'N/A');

                const itemRow = [
                    (productDetails.codigoTienda || item.codigoTienda || 'N/A').toString().toUpperCase(),
                    (productDetails.codigoProveedor || item.codigoProveedor || 'N/A').toString().toUpperCase(),
                    nombreAMostrar.toString().toUpperCase(),
                    (productDetails.color || 'N/A').toString().toUpperCase(),
                    (productDetails.marca || 'N/A').toString().toUpperCase(),
                    (productDetails.ubicacion || 'N/A').toString().toUpperCase(),
                    (productDetails.medida || 'N/A').toString().toUpperCase(),
                    String(item.cantidad || 0),
                    `${parseFloat(item.precioVentaUnitario || 0).toFixed(2)}`,
                    `${parseFloat(item.subtotal || 0).toFixed(2)}`
                ];

                tableData.push(itemRow);
                rowMeta.push({
                    devEstado: devEstado
                });
                totalVenta += parseFloat(item.subtotal || 0);
            }

            currentY = drawProfessionalTable(pdf, tableData, tableHeaders, colWidths, margin, currentY, fontName, pageHeight, margin, rowMeta, logoBase64, pageWidth);

            // Leyenda de colores si hay devoluciones
            if (devolucionesVenta.length > 0) {
                currentY += 3;
                pdf.setFontSize(6.5);
                pdf.setFont(fontName, 'normal');
                pdf.setFillColor(252, 226, 226);
                pdf.rect(margin, currentY - 2.5, 3, 3, 'F');
                pdf.text('DEVOLUCION TOTAL', margin + 4, currentY);
                pdf.setFillColor(255, 243, 205);
                pdf.rect(margin + 45, currentY - 2.5, 3, 3, 'F');
                pdf.text('DEVOLUCION PARCIAL', margin + 49, currentY);
                currentY += 5;
            }

            currentY += 3;

            // =========================================================================
            // TOTAL DE LA VENTA (bruto, sin descontar devoluciones)
            // =========================================================================

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
            pdf.text('TOTAL DE LA VENTA:', margin + 5, currentY + 5);
            pdf.text(`S/. ${(ventaData.totalVenta || totalVenta).toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
            currentY += 13;

            // =========================================================================
            // HISTORIAL DE ABONOS (solo créditos)
            // =========================================================================

            if (ventaData.tipoVenta === 'credito' && abonosVenta.length > 0) {
                if (currentY + 20 > pageHeight - margin) { pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin; }

                pdf.setFont(fontName, 'bold');
                pdf.setFontSize(9);
                pdf.text(`ABONOS REGISTRADOS (${abonosVenta.length}):`, margin, currentY);
                currentY += 5;

                pdf.setFont(fontName, 'normal');
                pdf.setFontSize(7.5);

                abonosVenta.forEach(abono => {
                    if (currentY + 5 > pageHeight - margin) { pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin; }
                    const fechaAbono = abono.fecha?.toDate
                        ? abono.fecha.toDate().toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : 'N/A';
                    pdf.text(`${fechaAbono}  -  S/. ${parseFloat(abono.monto || 0).toFixed(2)}  -  ${(abono.metodoPago || '').toUpperCase()}  -  ${abono.descripcion || 'Abono a credito'}`, margin + 2, currentY);
                    currentY += 4;
                });

                const totalAbonado = abonosVenta.reduce((s, a) => s + parseFloat(a.monto || 0), 0);
                currentY += 1;
                pdf.setFont(fontName, 'bold');
                pdf.text(`TOTAL ABONADO: S/. ${totalAbonado.toFixed(2)}`, pageWidth - margin, currentY, { align: 'right' });
                currentY += 8;
            }

            // =========================================================================
            // DEVOLUCIONES REGISTRADAS
            // =========================================================================

            let totalDevuelto = 0;

            if (devolucionesVenta.length > 0) {
                if (currentY + 20 > pageHeight - margin) { pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin; }

                pdf.setFont(fontName, 'bold');
                pdf.setFontSize(9);
                pdf.text('DEVOLUCIONES REGISTRADAS:', margin, currentY);
                currentY += 6;

                devolucionesVenta.forEach(dev => {
                    if (currentY + 12 > pageHeight - margin) { pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin; }

                    pdf.setFillColor(255, 243, 224);
                    pdf.rect(margin, currentY - 3, totalWidth, 5, 'F');
                    pdf.setFont(fontName, 'bold');
                    pdf.setFontSize(7.5);
                    const fechaDev = dev.fechaSolicitud?.toDate
                        ? dev.fechaSolicitud.toDate().toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' })
                        : 'N/A';
                    pdf.text(`${dev.numeroDevolucion || dev.id}  -  ${fechaDev}  -  MOTIVO: ${(dev.motivo || 'N/A').toUpperCase()}`, margin + 2, currentY);
                    if (dev.metodoPagoDevolucion) {
                        pdf.text(`DEVUELTO POR: ${dev.metodoPagoDevolucion.toUpperCase()}`, pageWidth - margin - 2, currentY, { align: 'right' });
                    }
                    currentY += 5;

                    pdf.setFont(fontName, 'normal');
                    pdf.setFontSize(7);
                    (dev.items || []).forEach(item => {
                        if (currentY + 4 > pageHeight - margin) { pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin; }
                        const montoItem = item.montoDevolucion > 0
                            ? parseFloat(item.montoDevolucion)
                            : parseFloat(item.precioVentaUnitario || 0) * parseFloat(item.cantidadADevolver || 0);
                        const nombreItemDev = item.nombrePersonalizado || item.nombreProducto || 'N/A';
                        pdf.text(`  - ${nombreItemDev.toUpperCase()}  x${item.cantidadADevolver}   - S/. ${montoItem.toFixed(2)}`, margin + 2, currentY);
                        currentY += 4;
                        totalDevuelto += montoItem;
                    });

                    currentY += 2;
                });

                pdf.setFont(fontName, 'bold');
                pdf.setFontSize(8);
                pdf.text(`TOTAL DEVUELTO: - S/. ${totalDevuelto.toFixed(2)}`, pageWidth - margin, currentY, { align: 'right' });
                currentY += 8;
            }

            // =========================================================================
            // RESUMEN NETO FINAL
            // =========================================================================

            if (devolucionesVenta.length > 0 || (ventaData.tipoVenta === 'credito' && abonosVenta.length > 0)) {
                if (currentY + 15 > pageHeight - margin) { pdf.addPage(); drawWatermark(pdf, logoBase64, pageWidth, pageHeight); currentY = margin; }

                let netoCobrado;
                if (ventaData.tipoVenta === 'credito' && abonosVenta.length > 0) {
                    const totalAbonado = abonosVenta.reduce((s, a) => s + parseFloat(a.monto || 0), 0);
                    const excedente = parseFloat(ventaData.excedentePagoCliente || 0);
                    netoCobrado = totalAbonado - excedente;
                } else {
                    netoCobrado = parseFloat(ventaData.totalVenta || totalVenta) - totalDevuelto;
                }

                pdf.setFillColor(220, 240, 220);
                pdf.setDrawColor(0, 0, 0);
                pdf.rect(margin, currentY, totalWidth, 8, 'FD');
                pdf.setFont(fontName, 'bold');
                pdf.setFontSize(9);
                pdf.text('NETO COBRADO:', margin + 5, currentY + 5);
                pdf.text(`S/. ${netoCobrado.toFixed(2)}`, pageWidth - margin - 5, currentY + 5, { align: 'right' });
                currentY += 13;
            }

            // =========================================================================
            // INFORMACIÓN ADICIONAL
            // =========================================================================

            if (currentY > pageHeight - 40) {
                pdf.addPage();
                drawWatermark(pdf, logoBase64, pageWidth, pageHeight);
                currentY = margin;
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

            pdf.setFontSize(8);
            pdf.setFont(fontName, 'normal');
            pdf.text(`COMPROBANTE GENERADO EL ${new Date().toLocaleString('es-PE')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

            const fechaSufijo = new Date().toISOString().split('T')[0];
            const clienteSufijo = clienteNombre.replace(/\s+/g, '-').toLowerCase();
            const fileName = `venta-${numeroVenta.replace(/[^a-zA-Z0-9]/g, '-')}-${clienteSufijo}-${fechaSufijo}.pdf`;
            const pdfBlob = pdf.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            return { url: pdfUrl, fileName };

        } catch (error) {
            console.error('Error al generar PDF de venta:', error);
            throw error;
        }
    };

    // Función principal exportada
    export const generarPDFVentaCompleta = async (ventaId, ventaData = null, clienteData = null) => {
        try {
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

            const result = await generarPDFVenta(venta, cliente);
            return result;

        } catch (error) {
            console.error('Error al generar PDF de venta:', error);
            throw new Error('Error al generar el comprobante de venta. Por favor, intentalo de nuevo.');
        }
    };

    export default { generarPDFVentaCompleta };