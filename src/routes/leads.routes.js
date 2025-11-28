// src/routes/leads.routes.js
import { Router } from "express";
import {
  crearLead,
  listarLeads,
  statsLeads,
} from "../controllers/leads.controller.js";

import {
  authMiddleware,
  requireAdmin,
} from "../middlewares/auth.js"; // 🔐 NUEVO

const router = Router();

/* ===========================================================
   Crear nuevo lead desde el simulador (PÚBLICO)
   POST /api/leads
   =========================================================== */
router.post("/", crearLead);

/* ===========================================================
   Listar leads (DASHBOARD INTERNO - PROTEGIDO)
   GET /api/leads
   =========================================================== */
router.get("/", authMiddleware, requireAdmin, listarLeads);

/* ===========================================================
   Stats rápidos de leads (INTERNO - PROTEGIDO)
   GET /api/leads/stats
   =========================================================== */
router.get("/stats", authMiddleware, requireAdmin, statsLeads);

/* ===========================================================
   EXPORT
   =========================================================== */
export default router;
