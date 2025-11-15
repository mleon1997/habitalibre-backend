// src/routes/leads.routes.js
import { Router } from "express";
import {
  crearLead,
  listarLeads,
  statsLeads,
} from "../controllers/leads.controller.js";

const router = Router();

/* ===========================================================
   Crear nuevo lead desde el simulador
   POST /api/leads
   =========================================================== */
router.post("/", crearLead);

/* ===========================================================
   Listar leads (para dashboard interno)
   GET /api/leads
   Query params:
     - pagina / page (número, default 1)
     - limit (número, default 20)
     - email, telefono, ciudad (filtros suaves)
   =========================================================== */
router.get("/", listarLeads);

/* ===========================================================
   Stats rápidos de leads (total, hoy)
   GET /api/leads/stats
   =========================================================== */
router.get("/stats", statsLeads);

/* ===========================================================
   EXPORT
   =========================================================== */
export default router;
