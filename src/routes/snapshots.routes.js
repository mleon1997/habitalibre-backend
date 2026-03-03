import express from "express";
import mongoose from "mongoose";
import UserSnapshot from "../models/UserSnapshot.js";
import { calcularPreparacion } from "../services/preparacionEngine.js";
import { generarMensajeGuia } from "../services/guiaEngine.js";

// ✅ Middleware real: named export
import { authCustomerRequired as authMiddleware } from "../middlewares/authCustomer.js";

const router = express.Router();

function resolveUserId(req) {
  // authCustomerRequired setea req.customer = { id, ... }
  return (
    req.customer?.id ||
    req.user?.id ||
    req.user?._id ||
    req.usuario?._id ||
    null
  );
}

function toObjectId(id) {
  try {
    if (!id) return null;
    // si ya viene como ObjectId, mongoose lo soporta igual,
    // pero lo normalizamos por seguridad:
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

/**
 * POST /api/snapshots
 * body: { input, output }
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userIdRaw = resolveUserId(req);
    const userId = toObjectId(userIdRaw);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "No autenticado" });
    }

    const { input, output } = req.body || {};
    if (!input || !output) {
      return res
        .status(400)
        .json({ ok: false, error: "Debes enviar { input, output }" });
    }

    const base = {
      userId,
      input,
      output,
    };

    const prep = calcularPreparacion(base);

    base.preparacionPorRuta = {
      biess: prep.biess,
      privada: prep.privada,
      vis: prep.vis,
    };
    base.rutaRecomendada = prep.rutaRecomendada;

    base.guia = generarMensajeGuia({
      ...base,
      preparacionPorRuta: base.preparacionPorRuta,
      rutaRecomendada: base.rutaRecomendada,
    });

    const snapshot = await UserSnapshot.create(base);

    return res.json({ ok: true, snapshot });
  } catch (e) {
    console.error("❌ POST /api/snapshots:", e);
    return res
      .status(500)
      .json({ ok: false, error: "Error guardando snapshot" });
  }
});

/**
 * GET /api/snapshots/latest
 */
router.get("/latest", authMiddleware, async (req, res) => {
  try {
    const userIdRaw = resolveUserId(req);
    const userId = toObjectId(userIdRaw);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "No autenticado" });
    }

    const snapshot = await UserSnapshot.findOne({ userId })
      .sort({ fecha: -1 })
      .lean();

    return res.json({ ok: true, snapshot: snapshot || null });
  } catch (e) {
    console.error("❌ GET /api/snapshots/latest:", e);
    return res
      .status(500)
      .json({ ok: false, error: "Error obteniendo snapshot" });
  }
});

/**
 * GET /api/snapshots/history?limit=10
 */
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const userIdRaw = resolveUserId(req);
    const userId = toObjectId(userIdRaw);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "No autenticado" });
    }

    const limit = Math.min(Number(req.query.limit || 10), 50);

    const snapshots = await UserSnapshot.find({ userId })
      .sort({ fecha: -1 })
      .limit(limit)
      .lean();

    return res.json({ ok: true, snapshots });
  } catch (e) {
    console.error("❌ GET /api/snapshots/history:", e);
    return res
      .status(500)
      .json({ ok: false, error: "Error obteniendo historial" });
  }
});

export default router;