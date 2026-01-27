// src/middlewares/auth.js
import jwt from "jsonwebtoken";

/**
 * IMPORTANT:
 * - El admin token puede firmarse con ADMIN_JWT_SECRET o JWT_SECRET.
 * - Aquí verificamos con la misma lógica de fallback para evitar 401 en producción.
 */
function getJwtSecret() {
  return (
    process.env.ADMIN_JWT_SECRET ||
    process.env.JWT_SECRET ||
    "dev_admin_secret"
  );
}

// (Opcional) Genera token admin legacy si aún lo usas en algún lado
export function generarTokenAdmin(email) {
  return jwt.sign(
    {
      type: "admin",
      email,
      rolGeneral: "admin", // ✅ para compatibilidad con requireAdmin
    },
    getJwtSecret(),
    { expiresIn: process.env.ADMIN_JWT_EXPIRES || "24h" }
  );
}

// Verifica que el request tenga un JWT válido
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "Token requerido" });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());

    // Normalizamos payload para que TODAS las rutas usen lo mismo:
    // - si viene type:"admin" => rolGeneral:"admin"
    const rolGeneral =
      decoded?.rolGeneral ||
      (decoded?.type === "admin" ? "admin" : undefined);

    req.usuario = {
      ...decoded,
      rolGeneral,
    };

    return next();
  } catch (err) {
    console.error("Error verificando token:", err.message);
    return res.status(401).json({ ok: false, error: "Token inválido o expirado" });
  }
}

// Valida que el usuario sea admin
export function requireAdmin(req, res, next) {
  const rol = req.usuario?.rolGeneral || (req.usuario?.type === "admin" ? "admin" : "");
  if (rol !== "admin") {
    return res.status(403).json({ ok: false, error: "Acceso denegado" });
  }
  return next();
}
