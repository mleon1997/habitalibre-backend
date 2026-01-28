// src/services/leadMerge.js
import Lead from "../models/Lead.js";
import { buildIdentidades } from "./leadIdentity.js";

function isEmpty(v) {
  return (
    v === null ||
    v === undefined ||
    v === "" ||
    (typeof v === "number" && Number.isNaN(v))
  );
}

function setFuenteInfo(lead, source) {
  const now = new Date();
  lead.fuentesInfo = lead.fuentesInfo || { web: {}, manychat: {}, manual: {} };
  if (!lead.fuentesInfo[source]) lead.fuentesInfo[source] = {};
  lead.fuentesInfo[source].seen = true;
  lead.fuentesInfo[source].lastAt = now;

  // completed simple:
  if (source === "web") {
    lead.fuentesInfo.web.completed = !!lead.resultado;
  } else if (source === "manychat") {
    lead.fuentesInfo.manychat.completed =
      lead.ingreso_mensual != null &&
      lead.deuda_mensual_aprox != null &&
      lead.afiliado_iess != null &&
      !!lead.tipo_compra;
  } else if (source === "manual") {
    lead.fuentesInfo.manual.completed = true;
  }
}

function setScoreConfianza(lead) {
  if (lead.resultado) {
    lead.scoreConfianza = "alta";
  } else if (
    lead.ingreso_mensual != null &&
    lead.deuda_mensual_aprox != null &&
    lead.afiliado_iess != null &&
    !!lead.tipo_compra
  ) {
    lead.scoreConfianza = "media";
  } else {
    lead.scoreConfianza = "baja";
  }
}

// ✅ Normaliza payload (camelCase -> snake_case) para evitar nulls
function normalizeIncomingPayload(payload = {}) {
  const p = payload && typeof payload === "object" ? { ...payload } : {};

  // --- financieros / manychat-like ---
  if (isEmpty(p.afiliado_iess) && !isEmpty(p.afiliadoIess)) p.afiliado_iess = p.afiliadoIess;

  if (isEmpty(p.anios_estabilidad) && !isEmpty(p.aniosEstabilidad)) p.anios_estabilidad = p.aniosEstabilidad;

  // si viene ingresoNetoMensual + ingresoPareja, consolidamos
  const ingresoBase = !isEmpty(p.ingreso_mensual) ? p.ingreso_mensual : undefined;
  const ingresoNeto = !isEmpty(p.ingresoNetoMensual) ? p.ingresoNetoMensual : undefined;
  const ingresoPareja = !isEmpty(p.ingresoPareja) ? p.ingresoPareja : undefined;

  if (isEmpty(p.ingreso_mensual) && (!isEmpty(ingresoNeto) || !isEmpty(ingresoPareja))) {
    const total = Number(ingresoNeto || 0) + Number(ingresoPareja || 0);
    if (!Number.isNaN(total)) p.ingreso_mensual = total;
  } else if (!isEmpty(ingresoBase)) {
    p.ingreso_mensual = ingresoBase;
  }

  if (isEmpty(p.deuda_mensual_aprox) && !isEmpty(p.otrasDeudasMensuales))
    p.deuda_mensual_aprox = p.otrasDeudasMensuales;

  if (isEmpty(p.ciudad_compra) && !isEmpty(p.ciudadCompra)) p.ciudad_compra = p.ciudadCompra;

  if (isEmpty(p.tipo_compra) && !isEmpty(p.tipoCompra)) p.tipo_compra = p.tipoCompra;
  if (isEmpty(p.tipo_compra_numero) && !isEmpty(p.tipoCompraNumero)) p.tipo_compra_numero = p.tipoCompraNumero;

  // --- core del simulador (los que te salen null) ---
  if (isEmpty(p.valor_vivienda) && !isEmpty(p.valorVivienda)) p.valor_vivienda = p.valorVivienda;
  if (isEmpty(p.entrada_disponible) && !isEmpty(p.entradaDisponible)) p.entrada_disponible = p.entradaDisponible;

  if (isEmpty(p.edad) && !isEmpty(p.edad)) p.edad = p.edad; // noop, pero deja claro
  if (isEmpty(p.tipo_ingreso) && !isEmpty(p.tipoIngreso)) p.tipo_ingreso = p.tipoIngreso;

  return p;
}

