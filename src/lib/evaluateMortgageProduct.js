// src/lib/evaluateMortgageProduct.js

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

function tasaBiessEstandar(monto, plazoAnios) {
  const loan = n(monto);
  const years = n(plazoAnios, 20);

  if (loan <= 90000 && years <= 20) return 0.073;
  if (loan <= 150000) return 0.078;
  if (loan <= 200000) return 0.082;
  return 0.088;
}

function resolveApplicantBucket(context = {}) {
  const tipoIngreso = String(context.tipoIngreso || "").toLowerCase();

  if (tipoIngreso.includes("depend")) return "dependent";
  if (tipoIngreso.includes("independ")) return "independent";
  if (tipoIngreso.includes("volunt")) return "voluntary";
  if (tipoIngreso.includes("jub")) return "retiree";
  if (tipoIngreso.includes("discap")) return "disability";

  return "dependent";
}

function normalizeApplicantType(bucket) {
  if (bucket === "dependent") return "dependiente";
  if (bucket === "independent") return "independiente";
  if (bucket === "voluntary") return "voluntario";
  if (bucket === "retiree") return "jubilado";
  if (bucket === "disability") return "discapacidad";
  return "dependiente";
}

function resolveContributionRequirements(product, applicantBucket) {
  const rules = product?.rules || {};

  const fallbackTotal = n(rules?.minContribTotalMonths, 36);
  const fallbackConsecutive = n(rules?.minContribConsecutiveMonths, 13);

  if (applicantBucket === "dependent") {
    return {
      total: n(rules?.minContribTotalMonthsDependent, fallbackTotal),
      consecutive: n(
        rules?.minContribConsecutiveMonthsDependent,
        fallbackConsecutive
      ),
    };
  }

  if (applicantBucket === "independent") {
    return {
      total: n(rules?.minContribTotalMonthsIndependent, fallbackTotal),
      consecutive: n(
        rules?.minContribConsecutiveMonthsIndependent,
        fallbackConsecutive
      ),
    };
  }

  if (applicantBucket === "voluntary") {
    return {
      total: n(rules?.minContribTotalMonthsVoluntary, fallbackTotal),
      consecutive: n(
        rules?.minContribConsecutiveMonthsVoluntary,
        fallbackConsecutive
      ),
    };
  }

  if (applicantBucket === "disability") {
    return {
      total: n(rules?.minContribTotalMonthsDisability, fallbackTotal),
      consecutive: n(rules?.minContribConsecutiveMonthsDisability, fallbackConsecutive),
    };
  }

  return {
    total: fallbackTotal,
    consecutive: fallbackConsecutive,
  };
}

function resolveRateAnnual(product, montoNecesario, plazoEfectivoMeses) {
  const explicit = product?.rate?.annual;
  if (Number.isFinite(explicit)) return explicit;

  const isBiessStd = product?.id === "BIESS_STD";
  if (isBiessStd) {
    const plazoAnios = plazoEfectivoMeses > 0 ? plazoEfectivoMeses / 12 : 20;
    return tasaBiessEstandar(montoNecesario, plazoAnios);
  }

  return 0.08;
}

