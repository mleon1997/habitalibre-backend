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
 * - ✅ IMPORTANTÍSIMO: reinyecta campos numéricos “flat” (DTI/cuota/cap/ltv/montos)
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
    (Array.isArray(r.bancosProbabilidad) &&
      (r.bancosProbabilidad[0]?.banco || r.bancosProbabilidad[0]?.nombre)) ||
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

  // ✅ “flat fields” (los que tu PDF necesita)
  const montoMaximo = toNum(r.montoMaximo ?? r.montoPrestamoMax ?? r.prestamoMax, NaN);
  const precioMaxVivienda = toNum(
    r.precioMaxVivienda ?? r.precioMax ?? r.valorMaxVivienda,
    NaN
  );
  const ltv = toNum(r.ltv, NaN);
  const dtiConHipoteca = toNum(r.dtiConHipoteca, NaN);
  const cuotaEstimada = toNum(r.cuotaEstimada, NaN);
  const entradaDisponible = toNum(r.entradaDisponible ?? r.perfil?.entradaDisponible, NaN);
  const valorVivienda = toNum(r.valorVivienda ?? r.perfil?.valorVivienda, NaN);

  const R = {
    capacidadPago,
    montoMaximo,
    precioMaxVivienda,
    ltv,
    dtiConHipoteca,
    cuotaEstimada,
    entradaDisponible,
    valorVivienda,
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

  // ✅ REINYECCIÓN: si el motor ya trae el campo, se respeta; si no, se completa con R.*
  const out = {
    ...r,
    flags,
    escenariosHL,
    productoSugerido,
    bancoSugerido,

    // claves para PDF/UI
    capacidadPago: typeof r.capacidadPago === "number" ? r.capacidadPago : (isNum(capacidadPago) ? capacidadPago : r.capacidadPago),
    montoMaximo: typeof r.montoMaximo === "number" ? r.montoMaximo : (isNum(montoMaximo) ? montoMaximo : r.montoMaximo),
    precioMaxVivienda: typeof r.precioMaxVivienda === "number" ? r.precioMaxVivienda : (isNum(precioMaxVivienda) ? precioMaxVivienda : r.precioMaxVivienda),
    ltv: typeof r.ltv === "number" ? r.ltv : (isNum(ltv) ? ltv : r.ltv),
    dtiConHipoteca: typeof r.dtiConHipoteca === "number" ? r.dtiConHipoteca : (isNum(dtiConHipoteca) ? dtiConHipoteca : r.dtiConHipoteca),
    cuotaEstimada: typeof r.cuotaEstimada === "number" ? r.cuotaEstimada : (isNum(cuotaEstimada) ? cuotaEstimada : r.cuotaEstimada),
    entradaDisponible: typeof r.entradaDisponible === "number" ? r.entradaDisponible : (isNum(entradaDisponible) ? entradaDisponible : r.entradaDisponible),
    valorVivienda: typeof r.valorVivienda === "number" ? r.valorVivienda : (isNum(valorVivienda) ? valorVivienda : r.valorVivienda),

    _echo: r._echo || {},
  };

  return out;
}

export default normalizeResultadoParaSalida;
