// src/routes/adminUsers.routes.js
import { Router } from "express";
import adminAuth from "../middlewares/adminAuth.js";
import {
  kpisAdminUsers,
  listarAdminUsers,
  exportAdminUsersCSV,
} from "../controllers/adminUsers.controller.js";

const router = Router();

// 🔒 Todo el módulo protegido
router.get("/kpis", adminAuth, kpisAdminUsers);
router.get("/export.csv", adminAuth, exportAdminUsersCSV);
router.get("/", adminAuth, listarAdminUsers);

export default router;
