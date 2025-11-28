// src/routes/auth.routes.js
import express from "express";
import { generarTokenAdmin } from "../middlewares/auth.js";

const router = express.Router();

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post("/login", (req, res) => {
  const { email, password } = req.body || {};

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return res
      .status(500)
      .json({ error: "Credenciales de admin no configuradas en .env" });
  }

  if (email !== adminEmail || password !== adminPassword) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  const token = generarTokenAdmin(email);
  return res.json({ token });
});

export default router;
