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
 * ✅ Para Opción A, este endpoint solo valida token y devuelve lo que ya viene en el JWT.
 * (No depende del controller)
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
