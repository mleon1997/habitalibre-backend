// src/middlewares/auth.js
import jwt from "jsonwebtoken";

// Genera un token JWT para el admin
export function generarTokenAdmin(email) {
  return jwt.sign(
    {
      email,
      rolGeneral: "admin",
    },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );
}

// Verifica que el request tenga un JWT válido
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Token requerido" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    console.error("Error verificando token:", err.message);
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

// Valida que el usuario sea admin
export function requireAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rolGeneral !== "admin") {
    return res.status(403).json({ error: "Acceso denegado" });
  }
  next();
}
