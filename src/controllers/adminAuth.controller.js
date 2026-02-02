// src/controllers/adminAuth.controller.js
import jwt from "jsonwebtoken";

export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body || {};

    const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");

    // ✅ Unificamos: ADMIN_JWT_SECRET o fallback a JWT_SECRET
    const JWT_SECRET = String(process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || "").trim();

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      return res.status(500).json({
        ok: false,
        message: "ADMIN_EMAIL/ADMIN_PASSWORD no están configurados",
      });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({
        ok: false,
        message: "ADMIN_JWT_SECRET o JWT_SECRET no está configurado (Render env var)",
      });
    }

    const e = String(email || "").trim().toLowerCase();
    const p = String(password || "");

    if (e !== ADMIN_EMAIL || p !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, message: "Credenciales inválidas" });
    }

    // ✅ Un solo formato y un solo secret
    const token = jwt.sign(
      {
        typ: "admin",          // ✅ tipado estándar
        rolGeneral: "admin",   // ✅ tu check actual
        email: ADMIN_EMAIL,
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({ ok: true, token, email: ADMIN_EMAIL });
  } catch (err) {
    console.error("adminLogin error:", err);
    return res.status(500).json({ ok: false, message: "Error en login admin" });
  }
}
