// src/routes/adminUsers.routes.js
import { Router } from "express";
import adminAuth from "../middlewares/adminAuth.js";
import {
  kpisAdminUsers,
  listAdminUsers,
  exportAdminUsersCSV,
} from "../controllers/adminUsers.controller.js";

const router = Router();

// 🔒 TODAS protegidas
router.use(adminAuth);

router.get("/kpis", kpisAdminUsers);
router.get("/", listAdminUsers);
router.get("/export/csv", exportAdminUsersCSV);

export default router;
