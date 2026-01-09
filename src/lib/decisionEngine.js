// src/lib/decisionEngine.js
import scoreHabitaLibre from "./scoreHabitaLibre.js";

const getNum = (v, def = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const pct = (n) => `${Math.round(Number(n || 0))}%`;

/**
 * buildAdvisorReply({ data, userEmail })
 * data = objeto armado en Progreso.jsx (buildDataFromSnap)
 */
export function buildAdvisorReply({ data = {}, userEmail = "" } = {}) {
  const d = data || {};
  const r = d.resultado || {};

  // Intentamos agarrar dti/ltv/edad de donde existan (backend o local)
  const dtiConHipoteca =
    getNum(d.dtiConHipoteca, null) ??
    getNum(r.dtiConHipoteca, null) ??
    getNum(r.dti, null);

  const ltv =
    getNum(d.ltv, null) ??
    getNum(r.ltv, null);

  const edad =
    getNum(d.edad, null) ??
    getNum(d.input?.edad, null) ??
    getNum(r.edad, null);

  // “Estabilidad” ya la tienes en data
  const aniosEstabilidad = getNum(d.aniosEstabilidad, 0);

  const tipoIngreso = d.tipoIngreso || d.input?.tipoIngreso || "Dependiente";
  const declaracionBuro = d.declaracionBuro || d.input?.declaracionBuro || "ninguno";

  // Producto sugerido (si no tienes mapping todavía, usamos el sugerido)
  // Puedes mapear a: "vip" | "vis" | "biess_vip" | "default"
  const tipoCredito = String(d.productoSugerido || d.suggestedCredit || "default")
    .toLowerCase()
    .includes("biess")
    ? "biess_vip"
    : String(d.suggestedCredit || "").toLowerCase().includes("vip")
    ? "vip"
    : String(d.suggestedCredit || "").toLowerCase().includes("vis")
    ? "vis"
    : "default";

  const esExtranjero = Boolean(d.input?.esExtranjero || r.esExtranjero || false);

  const aportesIESS = getNum(d.aportesTotales, 0);
  const ultimas13Continuas = getNum(d.aportesConsecutivos, 0) >= 13;

  // Ejecuta tu scoring (si no hay dti/ltv, igual funciona pero te recomendaría luego conectarlo)
  const hl = scoreHabitaLibre({
    dtiConHipoteca: dtiConHipoteca ?? 0.45, // fallback suave si aún no lo calculas
    ltv: ltv ?? 0.90,                      // fallback suave
    aniosEstabilidad,
    edad: edad ?? 30,
    tipoIngreso,
    declaracionBuro,
    tipoCredito,
    esExtranjero,
    aportesIESS,
    ultimas13Continuas,
  });

  // Texto principal
  const lines = [];
  lines.push(`**HL Score:** ${hl.score}/100 — **${hl.label}** (${hl.categoria.toUpperCase()})`);
  if (userEmail) lines.push(`**Cuenta:** ${userEmail}`);

  // Elegibilidad
  if (hl.elegible) {
    lines.push(`**Elegibilidad (ref):** OK para ruta ${tipoCredito.toUpperCase()}`);
  } else {
    lines.push(`**Elegibilidad (ref):** NO OK para ruta ${tipoCredito.toUpperCase()}`);
    (hl.motivosElegibilidad || []).slice(0, 3).forEach((m) => lines.push(`• ${m}`));
  }

  lines.push("");
  lines.push("**Tu siguiente mejor acción:**");
  const recs = (hl.recomendaciones || []).slice(0, 3);
  if (recs.length) recs.forEach((x) => lines.push(`• ${x}`));
  else lines.push("• Afinar simulación y preparar carpeta de documentos.");

  // Cards de acciones (para tu UI)
  const nba = [
    {
      id: "nba_simular",
      title: "Afinar simulación",
      desc: "Ajusta entrada, plazo y deudas para mejorar tu escenario.",
      impact: "alto",
      action: { type: "go", href: "/simular" },
    },
    {
      id: "nba_mejoras",
      title: "Ver plan de acción",
      desc: "Tareas ordenadas por impacto para subir aprobación.",
      impact: "alto",
      action: { type: "anchor", href: "#mejoras" },
    },
    {
      id: "nba_docs",
      title: "Checklist de documentos",
      desc: "Completar carpeta reduce fricción con bancos.",
      impact: "medio",
      action: { type: "anchor", href: "#docs" },
    },
  ];

  const quickActions = [
    { id: "qa_simular", label: "Afinar simulación", action: { type: "go", href: "/simular" } },
    { id: "qa_mejoras", label: "Ver mejoras", action: { type: "anchor", href: "#mejoras" } },
    { id: "qa_docs", label: "Ver documentos", action: { type: "anchor", href: "#docs" } },
  ];

  return {
    message: lines.join("\n"),
    quickActions,
    state: {
      estado: hl.categoria,
      bloqueo: hl.elegible ? "ninguno" : "no_elegible",
      decision: hl.elegible ? "aplicar" : "mejorar",
      nba,
      hl, // por si luego quieres mostrar breakdown en UI
    },
  };
}
