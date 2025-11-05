// src/lib/scoring.js
import { scoreHabitaLibre } from "./scoreHabitaLibre.js";

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
   Reglas mock de bancos (para afinidad rápida)
=========================================================== */
const BANK_RULES = [
  { id: "andino",   nombre: "Banco Andino",      ltvMax: 0.80, dtiMax: 0.40, minIngreso: 800, minEstabilidadMeses: 12, edadMin: 22, tasa: 0.105, plazos: [180, 240] },
  { id: "pacifico", nombre: "Banco Pacífico",    ltvMax: 0.90, dtiMax: 0.42, minIngreso: 900, minEstabilidadMeses: 12, edadMin: 21, tasa: 0.112, plazos: [240] },
  { id: "coopSA",   nombre: "Coop. Sierra Azul", ltvMax: 0.85, dtiMax: 0.40, minIngreso: 600, minEstabilidadMeses: 6,  edadMin: 21, tasa: 0.118, plazos: [120, 180] },
];

/* ===========================================================
   Parámetros VIS/VIP/BIESS (referenciales y consistentes)
=========================================================== */
const LIMITES = {
  VIS: {
    priceCap: 83660,
    incomeCap: 2070,
    firstHomeOnly: true,
    tasaAnual: 0.0488,
    plazoMeses: 240,
    ltvMax: 0.95,
    dtiMax: 0.45,
    ignoreCapacityPenalties: true,
  },
  VIP: {
    priceCap: 107630,
    incomeCap: 2900,
    firstHomeOnly: true,
    tasaAnual: 0.0499,
    plazoMeses: 300,
    ltvMax: 0.95,
    dtiMax: 0.45,
    ignoreCapacityPenalties: true,
  },
  BIESS_PREF: {
    priceCap: 107630,
    incomeCap: 2900,
    firstHomeOnly: true,
    requireIESS: true,
    requireContribs: true,
    tasaAnual: 0.0599,
    plazoMeses: 300,
    ltvMax: 0.95,
    dtiMax: 0.45,
    ignoreCapacityPenalties: true,
  },
  BIESS_STD: {
    priceCap: 460000,
    incomeCap: Infinity,
    firstHomeOnly: false,
    requireIESS: true,
    requireContribs: true,
    tasaAnual: 0.0699,
    plazoMeses: 300,
    ltvMax: 0.90,
    dtiMax: 0.45,
    ignoreCapacityPenalties: true,
  },
  COMERCIAL: {
    priceCap: Infinity,
    incomeCap: Infinity,
    firstHomeOnly: false,
    tasaAnual: 0.115,
    plazoMeses: 240,
    ltvMax: 0.85,
    dtiMax: 0.40,
    ignoreCapacityPenalties: false,
  },
};

// Requisitos mínimos BIESS (aportes)
const MIN_IESS_TOTALES = 36;   // meses
const MIN_IESS_CONSEC  = 13;   // meses

