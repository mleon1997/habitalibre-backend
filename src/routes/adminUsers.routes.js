// src/routes/adminUsers.routes.js
import { Router } from "express";
import {
  kpisAdminUsers,
  listarAdminUsers,
  exportAdminUsersCSV,
} from "../controllers/adminUsers.controller.js";

const router = Router();

// KPIs
router.get("/kpis", kpisAdminUsers);

// Export CSV (con filtros)
router.get("/export.csv", exportAdminUsersCSV);

// Listado (con filtros + paginación)
router.get("/", listarAdminUsers);

export default router;
