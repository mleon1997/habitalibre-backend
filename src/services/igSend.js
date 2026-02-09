// src/services/igSend.js
import "dotenv/config";

// ------------------------------------
// Config
// ------------------------------------
const PAGE_ACCESS_TOKEN =
  process.env.IG_PAGE_ACCESS_TOKEN ||
  process.env.PAGE_ACCESS_TOKEN ||
  process.env.META_PAGE_ACCESS_TOKEN ||
  null;

// (Opcional) IG Business ID, no se usa para enviar mensajes,
// pero lo dejamos por consistencia y logs.
const IG_BUSINESS_ID = process.env.IG_BUSINESS_ID || null;

function assertToken() {
  if (!PAGE_ACCESS_TOKEN) {
    const msg =
      "Falta IG_PAGE_ACCESS_TOKEN en .env (Page Access Token). " +
      "Agrega: IG_PAGE_ACCESS_TOKEN=xxxx";
    const err = new Error(msg);
    err.status = 500;
    throw err;
  }
}

// ------------------------------------
// ✅ Named export: igSendText
// ------------------------------------
export async function igSendText(toUserId, text) {
  assertToken();

  const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(
    PAGE_ACCESS_TOKEN
  )}`;

  const payload = {
    recipient: { id: String(toUserId) },
    messaging_type: "RESPONSE",
    message: { text: String(text || "").slice(0, 1900) }, // límite seguro
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    console.error("❌ IG send error:", {
      status: resp.status,
      data,
      IG_BUSINESS_ID,
    });

    const err = new Error(
      data?.error?.message || `Error enviando DM (HTTP ${resp.status})`
    );
    err.status = resp.status;
    err.meta = data;
    throw err;
  }

  return { ok: true, data };
}

// (Opcional) export default, por si luego lo quieres importar default
export default igSendText;
