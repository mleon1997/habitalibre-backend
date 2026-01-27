// src/middlewares/auth.js
import jwt from "jsonwebtoken";

function getAuthToken(req) {
  const authHeader = String(req.headers.authorization || "");
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7).trim();
  return null;
}

export function authMiddleware(req, res, next) {
  const token = getAuthToken(req);
  if (!token) return res.status(401).json({ ok: false, error: "Token requerido" });

  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) return res.status(500).json({ ok: false, error: "JWT_SECRET no configurado" });

  try {
    const decoded = jwt.verify(token, secret);

    // ✅ Normaliza compat
    if (decoded?.type === "admin" && !decoded?.rolGeneral) decoded.rolGeneral = "admin";

    req.usuario = decoded;
    next();
  } catch (err) {
    console.error("❌ JWT verify failed:", err.message);
    return res.status(401).json({ ok: false, error: "Token inválido o expirado" });
  }
}

export function requireAdmin(req, res, next) {
  const u = req.usuario || {};
  const isAdmin = u.rolGeneral === "admin" || u.type === "admin";
  if (!isAdmin) return res.status(403).json({ ok: false, error: "Acceso denegado" });
  next();
}
