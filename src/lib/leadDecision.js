// src/lib/leadDecision.js

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v) {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function pickResultado(lead) {
  return lead?.resultado && typeof lead.resultado === "object" ? lead.resultado : null;
}

function pickFlags(res) {
  const f = res?.flags && typeof res.flags === "object" ? res.flags : {};
  return f;
}

function pickBancosTop3(res) {
  const list = res?.bancosProbabilidad || res?.bancos || res?.bancosTop3 || null;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 3).map((b) => {
    if (typeof b === "string") return { nombre: b };
    return {
      nombre: b.nombre || b.banco || b.name || null,
      prob: num(b.prob || b.p || b.probabilidad),
      producto: b.producto || b.tipo || null,
    };
  }).filter(Boolean);
}

function buildRuta(res) {
  // Ruta recomendada “simple” para tu UI
  return {
    producto: res?.productoSugerido || res?.productoElegido || res?.tipoCreditoElegido || res?.producto || null,
    banco: res?.bancoSugerido || null,
    tasaAnual: num(res?.tasaAnual),
    plazoMeses: num(res?.plazoMeses),
    cuota: num(res?.cuotaEstimada),
  };
}

/**
 * leadDecision(leadDocAsPlainObject) -> decision object
 * Alineado a tu schema:
 * decision: { estado, heat, llamarHoy, etapa, faltantes, porQue, nextActions, ruta, bancosTop3, scoreHL, dti, ltv, cuota, capacidadPago, producto, computedAt }
 */
export function leadDecision(lead = {}) {
  const res = pickResultado(lead);
  const flags = pickFlags(res);

  // Campos planos que YA estás guardando
  const ingreso = num(lead?.ingreso_mensual);
  const deudas = num(lead?.deuda_mensual_aprox);
  const aniosEst = num(lead?.anios_estabilidad);
  const afiliadoIess = bool(lead?.afiliado_iess);

  const tiempoCompra = lead?.tiempoCompra || lead?.tiempo_compra || null;

  // Del resultado normalizado
  const dti = num(res?.dtiConHipoteca);
  const ltv = num(res?.ltv);
  const cuota = num(res?.cuotaEstimada);
  const cap = num(res?.capacidadPago);
  const producto = res?.productoSugerido || res?.productoElegido || res?.tipoCreditoElegido || lead?.producto || null;

  // Score HL (si existe)
  const scoreHL =
    (res?.puntajeHabitaLibre && typeof res.puntajeHabitaLibre.score === "number" ? res.puntajeHabitaLibre.score : null) ??
    (typeof res?.scoreHL === "number" ? res.scoreHL : null) ??
    (typeof lead?.scoreHL === "number" ? lead.scoreHL : null);

  // -----------------------------
  // Faltantes mínimos operativos
  // -----------------------------
  const faltantes = [];

  // Identidad mínima para acción
  const tieneContacto = !!(lead?.telefono || lead?.email || lead?.igUsername || lead?.manychatSubscriberId);
  if (!tieneContacto) faltantes.push("Contacto (teléfono o email)");

  // Para poder “calificar” bien
  if (ingreso == null) faltantes.push("Ingreso mensual");
  if (deudas == null) faltantes.push("Deudas mensuales");
  if (aniosEst == null) faltantes.push("Estabilidad laboral");
  if (afiliadoIess == null) faltantes.push("¿Afiliado al IESS?");
  if (!tiempoCompra) faltantes.push("Horizonte de compra");

  // -----------------------------
  // Reglas principales
  // -----------------------------
  const sinOferta = flags?.sinOferta === true;

  // Umbrales razonables (ajustables)
  const DTI_ALTO = 0.55;
  const LTV_ALTO = 0.90;

  const porQue = [];
  const nextActions = [];

  // Etapa
  let etapa = "nuevo";
  if (faltantes.length > 0) etapa = "captura_incompleta";
  else etapa = "precalificado";

  // Estado (bucket) alineado a schema: bancable/rescatable/descartable/por_calificar
  let estado = "por_calificar";

  if (faltantes.length > 0) {
    estado = "por_calificar";
    porQue.push("Faltan datos para calificar bien.");
    nextActions.push("Pedir datos faltantes (ingreso, deudas, estabilidad, IESS, horizonte).");
  } else if (sinOferta) {
    estado = "descartable";
    porQue.push("El motor marcó sin oferta viable con la información actual.");
    nextActions.push("Confirmar datos (ingreso/deudas/entrada) y explorar alternativas (entrada mayor o menor valor).");
  } else {
    // Ya tenemos base
    const dtiAlto = dti != null && dti >= DTI_ALTO;
    const ltvAlto = ltv != null && ltv >= LTV_ALTO;

    if (dtiAlto || ltvAlto) {
      estado = "rescatable";
      if (dtiAlto) porQue.push("DTI alto (cuota vs ingreso) con el perfil actual.");
      if (ltvAlto) porQue.push("LTV alto (entrada baja) con el perfil actual.");
      nextActions.push("Sugerir subir entrada o bajar deudas para mejorar aprobación.");
      nextActions.push("Validar si hay ingresos adicionales demostrables o co-deudor.");
    } else {
      estado = "bancable";
      porQue.push("Perfil con métricas dentro de rangos comunes (DTI/LTV).");
      nextActions.push("Llamar y agendar asesoría.");
      nextActions.push("Solicitar documentos (rol de pagos, RUC/IR, buró, etc.).");
    }
  }

  // -----------------------------
  // Heat (0..3)
  // -----------------------------
  // Heurística simple:
  // 3: bancable + horizonte corto (0-3 / 0-6)
  // 2: bancable sin horizonte corto o rescatable con horizonte corto
  // 1: rescatable normal
  // 0: descartable o por_calificar
  const horizonteLower = String(tiempoCompra || "").toLowerCase();
  const horizonteCorto =
    horizonteLower.includes("0-3") ||
    horizonteLower.includes("0–3") ||
    horizonteLower.includes("0-6") ||
    horizonteLower.includes("0–6") ||
    horizonteLower.includes("0–6") ||
    horizonteLower.includes("0-6 meses");

  let heat = 0;
  if (estado === "bancable" && horizonteCorto) heat = 3;
  else if (estado === "bancable") heat = 2;
  else if (estado === "rescatable" && horizonteCorto) heat = 2;
  else if (estado === "rescatable") heat = 1;
  else heat = 0;

  const llamarHoy = heat >= 3;

  // Ruta y bancos
  const ruta = buildRuta(res);
  const bancosTop3 = pickBancosTop3(res);

  return {
    estado,
    heat,
    llamarHoy,
    etapa,
    faltantes,
    porQue,
    nextActions,
    ruta,
    bancosTop3,

    // snapshot métricas
    scoreHL: scoreHL != null ? scoreHL : null,
    dti: dti != null ? dti : null,
    ltv: ltv != null ? ltv : null,
    cuota: cuota != null ? cuota : null,
    capacidadPago: cap != null ? cap : null,
    producto: producto || null,

    computedAt: new Date(),
  };
}

// ✅ compat si en algún lado llaman computeLeadDecision
export function computeLeadDecision(lead) {
  return leadDecision(lead);
}

// ✅ compat con tu controller si llegas a usar buildLeadDecision
export function buildLeadDecision({ lead, resultado } = {}) {
  const safeLead = lead ? { ...lead } : {};
  if (resultado && !safeLead.resultado) safeLead.resultado = resultado;
  return leadDecision(safeLead);
}
