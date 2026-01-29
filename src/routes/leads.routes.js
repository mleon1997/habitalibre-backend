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
  // ✅ NUEVO
  descargarFichaComercialPDF,
  // ✅ (opcional pero recomendado)
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
   Webhooks públicos
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
      (user?.currentLeadId && (await Lead.findById(user.currentLeadId))) ||
      (await Lead.findOne({ userId }).sort({ createdAt: -1 }));

    if (!lead) {
      return res.status(404).json({ error: "No hay lead asociado" });
    }

    res.json({ lead });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error cargando lead" });
  }
});

/* ===============================
   Público
================================ */
router.post("/", customerOptional, crearLead);

/* ===============================
   🔐 ADMIN (ÚNICO LUGAR PROTEGIDO)
================================ */
router.get("/stats", adminAuth, statsLeads);
router.get("/", adminAuth, listarLeads);

/**
 * ✅ DETALLE lead (admin)
 * Útil para tu UI cuando hagas click en un lead
 */
router.get("/:id", adminAuth, obtenerLeadPorIdAdmin);

/**
 * ✅ PDF FICHA COMERCIAL (admin)
 * - Por ID Mongo
 * - Por código HL
 */
router.get("/:id/ficha-comercial.pdf", adminAuth, descargarFichaComercialPDF);
router.get(
  "/hl/:codigoHL/ficha-comercial.pdf",
  adminAuth,
  descargarFichaComercialPDF
);

export default router;
