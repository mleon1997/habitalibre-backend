import jwt from "jsonwebtoken";

/**
 * Genera JWT para CUSTOMER (Journey HabitaLibre)
 * El payload está alineado con authCustomerRequired:
 *  - id
 *  - typ === "customer"
 */
export function signCustomerToken({ userId, email, leadId }) {
  const secret = process.env.CUSTOMER_JWT_SECRET;
  if (!secret) {
    throw new Error("CUSTOMER_JWT_SECRET no configurado");
  }

  const payload = {
    id: String(userId),        // 👈 CLAVE: el middleware valida `payload.id`
    email: email || "",
    leadId: leadId || null,
    typ: "customer",           // 👈 CLAVE: el middleware valida `typ === customer`
  };

  return jwt.sign(payload, secret, {
    expiresIn: "30d",          // puedes ajustar
  });
}
