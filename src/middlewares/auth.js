// src/middlewares/auth.js
import jwt from "jsonwebtoken";

/**
 * ✅ Helpers
 */
function getAuthToken(req) {
  const authHeader = String(req.headers.authorization || "");
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7).trim();
  return null;
}

function getJwtSecrets() {
  // ✅ Acepta ambos secrets (por si admin usa uno distinto)
  const secrets = [
    process.env.ADMIN_JWT_SECRET,
    process.env.JWT_SECRET,
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  // Fallback dev (evita crash, pero recomendado setear secrets en prod)
  if (!secrets.length) secrets.push("dev_admin_secret");

  return secrets;
}

function verifyWithAnySecret(token) {
  const secrets = getJwtSecrets();
  let lastErr = null;

  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret);
      return { decoded, usedSecret: secret };
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error("Token inválido");
}

/**
 * ✅ Genera token Admin (mantiene compatibilidad)
 * - Incluye rolGeneral y type para que cualquier middleware lo acepte.
 */
export function generarTokenAdmin(email) {
  const secret =
    String(process.env.ADMIN_JWT_SECRET || "").trim() ||
    String(process.env.JWT_SECRET || "").trim() ||
    "dev_admin_secret";

  return jwt.sign(
    {
      email: String(email || "").trim().toLowerCase(),
      rolGeneral: "admin",
      type: "admin",
    },
    secret,
    { expiresIn: process.env.ADMIN_JWT_EXPIRES || "24h" }
  );
}

/**
 * ✅ authMiddleware
 * - Verifica token con ADMIN_JWT_SECRET o JWT_SECRET
 * - Normaliza req.usuario para que siempre tenga rolGeneral
 */
export function authMiddleware(req, res, next) {
  const token = getAuthToken(req);

  if (!token) {
    return res.status(401).json({ ok: false, error: "Token requerido" });
  }

  try {
    const { decoded } = verifyWithAnySecret(token);

    // Normaliza usuario
    const usuario = decoded || {};
    // Si viene type=admin, conviértelo a rolGeneral=admin
    if (!usuario.rolGeneral && usuario.type === "admin") {
      usuario.rolGeneral = "admin";
    }

    req.usuario = usuario;
    next();
  } catch (err) {
    console.error("❌ Error verificando token:", err.message);
    return res.status(401).json({ ok: false, error: "Token inválido o expirado" });
  }
}

/**
 * ✅ requireAdmin
 * - Acepta rolGeneral=admin o type=admin (compat)
 */
export function requireAdmin(req, res, next) {
  const u = req.usuario || {};
  const isAdmin = u.rolGeneral === "admin" || u.type === "admin";

  if (!isAdmin) {
    return res.status(403).json({ ok: false, error: "Acceso denegado" });
  }
  next();
}
