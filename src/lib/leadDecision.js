// src/utils/leadDecision.js

export function leadDecision(lead) {
  return {
    callToday: false,
    bucket: "rescatable",
    stage: "captura_incompleta",
    heat: 50,
    missing: [],
    reasons: ["Decision placeholder"],
  };
}

// ✅ alias para compatibilidad con el controller
export function buildLeadDecision({ lead, resultado } = {}) {
  const safeLead = lead ? { ...lead } : {};
  if (resultado && !safeLead.resultado) {
    safeLead.resultado = resultado;
  }
  return leadDecision(safeLead);
}
