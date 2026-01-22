// src/middlewares/adminAuth.js
import jwt from "jsonwebtoken";

export default function adminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const token = bearer || (req.query?.token ? String(req.query.token) : "");

    if (!token) {
      return res.status(401).json({ ok: false, message: "Token admin requerido" });
    }

    // ✅ UNIFICADO: mismo secret que authMiddleware
    const secret = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

    const payload = jwt.verify(token, secret);
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
