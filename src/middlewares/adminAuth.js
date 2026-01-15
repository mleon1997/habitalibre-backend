// src/middlewares/adminAuth.js
import jwt from "jsonwebtoken";

export default function adminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      return res.status(401).json({ ok: false, message: "No autorizado (admin)" });
    }

    const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || "dev_admin_secret";
    const payload = jwt.verify(token, secret);

    // opcional: validar "rol"
    if (payload?.type !== "admin") {
      return res.status(401).json({ ok: false, message: "Token admin inválido" });
    }

    req.admin = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: "Token admin inválido o expirado" });
  }
}
