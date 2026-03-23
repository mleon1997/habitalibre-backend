// src/routes/mortgage.routes.js
import express from "express";
import {
  evaluarHipotecas,
  obtenerCatalogoHipotecario,
} from "../controllers/mortgage.controller.js";

const router = express.Router();

/**
 * Debug / admin / validación catálogo
 */
router.get("/catalog", obtenerCatalogoHipotecario);

/**
 * Matcher hipotecario
 * POST /api/mortgage/match
 */
router.post("/match", evaluarHipotecas);

export default router;