// src/routes/customerAuth.routes.js
import { Router } from "express";
import {
  registerCustomer,
  loginCustomer,
  meCustomer,
  forgotPasswordCustomer,
  resetPasswordCustomer,
} from "../controllers/customerAuth.controller.js";
import { verificarCustomer } from "../middlewares/customerAuth.js";

const router = Router();

/**
 * POST /api/customer-auth/register
 * body: { email, password, nombre, apellido, telefono }
 */
router.post("/register", registerCustomer);

// Alias opcional (por si FE usa "signup")
router.post("/signup", registerCustomer);

/**
 * POST /api/customer-auth/login
 * body: { email, password } o { email, codigo }
 */
router.post("/login", loginCustomer);

/**
 * GET /api/customer-auth/me
 * header: Authorization: Bearer <token>
 */
router.get("/me", verificarCustomer, meCustomer);

/**
 * POST /api/customer-auth/forgot-password
 * body: { email }
 */
router.post("/forgot-password", forgotPasswordCustomer);

/**
 * POST /api/customer-auth/reset-password
 * body: { token, newPassword }
 */
router.post("/reset-password", resetPasswordCustomer);

export default router;
