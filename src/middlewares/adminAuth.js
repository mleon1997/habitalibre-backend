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

    const secret = String(process.env.ADMIN_JWT_SECRET || "");
    if (!secret) {
      return res.status(500).json({ ok: false, message: "ADMIN_JWT_SECRET no configurado" });
    }

    const payload = jwt.verify(token, secret);

    // hard-check: solo tokens admin
    if (payload?.typ !== "admin" && payload?.rolGeneral !== "admin") {
      return res.status(403).json({ ok: false, message: "Token no es admin" });
    }

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