// Busca por identidades normalizadas + legacy fields
export async function findLeadForMerge(identidades) {
  const or = [];

  if (identidades.manychatSubscriberId) {
    or.push({ manychatSubscriberId: identidades.manychatSubscriberId });
    or.push({ "identidades.manychatSubscriberId": identidades.manychatSubscriberId });
  }
  if (identidades.igUsernameNorm) {
    or.push({ igUsername: identidades.igUsernameNorm });
    or.push({ "identidades.igUsernameNorm": identidades.igUsernameNorm });
  }
  if (identidades.telefonoNorm) {
    or.push({ telefono: identidades.telefonoNorm });
    or.push({ "identidades.telefonoNorm": identidades.telefonoNorm });
  }
  if (identidades.emailNorm) {
    or.push({ email: identidades.emailNorm });
    or.push({ "identidades.emailNorm": identidades.emailNorm });
    // legacy: si antes guardaste email sin lower
    or.push({ email: new RegExp(`^${identidades.emailNorm}$`, "i") });
  }

  if (!or.length) return null;
  return Lead.findOne({ $or: or }).sort({ updatedAt: -1 });
}

// Merge con prioridad: web > manychat (manychat solo llena)
function mergeField(lead, incoming, field, source) {
  const cur = lead[field];
  const next = incoming[field];
  if (isEmpty(next)) return;

  // si está vacío, siempre llena
  if (isEmpty(cur)) {
    lead[field] = next;
    return;
  }

  // manychat nunca pisa
  if (source === "manychat") return;

  // web/manual puede pisar
  lead[field] = next;
}

// MAIN: upsert+merge
export async function upsertLeadMerged({ payload, source, canal, fuente }) {
  // ✅ clave: normalizamos primero para que mergeField encuentre keys correctas
  const incoming = normalizeIncomingPayload(payload);

  const identidades = buildIdentidades({
    email: incoming.email,
    telefono: incoming.telefono,
    igUsername: incoming.igUsername,
    manychatSubscriberId: incoming.manychatSubscriberId,
  });

  let lead = await findLeadForMerge(identidades);
  const isNew = !lead;

  if (!lead) lead = new Lead({});

  // identidades normalizadas
  lead.identidades = lead.identidades || {};
  if (identidades.emailNorm) lead.identidades.emailNorm = identidades.emailNorm;
  if (identidades.telefonoNorm) lead.identidades.telefonoNorm = identidades.telefonoNorm;
  if (identidades.igUsernameNorm) lead.identidades.igUsernameNorm = identidades.igUsernameNorm;
  if (identidades.manychatSubscriberId) lead.identidades.manychatSubscriberId = identidades.manychatSubscriberId;

  // compat
  if (identidades.emailNorm) lead.email = identidades.emailNorm;
  if (identidades.telefonoNorm) lead.telefono = identidades.telefonoNorm;
  if (identidades.igUsernameNorm) lead.igUsername = identidades.igUsernameNorm;
  if (identidades.manychatSubscriberId) lead.manychatSubscriberId = identidades.manychatSubscriberId;

  // canal/fuente (no rompas lo existente: solo set si viene)
  if (canal) lead.canal = canal;
  if (fuente) lead.fuente = fuente;

  // ==========================
  // CONTACT / PERFIL "rápido"
  // ==========================
  const CONTACT_FIELDS = [
    "nombre",
    "ciudad",
    "tiempoCompra",
    "sustentoIndependiente",
    "aceptaTerminos",
    "aceptaCompartir",
    "origen",

    // ✅ nuevos campos planos
    "edad",
    "tipo_ingreso",
    "valor_vivienda",
    "entrada_disponible",

    // ✅ debug/UI admin
    "scoreHLDetalle",
  ];

  for (const f of CONTACT_FIELDS) mergeField(lead, incoming, f, source);

  // MANYCHAT FIELDS (planos)
  const MC_FIELDS = [
    "afiliado_iess",
    "anios_estabilidad",
    "ingreso_mensual",
    "deuda_mensual_aprox",
    "ciudad_compra",
    "tipo_compra",
    "tipo_compra_numero",
    "metadata",
  ];
  for (const f of MC_FIELDS) mergeField(lead, incoming, f, source);

  // RESULTADO (solo web/manual)
  if ((source === "web" || source === "manual") && incoming.resultado) {
    lead.resultado = incoming.resultado;
    lead.resultadoUpdatedAt = new Date();
  }

  // producto / scoreHL si vienen de web
  if (source === "web") {
    if (!isEmpty(incoming.producto)) lead.producto = incoming.producto;
    if (!isEmpty(incoming.scoreHL)) lead.scoreHL = incoming.scoreHL;

    if (!isEmpty(incoming.scoreHLDetalle)) lead.scoreHLDetalle = incoming.scoreHLDetalle;
  }

  setFuenteInfo(lead, source);
  setScoreConfianza(lead);

  await lead.save();
  return { lead, isNew };
}
