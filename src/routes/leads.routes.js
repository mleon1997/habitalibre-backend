// src/routes/leads.routes.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import Lead from "../models/Lead.js";
import User from "../models/User.js";

import {
  crearLead,
  listarLeads,
  statsLeads,
  crearLeadWhatsapp,
  crearLeadManychat,
  crearLeadInstagram,
  descargarFichaComercialPDF,
  obtenerLeadPorIdAdmin,
} from "../controllers/leads.controller.js";

import { verificarCustomer } from "../middlewares/customerAuth.js";
import adminAuth from "../middlewares/adminAuth.js"; // ✅ ÚNICO middleware admin

const router = Router();

/* ===============================
   Customer optional
================================ */
function customerOptional(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();

    const secret = process.env.CUSTOMER_JWT_SECRET;
    if (!secret) return next();

    const payload = jwt.verify(token, secret);
    if (payload?.typ && payload.typ !== "customer") return next();

    const userId = payload?.sub || payload?.userId || payload?.id;
    if (!userId) return next();

    req.customer = { userId: String(userId), email: payload?.email || "" };
    return next();
  } catch {
    return next();
  }
}

/* ===============================
   Webhooks públicos (ManyChat)
   ✅ OJO: si quieres asegurar, agrega verificación X-API-KEY aquí
   (pero ahora lo haces dentro del controller con getApiKeyOk)
================================ */
router.post("/manychat", crearLeadManychat);
router.post("/instagram", crearLeadInstagram);
router.post("/whatsapp", crearLeadWhatsapp);

router.get("/whatsapp/ping", (_req, res) => res.json({ ok: true }));
router.get("/manychat/ping", (_req, res) => res.json({ ok: true }));

/* ===============================
   Customer
================================ */
router.get("/mine", verificarCustomer, async (req, res) => {
  try {
    const userId = req.customer?.userId;
    if (!userId) return res.status(401).json({ error: "Token inválido" });

    const user = await User.findById(userId).lean();
    const lead =
      (user?.currentLeadId && (await Lead.findById(user.currentLeadId).lean())) ||
      (await Lead.findOne({ userId }).sort({ createdAt: -1 }).lean());

    if (!lead) {
      return res.status(404).json({ error: "No hay lead asociado" });
    }

    return res.json({ lead });
  } catch (err) {
    console.error("❌ /mine:", err);
    return res.status(500).json({ error: "Error cargando lead" });
  }
});

/* ===============================
   Público (Web Form)
================================ */
router.post("/", customerOptional, crearLead);

/* ===============================
   🔐 ADMIN
   ✅ IMPORTANTE: rutas específicas ANTES de "/:id"
================================ */
router.get("/stats", adminAuth, statsLeads);
router.get("/", adminAuth, listarLeads);

/**
 * ✅ PDF por código HL (admin) — DEBE IR ANTES de "/:id"
 */
router.get(
  "/hl/:codigoHL/ficha-comercial.pdf",
  adminAuth,
  descargarFichaComercialPDF
);

/**
 * ✅ PDF por ID (admin)
 */
router.get("/:id/ficha-comercial.pdf", adminAuth, descargarFichaComercialPDF);

/**
 * ✅ DETALLE lead (admin)
 */
router.get("/:id", adminAuth, obtenerLeadPorIdAdmin);

export default router;
