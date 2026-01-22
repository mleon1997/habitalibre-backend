// src/controllers/adminAuth.controller.js
import jwt from "jsonwebtoken";

export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body || {};

    const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      return res.status(500).json({
        ok: false,
        message: "ADMIN_EMAIL/ADMIN_PASSWORD no están configurados en el backend",
      });
    }

    const e = String(email || "").trim().toLowerCase();
    const p = String(password || "");

    if (e !== ADMIN_EMAIL || p !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, message: "Credenciales inválidas" });
    }

    // ✅ UNIFICADO: mismo secret que authMiddleware y adminAuth
    const secret = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
    const expiresIn = process.env.ADMIN_JWT_EXPIRES || "12h";

    const token = jwt.sign(
      {
        typ: "admin",
        type: "admin",
        email: ADMIN_EMAIL,
        rolGeneral: "admin", // ✅ clave
      },
      secret,
      { expiresIn }
    );

    return res.json({ ok: true, token });
  } catch (err) {
    console.error("[adminLogin]", err);
    return res.status(500).json({ ok: false, message: "Error login admin" });
  }
}

