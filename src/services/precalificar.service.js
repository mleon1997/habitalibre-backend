// src/services/precalificar.service.js
import { evaluarProbabilidadPorBanco } from "../lib/scoring.js";
import { normalizeResultadoParaSalida } from "../utils/hlResultado.js";

/* --------- helpers --------- */
const toNum = (v, def = 0) => {
  if (v == null) return def;
  const s = String(v).trim();
  if (!s) return def;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : def;
};

const toNumOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const toBoolOrNull = (v) => {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (v == null) return null;

  const s = String(v).trim().toLowerCase();
  if (!s) return null;

  if (["true", "1", "sí", "si", "s", "y", "yes"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;

  return null;
};

const pickFirstDefined = (...vals) => {
  for (const v of vals) {
    if (v !== undefined) return v;
  }
  return undefined;
};

const pickFirstNonNull = (...vals) => {
  for (const v of vals) {
    if (v != null) return v;
  }
  return null;
};

const pickNumber = (...vals) => {
  for (const v of vals) {
    const n = toNumOrNull(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const pickBool = (...vals) => {
  for (const v of vals) {
    if (typeof v === "boolean") return v;
  }
  return undefined;
};

const normString = (v, def = null) => {
  const s = String(v ?? "").trim();
  return s ? s : def;
};

const normTipoIngreso = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s;
};

function enrichBancoConEscenario(banco, escenariosHL = {}) {
  const tipo = String(banco?.tipoProducto || "").toUpperCase();

  let esc = null;

  if (tipo === "VIP") {
    esc = escenariosHL?.vip || null;
  } else if (tipo === "VIS") {
    esc = escenariosHL?.vis || null;
  } else if (tipo === "BIESS") {
    esc =
      escenariosHL?.biess ||
      escenariosHL?.biess_pref ||
      escenariosHL?.biess_std ||
      null;
  } else if (
    tipo === "NORMAL" ||
    tipo === "PRIVADA" ||
    tipo === "COMERCIAL"
  ) {
    esc = escenariosHL?.comercial || null;
  }

  return {
    ...banco,
    tasaAnual: esc?.tasaAnual ?? null,
    cuota: esc?.cuota ?? null,
    montoPrestamo: esc?.montoPrestamo ?? null,
    plazoMeses: esc?.plazoMeses ?? null,
    ltvMax: esc?.ltvMax ?? null,
    precioMaxVivienda: esc?.precioMaxVivienda ?? null,
  };
}

/**
 * ✅ Normalizador PRO de input
 * Acepta input nuevo, legacy y campos planos del Lead (snake_case)
 */
export function normalizarInputHL(body = {}) {
  const afiliadoRaw = pickFirstNonNull(
    body.afiliadoIess,
    body.afiliadoIESS,
    body.afiliado_iess,
    body.afiliado_iess_bool,
    body.afiliado,
    body?.perfil?.afiliadoIess,
    body?.perfil?.afiliado_iess,
    body?.metadata?.perfil?.afiliadoIess
  );

  const iessAportesTotales = toNum(
    pickFirstNonNull(
      body.iessAportesTotales,
      body.aportesTotales,
      body.iess_totales,
      body.iess_aportes_totales,
      body?.perfil?.iessAportesTotales,
      body?.metadata?.perfil?.iessAportesTotales
    ),
    0
  );

  const iessAportesConsecutivos = toNum(
    pickFirstNonNull(
      body.iessAportesConsecutivos,
      body.iessAportesConsecutivas,
      body.aportesConsecutivos,
      body.iess_aportes_consecutivos,
      body?.perfil?.iessAportesConsecutivos,
      body?.metadata?.perfil?.iessAportesConsecutivos
    ),
    0
  );

  const ingresoNetoMensual = toNum(
    pickFirstNonNull(
      body.ingresoNetoMensual,
      body.ingreso_mensual,
      body.ingresoMensual,
      body.ingreso,
      body?.perfil?.ingresoTotal,
      body?.perfil?.ingresoNetoMensual,
      body?.metadata?.perfil?.ingresoTotal
    ),
    0
  );

  const ingresoPareja = toNum(
    pickFirstNonNull(
      body.ingresoPareja,
      body.ingreso_pareja,
      body?.perfil?.ingresoPareja,
      0
    ),
    0
  );

  const otrasDeudasMensuales = toNum(
    pickFirstNonNull(
      body.otrasDeudasMensuales,
      body.deuda_mensual_aprox,
      body.otras_deudas_mensuales,
      body.deudas,
      body?.perfil?.otrasDeudasMensuales,
      body?.metadata?.perfil?.otrasDeudasMensuales
    ),
    0
  );

  const valorVivienda = toNum(
    pickFirstNonNull(
      body.valorVivienda,
      body.valor_vivienda,
      body.precioVivienda,
      body.precio_vivienda,
      body.valor,
      body?.perfil?.valorVivienda,
      body?.metadata?.perfil?.valorVivienda
    ),
    0
  );

  const entradaDisponible = toNum(
    pickFirstNonNull(
      body.entradaDisponible,
      body.entrada_disponible,
      body.entradaUsd,
      body.entrada_usd,
      body.entrada,
      body?.perfil?.entradaDisponible,
      body?.metadata?.perfil?.entradaDisponible
    ),
    0
  );

  const capacidadEntradaMensual = toNum(
  pickFirstNonNull(
    body.capacidadEntradaMensual,
    body.capacidad_entrada_mensual,
    body.abonoMensualEntrada,
    body.abono_mensual_entrada,
    body?.perfil?.capacidadEntradaMensual,
    body?.metadata?.perfil?.capacidadEntradaMensual,
    0
  ),
  0
);

  const edad = toNum(
    pickFirstNonNull(
      body.edad,
      body?.perfil?.edad,
      body?.metadata?.perfil?.edad,
      30
    ),
    30
  );

  const tipoIngreso = normTipoIngreso(
    pickFirstNonNull(
      body.tipoIngreso,
      body.tipo_ingreso,
      body?.perfil?.tipoIngreso,
      body?.perfil?.tipo_ingreso,
      body?.metadata?.perfil?.tipoIngreso
    )
  ) || "Dependiente";

  const aniosEstabilidad = toNum(
    pickFirstNonNull(
      body.aniosEstabilidad,
      body.anios_estabilidad,
      body?.perfil?.aniosEstabilidad,
      body?.metadata?.perfil?.aniosEstabilidad,
      0
    ),
    0
  );

  const primeraVivienda = pickFirstDefined(body.primeraVivienda, null);
  const viviendaUsada = pickFirstDefined(body.viviendaUsada, null);
  const viviendaEstrenar = pickFirstDefined(
    body.viviendaEstrenar,
    body.viviendaNueva,
    true
  );

  const nacionalidad = normString(body.nacionalidad, "ecuatoriana");
  const estadoCivil = normString(body.estadoCivil, "soltero");
  const declaracionBuro = normString(body.declaracionBuro, "ninguno");
  const sustentoIndependiente = pickFirstDefined(body.sustentoIndependiente, null);
  const horizonteCompra = pickFirstDefined(
    body.horizonteCompra,
    body.tiempoCompra,
    null
  );

  const plazoAnios = pickFirstDefined(body.plazoAnios, null);

  return {
    ...body,
    ingresoNetoMensual,
    ingresoPareja,
    otrasDeudasMensuales,
    valorVivienda,
    entradaDisponible,
    capacidadEntradaMensual,
    edad,
    tipoIngreso,
    aniosEstabilidad,
    afiliadoIess: afiliadoRaw == null ? null : toBoolOrNull(afiliadoRaw),
    iessAportesTotales,
    iessAportesConsecutivos,
    primeraVivienda,
    viviendaUsada,
    viviendaEstrenar,
    nacionalidad,
    estadoCivil,
    declaracionBuro,
    sustentoIndependiente,
    horizonteCompra,
    plazoAnios,
  };
}

/**
 * ✅ Reglas duras para sinOferta (red flag)
 * Regla de oro: si el motor ya determinó una ruta viable, NO forzar sinOferta
 * salvo señales inexistentes / data corrupta.
 */
export function calcularSinOfertaHard(resultado = {}) {
  const tipoRuta =
    resultado?.rutaRecomendada?.tipo ||
    resultado?.productoSugerido ||
    resultado?.productoElegido;

  const viableByRuta = resultado?.rutaRecomendada?.viable === true;

  const viableByEscenario =
    tipoRuta &&
    resultado?.escenariosHL &&
    resultado.escenariosHL[String(tipoRuta).toLowerCase()]?.viable === true;

  const hayViable = viableByRuta || viableByEscenario;

  const capacidad = pickNumber(
    resultado?.capacidadPagoPrograma,
    resultado?.capacidadPago,
    resultado?.capacidadPagoGlobal,
    resultado?.bounds?.capacidadPago,
    resultado?.perfil?.capacidadPago
  );

  const cuota = pickNumber(resultado?.cuotaEstimada);
  const dti = pickNumber(resultado?.dtiConHipoteca);
  const ltv = pickNumber(resultado?.ltv);

  const montoMax = pickNumber(
    resultado?.montoMaximo,
    resultado?.montoPrestamoMax,
    resultado?.prestamoMax
  );

  const precioMax = pickNumber(
    resultado?.precioMaxVivienda,
    resultado?.precioMax,
    resultado?.valorMaxVivienda
  );

  const noSignals =
    !isNum(montoMax) ||
    montoMax <= 0 ||
    !isNum(precioMax) ||
    precioMax <= 0;

  if (noSignals) return !hayViable;

  if (!hayViable) {
    if (isNum(dti) && dti > 0.5) return true;
    if (isNum(ltv) && ltv > 0.9) return true;
  }

  const tipo = String(tipoRuta || "").toLowerCase();
  const aplicaReglaFlujo = tipo.includes("priv") || tipo.includes("comercial");

  if (!hayViable && aplicaReglaFlujo) {
    if (isNum(cuota) && isNum(capacidad) && cuota > capacidad) return true;
  }

  return false;
}

function pickSelectedPropertyFromInput(input = {}, rawBody = {}) {
  const candidates = [
    input?.selectedProperty,
    input?.propertyContext,
    rawBody?.selectedProperty,
    rawBody?.propertyContext,
    rawBody?.context?.selectedProperty,
  ];

  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;

    const price = Number(
      item.precio ??
        item.price ??
        item.selectedPropertyPrice ??
        rawBody?.selectedPropertyPrice
    );

    if (!Number.isFinite(price) || price <= 0) continue;

    const entradaReferencial =
      toNumOrNull(
        item.entradaReferencial ??
          item.entradaMinima ??
          item.entradaRequerida ??
          item?.financing?.downPaymentAmount
      ) || Math.round(price * 0.1);

    const mesesHastaEntrega =
      toNumOrNull(
        item.mesesHastaEntrega ??
          item.mesesConstruccion ??
          item.numeroCuotasEntrada ??
          item?.financing?.monthsConstruction ??
          item?.financing?.entryInstallmentsCount
      ) || 0;

    const esProyectoEnConstruccion =
      item.esProyectoEnConstruccion === true ||
      mesesHastaEntrega > 0 ||
      String(
        item.estadoProyecto ||
          item.etapaProyecto ||
          item.tipoEntrega ||
          item.tipoVivienda ||
          ""
      )
        .toLowerCase()
        .includes("constru");

    return {
      id: item.id || item.propertyId || rawBody?.selectedPropertyId || null,
      slug: item.slug || item.propertySlug || rawBody?.selectedPropertySlug || null,
      titulo: item.titulo || item.title || item.name || "Propiedad seleccionada",
      proyecto: item.proyecto || item.project || null,
      precio: price,
      precioLabel:
        item.precioLabel ||
        `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      ciudad: item.ciudad || null,
      sector: item.sector || null,

      entradaReferencial,
      entradaMinima: toNumOrNull(item.entradaMinima) || entradaReferencial,
      entradaRequerida: toNumOrNull(item.entradaRequerida) || entradaReferencial,
      porcentajeEntrada:
        toNumOrNull(
          item.porcentajeEntrada ||
            item.porcentajeEntradaRequerida ||
            item?.financing?.downPaymentPct
        ) || 0.1,

      fechaEntrega: item.fechaEntrega || item.fechaEntregaEstimada || null,
      mesesHastaEntrega,
      mesesConstruccion: toNumOrNull(item.mesesConstruccion) || mesesHastaEntrega,
      numeroCuotasEntrada:
        toNumOrNull(item.numeroCuotasEntrada) || mesesHastaEntrega,
      esProyectoEnConstruccion,
      estadoProyecto: item.estadoProyecto || null,
      etapaProyecto: item.etapaProyecto || null,
      tipoEntrega: item.tipoEntrega || null,
    };
  }

  const fallbackPrice = Number(rawBody?.selectedPropertyPrice);

  if (Number.isFinite(fallbackPrice) && fallbackPrice > 0) {
    return {
      id: rawBody?.selectedPropertyId || null,
      slug: rawBody?.selectedPropertySlug || null,
      titulo: rawBody?.selectedPropertyTitle || "Propiedad seleccionada",
      proyecto: rawBody?.selectedPropertyProject || null,
      precio: fallbackPrice,
      precioLabel: `$${fallbackPrice.toLocaleString("en-US", {
        maximumFractionDigits: 0,
      })}`,
      ciudad: rawBody?.selectedPropertyCity || null,
      sector: rawBody?.selectedPropertySector || null,
      entradaReferencial: Math.round(fallbackPrice * 0.1),
      entradaMinima: Math.round(fallbackPrice * 0.1),
      entradaRequerida: Math.round(fallbackPrice * 0.1),
      porcentajeEntrada: 0.1,
      fechaEntrega: null,
      mesesHastaEntrega: 0,
      esProyectoEnConstruccion: false,
    };
  }

  return null;
}

function buildPropertyFit(respuesta = {}, selectedProperty = null, input = {}) {
  if (!selectedProperty?.precio) return null;

  const propertyPrice = Number(selectedProperty.precio || 0);
  const estimatedCapacity = Number(respuesta?.precioMaxVivienda || 0);
  const estimatedLoanCapacity = Number(respuesta?.montoMaximo || 0);

  if (!Number.isFinite(propertyPrice) || propertyPrice <= 0) return null;

  const entradaActual = Number(input?.entradaDisponible || 0);
  const abonoMensual = Number(input?.capacidadEntradaMensual || 0);
  const mesesHastaEntrega = Number(selectedProperty?.mesesHastaEntrega || 0);

  const entradaReferencial =
    Number(
      selectedProperty?.entradaReferencial ||
        selectedProperty?.entradaMinima ||
        selectedProperty?.entradaRequerida ||
        0
    ) || Math.round(propertyPrice * 0.1);

  const abonoProyectado =
    abonoMensual > 0 && mesesHastaEntrega > 0
      ? abonoMensual * mesesHastaEntrega
      : 0;

  const entradaProyectada = entradaActual + abonoProyectado;

  const planEntradaAplica =
    selectedProperty?.esProyectoEnConstruccion === true &&
    mesesHastaEntrega > 0 &&
    entradaReferencial > 0;

  const cumpleEntradaReferencial =
    planEntradaAplica && entradaProyectada >= entradaReferencial;

  const brechaEntrada = planEntradaAplica
    ? entradaReferencial - entradaProyectada
    : null;

    const brechaEntradaAbs =
  brechaEntrada != null ? Math.abs(brechaEntrada) : null;
  
  /**
   * Capacidad proyectada:
   * Si el usuario puede construir más entrada hasta la entrega,
   * su capacidad total teórica podría aumentar por el monto adicional de entrada.
   *
   * Preferimos usar montoMaximo + entradaProyectada.
   * Si montoMaximo no existe, usamos precioMaxVivienda actual + incremento de entrada.
   */
  const estimatedCapacityProjected =
    Number.isFinite(estimatedLoanCapacity) && estimatedLoanCapacity > 0
      ? estimatedLoanCapacity + entradaProyectada
      : Number.isFinite(estimatedCapacity) && estimatedCapacity > 0
        ? estimatedCapacity + Math.max(entradaProyectada - entradaActual, 0)
        : null;

  const projectedGap =
    Number.isFinite(estimatedCapacityProjected)
      ? estimatedCapacityProjected - propertyPrice
      : null;

  const projectedGapAbs =
    projectedGap != null ? Math.abs(projectedGap) : null;

const montoAFinanciarProyectado =
  planEntradaAplica ? Math.max(propertyPrice - entradaProyectada, 0) : null;

const montoMaximoCreditoEstimado =
  Number.isFinite(estimatedLoanCapacity) && estimatedLoanCapacity > 0
    ? estimatedLoanCapacity
    : null;

const brechaCreditoEntrega =
  montoAFinanciarProyectado != null && montoMaximoCreditoEstimado != null
    ? montoAFinanciarProyectado - montoMaximoCreditoEstimado
    : null;

const cumpleCreditoEstimado =
  brechaCreditoEntrega != null ? brechaCreditoEntrega <= 0 : false;

const creditoEntrega = planEntradaAplica
  ? {
      aplica: true,
      montoAFinanciarProyectado,
      montoMaximoCreditoEstimado,
      brechaCreditoEntrega,
      brechaCreditoEntregaAbs:
        brechaCreditoEntrega != null ? Math.abs(brechaCreditoEntrega) : null,
      cumpleCreditoEstimado,
      status: cumpleCreditoEstimado
        ? "credito_estimado_viable"
        : "credito_estimado_corto",
      label: cumpleCreditoEstimado
        ? "El crédito proyectado podría estar dentro de rango"
        : "El crédito proyectado todavía estaría ajustado",
    }
  : {
      aplica: false,
    };


const planEntrada = planEntradaAplica
  ? {
      aplica: true,
      mesesHastaEntrega,
      entradaActual,
      abonoMensual,
      abonoProyectado,
      entradaProyectada,
      entradaReferencial,
      cumpleEntradaReferencial,
      brechaEntrada,
      brechaEntradaAbs,
      estimatedCapacityProjected,
      projectedGap,
      projectedGapAbs,

      // ✅ Nueva lectura explícita
      creditoEntrega,
    }
  : {
      aplica: false,
      creditoEntrega,
    };

  if (!Number.isFinite(estimatedCapacity) || estimatedCapacity <= 0) {
    return {
      status: "sin_capacidad_detectada",
      statusActual: "sin_capacidad_detectada",
      statusProyectado: null,
      label: "Resultado pendiente de comparación",
      message:
        "Calculamos tu precalificación, pero no pudimos comparar automáticamente esta propiedad con tu capacidad estimada.",
      selectedProperty,
      propertyPrice,
      propertyPriceLabel: selectedProperty.precioLabel,
      estimatedCapacity: null,
      gap: null,
      gapAbs: null,
      planEntrada,
    };
  }

  const gap = estimatedCapacity - propertyPrice;
  const gapAbs = Math.abs(gap);
  const ratio = estimatedCapacity / propertyPrice;

  let status = "fuera_de_rango";
  let statusActual = "fuera_de_rango";
  let statusProyectado = null;
  let label = "Esta propiedad está por encima de tu capacidad estimada actual";
  let message =
    "Según tus datos declarados, esta propiedad estaría por encima de tu capacidad estimada actual.";

  if (ratio >= 1) {
    status = "dentro_de_rango";
    statusActual = "dentro_de_rango";
    statusProyectado = "alcanzable_hoy";
    label = "Esta propiedad parece estar dentro de tu rango estimado";
    message =
      "Según tus datos declarados, esta propiedad parece estar dentro de tu capacidad estimada.";
  } else if (ratio >= 0.9) {
    status = "cerca";
    statusActual = "cerca";
    label = "Estás cerca de esta propiedad";
    message =
      "Esta propiedad está cerca de tu capacidad estimada. Podrías necesitar más entrada, menor deuda o una mejor ruta de financiamiento.";
  }

  if (planEntradaAplica && statusActual !== "dentro_de_rango") {
  if (cumpleEntradaReferencial && cumpleCreditoEstimado) {
    status = "entrada_y_credito_viables";
    statusProyectado = "entrada_y_credito_viables";
    label = "Esta propiedad podría estar dentro de tu rango al momento de la entrega";
    message =
      "Con tu entrada proyectada y tu perfil actual, esta propiedad podría estar dentro de tu rango estimado al momento de la entrega.";
  } else if (cumpleEntradaReferencial && !cumpleCreditoEstimado) {
    status = "cumple_entrada_pero_credito_corto";
    statusProyectado = "cumple_entrada_pero_credito_corto";
    label =
      "Podrías completar la entrada, pero el crédito estimado todavía estaría corto";
    message =
      "Con tu abono mensual proyectado podrías llegar a la entrada referencial antes de la entrega. Sin embargo, según tu perfil actual, el monto de crédito requerido todavía estaría por encima de tu crédito estimado.";
  } else if (
    Number.isFinite(estimatedCapacityProjected) &&
    estimatedCapacityProjected >= propertyPrice
  ) {
    status = "alcanzable_con_plan_entrada";
    statusProyectado = "alcanzable_con_plan_entrada";
    label = "Podrías acercarte a esta propiedad con un plan de entrada";
    message =
      "Hoy esta propiedad está por encima de tu capacidad estimada, pero con tu abono mensual proyectado podrías acercarte al valor requerido antes de la entrega.";
  } else if (abonoMensual > 0) {
    statusProyectado = "cerca_con_plan_entrada";
    message =
      "Tu abono mensual ayuda a acercarte, pero todavía podrías necesitar más entrada, más tiempo o una propiedad de menor precio.";
  }
}

  return {
    status,
    statusActual,
    statusProyectado,
    label,
    message,
    selectedProperty,
    propertyPrice,
    propertyPriceLabel: selectedProperty.precioLabel,
    estimatedCapacity,
    estimatedCapacityProjected,
    gap,
    gapAbs,
    projectedGap,
    projectedGapAbs,
    planEntrada,
  };
}


/**
 * ✅ Servicio DRY: precalificar HL
 * - Normaliza input
 * - Corre motor (scoring)
 * - Normaliza resultado
 * - Aplica sinOfertaHard
 * - Devuelve respuesta final
 */



export function precalificarHL(body = {}) {
  const input = normalizarInputHL(body);

  const resultadoRaw = evaluarProbabilidadPorBanco(input);
  const resultado = normalizeResultadoParaSalida(resultadoRaw);

  if (!resultado.flags || typeof resultado.flags !== "object") {
    resultado.flags = {};
  }

  const sinOfertaEngine = pickBool(
    resultado?.flags?.sinOferta,
    resultado?.sinOferta
  );

  const sinOfertaHard = calcularSinOfertaHard(resultado);

  const sinOfertaFinal =
    (typeof sinOfertaEngine === "boolean" ? sinOfertaEngine : false) ||
    sinOfertaHard;

  resultado.flags.sinOferta = sinOfertaFinal;
  resultado.sinOferta = sinOfertaFinal;

  const bancosProbabilidadRaw = resultado.bancosProbabilidad || [];
  const bancosProbabilidad = bancosProbabilidadRaw.map((b) =>
    enrichBancoConEscenario(b, resultado.escenariosHL)
  );

  const bancosTop3 = bancosProbabilidad.slice(0, 3);
  const mejorBanco = bancosTop3[0] || null;

  const productoSugerido = sinOfertaFinal
    ? null
    : resultado.productoSugerido || null;

  const bancoSugerido = sinOfertaFinal
    ? null
    : resultado.bancoSugerido ||
      (productoSugerido ? mejorBanco?.banco || null : null);

  const respuesta = {
    ok: resultado.ok,

    productoElegido: resultado.productoElegido,
    tasaAnual: resultado.tasaAnual,
    plazoMeses: resultado.plazoMeses,
    cuotaEstimada: resultado.cuotaEstimada,
    cuotaStress: resultado.cuotaStress,
    capacidadPago: resultado.capacidadPago,
    ltv: resultado.ltv,
    dtiConHipoteca: resultado.dtiConHipoteca,
    montoMaximo: resultado.montoMaximo,
    precioMaxVivienda: resultado.precioMaxVivienda,

    flags: resultado.flags,

    riesgoHabitaLibre: resultado.riesgoHabitaLibre,
    scoreHL: resultado.scoreHL,
    stressTest: resultado.stressTest,
    costos: resultado.costos,
    checklist: resultado.checklist,
    accionesClave: resultado.accionesClave,
    benchmark: resultado.benchmark,
    perfil: resultado.perfil,
    requeridos: resultado.requeridos,

    escenariosHL: resultado.escenariosHL,
    rutasViables: resultado.rutasViables || [],
    rutaRecomendada: resultado.rutaRecomendada || null,
    eligibilityProducts: resultado.eligibilityProducts || {},

    bancosProbabilidad,
    bancosTop3,
    mejorBanco,

    productoSugerido,
    bancoSugerido,

    _echo: resultado._echo || {},

    _debugSinOferta: {
      sinOfertaEngine,
      sinOfertaHard,
      sinOfertaFinal,
      cuotaEstimada: resultado?.cuotaEstimada ?? null,
      capacidadPago: resultado?.capacidadPago ?? null,
      dtiConHipoteca: resultado?.dtiConHipoteca ?? null,
      ltv: resultado?.ltv ?? null,
      input_resumen: {
        ingresoNetoMensual: input.ingresoNetoMensual,
        otrasDeudasMensuales: input.otrasDeudasMensuales,
        valorVivienda: input.valorVivienda,
        entradaDisponible: input.entradaDisponible,
        edad: input.edad,
        tipoIngreso: input.tipoIngreso,
        afiliadoIess: input.afiliadoIess,
        aniosEstabilidad: input.aniosEstabilidad,
      },
    },
   };

  const selectedProperty = pickSelectedPropertyFromInput(input, body);
const propertyFit = buildPropertyFit(respuesta, selectedProperty, input);
  if (selectedProperty) {
    respuesta.selectedProperty = selectedProperty;
    respuesta.propertyContext = selectedProperty;
  }

  if (propertyFit) {
    respuesta.propertyFit = propertyFit;
    respuesta.resultadoPropiedad = propertyFit;
  }

  return { input, resultado, respuesta };
}