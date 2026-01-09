// src/middlewares/authCustomer.js
import jwt from "jsonwebtoken";

export function authCustomerRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ error: "Token requerido" });

    const secret = process.env.CUSTOMER_JWT_SECRET;
    if (!secret) return res.status(500).json({ error: "CUSTOMER_JWT_SECRET no configurado" });

    const payload = jwt.verify(token, secret);

    if (!payload?.id || payload?.typ !== "customer") {
      return res.status(401).json({ error: "Token inválido" });
    }

    req.customer = { id: payload.id, email: payload.email || "" };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

// ✅ compatibilidad con tus imports viejos
export const verificarCustomer = authCustomerRequired;
