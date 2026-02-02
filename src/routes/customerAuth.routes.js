// src/routes/customerAuth.routes.js
import { Router } from "express";
import { loginCustomer } from "../controllers/customerAuth.controller.js";
import { verificarCustomer } from "../middlewares/customerAuth.js";

const router = Router();

/**
 * POST /api/customer-auth/login
 * Body:
 *  - { email, password }
 *  - { email, codigo }
 */
router.post("/login", loginCustomer);

/**
 * GET /api/customer-auth/me
 * Header: Authorization: Bearer <token>
 * Valida token y devuelve info mínima desde el JWT
 */
router.get("/me", verificarCustomer, (req, res) => {
  return res.json({
    ok: true,
    user: {
      leadId: req.customer?.leadId || null,
      email: req.customer?.email || null,
    },
  });
});

export default router;
