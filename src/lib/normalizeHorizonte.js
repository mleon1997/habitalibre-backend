// src/lib/normalizeHorizonte.js
export function normalizeHorizonte(v) {
  const t = String(v || "").toLowerCase().trim();

  // acepta valores ya canónicos
  if (t === "0-3" || t === "3-12" || t === "12-24" || t === "explorando") return t;

  // variantes típicas que llegan como "6–12 meses" o "6-12 meses"
  if (t.includes("0") && t.includes("3")) return "0-3";
  if ((t.includes("3") && t.includes("12")) || t.includes("6-12") || t.includes("6–12")) return "3-12";
  if (t.includes("12") && t.includes("24")) return "12-24";
  if (t.includes("expl")) return "explorando";

  return null;
}
