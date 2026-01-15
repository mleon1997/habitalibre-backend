import { Router } from "express";
import { kpisAdminUsers } from "../controllers/adminUsers.controller.js";

const router = Router();

// KPIs (por ahora: total de usuarios)
router.get("/kpis", kpisAdminUsers);

export default router;
