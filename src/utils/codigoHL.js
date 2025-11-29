// src/utils/codigoHL.js

// Genera un código tipo: HL-2511-AB12CD
export function generarCodigoHLDesdeObjectId(objectId, fecha = new Date()) {
  if (!objectId) {
    throw new Error("Se requiere objectId para generar codigoHL");
  }

  const idStr = objectId.toString();
  const sufijo = idStr.slice(-6).toUpperCase(); // últimos 6 chars del _id

  const yy = fecha.getFullYear().toString().slice(-2); // 25
  const mm = String(fecha.getMonth() + 1).padStart(2, "0"); // 01..12
  const dd = String(fecha.getDate()).padStart(2, "0"); // 01..31

  return `HL-${yy}${mm}${dd}-${sufijo}`;
}
