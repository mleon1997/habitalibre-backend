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

  return { input, resultado, respuesta };
}