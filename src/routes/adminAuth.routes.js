// src/routes/adminAuth.routes.js
import { Router } from "express";
import { adminLogin } from "../controllers/adminAuth.controller.js";

const router = Router();

// POST /api/admin/login
router.post("/login", adminLogin);

export default router;
