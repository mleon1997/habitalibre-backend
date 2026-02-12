import jwt from "jsonwebtoken";

/**
 * Genera JWT para CUSTOMER (Journey HabitaLibre)
 * Payload canónico:
 *  - id
 *  - email
 *  - leadId (opcional)
 *  - typ === "customer"
 */
export function signCustomerToken({ userId, email, leadId }) {
  const secret = process.env.CUSTOMER_JWT_SECRET;
  if (!secret) throw new Error("CUSTOMER_JWT_SECRET no configurado");

  const payload = {
    id: String(userId),
    email: email || "",
    leadId: leadId || null,
    typ: "customer",
  };

  return jwt.sign(payload, secret, { expiresIn: "30d" });
}
