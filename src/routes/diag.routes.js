// src/routes/diag.routes.js
import { Router } from "express";
import { verifySmtp } from "../utils/mailer.js";
import nodemailer from "nodemailer";

const router = Router();

router.get("/send-test", async (req, res) => {
  try {
    const to = req.query.to || process.env.TEST_EMAIL;
    if (!to) return res.status(400).json({ ok: false, error: "Falta ?to" });

    await verifySmtp();
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
        user: process.env.SMTP_USER, pass: process.env.SMTP_PASS,
      } : undefined,
    });

    await t.sendMail({
      from: `${process.env.FROM_NAME || "HabitaLibre"} <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
      to,
      subject: "Prueba SMTP HabitaLibre",
      text: "OK",
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Error" });
  }
});

export default router;
