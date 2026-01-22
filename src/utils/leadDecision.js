// src/utils/leadDecision.js

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const hasText = (v) => v !== null && v !== undefined && String(v).trim() !== "";
const hasNum = (v) => typeof v === "number" && Number.isFinite(v);

function getResultado(lead) {
  return lead?.resultado || null;
}

// ---- Scores desde TU scoring.js (estructura real) ----
function getScoreHLTotal(lead) {
  const r = getResultado(lead);
  const t = r?.scoreHL?.total;
  return hasNum(t) ? t : null; // 0..100
}

function getScoreHabitaLibre(lead) {
  const r = getResultado(lead);
  const s = r?.puntajeHabitaLibre?.score;
  return hasNum(s) ? s : null; // 0..100
}

function getSinOferta(lead) {
  const r = getResultado(lead);
  return r?.flags?.sinOferta === true;
}

function getSinSustento(lead) {
  const r = getResultado(lead);
  return r?.flags?.sinSustento === true;
}

function getRutaRecomendada(lead) {
  const r = getResultado(lead);
  return r?.rutaRecomendada || null; // { tipo, cuota, tasa, ... }
}

function getBancosTop3(lead) {
  const r = getResultado(lead);
  return Array.isArray(r?.bancosTop3) ? r.bancosTop3 : [];
}

function getProducto(lead) {
  const r = getResultado(lead);
  return (
    r?.productoElegido ||
    r?.tipoCreditoElegido ||
    r?.productoSugerido ||
    lead?.producto ||
    null
  );
}

function getDTI(lead) {
  const r = getResultado(lead);
  return hasNum(r?.dtiConHipoteca) ? r.dtiConHipoteca : null; // 0..1
}

function getLTV(lead) {
  const r = getResultado(lead);
  return hasNum(r?.ltv) ? r.ltv : null; // 0..1
}

function getPerfil(lead) {
  const r = getResultado(lead);
  return r?.perfil || {};
}

// ======================================================
// ETAPA: raw | captured | scored
// ======================================================
function getEtapa(lead) {
  const r = getResultado(lead);
  const hasResult = !!r;
  const hasAnyScore =
    getScoreHLTotal(lead) != null || getScoreHabitaLibre(lead) != null;

  if (hasResult && hasAnyScore) return "scored";

  const hasContact = hasText(lead?.telefono) || hasText(lead?.email);
  if (hasContact) return "captured";

  return "raw";
}

// ======================================================
// FUENTES: web / instagram / whatsapp (multi-fuente posible)
// ======================================================
function fuentesFromLead(lead) {
  const fuentes = [];

  const canal = String(lead?.canal || "").toLowerCase();
  const fuente = String(lead?.fuente || "").toLowerCase();

  // Web
  if (canal === "web" || fuente === "form") fuentes.push("web");

  // ManyChat
  if (fuente === "manychat") {
    if (canal === "instagram" || hasText(lead?.igUsername)) fuentes.push("instagram");
    else fuentes.push("whatsapp");
  }

  // fallback canal si existe
  if (!fuentes.length && canal) fuentes.push(canal);

  return uniq(fuentes);
}

// ======================================================
// HEAT 0..3 (qué tan “caliente”)
// ======================================================
function heatScore(lead) {
  const etapa = getEtapa(lead);
  const fuentes = fuentesFromLead(lead);

  let heat = 0;

  // Llegó por algún canal
  if (fuentes.length) heat = 1;

  // Captured: dejó contacto
  if (etapa === "captured") heat = 2;

  // Scored: completó simulación
  if (etapa === "scored") heat = 3;

  // Horizonte corto sube heat (si existe)
  const h = String(lead?.tiempoCompra || "").toLowerCase();
  const corto =
    h.includes("0-3") || h.includes("0–3") || h.includes("0 a 3") || h.includes("0- 3");
  if (corto) heat = Math.max(heat, 3);

  return clamp(heat, 0, 3);
}

