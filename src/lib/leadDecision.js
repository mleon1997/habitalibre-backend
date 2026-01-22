// src/lib/leadDecision.js
// Calcula "decision" para que AdminLeads sea "sin pensar".
// No guarda nada en BD: se deriva de lead.resultado + campos rápidos.

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function roundPct(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function pickProducto(lead) {
  return (
    lead?.producto ||
    lead?.resultado?.productoSugerido ||
    lead?.resultado?.producto ||
    lead?.tipoProducto ||
    null
  );
}

// Intenta agarrar bancos desde cualquier shape razonable
function pickBancos(lead) {
  const r = lead?.resultado || {};
  const arr =
    r?.bancosTop3 ||
    r?.bancos ||
    r?.bancosRanking ||
    r?.bancosProbabilidad ||
    null;

  if (Array.isArray(arr)) return arr;

  // Si bancosProbabilidad es number (como en tu log), no hay detalle de bancos.
  return [];
}

function toTop3Bancos(lead) {
  const bancos = pickBancos(lead);

  // Si ya vienen con el shape ideal, respétalo.
  const norm = bancos
    .map((b) => {
      // Posibles keys: banco / name, tipoProducto / producto, dtiBanco / dti
      const banco = b?.banco || b?.name || b?.nombre || null;
      if (!banco) return null;

      const tipoProducto = b?.tipoProducto || b?.producto || b?.tipo || null;

      const probScoreRaw =
        b?.probScore ??
        b?.probabilidadScore ??
        b?.score ??
        null;

      const probScore = Number(probScoreRaw);
      const probScoreOk = Number.isFinite(probScore) ? clamp(probScore, 0, 100) : null;

      const probLabel =
        b?.probLabel ||
        b?.probabilidadLabel ||
        (probScoreOk != null
          ? probScoreOk >= 75
            ? "Alta"
            : probScoreOk >= 50
            ? "Media"
            : "Baja"
          : "—");

      const dtiBancoRaw = b?.dtiBanco ?? b?.dti ?? null;
      const dtiBanco = Number(dtiBancoRaw);
      const dtiBancoOk = Number.isFinite(dtiBanco) ? dtiBanco : null;

      return { banco, tipoProducto: tipoProducto || "—", probScore: probScoreOk, probLabel, dtiBanco: dtiBancoOk };
    })
    .filter(Boolean);

  return norm.slice(0, 3);
}

function buildRuta(lead) {
  const r = lead?.resultado || {};
  const producto = pickProducto(lead);

  // Intento de "ruta" mínima: tipo + cuota.
  return {
    tipo: r?.rutaRecomendada?.tipo || producto || r?.bancoSugerido || null,
    cuota: r?.cuotaEstimada ?? r?.cuota ?? null,
    tasaAnual: r?.tasaAnual ?? null,
    plazoMeses: r?.plazoMeses ?? null,
  };
}

/**
 * Heurística de "estado/heat/llamarHoy" basada en:
 * - DTI con hipoteca vs capacidadPago (si existe)
 * - LTV si existe
 * - Horizonte de compra
 * - Sustento ingresos (independiente)
 */
export function computeLeadDecision(lead) {
  const r = lead?.resultado || {};
  const dti = Number(r?.dtiConHipoteca);
  const ltv = Number(r?.ltv);

  const cuota = Number(r?.cuotaEstimada ?? r?.cuota ?? null);
  const capacidad = Number(r?.capacidadPago ?? null);

  const tiempoCompra = String(lead?.tiempoCompra || "").trim(); // 0-3, 3-12, 12-24, explorando
  const sustento = String(lead?.sustentoIndependiente || "").trim(); // declaracion/movimientos/ninguno

  const producto = pickProducto(lead);
  const ruta = buildRuta(lead);

  // -----------------------------
  // Faltantes (para avanzar)
  // -----------------------------
  const faltantes = [];
  const porQue = [];
  const nextActions = [];

  // Reglas simples
  if (!lead?.telefono && !lead?.email && !lead?.igUsername) {
    faltantes.push("Falta contacto (teléfono, email o IG)");
  }

  // Sustento para independientes: si no hay, se vuelve “rescatable”
  if (sustento === "ninguno") {
    faltantes.push("Sustento de ingresos (Declaración IR o movimientos 6 meses)");
    porQue.push("No hay sustento de ingresos para validar capacidad real");
    nextActions.push("Pedir Declaración de Impuesto a la Renta o movimientos bancarios 6 meses");
  }

  // Si no hay resultado, queda por_calificar
  const hasResult =
    r && Object.keys(r).length > 0 && (r?.productoSugerido || r?.cuotaEstimada || r?.dtiConHipoteca != null);

  // -----------------------------
  // Estado base
  // -----------------------------
  let estado = "por_calificar"; // bancable | rescatable | descartable | por_calificar
  let etapa = "Sin simulación";
  let scoreHL = lead?.scoreHL ?? null;

  if (hasResult) {
    etapa = "Simulación OK";

    // Score derivado si no viene scoreHL
    if (scoreHL == null) {
      // Score rough: DTI + LTV + horizonte (0..100)
      const dtiScore = Number.isFinite(dti) ? clamp(100 - dti * 120, 0, 100) : 55;
      const ltvScore = Number.isFinite(ltv) ? clamp(100 - ltv * 80, 0, 100) : 55;

      const hBonus =
        tiempoCompra === "0-3" ? 10 : tiempoCompra === "3-12" ? 6 : tiempoCompra === "12-24" ? 2 : 0;

      scoreHL = Math.round(clamp((dtiScore * 0.55 + ltvScore * 0.35 + hBonus), 0, 100));
    }

    // Decisión por DTI/capacidad
    const dtiOk = Number.isFinite(dti) ? dti <= 0.45 : null;
    const ltvOk = Number.isFinite(ltv) ? ltv <= 0.9 : null;

    // Si hay capacidadPago, úsala como señal fuerte
    let capacidadOk = null;
    if (Number.isFinite(cuota) && Number.isFinite(capacidad)) {
      capacidadOk = cuota <= capacidad;
    }

    // Estado
    if ((dtiOk === true || capacidadOk === true) && (ltvOk === null || ltvOk === true) && sustento !== "ninguno") {
      estado = "bancable";
      porQue.push("Capacidad de pago y DTI en rango razonable");
      nextActions.push("Agendar llamada y validar documentos básicos (rol de pagos / RUC / estados de cuenta)");
    } else {
      // Rescatable vs descartable
      // Si DTI muy alto o capacidad insuficiente → rescatable si hay acciones claras
      const dtiMuyAlto = Number.isFinite(dti) ? dti >= 0.60 : false;
      const ltvMuyAlto = Number.isFinite(ltv) ? ltv >= 0.95 : false;

      if (dtiMuyAlto || ltvMuyAlto || capacidadOk === false || sustento === "ninguno") {
        estado = "rescatable";
        porQue.push("Necesita ajustes para entrar en política (DTI/LTV o sustentos)");
        nextActions.push("Revisar deudas actuales y opciones para bajar DTI (plazo, precio, entrada, consolidación)");
        nextActions.push("Validar entrada disponible y plan de ahorro");
      } else {
        estado = "rescatable";
      }

      // Si claramente imposible por ahora (sin contacto + sin resultado + explorando)
      if (!hasResult && tiempoCompra === "explorando") {
        estado = "descartable";
        porQue.push("Sin simulación y en modo exploración");
        nextActions.push("Invitar a hacer simulación rápida para tener números reales");
      }
    }
  }

  // -----------------------------
  // Heat (0..3)
  // -----------------------------
  let heat = 1; // tibio default
  if (tiempoCompra === "0-3") heat = 3;
  else if (tiempoCompra === "3-12") heat = 2;
  else if (tiempoCompra === "12-24") heat = 1;
  else if (tiempoCompra === "explorando") heat = 0;

  // Ajuste por estado
  if (estado === "bancable") heat = clamp(heat + 1, 0, 3);
  if (estado === "descartable") heat = clamp(heat - 1, 0, 3);

  // -----------------------------
  // Llamar hoy
  // -----------------------------
  const llamarHoy =
    estado === "bancable" && (heat >= 2) && (!!lead?.telefono || !!lead?.email);

  // Bancos top 3 (si existe data)
  const bancosTop3 = toTop3Bancos(lead);

  return {
    llamarHoy,
    estado,
    heat,
    faltantes,
    porQue,
    nextActions,
    etapa,
    producto: producto || null,
    scoreHL: scoreHL != null ? Number(scoreHL) : null,
    ruta,
    bancosTop3,
    // Extras útiles para debug/UX
    dtiConHipoteca: Number.isFinite(dti) ? roundPct(dti) : null,
    ltv: Number.isFinite(ltv) ? roundPct(ltv) : null,
  };
}
