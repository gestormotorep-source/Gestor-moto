const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
admin.initializeApp();

exports.recalcularPrecioFIFO = onDocumentWritten('lotes/{loteId}', async (event) => {

  const data = event.data.after.exists
  ? event.data.after.data()
  : event.data.before.data();

  const productoId = data?.productoId;
  if (!productoId) return null;

  const db = admin.firestore();

  const lotesSnap = await db.collection('lotes')
    .where('productoId', '==', productoId)
    .orderBy('fechaIngreso', 'asc')
    .get();

  const todosLotes = lotesSnap.docs.map(d => d.data());
  const lotesActivos = todosLotes.filter(l => parseFloat(l.stockRestante || 0) > 0);

  let precioCompra = 0, precioVenta = 0, precioMin = 0, stock = 0;

  if (lotesActivos.length > 0) {
    const primero = lotesActivos[0];
    precioCompra = parseFloat(primero.precioCompraUnitario || 0);
    stock = lotesActivos.reduce((s, l) => s + parseFloat(l.stockRestante || 0), 0);
    const conPrecios = lotesActivos.find(l => parseFloat(l.precioVentaUnitario || 0) > 0);
    if (conPrecios) {
      precioVenta = parseFloat(conPrecios.precioVentaUnitario || 0);
      precioMin   = parseFloat(conPrecios.precioVentaMinimoUnitario || 0);
    }
  } else if (todosLotes.length > 0) {
    const conPrecios = todosLotes.filter(l => parseFloat(l.precioVentaUnitario || 0) > 0);
    const ref = conPrecios.length > 0
      ? conPrecios[conPrecios.length - 1]
      : todosLotes[todosLotes.length - 1];
    precioCompra = parseFloat(ref.precioCompraUnitario || 0);
    precioVenta  = parseFloat(ref.precioVentaUnitario || 0);
    precioMin    = parseFloat(ref.precioVentaMinimoUnitario || 0);
    stock = 0;
  }

  await db.collection('productos').doc(productoId).update({
    precioCompraDefault: precioCompra,
    precioVentaDefault:  precioVenta,
    precioVentaMinimo:   precioMin,
    stockActual:         stock,
    updatedAt:           admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`✅ Producto ${productoId} — stock: ${stock}, venta: ${precioVenta}`);
  return null;
});