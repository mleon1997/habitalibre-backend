// src/middlewares/adminAuth.js
import jwt from "jsonwebtoken";

/**
 * Middleware de autenticación ADMIN
 * Requiere header:
 * Authorization: Bearer <token>
 */
export default function adminAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ")
      ? auth.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({
        ok: false,
        message: "Token admin requerido",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.ADMIN_JWT_SECRET
    );

    // 🔒 seguridad extra: solo emails HL
    if (
      !decoded?.email ||
      !decoded.email.endsWith("@habitalibre.com")
    ) {
      return res.status(403).json({
        ok: false,
        message: "Acceso restringido al equipo HabitaLibre",
      });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      ok: false,
      message: "Token admin inválido o expirado",
    });
  }
}
