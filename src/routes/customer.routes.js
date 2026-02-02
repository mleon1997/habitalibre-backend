// src/routes/customer.routes.js
import { Router } from "express";
import { verificarCustomer } from "../middlewares/customerAuth.js";

const router = Router();

/**
 * GET /api/customer/profile
 * Ejemplo de endpoint futuro (opcional)
 */
router.get("/profile", verificarCustomer, (req, res) => {
  return res.json({
    ok: true,
    customer: {
      leadId: req.customer?.leadId || null,
      email: req.customer?.email || null,
    },
  });
});

export default router;
