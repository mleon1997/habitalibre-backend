// src/routes/ig.routes.js
import { Router } from "express";
import { igSendText } from "../services/igSend.js";

const router = Router();

/**
 * POST /api/ig/send-test
 * Acepta { recipientId, text } o { toUserId, text }
 */
router.post("/send-test", async (req, res) => {
  try {
    const toUserId = req.body?.toUserId || req.body?.recipientId;
    const text = req.body?.text;

    if (!toUserId) {
      return res.status(400).json({ ok: false, error: "recipientId requerido" });
    }
    if (!text) {
      return res.status(400).json({ ok: false, error: "text requerido" });
    }

    const data = await igSendText({ toUserId, text });
    return res.json({ ok: true, data });
  } catch (err) {
    console.error("❌ /api/ig/send-test error:", err?.message || err);
    return res.status(500).json({ ok: false, error: err?.message || "Error" });
  }
});

export default router;
