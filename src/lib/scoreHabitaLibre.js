// src/lib/scoreHabitaLibre.js

/** Puntaje HabitaLibre (0–100) con desglose, recomendaciones y elegibilidad
 *  Factores y pesos (ajustables):
 *   - DTI (incl. hipoteca) .............. 28%
 *   - LTV ................................ 22%
 *   - Estabilidad ........................ 18%
 *   - Edad ............................... 10%
 *   - Tipo de ingreso .................... 8%
 *   - Tipo de contrato ................... 6%
 *   - Sustento independiente ............. 4%
 *   - Declaración de buró ................ 4%
 *
 *  Parámetros esperados:
 *   {
 *     dtiConHipoteca,
 *     ltv,
 *     aniosEstabilidad,
 *     mesesActividad,
 *     edad,
 *     tipoIngreso,
 *     tipoContrato,
 *     sustentoIndependiente,
 *     declaracionBuro,
 *     tipoCredito,                 // "vip" | "vis" | "biess_vip" | "biess_std" | "default"
 *     esExtranjero,                // boolean (true si NO es ecuatoriano)
 *     aportesIESS,                 // número total de aportes
 *     ultimas13Continuas           // boolean: true si las últimas 13 son continuas
 *   }
 *
 *  Retorna:
 *   {
 *     score: 0..100,
 *     categoria: "alto" | "medio" | "bajo",
 *     label: "Alto potencial" | "Ajustable" | "Riesgo alto",
 *     breakdown: { dti:{score,weight,value}, ... },
 *     recomendaciones: [ "...", ... ],
 *     elegible: boolean,
 *     motivosElegibilidad: [ "...", ... ],
 *   }
 */

