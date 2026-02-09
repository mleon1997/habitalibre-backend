// src/lib/leadDecision.js

const n = (v, def = null) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
};

const b = (v, def = null) => {
  if (v === true || v === false) return v;
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (["si", "sí", "true", "1", "yes", "y"].includes(s)) return true;
  if (["no", "false", "0", "n"].includes(s)) return false;
  return def;
};

function normalizeHorizonte(h) {
  const t = String(h || "").toLowerCase().trim();
  if (t.includes("0") || t.includes("0-3")) return "0-3";
  if (t.includes("3") && t.includes("12")) return "3-12";
  if (t.includes("12") && t.includes("24")) return "12-24";
  if (t.includes("expl")) return "explorando";
  return null;
}

/**
 * ✅ Fuente de verdad: resultado.__entrada (o perfilInput)
 * Fallback: campos legacy del lead
 */
function getEntrada(lead) {
  const r = lead?.resultado || {};
  const e = r?.__entrada || r?.perfilInput || {};

  return {
    // compra
    valorVivienda: n(e?.valorVivienda, n(lead?.valor_vivienda)),
    entradaDisponible: n(e?.entradaDisponible, n(lead?.entrada_disponible)),

    // datos duros
    ingresoNetoMensual: n(e?.ingresoNetoMensual, n(lead?.ingreso_mensual)),
    otrasDeudasMensuales: n(e?.otrasDeudasMensuales, n(lead?.deuda_mensual_aprox)),
    aniosEstabilidad: n(e?.aniosEstabilidad, n(lead?.anios_estabilidad)),

    // boolean robusto
    afiliadoIess: b(
      e?.afiliadoIess,
      b(lead?.afiliado_iess, null)
    ),
  };
}

function completeness(lead) {
  const e = getEntrada(lead);

  // “datos duros” mínimos para scoring real
  const hasIngreso = n(e.ingresoNetoMensual) != null;
  const hasDeudas = n(e.otrasDeudasMensuales) != null;
  const hasEstab = n(e.aniosEstabilidad) != null;
  const hasIess = e.afiliadoIess !== null && e.afiliadoIess !== undefined;

  const hardCount = [hasIngreso, hasDeudas, hasEstab, hasIess].filter(Boolean).length;

  // datos de compra
  const hasValor = n(e.valorVivienda) != null;
  const hasEntrada = n(e.entradaDisponible) != null;

  const buyCount = [hasValor, hasEntrada].filter(Boolean).length;

  return {
    e,
    hasIngreso,
    hasDeudas,
    hasEstab,
    hasIess,
    hasValor,
    hasEntrada,
    hardCount,
    buyCount,
    score: Math.round(((hardCount + buyCount) / 6) * 100),
  };
}

export function leadDecision(lead) {
  const horizonte = normalizeHorizonte(lead.tiempoCompra);
  const canal = String(lead.canal || lead?.metadata?.canal || "web").toLowerCase();

  const r = lead.resultado || {};

  // Score HL (si existe en lead.scoreHL o si algún día lo guardas en resultado.scoreHL.total)
  const scoreHL = lead.scoreHL ?? r?.scoreHL?.total ?? r?.scoreHL ?? null;

  const sinOferta = !!(r?.flags?.sinOferta);

  // DTI/LTV: intenta leer del resultado; si no están, quedan null (no rompe nada)
  const dti = n(r?.dtiConHipoteca ?? r?.precalificacion?.dtiConHipoteca);
  const ltv = n(r?.ltv ?? r?.precalificacion?.ltv);

  const comp = completeness(lead);

  const missing = [];
  if (!comp.hasIngreso) missing.push("Ingreso mensual");
  if (!comp.hasDeudas) missing.push("Deudas mensuales");
  if (!comp.hasEstab) missing.push("Años de estabilidad");
  if (!comp.hasIess) missing.push("¿Afiliado al IESS?");
  if (!comp.hasValor) missing.push("Valor de vivienda");
  if (!comp.hasEntrada) missing.push("Entrada disponible");

  // -------------------------
  // Heat (0–100)
  // -------------------------
  let heat = 30;
  if (horizonte === "0-3") heat += 40;
  else if (horizonte === "3-12") heat += 25;
  else if (horizonte === "12-24") heat += 10;
  else if (horizonte === "explorando") heat -= 10;

  // canal
  if (canal === "whatsapp") heat += 10;
  if (canal === "instagram") heat += 5;

  // si ya tenemos score o resultado, sube
  if (scoreHL != null) heat += 10;

  // baja si falta demasiada data
  if (comp.score < 50) heat -= 15;

  heat = Math.max(0, Math.min(100, heat));

  // -------------------------
  // Clasificación Bancable / Rescatable / Descartable
  // -------------------------
  let stage = "captura_incompleta";
  let bucket = "rescatable";
  const reasons = [];

  if (missing.length >= 4) {
    stage = "necesita_info";
    bucket = "rescatable";
    reasons.push("Falta información clave para evaluar bancabilidad.");
  } else {
    // ya hay data suficiente o resultado
    stage = "evaluado";

    if (sinOferta === true) {
      bucket = "rescatable";
      reasons.push("Sin oferta viable hoy según motor.");
    } else {
      // reglas simples de bancabilidad operativa
      const dtiBad = dti != null && dti > 0.45;
      const ltvBad = ltv != null && ltv > 0.90;

      if (!dtiBad && !ltvBad) {
        bucket = "bancable";
        reasons.push("DTI/LTV dentro de rangos razonables.");
      } else {
        bucket = "rescatable";
        if (dtiBad) reasons.push("DTI alto: requiere bajar deudas o subir ingreso.");
        if (ltvBad) reasons.push("LTV alto: requiere mayor entrada o menor inmueble.");
      }
    }
  }

  // -------------------------
  // ¿Llamada hoy?
  // -------------------------
  let callToday = false;
  if (heat >= 65) callToday = true;
  if (bucket === "bancable" && (horizonte === "0-3" || horizonte === "3-12")) callToday = true;

  // Si está incompleto, llamada solo si es caliente (para completar datos)
  if (stage === "necesita_info" && heat >= 75) callToday = true;

  // Descartable (muy raro): horizonte explorando + incompleto + frío
  if (horizonte === "explorando" && comp.score < 35 && heat < 30) {
    bucket = "descartable";
    reasons.push("Bajo interés + información insuficiente.");
    callToday = false;
  }

  return {
    callToday,
    bucket,            // bancable | rescatable | descartable
    stage,             // captura_incompleta | necesita_info | evaluado
    heat,              // 0-100
    missing,           // lista
    reasons,           // por qué

    // (Opcional) útil para debug/QA sin ir a Mongo:
    // entrada: comp.e,
  };
}
