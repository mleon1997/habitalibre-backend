// src/services/igSend.js
import "dotenv/config";

const IG_API_VERSION = process.env.IG_API_VERSION || "v21.0";

function assertToken() {
  const token =
    process.env.IG_PAGE_ACCESS_TOKEN ||
    process.env.PAGE_ACCESS_TOKEN ||
    process.env.IG_PAGE_TOKEN ||
    "";

  if (!token) {
    const err = new Error(
      "Falta IG_PAGE_ACCESS_TOKEN en .env (Page Access Token)."
    );
    err.status = 500;
    throw err;
  }
  return token;
}

export async function igSendText({ toUserId, recipientId, text }) {
  const token = assertToken();

  const finalTo = toUserId || recipientId;
  if (!finalTo) throw new Error("Falta toUserId/recipientId");
  if (!text) throw new Error("Falta text");

  const pageId = process.env.IG_PAGE_ID || "me"; // recomendado setear IG_PAGE_ID
  const url = `https://graph.facebook.com/${IG_API_VERSION}/${pageId}/messages?access_token=${encodeURIComponent(
    token
  )}`;

  const payload = {
    recipient: { id: String(finalTo) },
    messaging_type: "RESPONSE",
    message: { text: String(text) },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const msg = data?.error?.message || "Error enviando DM";
    const code = data?.error?.code;
    const sub = data?.error?.error_subcode;
    throw new Error(`${msg} (code=${code}, subcode=${sub})`);
  }

  return data;
}