// ======================================================
// FALTANTES (qué le falta para avanzar)
// ======================================================
function faltantesParaAvanzar(lead) {
  const etapa = getEtapa(lead);
  const faltan = [];

  if (!hasText(lead?.telefono) && !hasText(lead?.email)) {
    faltan.push("Contacto (teléfono o email)");
  }

  // Si no hay scoring todavía
  if (etapa !== "scored") {
    faltan.push("Completar simulación (Hipoteca Exprés)");
    // Puedes pedir 2-3 datos mínimos
    if (!hasNum(lead?.ingreso_mensual)) faltan.push("Ingreso mensual aprox");
    if (!hasNum(lead?.deuda_mensual_aprox)) faltan.push("Deudas mensuales aprox");
    return uniq(faltan);
  }

  // Scored: faltantes críticos según resultado
  const r = getResultado(lead);
  const perfil = getPerfil(lead);
  const ruta = getRutaRecomendada(lead);
  const tipoIngreso = String(perfil?.tipoIngreso || "").toLowerCase();

  // Independiente/Mixto: sustento
  if (
    (tipoIngreso === "independiente" || tipoIngreso === "mixto") &&
    perfil?.sustentoOKGlobal === false
  ) {
    faltan.push("Sustento de ingresos (RUC / declaraciones / facturación / roles)");
  }

  // BIESS: aportes
  const rutaTipo = String(ruta?.tipo || "").toLowerCase();
  if (rutaTipo.includes("biess")) {
    const apTot = Number(perfil?.iessAportesTotales || 0);
    const apCon = Number(perfil?.iessAportesConsecutivos || 0);
    if (apTot < 36) faltan.push("Aportes IESS totales (mín. 36 meses)");
    if (apCon < 13) faltan.push("Aportes IESS consecutivos (mín. 13 meses)");
  }

  // Sin oferta: requiere ajuste
  if (r?.flags?.sinOferta) {
    faltan.push("Ajustar entrada / deudas / valor de vivienda para volverlo viable");
  }

  return uniq(faltan);
}

