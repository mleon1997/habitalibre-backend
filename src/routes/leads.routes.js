// src/routes/leads.routes.js
import { Router } from "express";
import { crearLead, listarLeads } from "../controllers/leads.controller.js";

const router = Router();

// POST /api/leads -> crear lead
router.post("/", crearLead);

// GET /api/leads -> listar leads (admin)
router.get("/", listarLeads);

export default router;
