import jwt from "jsonwebtoken";

/**
 * Middleware principal para proteger rutas del Customer Journey.
 * Espera un Bearer token firmado con CUSTOMER_JWT_SECRET
 * y con payload tipo:
 * {
 *   id: "...",
 *   email: "...",
 *   leadId: "...",
 *   typ: "customer"
 * }
 */
export function authCustomerRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "Token requerido" });
    }

    const secret = process.env.CUSTOMER_JWT_SECRET;
    if (!secret) {
      return res.status(500).json({
        ok: false,
        error: "CUSTOMER_JWT_SECRET no configurado",
      });
    }

    const payload = jwt.verify(token, secret);

    if (!payload?.id || payload?.typ !== "customer") {
      return res.status(401).json({ ok: false, error: "Token inválido" });
    }

    req.customer = {
      id: String(payload.id),
      _id: String(payload.id),
      email: payload.email || "",
      leadId: payload.leadId || null,
      typ: "customer",
    };

    next();
  } catch (_error) {
    return res
      .status(401)
      .json({ ok: false, error: "Token inválido o expirado" });
  }
}

/**
 * Alias de compatibilidad
 */
export const verificarCustomer = authCustomerRequired;

/**
 * Default export para poder importar así:
 * import authCustomer from "../middlewares/authCustomer.js";
 */
export default authCustomerRequired;