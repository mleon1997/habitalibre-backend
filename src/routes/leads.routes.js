// src/routes/leads.routes.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import Lead from "../models/Lead.js";
import User from "../models/User.js";

import { crearLead, listarLeads, statsLeads } from "../controllers/leads.controller.js";
import { authMiddleware, requireAdmin } from "../middlewares/auth.js";
import { verificarCustomer } from "../middlewares/customerAuth.js";

const router = Router();

/**
 * Middleware opcional (Opción A):
 * Si viene Bearer token customer válido, setea req.customer = { userId, email }.
 * Si no viene o es inválido, continúa normal (NO bloquea).
 */
function customerOptional(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();

    const secret = process.env.CUSTOMER_JWT_SECRET;
    if (!secret) return next();

    const payload = jwt.verify(token, secret);

    // si viene typ y no es customer -> ignoramos (no bloqueamos)
    if (payload?.typ && payload.typ !== "customer") return next();

    // ✅ Opción A: sub = userId
    const userId = payload?.sub || payload?.userId || payload?.id || null;
    if (!userId) return next();

    req.customer = { userId: String(userId), email: payload?.email || "" };
    return next();
  } catch {
    return next();
  }
}

/* ===========================================================
   ✅ Lead del customer logueado (Opción A)
   GET /api/leads/mine  (PROTEGIDO CUSTOMER)
   - Obtiene userId del token
   - Resuelve el lead actual desde User.currentLeadId (ideal)
   - Fallback: último lead por userId
   =========================================================== */
router.get("/mine", verificarCustomer, async (req, res) => {
  try {
    const userId = req.customer?.userId;
    if (!userId) return res.status(401).json({ error: "Token inválido" });

    // 1) Intentar por currentLeadId (recomendado)
    const user = await User.findById(userId).select("_id currentLeadId").lean();

    let lead = null;

    if (user?.currentLeadId) {
      lead = await Lead.findById(user.currentLeadId).lean();
    }

    // 2) Fallback: último lead asociado a este userId
    if (!lead) {
      lead = await Lead.findOne({ userId }).sort({ createdAt: -1 }).lean();
    }

    if (!lead) {
      return res.status(404).json({ error: "No hay lead asociado a este usuario" });
    }

    return res.json({ lead });
  } catch (err) {
    console.error("GET /api/leads/mine error:", err);
    return res.status(500).json({ error: "Error cargando lead" });
  }
});

/* ===========================================================
   Crear nuevo lead desde el simulador (PÚBLICO)
   POST /api/leads
   ✅ Si viene token customer, el controller puede linkear user/lead
   (Con Opción A: req.customer.userId)
   =========================================================== */
router.post("/", customerOptional, crearLead);

/* ===========================================================
   Admin (PROTEGIDO)
   =========================================================== */
router.get("/stats", authMiddleware, requireAdmin, statsLeads);
router.get("/", authMiddleware, requireAdmin, listarLeads);

export default router;