/* ===========================================================
   Motor principal
=========================================================== */
export function calcularPrecalificacion(input) {
  const {
    // Ingresos / deudas
    ingresoNetoMensual = 0,
    ingresoPareja = 0,
    otrasDeudasMensuales = 0,

    // Vivienda
    valorVivienda = 0,
    entradaDisponible = 0,

    // Perfil
    edad = 30,
    tipoIngreso = "Dependiente",
    aniosEstabilidad = 2,
    afiliadoIess = "No",
    tieneVivienda = false,
    declaracionBuro = "ninguno",
    estadoCivil, // opcional

    // Requisitos BIESS
    iessAportesTotales = 0,
    iessAportesConsecutivas = 0,
  } = input || {};

  /* ---- normalizaciones ---- */
  const afiliadoBool =
    typeof afiliadoIess === "string"
      ? afiliadoIess.toLowerCase().startsWith("s")
      : !!afiliadoIess;

  // dti base por afiliación (conservador si no)
  const dtiBase = afiliadoBool ? 0.40 : 0.35;

  // penalizadores suaves por tipo ingreso, estabilidad, edad
  const factorTipo =
    tipoIngreso === "Independiente" ? 0.85 :
    tipoIngreso === "Mixto"         ? 0.92 : 1.0;

  const factorEstab =
    n(aniosEstabilidad) >= 3 ? 1.0 :
    n(aniosEstabilidad) >= 1 ? 0.95 : 0.90;

  const factorEdad = (n(edad) < 23 || n(edad) > 60) ? 0.95 : 1.0;

  const factorCapacidad = Math.max(0.75, factorTipo * factorEstab * factorEdad);

  // ingreso familiar (sumamos por compatibilidad)
  const ingresoTotal = n(ingresoNetoMensual) + n(ingresoPareja);
  const ingresoDisponible = Math.max(0, ingresoTotal - n(otrasDeudasMensuales));

  // capacidad genérica (para comparativas generales)
  const capacidadPago = Math.max(0, ingresoDisponible * dtiBase * factorCapacidad);

  /* ===========================================================
     Evaluador genérico por producto/programa
  ========================================================== */
  function evaluarProducto(prodCfg) {
    const {
      label,
      tasaAnual, plazoMeses, ltvMax, priceCap,
      incomeCap = Infinity, firstHomeOnly = false,
      requireIESS = false, requireContribs = false,
      dtiMax, ignoreCapacityPenalties = false,
    } = prodCfg;

    // “Gatekeepers” normativos
    const dentroIngreso      = n(ingresoTotal) <= n(incomeCap, Infinity) + 1e-9;
    const primeraViviendaOK  = firstHomeOnly ? !tieneVivienda : true;
    const iessOK             = requireIESS ? afiliadoBool : true;
    const aportesOK          = requireContribs
      ? (n(iessAportesTotales) >= MIN_IESS_TOTALES &&
         n(iessAportesConsecutivas) >= MIN_IESS_CONSEC)
      : true;

    const rate = n(tasaAnual) / 12;

    // Capacidad específica del producto
    const factorCapProd = ignoreCapacityPenalties ? 1.0 : factorCapacidad;
    const dtiToUse = (typeof dtiMax === "number" && dtiMax > 0) ? dtiMax : dtiBase;

    const cuotaMaxProducto  = Math.max(0, ingresoDisponible * dtiToUse * factorCapProd);
    const montoMaxPorCuota  = pvFromPayment(rate, n(plazoMeses), cuotaMaxProducto);

    // Topes para “precio máximo de vivienda”
    const precioPorCapacidad = n(entradaDisponible) + n(montoMaxPorCuota);
    const precioPorLtv       = (1 - n(ltvMax)) > 0
      ? n(entradaDisponible) / (1 - n(ltvMax))
      : Infinity;
    const precioPorTope      = priceCap ?? Infinity;

    const precioMaxVivienda  = Math.min(precioPorCapacidad, precioPorLtv, precioPorTope);
    let binding = "capacidad";
    if (precioMaxVivienda === precioPorLtv) binding = "ltv";
    if (precioMaxVivienda === precioPorTope) binding = "tope";

    // Caso actual (con valor ingresado)
    const montoNecesario = Math.max(0, n(valorVivienda) - n(entradaDisponible));
    const ltv = n(valorVivienda) > 0 ? (montoNecesario / n(valorVivienda)) : 0;

    // El banco no prestará por encima de tu capacidad (para este producto)
    const montoPrestamo = Math.max(0, Math.min(montoNecesario, n(montoMaxPorCuota)));

    const cuota       = pmt(rate, n(plazoMeses), montoPrestamo);
    const cuotaStress = pmt((n(tasaAnual) + 0.02) / 12, n(plazoMeses), montoPrestamo);

    const dentroPrecio     = n(valorVivienda) <= n(priceCap, Infinity);
    const dentroLtv        = ltv <= n(ltvMax) + 1e-9;
    const dentroCapacidad  = cuota <= cuotaMaxProducto + 1e-9;

    const viable = !!(
      dentroIngreso &&
      primeraViviendaOK &&
      iessOK &&
      aportesOK &&
      dentroPrecio &&
      dentroLtv &&
      dentroCapacidad
    );

    return {
      producto: label || "—",
      tasaAnual: n(tasaAnual),
      plazoMeses: n(plazoMeses),
      ltvMax: n(ltvMax),
      priceCap,
      incomeCap,
      montoPrestamo,
      cuota,
      cuotaStress,
      ltv,
      precioMaxVivienda,
      flags: {
        dentroIngreso, primeraViviendaOK, iessOK, aportesOK,
        dentroPrecio, dentroLtv, dentroCapacidad
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

  /* ===========================================================
     Construcción/evaluación de productos
  ========================================================== */
  const PROD_VIS         = { label: "VIS",                 ...LIMITES.VIS };
  const PROD_VIP         = { label: "VIP",                 ...LIMITES.VIP };
  const PROD_BIESS_PREF  = { label: "BIESS preferencial",  ...LIMITES.BIESS_PREF };
  const PROD_BIESS_STD   = { label: "BIESS",               ...LIMITES.BIESS_STD };
  const PROD_COM         = { label: "Comercial",           ...LIMITES.COMERCIAL };

  const evalVIS    = evaluarProducto(PROD_VIS);
  const evalVIP    = evaluarProducto(PROD_VIP);
  const evalBPREF  = evaluarProducto(PROD_BIESS_PREF);
  const evalBSTD   = evaluarProducto(PROD_BIESS_STD);
  const evalCOM    = evaluarProducto(PROD_COM);

  // Selección priorizada: VIS > VIP > BIESS pref > BIESS std > Comercial
  let escenarioElegido = evalCOM;
  if (evalVIS.viable)        escenarioElegido = evalVIS;
  else if (evalVIP.viable)   escenarioElegido = evalVIP;
  else if (evalBPREF.viable) escenarioElegido = evalBPREF;
  else if (evalBSTD.viable)  escenarioElegido = evalBSTD;

  /* ===========================================================
     Métricas globales / riesgo
  ========================================================== */
  const dtiSinHipoteca = ingresoTotal > 0
    ? (n(otrasDeudasMensuales) / ingresoTotal)
    : 0;

  const dtiConHipoteca = ingresoTotal > 0
    ? ((n(otrasDeudasMensuales) + n(escenarioElegido.cuota)) / ingresoTotal)
    : 0;

  const reqDown80 = clamp((n(valorVivienda) * 0.20) - n(entradaDisponible), 0, Number.POSITIVE_INFINITY);
  const reqDown90 = clamp((n(valorVivienda) * 0.10) - n(entradaDisponible), 0, Number.POSITIVE_INFINITY);

  // Riesgo/score HL (simple + tu scoreHabitaLibre)
  let riesgoScore = 100;
  const ratioEntrada = (n(valorVivienda) > 0) ? (n(entradaDisponible) / n(valorVivienda)) : 0;
  if (dtiConHipoteca > 0.45) riesgoScore -= 25;
  if (ratioEntrada < 0.10)   riesgoScore -= 20;
  if (tipoIngreso === "Independiente") riesgoScore -= 10;
  if (n(aniosEstabilidad) < 1)  riesgoScore -= 15;
  if (n(edad) < 25 || n(edad) > 60) riesgoScore -= 10;
  if (declaracionBuro === "regularizado") riesgoScore -= 15;
  if (declaracionBuro === "mora")        riesgoScore -= 35;

  const riesgoHabitaLibre =
    riesgoScore >= 80 ? "bajo" :
    riesgoScore >= 60 ? "medio" : "alto";

  const puntajeHabitaLibre = scoreHabitaLibre({
    dtiConHipoteca,
    ltv: escenarioElegido.ltv,
    aniosEstabilidad: n(aniosEstabilidad),
    edad: n(edad),
    tipoIngreso,
    declaracionBuro,
  });

  /* ===========================================================
     Enriquecimiento educativo/accionable
  ========================================================== */

  // 1) Score por bandas (para UI/PDF)
  const bandas = {
    ltv: clamp(100 - (escenarioElegido.ltv * 100), 0, 100), // más bajo LTV, mejor
    dti: clamp(100 - (dtiConHipoteca * 100), 0, 100),       // más bajo DTI, mejor
    estabilidad: clamp((n(aniosEstabilidad) / 5) * 100, 0, 100),
    historial: declaracionBuro === "mora" ? 20 : (declaracionBuro === "regularizado" ? 60 : 90),
  };
  const scoreHLtotal = Math.round(
    0.35 * bandas.ltv +
    0.35 * bandas.dti +
    0.15 * bandas.estabilidad +
    0.15 * bandas.historial
  );

  // 2) Stress test
  const stressTest = {
    tasaBase: n(escenarioElegido.tasaAnual),
    tasaStress: n(escenarioElegido.tasaAnual) + 0.02,
    cuotaBase: n(escenarioElegido.cuota),
    cuotaStress: n(escenarioElegido.cuotaStress),
    bufferRecomendado: 0.10, // 10% de margen prudente
  };

  // 3) Costos y TCEA (aprox)
  // TODO: afinar por banco. Por ahora: originación 1.0% (cap 1.200), avalúo 180, seguros 0.15% anual del valor.
  const costos = (() => {
    const monto = n(escenarioElegido.montoPrestamo);
    const originacion = Math.min(monto * 0.010, 1200);
    const avaluo = 180;
    const segurosAnuales = n(valorVivienda) * 0.0015;
    const costosTotales = originacion + avaluo + segurosAnuales;
    const tcea = n(escenarioElegido.tasaAnual) + (monto > 0 ? (costosTotales / monto) / (n(escenarioElegido.plazoMeses) / 12) : 0);
    return {
      originacion, avaluo, segurosAnuales, tcea
    };
  })();

  // 4) Matriz de opciones (resumen limpio para PDF)
  const opciones = {
    VIP:   { viable: evalVIP.viable,   tasa: evalVIP.tasaAnual,   plazo: evalVIP.plazoMeses,   cuota: evalVIP.cuota,   ltvMax: evalVIP.ltvMax },
    VIS:   { viable: evalVIS.viable,   tasa: evalVIS.tasaAnual,   plazo: evalVIS.plazoMeses,   cuota: evalVIS.cuota,   ltvMax: evalVIS.ltvMax },
    BIESS: { viable: evalBSTD.viable || evalBPREF.viable, tasa: (evalBPREF.viable ? evalBPREF.tasaAnual : evalBSTD.tasaAnual), plazo: (evalBPREF.viable ? evalBPREF.plazoMeses : evalBSTD.plazoMeses), cuota: (evalBPREF.viable ? evalBPREF.cuota : evalBSTD.cuota), ltvMax: (evalBPREF.viable ? evalBPREF.ltvMax : evalBSTD.ltvMax) },
    Privada:{ viable: evalCOM.viable,  tasa: evalCOM.tasaAnual,   plazo: evalCOM.plazoMeses,   cuota: evalCOM.cuota,   ltvMax: evalCOM.ltvMax },
  };

  // 5) Checklist educativo
  const checklist = {
    documentos: [
      "Cédula y papeleta de votación",
      "Historial de aportes IESS (últimos 24 meses)",
      tipoIngreso === "Dependiente" ? "Últimos 3 roles de pago" : "RUC + declaraciones 12 meses",
      "Extractos bancarios últimos 3 meses",
      "Proforma/Promesa de compraventa del inmueble (si aplica)"
    ],
    requisitos: [
      "DTI objetivo ≤ 42%",
      "LTV objetivo ≤ 85% para mejores condiciones (ideal ≤ 80%)",
      "Antigüedad laboral ≥ 12 meses (dependiente) / 24 meses (independiente)"
    ]
  };

  // 6) Plan de acción (personalizado)
  const accionesClave = [];
  if (dtiConHipoteca > 0.42) {
    const gapUSD = Math.ceil((dtiConHipoteca - 0.42) * ingresoTotal);
    accionesClave.push(`Reduce deudas por ~${gapUSD.toLocaleString("es-EC")} USD para llevar tu DTI ≤ 42%.`);
  }
  if (escenarioElegido.ltv > 0.90) {
    const extraDown = Math.ceil((escenarioElegido.ltv - 0.90) * n(valorVivienda));
    accionesClave.push(`Aumenta entrada en ~${extraDown.toLocaleString("es-EC")} USD para LTV ≤ 90%.`);
  } else if (escenarioElegido.ltv > 0.80) {
    const extraDown = Math.ceil((escenarioElegido.ltv - 0.80) * n(valorVivienda));
    accionesClave.push(`Eleva la entrada ~${extraDown.toLocaleString("es-EC")} USD para LTV ≤ 80% (mejor tasa/TCEA).`);
  }
  if (!accionesClave.length) {
    accionesClave.push("Perfil sólido. Solicita preaprobación en 2–3 entidades y compara TCEA, no solo tasa.");
  }

  // 7) Benchmark (3 “ofertas tipo” sin marca, para educar)
  const benchVIP = { nombre: "Opción A (VIP)",    tasa: 0.0499, plazo: 300 };
  const benchPRI = { nombre: "Opción B (Privada)", tasa: 0.0990, plazo: 240 };
  const benchBIE = { nombre: "Opción C (BIESS)",   tasa: 0.0690, plazo: 240 };
  const loan = n(escenarioElegido.montoPrestamo);
  const mkCuota = (t, p) => pmt(t/12, p, loan);
  // TCEA aprox con mismos costos (para ejemplo)
  const mkTCEA = (t) => t + (loan > 0 ? ((costos.originacion + costos.avaluo + costos.segurosAnuales) / loan) / (n(escenarioElegido.plazoMeses)/12) : 0);

  const benchmark = [
    { ...benchVIP, cuota: mkCuota(benchVIP.tasa, benchVIP.plazo), tcea: mkTCEA(benchVIP.tasa) },
    { ...benchPRI, cuota: mkCuota(benchPRI.tasa, benchPRI.plazo), tcea: mkTCEA(benchPRI.tasa) },
    { ...benchBIE, cuota: mkCuota(benchBIE.tasa, benchBIE.plazo), tcea: mkTCEA(benchBIE.tasa) },
  ];

  /* ===========================================================
     Etiquetas de perfil (compat)
  ========================================================== */
  let perfilLabel = "Ajustar datos";
  if (evalVIS.viable)         perfilLabel = "VIS viable";
  else if (evalVIP.viable)    perfilLabel = "VIP viable";
  else if (evalBPREF.viable)  perfilLabel = "BIESS preferencial viable";
  else if (evalBSTD.viable)   perfilLabel = "BIESS viable";
  else if (evalCOM.viable)    perfilLabel = "Comercial viable";

  /* ===========================================================
     Respuesta estructurada (con compatibilidad)
  ========================================================== */
  const evalBIESS_ALIAS = evalBPREF.viable ? evalBPREF : evalBSTD;

  return {
    ok: true,

    // Vivienda / entrada
    entradaDisponible: n(entradaDisponible),
    valorVivienda: n(valorVivienda),

    // Capacidad global
    capacidadPago: n(capacidadPago),

    // Métricas del escenario elegido (COMPAT)
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
    productoElegido: escenarioElegido.producto,
    requeridos: { downTo80: n(reqDown80), downTo90: n(reqDown90) },

    // Perfil (COMPAT)
    perfil: {
      label: perfilLabel,
      edad: n(edad),
      tipoIngreso,
      aniosEstabilidad: n(aniosEstabilidad),
      afiliadoIess: afiliadoBool ? "Sí" : "No",
      ingresoTotal: n(ingresoTotal),
      tieneVivienda: !!tieneVivienda,
      estadoCivil: estadoCivil || null,
      iessAportesTotales: n(iessAportesTotales),
      iessAportesConsecutivas: n(iessAportesConsecutivas),
    },

    // Escenarios comparativos (COMPAT + detalle)
    escenarios: {
      vis: evalVIS,
      vip: evalVIP,
      biess: evalBIESS_ALIAS,     // alias para UI actual
      biess_pref: evalBPREF,
      biess_std: evalBSTD,
      comercial: evalCOM,
    },

    // Riesgos / puntaje (COMPAT + enriquecido)
    riesgoHabitaLibre,
    puntajeHabitaLibre, // tu función externa

    // ⭐ NUEVO: score interno por bandas
    scoreHL: { total: scoreHLtotal, bandas },

    // ⭐ NUEVO: stress test explícito
    stressTest,

    // ⭐ NUEVO: costos + TCEA aprox
    costos,

    // ⭐ NUEVO: matriz limpia de opciones
    opciones,

    // ⭐ NUEVO: checklist educativo
    checklist,

    // ⭐ NUEVO: plan de acción
    accionesClave,

    // ⭐ NUEVO: comparador simple
    benchmark,
  };
}

/* ===========================================================
   Afinidad básica con bancos mock (se mantiene)
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
export { BANK_RULES };
