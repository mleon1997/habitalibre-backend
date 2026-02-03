// src/routes/reportes.routes.js
import { Router } from "express";
import adminAuth from "../middlewares/adminAuth.js";
import { descargarFichaComercialPDF } from "../controllers/leads.controller.js";

const router = Router();

/**
 * ✅ Ficha comercial (ADMIN)
 * GET /api/reportes/ficha/:codigo
 * Reutiliza descargarFichaComercialPDF pero mapea :codigo → :codigoHL
 */
router.get("/ficha/:codigo", adminAuth, (req, res, next) => {
  req.params.codigoHL = req.params.codigo; // ✅ puente clave
  return descargarFichaComercialPDF(req, res, next);
});

export const reportesRoutes = router;
export default router;