export function evaluateMortgageProduct({ product, input = {}, context = {} }) {
  const rules = product?.rules || {};
  const caps = product?.caps || {};
  const risk = product?.risk || {};
  const term = product?.term || {};

  const ingresoTotal = n(context.ingresoTotal);
  const ingresoDisponible = n(context.ingresoDisponible);
  const factorCapacidad = n(context.factorCapacidad, 1);
  const edad = n(context.edad, 30);
  const tipoIngreso = context.tipoIngreso || "Dependiente";
  const aniosEstabilidad = n(context.aniosEstabilidad, 0);
  const afiliadoBool = !!context.afiliadoBool;
  const iessAportesTotales = n(context.iessAportesTotales, 0);
  const iessAportesConsecutivos = n(context.iessAportesConsecutivos, 0);
  const tieneViviendaBool = !!context.tieneViviendaBool;
  const viviendaNuevaBool = !!context.viviendaNuevaBool;
  const declaracionBuro = String(context.declaracionBuro || "ninguno").toLowerCase();
  const entradaDisponible = n(context.entradaDisponible);
  const valorVivienda = n(context.valorVivienda);
  const plazoAniosUsuario = context.plazoAnios;
  const esExtranjero = !!context.esExtranjero;
  const sustentoOKGlobal =
    typeof context.sustentoOKGlobal === "boolean"
      ? context.sustentoOKGlobal
      : true;

  const applicantBucket = resolveApplicantBucket({ tipoIngreso });
  const applicantTypeNormalized = normalizeApplicantType(applicantBucket);
  const contribReq = resolveContributionRequirements(product, applicantBucket);

  const incomeMin = n(caps?.incomeMin, 0);
  const incomeMax =
    caps?.incomeMax == null ? Infinity : n(caps?.incomeMax, Infinity);

  const propertyMin = n(caps?.propertyMin, 0);
  const propertyMax =
    caps?.propertyMax == null ? Infinity : n(caps?.propertyMax, Infinity);

  const loanCap =
    caps?.loanCap == null ? Infinity : n(caps?.loanCap, Infinity);

  const ltvMax = n(risk?.ltvMax, 0.8);
  const dtiMax = n(risk?.dtiMax, 0.4);
  const downPaymentMinPct = n(risk?.downPaymentMinPct, 0);

  const dentroIngreso =
    ingresoTotal >= incomeMin &&
    ingresoTotal <= incomeMax + 1e-9;

  const primeraViviendaOK = rules?.firstHome ? !tieneViviendaBool : true;
  const iessOK = rules?.requireIESS ? afiliadoBool : true;
  const aportesOK = rules?.requireContributions
    ? iessAportesTotales >= contribReq.total &&
      iessAportesConsecutivos >= contribReq.consecutive
    : true;

  const viviendaNuevaOK = rules?.newConstruction ? viviendaNuevaBool : true;
  const extranjerosOK = rules?.allowsForeign === false ? !esExtranjero : true;

  const buroOK =
    declaracionBuro === "mora"
      ? !!rules?.allowsBuroMora
      : declaracionBuro === "regularizado"
      ? !!rules?.allowsBuroRegularizado
      : true;

  const estabilidadOK =
    applicantBucket === "dependent"
      ? aniosEstabilidad >= n(rules?.minYearsEmployedDep, 1)
      : aniosEstabilidad >= n(rules?.minYearsRucInd, 2);

  const minAniosProd = n(term?.minYears, 5);
  const maxAniosProd = n(term?.maxYears, 25);

  let plazoOriginalMeses;
  if (plazoAniosUsuario != null) {
    const plazoUserAnios = clamp(n(plazoAniosUsuario), minAniosProd, maxAniosProd);
    plazoOriginalMeses = plazoUserAnios * 12;
  } else {
    plazoOriginalMeses = n(term?.defaultYears, 20) * 12;
  }

  const maxAgeAtMaturity = n(term?.maxAgeAtMaturity, 75);
  const maxPlazoPorEdadMeses = Math.max(0, (maxAgeAtMaturity - edad) * 12);
  const plazoEfectivo = Math.min(plazoOriginalMeses, maxPlazoPorEdadMeses);
  const edadOK = plazoEfectivo > 0;

  const maxAgeAtApplication = rules?.maxAgeAtApplication;
  const maxAgePlusTerm = rules?.maxAgePlusTerm;

  const edadAplicacionOK =
    maxAgeAtApplication == null ? true : edad <= n(maxAgeAtApplication);

  const edadMasPlazoOK =
    maxAgePlusTerm == null
      ? true
      : edad + plazoEfectivo / 12 <= n(maxAgePlusTerm);

  const montoNecesario = Math.max(0, valorVivienda - entradaDisponible);

  const tasaAnual = resolveRateAnnual(product, montoNecesario, plazoEfectivo);
  const rate = tasaAnual / 12;

  const cuotaMaxProducto = Math.max(
    0,
    ingresoDisponible * dtiMax * factorCapacidad
  );

  const montoMaxPorCuota = pvFromPayment(rate, plazoEfectivo, cuotaMaxProducto);

  const precioPorCapacidad = entradaDisponible + montoMaxPorCuota;
  const precioPorLtv =
    1 - ltvMax > 0 ? entradaDisponible / (1 - ltvMax) : Infinity;
  const precioPorTope = propertyMax;

  let precioMaxVivienda = Math.min(precioPorCapacidad, precioPorLtv, precioPorTope);

  if (propertyMin > 0 && precioMaxVivienda < propertyMin) {
    precioMaxVivienda = 0;
  }

  let binding = "capacidad";
  if (precioMaxVivienda === precioPorLtv) binding = "ltv";
  if (precioMaxVivienda === precioPorTope) binding = "tope";

  const montoPorLtv = Math.max(0, valorVivienda * ltvMax);
  let montoPrestamo = Math.max(
    0,
    Math.min(montoNecesario, montoMaxPorCuota, montoPorLtv, loanCap)
  );

  const cuota = montoPrestamo > 0 ? pmt(rate, plazoEfectivo, montoPrestamo) : 0;
  const cuotaStress =
    montoPrestamo > 0
      ? pmt((tasaAnual + 0.02) / 12, plazoEfectivo, montoPrestamo)
      : 0;

  const ltv = valorVivienda > 0 ? montoNecesario / valorVivienda : 0;

  const dentroPrecio =
    valorVivienda >= propertyMin &&
    valorVivienda <= propertyMax;

  const dentroLtv = ltv <= ltvMax + 1e-9;
  const dentroCapacidad = cuota <= cuotaMaxProducto + 1e-9;

  const sustentoOK =
    applicantBucket === "independent" ? sustentoOKGlobal : true;

  const eligibleApplicantTypes = Array.isArray(rules?.eligibleApplicantTypes)
    ? rules.eligibleApplicantTypes
    : [];

  const applicantTypeOK =
    !eligibleApplicantTypes.length ||
    eligibleApplicantTypes.includes(applicantTypeNormalized);

  const downPaymentPct = valorVivienda > 0 ? entradaDisponible / valorVivienda : 0;
  const downPaymentOK =
    downPaymentPct + 1e-9 >= downPaymentMinPct;

  const viable = !!(
    dentroIngreso &&
    primeraViviendaOK &&
    iessOK &&
    aportesOK &&
    viviendaNuevaOK &&
    extranjerosOK &&
    buroOK &&
    estabilidadOK &&
    dentroPrecio &&
    dentroLtv &&
    dentroCapacidad &&
    edadOK &&
    edadAplicacionOK &&
    edadMasPlazoOK &&
    sustentoOK &&
    applicantTypeOK &&
    downPaymentOK
  );

  return {
    productId: product?.id || "UNKNOWN",
    producto: product?.name || "Producto",
    segment: product?.segment || null,
    channel: product?.channel || null,
    legacyBucket: product?.legacyBucket || null,

    tasaAnual,
    plazoMeses: plazoEfectivo,
    ltvMax,
    priceCap: propertyMax,
    priceMin: propertyMin,
    incomeCap: incomeMax,
    incomeMin,

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
      extranjerosOK,
      buroOK,
      estabilidadOK,
      dentroPrecio,
      dentroLtv,
      dentroCapacidad,
      edadOK,
      edadAplicacionOK,
      edadMasPlazoOK,
      sustentoOK,
      applicantTypeOK,
      downPaymentOK,
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
      dtiUsado: dtiMax,
      factorCapProd: factorCapacidad,
    },

    metadata: {
      applicantBucket,
      applicantTypeNormalized,
      contributionRequirements: contribReq,
      rawProductId: product?.id || null,
    },

    viable,
    rawProduct: product || null,
  };
}

export default evaluateMortgageProduct;