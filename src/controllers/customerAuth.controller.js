// src/controllers/customerAuth.controller.js
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { signCustomerToken } from "../utils/jwtCustomer.js"; // ✅ ajusta si tu path/nombre es distinto

function normEmail(email) {
  return String(email || "").toLowerCase().trim();
}

function cleanPhone(v) {
  return String(v || "").replace(/[^\d]/g, "");
}

function isValidEcPhone(v) {
  const p = cleanPhone(v);
  return p.length === 10 && p.startsWith("09");
}

function safeUser(u) {
  if (!u) return null;
  return {
    id: u._id,
    email: u.email,
    nombre: u.nombre || "",
    apellido: u.apellido || "",
    telefono: u.telefono || "",
  };
}

/* =========================
   POST /api/customer-auth/register
   body: { email, password, nombre, apellido, telefono }
========================= */
export async function registerCustomer(req, res) {
  try {
    const { email, password, nombre, apellido, telefono } = req.body || {};
    const emailNorm = normEmail(email);

    if (!emailNorm || !emailNorm.includes("@")) {
      return res.status(400).json({ error: "Email inválido" });
    }
    if (!password || String(password).trim().length < 6) {
      return res
        .status(400)
        .json({ error: "Contraseña inválida (mínimo 6 caracteres)" });
    }

    const nombreTrim = String(nombre || "").trim();
    const apellidoTrim = String(apellido || "").trim();

    if (!nombreTrim) {
      return res.status(400).json({ error: "Nombre es obligatorio" });
    }
    if (!apellidoTrim) {
      return res.status(400).json({ error: "Apellido es obligatorio" });
    }

    const telClean = cleanPhone(telefono);
    if (!isValidEcPhone(telClean)) {
      return res
        .status(400)
        .json({ error: "Teléfono inválido (formato: 09XXXXXXXX)" });
    }

    // 1) Si ya existe usuario -> error claro
    const exists = await User.findOne({ email: emailNorm });
    if (exists) {
      return res.status(409).json({
        error: "Este email ya tiene cuenta. Inicia sesión.",
        code: "EMAIL_EXISTS",
      });
    }

    // 2) Crear usuario
    const passwordHash = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      email: emailNorm,
      passwordHash,
      nombre: nombreTrim,
      apellido: apellidoTrim,
      telefono: telClean,
      currentLeadId: null, // ✅ journey independiente
    });

    // 3) Token
    const token = signCustomerToken({
      userId: user._id,
      email: user.email,
      leadId: null,
    });

    return res.json({
      token,
      user: safeUser(user),
      leadId: null,
      registerMethod: "password",
    });
  } catch (err) {
    console.error("🔥 registerCustomer error FULL:", err);
    return res.status(500).json({
      error: "Error en registro",
      detail: err?.message || String(err),
    });
  }
}

/* =========================
   POST /api/customer-auth/login
   body: { email, password }
========================= */
export async function loginCustomer(req, res) {
  try {
    const { email, password } = req.body || {};
    const emailNorm = normEmail(email);

    if (!emailNorm || !emailNorm.includes("@")) {
      return res.status(400).json({ error: "Email inválido" });
    }
    if (!password || String(password).trim().length < 6) {
      return res
        .status(400)
        .json({ error: "Contraseña inválida (mínimo 6 caracteres)" });
    }

    const user = await User.findOne({ email: emailNorm });
    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = signCustomerToken({
      userId: user._id,
      email: user.email,
      leadId: user.currentLeadId || null,
    });

    return res.json({
      token,
      user: safeUser(user),
      leadId: user.currentLeadId || null,
      loginMethod: "password",
    });
  } catch (err) {
    console.error("🔥 loginCustomer error FULL:", err);
    return res.status(500).json({
      error: "Error en login",
      detail: err?.message || String(err),
    });
  }
}

/* =========================
   GET /api/customer-auth/me
   Requiere middleware que decodifique token y ponga userId en req
========================= */
export async function meCustomer(req, res) {
  try {
    // soporta diferentes middlewares: req.customer, req.user, req.usuario
    const payload =
      req.customer ||
      req.user ||
      req.usuario ||
      req.auth ||
      null;

    const userId = payload?.userId || payload?.id || payload?._id || null;

    if (!userId) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ error: "No autorizado" });
    }

    return res.json({
      user: safeUser(user),
      leadId: user.currentLeadId || null,
    });
  } catch (err) {
    console.error("🔥 meCustomer error FULL:", err);
    return res.status(500).json({
      error: "Error en /me",
      detail: err?.message || String(err),
    });
  }
}
