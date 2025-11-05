// src/lib/scoreHabitaLibre.js

/** Puntaje HabitaLibre (0–100) con desglose y recomendaciones
 *  Factores y pesos (ajustables):
 *   - DTI (incl. hipoteca) .......... 30%
 *   - LTV ............................ 25%
 *   - Estabilidad (años) ............ 20%
 *   - Edad ........................... 10%
 *   - Tipo de ingreso ................ 10%
 *   - Declaración de buró ...........  5%
 *
 *  Retorna:
 *   {
 *     score: 0..100,
 *     categoria: "alto" | "medio" | "bajo",          // potencial HL
 *     label: "Alto potencial" | "Ajustable" | "Riesgo alto",
 *     breakdown: { dti:{score,weight,value}, ... },
 *     recomendaciones: [ "...", ... ]
 *   }
 */

const WEIGHTS = {
  dti: 0.30,
  ltv: 0.25,
  estabilidad: 0.20,
  edad: 0.10,
  tipoIngreso: 0.10,
  declaracionBuro: 0.05,
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const invLerp = (a, b, v) => clamp((v - a) / (b - a || 1e-9), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;

/* ---- Subscores (0-100) por factor) ---- */

/** DTI (incl. hipoteca): mejor <=0.35
 *  Tramos:
 *   <=0.30 → 100
 *   0.30–0.35 → 100→90
 *   0.35–0.40 → 90→75
 *   0.40–0.45 → 75→55
 *   0.45–0.55 → 55→20
 *   >=0.55   → 10
 */
function subscoreDTI(dti) {
  if (!isFinite(dti)) return 10;
  if (dti <= 0.30) return 100;
  if (dti <= 0.35) return lerp(90, 100, invLerp(0.35, 0.30, dti));
  if (dti <= 0.40) return lerp(75, 90, invLerp(0.40, 0.35, dti));
  if (dti <= 0.45) return lerp(55, 75, invLerp(0.45, 0.40, dti));
  if (dti <= 0.55) return lerp(20, 55, invLerp(0.55, 0.45, dti));
  return 10;
}

/** LTV: mejor <=0.80
 *  <=0.80 → 100
 *  0.80–0.85 → 100→85
 *  0.85–0.90 → 85→65
 *  0.90–0.95 → 65→40
 *  >=0.95   → 20
 */
function subscoreLTV(ltv) {
  if (!isFinite(ltv)) return 20;
  if (ltv <= 0.80) return 100;
  if (ltv <= 0.85) return lerp(85, 100, invLerp(0.85, 0.80, ltv));
  if (ltv <= 0.90) return lerp(65, 85, invLerp(0.90, 0.85, ltv));
  if (ltv <= 0.95) return lerp(40, 65, invLerp(0.95, 0.90, ltv));
  return 20;
}

/** Estabilidad (años) */
function subscoreEstabilidad(anios) {
  const a = Number(anios) || 0;
  if (a >= 3) return 100;
  if (a >= 2) return lerp(85, 100, invLerp(2, 3, a));
  if (a >= 1) return lerp(65, 85, invLerp(1, 2, a));
  if (a >= 0.5) return lerp(40, 65, invLerp(0.5, 1, a));
  if (a > 0) return 30;
  return 15;
}

/** Edad (óptimo ~25–55) */
function subscoreEdad(edad) {
  const e = Number(edad) || 0;
  if (e < 21 || e > 75) return 10;
  if (e >= 25 && e <= 55) return 100;
  if (e < 25) return lerp(80, 100, invLerp(21, 25, e));
  // 55–65 baja a 70, 65–75 baja a 40
  if (e <= 65) return lerp(70, 100, invLerp(65, 55, e)); // de 55→65 cae de 100→70
  return lerp(40, 70, invLerp(75, 65, e)); // de 65→75 cae de 70→40
}

/** Tipo de ingreso */
function subscoreTipoIngreso(tipo = "Dependiente") {
  const t = String(tipo).toLowerCase();
  if (t === "dependiente") return 100;
  if (t === "mixto") return 85;
  return 70; // independiente
}

/** Declaración de buró */
function subscoreDeclaracionBuro(dec = "ninguno") {
  const d = String(dec).toLowerCase();
  if (d === "ninguno") return 100;
  if (d === "regularizado") return 70;
  return 30; // "mora" u otros
}

/* ---- Recomendaciones en base a subscores ---- */
function recomendacionesFrom(b) {
  const rec = [];
  if (b.dti.score < 75) rec.push("Reduce tus deudas mensuales para bajar el DTI por debajo de 40–42%.");
  if (b.ltv.score < 70) rec.push("Aumenta tu entrada (ideal ≥ 20%) para mejorar tu LTV.");
  if (b.estabilidad.score < 80) rec.push("Consolida al menos 1–2 años de estabilidad de ingresos.");
  if (b.tipoIngreso.score < 85) rec.push("Formaliza ingresos y documentación para mejorar condiciones.");
  if (b.declaracionBuro.score < 70) rec.push("Regulariza tu historial crediticio antes de aplicar.");
  return rec;
}

/** API principal: calcula score HL */
export function scoreHabitaLibre({
  dtiConHipoteca,
  ltv,
  aniosEstabilidad,
  edad,
  tipoIngreso,
  declaracionBuro = "ninguno",
} = {}) {
  const subs = {
    dti: { score: Math.round(subscoreDTI(Number(dtiConHipoteca))) , weight: WEIGHTS.dti, value: dtiConHipoteca },
    ltv: { score: Math.round(subscoreLTV(Number(ltv)))            , weight: WEIGHTS.ltv, value: ltv },
    estabilidad: { score: Math.round(subscoreEstabilidad(aniosEstabilidad)), weight: WEIGHTS.estabilidad, value: aniosEstabilidad },
    edad: { score: Math.round(subscoreEdad(edad))                  , weight: WEIGHTS.edad, value: edad },
    tipoIngreso: { score: Math.round(subscoreTipoIngreso(tipoIngreso)), weight: WEIGHTS.tipoIngreso, value: tipoIngreso },
    declaracionBuro: { score: Math.round(subscoreDeclaracionBuro(declaracionBuro)), weight: WEIGHTS.declaracionBuro, value: declaracionBuro },
  };

  const score =
    Math.round(
      subs.dti.score * subs.dti.weight +
      subs.ltv.score * subs.ltv.weight +
      subs.estabilidad.score * subs.estabilidad.weight +
      subs.edad.score * subs.edad.weight +
      subs.tipoIngreso.score * subs.tipoIngreso.weight +
      subs.declaracionBuro.score * subs.declaracionBuro.weight
    );

  let categoria = "medio";
  let label = "Ajustable";
  if (score >= 80) { categoria = "alto"; label = "Alto potencial"; }
  else if (score < 60) { categoria = "bajo"; label = "Riesgo alto"; }

  const recomendaciones = recomendacionesFrom(subs);

  return {
    score,
    categoria,        // "alto" | "medio" | "bajo"
    label,            // texto amigable
    breakdown: subs,  // detalle por factor
    recomendaciones,
    weights: WEIGHTS,
  };
}

export default scoreHabitaLibre;
