// src/lib/scoring.js

import { getCatalogProductsForScoring } from "./mortgageCatalogAdapter.js";
import evaluateMortgageProduct from "./evaluateMortgageProduct.js";
import scoreHabitaLibre from "./scoreHabitaLibre.js";

console.log("✅ SCORING NUEVO CARGADO");

/* ===========================================================
   Helpers numéricos/financieros (con sanitización)
=========================================================== */
const n = (v, def = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
};

function pmt(rate, nper, pv) {
  const r = n(rate, 0);
  const N = n(nper, 1);
  const PV = n(pv, 0);
  if (r === 0) return PV / N;
  return (PV * r) / (1 - Math.pow(1 + r, -N));
}

function pvFromPayment(rate, nper, payment) {
  const r = n(rate, 0);
  const N = n(nper, 1);
  const PMT = n(payment, 0);
  if (r === 0) return PMT * N;
  return (PMT * (1 - Math.pow(1 + r, -N))) / r;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ===========================================================
   Tabla escalonada BIESS estándar (no VIS/VIP)
=========================================================== */
function tasaBiessEstandar(monto, plazoAnios) {
  const loan = n(monto);
  const years = n(plazoAnios, 20);

  if (loan <= 90000 && years <= 20) return 0.073;
  if (loan <= 150000) return 0.078;
  if (loan <= 200000) return 0.082;
  return 0.088;
}

/* ===========================================================
   Helpers para enriquecer bancos con métricas hipotecarias
=========================================================== */
function getEscenarioPorTipo(tipoProducto, escenarios = {}) {
  const tipo = String(tipoProducto || "").toUpperCase();

  if (tipo === "VIS") return escenarios?.vis || null;
  if (tipo === "VIP") return escenarios?.vip || null;
  if (tipo === "BIESS") {
    return (
      escenarios?.biess ||
      escenarios?.biess_pref ||
      escenarios?.biess_std ||
      null
    );
  }
  if (tipo === "NORMAL" || tipo === "PRIVADA" || tipo === "COMERCIAL") {
    return escenarios?.comercial || null;
  }

  return null;
}

function enrichBancoResultado(bancoBase, escenarios = {}) {
  const esc = getEscenarioPorTipo(bancoBase?.tipoProducto, escenarios);

  return {
    ...bancoBase,
    tasaAnual: esc?.tasaAnual ?? null,
    cuota: esc?.cuota ?? null,
    montoPrestamo: esc?.montoPrestamo ?? null,
    plazoMeses: esc?.plazoMeses ?? null,
    ltvMax: esc?.ltvMax ?? null,
    precioMaxVivienda: esc?.precioMaxVivienda ?? null,
  };
}

/* ===========================================================
   Reglas mock de bancos (legacy)
=========================================================== */
const BANK_RULES = [
  {
    id: "andino",
    nombre: "Banco Andino",
    ltvMax: 0.8,
    dtiMax: 0.4,
    minIngreso: 800,
    minEstabilidadMeses: 12,
    edadMin: 22,
    tasa: 0.105,
    plazos: [180, 240],
  },
  {
    id: "pacifico",
    nombre: "Banco Pacífico",
    ltvMax: 0.9,
    dtiMax: 0.42,
    minIngreso: 900,
    minEstabilidadMeses: 12,
    edadMin: 21,
    tasa: 0.112,
    plazos: [240],
  },
  {
    id: "coopSA",
    nombre: "Coop. Sierra Azul",
    ltvMax: 0.85,
    dtiMax: 0.4,
    minIngreso: 600,
    minEstabilidadMeses: 6,
    edadMin: 21,
    tasa: 0.118,
    plazos: [120, 180],
  },
];

/* ===========================================================
   Bancos reales para probabilidad de aprobación
=========================================================== */
const BANK_PROFILES = [
  {
    id: "pichincha_vip",
    nombre: "Banco Pichincha (VIP)",
    tipo: "VIP",
    dtiMaxDependiente: 0.4,
    dtiMaxIndependiente: 0.4,
    ltvMax: 0.95,
    requiereIESS: false,
    requierePrimeraVivienda: true,
    tasaRef: 0.0499,
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },
  {
    id: "mutualista_vip",
    nombre: "Mutualista Pichincha (VIP)",
    tipo: "VIP",
    dtiMaxDependiente: 0.33,
    dtiMaxIndependiente: 0.33,
    ltvMax: 0.95,
    requiereIESS: false,
    requierePrimeraVivienda: true,
    tasaRef: 0.0499,
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },
  {
    id: "bgr_vip",
    nombre: "BGR (VIP)",
    tipo: "VIP",
    dtiMaxDependiente: 0.4,
    dtiMaxIndependiente: 0.4,
    ltvMax: 0.95,
    requiereIESS: false,
    requierePrimeraVivienda: true,
    tasaRef: 0.0499,
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },
  {
    id: "pacifico_vip",
    nombre: "Banco Pacífico (VIP)",
    tipo: "VIP",
    dtiMaxDependiente: 0.3,
    dtiMaxIndependiente: 0.3,
    ltvMax: 0.95,
    requiereIESS: false,
    requierePrimeraVivienda: true,
    tasaRef: 0.0499,
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },

  {
    id: "pichincha_vis",
    nombre: "Banco Pichincha (VIS)",
    tipo: "VIS",
    dtiMaxDependiente: 0.45,
    dtiMaxIndependiente: 0.45,
    ltvMax: 0.95,
    requiereIESS: false,
    requierePrimeraVivienda: true,
    tasaRef: 0.0499,
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },
  {
    id: "mutualista_vis",
    nombre: "Mutualista Pichincha (VIS)",
    tipo: "VIS",
    dtiMaxDependiente: 0.45,
    dtiMaxIndependiente: 0.45,
    ltvMax: 0.95,
    requiereIESS: false,
    requierePrimeraVivienda: true,
    tasaRef: 0.0499,
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },
  {
    id: "bgr_vis",
    nombre: "BGR (VIS)",
    tipo: "VIS",
    dtiMaxDependiente: 0.45,
    dtiMaxIndependiente: 0.45,
    ltvMax: 0.95,
    requiereIESS: false,
    requierePrimeraVivienda: true,
    tasaRef: 0.0499,
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },
  {
    id: "pacifico_vis",
    nombre: "Banco Pacífico (VIS)",
    tipo: "VIS",
    dtiMaxDependiente: 0.45,
    dtiMaxIndependiente: 0.45,
    ltvMax: 0.95,
    requiereIESS: false,
    requierePrimeraVivienda: true,
    tasaRef: 0.0499,
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },

  {
    id: "biess",
    nombre: "BIESS",
    tipo: "BIESS",
    dtiMaxDependiente: 0.4,
    dtiMaxIndependiente: 0.4,
    ltvMax: 0.95,
    requiereIESS: true,
    requiereAportes: true,
    tasaRef: 0.0599,
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },

  {
    id: "produbanco_normal",
    nombre: "Produbanco (normal)",
    tipo: "NORMAL",
    dtiMaxDependiente: 0.45,
    dtiMaxIndependiente: 0.45,
    ltvMaxAAA: 0.8,
    ltvMaxDefault: 0.7,
    requiereIESS: false,
    requiereAportes: false,
    tasaRef: 0.095,
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },
  {
    id: "ifi_normal",
    nombre: "Otra IFI (normal)",
    tipo: "NORMAL",
    dtiMaxDependiente: 0.45,
    dtiMaxIndependiente: 0.45,
    ltvMaxAAA: 0.8,
    ltvMaxDefault: 0.7,
    requiereIESS: false,
    requiereAportes: false,
    tasaRef: 0.1,
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },
];

/* ===========================================================
   Parámetros VIS/VIP/BIESS (legacy)
=========================================================== */
const LIMITES = {
  VIS: {
    priceCap: 83660,
    incomeCap: 2070,
    minIngreso: 600,
    firstHomeOnly: true,
    requireNewBuild: true,
    tasaAnual: 0.0499,
    plazoMeses: 240,
    plazoMinAnios: 5,
    plazoMaxAnios: 25,
    ltvMax: 0.95,
    dtiMax: 0.45,
    ignoreCapacityPenalties: true,
  },
  VIP: {
    priceCap: 107630,
    incomeCap: 2900,
    minIngreso: 800,
    firstHomeOnly: true,
    requireNewBuild: true,
    tasaAnual: 0.0499,
    plazoMeses: 300,
    plazoMinAnios: 5,
    plazoMaxAnios: 25,
    ltvMax: 0.95,
    dtiMax: 0.45,
    ignoreCapacityPenalties: true,
  },
  BIESS_PREF: {
    priceCap: 107630,
    incomeCap: 2900,
    minIngreso: 700,
    firstHomeOnly: true,
    requireNewBuild: true,
    requireIESS: true,
    requireContribs: true,
    tasaAnual: 0.0599,
    plazoMeses: 300,
    plazoMinAnios: 5,
    plazoMaxAnios: 25,
    ltvMax: 0.95,
    dtiMax: 0.45,
    ignoreCapacityPenalties: true,
  },
  BIESS_STD: {
    priceCap: 460000,
    incomeCap: Infinity,
    minIngreso: 700,
    firstHomeOnly: false,
    requireIESS: true,
    requireContribs: true,
    tasaAnual: null,
    plazoMeses: 300,
    plazoMinAnios: 5,
    plazoMaxAnios: 25,
    ltvMax: 0.9,
    dtiMax: 0.45,
    ignoreCapacityPenalties: true,
    tieredStdBiess: true,
  },
  COMERCIAL: {
    priceCap: Infinity,
    incomeCap: Infinity,
    minIngreso: 800,
    firstHomeOnly: false,
    tasaAnual: 0.075,
    plazoMeses: 240,
    plazoMinAnios: 5,
    plazoMaxAnios: 25,
    ltvMax: 0.85,
    dtiMax: 0.4,
    ignoreCapacityPenalties: false,
  },
};

const MIN_IESS_TOTALES = 36;
const MIN_IESS_CONSEC = 13;

/* ===========================================================
   Eligibility products para frontend / marketplace (legacy)
=========================================================== */
function buildEligibilityProducts({
  evalVIS,
  evalVIP,
  evalBPREF,
  evalBSTD,
  evalCOM,
}) {
  return {
    VIS: {
      viable: !!evalVIS?.viable,
      priceMax: Number.isFinite(evalVIS?.precioMaxVivienda)
        ? evalVIS.precioMaxVivienda
        : 0,
      loanMax: Number.isFinite(evalVIS?.montoPrestamo)
        ? evalVIS.montoPrestamo
        : 0,
      rateAnnual: Number.isFinite(evalVIS?.tasaAnual) ? evalVIS.tasaAnual : null,
      termMonths: Number.isFinite(evalVIS?.plazoMeses) ? evalVIS.plazoMeses : null,
      requiresFirstHome: true,
      requiresNewConstruction: true,
      requiresIESS: false,
      requiresContributions: false,
      requiresMiduviQualifiedProject: false,
      channel: "PRIVATE_BANK",
      segment: "VIS",
      displayName: "Vivienda de Interés Social",
    },

    VIP: {
      viable: !!evalVIP?.viable,
      priceMax: Number.isFinite(evalVIP?.precioMaxVivienda)
        ? evalVIP.precioMaxVivienda
        : 0,
      loanMax: Number.isFinite(evalVIP?.montoPrestamo)
        ? evalVIP.montoPrestamo
        : 0,
      rateAnnual: Number.isFinite(evalVIP?.tasaAnual) ? evalVIP.tasaAnual : null,
      termMonths: Number.isFinite(evalVIP?.plazoMeses) ? evalVIP.plazoMeses : null,
      requiresFirstHome: true,
      requiresNewConstruction: true,
      requiresIESS: false,
      requiresContributions: false,
      requiresMiduviQualifiedProject: false,
      channel: "PRIVATE_BANK",
      segment: "VIP",
      displayName: "Vivienda de Interés Público",
    },

    VIS_II: {
      viable: !!evalVIS?.viable,
      priceMax: Number.isFinite(evalVIS?.precioMaxVivienda)
        ? Math.min(evalVIS.precioMaxVivienda, 49164)
        : 0,
      loanMax: Number.isFinite(evalVIS?.montoPrestamo)
        ? evalVIS.montoPrestamo
        : 0,
      rateAnnual: null,
      termMonths: null,
      requiresFirstHome: true,
      requiresNewConstruction: true,
      requiresIESS: false,
      requiresContributions: false,
      requiresMiduviQualifiedProject: false,
      channel: "SUBSIDY",
      segment: "SUBSIDY",
      displayName: "VIS II Subsidio",
    },

    BIESS_CREDICASA: {
      viable: !!evalBPREF?.viable,
      priceMax: Number.isFinite(evalBPREF?.precioMaxVivienda)
        ? evalBPREF.precioMaxVivienda
        : 0,
      loanMax: Number.isFinite(evalBPREF?.montoPrestamo)
        ? evalBPREF.montoPrestamo
        : 0,
      rateAnnual: Number.isFinite(evalBPREF?.tasaAnual)
        ? evalBPREF.tasaAnual
        : null,
      termMonths: Number.isFinite(evalBPREF?.plazoMeses)
        ? evalBPREF.plazoMeses
        : null,
      requiresFirstHome: true,
      requiresNewConstruction: true,
      requiresIESS: true,
      requiresContributions: true,
      requiresMiduviQualifiedProject: false,
      channel: "BIESS",
      segment: "BIESS",
      displayName: "BIESS Credicasa / Preferencial",
    },

    BIESS_STD: {
      viable: !!evalBSTD?.viable,
      priceMax: Number.isFinite(evalBSTD?.precioMaxVivienda)
        ? evalBSTD.precioMaxVivienda
        : 0,
      loanMax: Number.isFinite(evalBSTD?.montoPrestamo)
        ? evalBSTD.montoPrestamo
        : 0,
      rateAnnual: Number.isFinite(evalBSTD?.tasaAnual)
        ? evalBSTD.tasaAnual
        : null,
      termMonths: Number.isFinite(evalBSTD?.plazoMeses)
        ? evalBSTD.plazoMeses
        : null,
      requiresFirstHome: false,
      requiresNewConstruction: false,
      requiresIESS: true,
      requiresContributions: true,
      requiresMiduviQualifiedProject: false,
      channel: "BIESS",
      segment: "BIESS",
      displayName: "BIESS",
    },

    PRIVATE: {
      viable: !!evalCOM?.viable,
      priceMax: Number.isFinite(evalCOM?.precioMaxVivienda)
        ? evalCOM.precioMaxVivienda
        : 0,
      loanMax: Number.isFinite(evalCOM?.montoPrestamo)
        ? evalCOM.montoPrestamo
        : 0,
      rateAnnual: Number.isFinite(evalCOM?.tasaAnual)
        ? evalCOM.tasaAnual
        : null,
      termMonths: Number.isFinite(evalCOM?.plazoMeses)
        ? evalCOM.plazoMeses
        : null,
      requiresFirstHome: false,
      requiresNewConstruction: false,
      requiresIESS: false,
      requiresContributions: false,
      requiresMiduviQualifiedProject: false,
      channel: "PRIVATE_BANK",
      segment: "PRIVATE",
      displayName: "Hipoteca Privada",
    },
  };
}

/* ===========================================================
   Motor principal
=========================================================== */
export function calcularPrecalificacion(input) {
  const {
    ingresoNetoMensual = 0,
    ingresoPareja = 0,
    otrasDeudasMensuales = 0,
    valorVivienda = 0,
    entradaDisponible = 0,
    edad = 30,
    tipoIngreso = "Dependiente",
    aniosEstabilidad = 2,
    afiliadoIess = "No",
    tieneVivienda = false,
    declaracionBuro = "ninguno",
    estadoCivil,
    nacionalidad = "ecuatoriana",
    sustentoIndependiente = null,
    primeraVivienda = null,
    viviendaUsada = null,
    viviendaEstrenar = true,
    iessAportesTotales = 0,
    iessAportesConsecutivos = 0,
    plazoAnios = null,
  } = input || {};

  const sustentoOKGlobal = (() => {
    if (tipoIngreso === "Dependiente") return true;

    const raw = (sustentoIndependiente || "").toString().toLowerCase().trim();
    if (!raw) return false;

    const okKeywords = [
      "ruc",
      "factura",
      "facturas",
      "declaracion",
      "declaración",
      "roles",
      "rol de pago",
      "contrato",
      "contabilidad",
      "ingresos formales",
    ];

    return okKeywords.some((k) => raw.includes(k));
  })();

  const afiliadoBool =
    typeof afiliadoIess === "string"
      ? afiliadoIess.toLowerCase().startsWith("s")
      : !!afiliadoIess;

  const esExtranjero =
    typeof nacionalidad === "string"
      ? nacionalidad.trim().toLowerCase() !== "ecuatoriana"
      : false;

  const primeraViviendaBool =
    primeraVivienda === null || primeraVivienda === undefined
      ? null
      : typeof primeraVivienda === "string"
      ? primeraVivienda.trim().toLowerCase().startsWith("s")
      : !!primeraVivienda;

  const tieneViviendaBoolRaw =
    typeof tieneVivienda === "string"
      ? /si|sí|true|1/i.test(tieneVivienda)
      : !!tieneVivienda;

  const tieneViviendaBool =
    primeraViviendaBool === null ? tieneViviendaBoolRaw : !primeraViviendaBool;

  const viviendaUsadaBool =
    typeof viviendaUsada === "string"
      ? /usada|segunda/i.test(viviendaUsada.trim().toLowerCase())
      : !!viviendaUsada;

  const viviendaNuevaBool = viviendaUsadaBool
    ? false
    : typeof viviendaEstrenar === "boolean"
    ? viviendaEstrenar
    : true;

  const dtiBase = 0.4;
  const aniosEstNum = n(aniosEstabilidad);

  const factorTipo =
    tipoIngreso === "Independiente"
      ? 0.85
      : tipoIngreso === "Mixto"
      ? 0.92
      : 1.0;

  let factorEstab;
  if (aniosEstNum <= 0) {
    factorEstab = 0.6;
  } else if (aniosEstNum < 1) {
    factorEstab = 0.75;
  } else if (aniosEstNum < 3) {
    factorEstab = 0.9;
  } else {
    factorEstab = 1.0;
  }

  const factorEdad = n(edad) < 23 || n(edad) > 60 ? 0.95 : 1.0;
  const factorCapacidad = Math.max(0.55, factorTipo * factorEstab * factorEdad);

  const ingresoTotal = n(ingresoNetoMensual) + n(ingresoPareja);
  const ingresoDisponible = Math.max(0, ingresoTotal - n(otrasDeudasMensuales));

  const capacidadPago = Math.max(
    0,
    ingresoDisponible * dtiBase * factorCapacidad
  );

  /* ===========================================================
     Nuevo puente: evaluación paralela del catálogo
  =========================================================== */
  const catalogProducts = getCatalogProductsForScoring();

  const evaluatedCatalogProducts = catalogProducts.map((product) =>
    evaluateMortgageProduct({
      product,
      input,
      context: {
        ingresoTotal,
        ingresoDisponible,
        factorCapacidad,
        edad: n(edad),
        tipoIngreso,
        aniosEstabilidad: aniosEstNum,
        afiliadoBool,
        iessAportesTotales: n(iessAportesTotales),
        iessAportesConsecutivos: n(iessAportesConsecutivos),
        tieneViviendaBool,
        viviendaNuevaBool,
        declaracionBuro,
        entradaDisponible: n(entradaDisponible),
        valorVivienda: n(valorVivienda),
        plazoAnios,
        esExtranjero,
        sustentoOKGlobal,
      },
    })
  );

  const evaluatedCatalogMap = Object.fromEntries(
    evaluatedCatalogProducts.map((p) => [p.productId, p])
  );

  function evaluarProducto(prodCfg, plazoAniosUsuario) {
    const {
      label,
      tasaAnual,
      plazoMeses,
      ltvMax,
      priceCap,
      incomeCap = Infinity,
      minIngreso = 0,
      firstHomeOnly = false,
      requireNewBuild = false,
      requireIESS = false,
      requireContribs = false,
      dtiMax,
      ignoreCapacityPenalties = false,
      tieredStdBiess = false,
      plazoMinAnios,
      plazoMaxAnios,
    } = prodCfg;

    const dentroIngreso =
      ingresoTotal >= n(minIngreso) &&
      ingresoTotal <= n(incomeCap, Infinity) + 1e-9;

    const primeraViviendaOK = firstHomeOnly ? !tieneViviendaBool : true;
    const iessOK = requireIESS ? afiliadoBool : true;
    const aportesOK = requireContribs
      ? n(iessAportesTotales) >= MIN_IESS_TOTALES &&
        n(iessAportesConsecutivos) >= MIN_IESS_CONSEC
      : true;

    const viviendaNuevaOK = requireNewBuild ? !!viviendaNuevaBool : true;

    const edadNum = n(edad);
    const minAniosProd = n(plazoMinAnios, 5);
    const maxAniosProd = n(plazoMaxAnios, 25);

    let plazoOriginalMeses = n(plazoMeses);

    if (plazoAniosUsuario != null) {
      const plazoUserAnios = clamp(
        n(plazoAniosUsuario),
        minAniosProd,
        maxAniosProd
      );
      plazoOriginalMeses = plazoUserAnios * 12;
    } else {
      if (!plazoOriginalMeses) {
        const defaultAnios = clamp(20, minAniosProd, maxAniosProd);
        plazoOriginalMeses = defaultAnios * 12;
      }
    }

    const maxPlazoPorEdadMeses = Math.max(0, (75 - edadNum) * 12);
    const plazoEfectivo = Math.min(plazoOriginalMeses, maxPlazoPorEdadMeses);
    const edadOK = plazoEfectivo > 0;

    const montoNecesario = Math.max(0, n(valorVivienda) - n(entradaDisponible));

    let tasaEfectivaAnual = n(tasaAnual);

    if (tieredStdBiess) {
      const loan = n(montoNecesario);
      const plazoAniosEfectivo =
        plazoEfectivo > 0 ? plazoEfectivo / 12 : n(plazoMeses, 240) / 12;

      tasaEfectivaAnual = tasaBiessEstandar(loan, plazoAniosEfectivo);
    }

    const rate = tasaEfectivaAnual / 12;
    const factorCapProd = ignoreCapacityPenalties ? 1.0 : factorCapacidad;
    const dtiToUse =
      typeof dtiMax === "number" && dtiMax > 0 ? dtiMax : dtiBase;

    const cuotaMaxProducto = Math.max(
      0,
      ingresoDisponible * dtiToUse * factorCapProd
    );

    const montoMaxPorCuota = pvFromPayment(rate, plazoEfectivo, cuotaMaxProducto);

    const precioPorCapacidad = n(entradaDisponible) + n(montoMaxPorCuota);
    const precioPorLtv =
      1 - n(ltvMax) > 0 ? n(entradaDisponible) / (1 - n(ltvMax)) : Infinity;
    const precioPorTope = priceCap ?? Infinity;

    const precioMaxVivienda = Math.min(
      precioPorCapacidad,
      precioPorLtv,
      precioPorTope
    );

    let binding = "capacidad";
    if (precioMaxVivienda === precioPorLtv) binding = "ltv";
    if (precioMaxVivienda === precioPorTope) binding = "tope";

    const ltv = n(valorVivienda) > 0 ? montoNecesario / n(valorVivienda) : 0;

    const montoPrestamo = Math.max(
      0,
      Math.min(montoNecesario, n(montoMaxPorCuota))
    );

    const cuota = pmt(rate, plazoEfectivo, montoPrestamo);
    const cuotaStress = pmt(
      (tasaEfectivaAnual + 0.02) / 12,
      plazoEfectivo,
      montoPrestamo
    );

    const dentroPrecio = n(valorVivienda) <= n(priceCap, Infinity);
    const dentroLtv = ltv <= n(ltvMax) + 1e-9;
    const dentroCapacidad = cuota <= cuotaMaxProducto + 1e-9;

    const viable = !!(
      dentroIngreso &&
      primeraViviendaOK &&
      iessOK &&
      aportesOK &&
      viviendaNuevaOK &&
      dentroPrecio &&
      dentroLtv &&
      dentroCapacidad &&
      edadOK
    );

    return {
      producto: label || "—",
      tasaAnual: tasaEfectivaAnual,
      plazoMeses: plazoEfectivo,
      ltvMax: n(ltvMax),
      priceCap,
      incomeCap,
      minIngreso,
      montoPrestamo,
      cuota,
      cuotaStress,
      ltv,
      precioMaxVivienda,
      flags: {
        dentroIngreso,
        primeraViviendaOK,
        iessOK,
        aportesOK,
        viviendaNuevaOK,
        dentroPrecio,
        dentroLtv,
        dentroCapacidad,
        edadOK,
        plazoOriginal: plazoOriginalMeses,
        plazoEfectivo,
        plazoMinAnios: minAniosProd,
        plazoMaxAnios: maxAniosProd,
      },
      bounds: {
        byCapacity: precioPorCapacidad,
        byLtv: precioPorLtv,
        byCap: precioPorTope,
        binding,
        cuotaMaxProducto,
        montoMaxPorCuota,
        dtiUsado: dtiToUse,
        factorCapProd,
      },
      viable,
    };
  }

  const PROD_VIS = { label: "VIS", ...LIMITES.VIS };
  const PROD_VIP = { label: "VIP", ...LIMITES.VIP };
  const PROD_BIESS_PREF = {
    label: "BIESS preferencial",
    ...LIMITES.BIESS_PREF,
  };
  const PROD_BIESS_STD = { label: "BIESS", ...LIMITES.BIESS_STD };
  const PROD_COM = { label: "Comercial", ...LIMITES.COMERCIAL };

  const evalVIS = evaluarProducto(PROD_VIS, plazoAnios);
  const evalVIP = evaluarProducto(PROD_VIP, plazoAnios);
  const evalBPREF = evaluarProducto(PROD_BIESS_PREF, plazoAnios);
  const evalBSTD = evaluarProducto(PROD_BIESS_STD, plazoAnios);
  const evalCOM = evaluarProducto(PROD_COM, plazoAnios);

  const eligibilityProducts = buildEligibilityProducts({
    evalVIS,
    evalVIP,
    evalBPREF,
    evalBSTD,
    evalCOM,
  });

  let escenarioElegido = evalCOM;
  if (evalVIS.viable) escenarioElegido = evalVIS;
  else if (evalVIP.viable) escenarioElegido = evalVIP;
  else if (evalBPREF.viable) escenarioElegido = evalBPREF;
  else if (evalBSTD.viable) escenarioElegido = evalBSTD;

  const hayViableBasico =
    evalVIS.viable ||
    evalVIP.viable ||
    evalBPREF.viable ||
    evalBSTD.viable ||
    evalCOM.viable;

  const sinSustentoCritico =
    (tipoIngreso === "Independiente" || tipoIngreso === "Mixto") &&
    !sustentoOKGlobal;

  const hayViableFinal = hayViableBasico && !sinSustentoCritico;

  if (!hayViableFinal) {
    escenarioElegido = {
      ...escenarioElegido,
      producto: "Sin oferta viable hoy",
      viable: false,
    };
  }

  const sinOferta = !hayViableFinal;

  const dtiSinHipoteca =
    ingresoTotal > 0 ? n(otrasDeudasMensuales) / ingresoTotal : 0;

  const dtiConHipoteca =
    ingresoTotal > 0
      ? (n(otrasDeudasMensuales) + n(escenarioElegido.cuota)) / ingresoTotal
      : 0;

  const reqDown80 = clamp(
    n(valorVivienda) * 0.2 - n(entradaDisponible),
    0,
    Number.POSITIVE_INFINITY
  );
  const reqDown90 = clamp(
    n(valorVivienda) * 0.1 - n(entradaDisponible),
    0,
    Number.POSITIVE_INFINITY
  );

  let riesgoScore = 100;
  const ratioEntrada =
    n(valorVivienda) > 0 ? n(entradaDisponible) / n(valorVivienda) : 0;
  if (dtiConHipoteca > 0.45) riesgoScore -= 25;
  if (ratioEntrada < 0.1) riesgoScore -= 20;
  if (tipoIngreso === "Independiente") riesgoScore -= 10;
  if (aniosEstNum < 1) riesgoScore -= 15;
  if (n(edad) < 25 || n(edad) > 60) riesgoScore -= 10;
  if (declaracionBuro === "regularizado") riesgoScore -= 15;
  if (declaracionBuro === "mora") riesgoScore -= 35;

  const riesgoHabitaLibre =
    riesgoScore >= 80 ? "bajo" : riesgoScore >= 60 ? "medio" : "alto";

  const tipoCreditoForScore = (() => {
    if (escenarioElegido === evalVIS) return "vis";
    if (escenarioElegido === evalVIP) return "vip";
    if (escenarioElegido === evalBPREF) return "biess_vip";
    if (escenarioElegido === evalBSTD) return "biess_std";
    return "default";
  })();

  const ultimas13ContinuasBool =
    n(iessAportesConsecutivos) >= MIN_IESS_CONSEC;

  const puntajeHabitaLibre = scoreHabitaLibre({
    dtiConHipoteca,
    ltv: escenarioElegido.ltv,
    aniosEstabilidad: aniosEstNum,
    edad: n(edad),
    tipoIngreso,
    declaracionBuro,
    tipoCredito: tipoCreditoForScore,
    esExtranjero,
    aportesIESS: n(iessAportesTotales),
    ultimas13Continuas: ultimas13ContinuasBool,
  });

  const bandas = {
    ltv: clamp(100 - escenarioElegido.ltv * 100, 0, 100),
    dti: clamp(100 - dtiConHipoteca * 100, 0, 100),
    estabilidad: clamp((aniosEstNum / 5) * 100, 0, 100),
    historial:
      declaracionBuro === "mora"
        ? 20
        : declaracionBuro === "regularizado"
        ? 60
        : 90,
  };

  const scoreHLtotal = Math.round(
    0.35 * bandas.ltv +
      0.35 * bandas.dti +
      0.15 * bandas.estabilidad +
      0.15 * bandas.historial
  );

  const stressTest = {
    tasaBase: n(escenarioElegido.tasaAnual),
    tasaStress: n(escenarioElegido.tasaAnual) + 0.02,
    cuotaBase: n(escenarioElegido.cuota),
    cuotaStress: n(escenarioElegido.cuotaStress),
    bufferRecomendado: 0.1,
  };

  const costos = (() => {
    const monto = n(escenarioElegido.montoPrestamo);
    const originacion = Math.min(monto * 0.01, 1200);
    const avaluo = 180;
    const segurosAnuales = n(valorVivienda) * 0.0015;
    const costosTotales = originacion + avaluo + segurosAnuales;
    const tcea =
      n(escenarioElegido.tasaAnual) +
      (monto > 0
        ? (costosTotales / monto) / (n(escenarioElegido.plazoMeses) / 12)
        : 0);
    return {
      originacion,
      avaluo,
      segurosAnuales,
      tcea,
    };
  })();

  const opciones = {
    VIP: {
      viable: evalVIP.viable,
      tasa: evalVIP.tasaAnual,
      plazo: evalVIP.plazoMeses,
      cuota: evalVIP.cuota,
      ltvMax: evalVIP.ltvMax,
    },
    VIS: {
      viable: evalVIS.viable,
      tasa: evalVIS.tasaAnual,
      plazo: evalVIS.plazoMeses,
      cuota: evalVIS.cuota,
      ltvMax: evalVIS.ltvMax,
    },
    BIESS: {
      viable: evalBSTD.viable || evalBPREF.viable,
      tasa: evalBPREF.viable ? evalBPREF.tasaAnual : evalBSTD.tasaAnual,
      plazo: evalBPREF.viable ? evalBPREF.plazoMeses : evalBSTD.plazoMeses,
      cuota: evalBPREF.viable ? evalBPREF.cuota : evalBSTD.cuota,
      ltvMax: evalBPREF.viable ? evalBPREF.ltvMax : evalBSTD.ltvMax,
    },
    Privada: {
      viable: evalCOM.viable,
      tasa: evalCOM.tasaAnual,
      plazo: evalCOM.plazoMeses,
      cuota: evalCOM.cuota,
      ltvMax: evalCOM.ltvMax,
    },
  };

  const rutasViables = [];

  if (opciones.VIS.viable) rutasViables.push({ tipo: "VIS", ...opciones.VIS });
  if (opciones.VIP.viable) rutasViables.push({ tipo: "VIP", ...opciones.VIP });
  if (opciones.BIESS.viable) rutasViables.push({ tipo: "BIESS", ...opciones.BIESS });
  if (opciones.Privada.viable) {
    rutasViables.push({ tipo: "Privada", ...opciones.Privada });
  }

  let rutaRecomendada = null;

  if (opciones.VIS.viable) {
    rutaRecomendada = { tipo: "VIS", ...opciones.VIS };
  } else if (opciones.VIP.viable) {
    rutaRecomendada = { tipo: "VIP", ...opciones.VIP };
  } else if (opciones.BIESS.viable && opciones.Privada.viable) {
    const cuotaBiess = n(opciones.BIESS.cuota);
    const cuotaPriv = n(opciones.Privada.cuota);
    if (cuotaPriv <= cuotaBiess * 0.99) {
      rutaRecomendada = { tipo: "Privada", ...opciones.Privada };
    } else {
      rutaRecomendada = { tipo: "BIESS", ...opciones.BIESS };
    }
  } else if (opciones.BIESS.viable) {
    rutaRecomendada = { tipo: "BIESS", ...opciones.BIESS };
  } else if (opciones.Privada.viable) {
    rutaRecomendada = { tipo: "Privada", ...opciones.Privada };
  }

  const checklist = {
    documentos: [
      "Cédula y papeleta de votación",
      "Historial de aportes IESS (últimos 24 meses)",
      tipoIngreso === "Dependiente"
        ? "Últimos 3 roles de pago"
        : "RUC + declaraciones 12 meses",
      "Extractos bancarios últimos 3 meses",
      "Proforma/Promesa de compraventa del inmueble (si aplica)",
    ],
    requisitos: [
      "DTI objetivo ≤ 42%",
      "LTV objetivo ≤ 85% para mejores condiciones (ideal ≤ 80%)",
      "Antigüedad laboral ≥ 12 meses (dependiente) / 24 meses (independiente)",
    ],
  };

  const accionesClave = [];
  const ingresoNum = n(ingresoTotal);
  const ingresoFmt = Math.round(ingresoNum).toLocaleString("es-EC", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  if (!hayViableFinal) {
    if (dtiConHipoteca > 0.42 && ingresoNum > 0) {
      const gapUSD = Math.ceil((dtiConHipoteca - 0.42) * ingresoNum);
      accionesClave.push(
        `Reduce deudas de consumo por aproximadamente $ ${gapUSD.toLocaleString(
          "es-EC",
          { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        )} para llevar tu DTI total por debajo de 42%.`
      );
    }

    if (escenarioElegido.ltv >= 0.9 && n(valorVivienda) > 0) {
      const extraDown = Math.ceil(
        (escenarioElegido.ltv - 0.9) * n(valorVivienda)
      );
      accionesClave.push(
        `Aumenta tu entrada en alrededor de $ ${extraDown.toLocaleString(
          "es-EC",
          { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        )} para que el banco no financie más del 90% del valor de la vivienda.`
      );
    } else if (
      escenarioElegido.ltv > 0 &&
      escenarioElegido.ltv >= 0.8 &&
      n(valorVivienda) > 0
    ) {
      const extraDown = Math.ceil(
        (escenarioElegido.ltv - 0.8) * n(valorVivienda)
      );
      accionesClave.push(
        `Si puedes, eleva tu entrada en unos $ ${extraDown.toLocaleString(
          "es-EC",
          { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        )} para acercarte a un LTV de 80% y mejorar tasas y condiciones.`
      );
    }

    if (ingresoNum < 900) {
      const targetLow = Math.round(Math.max(700, ingresoNum * 1.1) / 10) * 10;
      const targetHigh = Math.round((targetLow * 1.2) / 10) * 10;
      accionesClave.push(
        `Hoy tu ingreso familiar aproximado está alrededor de $ ${ingresoFmt}. Procura llevarlo en el mediano plazo a un rango cercano a $ ${targetLow.toLocaleString(
          "es-EC",
          { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        )} – $ ${targetHigh.toLocaleString(
          "es-EC",
          { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        )} mensuales, manteniendo bajo tu nivel de deudas. Eso hará que la cuota hipotecaria empiece a ser sostenible.`
      );
    } else if (ingresoNum >= 900 && ingresoNum < 1600) {
      const targetLow = Math.round((ingresoNum * 1.15) / 10) * 10;
      const targetHigh = Math.round((ingresoNum * 1.35) / 10) * 10;
      accionesClave.push(
        `Hoy tu ingreso familiar aproximado está alrededor de $ ${ingresoFmt}. A medida que lo acerques a un rango de $ ${targetLow.toLocaleString(
          "es-EC",
          { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        )} – $ ${targetHigh.toLocaleString(
          "es-EC",
          { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        )} mensuales sin subir tus deudas, tus probabilidades de aprobación aumentarán de forma importante.`
      );
    }

    if (!accionesClave.length) {
      accionesClave.push(
        "Tu perfil está en construcción. El foco principal es ordenar ingresos, deudas y entrada para que la cuota hipotecaria sea sostenible para ti y para los bancos."
      );
    }
  } else {
    if (dtiConHipoteca > 0.42 && ingresoNum > 0) {
      const gapUSD = Math.ceil((dtiConHipoteca - 0.42) * ingresoNum);
      accionesClave.push(
        `Aunque tu perfil ya es viable, bajar tu DTI por debajo de 42% reduciendo deudas en unos $ ${gapUSD.toLocaleString(
          "es-EC",
          { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        )} te ayudará a negociar mejores condiciones.`
      );
    }

    if (escenarioElegido.ltv > 0.85 && n(valorVivienda) > 0) {
      const extraDown = Math.ceil(
        (escenarioElegido.ltv - 0.85) * n(valorVivienda)
      );
      accionesClave.push(
        `Si aumentas tu entrada en aproximadamente $ ${extraDown.toLocaleString(
          "es-EC",
          { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        )} y bajas el LTV hacia 80–85%, podrás acceder a mejores tasas o a más entidades.`
      );
    }

    if (!accionesClave.length) {
      accionesClave.push(
        "Perfil sólido. Solicita preaprobación en 2–3 entidades y compara TCEA (costo total del crédito), no solo la tasa."
      );
    }
  }

  const benchVIP = { nombre: "Opción A (VIP)", tasa: 0.0499, plazo: 300 };
  const benchPRI = { nombre: "Opción B (Privada)", tasa: 0.099, plazo: 240 };
  const benchBIE = { nombre: "Opción C (BIESS)", tasa: 0.069, plazo: 240 };
  const loan = n(escenarioElegido.montoPrestamo);
  const mkCuota = (t, p) => pmt(t / 12, p, loan);
  const mkTCEA = (t) =>
    t +
    (loan > 0
      ? ((costos.originacion + costos.avaluo + costos.segurosAnuales) / loan) /
        (n(escenarioElegido.plazoMeses) / 12)
      : 0);

  const benchmark = [
    {
      ...benchVIP,
      cuota: mkCuota(benchVIP.tasa, benchVIP.plazo),
      tcea: mkTCEA(benchVIP.tasa),
    },
    {
      ...benchPRI,
      cuota: mkCuota(benchPRI.tasa, benchPRI.plazo),
      tcea: mkTCEA(benchPRI.tasa),
    },
    {
      ...benchBIE,
      cuota: mkCuota(benchBIE.tasa, benchBIE.plazo),
      tcea: mkTCEA(benchBIE.tasa),
    },
  ];

  let perfilLabel = "Ajustar datos";
  if (evalVIS.viable) perfilLabel = "VIS viable";
  else if (evalVIP.viable) perfilLabel = "VIP viable";
  else if (evalBPREF.viable) perfilLabel = "BIESS preferencial viable";
  else if (evalBSTD.viable) perfilLabel = "BIESS viable";
  else if (evalCOM.viable) perfilLabel = "Comercial viable";

  if (!hayViableFinal) {
    perfilLabel =
      "Perfil en construcción (ingreso insuficiente / parámetros no viables)";
  }

  if (aniosEstNum < 1) {
    perfilLabel = "Perfil en construcción (falta estabilidad)";
  }

  const evalBIESS_ALIAS = evalBPREF.viable ? evalBPREF : evalBSTD;

  return {
    ok: true,
    entradaDisponible: n(entradaDisponible),
    valorVivienda: n(valorVivienda),
    capacidadPago: n(capacidadPago),
    montoMaximo: n(escenarioElegido.montoPrestamo),
    precioMaxVivienda: n(escenarioElegido.precioMaxVivienda),
    ltv: n(escenarioElegido.ltv),
    dtiSinHipoteca: n(dtiSinHipoteca),
    dtiConHipoteca: n(dtiConHipoteca),
    tasaAnual: n(escenarioElegido.tasaAnual),
    plazoMeses: n(escenarioElegido.plazoMeses),
    cuotaEstimada: n(escenarioElegido.cuota),
    cuotaStress: n(escenarioElegido.cuotaStress),
    bounds: escenarioElegido.bounds,
    productoElegido:
      rutaRecomendada?.tipo === "Privada"
        ? "Banca privada"
        : rutaRecomendada?.tipo || escenarioElegido.producto,
    requeridos: { downTo80: n(reqDown80), downTo90: n(reqDown90) },
    flags: {
      sinOferta,
      sinSustento: sinSustentoCritico,
    },
    perfil: {
      label: perfilLabel,
      edad: n(edad),
      tipoIngreso,
      aniosEstabilidad: aniosEstNum,
      afiliadoIess: afiliadoBool ? "Sí" : "No",
      ingresoTotal: n(ingresoTotal),
      tieneVivienda: !!tieneViviendaBool,
      viviendaEstrenar: !!viviendaNuevaBool,
      estadoCivil: estadoCivil || null,
      nacionalidad,
      esExtranjero,
      iessAportesTotales: n(iessAportesTotales),
      iessAportesConsecutivos: n(iessAportesConsecutivos),
      sustentoIndependiente: sustentoIndependiente || null,
      sustentoOKGlobal,
    },
    escenarios: {
      vis: evalVIS,
      vip: evalVIP,
      biess: evalBIESS_ALIAS,
      biess_pref: evalBPREF,
      biess_std: evalBSTD,
      comercial: evalCOM,
    },
    eligibilityProducts,
    catalogEvaluation: {
      byId: evaluatedCatalogMap,
      all: evaluatedCatalogProducts,
    },
    riesgoHabitaLibre,
    puntajeHabitaLibre,
    scoreHL: { total: scoreHLtotal, bandas },
    stressTest,
    costos,
    opciones,
    rutasViables,
    rutaRecomendada,
    checklist,
    accionesClave,
    benchmark,
  };
}

/* ===========================================================
   Probabilidad de aprobación por banco (nuevo)
=========================================================== */
export function evaluarProbabilidadPorBanco(input) {
  const base = calcularPrecalificacion(input);

  const {
    valorVivienda,
    entradaDisponible,
    montoMaximo,
    plazoMeses,
    tasaAnual,
    riesgoHabitaLibre,
    flags,
    perfil,
    productoElegido,
    escenarios,
    rutaRecomendada,
  } = base;

  const {
    ingresoTotal = 0,
    aniosEstabilidad = 0,
    tipoIngreso,
    afiliadoIess,
    iessAportesTotales = 0,
    iessAportesConsecutivos = 0,
  } = perfil || {};

  const declaracionBuro = input?.declaracionBuro || "ninguno";
  const otrasDeudasMensuales = n(input?.otrasDeudasMensuales);
  const ingresoDisponible = Math.max(
    0,
    n(ingresoTotal) - otrasDeudasMensuales
  );

  const montoNecesario = Math.max(
    0,
    n(valorVivienda) - n(entradaDisponible)
  );

  const montoPrestamoBase = Math.max(
    0,
    Math.min(n(montoMaximo), montoNecesario)
  );

  const plazoMesesEfectivo =
    n(plazoMeses) || (input?.plazoAnios ? n(input.plazoAnios) * 12 : 240);

  const tasaAnualBase = n(tasaAnual) || 0.08;

  const vipViable = escenarios?.vip?.viable;
  const visViable = escenarios?.vis?.viable;
  const biessViable = escenarios?.biess?.viable;
  const comViable = escenarios?.comercial?.viable;

  const resultados = BANK_PROFILES.map((bank) => {
    const {
      id,
      nombre,
      tipo,
      dtiMaxDependiente,
      dtiMaxIndependiente,
      ltvMax,
      ltvMaxAAA,
      ltvMaxDefault,
      tasaRef,
      minAniosEstDep,
      minAniosRucInd,
      requiereIESS,
      requiereAportes,
    } = bank;

    const dtiMax =
      tipoIngreso === "Dependiente"
        ? n(dtiMaxDependiente, 0.4)
        : n(dtiMaxIndependiente, 0.4);

    const cuotaMaxBanco = ingresoDisponible * dtiMax;
    const tasaAnualBanco = n(tasaRef, tasaAnualBase);
    const tasaMesBanco = tasaAnualBanco / 12;

    const montoPrestamo = montoPrestamoBase;
    const cuotaNecesaria = pmt(tasaMesBanco, plazoMesesEfectivo, montoPrestamo);

    const ltvReal =
      n(valorVivienda) > 0 ? montoPrestamo / n(valorVivienda) : 0;

    let ltvMaxBanco;
    if (ltvMaxAAA && declaracionBuro === "ninguno") {
      ltvMaxBanco = ltvMaxAAA;
    } else if (ltvMax) {
      ltvMaxBanco = ltvMax;
    } else if (ltvMaxDefault) {
      ltvMaxBanco = ltvMaxDefault;
    } else {
      ltvMaxBanco = 0.85;
    }

    let score = 100;

    if (cuotaNecesaria > cuotaMaxBanco + 1e-6) score -= 40;
    if (ltvReal > ltvMaxBanco + 1e-6) score -= 30;

    const aniosEst = n(aniosEstabilidad);
    if (
      tipoIngreso === "Dependiente" &&
      minAniosEstDep &&
      aniosEst < minAniosEstDep
    ) {
      score -= 15;
    }
    if (
      tipoIngreso !== "Dependiente" &&
      minAniosRucInd &&
      aniosEst < minAniosRucInd
    ) {
      score -= 15;
    }

    const afiliadoBool =
      typeof afiliadoIess === "string"
        ? afiliadoIess.toLowerCase().startsWith("s")
        : !!afiliadoIess;

    if (requiereIESS && !afiliadoBool) score -= 40;
    if (requiereAportes) {
      if (n(iessAportesTotales) < MIN_IESS_TOTALES) score -= 25;
      if (n(iessAportesConsecutivos) < MIN_IESS_CONSEC) score -= 25;
    }

    if (declaracionBuro === "regularizado") score -= 10;
    if (declaracionBuro === "mora") score -= 40;

    if (bank.tipo !== "VIP" && bank.tipo !== "VIS") {
      if (riesgoHabitaLibre === "alto") score -= 10;
    }

    if (flags?.sinSustento) {
      score -= 30;
    }

    // ✅ fix: VIS y VIP se penalizan por separado
    if (bank.tipo === "VIP" && vipViable === false) {
      score -= 60;
    }

    if (bank.tipo === "VIS" && visViable === false) {
      score -= 60;
    }

    if (bank.tipo === "BIESS") {
      if (biessViable === false) score -= 60;
    }

    if (bank.tipo === "NORMAL") {
      if (comViable === false) score -= 60;
    }

    score = clamp(score, 0, 100);

    let probabilidad = "Baja";
    if (score >= 80) probabilidad = "Alta";
    else if (score >= 60) probabilidad = "Media";
    else if (score < 40) probabilidad = "Muy baja";

    return {
      bancoId: id,
      banco: nombre,
      tipo,
      score,
      probabilidad,
      cuotaNecesaria,
      cuotaMaxBanco,
      ltvReal,
      ltvMaxBanco,
      dtiUsadoBanco: dtiMax,
    };
  });

  const tipoRutaBase =
    rutaRecomendada?.tipo || (productoElegido || "").toString();
  const tipoRutaLower = tipoRutaBase.toLowerCase();

  resultados.sort((a, b) => {
    if (tipoRutaLower.includes("biess")) {
      const aIsBiess = a.tipo === "BIESS";
      const bIsBiess = b.tipo === "BIESS";
      if (aIsBiess !== bIsBiess) return aIsBiess ? -1 : 1;
    }

    if (tipoRutaLower.includes("vis")) {
      const aIsVis = a.tipo === "VIS";
      const bIsVis = b.tipo === "VIS";
      if (aIsVis !== bIsVis) return aIsVis ? -1 : 1;
    }

    if (tipoRutaLower.includes("vip")) {
      const aIsVip = a.tipo === "VIP";
      const bIsVip = b.tipo === "VIP";
      if (aIsVip !== bIsVip) return aIsVip ? -1 : 1;
    }

    if (
      tipoRutaLower.includes("privada") ||
      tipoRutaLower.includes("comercial") ||
      tipoRutaLower.includes("normal")
    ) {
      const aIsNormal = a.tipo === "NORMAL";
      const bIsNormal = b.tipo === "NORMAL";
      if (aIsNormal !== bIsNormal) return aIsNormal ? -1 : 1;
    }

    return b.score - a.score;
  });

    const resultadosFiltrados = resultados.filter((r) => {
    if (r.tipo === "VIP") return vipViable === true;
    if (r.tipo === "VIS") return visViable === true;
    if (r.tipo === "BIESS") return biessViable === true;
    if (r.tipo === "NORMAL") return comViable === true;
    return true;
  });

  const bancosProbabilidadBase = resultadosFiltrados.map((r) => ({
    banco: r.banco,
    tipoProducto: r.tipo,
    probScore: r.score,
    probLabel: r.probabilidad,
    dtiBanco: r.dtiUsadoBanco,
  }));

  const bancosProbabilidad = bancosProbabilidadBase.map((b) =>
    enrichBancoResultado(b, escenarios)
  );

  const bancosTop3 = bancosProbabilidad.slice(0, 3);
  const mejorBanco = bancosTop3[0] || null;

  return {
    ...base,
    bancosProbabilidad,
    bancosTop3,
    mejorBanco,
  };
}

/* ===========================================================
   Afinidad básica con bancos mock (legacy)
=========================================================== */
export function mapearBancos(input) {
  const base = calcularPrecalificacion(input);
  const { montoMaximo, capacidadPago } = base;

  const opciones = BANK_RULES.map((b) => {
    const plazo = b.plazos?.[0] ?? 240;
    const cuota = pmt(b.tasa / 12, plazo, Math.max(0, n(montoMaximo)));
    const dentro = cuota <= n(capacidadPago) + 1e-6;
    return {
      banco: b.nombre,
      tasa: (b.tasa * 100).toFixed(2),
      plazo,
      cuota,
      dentroDeCapacidad: dentro,
    };
  });

  return { ...base, opciones };
}

/* ===========================================================
   Exports
=========================================================== */
export default calcularPrecalificacion;
export { BANK_RULES, BANK_PROFILES };