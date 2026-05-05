export function evaluateCreditRisk(input = {}) {
  const {
    creditHistoryStatus = "unknown",
    hasActiveDelinquency = "unknown",
    delinquencyRange = "none",
    recentCreditDenied = "unknown",
    declaredCreditScore = null,
  } = input;

  const reasons = [];

  let level = "unknown";
  let label = "Validación crediticia pendiente";
  let scorePenalty = 5;
  let blocksBankSubmission = false;
  let recommendedAction =
    "Revisar tu historial crediticio antes de aplicar puede ayudarte a tener una evaluación más precisa.";

  if (creditHistoryStatus === "excellent") {
    level = "healthy";
    label = "Historial crediticio saludable";
    scorePenalty = 0;
    recommendedAction =
      "Tu historial declarado se ve favorable para avanzar a revisión bancaria.";
  }

  if (creditHistoryStatus === "good") {
    level = "low_risk";
    label = "Historial crediticio favorable";
    scorePenalty = 3;
    recommendedAction =
      "Tu historial declarado no parece ser una barrera importante.";
  }

  if (creditHistoryStatus === "regular") {
    level = "medium_risk";
    label = "Historial crediticio por revisar";
    scorePenalty = 10;
    reasons.push(
      "Declaraste atrasos o eventos relevantes en tu historial de pagos."
    );
    recommendedAction =
      "Antes de aplicar, conviene revisar tu historial crediticio para aumentar tus probabilidades.";
  }

  if (creditHistoryStatus === "complicated") {
    level = "high_risk";
    label = "Riesgo crediticio alto";
    scorePenalty = 25;
    blocksBankSubmission = true;
    reasons.push(
      "Declaraste deudas vencidas, castigos o reportes negativos."
    );
    recommendedAction =
      "Conviene regularizar o revisar tu historial antes de iniciar una solicitud bancaria.";
  }

  if (hasActiveDelinquency === "yes") {
    level = "high_risk";
    label = "Mora activa declarada";
    scorePenalty = Math.max(scorePenalty, 30);
    blocksBankSubmission = true;
    reasons.push("Declaraste tener una deuda vencida actualmente.");
    recommendedAction =
      "Primero conviene regularizar la deuda vencida antes de aplicar a una hipoteca.";
  }

  if (delinquencyRange === "more_than_90") {
    level = "high_risk";
    label = "Mora relevante declarada";
    scorePenalty = Math.max(scorePenalty, 30);
    blocksBankSubmission = true;
    reasons.push("Declaraste una mora mayor a 90 días.");
    recommendedAction =
      "Una mora mayor a 90 días puede afectar fuertemente una revisión bancaria.";
  }

  if (recentCreditDenied === "yes") {
    if (level !== "high_risk") {
      level = "medium_risk";
      label = "Revisión crediticia recomendada";
      scorePenalty = Math.max(scorePenalty, 15);
    }

    reasons.push("Declaraste que te han negado un crédito recientemente.");
    recommendedAction =
      "Antes de aplicar, conviene entender la causa de la negativa reciente.";
  }

  const numericScore = Number(declaredCreditScore);

  if (Number.isFinite(numericScore) && numericScore > 0) {
    if (numericScore < 500) {
      level = "high_risk";
      label = "Score crediticio bajo";
      scorePenalty = Math.max(scorePenalty, 30);
      blocksBankSubmission = true;
      reasons.push("El score crediticio declarado es bajo.");
      recommendedAction =
        "Conviene mejorar o revisar tu score antes de iniciar una solicitud bancaria.";
    } else if (numericScore < 650 && level !== "high_risk") {
      level = "medium_risk";
      label = "Score crediticio medio";
      scorePenalty = Math.max(scorePenalty, 12);
      reasons.push("El score declarado podría requerir revisión.");
    } else if (
      numericScore >= 650 &&
      ["unknown", "low_risk"].includes(level)
    ) {
      level = "healthy";
      label = "Score crediticio favorable";
      scorePenalty = 0;
      recommendedAction =
        "Tu score declarado se ve favorable para avanzar.";
    }
  }

  if (reasons.length === 0 && level === "unknown") {
    reasons.push("El usuario no conoce o no declaró su historial crediticio.");
  }

  return {
    level,
    label,
    scorePenalty,
    blocksBankSubmission,
    reasons,
    recommendedAction,
  };
}