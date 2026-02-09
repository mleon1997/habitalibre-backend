// src/services/igConversationEngine.js

function normalizeText(s) {
  return String(s || "").trim();
}

/**
 * inbound puede ser:
 * - string ("hola")
 * - objeto: { type: "text|postback|quick_reply", text: "...", payload: "...", title: "..." }
 *
 * Regla:
 * - si hay payload => ese es el input principal (ideal para botones propios)
 * - si no => usa text
 */
function normalizeInbound(inbound) {
  if (typeof inbound === "string") {
    return { type: "text", text: normalizeText(inbound), payload: "", title: "" };
  }
  const type = inbound?.type || "text";
  const payload = normalizeText(inbound?.payload || "");
  const text = normalizeText(inbound?.text || "");
  const title = normalizeText(inbound?.title || "");
  return { type, text, payload, title };
}

function normalizeMoney(input) {
  const s = normalizeText(input)
    .toLowerCase()
    .replace(/usd|dolares|dólares|\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "") // "1.200" -> "1200"
    .replace(/,/g, "."); // tolera coma decimal

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function normalizeInt(input) {
  const s = normalizeText(input).replace(/[^\d]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function normalizeSoloPareja(input) {
  const s = normalizeText(input).toLowerCase();
  if (!s) return null;

  if (
    s.includes("solo") ||
    s.includes("sola") ||
    s.includes("yo") ||
    s.includes("individual") ||
    s.includes("una persona")
  )
    return "solo";

  if (
    s.includes("pareja") ||
    s.includes("espos") ||
    s.includes("novi") ||
    s.includes("juntos") ||
    s.includes("los dos") ||
    s === "2" ||
    s.includes("dos")
  )
    return "pareja";

  return null;
}

function normalizeTipoIngreso(input) {
  const s = normalizeText(input).toLowerCase();
  if (!s) return null;

  const hasDep = s.includes("depend");
  const hasInd = s.includes("independ") || s.includes("negocio") || s.includes("empr");

  if (s.includes("mixto") || (hasDep && hasInd)) return "Mixto";
  if (hasDep) return "Dependiente";
  if (hasInd) return "Independiente";

  return null;
}

function normalizeYesNo(input) {
  const s = normalizeText(input).toLowerCase();
  if (!s) return null;

  if (["si", "sí", "s", "ok", "dale", "claro", "aja", "ajá"].includes(s)) return true;
  if (["no", "n", "nop", "nel"].includes(s)) return false;

  if (s.includes("si")) return true;
  if (s.includes("no")) return false;

  return null;
}

/**
 * ✅ Payloads propios (para cuando mandes botones sin ManyChat)
 * Tip: usa estos strings como payload en Graph API / n8n
 */
const IG_PAYLOADS = {
  BUY_SOLO: "BUY_SOLO",
  BUY_PAREJA: "BUY_PAREJA",

  INCOME_TYPE_DEP: "INCOME_TYPE_DEP",
  INCOME_TYPE_IND: "INCOME_TYPE_IND",
  INCOME_TYPE_MIX: "INCOME_TYPE_MIX",

  YES: "YES",
  NO: "NO",

  PLAZO_10: "PLAZO_10",
  PLAZO_15: "PLAZO_15",
  PLAZO_20: "PLAZO_20",
  PLAZO_25: "PLAZO_25",
  PLAZO_30: "PLAZO_30",
  PLAZO_NOSE: "PLAZO_NOSE",
};

function mapPayloadToText(payload) {
  const p = normalizeText(payload);
  if (!p) return "";

  // Compra
  if (p === IG_PAYLOADS.BUY_SOLO) return "solo";
  if (p === IG_PAYLOADS.BUY_PAREJA) return "pareja";

  // Tipo ingreso
  if (p === IG_PAYLOADS.INCOME_TYPE_DEP) return "dependiente";
  if (p === IG_PAYLOADS.INCOME_TYPE_IND) return "independiente";
  if (p === IG_PAYLOADS.INCOME_TYPE_MIX) return "mixto";

  // Sí/No
  if (p === IG_PAYLOADS.YES) return "sí";
  if (p === IG_PAYLOADS.NO) return "no";

  // Plazo
  if (p === IG_PAYLOADS.PLAZO_10) return "10";
  if (p === IG_PAYLOADS.PLAZO_15) return "15";
  if (p === IG_PAYLOADS.PLAZO_20) return "20";
  if (p === IG_PAYLOADS.PLAZO_25) return "25";
  if (p === IG_PAYLOADS.PLAZO_30) return "30";
  if (p === IG_PAYLOADS.PLAZO_NOSE) return "no sé";

  // Si no es uno de los nuestros, lo devolvemos tal cual.
  return p;
}

const STEPS = {
  // ✅ FIX: start ahora es ask-only determinístico (siempre responde con el saludo)
  start: {
    ask: () =>
      "Hola 👋 Bienvenido a HabitaLibre.\n\nTe ayudo a saber si podrías comprar casa en Ecuador, sin compromiso.\n\nPara empezar:\n👉 ¿Quieres comprar SOLO o EN PAREJA?",
    next: () => "solo_pareja",
  },

  solo_pareja: {
    ask: () =>
      "Para empezar:\n👉 ¿Quieres comprar SOLO o EN PAREJA?\n\nResponde: “solo” o “pareja”.",
    parse: (text) => normalizeSoloPareja(text),
    validate: (v) => v === "solo" || v === "pareja",
    onSuccess: (session, v, rawText) => {
      session.raw.solo_pareja = rawText;
      session.raw.comprasEnPareja = v === "pareja";
      if (v === "solo") session.data.ingresoPareja = 0;
    },
    next: (session) => (session.raw.comprasEnPareja ? "ingreso_pareja" : "tipo_ingreso"),
    retry: () =>
      "Solo para confirmar:\n¿Comprarás *SOLO* o *EN PAREJA*?\n\nResponde: “solo” o “pareja”.",
  },

  ingreso_pareja: {
    ask: () => "Genial. ¿Cuánto gana tu pareja al mes (neto)? (aprox en USD)",
    parse: (text) => normalizeMoney(text),
    validate: (n) => Number.isFinite(n) && n >= 0 && n <= 50000,
    onSuccess: (session, n, rawText) => {
      session.data.ingresoPareja = n;
      session.raw.ingresoPareja = rawText;
    },
    next: () => "tipo_ingreso",
    retry: () => "Dime el ingreso neto mensual de tu pareja en USD (ej: 800).",
  },

  tipo_ingreso: {
    ask: () => "¿Tu ingreso es *Dependiente* (empleado), *Independiente* (negocio) o *Mixto*?",
    parse: (text) => normalizeTipoIngreso(text),
    validate: (v) => ["Dependiente", "Independiente", "Mixto"].includes(v),
    onSuccess: (session, v, rawText) => {
      session.data.tipoIngreso = v;
      session.raw.tipoIngreso = rawText;
    },
    next: () => "ingreso_neto",
    retry: () => "Responde con: Dependiente / Independiente / Mixto.",
  },

  ingreso_neto: {
    ask: () => "¿Cuánto ganas tú al mes (ingreso neto)? (aprox en USD)",
    parse: (text) => normalizeMoney(text),
    validate: (n) => Number.isFinite(n) && n >= 100 && n <= 50000,
    onSuccess: (session, n, rawText) => {
      session.data.ingresoNetoMensual = n;
      session.raw.ingresoNetoMensual = rawText;
    },
    next: () => "deudas",
    retry: () => "Dime tu ingreso neto mensual en USD (ej: 550).",
  },

  deudas: {
    ask: () =>
      "Aprox, ¿cuánto pagas al mes en *deudas*? (tarjetas, préstamos, etc.)\nSi no tienes, responde 0.",
    parse: (text) => {
      const s = normalizeText(text).toLowerCase();
      if (s.includes("no tengo") || s.includes("ning")) return 0;
      return normalizeMoney(text);
    },
    validate: (n) => Number.isFinite(n) && n >= 0 && n <= 50000,
    onSuccess: (session, n, rawText) => {
      session.data.otrasDeudasMensuales = n;
      session.raw.otrasDeudasMensuales = rawText;
    },
    next: () => "valor_vivienda",
    retry: () => "Dime tus deudas mensuales en USD (ej: 315). Si no tienes, escribe 0.",
  },

  valor_vivienda: {
    ask: () => "¿Qué valor tiene la vivienda que te interesa? (aprox en USD)",
    parse: (text) => normalizeMoney(text),
    validate: (n) => Number.isFinite(n) && n >= 5000 && n <= 1000000,
    onSuccess: (session, n, rawText) => {
      session.data.valorVivienda = n;
      session.raw.valorVivienda = rawText;
    },
    next: () => "entrada",
    retry: () => "Dime el valor de la vivienda en USD (ej: 30000).",
  },

  entrada: {
    ask: () => "¿Cuánto tienes de entrada disponible hoy? (USD). Si aún no tienes, responde 0.",
    parse: (text) => {
      const s = normalizeText(text).toLowerCase();
      if (s.includes("no tengo") || s.includes("nada")) return 0;
      return normalizeMoney(text);
    },
    validate: (n) => Number.isFinite(n) && n >= 0 && n <= 1000000,
    onSuccess: (session, n, rawText) => {
      session.data.entradaDisponible = n;
      session.raw.entradaDisponible = rawText;
    },
    next: () => "edad",
    retry: () => "Dime tu entrada disponible en USD (ej: 0 / 2000 / 5000).",
  },

  edad: {
    ask: () => "¿Qué edad tienes?",
    parse: (text) => normalizeInt(text),
    validate: (n) => Number.isFinite(n) && n >= 18 && n <= 80,
    onSuccess: (session, n, rawText) => {
      session.data.edad = n;
      session.raw.edad = rawText;
    },
    next: () => "estabilidad",
    retry: () => "Dime tu edad en número (ej: 22).",
  },

  estabilidad: {
    ask: () => "¿Cuántos años de estabilidad laboral tienes (en tu actividad actual)?",
    parse: (text) => normalizeInt(text),
    validate: (n) => Number.isFinite(n) && n >= 0 && n <= 60,
    onSuccess: (session, n, rawText) => {
      session.data.aniosEstabilidad = n;
      session.raw.aniosEstabilidad = rawText;
    },
    next: () => "afiliado_iess",
    retry: () => "Dime los años de estabilidad en número (ej: 2).",
  },

  afiliado_iess: {
    ask: () => "¿Aportas al IESS actualmente? (sí / no)",
    parse: (text) => normalizeYesNo(text),
    validate: (v) => v === true || v === false,
    onSuccess: (session, v, rawText) => {
      session.data.afiliadoIess = v;
      session.raw.afiliadoIess = rawText;

      if (!v) {
        session.data.iessAportesTotales = 0;
        session.data.iessAportesConsecutivos = 0;
      }
    },
    next: (session) => (session.data.afiliadoIess ? "iess_total" : "plazo"),
    retry: () => "Responde: sí o no 🙂",
  },

  iess_total: {
    ask: () => "¿Cuántos aportes al IESS tienes en total? (número)",
    parse: (text) => normalizeInt(text),
    validate: (n) => Number.isFinite(n) && n >= 0 && n <= 2000,
    onSuccess: (session, n, rawText) => {
      session.data.iessAportesTotales = n;
      session.raw.iessAportesTotales = rawText;
    },
    next: () => "iess_cons",
    retry: () => "Dime tus aportes totales en número (ej: 36).",
  },

  iess_cons: {
    ask: () => "¿Cuántos aportes consecutivos tienes? (número)",
    parse: (text) => normalizeInt(text),
    validate: (n) => Number.isFinite(n) && n >= 0 && n <= 2000,
    onSuccess: (session, n, rawText) => {
      session.data.iessAportesConsecutivos = n;
      session.raw.iessAportesConsecutivos = rawText;
    },
    next: () => "plazo",
    retry: () => "Dime tus aportes consecutivos en número (ej: 13).",
  },

  plazo: {
    ask: () =>
      "¿A cuántos años te gustaría el crédito? (10/15/20/25)\nSi no sabes, responde “no sé”.",
    parse: (text) => {
      const s = normalizeText(text).toLowerCase();
      if (s.includes("no se") || s.includes("nose") || s.includes("no sé")) return null;
      return normalizeInt(text);
    },
    validate: (n) => n === null || [10, 15, 20, 25, 30].includes(n),
    onSuccess: (session, n, rawText) => {
      session.data.plazoAnios = n;
      session.raw.plazoAnios = rawText;
    },
    next: () => "run_decision",
    retry: () => "Responde 10, 15, 20, 25 (o “no sé”).",
  },

  run_decision: {
    ask: () => "Perfecto. Dame un segundo y te digo qué tan viable se ve 👀",
    next: () => "result",
  },

  result: {
    ask: (session) => {
      const r = session.raw?.precalifResult;

      if (!r) {
        return "Listo. ¿Quieres que un asesor te escriba para ayudarte con opciones? (sí / no)";
      }

      if (r.sinOferta) {
        return (
          "Con lo que me diste, *hoy no hay una oferta viable todavía*.\n\n" +
          `📌 Capacidad estimada: ~$${Math.round(r.capacidadPago || 0)} / mes\n` +
          `📌 DTI con hipoteca: ${(Number(r.dtiConHipoteca || 0) * 100).toFixed(0)}%\n\n` +
          "Si quieres, te digo qué ajustar (entrada/deudas) para acercarte a una aprobación.\n\n" +
          "¿Quieres asesoría? (sí / no)"
        );
      }

      return (
        "¡Buena noticia! *Sí podría ser viable* con lo que me diste ✅\n\n" +
        `📌 Cuota estimada: ~$${Math.round(r.cuotaEstimada || 0)} / mes\n` +
        `📌 Banco sugerido: ${r.bancoSugerido || "por definir"}\n` +
        `📌 Producto sugerido: ${r.productoSugerido || "por definir"}\n\n` +
        "¿Quieres que un asesor te contacte? (sí / no)"
      );
    },
    next: () => "completed",
  },

  completed: {
    ask: () => "Listo 🙌 Si luego quieres recalcular, solo escribe “precalificar”.",
    next: () => "completed",
  },
};

function getStep(id) {
  return STEPS[id] || STEPS.start;
}

export function getInitialSessionPatch() {
  return { status: "active", currentStep: "start" };
}

/**
 * Ejecuta 1 turno:
 * - Soporta inbound string u objeto {type,text,payload,title}
 * - Si viene payload, lo convierte a "texto lógico" (para parsear botones)
 * - FIX: start siempre responde con el saludo (ya no cae en "OK")
 */
export async function runConversationTurn(session, inbound) {
  const inb = normalizeInbound(inbound);

  // Si hay payload, lo usamos como input principal
  const logicalText = normalizeText(mapPayloadToText(inb.payload) || inb.text);

  if (logicalText.toLowerCase().includes("precalificar")) {
    session.status = "active";
    session.currentStep = "start";
  }

  const step = getStep(session.currentStep);

  // ✅ ASK-ONLY step (sin parse): start / run_decision / completed (aunque completed tiene ask-only)
  if (!step.parse) {
    const msg = step.ask ? step.ask(session) : "OK";
    const nextId = step.next ? step.next(session) : session.currentStep;
    session.currentStep = nextId;

    // Si el step actual era run_decision, disparamos motor
    const shouldRunDecision = session.currentStep === "result" && step === STEPS.run_decision;
    return { session, replyText: msg, shouldRunDecision };
  }

  // ✅ step que espera input
  const parsed = step.parse(logicalText);
  const ok = step.validate ? step.validate(parsed) : parsed != null;

  if (!ok) {
    session.attempts[session.currentStep] =
      (session.attempts[session.currentStep] || 0) + 1;

    const msg = step.retry ? step.retry(session) : "No entendí. ¿Puedes repetirlo?";
    return { session, replyText: msg, shouldRunDecision: false };
  }

  if (step.onSuccess) step.onSuccess(session, parsed, logicalText);

  const nextId = step.next ? step.next(session) : "start";
  session.currentStep = nextId;

  const nextStep = getStep(nextId);

  if (nextId === "run_decision") {
    return {
      session,
      replyText: nextStep.ask(session),
      shouldRunDecision: true,
    };
  }

  return {
    session,
    replyText: nextStep.ask ? nextStep.ask(session) : "OK",
    shouldRunDecision: false,
  };
}

// Export por conveniencia
export { IG_PAYLOADS };
