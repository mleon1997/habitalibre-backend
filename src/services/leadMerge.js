// src/services/leadMerge.js
import Lead from "../models/Lead.js";
import { buildIdentidades } from "./leadIdentity.js";

function isEmpty(v) {
  return v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));
}

function setFuenteInfo(lead, source) {
  const now = new Date();
  lead.fuentesInfo = lead.fuentesInfo || { web: {}, manychat: {} };
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
  const identidades = buildIdentidades({
    email: payload.email,
    telefono: payload.telefono,
    igUsername: payload.igUsername,
    manychatSubscriberId: payload.manychatSubscriberId,
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

  // CONTACT
  const CONTACT_FIELDS = [
    "nombre",
    "ciudad",
    "tiempoCompra",
    "sustentoIndependiente",
    "aceptaTerminos",
    "aceptaCompartir",
    "origen",
  ];

  for (const f of CONTACT_FIELDS) mergeField(lead, payload, f, source);

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
  for (const f of MC_FIELDS) mergeField(lead, payload, f, source);

  // RESULTADO (solo web/manual)
  if ((source === "web" || source === "manual") && payload.resultado) {
    lead.resultado = payload.resultado;
    lead.resultadoUpdatedAt = new Date();
  }

  // producto / scoreHL si vienen de web
  if (source === "web") {
    if (!isEmpty(payload.producto)) lead.producto = payload.producto;
    if (!isEmpty(payload.scoreHL)) lead.scoreHL = payload.scoreHL;
  }

  setFuenteInfo(lead, source);
  setScoreConfianza(lead);

  await lead.save();
  return { lead, isNew };
}
