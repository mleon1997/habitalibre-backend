// src/routes/customerAuth.routes.js
import { Router } from "express";
import {
  loginCustomer,
  meCustomer,
  registerCustomer,
} from "../controllers/customerAuth.controller.js";
import { verificarCustomer } from "../middlewares/customerAuth.js";

const router = Router();

// ✅ REGISTRO (Journey independiente)
router.post("/register", registerCustomer);

// ✅ LOGIN
router.post("/login", loginCustomer);

// ✅ PERFIL (token)
router.get("/me", verificarCustomer, meCustomer);

export default router;