// ======================================================
// Decisión principal (estado + llamar hoy + copy)
// ======================================================
function decidir(lead) {
  const etapa = getEtapa(lead);
  const fuentes = fuentesFromLead(lead);
  const heat = heatScore(lead);
  const faltantes = faltantesParaAvanzar(lead);

  const porQue = [];
  const nextActions = [];

  const tieneTelefono = hasText(lead?.telefono);
  const horizonte = String(lead?.tiempoCompra || "").toLowerCase();
  const horizonteCorto =
    horizonte.includes("0-3") || horizonte.includes("0–3") || horizonte.includes("0 a 3");

  // ==============================
  // 1) ETAPA NO SCORED (ManyChat)
  // ==============================
  if (etapa !== "scored") {
    const estado = "por_calificar";

    // ¿vale llamada hoy?
    // - si hay teléfono y (heat>=2) y (horizonte corto o viene de whatsapp)
    const vieneWhatsapp = fuentes.includes("whatsapp");
    const llamarHoy = !!(tieneTelefono && heat >= 2 && (horizonteCorto || vieneWhatsapp));

    if (fuentes.length) porQue.push(`Llegó por: ${fuentes.join(" + ")}`);
    if (horizonteCorto) porQue.push("Quiere comprar en 0–3 meses.");
    if (!tieneTelefono) porQue.push("No hay teléfono todavía (difícil llamar).");

    nextActions.push("Enviar link de Hipoteca Exprés (simulación completa).");
    nextActions.push("Si responde, pedir 3 datos: ingreso, deudas, entrada.");
    if (tieneTelefono) nextActions.push("WhatsApp: agendar mini-llamada 5 min.");

    return {
      etapa,
      estado,
      llamarHoy,
      heat,
      fuentes,
      producto: getProducto(lead),
      scoreHL: null,
      scoreHabitaLibre: null,
      bancosTop3: [],
      ruta: null,
      faltantes,
      porQue,
      nextActions,
    };
  }

  // ==============================
  // 2) ETAPA SCORED (Web completo)
  // ==============================
  const sinOferta = getSinOferta(lead);
  const sinSustento = getSinSustento(lead);

  const scoreHL = getScoreHLTotal(lead);
  const scoreHB = getScoreHabitaLibre(lead);
  const bancosTop3 = getBancosTop3(lead);
  const ruta = getRutaRecomendada(lead);
  const producto = getProducto(lead);

  const dti = getDTI(lead);
  const ltv = getLTV(lead);

  // Señales “por qué”
  if (ruta?.tipo) porQue.push(`Ruta recomendada: ${ruta.tipo}`);

  const mejorBanco = bancosTop3?.[0] || null;
  if (mejorBanco?.probLabel) {
    porQue.push(
      `Probabilidad: ${mejorBanco.probLabel}${
        hasNum(mejorBanco.probScore) ? ` (${mejorBanco.probScore}/100)` : ""
      }`
    );
  }

  if (hasNum(dti)) porQue.push(`DTI con hipoteca: ${(dti * 100).toFixed(0)}%`);
  if (hasNum(ltv)) porQue.push(`LTV estimado: ${(ltv * 100).toFixed(0)}%`);

  if (sinSustento) porQue.push("Bloqueo: falta sustento claro de ingresos.");
  if (sinOferta) porQue.push("El motor marcó: Sin oferta viable hoy.");

  // Faltante crítico
  const tieneFaltanteCritico = faltantes.some((f) => {
    const s = String(f).toLowerCase();
    return (
      s.includes("sustento") ||
      s.includes("aportes") ||
      s.includes("ajustar")
    );
  });

  // Estado por reglas
  let estado = "rescatable";

  // Si sinOferta → rara vez bancable
  if (sinOferta) {
    estado = heat >= 3 && tieneTelefono ? "rescatable" : "descartable";
  } else {
    const probScore = hasNum(mejorBanco?.probScore) ? mejorBanco.probScore : null;
    const probLabel = mejorBanco?.probLabel || null;

    if (
      (probLabel === "Alta" || (probScore != null && probScore >= 80) || (scoreHL != null && scoreHL >= 75)) &&
      !tieneFaltanteCritico
    ) {
      estado = "bancable";
    } else if (
      probLabel === "Muy baja" ||
      (probScore != null && probScore < 40) ||
      (scoreHL != null && scoreHL < 45)
    ) {
      estado = "descartable";
    } else {
      estado = "rescatable";
    }
  }

  // ¿Llamar hoy?
  // - bancable: siempre sí
  // - rescatable: sí si hay teléfono
  // - descartable: no
  const llamarHoy =
    estado === "bancable" ? true : estado === "rescatable" ? !!tieneTelefono : false;

  // Next actions por estado
  if (estado === "bancable") {
    nextActions.push("Llamar hoy y agendar asesoría (15 min).");
    nextActions.push("Pedir documentos clave (roles/RUC + buró + entrada).");
  } else if (estado === "rescatable") {
    nextActions.push("Contactar hoy para completar faltantes críticos.");
    nextActions.push("Enviar ejemplo de cómo mejorar entrada/deudas.");
  } else {
    nextActions.push("No priorizar llamada. Nutrir por WhatsApp con contenido educativo.");
  }

  return {
    etapa,
    estado,
    llamarHoy,
    heat,
    fuentes,
    producto,
    scoreHL,
    scoreHabitaLibre: scoreHB,
    bancosTop3,
    ruta,
    faltantes,
    porQue,
    nextActions,
  };
}

export function attachDecision(lead) {
  return {
    ...lead,
    decision: decidir(lead),
  };
}

export function buildDecisionOnly(lead) {
  return decidir(lead);
}
