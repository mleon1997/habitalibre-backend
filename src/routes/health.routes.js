// src/routes/health.routes.js
import { Router } from "express";
const router = Router();

router.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "HabitaLibre API",
    time: new Date().toISOString(),
    pid: process.pid,
    env: process.env.NODE_ENV || "development",
  });
});

export default router;


