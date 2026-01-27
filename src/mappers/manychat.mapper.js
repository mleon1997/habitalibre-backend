// src/mappers/manychat.mapper.js
function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toBoolSiNo(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return null;
  if (["si", "sí", "true", "1"].includes(s)) return true;
  if (["no", "false", "0"].includes(s)) return false;
  return null;
}

// Recibe raw manychat custom fields / payload
export function mapManyChatPayloadToLead(raw = {}) {
  // Aquí soportamos varios nombres “posibles” por si ManyChat cambia keys
  const ingreso = toNumber(raw.ingreso_mensual ?? raw.ingreso ?? raw.ingresoMensual);
  const deuda = toNumber(raw.deuda_mensual_aprox ?? raw.deuda ?? raw.otrasDeudas);

  const afiliado = toBoolSiNo(raw.afiliado_iess ?? raw.afiliadoIess);
  const anios = toNumber(raw.anios_estabilidad ?? raw.aniosEstabilidad);

  const ciudadCompra = String(raw.ciudad_compra ?? raw.ciudadCompra ?? "").trim() || null;
  const tipoCompra = String(raw.tipo_compra ?? raw.tipoCompra ?? "").trim().toLowerCase() || null;

  const tipoCompraNumero = toNumber(raw.tipo_compra_numero ?? raw.tipoCompraNumero);

  const manychatSubscriberId =
    String(raw.manychatSubscriberId ?? raw.subscriber_id ?? raw.subscriberId ?? "").trim() || null;

  const igUsername =
    String(raw.igUsername ?? raw.instagram_username ?? raw.ig_username ?? raw.instagram ?? "").trim() || null;

  const email = String(raw.email ?? raw.Email ?? "").trim() || null;
  const telefono = String(raw.telefono ?? raw.phone ?? raw.Phone ?? "").trim() || null;
  const nombre = String(raw.nombre ?? raw.first_name ?? raw.name ?? "").trim() || null;

  return {
    nombre,
    email,
    telefono,
    manychatSubscriberId,
    igUsername,

    afiliado_iess: afiliado,
    anios_estabilidad: anios,
    ingreso_mensual: ingreso,
    deuda_mensual_aprox: deuda,

    ciudad_compra: ciudadCompra,
    tipo_compra: tipoCompra,
    tipo_compra_numero: tipoCompraNumero,

    // opcional: útil para rastrear
    fuente: "manychat",
  };
}
