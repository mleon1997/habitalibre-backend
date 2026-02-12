import jwt from "jsonwebtoken";

/**
 * Middleware base (Customer Journey)
 */
export function authCustomerRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ error: "Token requerido" });

    const secret = process.env.CUSTOMER_JWT_SECRET;
    if (!secret) {
      return res
        .status(500)
        .json({ error: "CUSTOMER_JWT_SECRET no configurado" });
    }

    const payload = jwt.verify(token, secret);

    // payload esperado: { id, email, leadId?, typ:"customer" }
    if (!payload?.id || payload?.typ !== "customer") {
      return res.status(401).json({ error: "Token inválido" });
    }

    // ✅ Canoniza
    req.customer = {
      id: String(payload.id),
      email: payload.email || "",
      leadId: payload.leadId || null,
      typ: "customer",
    };

    next();
  } catch (_e) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

/**
 * Alias compat
 */
export const verificarCustomer = authCustomerRequired;
