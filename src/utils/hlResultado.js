// src/utils/hlResultado.js

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const toNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/**
 * Heurística SOLO si el motor no definió sinOferta.
 * Regla clave:
 * - Si ya hay producto/banco sugerido, NO es sin oferta (hay oferta sugerida).
 * - Luego aplicamos reglas numéricas (cuota>cap, etc.)
 */
function heuristicaSinOferta(R = {}, ctx = {}) {
  // ✅ Si ya hay sugerencia del motor, no es "sin oferta"
  if (ctx?.productoSugerido || ctx?.bancoSugerido) return false;

  const montoMax = R.montoMaximo;
  const precioMax = R.precioMaxVivienda;
  const cap = R.capacidadPago;

  // Si no hay señales, asumimos perfil en construcción
  const noSignals =
    !isNum(montoMax) ||
    montoMax <= 0 ||
    !isNum(precioMax) ||
    precioMax <= 0 ||
    !isNum(cap) ||
    cap <= 0;

  if (noSignals) return true;

  // ✅ Regla fuerte: si la cuota estimada supera capacidad => no sostenible
  if (isNum(R.cuotaEstimada) && isNum(cap) && R.cuotaEstimada > cap) return true;

  // Reglas suaves (NO uses DTI>0.5 como "sin oferta": hay programas que igual aplican)
  // Si quieres mantenerlas, súbelas bastante o bórralas:
  // if (isNum(R.dtiConHipoteca) && R.dtiConHipoteca > 0.65) return true;
  // if (isNum(R.ltv) && R.ltv > 0.93) return true;

  return false;
}

/**
 * Normaliza el resultado del motor para que PDF/UI tengan:
 * - flags.sinOferta CONSISTENTE (NO se pisa si viene del motor)
 * - productoSugerido / bancoSugerido “flat”
 * - escenariosHL priorizado
 * - objetos siempre definidos (flags/_echo)
 */
export function normalizeResultadoParaSalida(resultadoRaw = {}) {
  const r = resultadoRaw || {};
  const flags = { ...(r.flags || {}) };

  // Producto sugerido (flat)
  const productoSugerido =
    r.productoSugerido ||
    r.productoElegido ||
    r.productoElegidoFinal ||
    r.tipoCreditoSugerido ||
    r.tipoCreditoElegido ||
    r.rutaRecomendada?.tipo ||
    null;

  // Banco sugerido (flat)
  const bancoSugerido =
    r.bancoSugerido ||
    r.mejorBanco?.banco ||
    r.mejorBanco?.nombre ||
    (Array.isArray(r.bancosTop3) &&
      (r.bancosTop3[0]?.banco || r.bancosTop3[0]?.nombre)) ||
    null;

  // ✅ Capacidad: prioriza capacidadPagoPrograma
  const capacidadPago = toNum(
    r.capacidadPagoPrograma ??
      r.capacidadPago ??
      r.capacidadPagoGlobal ??
      r.bounds?.capacidadPago ??
      r.perfil?.capacidadPago,
    NaN
  );

  const R = {
    capacidadPago,
    montoMaximo: toNum(r.montoMaximo ?? r.montoPrestamoMax ?? r.prestamoMax, NaN),
    precioMaxVivienda: toNum(r.precioMaxVivienda ?? r.precioMax ?? r.valorMaxVivienda, NaN),
    ltv: toNum(r.ltv, NaN),
    dtiConHipoteca: toNum(r.dtiConHipoteca, NaN),
    cuotaEstimada: toNum(r.cuotaEstimada, NaN),
    entradaDisponible: toNum(r.entradaDisponible ?? r.perfil?.entradaDisponible, NaN),
    valorVivienda: toNum(r.valorVivienda ?? r.perfil?.valorVivienda, NaN),
  };

  /**
   * ✅ sinOferta FINAL (regla de oro):
   * 1) Si viene boolean desde el motor en flags.sinOferta -> SE RESPETA (no se recalcula)
   * 2) Si no, si viene r.sinOferta boolean -> se usa
   * 3) Si no, heurística (pero NO marca sinOferta si ya hay sugerencia)
   */
  let sinOferta;
  if (typeof flags.sinOferta === "boolean") {
    sinOferta = flags.sinOferta;
  } else if (typeof r.sinOferta === "boolean") {
    sinOferta = r.sinOferta;
  } else {
    sinOferta = heuristicaSinOferta(R, { productoSugerido, bancoSugerido });
  }

  flags.sinOferta = !!sinOferta;

  // Escenarios: prioriza el “nuevo”
  const escenariosHL = r.escenariosHL || r.escenarios || null;

  return {
    ...r,
    flags,
    escenariosHL,
    productoSugerido,
    bancoSugerido,
    _echo: r._echo || {},
  };
}

export default normalizeResultadoParaSalida;
