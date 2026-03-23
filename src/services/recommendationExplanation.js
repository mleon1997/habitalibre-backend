// src/services/recommendationExplanation.js
export function buildRecommendationExplanation({
  bestOption,
  rankedMortgages = [],
}) {
  if (!bestOption) return null;

  const reasons = [];
  const whyNotOthers = [];

  const name = bestOption.label;
  const rate = bestOption.annualRate;
  const cuota = bestOption.cuota;

  const mortgage = bestOption.mortgage || {};
  const flags = mortgage.flags || {};

  if (mortgage.segment === "BIESS") {
    reasons.push("Cumples con los requisitos de afiliación y aportes al IESS.");
  }

  if (flags.firstHomeOk) {
    reasons.push("El programa aplica para compra de primera vivienda.");
  }

  if (flags.newConstructionOk) {
    reasons.push("La vivienda nueva es elegible dentro de este programa.");
  }

  if ((mortgage.product?.risk?.ltvMax || 0) >= 0.95) {
    reasons.push("Este producto permite financiar hasta el 95% del valor de la vivienda.");
  }

  if (cuota) {
    reasons.push(`Tu cuota estimada sería aproximadamente $${Math.round(cuota)} al mes.`);
  }

  if (rate) {
    reasons.push(
      `Tiene una de las tasas más competitivas disponibles (${(rate * 100).toFixed(2)}%).`
    );
  }

  rankedMortgages.forEach((m) => {
    if (m.scenarioId === bestOption.scenarioId) return;
    if (!m.viable && m.reasons?.length) {
      whyNotOthers.push(
        `${m.label} no aplica porque ${String(m.reasons[0]).toLowerCase()}.`
      );
    }
  });

  return {
    title: `Te recomendamos ${name}`,
    summary: "Es la opción más conveniente para tu perfil hoy.",
    reasons,
    whyNotOthers: whyNotOthers.slice(0, 2),
    nextStep: "Puedes continuar con el proceso de precalificación con este programa.",
  };
}