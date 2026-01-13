// src/lib/journeySync.js
export async function saveJourneyIfAllowed({ input, resultado, status = "precalificado" }) {
  const token =
    localStorage.getItem("hl_customer_token") ||
    localStorage.getItem("customer_token") ||
    "";

  // ✅ compuertas: si no hay token, no guardes
  if (!token) return { ok: false, skipped: true, reason: "no_token" };

  // ✅ compuertas: si no es journey, no guardes
  let isJourney = false;
  try {
    const params = new URLSearchParams(window.location.search);
    const q = (params.get("mode") || "").toLowerCase();
    const ls = (localStorage.getItem("hl_entry_mode") || "").toLowerCase();
    isJourney = q === "journey" || ls === "journey";
  } catch {}

  if (!isJourney) return { ok: false, skipped: true, reason: "not_journey_mode" };

  // ✅ guarda SOLO en journey
  const r = await fetch("/api/customer/leads/save-journey", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      entrada: input || {},     // 👈 mantenemos tu contrato backend
      resultado: resultado || {},
      status,
    }),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) return { ok: false, skipped: false, error: j?.message || `HTTP ${r.status}` };
  return { ok: true, skipped: false, data: j };
}
