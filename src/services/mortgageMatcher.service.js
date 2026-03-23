// src/services/mortgageMatcher.service.js

console.log("✅ CARGADO mortgageMatcher.service.js NUEVO");

import { mortgageCatalog, SBU } from "../config/mortgageCatalog.js";
import scoreHabitaLibre from "../lib/scoreHabitaLibre.js";
import matchPropertiesToProfile from "./propertyMatch.service.js";

/* ===========================================================
   Helpers numéricos / financieros
=========================================================== */
const n = (v, def = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

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

function money(v) {
  return Math.round(n(v)).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function pct(v, digits = 0) {
  return `${(n(v) * 100).toFixed(digits)}%`;
}

function toBool(v, def = false) {
  if (v === true || v === false) return v;
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "si", "sí", "s", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return def;
}

/* ===========================================================
   Helpers de applicant type BIESS
=========================================================== */
function normalizeBiessApplicantType(input = {}) {
  const raw =
    input.tipoSolicitanteBiess ||
    input.tipoSolicitante ||
    input.tipoAfiliado ||
    input.tipoAfiliacion ||
    null;

  const discapacidad =
    toBool(input.tieneDiscapacidad, false) ||
    toBool(input.discapacidad, false);

  const jubilado =
    toBool(input.esJubilado, false) ||
    toBool(input.jubilado, false);

  if (discapacidad) return "discapacidad";
  if (jubilado) return "jubilado";

  const s = String(raw ?? "").trim().toLowerCase();

  if (!s) {
    return String(input.tipoIngreso || "")
      .trim()
      .toLowerCase() === "dependiente"
      ? "dependiente"
      : "independiente";
  }

  if (s.includes("volunt")) return "voluntario";
  if (s.includes("jubil")) return "jubilado";
  if (s.includes("discap")) return "discapacidad";
  if (s.includes("depend")) return "dependiente";
  if (s.includes("independ")) return "independiente";

  return String(input.tipoIngreso || "")
    .trim()
    .toLowerCase() === "dependiente"
    ? "dependiente"
    : "independiente";
}

/* ===========================================================
   Helpers de perfil laboral / sustento
=========================================================== */
function normalizeTipoIngreso(raw) {
  const s = String(raw || "Dependiente").trim().toLowerCase();
  if (s.includes("mixt")) return "Mixto";
  if (s.includes("independ")) return "Independiente";
  return "Dependiente";
}

function normalizeTipoContrato(raw) {
  const s = String(raw || "indefinido").trim().toLowerCase();
  if (s.includes("tempor")) return "temporal";
  if (s.includes("serv")) return "servicios";
  return "indefinido";
}

function normalizeSustentoIndependiente(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("ruc") || s.includes("factur")) return "facturacion_ruc";
  if (s.includes("bancar")) return "movimientos_bancarizados";
  if (s.includes("sri") || s.includes("declar")) return "declaracion_sri";
  if (s.includes("mixt")) return "mixto";
  if (s.includes("inform")) return "informal";
  return s;
}

/* ===========================================================
   Normalización de input
=========================================================== */
function normalizeInput(input = {}) {
  const afiliadoBool =
    typeof input.afiliadoIess === "string"
      ? input.afiliadoIess.toLowerCase().startsWith("s")
      : !!input.afiliadoIess;

  const primeraViviendaBool =
    input.primeraVivienda == null
      ? null
      : typeof input.primeraVivienda === "string"
      ? input.primeraVivienda.trim().toLowerCase().startsWith("s")
      : !!input.primeraVivienda;

  const tieneViviendaBoolRaw =
    typeof input.tieneVivienda === "string"
      ? /si|sí|true|1/i.test(input.tieneVivienda)
      : !!input.tieneVivienda;

  const tieneViviendaBool =
    primeraViviendaBool == null ? tieneViviendaBoolRaw : !primeraViviendaBool;

  const viviendaUsadaBool =
    typeof input.viviendaUsada === "string"
      ? /usada|segunda/i.test(input.viviendaUsada.trim().toLowerCase())
      : !!input.viviendaUsada;

  const viviendaNuevaBool = viviendaUsadaBool
    ? false
    : typeof input.viviendaEstrenar === "boolean"
    ? input.viviendaEstrenar
    : true;

  const esExtranjero =
    typeof input.nacionalidad === "string"
      ? input.nacionalidad.trim().toLowerCase() !== "ecuatoriana"
      : false;

  const tipoSolicitanteBiess = normalizeBiessApplicantType(input);
  const tipoIngreso = normalizeTipoIngreso(input.tipoIngreso);
  const tipoContrato = normalizeTipoContrato(input.tipoContrato);
  const sustentoIndependiente = normalizeSustentoIndependiente(
    input.sustentoIndependiente
  );

  const aniosEstabilidad = n(input.aniosEstabilidad, 2);
  const mesesActividad = n(
    input.mesesActividad,
    tipoIngreso === "Independiente" || tipoIngreso === "Mixto"
      ? aniosEstabilidad * 12
      : 0
  );

  return {
    ...input,
    edad: n(input.edad, 30),
    ingresoNetoMensual: n(input.ingresoNetoMensual),
    ingresoPareja: n(input.ingresoPareja),
    otrasDeudasMensuales: n(input.otrasDeudasMensuales),
    valorVivienda: n(input.valorVivienda),
    entradaDisponible: n(input.entradaDisponible),
    capacidadEntradaMensual: n(input.capacidadEntradaMensual),
    aniosEstabilidad,
    mesesActividad,
    iessAportesTotales: n(input.iessAportesTotales),
    iessAportesConsecutivos: n(input.iessAportesConsecutivos),
    dormitorios: n(input.dormitorios, 2),

    tipoIngreso,
    tipoContrato,
    sustentoIndependiente,
    declaracionBuro: input.declaracionBuro || "ninguno",
    nacionalidad: input.nacionalidad || "ecuatoriana",
    horizonteCompra: input.horizonteCompra || input.tiempoCompra || null,

    afiliadoBool,
    tieneViviendaBool,
    viviendaNuevaBool,
    esExtranjero,

    tipoSolicitanteBiess,
    pensionJubilarVigente: toBool(input.pensionJubilarVigente, false),
    esJubilado:
      toBool(input.esJubilado, false) || tipoSolicitanteBiess === "jubilado",
    tieneDiscapacidad:
      toBool(input.tieneDiscapacidad, false) ||
      tipoSolicitanteBiess === "discapacidad",
  };
}

/* ===========================================================
   Helpers de planificación de entrada
=========================================================== */
function resolvePlanningMonths(ctx = {}) {
  const override =
    n(ctx?.__planningMonthsOverride, 0) ||
    n(ctx?.metaProyecto?.mesesAhorro, 0) ||
    n(ctx?.__metaProyecto?.mesesAhorro, 0) ||
    n(ctx?.metaProyecto?.monthsConstruction, 0) ||
    n(ctx?.__metaProyecto?.monthsConstruction, 0);

  if (override > 0) return override;

  const h = String(ctx?.horizonteCompra || "").trim().toLowerCase();

  if (h === "0-3") return 3;
  if (h === "3-12") return 12;
  if (h === "12-24") return 24;
  if (h === "explorando") return 24;

  return 18;
}

function buildPlannedEntrySnapshot(ctx = {}) {
  const entradaActual = n(ctx?.entradaDisponible, 0);
  const ahorroMensual = n(ctx?.capacidadEntradaMensual, 0);
  const meses = resolvePlanningMonths(ctx);

  const entradaFutura = entradaActual + ahorroMensual * meses;

  return {
    entradaActual,
    ahorroMensual,
    meses,
    entradaFutura,
  };
}

function cloneCtxWithPlannedEntry(ctx = {}) {
  const plan = buildPlannedEntrySnapshot(ctx);

  return {
    ...ctx,
    entradaDisponible: plan.entradaFutura,
    _plannedEntryMeta: plan,
  };
}

/* ===========================================================
   Rate resolver
=========================================================== */
function resolveAnnualRate(product, { loanAmount, termYears, propertyValue }) {
  const rate = product?.rate || {};

  if (rate.type === "fixed") {
    return n(rate.annual, null);
  }

  if (rate.type === "tiered") {
    const tiers = Array.isArray(rate.tiers) ? rate.tiers : [];

    for (const tier of tiers) {
      const maxProperty =
        tier.maxProperty == null ? Infinity : n(tier.maxProperty, Infinity);
      const minProperty = tier.minProperty == null ? 0 : n(tier.minProperty, 0);
      const maxLoan = tier.maxLoan == null ? Infinity : n(tier.maxLoan, Infinity);
      const maxYears = tier.maxYears == null ? Infinity : n(tier.maxYears, Infinity);

      const propertyOk =
        n(propertyValue) >= minProperty && n(propertyValue) <= maxProperty;
      const loanOk = loanAmount <= maxLoan;
      const yearsOk = termYears <= maxYears;

      if (propertyOk && loanOk && yearsOk) {
        return n(tier.annual, null);
      }
    }

    return n(rate.fallbackAnnual, null);
  }

  return null;
}

/* ===========================================================
   Compatibilidad subsidio ↔ hipoteca
=========================================================== */
function isSubsidyCompatibleWithMortgage(subsidyProduct, mortgageProduct) {
  if (!subsidyProduct || !mortgageProduct) return false;

  if (subsidyProduct.id === "VIS_II") {
    return (
      mortgageProduct.segment === "VIS" &&
      mortgageProduct.channel === "PRIVATE_BANK"
    );
  }

  return false;
}

/* ===========================================================
   Prioridad comercial por producto
=========================================================== */
function getScenarioPriority(scenario) {
  const mortgage = scenario?.mortgage;
  if (!mortgage) return 99;

  if (mortgage?.id === "BIESS_CREDICASA") return 1;
  if (mortgage?.segment === "VIS") return 2;
  if (mortgage?.segment === "VIP") return 3;
  if (mortgage?.id === "BIESS_VIS_VIP") return 4;
  if (mortgage?.id === "BIESS_MEDIA") return 5;
  if (mortgage?.id === "BIESS_ALTA") return 6;
  if (mortgage?.id === "BIESS_LUJO") return 7;
  if (mortgage?.segment === "PRIVATE") return 8;

  return 99;
}

/* ===========================================================
   Gates comunes
=========================================================== */
function checkCommonEligibility(product, ctx, extra = {}, options = {}) {
  const rules = product.rules || {};
  const caps = product.caps || {};
  const ignoreProperty = !!options.ignoreProperty;

  const ingresoTotal = n(ctx.ingresoNetoMensual) + n(ctx.ingresoPareja);

  const incomeMin =
    caps.incomeMin == null ? -Infinity : n(caps.incomeMin, -Infinity);
  const incomeMax =
    caps.incomeMax == null ? Infinity : n(caps.incomeMax, Infinity);

  const propertyMax =
    caps.propertyMax == null ? Infinity : n(caps.propertyMax, Infinity);

  const propertyMin = caps.propertyMin == null ? 0 : n(caps.propertyMin, 0);

  const firstHomeOk = rules.firstHome ? !ctx.tieneViviendaBool : true;
  const newConstructionOk = rules.newConstruction
    ? !!ctx.viviendaNuevaBool
    : true;

  const incomeOk =
    ingresoTotal >= incomeMin && ingresoTotal <= incomeMax + 1e-9;

  const propertyOk = ignoreProperty
    ? true
    : n(ctx.valorVivienda) >= propertyMin &&
      n(ctx.valorVivienda) <= propertyMax + 1e-9;

  const iessOk = rules.requireIESS ? !!ctx.afiliadoBool : true;

  const tipoSolicitanteBiess = String(ctx.tipoSolicitanteBiess || "").toLowerCase();

  const eligibleApplicantTypes = Array.isArray(rules.eligibleApplicantTypes)
    ? rules.eligibleApplicantTypes.map((x) => String(x).toLowerCase())
    : null;

  const applicantTypeOk = eligibleApplicantTypes
    ? eligibleApplicantTypes.includes(tipoSolicitanteBiess)
    : true;

  let contribTotalOk = true;
  let contribConsecOk = true;
  let pensionOk = true;

  if (rules.requireContributions) {
    if (tipoSolicitanteBiess === "discapacidad") {
      const minTotal = n(
        rules.minContribTotalMonthsDisability,
        rules.minContribTotalMonths,
        18
      );
      contribTotalOk = n(ctx.iessAportesTotales) >= minTotal;
      contribConsecOk = true;
    } else if (tipoSolicitanteBiess === "jubilado") {
      pensionOk = rules.requirePensionForRetirees
        ? !!ctx.pensionJubilarVigente
        : true;
      contribTotalOk = true;
      contribConsecOk = true;
    } else if (
      tipoSolicitanteBiess === "voluntario" ||
      tipoSolicitanteBiess === "independiente"
    ) {
      const minTotal = n(
        rules.minContribTotalMonthsIndependent,
        rules.minContribTotalMonths,
        36
      );
      const minConsec = n(
        rules.minContribConsecutiveMonthsIndependent,
        rules.minContribConsecutiveMonths,
        36
      );
      contribTotalOk = n(ctx.iessAportesTotales) >= minTotal;
      contribConsecOk = n(ctx.iessAportesConsecutivos) >= minConsec;
    } else {
      const minTotal = n(
        rules.minContribTotalMonthsDependent,
        rules.minContribTotalMonths,
        36
      );
      const minConsec = n(
        rules.minContribConsecutiveMonthsDependent,
        rules.minContribConsecutiveMonths,
        13
      );
      contribTotalOk = n(ctx.iessAportesTotales) >= minTotal;
      contribConsecOk = n(ctx.iessAportesConsecutivos) >= minConsec;
    }
  }

  const foreignOk =
    rules.allowsForeign == null ? true : rules.allowsForeign || !ctx.esExtranjero;

  const buro = String(ctx.declaracionBuro || "ninguno").toLowerCase();
  const buroOk =
    buro === "mora"
      ? !!rules.allowsBuroMora
      : buro === "regularizado"
      ? rules.allowsBuroRegularizado !== false
      : true;

  const minYearsDep = n(rules.minYearsEmployedDep, 0);
  const minYearsInd = n(rules.minYearsRucInd, 0);

  const esDependiente = ctx.tipoIngreso === "Dependiente";
  const esIndependiente = ctx.tipoIngreso === "Independiente";
  const esMixto = ctx.tipoIngreso === "Mixto";

  const estabilidadDependienteOk =
    !esDependiente && !esMixto
      ? true
      : n(ctx.aniosEstabilidad) >= minYearsDep;

  const estabilidadIndependienteOk =
    !esIndependiente && !esMixto
      ? true
      : n(ctx.mesesActividad) >= minYearsInd * 12;

  const contratoOk =
    !esDependiente && !esMixto
      ? true
      : ["indefinido", "temporal", "servicios"].includes(
          String(ctx.tipoContrato || "").toLowerCase()
        );

  const sustentoIngresosOk =
    !esIndependiente && !esMixto
      ? true
      : [
          "facturacion_ruc",
          "movimientos_bancarizados",
          "declaracion_sri",
          "mixto",
        ].includes(String(ctx.sustentoIndependiente || "").toLowerCase());

  const estabilidadOk =
    estabilidadDependienteOk &&
    estabilidadIndependienteOk &&
    contratoOk &&
    sustentoIngresosOk;

  const extraChecks = {
    applicantTypeOk,
    pensionOk,
    estabilidadDependienteOk,
    estabilidadIndependienteOk,
    contratoOk,
    sustentoIngresosOk,
    ...extra,
  };

  const allOk =
    firstHomeOk &&
    newConstructionOk &&
    incomeOk &&
    propertyOk &&
    iessOk &&
    contribTotalOk &&
    contribConsecOk &&
    pensionOk &&
    applicantTypeOk &&
    foreignOk &&
    buroOk &&
    estabilidadOk &&
    Object.values(extraChecks).every(Boolean);

  return {
    ok: allOk,
    flags: {
      firstHomeOk,
      newConstructionOk,
      incomeOk,
      propertyOk,
      iessOk,
      contribTotalOk,
      contribConsecOk,
      pensionOk,
      applicantTypeOk,
      foreignOk,
      buroOk,
      estabilidadOk,
      estabilidadDependienteOk,
      estabilidadIndependienteOk,
      contratoOk,
      sustentoIngresosOk,
      ...extraChecks,
    },
  };
}

/* ===========================================================
   Evalúa subsidio
=========================================================== */
function evaluateSubsidyProgram(product, ctx) {
  const common = checkCommonEligibility(product, ctx);

  if (!common.ok) {
    return {
      id: product.id,
      name: product.name,
      type: "subsidy",
      viable: false,
      subsidyAmount: 0,
      flags: common.flags,
      reasons: ["No cumple reglas básicas del subsidio"],
      product,
    };
  }

  const subsidy = product.subsidy || {};
  const subsidyAmount = clamp(n(subsidy.maxAmount), 0, Infinity);

  return {
    id: product.id,
    name: product.name,
    type: "subsidy",
    viable: subsidyAmount > 0,
    subsidyAmount,
    flags: common.flags,
    reasons: subsidyAmount > 0 ? [] : ["Subsidio no configurado"],
    product,
  };
}

/* ===========================================================
   Evalúa hipoteca contra la meta actual
=========================================================== */
function evaluateMortgageProduct(
  product,
  ctx,
  subsidyAmount = 0,
  subsidyProduct = null
) {
  const ingresoTotal = n(ctx.ingresoNetoMensual) + n(ctx.ingresoPareja);
  const ingresoDisponible = Math.max(
    0,
    ingresoTotal - n(ctx.otrasDeudasMensuales)
  );

  const termCfg = product.term || {};
  const risk = product.risk || {};
  const caps = product.caps || {};
  const rules = product.rules || {};

  const minYears = n(termCfg.minYears, 5);
  const maxYears = n(termCfg.maxYears, 25);
  const defaultYears = n(termCfg.defaultYears, maxYears);

  const userYears =
    ctx.plazoAnios != null
      ? clamp(n(ctx.plazoAnios, defaultYears), minYears, maxYears)
      : defaultYears;

  const maxAgeAtMaturity = n(termCfg.maxAgeAtMaturity, 75);
  const maxYearsByAge = Math.max(0, maxAgeAtMaturity - n(ctx.edad, 30));
  const effectiveYears = Math.min(userYears, maxYearsByAge);

  const maxAgeAtApplication = n(rules.maxAgeAtApplication, Infinity);
  const maxAgePlusTerm = n(rules.maxAgePlusTerm, Infinity);

  const ageAtApplicationOk = n(ctx.edad) <= maxAgeAtApplication;
  const agePlusTermOk = n(ctx.edad) + effectiveYears <= maxAgePlusTerm;
  const ageOk = effectiveYears > 0 && ageAtApplicationOk && agePlusTermOk;

  const propertyMax =
    caps.propertyMax == null ? Infinity : n(caps.propertyMax, Infinity);

  const montoNecesarioBruto = Math.max(
    0,
    n(ctx.valorVivienda) - n(ctx.entradaDisponible)
  );

  const montoNecesarioNeto = Math.max(
    0,
    montoNecesarioBruto - n(subsidyAmount)
  );

  const loanCap =
    caps.loanCap == null ? Infinity : n(caps.loanCap, Infinity);

  const requestedLoan = Math.min(montoNecesarioNeto, loanCap);

  const annualRate = resolveAnnualRate(product, {
    loanAmount: requestedLoan,
    termYears: effectiveYears,
    propertyValue: ctx.valorVivienda,
  });

  const baseEligibility = checkCommonEligibility(product, ctx, {
    ageOk,
    ageAtApplicationOk,
    agePlusTermOk,
  });

  if (!baseEligibility.ok || !annualRate) {
    return {
      id: product.id,
      name: product.name,
      type: "mortgage",
      viable: false,
      annualRate,
      subsidyAmount: n(subsidyAmount),
      cuota: 0,
      montoPrestamo: 0,
      requestedLoan,
      precioMaxProgramaHipoteca: 0,
      precioMaxProgramaSubsidio: 0,
      precioMaxPrograma: 0,
      precioMaxPorCuota: 0,
      precioMaxPorEntrada: 0,
      precioMaxPerfil: 0,
      factorLimitante: null,
      precioMaxVivienda: 0,
      flags: {
        ...baseEligibility.flags,
        rateOk: !!annualRate,
      },
      reasons: [
        !annualRate ? "No hay tasa resolvible para este monto/plazo" : null,
        ...Object.entries(baseEligibility.flags)
          .filter(([, v]) => !v)
          .map(([k]) => `Falla en ${k}`),
      ].filter(Boolean),
      score: 0,
      probabilidad: null,
      product,
    };
  }

  const monthlyRate = annualRate / 12;
  const termMonths = effectiveYears * 12;

  const dtiMax = n(risk.dtiMax, 0.4);
  const ltvMax = n(risk.ltvMax, 0.85);

  const cuotaMax = Math.max(0, ingresoDisponible * dtiMax);
  const montoMaxPorCuota = pvFromPayment(monthlyRate, termMonths, cuotaMax);

  const capHipoteca = propertyMax;

  const capSubsidio =
    subsidyProduct?.caps?.propertyMax == null
      ? Infinity
      : n(subsidyProduct.caps.propertyMax, Infinity);

  const precioMaxProgramaHipoteca = capHipoteca;
  const precioMaxProgramaSubsidio = capSubsidio;

  const precioMaxPrograma = Math.min(
    precioMaxProgramaHipoteca,
    precioMaxProgramaSubsidio
  );

  const precioMaxPorCuota =
    n(ctx.entradaDisponible) + n(subsidyAmount) + montoMaxPorCuota;

  const precioMaxPorEntrada =
    1 - ltvMax > 0
      ? (n(ctx.entradaDisponible) + n(subsidyAmount)) / (1 - ltvMax)
      : Infinity;

  const precioMaxPerfil = Math.min(
    precioMaxPorCuota,
    precioMaxPorEntrada,
    precioMaxPrograma
  );

  const precioMaxVivienda = precioMaxPerfil;

  const EPS = 1e-6;
  let factorLimitante = "programa";

  if (Math.abs(precioMaxPerfil - precioMaxPorEntrada) < EPS) {
    factorLimitante = "entrada";
  } else if (Math.abs(precioMaxPerfil - precioMaxPorCuota) < EPS) {
    factorLimitante = "cuota";
  } else if (Math.abs(precioMaxPerfil - precioMaxPrograma) < EPS) {
    factorLimitante = "programa";
  }

  const montoPrestamo = Math.max(
    0,
    Math.min(requestedLoan, montoMaxPorCuota, loanCap)
  );

  const cuota = pmt(monthlyRate, termMonths, montoPrestamo);

  const ltvRealRaw =
    n(ctx.valorVivienda) > 0 ? montoPrestamo / n(ctx.valorVivienda) : 0;

  const ltvReal = Number(ltvRealRaw.toFixed(5));

  const dentroPrecioPrograma = n(ctx.valorVivienda) <= precioMaxPrograma + 1e-9;
  const dentroPrecioPerfil = n(ctx.valorVivienda) <= precioMaxPerfil + 1e-9;

  const dentroPrecio = dentroPrecioPrograma && dentroPrecioPerfil;
  const dentroLtv = ltvReal <= ltvMax + 1e-9;
  const dentroCapacidad = cuota <= cuotaMax + 1e-9;

  const viable = dentroPrecio && dentroLtv && dentroCapacidad;

  let tipoCredito = "default";
  if (product.id === "BIESS_CREDICASA") tipoCredito = "biess_vip";
  else if (product.id === "BIESS_VIS_VIP") tipoCredito = "biess_vip";
  else if (product.id === "BIESS_MEDIA") tipoCredito = "default";
  else if (product.id === "BIESS_ALTA") tipoCredito = "default";
  else if (product.id === "BIESS_LUJO") tipoCredito = "default";
  else if (product.segment === "VIS") tipoCredito = "vis";
  else if (product.segment === "VIP") tipoCredito = "vip";
  else if (product.segment === "BIESS") tipoCredito = "default";

  const ultimas13Continuas = n(ctx.iessAportesConsecutivos) >= 13;

  const scoreHL = scoreHabitaLibre({
    dtiConHipoteca:
      ingresoTotal > 0
        ? (n(ctx.otrasDeudasMensuales) + n(cuota)) / ingresoTotal
        : 0,
    ltv: ltvReal,
    aniosEstabilidad: n(ctx.aniosEstabilidad),
    mesesActividad: n(ctx.mesesActividad),
    edad: n(ctx.edad),
    tipoIngreso: ctx.tipoIngreso,
    tipoContrato: ctx.tipoContrato,
    sustentoIndependiente: ctx.sustentoIndependiente,
    declaracionBuro: ctx.declaracionBuro,
    tipoCredito,
    esExtranjero: !!ctx.esExtranjero,
    aportesIESS: n(ctx.iessAportesTotales),
    ultimas13Continuas,
  });

  let scoreBase = viable ? 100 : 55;
  if (!dentroCapacidad) scoreBase -= 20;
  if (!dentroLtv) scoreBase -= 20;
  if (!dentroPrecio) scoreBase -= 15;

  if (ctx.tipoIngreso === "Dependiente") {
    if (ctx.tipoContrato === "indefinido") scoreBase += 3;
    if (ctx.tipoContrato === "temporal") scoreBase -= 3;
    if (ctx.tipoContrato === "servicios") scoreBase -= 6;
  }

  if (ctx.tipoIngreso === "Independiente" || ctx.tipoIngreso === "Mixto") {
    if (ctx.sustentoIndependiente === "facturacion_ruc") scoreBase += 4;
    if (ctx.sustentoIndependiente === "movimientos_bancarizados") scoreBase += 2;
    if (ctx.sustentoIndependiente === "declaracion_sri") scoreBase += 1;
    if (ctx.sustentoIndependiente === "mixto") scoreBase += 3;
    if (ctx.sustentoIndependiente === "informal") scoreBase -= 12;
  }

  let score = Math.round((scoreBase + n(scoreHL?.score, scoreBase)) / 2);
  score = clamp(score, 0, 100);

  if (!viable && score >= 80) {
    score = 79;
  }

  let probabilidad = "Baja";
  if (score >= 80) probabilidad = "Alta";
  else if (score >= 60) probabilidad = "Media";
  else if (score < 40) probabilidad = "Muy baja";

  return {
    id: product.id,
    name: product.name,
    provider: product.channel || null,
    segment: product.segment,
    category: product.category,
    type: "mortgage",
    viable,
    annualRate,
    termYears: effectiveYears,
    termMonths,
    requestedLoan,
    montoPrestamo,
    cuota,
    cuotaMax,
    subsidyAmount: n(subsidyAmount),
    ltvReal,
    ltvMax,
    dtiMax,

    precioMaxProgramaHipoteca,
    precioMaxProgramaSubsidio,
    precioMaxPrograma,
    precioMaxPorCuota,
    precioMaxPorEntrada,
    precioMaxPerfil,

    factorLimitante,
    precioMaxVivienda,

    totalDownPaymentNeeded: Math.max(
      0,
      n(ctx.valorVivienda) - n(subsidyAmount) - n(montoPrestamo)
    ),
    flags: {
      ...baseEligibility.flags,
      dentroPrecioPrograma,
      dentroPrecioPerfil,
      dentroPrecio,
      dentroLtv,
      dentroCapacidad,
    },
    reasons: [
      ...Object.entries({
        ...baseEligibility.flags,
        dentroPrecioPrograma,
        dentroPrecioPerfil,
        dentroPrecio,
        dentroLtv,
        dentroCapacidad,
      })
        .filter(([, v]) => !v)
        .map(([k]) => `Falla en ${k}`),
    ],
    score,
    probabilidad,
    scoreHL,
    product,
  };
}

/* ===========================================================
   Evalúa elegibilidad estructural por perfil
   Ignora la meta puntual de vivienda del usuario.
=========================================================== */
function evaluateMortgageProfileFit(
  product,
  ctx,
  subsidyAmount = 0,
  subsidyProduct = null
) {
  const ingresoTotal = n(ctx.ingresoNetoMensual) + n(ctx.ingresoPareja);
  const ingresoDisponible = Math.max(
    0,
    ingresoTotal - n(ctx.otrasDeudasMensuales)
  );

  const termCfg = product.term || {};
  const risk = product.risk || {};
  const caps = product.caps || {};
  const rules = product.rules || {};

  const minYears = n(termCfg.minYears, 5);
  const maxYears = n(termCfg.maxYears, 25);
  const defaultYears = n(termCfg.defaultYears, maxYears);

  const userYears =
    ctx.plazoAnios != null
      ? clamp(n(ctx.plazoAnios, defaultYears), minYears, maxYears)
      : defaultYears;

  const maxAgeAtMaturity = n(termCfg.maxAgeAtMaturity, 75);
  const maxYearsByAge = Math.max(0, maxAgeAtMaturity - n(ctx.edad, 30));
  const effectiveYears = Math.min(userYears, maxYearsByAge);

  const maxAgeAtApplication = n(rules.maxAgeAtApplication, Infinity);
  const maxAgePlusTerm = n(rules.maxAgePlusTerm, Infinity);

  const ageAtApplicationOk = n(ctx.edad) <= maxAgeAtApplication;
  const agePlusTermOk = n(ctx.edad) + effectiveYears <= maxAgePlusTerm;
  const ageOk = effectiveYears > 0 && ageAtApplicationOk && agePlusTermOk;

  const baseEligibility = checkCommonEligibility(
    product,
    ctx,
    {
      ageOk,
      ageAtApplicationOk,
      agePlusTermOk,
    },
    { ignoreProperty: true }
  );

  if (!baseEligibility.ok) {
    return {
      id: product.id,
      name: product.name,
      provider: product.channel || null,
      segment: product.segment,
      type: "mortgage_profile_fit",
      structurallyEligible: false,
      couldWorkIfRangeAdjusted: false,
      annualRate: null,
      cuota: 0,
      montoPrestamo: 0,
      precioMaxVivienda: 0,
      precioMaxPorCuota: 0,
      precioMaxPorEntrada: 0,
      precioMaxPrograma: 0,
      factorLimitante: null,
      flags: baseEligibility.flags,
      reasons: Object.entries(baseEligibility.flags)
        .filter(([, v]) => v === false)
        .map(([k]) => `Falla en ${k}`),
      score: 0,
      probabilidad: null,
      product,
    };
  }

  const dtiMax = n(risk.dtiMax, 0.4);
  const ltvMax = n(risk.ltvMax, 0.85);

  const cuotaMax = Math.max(0, ingresoDisponible * dtiMax);

  const propertyCap =
    caps.propertyMax == null ? Infinity : n(caps.propertyMax, Infinity);

  const propertyForRate =
    propertyCap === Infinity
      ? Math.max(n(ctx.valorVivienda, 0), 100000)
      : propertyCap;

  const maxLoanProgram =
    caps.loanCap == null
      ? propertyForRate * ltvMax
      : n(caps.loanCap, propertyForRate * ltvMax);

  const annualRate = resolveAnnualRate(product, {
    loanAmount: maxLoanProgram,
    termYears: effectiveYears,
    propertyValue: propertyForRate,
  });

  if (!annualRate) {
    return {
      id: product.id,
      name: product.name,
      provider: product.channel || null,
      segment: product.segment,
      type: "mortgage_profile_fit",
      structurallyEligible: false,
      couldWorkIfRangeAdjusted: false,
      annualRate: null,
      cuota: 0,
      montoPrestamo: 0,
      precioMaxVivienda: 0,
      precioMaxPorCuota: 0,
      precioMaxPorEntrada: 0,
      precioMaxPrograma: 0,
      factorLimitante: null,
      flags: {
        ...baseEligibility.flags,
        rateOk: false,
      },
      reasons: ["No hay tasa resolvible para este producto"],
      score: 0,
      probabilidad: null,
      product,
    };
  }

  const monthlyRate = annualRate / 12;
  const termMonths = effectiveYears * 12;

  const montoMaxPorCuota = pvFromPayment(monthlyRate, termMonths, cuotaMax);

  const priceCapByLoanProgram =
    caps.loanCap == null
      ? Infinity
      : ltvMax > 0
      ? n(caps.loanCap) / ltvMax
      : Infinity;

  const precioMaxProgramaHipoteca = Math.min(propertyCap, priceCapByLoanProgram);

  const precioMaxProgramaSubsidio =
    subsidyProduct?.caps?.propertyMax == null
      ? Infinity
      : n(subsidyProduct.caps.propertyMax, Infinity);

  const precioMaxPrograma = Math.min(
    precioMaxProgramaHipoteca,
    precioMaxProgramaSubsidio
  );

  const precioMaxPorCuota =
    n(ctx.entradaDisponible) + n(subsidyAmount) + montoMaxPorCuota;

  const precioMaxPorEntrada =
    1 - ltvMax > 0
      ? (n(ctx.entradaDisponible) + n(subsidyAmount)) / (1 - ltvMax)
      : Infinity;

  const precioMaxPerfil = Math.min(
    precioMaxPorCuota,
    precioMaxPorEntrada,
    precioMaxPrograma
  );

  const EPS = 1e-6;
  let factorLimitante = "programa";

  if (Math.abs(precioMaxPerfil - precioMaxPorEntrada) < EPS) {
    factorLimitante = "entrada";
  } else if (Math.abs(precioMaxPerfil - precioMaxPorCuota) < EPS) {
    factorLimitante = "cuota";
  } else if (Math.abs(precioMaxPerfil - precioMaxPrograma) < EPS) {
    factorLimitante = "programa";
  }

  const montoPrestamoPerfil = Math.max(
    0,
    Math.min(
      montoMaxPorCuota,
      caps.loanCap == null ? precioMaxPerfil * ltvMax : n(caps.loanCap)
    )
  );

  const cuotaPerfil = pmt(monthlyRate, termMonths, montoPrestamoPerfil);

  let tipoCredito = "default";
  if (product.id === "BIESS_CREDICASA") tipoCredito = "biess_vip";
  else if (product.id === "BIESS_VIS_VIP") tipoCredito = "biess_vip";
  else if (product.id === "BIESS_MEDIA") tipoCredito = "default";
  else if (product.id === "BIESS_ALTA") tipoCredito = "default";
  else if (product.id === "BIESS_LUJO") tipoCredito = "default";
  else if (product.segment === "VIS") tipoCredito = "vis";
  else if (product.segment === "VIP") tipoCredito = "vip";
  else if (product.segment === "BIESS") tipoCredito = "default";

  const ultimas13Continuas = n(ctx.iessAportesConsecutivos) >= 13;

  const scoreHL = scoreHabitaLibre({
    dtiConHipoteca:
      ingresoTotal > 0
        ? (n(ctx.otrasDeudasMensuales) + n(cuotaPerfil)) / ingresoTotal
        : 0,
    ltv:
      precioMaxPerfil > 0 ? montoPrestamoPerfil / precioMaxPerfil : 0,
    aniosEstabilidad: n(ctx.aniosEstabilidad),
    mesesActividad: n(ctx.mesesActividad),
    edad: n(ctx.edad),
    tipoIngreso: ctx.tipoIngreso,
    tipoContrato: ctx.tipoContrato,
    sustentoIndependiente: ctx.sustentoIndependiente,
    declaracionBuro: ctx.declaracionBuro,
    tipoCredito,
    esExtranjero: !!ctx.esExtranjero,
    aportesIESS: n(ctx.iessAportesTotales),
    ultimas13Continuas,
  });

  let scoreBase = 85;

  if (factorLimitante === "entrada") scoreBase -= 8;
  if (factorLimitante === "cuota") scoreBase -= 6;
  if (factorLimitante === "programa") scoreBase -= 4;

  if (ctx.tipoIngreso === "Dependiente") {
    if (ctx.tipoContrato === "indefinido") scoreBase += 3;
    if (ctx.tipoContrato === "temporal") scoreBase -= 3;
    if (ctx.tipoContrato === "servicios") scoreBase -= 6;
  }

  if (ctx.tipoIngreso === "Independiente" || ctx.tipoIngreso === "Mixto") {
    if (ctx.sustentoIndependiente === "facturacion_ruc") scoreBase += 4;
    if (ctx.sustentoIndependiente === "movimientos_bancarizados") scoreBase += 2;
    if (ctx.sustentoIndependiente === "declaracion_sri") scoreBase += 1;
    if (ctx.sustentoIndependiente === "mixto") scoreBase += 3;
    if (ctx.sustentoIndependiente === "informal") scoreBase -= 12;
  }

  let score = Math.round((scoreBase + n(scoreHL?.score, scoreBase)) / 2);
  score = clamp(score, 0, 100);

  let probabilidad = "Baja";
  if (score >= 80) probabilidad = "Alta";
  else if (score >= 60) probabilidad = "Media";
  else if (score < 40) probabilidad = "Muy baja";

  return {
    id: product.id,
    name: product.name,
    provider: product.channel || null,
    segment: product.segment,
    category: product.category,
    type: "mortgage_profile_fit",
    structurallyEligible: true,
    couldWorkIfRangeAdjusted: precioMaxPerfil > 0,
    annualRate,
    termYears: effectiveYears,
    termMonths,
    cuota: cuotaPerfil,
    montoPrestamo: montoPrestamoPerfil,
    cuotaMax,
    subsidyAmount: n(subsidyAmount),
    ltvMax,
    dtiMax,

    precioMaxProgramaHipoteca,
    precioMaxProgramaSubsidio,
    precioMaxPrograma,
    precioMaxPorCuota,
    precioMaxPorEntrada,
    precioMaxPerfil,
    factorLimitante,
    precioMaxVivienda: precioMaxPerfil,

    flags: {
      ...baseEligibility.flags,
      rateOk: true,
    },
    reasons: [],
    score,
    probabilidad,
    scoreHL,
    product,
  };
}

/* ===========================================================
   Construcción de escenarios contra meta actual
=========================================================== */
function buildScenarios(ctx) {
  const mortgageProducts = mortgageCatalog.filter(
    (p) => p.active !== false && p.category !== "DIRECT_SUBSIDY"
  );

  const subsidyProducts = mortgageCatalog.filter(
    (p) => p.active !== false && p.category === "DIRECT_SUBSIDY"
  );

  const subsidyEvaluations = subsidyProducts.map((subsidy) =>
    evaluateSubsidyProgram(subsidy, ctx)
  );

  const scenarios = [];

  for (const mortgage of mortgageProducts) {
    const soloMortgage = evaluateMortgageProduct(mortgage, ctx, 0);

    scenarios.push({
      scenarioId: `${mortgage.id}_SOLO`,
      mortgageId: mortgage.id,
      subsidyId: null,
      mortgage: soloMortgage,
      subsidy: null,
      viable: soloMortgage.viable,
      score: soloMortgage.score,
      probabilidad: soloMortgage.probabilidad,
      cuota: soloMortgage.cuota,
      montoPrestamo: soloMortgage.montoPrestamo,

      precioMaxProgramaHipoteca: soloMortgage.precioMaxProgramaHipoteca,
      precioMaxProgramaSubsidio: soloMortgage.precioMaxProgramaSubsidio,
      precioMaxPrograma: soloMortgage.precioMaxPrograma,
      precioMaxPorCuota: soloMortgage.precioMaxPorCuota,
      precioMaxPorEntrada: soloMortgage.precioMaxPorEntrada,
      precioMaxPerfil: soloMortgage.precioMaxPerfil,
      factorLimitante: soloMortgage.factorLimitante,
      precioMaxVivienda: soloMortgage.precioMaxVivienda,

      totalDownPaymentNeeded: soloMortgage.totalDownPaymentNeeded,
      annualRate: soloMortgage.annualRate,
      subsidyAmount: 0,
      label: mortgage.name,
    });
  }

  for (const subsidy of subsidyEvaluations) {
    if (!subsidy.viable) continue;

    for (const mortgage of mortgageProducts) {
      if (!isSubsidyCompatibleWithMortgage(subsidy.product, mortgage)) continue;

      const combo = evaluateMortgageProduct(
        mortgage,
        ctx,
        subsidy.subsidyAmount,
        subsidy.product
      );

      scenarios.push({
        scenarioId: `${mortgage.id}_${subsidy.id}`,
        mortgageId: mortgage.id,
        subsidyId: subsidy.id,
        mortgage: combo,
        subsidy,
        viable: combo.viable,
        score: clamp(combo.score + 3, 0, 100),
        probabilidad: combo.probabilidad,
        cuota: combo.cuota,
        montoPrestamo: combo.montoPrestamo,

        precioMaxProgramaHipoteca: combo.precioMaxProgramaHipoteca,
        precioMaxProgramaSubsidio: combo.precioMaxProgramaSubsidio,
        precioMaxPrograma: combo.precioMaxPrograma,
        precioMaxPorCuota: combo.precioMaxPorCuota,
        precioMaxPorEntrada: combo.precioMaxPorEntrada,
        precioMaxPerfil: combo.precioMaxPerfil,
        factorLimitante: combo.factorLimitante,
        precioMaxVivienda: combo.precioMaxVivienda,

        totalDownPaymentNeeded: combo.totalDownPaymentNeeded,
        annualRate: combo.annualRate,
        subsidyAmount: subsidy.subsidyAmount,
        label: `${mortgage.name} + ${subsidy.name}`,
      });
    }
  }

  return {
    subsidyEvaluations,
    scenarios: scenarios.map((s) => ({
      ...s,
      priority: getScenarioPriority(s),
    })),
  };
}

/* ===========================================================
   Construcción de escenarios por perfil
=========================================================== */
function buildProfileFitScenarios(ctx) {
  const mortgageProducts = mortgageCatalog.filter(
    (p) => p.active !== false && p.category !== "DIRECT_SUBSIDY"
  );

  const subsidyProducts = mortgageCatalog.filter(
    (p) => p.active !== false && p.category === "DIRECT_SUBSIDY"
  );

  const subsidyEvaluations = subsidyProducts.map((subsidy) =>
    evaluateSubsidyProgram(subsidy, ctx)
  );

  const scenarios = [];

  for (const mortgage of mortgageProducts) {
    const fit = evaluateMortgageProfileFit(mortgage, ctx, 0);

    scenarios.push({
      scenarioId: `${mortgage.id}_PROFILE`,
      mortgageId: mortgage.id,
      subsidyId: null,
      mortgage: fit,
      subsidy: null,
      viable: !!fit.couldWorkIfRangeAdjusted,
      score: fit.score,
      probabilidad: fit.probabilidad,
      cuota: fit.cuota,
      montoPrestamo: fit.montoPrestamo,

      precioMaxProgramaHipoteca: fit.precioMaxProgramaHipoteca,
      precioMaxProgramaSubsidio: fit.precioMaxProgramaSubsidio,
      precioMaxPrograma: fit.precioMaxPrograma,
      precioMaxPorCuota: fit.precioMaxPorCuota,
      precioMaxPorEntrada: fit.precioMaxPorEntrada,
      precioMaxPerfil: fit.precioMaxPerfil,
      factorLimitante: fit.factorLimitante,
      precioMaxVivienda: fit.precioMaxVivienda,

      annualRate: fit.annualRate,
      subsidyAmount: 0,
      label: mortgage.name,
    });
  }

  for (const subsidy of subsidyEvaluations) {
    if (!subsidy.viable) continue;

    for (const mortgage of mortgageProducts) {
      if (!isSubsidyCompatibleWithMortgage(subsidy.product, mortgage)) continue;

      const fit = evaluateMortgageProfileFit(
        mortgage,
        ctx,
        subsidy.subsidyAmount,
        subsidy.product
      );

      scenarios.push({
        scenarioId: `${mortgage.id}_${subsidy.id}_PROFILE`,
        mortgageId: mortgage.id,
        subsidyId: subsidy.id,
        mortgage: fit,
        subsidy,
        viable: !!fit.couldWorkIfRangeAdjusted,
        score: clamp(fit.score + 3, 0, 100),
        probabilidad: fit.probabilidad,
        cuota: fit.cuota,
        montoPrestamo: fit.montoPrestamo,

        precioMaxProgramaHipoteca: fit.precioMaxProgramaHipoteca,
        precioMaxProgramaSubsidio: fit.precioMaxProgramaSubsidio,
        precioMaxPrograma: fit.precioMaxPrograma,
        precioMaxPorCuota: fit.precioMaxPorCuota,
        precioMaxPorEntrada: fit.precioMaxPorEntrada,
        precioMaxPerfil: fit.precioMaxPerfil,
        factorLimitante: fit.factorLimitante,
        precioMaxVivienda: fit.precioMaxVivienda,

        annualRate: fit.annualRate,
        subsidyAmount: subsidy.subsidyAmount,
        label: `${mortgage.name} + ${subsidy.name}`,
      });
    }
  }

  return scenarios.map((s) => ({
    ...s,
    priority: getScenarioPriority(s),
  }));
}

/* ===========================================================
   Construcción de escenarios futuros con entrada planificada
=========================================================== */
function buildFutureProfileFitScenarios(ctx) {
  const futureCtx = cloneCtxWithPlannedEntry(ctx);
  const scenarios = buildProfileFitScenarios(futureCtx);

  return scenarios.map((s) => ({
    ...s,
    basedOnPlannedEntry: true,
    plannedEntryMonths: futureCtx?._plannedEntryMeta?.meses || 0,
    plannedEntryFutureAmount: futureCtx?._plannedEntryMeta?.entradaFutura || 0,
    plannedEntryMonthlyAmount: futureCtx?._plannedEntryMeta?.ahorroMensual || 0,
  }));
}

/* ===========================================================
   Ranking
=========================================================== */
function rankScenarios(scenarios = []) {
  return [...scenarios].sort((a, b) => {
    if (a.viable !== b.viable) return a.viable ? -1 : 1;

    if (a.viable && b.viable) {
      if (n(a.priority, 99) !== n(b.priority, 99)) {
        return n(a.priority, 99) - n(b.priority, 99);
      }

      if (n(a.cuota) !== n(b.cuota)) {
        return n(a.cuota) - n(b.cuota);
      }

      if (n(a.annualRate) !== n(b.annualRate)) {
        return n(a.annualRate) - n(b.annualRate);
      }

      if (n(a.score) !== n(b.score)) {
        return n(b.score) - n(a.score);
      }

      return 0;
    }

    if (n(a.priority, 99) !== n(b.priority, 99)) {
      return n(a.priority, 99) - n(b.priority, 99);
    }

    if (n(a.score) !== n(b.score)) return n(b.score) - n(a.score);

    if (n(a.cuota) !== n(b.cuota)) return n(a.cuota) - n(b.cuota);

    return 0;
  });
}

/* ===========================================================
   Profile eligibility para frontend/Home
=========================================================== */
function buildProfileEligibilityMap(profileRankedScenarios = [], ctx = {}) {
  const map = {};

  for (const s of profileRankedScenarios) {
    const mortgage = s?.mortgage;
    if (!mortgage?.id) continue;

    const id = mortgage.id;

    if (!map[id] || n(s.score) > n(map[id].score)) {
      map[id] = {
        productId: id,
        eligibleByProfile: !!mortgage.structurallyEligible,
        couldWorkIfRangeAdjusted: !!mortgage.couldWorkIfRangeAdjusted,
        score: n(s.score),
        probabilidad: s.probabilidad || null,
        priceMax: n(s.precioMaxVivienda),
        priceMaxProfile: n(s.precioMaxPerfil),
        priceMaxProgram: n(s.precioMaxPrograma),
        loanMax: n(s.montoPrestamo),
        rateAnnual: mortgage.annualRate == null ? null : n(mortgage.annualRate),
        termMonths: mortgage.termMonths == null ? null : n(mortgage.termMonths),
        requiresFirstHome: !!mortgage?.product?.rules?.firstHome,
        requiresNewConstruction: !!mortgage?.product?.rules?.newConstruction,
        requiresIESS: !!mortgage?.product?.rules?.requireIESS,
        requiresContributions: !!mortgage?.product?.rules?.requireContributions,
        channel: mortgage?.provider || mortgage?.product?.channel || null,
        segment: mortgage?.segment || mortgage?.product?.segment || null,
        displayName: mortgage?.name || mortgage?.product?.name || id,
        factorLimitante: s?.factorLimitante || null,
        reasons: mortgage?.reasons || [],
      };
    }
  }

  return map;
}

/* ===========================================================
   Eligibility products para frontend
=========================================================== */
function buildEligibilityProductsFromScenarios(rankedScenarios = []) {
  const map = {};

  for (const s of rankedScenarios) {
    const mortgage = s?.mortgage;
    if (!mortgage?.id) continue;

    const id = mortgage.id;

    if (!map[id] || n(s.score) > n(map[id].score)) {
      map[id] = {
        productId: id,
        viable: !!s.viable,
        score: n(s.score),
        probabilidad: s.probabilidad || null,
        priceMax: n(s.precioMaxVivienda),
        priceMaxProfile: n(s.precioMaxPerfil),
        priceMaxProgram: n(s.precioMaxPrograma),
        loanMax: n(s.montoPrestamo),
        rateAnnual: mortgage.annualRate == null ? null : n(mortgage.annualRate),
        termMonths: mortgage.termMonths == null ? null : n(mortgage.termMonths),
        requiresFirstHome: !!mortgage?.product?.rules?.firstHome,
        requiresNewConstruction: !!mortgage?.product?.rules?.newConstruction,
        requiresIESS: !!mortgage?.product?.rules?.requireIESS,
        requiresContributions: !!mortgage?.product?.rules?.requireContributions,
        requiresMiduviQualifiedProject:
          !!mortgage?.product?.rules?.requiresMiduviQualifiedProject,
        channel: mortgage?.provider || mortgage?.product?.channel || null,
        segment: mortgage?.segment || mortgage?.product?.segment || null,
        displayName: mortgage?.name || mortgage?.product?.name || id,
        factorLimitante: s?.factorLimitante || null,
      };
    }
  }

  return map;
}

/* ===========================================================
   Política de recomendación de propiedades
=========================================================== */
function buildPropertyRecommendationPolicy(bestOption, rankedScenarios = []) {
  if (!bestOption?.mortgage) {
    return {
      recommendedProductIds: [],
      strictProductIds: [],
      flexibleProductIds: [],
      mode: "none",
    };
  }

  const bestMortgageId = bestOption.mortgage.id;
  const bestSegment = bestOption.mortgage.segment;

  const strictProductIds = [bestMortgageId];

  const flexibleProductIds = rankedScenarios
    .filter((s) => !s.subsidyId)
    .filter((s) => s.viable)
    .filter((s) => s.mortgage?.id)
    .filter((s) => n(s.score) >= Math.max(n(bestOption.score) - 5, 0))
    .filter((s) => {
      if (bestSegment === "VIS" && s.mortgage?.segment === "VIP") return false;

      if (
        bestMortgageId === "BIESS_CREDICASA" &&
        s.mortgage?.id !== "BIESS_CREDICASA"
      ) {
        return false;
      }

      return true;
    })
    .map((s) => s.mortgage.id);

  return {
    recommendedProductIds: Array.from(
      new Set([bestMortgageId, ...flexibleProductIds])
    ),
    strictProductIds,
    flexibleProductIds: Array.from(new Set(flexibleProductIds)),
    mode: "strict_by_default",
  };
}

/* ===========================================================
   Explicación humana
=========================================================== */
function humanReasonFromFlag(flagKey, scenario) {
  const mortgage = scenario?.mortgage || {};
  const product = mortgage?.product || {};

  const ingresoMax = product?.caps?.incomeMax;
  const propertyMin = product?.caps?.propertyMin;
  const propertyMax = product?.caps?.propertyMax;
  const ltvMax = mortgage?.ltvMax ?? product?.risk?.ltvMax;
  const dtiMax = mortgage?.dtiMax ?? product?.risk?.dtiMax;

  const map = {
    incomeOk: ingresoMax
      ? `tu ingreso supera el máximo permitido para este programa (aprox. $${money(
          ingresoMax
        )} mensuales)`
      : "tu ingreso no encaja dentro del rango permitido para este programa",

    propertyOk:
      propertyMin != null && propertyMax != null
        ? `el valor de la vivienda no está dentro del rango permitido para este programa (aprox. entre $${money(
            propertyMin
          )} y $${money(propertyMax)})`
        : propertyMax != null
        ? `el valor de la vivienda supera el límite permitido para este programa (aprox. $${money(
            propertyMax
          )})`
        : propertyMin != null
        ? `el valor de la vivienda está por debajo del mínimo permitido para este programa (aprox. $${money(
            propertyMin
          )})`
        : "el valor de la vivienda no entra dentro de los parámetros de este programa",

    iessOk: "este programa requiere afiliación activa al IESS",
    contribTotalOk: "este programa requiere más aportaciones acumuladas al IESS",
    contribConsecOk: "este programa requiere más aportaciones consecutivas al IESS",
    pensionOk: "este programa requiere pensión jubilar vigente",
    applicantTypeOk: "tu tipo de solicitante no encaja con este producto BIESS",
    firstHomeOk: "este programa aplica únicamente para compra de primera vivienda",
    newConstructionOk: "este programa aplica únicamente para viviendas nuevas o por estrenar",
    foreignOk: "este programa no aplica para tu condición de nacionalidad",
    buroOk: "tu historial crediticio reportado no encaja con los requisitos del programa",
    estabilidadOk: "este programa requiere mayor estabilidad laboral o de ingresos",
    estabilidadDependienteOk:
      "para este programa te conviene una mayor antigüedad en tu empleo actual",
    estabilidadIndependienteOk:
      "para este programa te conviene más tiempo en tu actividad económica",
    contratoOk:
      "tu tipo de contrato laboral no es el más favorable para este programa",
    sustentoIngresosOk:
      "la forma en que sustentas tus ingresos independientes no es suficiente para este programa",
    ageOk: "el plazo del crédito no encaja bien con la edad permitida",
    ageAtApplicationOk:
      "la edad del solicitante supera el máximo permitido para este producto",
    agePlusTermOk:
      "la suma de edad más plazo supera el máximo operativo del producto",
    dentroPrecioPrograma:
      "el valor de la vivienda supera el tope permitido por este programa",
    dentroPrecioPerfil:
      "con tu entrada actual y capacidad financiera, el valor de la vivienda todavía está por encima de lo que este perfil puede comprar",
    dentroPrecio:
      "el valor de la vivienda está fuera del rango permitido para este programa",
    dentroLtv: ltvMax
      ? `requiere una entrada mayor para cumplir el porcentaje máximo de financiamiento (${pct(
          ltvMax
        )})`
      : "requiere una entrada mayor para cumplir el porcentaje máximo de financiamiento",
    dentroCapacidad: dtiMax
      ? `la cuota estimada supera la capacidad de pago aceptada para este programa (aprox. ${pct(
          dtiMax
        )} del ingreso)`
      : "la cuota estimada supera la capacidad de pago aceptada para este programa",
    rateOk: "no se pudo calcular una tasa válida para este monto y plazo",
  };

  return map[flagKey] || "no cumple una condición requerida por este programa";
}

function humanWhyNotScenario(scenario, bestOption) {
  if (!scenario?.mortgage) {
    return `${scenario?.label || "Esta opción"} no aplica para este perfil hoy.`;
  }

  const mortgage = scenario.mortgage;

  if (scenario.viable && bestOption?.viable) {
    const cuotaActual = n(scenario?.cuota);
    const cuotaBest = n(bestOption?.cuota);

    const tasaActual = n(scenario?.annualRate);
    const tasaBest = n(bestOption?.annualRate);

    if (cuotaActual > 0 && cuotaBest > 0 && cuotaActual > cuotaBest + 1) {
      return `${scenario.label} sí aplica, pero no quedó como primera recomendación porque su cuota estimada sería mayor (aprox. $${money(
        cuotaActual
      )} vs. $${money(cuotaBest)}).`;
    }

    if (tasaActual > 0 && tasaBest > 0 && tasaActual > tasaBest + 0.0001) {
      return `${scenario.label} sí aplica, pero no quedó como primera recomendación porque tiene una tasa más alta (${(
        tasaActual * 100
      ).toFixed(2)}% vs. ${(tasaBest * 100).toFixed(2)}%).`;
    }

    if (scenario.score < bestOption.score) {
      return `${scenario.label} sí aplica, pero no quedó como primera recomendación porque su probabilidad estimada es ligeramente menor para tu perfil.`;
    }

    return `${scenario.label} sí aplica, pero no quedó como la opción priorizada frente a la recomendación principal.`;
  }

  const failedFlags = Object.entries(mortgage.flags || {})
    .filter(([, v]) => v === false)
    .map(([k]) => k)
    .filter((k) => {
      if (k === "dentroPrecio" && mortgage.flags?.dentroPrecioPerfil === false) {
        return false;
      }
      if (k === "dentroPrecio" && mortgage.flags?.dentroPrecioPrograma === false) {
        return false;
      }
      return true;
    });

  if (!failedFlags.length) {
    return `${scenario.label} no quedó como opción prioritaria para tu perfil hoy.`;
  }

  const topReasons = failedFlags
    .slice(0, 2)
    .map((k) => humanReasonFromFlag(k, scenario));

  return `${scenario.label} no aplica porque ${topReasons.join(" y ")}.`;
}

function buildRecommendationExplanation(bestOption, rankedScenarios = [], ctx = {}) {
  if (!bestOption) {
    const rankedNoViables = rankedScenarios.filter((s) => !s.viable);

    const topReasons = rankedNoViables
      .slice(0, 3)
      .map((s) => humanWhyNotScenario(s, null));

    let nextStep =
      "Te conviene revisar principalmente la entrada inicial, el valor de la vivienda o el nivel de ingresos para volver a intentar.";

    const necesitaMasEntrada = rankedNoViables.some((s) =>
      (s.mortgage?.reasons || []).includes("Falla en dentroLtv")
    );

    if (necesitaMasEntrada) {
      nextStep =
        "Con este perfil, lo más importante sería aumentar tu entrada para cumplir el porcentaje máximo de financiamiento del programa.";
    }

    return {
      title: "Actualmente no calificas para una hipoteca con esta meta",
      summary:
        "Con la información ingresada, ninguna de las opciones disponibles cumple completamente las condiciones del crédito para la vivienda objetivo actual.",
      reasons: [],
      whyNotOthers: topReasons,
      nextStep,
    };
  }

  const mortgage = bestOption.mortgage || {};
  const product = mortgage.product || {};
  const reasons = [];

  if (product.rules?.requireIESS && ctx.afiliadoBool) {
    reasons.push("Cumples con los requisitos de afiliación y aportes al IESS.");
  }

  if (product.rules?.firstHome && !ctx.tieneViviendaBool) {
    reasons.push("El programa aplica para compra de primera vivienda.");
  }

  if (product.rules?.newConstruction && ctx.viviendaNuevaBool) {
    reasons.push("La vivienda nueva es elegible dentro de este programa.");
  }

  if (ctx.tipoIngreso === "Dependiente" && ctx.tipoContrato === "indefinido") {
    reasons.push("Tu contrato indefinido fortalece tu perfil ante entidades financieras.");
  }

  if (
    (ctx.tipoIngreso === "Independiente" || ctx.tipoIngreso === "Mixto") &&
    ctx.sustentoIndependiente === "facturacion_ruc"
  ) {
    reasons.push("Tu sustento con facturación RUC fortalece la evaluación de ingresos.");
  }

  if (mortgage.ltvMax) {
    reasons.push(
      `Este producto permite financiar hasta el ${Math.round(
        mortgage.ltvMax * 100
      )}% del valor de la vivienda.`
    );
  }

  if (mortgage.cuota > 0) {
    reasons.push(
      `Tu cuota estimada sería aproximadamente $${money(mortgage.cuota)} al mes.`
    );
  }

  if (mortgage.annualRate > 0) {
    reasons.push(
      `Tiene una de las tasas más competitivas disponibles (${(
        mortgage.annualRate * 100
      ).toFixed(2)}%).`
    );
  }

  if (bestOption.subsidy?.id === "VIS_II" && n(bestOption.subsidy?.subsidyAmount) > 0) {
    reasons.push(
      `Además podrías aplicar a un subsidio aproximado de $${money(
        bestOption.subsidy.subsidyAmount
      )}.`
    );
  }

  const whyNotOthers = rankedScenarios
    .filter((s) => s.scenarioId !== bestOption.scenarioId)
    .slice(0, 3)
    .map((s) => humanWhyNotScenario(s, bestOption));

  let summary = "Es la opción más conveniente para tu perfil hoy.";

  if (String(bestOption.label || "").toLowerCase().includes("credicasa")) {
    summary =
      "Es la opción más conveniente para tu perfil hoy, especialmente por su tasa preferencial y encaje con tu perfil IESS.";
  } else if (String(bestOption.label || "").toLowerCase().includes("vip")) {
    summary =
      "Es la opción más conveniente para tu perfil hoy dentro de los programas preferenciales de banca privada.";
  } else if (String(bestOption.label || "").toLowerCase().includes("biess")) {
    summary =
      "Es la opción BIESS más conveniente para tu perfil hoy según valor de vivienda, cuota y requisitos vigentes.";
  } else if (bestOption?.mortgage?.segment === "VIS") {
    summary =
      "Es la opción más conveniente para tu perfil hoy dentro de VIS.";
  } else if (bestOption?.mortgage?.segment === "PRIVATE") {
    summary =
      "Es la opción privada más conveniente para tu perfil hoy según entrada, capacidad de pago y condiciones generales.";
  }

  return {
    title: `Te recomendamos ${bestOption.label}`,
    summary,
    reasons,
    whyNotOthers,
    nextStep: "Puedes continuar con el proceso de precalificación con este programa.",
  };
}

/* ===========================================================
   Alternativas habitacionales
=========================================================== */
function buildClosestFitAlternative(rankedMortgages = [], ctx = {}) {
  const targetPrice = n(ctx.valorVivienda, 0);

  const candidates = (rankedMortgages || [])
    .filter((s) => n(s?.precioMaxVivienda) > 0)
    .filter((s) => n(s?.cuota) > 0)
    .map((s) => {
      const alternativePrice = n(s.precioMaxVivienda);

      return {
        type: "closest_fit",
        scenarioId: s.scenarioId,
        mortgageId: s.mortgageId,
        label: s.label,
        provider: s.provider || null,
        segment: s.segment || null,
        viableToday: !!s.targetViable,
        viableFuture: !s.targetViable && !!s.viable,
        preservesUserGoal:
          targetPrice > 0 ? alternativePrice >= targetPrice * 0.9 : false,
        targetPrice,
        alternativePrice,
        monthlyPayment: n(s.cuota),
        annualRate: n(s.annualRate),
        loanAmount: n(s.montoPrestamo),
        monthsToViable: 0,
        factorLimitante: s.factorLimitante || null,
        reasons: s.reasons || [],
        score: n(s.score),
        probabilidad: s.probabilidad || null,
        propertyName: "",
      };
    })
    .sort((a, b) => {
      const aViable = a.viableToday ? 1 : 0;
      const bViable = b.viableToday ? 1 : 0;
      if (aViable !== bViable) return bViable - aViable;

      const aClose = Math.abs(n(a.alternativePrice) - targetPrice);
      const bClose = Math.abs(n(b.alternativePrice) - targetPrice);
      if (aClose !== bClose) return aClose - bClose;

      if (n(a.score) !== n(b.score)) return n(b.score) - n(a.score);

      return n(a.monthlyPayment) - n(b.monthlyPayment);
    });

  return candidates[0] || null;
}

function buildGoalPreservingFutureAlternative(matchedProperties = [], ctx = {}) {
  const targetPrice = n(ctx.valorVivienda, 0);

  if (!targetPrice || !Array.isArray(matchedProperties) || !matchedProperties.length) {
    return null;
  }

  const candidates = matchedProperties
    .filter((p) => {
      const price = n(p?.precio ?? p?.price);
      const futureViable =
        String(p?.estadoCompra || "") === "entrada_viable_hipoteca_futura_viable" ||
        p?.evaluacionHipotecaFutura?.viable === true;

      const cuota = n(p?.evaluacionHipotecaFutura?.cuotaReferencia, 0);
      const months = n(
        p?.evaluacionEntrada?.mesesNecesarios,
        p?.evaluacionEntrada?.mesesConstruccionRestantes
      );

      return futureViable && price > 0 && cuota > 0 && months > 0;
    })
    .map((p) => {
      const price = n(p?.precio ?? p?.price);
      const months = n(
        p?.evaluacionEntrada?.mesesNecesarios,
        p?.evaluacionEntrada?.mesesConstruccionRestantes
      );

      return {
        type: "goal_preserving",
        scenarioId: null,
        mortgageId:
          p?.evaluacionHipotecaFutura?.mortgageSelected?.mortgageId ||
          p?.evaluacionHipotecaFutura?.mortgageSelected?.id ||
          null,
        label:
          p?.evaluacionHipotecaFutura?.productoSugerido ||
          p?.evaluacionHipotecaFutura?.mortgageSelected?.label ||
          "Ruta futura viable",
        provider: p?.evaluacionHipotecaFutura?.mortgageSelected?.provider || null,
        segment:
          p?.evaluacionHipotecaFutura?.mortgageSelected?.segment || null,
        viableToday: false,
        viableFuture: true,
        preservesUserGoal: price >= targetPrice * 0.9,
        targetPrice,
        alternativePrice: price,
        monthlyPayment: n(p?.evaluacionHipotecaFutura?.cuotaReferencia, 0),
        annualRate:
          n(p?.evaluacionHipotecaFutura?.mortgageSelected?.annualRate, 0) || null,
        loanAmount: n(
          p?.evaluacionHipotecaFutura?.montoHipotecaProyectado,
          0
        ),
        monthsToViable: months,
        factorLimitante: "entrada",
        reasons: [],
        score: n(p?.evaluacionHipotecaFutura?.score, 0),
        probabilidad:
          p?.evaluacionHipotecaFutura?.probabilidad || "Media",
        propertyName: p?.nombre || p?.title || p?.proyecto || "",
      };
    })
    .sort((a, b) => {
      const aGoal = a.preservesUserGoal ? 1 : 0;
      const bGoal = b.preservesUserGoal ? 1 : 0;
      if (aGoal !== bGoal) return bGoal - aGoal;

      const aClose = Math.abs(n(a.alternativePrice) - targetPrice);
      const bClose = Math.abs(n(b.alternativePrice) - targetPrice);
      if (aClose !== bClose) return aClose - bClose;

      if (n(a.monthsToViable) !== n(b.monthsToViable)) {
        return n(a.monthsToViable) - n(b.monthsToViable);
      }

      return n(b.score) - n(a.score);
    });

  return candidates[0] || null;
}

function buildInventoryBackedAlternative(matchedProperties = [], ctx = {}) {
  const targetPrice = n(ctx.valorVivienda, 0);

  const candidates = (matchedProperties || [])
    .filter((p) => n(p?.precio ?? p?.price) > 0)
    .map((p) => {
      const price = n(p?.precio ?? p?.price);

      const viableToday =
        p?.evaluacionHipotecaHoy?.viable === true &&
        n(p?.evaluacionHipotecaHoy?.cuotaReferencia, 0) > 0;

      const viableFuture =
        p?.evaluacionHipotecaFutura?.viable === true &&
        n(p?.evaluacionHipotecaFutura?.cuotaReferencia, 0) > 0 &&
        n(
          p?.evaluacionEntrada?.mesesNecesarios,
          p?.evaluacionEntrada?.mesesConstruccionRestantes
        ) > 0;

      const monthlyPayment = viableToday
        ? n(p?.evaluacionHipotecaHoy?.cuotaReferencia, 0)
        : viableFuture
        ? n(p?.evaluacionHipotecaFutura?.cuotaReferencia, 0)
        : 0;

      const monthsToViable = viableToday
        ? 0
        : viableFuture
        ? n(
            p?.evaluacionEntrada?.mesesNecesarios,
            p?.evaluacionEntrada?.mesesConstruccionRestantes
          )
        : 999;

      return {
        type: "inventory_property",
        scenarioId: null,
        mortgageId:
          p?.evaluacionHipotecaHoy?.mortgageSelected?.mortgageId ||
          p?.evaluacionHipotecaHoy?.mortgageSelected?.id ||
          p?.evaluacionHipotecaFutura?.mortgageSelected?.mortgageId ||
          p?.evaluacionHipotecaFutura?.mortgageSelected?.id ||
          null,
        label:
          p?.evaluacionHipotecaHoy?.productoSugerido ||
          p?.evaluacionHipotecaFutura?.productoSugerido ||
          "Propiedad sugerida",
        provider:
          p?.evaluacionHipotecaHoy?.mortgageSelected?.provider ||
          p?.evaluacionHipotecaFutura?.mortgageSelected?.provider ||
          null,
        segment:
          p?.evaluacionHipotecaHoy?.mortgageSelected?.segment ||
          p?.evaluacionHipotecaFutura?.mortgageSelected?.segment ||
          null,
        viableToday,
        viableFuture,
        preservesUserGoal: targetPrice > 0 ? price >= targetPrice * 0.9 : false,
        targetPrice,
        alternativePrice: price,
        monthlyPayment,
        annualRate:
          n(p?.evaluacionHipotecaHoy?.mortgageSelected?.annualRate) ||
          n(p?.evaluacionHipotecaFutura?.mortgageSelected?.annualRate) ||
          null,
        loanAmount: null,
        monthsToViable,
        factorLimitante: null,
        reasons: [],
        score: viableToday
          ? n(p?.evaluacionHipotecaHoy?.score, 0)
          : viableFuture
          ? n(p?.evaluacionHipotecaFutura?.score, 0)
          : 0,
        probabilidad:
          p?.evaluacionHipotecaHoy?.probabilidad ||
          p?.evaluacionHipotecaFutura?.probabilidad ||
          null,
        propertyName: p?.nombre || p?.title || p?.proyecto || "",
      };
    })
    .filter((a) => a.viableToday || a.viableFuture)
    .sort((a, b) => {
      const aToday = a.viableToday ? 1 : 0;
      const bToday = b.viableToday ? 1 : 0;
      if (aToday !== bToday) return bToday - aToday;

      const aGoal = a.preservesUserGoal ? 1 : 0;
      const bGoal = b.preservesUserGoal ? 1 : 0;
      if (aGoal !== bGoal) return bGoal - aGoal;

      const aClose = Math.abs(n(a.alternativePrice) - targetPrice);
      const bClose = Math.abs(n(b.alternativePrice) - targetPrice);
      if (aClose !== bClose) return aClose - bClose;

      return n(b.score) - n(a.score);
    });

  return candidates[0] || null;
}

function rankHousingAlternatives(alternatives = [], ctx = {}, cuotaMaxUsuario = null) {
  const targetPrice = Math.max(n(ctx.valorVivienda, 0), 1);
  const cuotaRef = Math.max(n(cuotaMaxUsuario, 0), 1);

  return alternatives
    .filter(Boolean)
    .filter((a) => n(a.alternativePrice) > 0)
    .filter((a) => {
      if (a.type === "goal_preserving") {
        return n(a.monthlyPayment) > 0 && n(a.monthsToViable) > 0;
      }
      if (a.viableToday || a.viableFuture) {
        return n(a.monthlyPayment) > 0 || a.viableToday;
      }
      return false;
    })
    .map((a) => {
      const targetCloseness = clamp(
        1 - Math.abs(n(a.alternativePrice) - targetPrice) / targetPrice,
        0,
        1
      );
      const timePenalty = clamp(n(a.monthsToViable) / 24, 0, 1);
      const viabilityStrength = a.viableToday ? 1 : a.viableFuture ? 0.72 : 0.2;
      const paymentComfort =
        n(a.monthlyPayment) > 0
          ? 1 - clamp(n(a.monthlyPayment) / cuotaRef, 0, 1)
          : 0.35;

      const preservesGoalBonus = a.preservesUserGoal ? 0.12 : 0;
      const specificityBonus = a.propertyName ? 0.04 : 0;
      const programBonus =
        a.segment === "VIP" ||
        a.segment === "VIS" ||
        String(a.label || "").toLowerCase().includes("biess")
          ? 0.06
          : 0.02;

      const typeBonus =
        a.type === "closest_fit"
          ? 8
          : a.type === "inventory_property"
          ? 6
          : a.type === "goal_preserving"
          ? 4
          : 0;

      const rankScore =
        targetCloseness * 42 +
        viabilityStrength * 24 +
        paymentComfort * 14 +
        programBonus * 10 +
        specificityBonus * 5 +
        preservesGoalBonus * 100 +
        typeBonus -
        timePenalty * 14;

      return {
        ...a,
        rankScore: Number(rankScore.toFixed(2)),
        targetCloseness: Number(targetCloseness.toFixed(3)),
        timePenalty: Number(timePenalty.toFixed(3)),
        viabilityStrength: Number(viabilityStrength.toFixed(3)),
        paymentComfort: Number(paymentComfort.toFixed(3)),
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}

/* ===========================================================
   Target evaluation summary
=========================================================== */
function buildTargetEvaluation({
  ctx,
  rankedTargetScenarios = [],
  profileEligibility = {},
}) {
  const targetPropertyValue = n(ctx.valorVivienda, 0);

  const viableProgramsToday = rankedTargetScenarios
    .filter((s) => s?.viable)
    .map((s) => s?.mortgageId)
    .filter(Boolean);

  const structurallyEligiblePrograms = Object.values(profileEligibility)
    .filter((p) => p?.eligibleByProfile && p?.couldWorkIfRangeAdjusted)
    .map((p) => p?.productId)
    .filter(Boolean);

  const nonViableProgramsForTarget = structurallyEligiblePrograms.filter(
    (id) => !viableProgramsToday.includes(id)
  );

  let mainReason = null;

  if (
    targetPropertyValue > 0 &&
    nonViableProgramsForTarget.length &&
    !viableProgramsToday.length
  ) {
    mainReason = "property_value_above_program_limits";
  }

  return {
    targetPropertyValue,
    viableProgramsToday,
    structurallyEligiblePrograms,
    nonViableProgramsForTarget,
    mainReason,
  };
}

/* ===========================================================
   Recomendación backend para Home
=========================================================== */
function formatMoneyShort(v) {
  const x = n(v, 0);
  return `$${money(x)}`;
}

function buildImmediateApprovalGuidance({
  financialCapacity,
  ctx = {},
}) {
  const estimatedMaxPropertyValue = n(
    financialCapacity?.estimatedMaxPropertyValue,
    0
  );

  const limitingFactor = String(
    financialCapacity?.limitingFactor || ""
  ).toLowerCase();

  const targetPrice = n(ctx?.valorVivienda, 0);

  if (estimatedMaxPropertyValue <= 0) {
    return {
      recommendedImmediateTargetPrice: 0,
      recommendedImmediateTargetRange: null,
      message: null,
    };
  }

  let recommendedMax = estimatedMaxPropertyValue;

  if (limitingFactor === "cuota") {
    recommendedMax = Math.round(estimatedMaxPropertyValue * 0.9);
  } else if (limitingFactor === "entrada") {
    recommendedMax = Math.round(estimatedMaxPropertyValue * 0.93);
  } else if (limitingFactor === "programa") {
    recommendedMax = Math.round(estimatedMaxPropertyValue * 0.95);
  } else {
    recommendedMax = Math.round(estimatedMaxPropertyValue * 0.92);
  }

  const rangeMin = Math.round(recommendedMax * 0.92);
  const rangeMax = recommendedMax;

  let message = `Para acercarte a aprobación inmediata, hoy te conviene buscar viviendas de hasta ${formatMoneyShort(
    recommendedMax
  )}.`;

  if (targetPrice > 0 && targetPrice > recommendedMax) {
    message = `Tu precio meta actual está por encima del rango más sano para aprobación inmediata. Hoy te conviene apuntar a viviendas de hasta ${formatMoneyShort(
      recommendedMax
    )}.`;
  }

  return {
    recommendedImmediateTargetPrice: recommendedMax,
    recommendedImmediateTargetRange: {
      min: rangeMin,
      max: rangeMax,
    },
    message,
  };
}

function buildHomeRecommendation({
  ctx,
  financialCapacity,
  rankedMortgages = [],
  profileEligibility = {},
  targetEvaluation = {},
}) {
  const estimatedMaxPropertyValue = n(
    financialCapacity?.estimatedMaxPropertyValue,
    0
  );
  const estimatedMonthlyPayment = n(
    financialCapacity?.estimatedMonthlyPayment,
    0
  );
  const limitingFactor = String(
    financialCapacity?.limitingFactor || ""
  ).toLowerCase();
  const hasImmediateViableMortgage =
    !!financialCapacity?.hasImmediateViableMortgage;

  const targetPrice = n(ctx?.valorVivienda, 0);
  const entradaDisponible = n(ctx?.entradaDisponible, 0);
  const capacidadEntradaMensual = n(ctx?.capacidadEntradaMensual, 0);
  const otrasDeudasMensuales = n(ctx?.otrasDeudasMensuales, 0);

  const plannedEntry = financialCapacity?.plannedEntry || null;
  const plannedFuturePrice = n(plannedEntry?.estimatedMaxPropertyValue, 0);
  const plannedMonths = n(plannedEntry?.months, 0);
  const plannedFutureEntry = n(plannedEntry?.futureEntry, 0);

  const immediateGuidance = buildImmediateApprovalGuidance({
    financialCapacity,
    ctx,
  });

  const structuralOptions = Object.values(profileEligibility)
    .filter((p) => p?.eligibleByProfile && p?.couldWorkIfRangeAdjusted)
    .sort((a, b) => {
      const pa =
        a.productId === "BIESS_CREDICASA"
          ? 1
          : a.segment === "VIS"
          ? 2
          : a.segment === "VIP"
          ? 3
          : a.productId === "BIESS_VIS_VIP"
          ? 4
          : a.segment === "PRIVATE"
          ? 8
          : 99;

      const pb =
        b.productId === "BIESS_CREDICASA"
          ? 1
          : b.segment === "VIS"
          ? 2
          : b.segment === "VIP"
          ? 3
          : b.productId === "BIESS_VIS_VIP"
          ? 4
          : b.segment === "PRIVATE"
          ? 8
          : 99;

      if (pa !== pb) return pa - pb;
      return n(b.priceMax) - n(a.priceMax);
    });

  const topStructuralOptions = structuralOptions.slice(0, 2);

  const alternatives = [];

  const rangeSearchAlt =
    estimatedMaxPropertyValue > 0
      ? {
          kind: "search_range",
          title: "Buscar dentro de tu rango actual",
          rangeMin:
            immediateGuidance?.recommendedImmediateTargetRange?.min || null,
          rangeMax:
            immediateGuidance?.recommendedImmediateTargetRange?.max ||
            estimatedMaxPropertyValue,
          description:
            "Es la forma más directa de acercarte a una aprobación real con tu perfil de hoy.",
          ctaLabel: "Ver propiedades en mi rango",
          ctaPath: "/marketplace",
        }
      : null;

  const entryInstallmentsAlt =
    capacidadEntradaMensual > 0 && plannedFuturePrice > estimatedMaxPropertyValue
      ? {
          kind: "entry_installments",
          title: "Proyectos con entrada en cuotas",
          alternativePrice: plannedFuturePrice,
          futureEntry: plannedFutureEntry,
          months: plannedMonths,
          description: `Si construyes tu entrada durante aproximadamente ${plannedMonths} meses, tu rango podría subir hacia ${formatMoneyShort(
            plannedFuturePrice
          )}.`,
          ctaLabel: "Ver proyectos con entrada en cuotas",
          ctaPath: "/marketplace",
        }
      : null;

  if (rangeSearchAlt) alternatives.push(rangeSearchAlt);
  if (entryInstallmentsAlt) alternatives.push(entryInstallmentsAlt);

  const actionableSteps = [];

  if (hasImmediateViableMortgage) {
    actionableSteps.push(
      "Ya tienes una ruta hipotecaria viable hoy. El siguiente paso es revisar propiedades reales que sí encajen con tu capacidad."
    );

    if (limitingFactor === "cuota") {
      actionableSteps.push(
        "Mantener deudas bajas y no subir tu carga mensual te ayudará a conservar mejores opciones hipotecarias."
      );
    }

    if (limitingFactor === "programa") {
      actionableSteps.push(
        "Elegir bien el segmento de vivienda puede ampliar el universo de opciones que sí encajan contigo."
      );
    }

    return {
      type: "immediate_viable",
      title: "Sí tienes una ruta hipotecaria viable hoy.",
      subtitle: `Tu perfil ya muestra una opción hipotecaria viable para una vivienda de hasta ${formatMoneyShort(
        estimatedMaxPropertyValue
      )} con una cuota aproximada de ${formatMoneyShort(
        estimatedMonthlyPayment
      )}.`,
      mainMessage:
        "Hoy ya existe una ruta hipotecaria concreta para tu perfil. El siguiente paso útil es revisar propiedades reales que encajen con esa capacidad.",
      detailMessage:
        "Tu capacidad financiera ya está suficientemente sólida para sostener una ruta hipotecaria viable. Ahora lo más importante es elegir bien dentro de tu rango.",
      cta: {
        label: "Ver propiedades que hacen match",
        path: "/marketplace",
      },
      actionHints: actionableSteps.slice(0, 3),
      blockers: {
        primary: limitingFactor || null,
        immediateApproval: true,
      },
      immediateGuidance,
      monthlyPaymentReference: estimatedMonthlyPayment || null,
      alternatives,
      targetEvaluation,
      profileProgramsThatCouldWorkIfRangeAdjusted: topStructuralOptions,
    };
  }

  const targetCouldBecomeViableWithPlannedEntry =
    targetPrice > 0 &&
    capacidadEntradaMensual > 0 &&
    plannedMonths > 0 &&
    plannedFuturePrice >= targetPrice;

  if (targetCouldBecomeViableWithPlannedEntry) {
    actionableSteps.push(
      `Hoy tu principal limitante es la entrada, pero sí podrías cerrar esa brecha si mantienes un ahorro aproximado de ${formatMoneyShort(
        capacidadEntradaMensual
      )} al mes.`
    );

    actionableSteps.push(
      `Con ese ritmo, tu perfil podría sostener una vivienda cercana a ${formatMoneyShort(
        targetPrice
      )} en aproximadamente ${plannedMonths} meses.`
    );

    actionableSteps.push(
      "Lo más lógico ahora es priorizar proyectos que permitan completar la entrada durante construcción o preventa."
    );

    return {
      type: "entry_bridge_viable",
      title: "Tu meta sí podría ser viable construyendo la entrada.",
      subtitle: `Hoy todavía no llegas con la entrada actual, pero con tu capacidad mensual sí podrías acercarte a una vivienda de ${formatMoneyShort(
        targetPrice
      )} en aproximadamente ${plannedMonths} meses.`,
      mainMessage:
        "Tu meta no está fuera de alcance. El reto no es tanto tu perfil hipotecario de fondo, sino completar la entrada en el tiempo correcto.",
      detailMessage:
        `Con una entrada futura proyectada de aproximadamente ${formatMoneyShort(
          plannedFutureEntry
        )}, tu rango estimado podría subir hacia ${formatMoneyShort(
          plannedFuturePrice
        )}.`,
      cta: {
        label: "Ver proyectos con entrada en cuotas",
        path: "/marketplace",
      },
      actionHints: actionableSteps.slice(0, 3),
      blockers: {
        primary: "entrada",
        immediateApproval: false,
      },
      immediateGuidance,
      monthlyPaymentReference: estimatedMonthlyPayment || null,
      alternatives,
      targetEvaluation,
      goalSummary: {
        targetPropertyValue: targetPrice,
      },
      realityCheck: {
        targetPropertyValue: targetPrice,
        currentMaxPropertyValue: estimatedMaxPropertyValue,
        projectedMaxPropertyValue: plannedFuturePrice,
        projectedEntryAmount: plannedFutureEntry,
        projectedMonths: plannedMonths,
        gapAmount:
          targetPrice > estimatedMaxPropertyValue
            ? targetPrice - estimatedMaxPropertyValue
            : 0,
      },
      profileProgramsThatCouldWorkIfRangeAdjusted: topStructuralOptions,
    };
  }

  const targetFarAboveCapacity =
    targetPrice > 0 &&
    estimatedMaxPropertyValue > 0 &&
    targetPrice > estimatedMaxPropertyValue * 1.2;

  if (targetFarAboveCapacity) {
    actionableSteps.push(
      `Tu meta actual de ${formatMoneyShort(
        targetPrice
      )} está por encima de lo que hoy tu perfil puede sostener con más probabilidad.`
    );

    if (limitingFactor === "entrada") {
      actionableSteps.push(
        "La principal palanca hoy es la entrada inicial. Con más entrada podrías subir tu rango mucho más rápido."
      );
    } else if (limitingFactor === "cuota") {
      actionableSteps.push(
        "La principal palanca hoy es la cuota. Reducir deudas o mejorar ingreso demostrable te ayudaría a sostener una meta mayor."
      );
    } else {
      actionableSteps.push(
        "La principal palanca hoy es ajustar temporalmente el segmento o rango de vivienda para entrar por una ruta más viable."
      );
    }

    if (capacidadEntradaMensual > 0 && plannedFuturePrice > estimatedMaxPropertyValue) {
      actionableSteps.push(
        `Si mantienes un ahorro de entrada de ${formatMoneyShort(
          capacidadEntradaMensual
        )} al mes, podrías mover tu rango hacia ${formatMoneyShort(
          plannedFuturePrice
        )} en aproximadamente ${plannedMonths} meses.`
      );
    }

    if (topStructuralOptions.length > 0) {
      const names = topStructuralOptions.map((o) => o.displayName).join(" o ");
      actionableSteps.push(
        `Aunque esa meta no encaje hoy, tu perfil sí podría calzar mejor con programas como ${names} si aterrizas tu rango.`
      );
    }

    return {
      type: "goal_above_capacity",
      title: "Tu meta hoy está por encima de tu capacidad actual.",
      subtitle:
        estimatedMaxPropertyValue > 0
          ? `Tu meta actual es más alta que el rango que hoy parece más saludable para aprobación. La buena noticia es que sí existe una ruta realista desde tu perfil.`
          : "Tu meta actual está bastante por encima de lo que el motor ve como aprobable hoy.",
      mainMessage:
        "No significa que tu perfil esté mal. Significa que hoy tu meta de vivienda está por encima del rango que mejor encaja con tus condiciones actuales.",
      detailMessage:
        "HabitaLibre separa dos cosas: la meta que te gustaría comprar y el rango que hoy sí tiene mejor probabilidad de aprobación. Sobre ese rango sí podemos construir una ruta real.",
      cta: {
        label: "Ver propiedades en mi rango",
        path: "/marketplace",
      },
      actionHints: actionableSteps.slice(0, 3),
      blockers: {
        primary: limitingFactor || null,
        immediateApproval: false,
      },
      immediateGuidance,
      monthlyPaymentReference: estimatedMonthlyPayment || null,
      goalSummary: {
        targetPropertyValue: targetPrice,
      },
      realityCheck: {
        targetPropertyValue: targetPrice,
        currentMaxPropertyValue: estimatedMaxPropertyValue,
        recommendedSearchMin:
          immediateGuidance?.recommendedImmediateTargetRange?.min || null,
        recommendedSearchMax:
          immediateGuidance?.recommendedImmediateTargetRange?.max || null,
        gapAmount:
          targetPrice > estimatedMaxPropertyValue
            ? targetPrice - estimatedMaxPropertyValue
            : 0,
      },
      alternatives,
      targetEvaluation,
      profileProgramsThatCouldWorkIfRangeAdjusted: topStructuralOptions,
    };
  }

  if (estimatedMaxPropertyValue > 0) {
    if (limitingFactor === "cuota") {
      if (targetPrice > estimatedMaxPropertyValue) {
        actionableSteps.push(
          `Para acercarte a aprobación inmediata, te conviene bajar temporalmente tu precio objetivo hacia un rango más cercano a ${formatMoneyShort(
            immediateGuidance?.recommendedImmediateTargetPrice ||
              estimatedMaxPropertyValue
          )}.`
        );
      } else {
        actionableSteps.push(
          "Tu principal limitante hoy es la cuota. Fortalecer ingreso demostrable y bajar deudas mensuales te acercará más a aprobación inmediata."
        );
      }

      if (capacidadEntradaMensual > 0) {
        actionableSteps.push(
          "También te conviene buscar proyectos que permitan financiar o completar la entrada de forma gradual durante construcción."
        );
      }

      if (otrasDeudasMensuales > 0) {
        actionableSteps.push(
          "Reducir tus deudas mensuales actuales puede mejorar de forma directa tu capacidad de pago ante el banco."
        );
      } else {
        actionableSteps.push(
          "Evita asumir nuevas deudas y trata de mejorar tu holgura mensual para que la cuota futura pese menos sobre tu perfil."
        );
      }
    } else if (limitingFactor === "entrada") {
      actionableSteps.push(
        "Tu principal limitante hoy es la entrada. Aumentar la entrada disponible puede acercarte más rápido a aprobación real."
      );

      if (capacidadEntradaMensual > 0 && plannedFuturePrice > estimatedMaxPropertyValue) {
        actionableSteps.push(
          `Como ya puedes destinar ${formatMoneyShort(
            capacidadEntradaMensual
          )} al mes a tu entrada, podrías empujar tu rango hacia ${formatMoneyShort(
            plannedFuturePrice
          )} en aproximadamente ${plannedMonths} meses.`
        );
      } else if (capacidadEntradaMensual > 0) {
        actionableSteps.push(
          "Como ya tienes capacidad mensual para entrada, te conviene priorizar esquemas donde puedas construirla gradualmente."
        );
      }

      actionableSteps.push(
        targetPrice > estimatedMaxPropertyValue
          ? `Mientras tanto, también puedes considerar un rango de vivienda más cercano a ${formatMoneyShort(
              immediateGuidance?.recommendedImmediateTargetPrice ||
                estimatedMaxPropertyValue
            )}.`
          : "Una entrada más fuerte mejora tu porcentaje de financiamiento y abre mejores opciones."
      );
    } else if (limitingFactor === "programa") {
      actionableSteps.push(
        "Tu limitante principal hoy parece ser el tipo de programa o segmento de vivienda al que apuntas."
      );

      if (topStructuralOptions.length > 0) {
        const names = topStructuralOptions.map((o) => o.displayName).join(" o ");
        actionableSteps.push(
          `Tu perfil sí podría encajar mejor con programas como ${names} si ajustas el rango o el tipo de vivienda.`
        );
      } else {
        actionableSteps.push(
          targetPrice > estimatedMaxPropertyValue
            ? `Te conviene revisar un rango de vivienda más compatible con tu perfil actual, cerca de ${formatMoneyShort(
                immediateGuidance?.recommendedImmediateTargetPrice ||
                  estimatedMaxPropertyValue
              )}.`
            : "Probar otro producto hipotecario o segmento puede ayudarte a encontrar mejor encaje."
        );
      }

      actionableSteps.push(
        "Ajustar el tipo de vivienda o el rango objetivo puede destrabar rutas que hoy todavía no aparecen como inmediatas."
      );
    } else {
      actionableSteps.push(
        "Ya vemos capacidad financiera estimada, pero todavía no aprobación inmediata. El siguiente paso es ajustar el camino para volver esa capacidad más aprobable."
      );

      actionableSteps.push(
        targetPrice > estimatedMaxPropertyValue
          ? `Hoy te conviene mirar un rango de vivienda más cercano a ${formatMoneyShort(
              immediateGuidance?.recommendedImmediateTargetPrice ||
                estimatedMaxPropertyValue
            )}.`
          : "Te conviene revisar productos hipotecarios mejor alineados con tu perfil actual."
      );

      actionableSteps.push(
        "Mantener una mejor relación entre ingreso, deuda y entrada disponible hará más sólida tu aprobación."
      );
    }

    return {
      type: "capacity_with_gap",
      title: "Sí existe una ruta financiera disponible para ti.",
      subtitle: `Hoy todavía no aparece aprobación inmediata para tu meta actual, pero tu capacidad estimada llega alrededor de ${formatMoneyShort(
        estimatedMaxPropertyValue
      )} con una cuota aproximada de ${formatMoneyShort(
        estimatedMonthlyPayment
      )}.`,
      mainMessage:
        "Aunque hoy no vemos aprobación inmediata para la meta actual, sí existe una capacidad financiera real sobre la que puedes construir una ruta de compra.",
      detailMessage:
        limitingFactor === "cuota"
          ? "Tu principal bloqueo hoy es la cuota. Para acercarte a aprobación inmediata, te conviene mejorar ingreso disponible, reducir deudas o ajustar temporalmente el precio objetivo."
          : limitingFactor === "entrada"
          ? "Tu principal bloqueo hoy es la entrada. Fortalecerla puede mejorar tu porcentaje de financiamiento y abrir mejores rutas."
          : limitingFactor === "programa"
          ? "Tu principal bloqueo hoy parece ser el encaje con el programa hipotecario o el segmento de vivienda. Ajustar el rango o el tipo de producto puede mejorar tu resultado."
          : "Tu perfil ya muestra una base financiera útil, pero todavía necesita algunos ajustes para transformarse en aprobación inmediata.",
      cta: {
        label: "Ver propiedades que hacen match",
        path: "/marketplace",
      },
      actionHints: actionableSteps.slice(0, 3),
      blockers: {
        primary: limitingFactor || null,
        immediateApproval: false,
      },
      immediateGuidance,
      monthlyPaymentReference: estimatedMonthlyPayment || null,
      alternatives,
      targetEvaluation,
      profileProgramsThatCouldWorkIfRangeAdjusted: topStructuralOptions,
    };
  }

  actionableSteps.push(
    "Hoy todavía no vemos una ruta financiera suficientemente sólida con los datos actuales."
  );
  actionableSteps.push(
    "Los cambios que más podrían mover tu resultado son: subir ingreso demostrable, aumentar entrada y ajustar el valor objetivo de vivienda."
  );

  if (entradaDisponible <= 0) {
    actionableSteps.push(
      "Tener una entrada inicial, aunque sea modesta, puede cambiar mucho tu resultado."
    );
  }

  return {
    type: "no_clear_route",
    title: "Hoy todavía no vemos una ruta clara.",
    subtitle:
      "Con los datos actuales todavía no aparece una opción sólida de compra. Pero sí podemos trabajar en mejorar tu perfil.",
    mainMessage:
      "Tu perfil necesita fortalecerse antes de que el motor vea una ruta hipotecaria consistente.",
    detailMessage:
      "Antes de enfocarte en propiedades, conviene trabajar primero en las variables base que más pesan en el resultado: entrada, ingreso disponible, deudas y rango objetivo.",
    cta: {
      label: "Ajustar mi escenario",
      path: "/journey/full",
    },
    actionHints: actionableSteps.slice(0, 3),
    blockers: {
      primary: limitingFactor || null,
      immediateApproval: false,
    },
    immediateGuidance,
    monthlyPaymentReference: estimatedMonthlyPayment || null,
    alternatives,
    targetEvaluation,
    profileProgramsThatCouldWorkIfRangeAdjusted: topStructuralOptions,
  };
}

/* ===========================================================
   Core reutilizable
=========================================================== */
export function runMortgageMatcherCore(normalizedCtx = {}) {
  const ctx = normalizedCtx;

  const { subsidyEvaluations, scenarios } = buildScenarios(ctx);
  const rankedScenarios = rankScenarios(scenarios);

  const rankedProfileScenarios = rankScenarios(buildProfileFitScenarios(ctx));
  const rankedFutureProfileScenarios = rankScenarios(buildFutureProfileFitScenarios(ctx));

  const profileEligibility = buildProfileEligibilityMap(
    rankedProfileScenarios,
    ctx
  );

  const futureProfileEligibility = buildProfileEligibilityMap(
    rankedFutureProfileScenarios,
    cloneCtxWithPlannedEntry(ctx)
  );

  const rankedBaseScenarios = rankedScenarios.filter((s) => !s.subsidyId);
  const bestTargetScenario = rankedBaseScenarios.find((s) => s.viable) || null;

  const rankedProfileBaseScenarios = rankedProfileScenarios.filter(
    (s) => !s.subsidyId
  );

  const rankedFutureProfileBaseScenarios = rankedFutureProfileScenarios.filter(
    (s) => !s.subsidyId
  );

  const bestProfileScenario =
    rankedProfileBaseScenarios.find(
      (s) => s?.mortgage?.structurallyEligible && s?.mortgage?.couldWorkIfRangeAdjusted
    ) ||
    rankedProfileBaseScenarios[0] ||
    null;

  const bestFutureProfileScenario =
    rankedFutureProfileBaseScenarios.find(
      (s) => s?.mortgage?.structurallyEligible && s?.mortgage?.couldWorkIfRangeAdjusted
    ) ||
    rankedFutureProfileBaseScenarios[0] ||
    null;

  const rankedSubsidies = [...subsidyEvaluations].sort((a, b) => {
    if (a.viable !== b.viable) return a.viable ? -1 : 1;
    return n(b.subsidyAmount) - n(a.subsidyAmount);
  });

  const bestSubsidy = rankedSubsidies.find((s) => s.viable) || null;

  const bestOption = bestTargetScenario
    ? {
        ...bestTargetScenario,
        subsidy:
          bestTargetScenario?.mortgageId === "VIS" && bestSubsidy?.id === "VIS_II"
            ? bestSubsidy
            : null,
        subsidyId:
          bestTargetScenario?.mortgageId === "VIS" && bestSubsidy?.id === "VIS_II"
            ? bestSubsidy.id
            : null,
        subsidyAmount:
          bestTargetScenario?.mortgageId === "VIS" && bestSubsidy?.id === "VIS_II"
            ? n(bestSubsidy.subsidyAmount)
            : 0,
      }
    : null;

  const rankedMortgages = rankedProfileBaseScenarios.map((s) => ({
    scenarioId: s.scenarioId,
    mortgageId: s.mortgageId,
    subsidyId: s.subsidyId,
    label: s.label,
    provider: s.mortgage?.provider || null,
    segment: s.mortgage?.segment || null,
    category: s.mortgage?.category || null,
    viable:
      (!!bestTargetScenario && bestTargetScenario.mortgageId === s.mortgageId) ||
      !!s.mortgage?.couldWorkIfRangeAdjusted,
    targetViable: rankedBaseScenarios.some(
      (t) => t.mortgageId === s.mortgageId && t.viable
    ),
    profileEligible: !!s.mortgage?.structurallyEligible,
    score: s.score,
    probabilidad: s.probabilidad,
    annualRate: s.annualRate,
    cuota: s.cuota,
    montoPrestamo: s.montoPrestamo,

    precioMaxProgramaHipoteca: s.precioMaxProgramaHipoteca,
    precioMaxProgramaSubsidio: s.precioMaxProgramaSubsidio,
    precioMaxPrograma: s.precioMaxPrograma,
    precioMaxPorCuota: s.precioMaxPorCuota,
    precioMaxPorEntrada: s.precioMaxPorEntrada,
    precioMaxPerfil: s.precioMaxPerfil,
    factorLimitante: s.factorLimitante,
    precioMaxVivienda: s.precioMaxVivienda,

    subsidyAmount: s.subsidyAmount || 0,
    reasons: s.mortgage?.reasons || [],
  }));

  const recommendationExplanation = buildRecommendationExplanation(
    bestOption,
    rankedScenarios,
    ctx
  );

  const eligibilityProducts = buildEligibilityProductsFromScenarios(
    rankedBaseScenarios
  );

  const propertyRecommendationPolicy = buildPropertyRecommendationPolicy(
    bestOption,
    rankedBaseScenarios
  );

  const bestMortgage = bestTargetScenario
    ? {
        scenarioId: bestTargetScenario.scenarioId,
        mortgageId: bestTargetScenario.mortgageId,
        label: bestTargetScenario.mortgage?.name || bestTargetScenario.label,
        viable: bestTargetScenario.viable,
        probabilidad: bestTargetScenario.probabilidad,
        score: bestTargetScenario.score,
        annualRate: bestTargetScenario.annualRate,
        cuota: bestTargetScenario.cuota,
        montoPrestamo: bestTargetScenario.montoPrestamo,

        precioMaxProgramaHipoteca: bestTargetScenario.precioMaxProgramaHipoteca,
        precioMaxProgramaSubsidio: bestTargetScenario.precioMaxProgramaSubsidio,
        precioMaxPrograma: bestTargetScenario.precioMaxPrograma,
        precioMaxPorCuota: bestTargetScenario.precioMaxPorCuota,
        precioMaxPorEntrada: bestTargetScenario.precioMaxPorEntrada,
        precioMaxPerfil: bestTargetScenario.precioMaxPerfil,
        factorLimitante: bestTargetScenario.factorLimitante,
        precioMaxVivienda: bestTargetScenario.precioMaxVivienda,

        subsidyAmount: bestTargetScenario.subsidyAmount || 0,
        reasons: bestTargetScenario.mortgage?.reasons || [],
      }
    : null;

  const primaryCapacityScenario = bestProfileScenario;

  const topLevelPrecioMax =
    primaryCapacityScenario?.precioMaxVivienda ?? 0;

  const topLevelCuota =
    primaryCapacityScenario?.cuota ?? null;

  const topLevelRate =
    primaryCapacityScenario?.annualRate ?? null;

  const topLevelLoan =
    primaryCapacityScenario?.montoPrestamo ?? 0;

  const bancoSugerido =
    bestMortgage?.label ??
    primaryCapacityScenario?.label ??
    null;

  const productoSugerido =
    bestMortgage?.segment ??
    primaryCapacityScenario?.segment ??
    null;

  const sinOferta = !bestMortgage;

  const plannedEntryMeta = buildPlannedEntrySnapshot(ctx);

  const futureTopLevelPrecioMax =
    bestFutureProfileScenario?.precioMaxVivienda ?? 0;

  const futureTopLevelCuota =
    bestFutureProfileScenario?.cuota ?? null;

  const futureTopLevelRate =
    bestFutureProfileScenario?.annualRate ?? null;

  const futureTopLevelLoan =
    bestFutureProfileScenario?.montoPrestamo ?? 0;

  const financialCapacity = {
    hasImmediateViableMortgage: !!bestMortgage,

    estimatedMaxPropertyValue: topLevelPrecioMax,
    estimatedMaxLoanAmount: topLevelLoan,
    estimatedMonthlyPayment: topLevelCuota,
    estimatedAnnualRate: topLevelRate,
    basedOnScenarioId: primaryCapacityScenario?.scenarioId || null,
    basedOnMortgageId: primaryCapacityScenario?.mortgageId || null,
    basedOnProductLabel: primaryCapacityScenario?.label || null,
    basedOnSegment: primaryCapacityScenario?.segment || null,
    limitingFactor: primaryCapacityScenario?.factorLimitante || null,

    plannedEntry: {
      months: plannedEntryMeta?.meses || 0,
      currentEntry: plannedEntryMeta?.entradaActual || 0,
      monthlySaving: plannedEntryMeta?.ahorroMensual || 0,
      futureEntry: plannedEntryMeta?.entradaFutura || 0,

      estimatedMaxPropertyValue: futureTopLevelPrecioMax,
      estimatedMaxLoanAmount: futureTopLevelLoan,
      estimatedMonthlyPayment: futureTopLevelCuota,
      estimatedAnnualRate: futureTopLevelRate,
      basedOnScenarioId: bestFutureProfileScenario?.scenarioId || null,
      basedOnMortgageId: bestFutureProfileScenario?.mortgageId || null,
      basedOnProductLabel: bestFutureProfileScenario?.label || null,
      basedOnSegment: bestFutureProfileScenario?.segment || null,
      limitingFactor: bestFutureProfileScenario?.factorLimitante || null,
    },
  };

  const targetEvaluation = buildTargetEvaluation({
    ctx,
    rankedTargetScenarios: rankedBaseScenarios,
    profileEligibility,
  });

  return {
    ok: true,
    sbu: SBU,
    inputNormalizado: ctx,

    subsidies: subsidyEvaluations,
    rankedSubsidies,
    bestSubsidy,

    scenarios,
    rankedScenarios,
    rankedProfileScenarios,
    rankedFutureProfileScenarios,

    rankedMortgages,
    bestOption,
    bestMortgage,

    eligibilityProducts,
    profileEligibility,
    futureProfileEligibility,
    targetEvaluation,
    propertyRecommendationPolicy,
    recommendationExplanation,
    financialCapacity,

    // top-level friendly fields para frontend
    bancoSugerido,
    productoSugerido,
    precioMaxVivienda: topLevelPrecioMax,
    propertyPrice: topLevelPrecioMax,
    cuotaEstimada: topLevelCuota,
    tasaAnual: topLevelRate,
    montoMaximo: topLevelLoan,
    loanAmount: topLevelLoan,
    score: bestMortgage?.score ?? primaryCapacityScenario?.score ?? 0,
    probabilidad:
      bestMortgage?.probabilidad ??
      primaryCapacityScenario?.probabilidad ??
      "Sin oferta hoy",
    sinOferta,
  };
}

/* ===========================================================
   API principal del matcher
=========================================================== */
export function runMortgageMatcher(input = {}) {
  const ctx = normalizeInput(input);

  const baseResult = runMortgageMatcherCore(ctx);

  const matchedProperties = matchPropertiesToProfile({
    ctx,
    mortgageResult: baseResult,
  });

  const cuotaMaxUsuario = Math.max(
    0,
    (n(ctx.ingresoNetoMensual) +
      n(ctx.ingresoPareja) -
      n(ctx.otrasDeudasMensuales)) *
      0.45
  );

  const closestFitToday = buildClosestFitAlternative(
    baseResult?.rankedMortgages || [],
    ctx
  );

  const goalPreservingFutureRoute = buildGoalPreservingFutureAlternative(
    matchedProperties || [],
    ctx
  );

  const inventoryBackedAlternative = buildInventoryBackedAlternative(
    matchedProperties || [],
    ctx
  );

  const rankedHousingAlternatives = rankHousingAlternatives(
    [goalPreservingFutureRoute, closestFitToday, inventoryBackedAlternative],
    ctx,
    cuotaMaxUsuario
  );

  const primaryHousingAlternative = rankedHousingAlternatives[0] || null;
  const secondaryHousingAlternative = rankedHousingAlternatives[1] || null;

  const homeRecommendation = buildHomeRecommendation({
    ctx,
    financialCapacity: baseResult?.financialCapacity,
    rankedMortgages: baseResult?.rankedMortgages || [],
    profileEligibility: baseResult?.profileEligibility || {},
    targetEvaluation: baseResult?.targetEvaluation || {},
  });

  return {
    ...baseResult,
    matchedProperties,
    housingAlternatives: {
      goalPreservingFutureRoute,
      closestFitToday,
      inventoryBackedAlternative,
      rankedHousingAlternatives,
      primaryHousingAlternative,
      secondaryHousingAlternative,
    },
    homeRecommendation,
  };
}

export default runMortgageMatcher;