// src/routes/reportes.routes.js
import { Router } from "express";
import { authMiddleware, requireAdmin } from "../middlewares/auth.js";
import { descargarFichaComercial } from "../controllers/reportes.controller.js";

const router = Router();

// GET /api/reportes/ficha/:codigo
router.get("/ficha/:codigo", authMiddleware, requireAdmin, descargarFichaComercial);

// ✅ Export BOTH: named + default (para evitar este bug de import)
export const reportesRoutes = router;
export default router;
