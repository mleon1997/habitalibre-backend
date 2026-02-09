// src/services/igConversationEngine.js

function normalizeText(s) {
  return String(s || "").trim();
}

function normalizeMoney(input) {
  const s = normalizeText(input)
    .toLowerCase()
    .replace(/usd|dolares|dólares|\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")     // "1.200" -> "1200"
    .replace(/,/g, ".");    // tolera coma decimal

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
  ) return "solo";

  if (
    s.includes("pareja") ||
    s.includes("espos") ||
    s.includes("novi") ||
    s.includes("juntos") ||
    s.includes("los dos") ||
    s === "2" ||
    s.includes("dos")
  ) return "pareja";

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

const STEPS = {
  start: {
    ask: () =>
      "Hola 👋 Bienvenido a HabitaLibre.\n\nTe ayudo a saber si podrías comprar casa en Ecuador, sin compromiso.\n\nPara empezar:\n👉 ¿Quieres comprar SOLO o EN PAREJA?",
    next: () => "solo_pareja",
  },

  solo_pareja: {
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
 * - Usa session.currentStep
 * - Si el step espera input: parse/validate/onSuccess/next
 * - Si el step es “ask-only”: avanza y pregunta
 */
export async function runConversationTurn(session, inboundText) {
  const text = normalizeText(inboundText);

  if (text.toLowerCase().includes("precalificar")) {
    session.status = "active";
    session.currentStep = "start";
  }

  const step = getStep(session.currentStep);

  if (step.parse) {
    const parsed = step.parse(text);
    const ok = step.validate ? step.validate(parsed) : parsed != null;

    if (!ok) {
      session.attempts[session.currentStep] =
        (session.attempts[session.currentStep] || 0) + 1;

      const msg = step.retry ? step.retry(session) : "No entendí. ¿Puedes repetirlo?";
      return { session, replyText: msg, shouldRunDecision: false };
    }

    if (step.onSuccess) step.onSuccess(session, parsed, text);

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

  // ask-only step
  const nextId = step.next ? step.next(session) : "start";
  session.currentStep = nextId;

  const nextStep = getStep(nextId);
  return {
    session,
    replyText: nextStep.ask ? nextStep.ask(session) : "OK",
    shouldRunDecision: false,
  };
}
