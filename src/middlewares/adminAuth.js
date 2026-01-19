// src/middlewares/adminAuth.js
import jwt from "jsonwebtoken";

export default function adminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";

    // (opcional) soporta ?token=... por si lo necesitas en algún caso
    const token = bearer || (req.query?.token ? String(req.query.token) : "");

    if (!token) {
      return res.status(401).json({ ok: false, message: "Token admin requerido" });
    }

    const secret =
      process.env.ADMIN_JWT_SECRET ||
      process.env.JWT_SECRET ||
      "dev_admin_secret_change_me";

    const payload = jwt.verify(token, secret);

    // Adjuntamos info de admin por si luego quieres roles/permisos
    req.admin = payload;

    return next();
  } catch (err) {
    const isExpired = err?.name === "TokenExpiredError";
    return res.status(401).json({
      ok: false,
      message: isExpired ? "Token admin inválido o expirado" : "Token admin inválido",
    });
  }
}
