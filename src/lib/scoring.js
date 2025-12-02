// src/lib/scoring.js
// 👇 Import default
import scoreHabitaLibre from "./scoreHabitaLibre.js";

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
   Reglas mock de bancos (para afinidad rápida legacy)
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
   (basado en info de tu analista)
=========================================================== */
const BANK_PROFILES = [
  // VIP / VIS bancos privados
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

  // BIESS
  {
    id: "biess",
    nombre: "BIESS",
    tipo: "BIESS",
    dtiMaxDependiente: 0.4,
    dtiMaxIndependiente: 0.4,
    ltvMax: 0.95,
    requiereIESS: true,
    requiereAportes: true,
    tasaRef: 0.0599, // se ajusta internamente en el producto, aquí es referencial
    minAniosEstDep: 1,
    minAniosRucInd: 2,
  },

  // Bancos / IFIs con tasa normal
  {
    id: "produbanco_normal",
    nombre: "Produbanco (normal)",
    tipo: "NORMAL",
    dtiMaxDependiente: 0.45,
    dtiMaxIndependiente: 0.45,
    ltvMaxAAA: 0.8, // si cliente es bueno en buró
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
   Parámetros VIS/VIP/BIESS (referenciales y consistentes)
   ⬇️ Ahora incluyen minIngreso y BIESS escalonado
   ⬇️ Y rangos de plazo en AÑOS (para que el usuario juegue)
=========================================================== */
const LIMITES = {
  VIS: {
    priceCap: 83660,
    incomeCap: 2070,
    minIngreso: 600,
    firstHomeOnly: true,
    requireNewBuild: true, // vivienda por estrenar
    tasaAnual: 0.0499,
    plazoMeses: 240, // default: 20 años
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
    requireNewBuild: true, // vivienda por estrenar
    tasaAnual: 0.0499,
    plazoMeses: 300, // default: 25 años
    plazoMinAnios: 5,
    plazoMaxAnios: 25,
    ltvMax: 0.95,
    dtiMax: 0.45,
    ignoreCapacityPenalties: true,
  },
  // BIESS VIP / preferencial
  BIESS_PREF: {
    priceCap: 107630,
    incomeCap: 2900,
    minIngreso: 700,
    firstHomeOnly: true,
    requireNewBuild: true,
    requireIESS: true,
    requireContribs: true,
    tasaAnual: 0.0599,
    plazoMeses: 300, // default: 25 años
    plazoMinAnios: 5,
    plazoMaxAnios: 25,
    ltvMax: 0.95,
    dtiMax: 0.45,
    ignoreCapacityPenalties: true,
  },
  // BIESS estándar (con tabla de tasas por monto)
  BIESS_STD: {
    priceCap: 460000,
    incomeCap: Infinity,
    minIngreso: 700,
    firstHomeOnly: false,
    requireIESS: true,
    requireContribs: true,
    // tasaAnual base (para el primer tramo, <= 90k)
    tasaAnual: 0.0699,
    plazoMeses: 300, // default: 25 años
    plazoMinAnios: 5,
    plazoMaxAnios: 25,
    ltvMax: 0.9,
    dtiMax: 0.45,
    ignoreCapacityPenalties: true,
    // 👇 flag para usar tabla escalonada de tasas
    tieredStdBiess: true,
  },

  COMERCIAL: {
    priceCap: Infinity,
    incomeCap: Infinity,
    minIngreso: 800,
    firstHomeOnly: false,
    tasaAnual: 0.075,
    plazoMeses: 240, // default: 20 años
    plazoMinAnios: 5,
    plazoMaxAnios: 25,
    ltvMax: 0.85,
    dtiMax: 0.4,
    ignoreCapacityPenalties: false,
  },
};

// Requisitos mínimos BIESS (aportes)
const MIN_IESS_TOTALES = 36; // meses
const MIN_IESS_CONSEC = 13; // meses

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

    // 👇 Si el front manda "tieneVivienda" o "primeraVivienda"
    tieneVivienda = false,
    declaracionBuro = "ninguno",
    estadoCivil, // opcional
    nacionalidad = "ecuatoriana",

    // 👇 nuevo: cómo sustenta ingresos (solo independiente/mixto)
    sustentoIndependiente = null,

    // 👇 NUEVO: flags extra de vivienda (si vienen del front)
    // primeraVivienda: "Sí" / "No" / true / false
    primeraVivienda = null,
    // viviendaUsada: true/false o "usada"/"nueva"
    viviendaUsada = null,
    // viviendaEstrenar: true = por estrenar, false = no
    viviendaEstrenar = true,

    // Requisitos BIESS
    iessAportesTotales = 0,
    iessAportesConsecutivos = 0,

    // 🔹 NUEVO: plazo elegido por el usuario (en AÑOS, opcional)
    plazoAnios = null,
  } = input || {};

  // ===========================================================
  //  Validación global de sustento de ingresos
  //  - Dependiente  → siempre OK
  //  - Independiente/Mixto → requiere algún sustento claro
  // ===========================================================
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

  /* ---- normalizaciones ---- */
  const afiliadoBool =
    typeof afiliadoIess === "string"
      ? afiliadoIess.toLowerCase().startsWith("s")
      : !!afiliadoIess;

  const esExtranjero =
    typeof nacionalidad === "string"
      ? nacionalidad.trim().toLowerCase() !== "ecuatoriana"
      : false;

  // ================= NORMALIZACIÓN VIVIENDA =================
  // 1) ¿Es primera vivienda?
  const primeraViviendaBool =
    primeraVivienda === null || primeraVivienda === undefined
      ? null
      : typeof primeraVivienda === "string"
      ? primeraVivienda.trim().toLowerCase().startsWith("s") // "sí"
      : !!primeraVivienda;

  // Normalizamos tieneVivienda si viene como string
  const tieneViviendaBoolRaw =
    typeof tieneVivienda === "string"
      ? /si|sí|true|1/i.test(tieneVivienda)
      : !!tieneVivienda;

  // Regla:
  // - Si explícitamente NOS dicen "no es primera vivienda" → asumimos que YA tiene vivienda
  // - Si no nos dicen nada, usamos el campo tieneVivienda normalizado
  const tieneViviendaBool =
    primeraViviendaBool === null ? tieneViviendaBoolRaw : !primeraViviendaBool;

  // 2) ¿Es vivienda usada o por estrenar?
  const viviendaUsadaBool =
    typeof viviendaUsada === "string"
      ? /usada|segunda/i.test(viviendaUsada.trim().toLowerCase())
      : !!viviendaUsada;

  // Si nos dicen explícitamente "usada", forzamos estrenar = false
  const viviendaNuevaBool =
    viviendaUsadaBool
      ? false
      : typeof viviendaEstrenar === "boolean"
      ? viviendaEstrenar
      : true;
  // ==========================================================

  // 
  // dti base general (NO penalizamos IESS)
const dtiBase = 0.40;



  // normalizamos años de estabilidad
  const aniosEstNum = n(aniosEstabilidad);

  // penalizadores por tipo de ingreso
  const factorTipo =
    tipoIngreso === "Independiente"
      ? 0.85
      : tipoIngreso === "Mixto"
      ? 0.92
      : 1.0;

  // ⚠️ penalizamos fuerte cuando la estabilidad es baja
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

  // límite inferior más duro para no sobre-precalificar
  const factorCapacidad = Math.max(0.55, factorTipo * factorEstab * factorEdad);

  // ingreso familiar (sumamos por compatibilidad)
  const ingresoTotal = n(ingresoNetoMensual) + n(ingresoPareja);
  const ingresoDisponible = Math.max(0, ingresoTotal - n(otrasDeudasMensuales));

  // capacidad genérica (para comparativas generales)
  const capacidadPago = Math.max(
    0,
    ingresoDisponible * dtiBase * factorCapacidad
  );

  /* ===========================================================
     Evaluador genérico por producto/programa
     ⬇️ AHORA USA EL PLAZO ELEGIDO POR EL USUARIO (plazoAnios)
  ========================================================== */
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
      // 👇 nuevo flag para BIESS estándar escalonado
      tieredStdBiess = false,
      // 👇 nuevos rangos de plazo por producto (en AÑOS)
      plazoMinAnios,
      plazoMaxAnios,
    } = prodCfg;

    // “Gatekeepers” normativos
    const dentroIngreso =
      ingresoTotal >= n(minIngreso) &&
      ingresoTotal <= n(incomeCap, Infinity) + 1e-9;

    const primeraViviendaOK = firstHomeOnly ? !tieneViviendaBool : true;
    const iessOK = requireIESS ? afiliadoBool : true;
    const aportesOK = requireContribs
      ? n(iessAportesTotales) >= MIN_IESS_TOTALES &&
        n(iessAportesConsecutivos) >= MIN_IESS_CONSEC
      : true;

    // Si el producto requiere vivienda nueva (VIS/VIP/BIESS pref),
    // bloqueamos automáticamente inmuebles usados.
    const viviendaNuevaOK = requireNewBuild ? !!viviendaNuevaBool : true;

    // ============= LÍMITE DE EDAD AL VENCIMIENTO =============
    // Regla simple: edad al final del crédito ≤ 75 años
    const edadNum = n(edad);

    // Rango de plazo del producto en años (con defaults)
    const minAniosProd = n(plazoMinAnios, 5);
    const maxAniosProd = n(plazoMaxAnios, 25);

    // 1) Determinamos el plazo ORIGINAL en función del usuario o del default
    let plazoOriginalMeses = n(plazoMeses);

    if (plazoAniosUsuario != null) {
      // El usuario elige el plazo → lo limitamos al rango del producto
      const plazoUserAnios = clamp(
        n(plazoAniosUsuario),
        minAniosProd,
        maxAniosProd
      );
      plazoOriginalMeses = plazoUserAnios * 12;
    } else {
      // Si no hay plazo de usuario y el producto no define plazoMeses, usamos 20 años dentro del rango
      if (!plazoOriginalMeses) {
        const defaultAnios = clamp(20, minAniosProd, maxAniosProd);
        plazoOriginalMeses = defaultAnios * 12;
      }
    }

    const maxPlazoPorEdadMeses = Math.max(0, (75 - edadNum) * 12);

    // Plazo que realmente se puede usar en función de la edad
    const plazoEfectivo = Math.min(plazoOriginalMeses, maxPlazoPorEdadMeses);

    // Si ya no hay plazo útil (o edad >= 75), el producto se considera no viable
    const edadOK = plazoEfectivo > 0;
    // ==========================================================

    // Monto que realmente se quiere pedir (según vivienda y entrada)
    const montoNecesario = Math.max(0, n(valorVivienda) - n(entradaDisponible));

    // ===== TASA EFECTIVA ANUAL DEL PRODUCTO =====
    let tasaEfectivaAnual = n(tasaAnual);

    // Si es BIESS estándar, aplicamos tabla escalonada por montoNecesario
    if (tieredStdBiess) {
      const loan = n(montoNecesario);

      if (loan <= 90000) {
        // Hasta 90k → 6,99%
        tasaEfectivaAnual = 0.0699;
      } else if (loan <= 130000) {
        // 90k–130k → 8,90%
        tasaEfectivaAnual = 0.089;
      } else if (loan <= 200000) {
        // 130k–200k → 9,00%
        tasaEfectivaAnual = 0.09;
      } else {
        // 200k–460k → 9,10%
        tasaEfectivaAnual = 0.091;
      }
    }

    const rate = tasaEfectivaAnual / 12;

    // Capacidad específica del producto
    const factorCapProd = ignoreCapacityPenalties ? 1.0 : factorCapacidad;
    const dtiToUse =
      typeof dtiMax === "number" && dtiMax > 0 ? dtiMax : dtiBase;

    const cuotaMaxProducto = Math.max(
      0,
      ingresoDisponible * dtiToUse * factorCapProd
    );

    // 👇 usamos plazoEfectivo en lugar de plazoOriginalMeses
    const montoMaxPorCuota = pvFromPayment(
      rate,
      plazoEfectivo,
      cuotaMaxProducto
    );

    // Topes para “precio máximo de vivienda”
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

    // LTV real con el monto que se quiere pedir
    const ltv =
      n(valorVivienda) > 0 ? montoNecesario / n(valorVivienda) : 0;

    // El banco no prestará por encima de tu capacidad (para este producto)
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

    // 👇 Aquí es donde se respeta el tope VIS/VIP por valor de vivienda
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
      edadOK // 👈 ahora también depende de la edad
    );

    return {
      producto: label || "—",
      tasaAnual: tasaEfectivaAnual,
      plazoMeses: plazoEfectivo, // 👈 devolvemos el plazo ya ajustado
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

  /* ===========================================================
     Construcción/evaluación de productos
  ========================================================== */
  const PROD_VIS = { label: "VIS", ...LIMITES.VIS };
  const PROD_VIP = { label: "VIP", ...LIMITES.VIP };
  const PROD_BIESS_PREF = {
    label: "BIESS preferencial",
    ...LIMITES.BIESS_PREF,
  }; // BIESS VIP
  const PROD_BIESS_STD = { label: "BIESS", ...LIMITES.BIESS_STD };
  const PROD_COM = { label: "Comercial", ...LIMITES.COMERCIAL };

  // 👇 ahora evaluamos cada producto usando el mismo plazoAnios pedido
  const evalVIS = evaluarProducto(PROD_VIS, plazoAnios);
  const evalVIP = evaluarProducto(PROD_VIP, plazoAnios);
  const evalBPREF = evaluarProducto(PROD_BIESS_PREF, plazoAnios);
  const evalBSTD = evaluarProducto(PROD_BIESS_STD, plazoAnios);
  const evalCOM = evaluarProducto(PROD_COM, plazoAnios);

  // Selección priorizada: VIS > VIP > BIESS pref > BIESS std > Comercial
  let escenarioElegido = evalCOM;
  if (evalVIS.viable) escenarioElegido = evalVIS;
  else if (evalVIP.viable) escenarioElegido = evalVIP;
  else if (evalBPREF.viable) escenarioElegido = evalBPREF;
  else if (evalBSTD.viable) escenarioElegido = evalBSTD;

  // 🔒 Viabilidad básica (solo por reglas de cada producto)
  const hayViableBasico =
    evalVIS.viable ||
    evalVIP.viable ||
    evalBPREF.viable ||
    evalBSTD.viable ||
    evalCOM.viable;

  // 🔒 Freno de mano global:
  // Si es Independiente/Mixto y NO tiene sustentoOKGlobal, se fuerza "sin oferta viable"
  const sinSustentoCritico =
    (tipoIngreso === "Independiente" || tipoIngreso === "Mixto") &&
    !sustentoOKGlobal;

  const hayViableFinal = hayViableBasico && !sinSustentoCritico;

  // ❌ No matamos los montos, solo cambiamos el label
  if (!hayViableFinal) {
    escenarioElegido = {
      ...escenarioElegido,
      producto: "Sin oferta viable hoy",
      viable: false,
    };
  }

  // 👇 Flag global para el front (A4/A5 + PDF)
  const sinOferta = !hayViableFinal;

  /* ===========================================================
     Métricas globales / riesgo
  ========================================================== */
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

  // Riesgo/score HL (simple legacy)
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

  // tipo de crédito para scoreHabitaLibre
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

  /* ===========================================================
     Enriquecimiento educativo/accionable
  ========================================================== */

  // 1) Score por bandas (para UI/PDF)
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

  // 2) Stress test
  const stressTest = {
    tasaBase: n(escenarioElegido.tasaAnual),
    tasaStress: n(escenarioElegido.tasaAnual) + 0.02,
    cuotaBase: n(escenarioElegido.cuota),
    cuotaStress: n(escenarioElegido.cuotaStress),
    bufferRecomendado: 0.1,
  };

  // 3) Costos y TCEA (aprox)
  const costos = (() => {
    const monto = n(escenarioElegido.montoPrestamo);
    const originacion = Math.min(monto * 0.01, 1200);
    const avaluo = 180;
    const segurosAnuales = n(valorVivienda) * 0.0015;
    const costosTotales = originacion + avaluo + segurosAnuales;
    const tcea =
      n(escenarioElegido.tasaAnual) +
      (monto > 0
        ? (costosTotales / monto) /
          (n(escenarioElegido.plazoMeses) / 12)
        : 0);
    return {
      originacion,
      avaluo,
      segurosAnuales,
      tcea,
    };
  })();

  // 4) Matriz de opciones (resumen limpio para PDF)
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
      plazo: evalBPREF.viable
        ? evalBPREF.plazoMeses
        : evalBSTD.plazoMeses,
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

  // 5) Checklist educativo
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

  // 6) Plan de acción (dinámico y coherente con los datos)
  const accionesClave = [];
  const ingresoNum = n(ingresoTotal);
  const ingresoFmt = Math.round(ingresoNum).toLocaleString("es-EC", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  if (!hayViableFinal) {
    // 🔴 Perfil en construcción: foco en volverlo viable

    // DTI alto → reducir deudas
    if (dtiConHipoteca > 0.42 && ingresoNum > 0) {
      const gapUSD = Math.ceil((dtiConHipoteca - 0.42) * ingresoNum);
      accionesClave.push(
        `Reduce deudas de consumo por aproximadamente $ ${gapUSD.toLocaleString(
          "es-EC",
          { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        )} para llevar tu DTI total por debajo de 42%.`
      );
    }

    // LTV muy alto → aumentar entrada
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

    // Ingreso objetivo SOLO cuando el cuello es ingreso bajo
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
    // 🟢 Perfil ya viable: foco en optimizar condiciones

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

  // 7) Benchmark (3 “ofertas tipo” sin marca, para educar)
  const benchVIP = { nombre: "Opción A (VIP)", tasa: 0.0499, plazo: 300 };
  const benchPRI = { nombre: "Opción B (Privada)", tasa: 0.099, plazo: 240 };
  const benchBIE = { nombre: "Opción C (BIESS)", tasa: 0.069, plazo: 240 };
  const loan = n(escenarioElegido.montoPrestamo);
  const mkCuota = (t, p) => pmt(t / 12, p, loan);
  const mkTCEA = (t) =>
    t +
    (loan > 0
      ? ((costos.originacion + costos.avaluo + costos.segurosAnuales) /
          loan) /
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

  /* ===========================================================
     Etiquetas de perfil (compat)
  ========================================================== */
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

  // 🚧 Si la estabilidad es menor a 1 año, lo marcamos explícitamente
  if (aniosEstNum < 1) {
    perfilLabel = "Perfil en construcción (falta estabilidad)";
  }

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

    // 👇 Flags globales para el front + PDF
    flags: {
      sinOferta,
      sinSustento: sinSustentoCritico,
    },

    // Perfil
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

    // Escenarios comparativos
    escenarios: {
      vis: evalVIS,
      vip: evalVIP,
      biess: evalBIESS_ALIAS,
      biess_pref: evalBPREF,
      biess_std: evalBSTD,
      comercial: evalCOM,
    },

    // Riesgos / puntaje
    riesgoHabitaLibre,
    puntajeHabitaLibre,

    // Score interno por bandas
    scoreHL: { total: scoreHLtotal, bandas },

    // Stress test explícito
    stressTest,

    // Costos + TCEA aprox
    costos,

    // Matriz limpia de opciones
    opciones,

    // Checklist educativo
    checklist,

    // Plan de acción (simple, el PDF lo refina)
    accionesClave,

    // Comparador simple
    benchmark,
  };
}

/* ===========================================================
   Probabilidad de aprobación por banco (nuevo)
=========================================================== */
export function evaluarProbabilidadPorBanco(input) {
  // Usamos el motor principal como base
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
  } = base;

  const {
    ingresoTotal = 0,
    aniosEstabilidad = 0,
    tipoIngreso,
    afiliadoIess,
    iessAportesTotales = 0,
    iessAportesConsecutivos = 0,
  } = perfil || {};

  // Historial de buró lo tomamos del input directamente
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

    // DTI máximo según tipo de ingreso
    const dtiMax =
      tipoIngreso === "Dependiente"
        ? n(dtiMaxDependiente, 0.4)
        : n(dtiMaxIndependiente, 0.4);

    const cuotaMaxBanco = ingresoDisponible * dtiMax;

    // Tasa y cuota necesaria para este banco
    const tasaAnualBanco = n(tasaRef, tasaAnualBase);
    const tasaMesBanco = tasaAnualBanco / 12;

    const montoPrestamo = montoPrestamoBase;
    const cuotaNecesaria = pmt(tasaMesBanco, plazoMesesEfectivo, montoPrestamo);

    // LTV real vs LTV permitido por el banco
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

    // Capacidad de pago
    if (cuotaNecesaria > cuotaMaxBanco + 1e-6) {
      score -= 40;
    }

    // LTV
    if (ltvReal > ltvMaxBanco + 1e-6) {
      score -= 30;
    }

    // Estabilidad laboral / RUC
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

    // Requisitos BIESS
    const afiliadoBool =
      typeof afiliadoIess === "string"
        ? afiliadoIess.toLowerCase().startsWith("s")
        : !!afiliadoIess;

    if (requiereIESS && !afiliadoBool) {
      score -= 40;
    }
    if (requiereAportes) {
      if (n(iessAportesTotales) < MIN_IESS_TOTALES) score -= 25;
      if (n(iessAportesConsecutivos) < MIN_IESS_CONSEC) score -= 25;
    }

    // Buró
    if (declaracionBuro === "regularizado") score -= 10;
    if (declaracionBuro === "mora") score -= 40;

    // Riesgo HL alto → penalización ligera
   if (bank.tipo !== "VIP" && bank.tipo !== "VIS") {
  if (riesgoHabitaLibre === "alto") score -= 10;
}


    // Si ya el motor dice "sin sustento" → castigo fuerte
    if (flags?.sinSustento) {
      score -= 30;
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

  // Ordenamos de mayor a menor score
  resultados.sort((a, b) => b.score - a.score);

  // 👇 Estructura que espera mailer.js
  const bancosProbabilidad = resultados.map((r) => ({
    banco: r.banco,
    tipoProducto: r.tipo,
    probScore: r.score,         // 0–100
    probLabel: r.probabilidad,  // Alta / Media / Baja...
    dtiBanco: r.dtiUsadoBanco,
  }));

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
