// src/routes/adminUsers.routes.js
import { Router } from "express";
import adminAuth from "../middlewares/adminAuth.js";
import {
  kpisAdminUsers,
  listAdminUsers,
  exportAdminUsersCSV,
} from "../controllers/adminUsers.controller.js";

const router = Router();

// Protegido
router.get("/kpis", adminAuth, kpisAdminUsers);
router.get("/", adminAuth, listAdminUsers);
router.get("/export/csv", adminAuth, exportAdminUsersCSV);

export default router;
