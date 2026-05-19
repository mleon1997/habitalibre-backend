// src/services/propertyMatch.service.js

import mockProperties from "../data/mockProperties.js";
import { evaluarEntradaProyecto } from "../utils/evaluarEntradaProyecto.js";
import { runMortgageMatcherCore } from "./mortgageMatcher.service.js";

const n = (v, def = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
};

function normalizeText(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function cityMatches(property, ciudadCompra) {
  if (!ciudadCompra) return true;

  const target = normalizeText(ciudadCompra);

  const fields = [
    property?.zona,
    property?.ciudadZona,
    property?.sector,
    property?.ciudad,
  ].map(normalizeText);

  return fields.some((f) => f.includes(target) || target.includes(f));
}

function normalizeMortgageProductId(id) {
  const s = String(id || "").trim().toUpperCase();

  if (!s) return null;

  if (
    [
      "BIESS_CREDICASA",
      "BIESS_VIS_VIP",
      "BIESS_MEDIA",
      "BIESS_ALTA",
      "BIESS_LUJO",
      "BIESS_STD",
    ].includes(s)
  ) {
    return "BIESS_STD";
  }

  if (s === "VIS_II") return "VIS";

  return s;
}

function inferPropertyProductIds(property) {
  const precio = n(property?.precio);
  const proyectoNuevo = !!property?.proyectoNuevo;

  const ids = [];

  if (proyectoNuevo && precio <= 85796) {
    ids.push("VIS");
  }

  if (proyectoNuevo && precio <= 49164) {
    ids.push("VIS_II");
  }

  if (proyectoNuevo && precio <= 110378) {
    ids.push("VIP");
  }

  if (precio <= 71504.7) {
    ids.push("BIESS_CREDICASA");
  } else if (precio >= 71505 && precio <= 105000) {
    ids.push("BIESS_VIS_VIP");
  } else if (precio >= 105001 && precio <= 130000) {
    ids.push("BIESS_MEDIA");
  } else if (precio >= 130001 && precio <= 200000) {
    ids.push("BIESS_ALTA");
  } else if (precio > 200000) {
    ids.push("BIESS_LUJO");
  }

  ids.push("PRIVATE");

  return [...new Set(ids)];
}

function getAllowedProductIds(property) {
  const explicit = Array.isArray(property?.mortgageProfile?.productIds)
    ? property.mortgageProfile.productIds
    : [];

  const raw = explicit.length ? explicit : inferPropertyProductIds(property);

  return raw.map(normalizeMortgageProductId).filter(Boolean);
}

function getStrictPolicyProductIds(mortgageResult) {
  const strictIds =
    mortgageResult?.propertyRecommendationPolicy?.strictProductIds || [];

  return strictIds.map(normalizeMortgageProductId).filter(Boolean);
}

function propertyMatchesStrictPolicy(property, mortgageResult) {
  const strictProductIds = getStrictPolicyProductIds(mortgageResult);

  const propertyProductIds = getAllowedProductIds(property);

  if (!strictProductIds.length) {
    return {
      hasStrictPolicy: false,
      ok: true,
      strictProductIds: [],
      propertyProductIds,
    };
  }

  const ok = propertyProductIds.some((id) => strictProductIds.includes(id));

  return {
    hasStrictPolicy: true,
    ok,
    strictProductIds,
    propertyProductIds,
  };
}

function propertyAcceptsMortgage(property, rankedMortgages = []) {
  const allowed = getAllowedProductIds(property);

  if (!allowed.length) return true;

  return rankedMortgages.some((m) => {
    const normalized = normalizeMortgageProductId(
      m?.mortgageId || m?.segment || m?.label
    );

    return normalized && allowed.includes(normalized) && !!m?.viable;
  });
}

function selectBestMortgageForProperty(property, rankedMortgages = []) {
  const allowed = getAllowedProductIds(property);

  const viable = rankedMortgages.filter((m) => !!m?.viable);

  if (!viable.length) return null;

  const compatible = viable.filter((m) => {
    if (!allowed.length) return true;

    const normalized = normalizeMortgageProductId(
      m?.mortgageId || m?.segment || m?.label
    );

    return normalized && allowed.includes(normalized);
  });

  if (allowed.length && !compatible.length) {
    return null;
  }

  return compatible[0] || viable[0] || null;
}

function checkPropertyRules(property, ctx) {
  const profile = property?.mortgageProfile || {};

  const requiresFirstHome = !!profile.requiresFirstHome;
  const requiresNewConstruction = !!profile.requiresNewConstruction;
  const requiresMiduviQualifiedProject =
    !!profile.requiresMiduviQualifiedProject;

  const firstHomeOk = requiresFirstHome ? !!ctx.primeraVivienda : true;

  const newConstructionOk = requiresNewConstruction
    ? !!property.proyectoNuevo
    : true;

  const miduviOk = requiresMiduviQualifiedProject
    ? !!property.esMiduviCalificado
    : true;

  return {
    ok: firstHomeOk && newConstructionOk && miduviOk,
    flags: {
      firstHomeOk,
      newConstructionOk,
      miduviOk,
    },
  };
}

function getProjectFinancing(property) {
  const financing = property?.financing || {};

  const downPaymentPct = n(
    financing?.downPaymentPct,
    property?.porcentajeEntradaRequerida ?? 0.1
  );

  const mortgagePctRaw = n(financing?.mortgagePct, 1 - downPaymentPct);

  const mortgagePct =
    mortgagePctRaw > 0 ? mortgagePctRaw : Math.max(0, 1 - downPaymentPct);

  const allowInstallments =
    financing?.allowInstallments ?? property?.permiteEntradaEnCuotas ?? false;

  const reserveMin = n(financing?.reserveMin, property?.reservaMinima ?? 0);

  const monthsConstruction = n(
    financing?.monthsConstruction,
    property?.mesesConstruccionRestantes ?? 0
  );

  return {
    downPaymentPct,
    mortgagePct,
    allowInstallments,
    reserveMin,
    monthsConstruction,
  };
}

function isCreditBlocked(creditAssessment, readinessStatus) {
  return (
    creditAssessment?.blocksBankSubmission === true ||
    readinessStatus === "credit_repair_needed"
  );
}

function getEntradaRequeridaFromEvaluation(evaluacionEntrada, property) {
  return n(
    evaluacionEntrada?.entradaRequerida,
    n(property?.precio) * n(property?.porcentajeEntradaRequerida, 0.1)
  );
}

function getEntradaDisponibleHoyFromEvaluation(evaluacionEntrada, ctx) {
  return n(
    evaluacionEntrada?.entradaDisponibleHoy,
    n(ctx?.entradaDisponible, 0)
  );
}

function getFaltanteEntradaFromEvaluation(evaluacionEntrada, property, ctx) {
  const entradaRequerida = getEntradaRequeridaFromEvaluation(
    evaluacionEntrada,
    property
  );

  const entradaDisponibleHoy = getEntradaDisponibleHoyFromEvaluation(
    evaluacionEntrada,
    ctx
  );

  return n(
    evaluacionEntrada?.faltanteEntrada,
    Math.max(0, entradaRequerida - entradaDisponibleHoy)
  );
}

function buildHipotecaEvaluation(bestMortgage, property) {
  if (!bestMortgage) {
    return {
      viable: false,
      productoSugerido: null,
      probabilidad: null,
      score: 0,
      cuotaReferencia: null,
      precioMaxVivienda: 0,
      compatibleConProducto: false,
      razon: "No existe un producto hipotecario viable para este perfil.",
    };
  }

  const precioMaxVivienda =
    n(bestMortgage?.precioMaxVivienda) ||
    n(bestMortgage?.precioMaxPerfil) ||
    n(bestMortgage?.precioMaxPrograma) ||
    0;

  const viable = n(property?.precio) <= precioMaxVivienda;

  return {
    viable,
    productoSugerido: bestMortgage?.label || null,
    probabilidad: bestMortgage?.probabilidad || null,
    score: n(bestMortgage?.score),
    cuotaReferencia: bestMortgage?.cuota || null,
    precioMaxVivienda,
    compatibleConProducto: true,
    razon: viable
      ? "El valor de la propiedad entra dentro del rango hipotecario estimado."
      : "El valor de la propiedad supera el rango hipotecario estimado para este perfil.",
  };
}

function buildProjectedCtx(ctx, property, evaluacionEntrada = null) {
  const financing = getProjectFinancing(property);
  const precio = n(property?.precio);

  const entradaActual = n(ctx?.entradaDisponible);
  const capacidadEntradaMensual = n(ctx?.capacidadEntradaMensual);

  const mesesConstruccion = n(financing.monthsConstruction, 0);

  const mesesAhorro =
    n(
      evaluacionEntrada?.mesesConstruccionRestantes,
      n(evaluacionEntrada?.mesesNecesarios, mesesConstruccion)
    ) || mesesConstruccion;

  const ahorroDuranteObra = capacidadEntradaMensual * Math.max(0, mesesAhorro);

  const entradaRequerida = precio * financing.downPaymentPct;

  const entradaDisponibleProyectada = Math.max(
    0,
    entradaActual + ahorroDuranteObra
  );

  const montoHipotecaProyectado = Math.max(
    0,
    precio - entradaDisponibleProyectada
  );

  const faltanteEntradaProyectado = Math.max(
    0,
    entradaRequerida - entradaDisponibleProyectada
  );

  return {
    ...ctx,
    valorVivienda: precio,
    entradaDisponible: entradaDisponibleProyectada,
    viviendaEstrenar:
      property?.proyectoNuevo != null
        ? !!property.proyectoNuevo
        : !!ctx?.viviendaEstrenar,
    tipoVivienda: property?.proyectoNuevo ? "por_estrenar" : ctx?.tipoVivienda,
    __metaProyecto: {
      entradaActual,
      ahorroDuranteObra,
      mesesAhorro,
      entradaRequerida,
      entradaDisponibleProyectada,
      faltanteEntradaProyectado,
      montoHipotecaProyectado,
      financing,
    },
  };
}

function buildFutureMortgageEvaluation({ property, ctx, evaluacionEntrada }) {
  const projectedCtx = buildProjectedCtx(ctx, property, evaluacionEntrada);
  const projectedMortgageResult = runMortgageMatcherCore(projectedCtx);

  const rankedMortgages = Array.isArray(projectedMortgageResult?.rankedMortgages)
    ? projectedMortgageResult.rankedMortgages
    : [];

  const precio = n(property?.precio);

  const entradaDisponibleProyectada = n(
    projectedCtx?.__metaProyecto?.entradaDisponibleProyectada,
    0
  );

  const montoHipotecaProyectado = n(
    projectedCtx?.__metaProyecto?.montoHipotecaProyectado,
    Math.max(0, precio - entradaDisponibleProyectada)
  );

  const entradaRequerida = n(projectedCtx?.__metaProyecto?.entradaRequerida, 0);

  const faltanteEntradaProyectado = n(
    projectedCtx?.__metaProyecto?.faltanteEntradaProyectado,
    Math.max(0, entradaRequerida - entradaDisponibleProyectada)
  );

  const allowed = getAllowedProductIds(property);

  const compatibleMortgages = rankedMortgages.filter((m) => {
    const normalized = normalizeMortgageProductId(
      m?.mortgageId || m?.segment || m?.label
    );

    const allowedOk =
      !allowed.length || (normalized && allowed.includes(normalized));

    const precioMaxVivienda =
      n(m?.precioMaxVivienda) ||
      n(m?.precioMaxPerfil) ||
      n(m?.precioMaxPrograma) ||
      0;

    const montoPrestamoMax = n(m?.montoPrestamo, 0);

    const cubrePrecio = precioMaxVivienda > 0 && precio <= precioMaxVivienda;
    const cubreMonto = montoPrestamoMax >= montoHipotecaProyectado;

    return !!m?.viable && allowedOk && cubrePrecio && cubreMonto;
  });

  const selectedMortgage = compatibleMortgages[0] || null;

  if (!selectedMortgage) {
    return {
      viable: false,
      productoSugerido: null,
      probabilidad: null,
      score: 0,
      cuotaReferencia: null,
      precioMaxVivienda: 0,
      compatibleConProducto: false,
      montoHipotecaProyectado,
      entradaFinalProyectada: entradaDisponibleProyectada,
      entradaRequerida,
      faltanteEntradaProyectado,
      razon:
        faltanteEntradaProyectado > 0
          ? "Aunque ahorres durante la obra, todavía no completas la entrada mínima requerida para este proyecto."
          : "Aunque completes la entrada durante obra, hoy no tenemos una ruta hipotecaria compatible para este proyecto.",
      mortgageSelected: null,
    };
  }

  const precioMaxVivienda =
    n(selectedMortgage?.precioMaxVivienda) ||
    n(selectedMortgage?.precioMaxPerfil) ||
    n(selectedMortgage?.precioMaxPrograma) ||
    0;

  const montoPrestamoMax = n(selectedMortgage?.montoPrestamo, 0);
  const cuotaReferencia = selectedMortgage?.cuota || null;
  const score = n(selectedMortgage?.score, 0);
  const probabilidad = selectedMortgage?.probabilidad || null;

  const viablePorMonto =
    montoHipotecaProyectado <= montoPrestamoMax && montoPrestamoMax > 0;

  const viablePorPrecio =
    precioMaxVivienda > 0 ? precio <= precioMaxVivienda : false;

  const viable = viablePorMonto && viablePorPrecio;

  return {
    viable,
    productoSugerido: selectedMortgage?.label || null,
    probabilidad,
    score,
    cuotaReferencia,
    precioMaxVivienda,
    compatibleConProducto: true,
    montoHipotecaProyectado,
    entradaFinalProyectada: entradaDisponibleProyectada,
    entradaRequerida,
    faltanteEntradaProyectado,
    razon: viable
      ? "Si completas la entrada durante obra, esta propiedad sí podría calzar con tu ruta hipotecaria estimada al momento de entrega."
      : "Aunque completes la entrada durante obra, el diferencial hipotecario proyectado todavía no calza bien con tu perfil estimado.",
    mortgageSelected: selectedMortgage,
  };
}

function computeEstadoCompra({
  reglasPropiedad,
  mortgageCompatibleHoy,
  evaluacionHipotecaHoy,
  evaluacionEntrada,
  evaluacionHipotecaFutura,
  property,
  ctx,
  creditAssessment,
  readinessStatus,
  policyMatch,
}) {
  if (isCreditBlocked(creditAssessment, readinessStatus)) {
    return "credit_repair_needed";
  }

  if (!reglasPropiedad?.ok) return "fuera_de_reglas";

  if (policyMatch?.hasStrictPolicy && !policyMatch?.ok) {
    return "fuera_de_ruta_recomendada";
  }

  const esConstruccion = evaluacionEntrada?.modalidadEntrada === "construccion";

  const entradaRequerida = getEntradaRequeridaFromEvaluation(
    evaluacionEntrada,
    property
  );

  const entradaDisponibleHoy = getEntradaDisponibleHoyFromEvaluation(
    evaluacionEntrada,
    ctx
  );

  const faltanteEntrada = getFaltanteEntradaFromEvaluation(
    evaluacionEntrada,
    property,
    ctx
  );

  const entradaCompletaHoy =
    entradaRequerida <= 0 ||
    entradaDisponibleHoy >= entradaRequerida - 1e-6 ||
    faltanteEntrada <= 1e-6;

  const viableEntrada = !!evaluacionEntrada?.viableEntrada;

  const puedeSepararHoy =
    evaluacionEntrada?.puedeSepararHoy ??
    evaluacionEntrada?.tieneReservaMinima ??
    false;

  const puedeCompletarEntradaDuranteObra =
    evaluacionEntrada?.puedeCompletarEntradaDuranteObra ??
    evaluacionEntrada?.puedeCubrirCuota ??
    false;

  const hipotecaHoyViable =
    mortgageCompatibleHoy === true && evaluacionHipotecaHoy?.viable === true;

  const hipotecaFuturaViable = evaluacionHipotecaFutura?.viable === true;

  const userPrefersUsed =
    String(ctx?.tipoVivienda || "").toLowerCase() === "usada" ||
    ctx?.viviendaEstrenar === false;

  const propertyIsNew =
    property?.proyectoNuevo === true ||
    String(property?.tipoEntrega || "").toLowerCase() === "construccion";

  const propertyTypeMismatch = userPrefersUsed && propertyIsNew;

  if (
    propertyTypeMismatch &&
    (hipotecaHoyViable ||
      hipotecaFuturaViable ||
      viableEntrada ||
      puedeCompletarEntradaDuranteObra)
  ) {
    return "tipo_vivienda_no_preferido";
  }

  if (esConstruccion) {
    if (entradaCompletaHoy && (hipotecaHoyViable || hipotecaFuturaViable)) {
      return "top_match";
    }

    if (puedeCompletarEntradaDuranteObra && hipotecaFuturaViable) {
      return "entrada_viable_hipoteca_futura_viable";
    }

    if (puedeCompletarEntradaDuranteObra && !hipotecaFuturaViable) {
      return "entrada_viable_hipoteca_futura_debil";
    }

    if (viableEntrada && hipotecaFuturaViable) {
      return "entrada_viable_hipoteca_futura_viable";
    }

    if (viableEntrada && !hipotecaFuturaViable) {
      return "entrada_viable_hipoteca_futura_debil";
    }

    if (puedeSepararHoy) {
      return "ruta_cercana";
    }

    return "entrada_no_viable";
  }

  if (!viableEntrada && !entradaCompletaHoy) {
    return "entrada_no_viable";
  }

  if (hipotecaHoyViable) {
    return "top_match";
  }

  if (!evaluacionHipotecaHoy?.viable && puedeSepararHoy) {
    return "ruta_cercana";
  }

  return "ruta_cercana";
}

function buildMatchReason({
  property,
  estadoCompra,
  evaluacionEntrada,
  evaluacionHipotecaHoy,
  creditAssessment,
}) {
  if (estadoCompra === "credit_repair_needed") {
    return (
      creditAssessment?.recommendedAction ||
      "Antes de avanzar con banco o cooperativa, conviene revisar tu historial financiero declarado."
    );
  }

  if (estadoCompra === "tipo_vivienda_no_preferido") {
    return "Esta propiedad puede calzar financieramente, pero no coincide con tu preferencia de vivienda usada.";
  }

  if (estadoCompra === "fuera_de_ruta_recomendada") {
    return "Esta propiedad puede calzar financieramente, pero no coincide con la ruta hipotecaria recomendada para tu perfil.";
  }

  if (estadoCompra === "top_match") {
    if (property?.tipoEntrega === "construccion") {
      return "Proyecto compatible con tu perfil y tu ruta estimada";
    }

    return "Listo para compra inmediata";
  }

  if (estadoCompra === "entrada_viable_hipoteca_futura_viable") {
    return "Podrías completar la entrada durante la obra y luego aplicar a hipoteca";
  }

  if (estadoCompra === "entrada_viable_hipoteca_futura_debil") {
    return "Puedes entrar al proyecto, pero debes fortalecer tu perfil hipotecario";
  }

  if (estadoCompra === "entrada_no_viable") {
    return "La entrada todavía no se ajusta a tu capacidad";
  }

  if (
    estadoCompra === "ruta_cercana" &&
    evaluacionEntrada?.modalidadEntrada === "construccion" &&
    !evaluacionEntrada?.puedeSepararHoy &&
    (evaluacionEntrada?.puedeCompletarEntradaDuranteObra ||
      evaluacionEntrada?.puedeCubrirCuota)
  ) {
    return "Podrías completar la entrada durante la obra, pero hoy todavía te falta la reserva mínima";
  }

  if (!evaluacionHipotecaHoy?.viable && property?.tipoEntrega === "inmediata") {
    return "Fuera de rango hipotecario";
  }

  return "Ruta cercana";
}

function buildMatchBadge({ property, estadoCompra, evaluacionEntrada }) {
  if (estadoCompra === "credit_repair_needed") return "Revisar buró";

  if (estadoCompra === "fuera_de_reglas") return "No aplica";

  if (estadoCompra === "tipo_vivienda_no_preferido") {
    return "Alternativa nueva";
  }

  if (estadoCompra === "fuera_de_ruta_recomendada") {
    return "Otra ruta";
  }

  if (estadoCompra === "top_match") return "Top match";

  if (estadoCompra === "entrada_viable_hipoteca_futura_viable") {
    return "Ruta futura";
  }

  if (estadoCompra === "entrada_viable_hipoteca_futura_debil") {
    return "Ruta cercana";
  }

  if (
    estadoCompra === "ruta_cercana" &&
    evaluacionEntrada?.modalidadEntrada === "construccion" &&
    !evaluacionEntrada?.puedeSepararHoy &&
    (evaluacionEntrada?.puedeCompletarEntradaDuranteObra ||
      evaluacionEntrada?.puedeCubrirCuota)
  ) {
    return "Te falta reserva";
  }

  if (
    estadoCompra === "ruta_cercana" &&
    property?.tipoEntrega === "inmediata"
  ) {
    return "Fuera de rango";
  }

  if (estadoCompra === "ruta_cercana") {
    return "Ruta cercana";
  }

  if (estadoCompra === "entrada_no_viable") {
    return "Más entrada";
  }

  if (
    property?.tipoEntrega === "construccion" &&
    (evaluacionEntrada?.viableEntrada ||
      evaluacionEntrada?.puedeCompletarEntradaDuranteObra ||
      evaluacionEntrada?.puedeCubrirCuota)
  ) {
    return "Proyecto en obra";
  }

  return property?.matchBadge || "Buen fit";
}

function getEstadoRank(estadoCompra) {
  const map = {
    top_match: 1,
    entrada_viable_hipoteca_futura_viable: 2,
    entrada_viable_hipoteca_futura_debil: 3,
    ruta_cercana: 4,
    fuera_de_ruta_recomendada: 5,
    tipo_vivienda_no_preferido: 6,
    entrada_no_viable: 7,
    credit_repair_needed: 8,
    fuera_de_reglas: 9,
  };

  return map[estadoCompra] || 99;
}

export function matchPropertiesToProfile({
  ctx,
  mortgageResult,
  creditAssessment = null,
  readinessStatus = null,
  properties = mockProperties,
}) {
  const rankedMortgagesHoy = Array.isArray(mortgageResult?.rankedMortgages)
    ? mortgageResult.rankedMortgages
    : [];

  const creditBlocked = isCreditBlocked(creditAssessment, readinessStatus);

  const filteredByCity = properties.filter((property) =>
    cityMatches(property, ctx?.ciudadCompra)
  );

  const evaluated = filteredByCity
    .map((property) => {
      const reglasPropiedad = checkPropertyRules(property, ctx);

      const policyMatch = propertyMatchesStrictPolicy(property, mortgageResult);

      const mortgageCompatibleHoy = propertyAcceptsMortgage(
        property,
        rankedMortgagesHoy
      );

      const selectedMortgageHoy = selectBestMortgageForProperty(
        property,
        rankedMortgagesHoy
      );

      const evaluacionHipotecaHoyBase = buildHipotecaEvaluation(
        selectedMortgageHoy,
        property
      );

      const evaluacionHipotecaHoy = {
        ...evaluacionHipotecaHoyBase,
        compatibleConProducto: mortgageCompatibleHoy,
      };

      const financing = getProjectFinancing(property);

      const evaluacionEntrada = evaluarEntradaProyecto({
        precioVivienda: property?.precio,
        porcentajeEntradaRequerida: financing.downPaymentPct,
        entradaDisponibleHoy: ctx?.entradaDisponible ?? 0,
        capacidadEntradaMensual: ctx?.capacidadEntradaMensual ?? 0,
        tipoEntrega:
          property?.tipoEntrega ??
          (financing.monthsConstruction > 0 ? "construccion" : "inmediata"),
        permiteEntradaEnCuotas: financing.allowInstallments,
        mesesConstruccionRestantes: financing.monthsConstruction,
        reservaMinima: financing.reserveMin,
      });

      const evaluacionHipotecaFutura =
        evaluacionEntrada?.modalidadEntrada === "construccion"
          ? buildFutureMortgageEvaluation({ property, ctx, evaluacionEntrada })
          : null;

      const estadoCompra = computeEstadoCompra({
        reglasPropiedad,
        mortgageCompatibleHoy,
        evaluacionHipotecaHoy,
        evaluacionEntrada,
        evaluacionHipotecaFutura,
        property,
        ctx,
        creditAssessment,
        readinessStatus,
        policyMatch,
      });

      const viableProyecto =
        !creditBlocked &&
        (estadoCompra === "top_match" ||
          estadoCompra === "entrada_viable_hipoteca_futura_viable");

      const mortgageSelected =
        estadoCompra === "fuera_de_ruta_recomendada"
          ? null
          : estadoCompra === "top_match" && selectedMortgageHoy
          ? selectedMortgageHoy
          : evaluacionHipotecaFutura?.mortgageSelected ||
            selectedMortgageHoy ||
            null;

      return {
        ...property,
        financing,
        matchedProducts: getAllowedProductIds(property),
        evaluacionRutaRecomendada: policyMatch,
        evaluacionReglasPropiedad: reglasPropiedad,
        evaluacionHipotecaHoy,
        evaluacionHipotecaFutura,
        evaluacionEntrada,
        estadoCompra,
        viableProyecto,
        matchReasonCalculado: buildMatchReason({
          property,
          estadoCompra,
          evaluacionEntrada,
          evaluacionHipotecaHoy,
          creditAssessment,
        }),
        matchBadgeCalculado: buildMatchBadge({
          property,
          estadoCompra,
          evaluacionEntrada,
        }),
        mortgageSelected,
      };
    })
    .sort((a, b) => {
      const estadoA = getEstadoRank(a?.estadoCompra);
      const estadoB = getEstadoRank(b?.estadoCompra);

      if (estadoA !== estadoB) return estadoA - estadoB;

      const cuotaEntradaA = n(
        a?.evaluacionEntrada?.cuotaEntradaMensual,
        Number.MAX_SAFE_INTEGER
      );

      const cuotaEntradaB = n(
        b?.evaluacionEntrada?.cuotaEntradaMensual,
        Number.MAX_SAFE_INTEGER
      );

      if (cuotaEntradaA !== cuotaEntradaB) return cuotaEntradaA - cuotaEntradaB;

      const scoreFuturoA = n(a?.evaluacionHipotecaFutura?.score, 0);
      const scoreFuturoB = n(b?.evaluacionHipotecaFutura?.score, 0);

      if (scoreFuturoB !== scoreFuturoA) return scoreFuturoB - scoreFuturoA;

      const scoreHoyA = n(a?.evaluacionHipotecaHoy?.score, 0);
      const scoreHoyB = n(b?.evaluacionHipotecaHoy?.score, 0);

      if (scoreHoyB !== scoreHoyA) return scoreHoyB - scoreHoyA;

      return (
        n(a?.precio, Number.MAX_SAFE_INTEGER) -
        n(b?.precio, Number.MAX_SAFE_INTEGER)
      );
    });

  return evaluated;
}

export default matchPropertiesToProfile;