const WEIGHTS = {
  dti: 0.28,
  ltv: 0.22,
  estabilidad: 0.18,
  edad: 0.10,
  tipoIngreso: 0.08,
  tipoContrato: 0.06,
  sustentoIndependiente: 0.04,
  declaracionBuro: 0.04,
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const invLerp = (a, b, v) => clamp((v - a) / (b - a || 1e-9), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;

/* ===========================================================
   Helpers de normalización
=========================================================== */
function normalizeTipoCredito(tipo = "default") {
  return String(tipo || "").trim().toLowerCase();
}

function normalizeTipoIngreso(tipo = "Dependiente") {
  const t = String(tipo || "").trim().toLowerCase();
  if (t.includes("mixt")) return "mixto";
  if (t.includes("independ")) return "independiente";
  return "dependiente";
}

function normalizeTipoContrato(tipo = "indefinido") {
  const t = String(tipo || "").trim().toLowerCase();
  if (t.includes("tempor")) return "temporal";
  if (t.includes("serv")) return "servicios";
  return "indefinido";
}

function normalizeSustento(s = "") {
  const x = String(s || "").trim().toLowerCase();
  if (!x) return null;
  if (x.includes("ruc") || x.includes("factur")) return "facturacion_ruc";
  if (x.includes("bancar")) return "movimientos_bancarizados";
  if (x.includes("sri") || x.includes("declar")) return "declaracion_sri";
  if (x.includes("mixt")) return "mixto";
  if (x.includes("inform")) return "informal";
  return x;
}

/* ===========================================================
   Helpers de producto
=========================================================== */
function getProductoProfile(tipoCredito = "default") {
  const t = normalizeTipoCredito(tipoCredito);

  const isVIS = t === "vis";
  const isVIP = t === "vip";
  const isBiessVip = t === "biess_vip";
  const isBiessStd = t === "biess_std";
  const isBiess = isBiessVip || isBiessStd;
  const isPreferencial95 = isVIS || isVIP || isBiessVip || isBiessStd;
  const isPrivado = t === "default" || t === "private" || t === "comercial";

  return {
    tipoCredito: t,
    isVIS,
    isVIP,
    isBiessVip,
    isBiessStd,
    isBiess,
    isPreferencial95,
    isPrivado,
    ltvBueno: isPreferencial95 ? 0.95 : 0.8,
    ltvIdeal: isPreferencial95 ? 0.9 : 0.8,
    dtiObjetivo: isPreferencial95 ? 0.45 : 0.4,
    entradaIdealTexto: isPreferencial95 ? "5%–10%" : "20%",
  };
}

/* ===========================================================
   Subscores (0-100)
=========================================================== */

/** DTI (incl. hipoteca) */
function subscoreDTI(dti) {
  if (!isFinite(dti)) return 10;
  if (dti <= 0.3) return 100;
  if (dti <= 0.35) return lerp(90, 100, invLerp(0.35, 0.3, dti));
  if (dti <= 0.4) return lerp(75, 90, invLerp(0.4, 0.35, dti));
  if (dti <= 0.45) return lerp(55, 75, invLerp(0.45, 0.4, dti));
  if (dti <= 0.55) return lerp(20, 55, invLerp(0.55, 0.45, dti));
  return 10;
}

/** LTV base */
function subscoreLTV(ltv) {
  if (!isFinite(ltv)) return 20;
  if (ltv <= 0.8) return 100;
  if (ltv <= 0.85) return lerp(85, 100, invLerp(0.85, 0.8, ltv));
  if (ltv <= 0.9) return lerp(65, 85, invLerp(0.9, 0.85, ltv));
  if (ltv <= 0.95) return lerp(40, 65, invLerp(0.95, 0.9, ltv));
  return 20;
}

/** LTV contextual */
function subscoreLTVByProduct(ltv, tipoCredito = "default") {
  if (!isFinite(ltv)) return 20;

  const profile = getProductoProfile(tipoCredito);

  if (profile.isPreferencial95) {
    if (ltv <= 0.8) return 100;
    if (ltv <= 0.85) return lerp(95, 100, invLerp(0.85, 0.8, ltv));
    if (ltv <= 0.9) return lerp(85, 95, invLerp(0.9, 0.85, ltv));
    if (ltv <= 0.95) return lerp(70, 85, invLerp(0.95, 0.9, ltv));
    return 25;
  }

  return subscoreLTV(ltv);
}

/** Estabilidad dependiente (años) */
function subscoreEstabilidadDependiente(anios) {
  const a = Number(anios) || 0;
  if (a >= 4) return 100;
  if (a >= 3) return lerp(92, 100, invLerp(3, 4, a));
  if (a >= 2) return lerp(82, 92, invLerp(2, 3, a));
  if (a >= 1) return lerp(65, 82, invLerp(1, 2, a));
  if (a >= 0.5) return lerp(40, 65, invLerp(0.5, 1, a));
  if (a > 0) return 25;
  return 10;
}

/** Estabilidad independiente (meses) */
function subscoreEstabilidadIndependiente(meses) {
  const m = Number(meses) || 0;
  if (m >= 48) return 100;
  if (m >= 36) return lerp(90, 100, invLerp(36, 48, m));
  if (m >= 24) return lerp(72, 90, invLerp(24, 36, m));
  if (m >= 18) return lerp(50, 72, invLerp(18, 24, m));
  if (m >= 12) return lerp(35, 50, invLerp(12, 18, m));
  if (m > 0) return 20;
  return 10;
}

/** Estabilidad unificada según perfil */
function subscoreEstabilidad({
  tipoIngreso = "Dependiente",
  aniosEstabilidad = 0,
  mesesActividad = 0,
}) {
  const t = normalizeTipoIngreso(tipoIngreso);

  if (t === "dependiente") {
    return subscoreEstabilidadDependiente(aniosEstabilidad);
  }

  if (t === "independiente") {
    return subscoreEstabilidadIndependiente(mesesActividad);
  }

  // mixto: ponderado entre ambas
  const dep = subscoreEstabilidadDependiente(aniosEstabilidad);
  const ind = subscoreEstabilidadIndependiente(mesesActividad || aniosEstabilidad * 12);
  return Math.round(dep * 0.55 + ind * 0.45);
}

/** Edad */
function subscoreEdad(edad) {
  const e = Number(edad) || 0;
  if (e < 21 || e > 75) return 10;
  if (e >= 25 && e <= 55) return 100;
  if (e < 25) return lerp(80, 100, invLerp(21, 25, e));
  if (e <= 65) return lerp(70, 100, invLerp(65, 55, e));
  return lerp(40, 70, invLerp(75, 65, e));
}

/** Tipo de ingreso */
function subscoreTipoIngreso(tipo = "Dependiente") {
  const t = normalizeTipoIngreso(tipo);
  if (t === "dependiente") return 100;
  if (t === "mixto") return 88;
  return 75;
}

/** Tipo de contrato */
function subscoreTipoContrato(tipoContrato = "indefinido", tipoIngreso = "Dependiente") {
  const ingreso = normalizeTipoIngreso(tipoIngreso);
  if (ingreso === "independiente") return 85;

  const t = normalizeTipoContrato(tipoContrato);
  if (t === "indefinido") return 100;
  if (t === "temporal") return 72;
  if (t === "servicios") return 55;
  return 70;
}

/** Sustento ingresos independientes */
function subscoreSustentoIndependiente(
  sustentoIndependiente = null,
  tipoIngreso = "Dependiente"
) {
  const ingreso = normalizeTipoIngreso(tipoIngreso);
  if (ingreso === "dependiente") return 90;

  const s = normalizeSustento(sustentoIndependiente);
  if (s === "facturacion_ruc") return 100;
  if (s === "mixto") return 92;
  if (s === "movimientos_bancarizados") return 82;
  if (s === "declaracion_sri") return 78;
  if (s === "informal") return 35;
  return 60;
}

/** Buró */
function subscoreDeclaracionBuro(dec = "ninguno") {
  const d = String(dec).toLowerCase();
  if (d === "ninguno") return 100;
  if (d === "regularizado") return 70;
  return 30;
}

/* ===========================================================
   Recomendaciones contextuales
=========================================================== */
function recomendacionesFrom(b, meta = {}) {
  const rec = [];
  const profile = getProductoProfile(meta.tipoCredito);

  const dti = Number(meta.dtiConHipoteca);
  const ltv = Number(meta.ltv);
  const tipoIngreso = normalizeTipoIngreso(meta.tipoIngreso);
  const tipoContrato = normalizeTipoContrato(meta.tipoContrato);
  const sustento = normalizeSustento(meta.sustentoIndependiente);

  if (b.dti.score < 75) {
    if (profile.isPreferencial95) {
      rec.push("Reduce tus deudas mensuales para llevar tu DTI idealmente por debajo de 45%.");
    } else {
      rec.push("Reduce tus deudas mensuales para bajar el DTI por debajo de 40–42%.");
    }
  }

  if (b.ltv.score < 70) {
    if (profile.isPreferencial95) {
      if (isFinite(ltv) && ltv <= 0.95) {
        rec.push("Ya cumples el rango de entrada mínima del programa. Una entrada mayor mejoraría aún más tu perfil.");
      } else {
        rec.push("Te conviene aumentar un poco tu entrada para quedar dentro del 95% máximo de financiamiento.");
      }
    } else {
      rec.push("Aumenta tu entrada (ideal ≥ 20%) para mejorar tu LTV.");
    }
  }

  if (b.estabilidad.score < 80) {
    if (tipoIngreso === "independiente" || tipoIngreso === "mixto") {
      rec.push("Consolida más tiempo de actividad económica demostrable, idealmente 24 meses o más.");
    } else {
      rec.push("Consolida al menos 1–2 años de estabilidad laboral.");
    }
  }

  if (tipoIngreso === "dependiente" && b.tipoContrato.score < 80) {
    rec.push("Un contrato indefinido suele mejorar tu perfil frente a uno temporal o por servicios.");
  }

  if ((tipoIngreso === "independiente" || tipoIngreso === "mixto") && b.sustentoIndependiente.score < 80) {
    if (sustento === "informal") {
      rec.push("Formaliza tus ingresos; RUC, facturación o bancarización pueden mejorar mucho tu perfil.");
    } else {
      rec.push("Fortalece cómo sustentas tus ingresos: RUC y facturación suelen ser mejor vistos.");
    }
  }

  if (b.tipoIngreso.score < 85) {
    rec.push("Un perfil de ingresos más formal y consistente mejora tus condiciones hipotecarias.");
  }

  if (b.declaracionBuro.score < 70) {
    rec.push("Regulariza tu historial crediticio antes de aplicar.");
  }

  if (profile.isBiessVip && b.dti.score >= 75 && b.ltv.score >= 70) {
    rec.push("Tu perfil encaja bien con BIESS/CrediCasa por tasa baja y cuota más liviana.");
  } else if ((profile.isVIS || profile.isVIP) && b.dti.score >= 75 && b.ltv.score >= 70) {
    rec.push("Tu perfil encaja bien con programas preferenciales VIS/VIP de banca privada.");
  } else if (profile.isPrivado && b.dti.score >= 75 && b.ltv.score >= 70) {
    rec.push("Tu perfil está razonablemente bien para una hipoteca privada tradicional.");
  }

  if (!rec.length) {
    if (profile.isPreferencial95) {
      rec.push("Tu perfil se ve sólido para productos preferenciales con entrada mínima desde 5%.");
    } else {
      rec.push("Tu perfil se ve sólido para continuar con simulación y comparación de hipotecas.");
    }
  }

  return rec;
}

/* ===========================================================
   Reglas de elegibilidad por tipo de crédito
=========================================================== */
function evaluarElegibilidad({
  tipoCredito = "default",
  esExtranjero = false,
  aportesIESS = 0,
  ultimas13Continuas = false,
}) {
  let elegible = true;
  const motivos = [];

  const t = normalizeTipoCredito(tipoCredito);

  if ((t === "vip" || t === "vis") && esExtranjero) {
    elegible = false;
    motivos.push(
      "Los créditos VIP/VIS de banca privada aplican únicamente para ciudadanos ecuatorianos."
    );
  }

  if (t === "biess_vip" || t === "biess_std") {
    const aportes = Number(aportesIESS) || 0;

    if (aportes < 36) {
      elegible = false;
      motivos.push(
        "Para crédito BIESS necesitas al menos 36 aportaciones al IESS."
      );
    }

    if (!ultimas13Continuas) {
      elegible = false;
      motivos.push(
        "Para crédito BIESS las últimas 13 aportaciones deben ser continuas."
      );
    }
  }

  return { elegible, motivosElegibilidad: motivos };
}

/* ===========================================================
   API principal
=========================================================== */
export function scoreHabitaLibre({
  dtiConHipoteca,
  ltv,
  aniosEstabilidad,
  mesesActividad,
  edad,
  tipoIngreso,
  tipoContrato,
  sustentoIndependiente,
  declaracionBuro = "ninguno",
  tipoCredito = "default",
  esExtranjero = false,
  aportesIESS = 0,
  ultimas13Continuas = false,
} = {}) {
  const subs = {
    dti: {
      score: Math.round(subscoreDTI(Number(dtiConHipoteca))),
      weight: WEIGHTS.dti,
      value: dtiConHipoteca,
    },
    ltv: {
      score: Math.round(subscoreLTVByProduct(Number(ltv), tipoCredito)),
      weight: WEIGHTS.ltv,
      value: ltv,
    },
    estabilidad: {
      score: Math.round(
        subscoreEstabilidad({
          tipoIngreso,
          aniosEstabilidad,
          mesesActividad,
        })
      ),
      weight: WEIGHTS.estabilidad,
      value:
        normalizeTipoIngreso(tipoIngreso) === "dependiente"
          ? aniosEstabilidad
          : mesesActividad,
    },
    edad: {
      score: Math.round(subscoreEdad(edad)),
      weight: WEIGHTS.edad,
      value: edad,
    },
    tipoIngreso: {
      score: Math.round(subscoreTipoIngreso(tipoIngreso)),
      weight: WEIGHTS.tipoIngreso,
      value: tipoIngreso,
    },
    tipoContrato: {
      score: Math.round(subscoreTipoContrato(tipoContrato, tipoIngreso)),
      weight: WEIGHTS.tipoContrato,
      value: tipoContrato,
    },
    sustentoIndependiente: {
      score: Math.round(
        subscoreSustentoIndependiente(sustentoIndependiente, tipoIngreso)
      ),
      weight: WEIGHTS.sustentoIndependiente,
      value: sustentoIndependiente,
    },
    declaracionBuro: {
      score: Math.round(subscoreDeclaracionBuro(declaracionBuro)),
      weight: WEIGHTS.declaracionBuro,
      value: declaracionBuro,
    },
  };

  const score = Math.round(
    subs.dti.score * subs.dti.weight +
      subs.ltv.score * subs.ltv.weight +
      subs.estabilidad.score * subs.estabilidad.weight +
      subs.edad.score * subs.edad.weight +
      subs.tipoIngreso.score * subs.tipoIngreso.weight +
      subs.tipoContrato.score * subs.tipoContrato.weight +
      subs.sustentoIndependiente.score * subs.sustentoIndependiente.weight +
      subs.declaracionBuro.score * subs.declaracionBuro.weight
  );

  let categoria = "medio";
  let label = "Ajustable";

  if (score >= 80) {
    categoria = "alto";
    label = "Alto potencial";
  } else if (score < 60) {
    categoria = "bajo";
    label = "Riesgo alto";
  }

  const recomendaciones = recomendacionesFrom(subs, {
    tipoCredito,
    dtiConHipoteca,
    ltv,
    tipoIngreso,
    tipoContrato,
    sustentoIndependiente,
  });

  const { elegible, motivosElegibilidad } = evaluarElegibilidad({
    tipoCredito,
    esExtranjero,
    aportesIESS,
    ultimas13Continuas,
  });

  return {
    score,
    categoria,
    label,
    breakdown: subs,
    recomendaciones,
    elegible,
    motivosElegibilidad,
    weights: WEIGHTS,
  };
}

export default scoreHabitaLibre;