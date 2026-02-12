// src/controllers/customerAuth.controller.js
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User.js";
import Lead from "../models/Lead.js";
import { signCustomerToken } from "../utils/jwtCustomer.js";
import { enviarCorreoResetPasswordCustomer } from "../utils/mailerCustomerAuth.js";

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
    ciudad: u.ciudad || "",
    lastLogin: u.lastLogin || null,
  };
}

/**
 * Intenta encontrar un Lead existente por email o teléfono
 * y devolver su _id para linkear currentLeadId.
 */
async function findLeadIdForUser({ emailNorm, telClean }) {
  // 1) por email normalizado en identidades
  if (emailNorm) {
    const byEmail = await Lead.findOne({
      $or: [
        { "identidades.emailNorm": emailNorm },
        { email: emailNorm },
      ],
    })
      .sort({ updatedAt: -1 })
      .select({ _id: 1 })
      .lean();

    if (byEmail?._id) return byEmail._id;
  }

  // 2) por teléfono normalizado
  if (telClean) {
    const byPhone = await Lead.findOne({
      $or: [
        { "identidades.telefonoNorm": telClean },
        { telefono: telClean },
      ],
    })
      .sort({ updatedAt: -1 })
      .select({ _id: 1 })
      .lean();

    if (byPhone?._id) return byPhone._id;
  }

  return null;
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

    if (!nombreTrim) return res.status(400).json({ error: "Nombre es obligatorio" });
    if (!apellidoTrim) return res.status(400).json({ error: "Apellido es obligatorio" });

    const telClean = cleanPhone(telefono);
    if (!isValidEcPhone(telClean)) {
      return res
        .status(400)
        .json({ error: "Teléfono inválido (formato: 09XXXXXXXX)" });
    }

    const exists = await User.findOne({ email: emailNorm });
    if (exists) {
      return res.status(409).json({
        error: "Este email ya tiene cuenta. Inicia sesión.",
        code: "EMAIL_EXISTS",
      });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    // ✅ intenta linkear con lead existente si ya lo capturaste antes
    const leadId = await findLeadIdForUser({ emailNorm, telClean });

    const user = await User.create({
      email: emailNorm,
      passwordHash,
      nombre: nombreTrim,
      apellido: apellidoTrim,
      telefono: telClean,
      currentLeadId: leadId || null,
      lastLogin: new Date(),
    });

    const token = signCustomerToken({
      userId: user._id,
      email: user.email,
      leadId: user.currentLeadId || null,
    });

    return res.json({
      token,
      user: safeUser(user),
      leadId: user.currentLeadId || null,
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
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    // ✅ actualiza lastLogin y trata de linkear lead si estaba vacío
    let currentLeadId = user.currentLeadId || null;
    if (!currentLeadId) {
      const leadId = await findLeadIdForUser({
        emailNorm,
        telClean: cleanPhone(user.telefono),
      });
      if (leadId) currentLeadId = leadId;
    }

    user.lastLogin = new Date();
    user.currentLeadId = currentLeadId;
    await user.save();

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
========================= */
export async function meCustomer(req, res) {
  try {
    const payload = req.customer || req.user || req.usuario || req.auth || null;

    // ✅ soporta token payload { id } o { userId }
    const userId =
      payload?.id || payload?.userId || payload?._id || null;

    if (!userId) return res.status(401).json({ error: "No autorizado" });

    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ error: "No autorizado" });

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

/* =========================
   POST /api/customer-auth/forgot-password
========================= */
export async function forgotPasswordCustomer(req, res) {
  try {
    const { email } = req.body || {};
    const emailNorm = normEmail(email);

    const generic = {
      ok: true,
      message:
        "Si ese email existe, te enviamos un enlace para recuperar tu contraseña.",
    };

    if (!emailNorm || !emailNorm.includes("@")) return res.json(generic);

    const user = await User.findOne({ email: emailNorm });
    if (!user) return res.json(generic);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpiresAt = new Date(Date.now() + 1000 * 60 * 20);
    await user.save();

    const APP_URL = process.env.APP_URL || "http://localhost:5173";
    const resetUrl = `${APP_URL}/#/reset-password?token=${rawToken}`;

    await enviarCorreoResetPasswordCustomer({
      to: emailNorm,
      nombre: user.nombre || "",
      resetUrl,
      expiresMinutes: 20,
    });

    return res.json(generic);
  } catch (err) {
    console.error("🔥 forgotPasswordCustomer error FULL:", err);
    return res.json({
      ok: true,
      message:
        "Si ese email existe, te enviamos un enlace para recuperar tu contraseña.",
    });
  }
}

/* =========================
   POST /api/customer-auth/reset-password
========================= */
export async function resetPasswordCustomer(req, res) {
  try {
    const { token, newPassword } = req.body || {};

    const rawToken = String(token || "").trim();
    const pass = String(newPassword || "");

    if (!rawToken) return res.status(400).json({ error: "Token inválido" });
    if (!pass || pass.trim().length < 6) {
      return res
        .status(400)
        .json({ error: "Contraseña inválida (mínimo 6 caracteres)" });
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        error: "El enlace expiró o no es válido. Solicita uno nuevo.",
        code: "RESET_TOKEN_INVALID",
      });
    }

    user.passwordHash = await bcrypt.hash(pass, 10);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    return res.json({
      ok: true,
      message: "Contraseña actualizada. Ya puedes iniciar sesión.",
    });
  } catch (err) {
    console.error("🔥 resetPasswordCustomer error FULL:", err);
    return res.status(500).json({
      error: "Error al cambiar contraseña",
      detail: err?.message || String(err),
    });
  }
}
