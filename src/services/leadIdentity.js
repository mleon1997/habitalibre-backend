// src/services/leadIdentity.js
export function normEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return e || null;
}

export function normIg(u) {
  let s = String(u || "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("@")) s = s.slice(1);
  return s || null;
}

// Ecuador: 09xxxxxxxx => +5939xxxxxxxx
export function normTelefono(telefono) {
  let t = String(telefono || "").trim();
  if (!t) return null;

  t = t.replace(/[^\d+]/g, "");

  if (/^09\d{8}$/.test(t)) return `+593${t.slice(1)}`;
  if (/^9\d{8}$/.test(t)) return `+593${t}`;
  if (/^5939\d{8}$/.test(t)) return `+${t}`;
  if (/^\+5939\d{8}$/.test(t)) return t;

  if (/^\+\d{6,15}$/.test(t)) return t;

  // si no podemos normalizar confiable, devolvemos null para no unir mal
  return null;
}

// ✅ ESTE ES EL EXPORT QUE TE FALTA
export function buildIdentidades({ email, telefono, igUsername, manychatSubscriberId } = {}) {
  return {
    emailNorm: normEmail(email),
    telefonoNorm: normTelefono(telefono),
    igUsernameNorm: normIg(igUsername),
    manychatSubscriberId: String(manychatSubscriberId || "").trim() || null,
  };
}
