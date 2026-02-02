// src/routes/reportes.routes.js
import { Router } from "express";
import adminAuth from "../middlewares/adminAuth.js";
import { descargarFichaComercialPDF } from "../controllers/leads.controller.js";

const router = Router();

/**
 * ✅ Ficha comercial (ADMIN)
 * GET /api/reportes/ficha/:codigo
 * Usa EXACTAMENTE el mismo token admin del dashboard
 */
router.get(
  "/ficha/:codigo",
  adminAuth,
  descargarFichaComercialPDF
);

// ✅ Export BOTH (ok, esto está bien)
export const reportesRoutes = router;
export default router;
