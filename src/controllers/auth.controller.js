import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Lead from "../models/Lead.js";

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

export async function register(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ msg: "Email y password son requeridos" });
    }

    const emailNorm = String(email).toLowerCase().trim();

    const exists = await User.findOne({ email: emailNorm });
    if (exists) return res.status(409).json({ msg: "Este email ya tiene cuenta" });

    // ✅ buscar el lead más reciente de ese email (para atar “la última simulación”)
    const lead = await Lead.findOne({ email: emailNorm }).sort({ createdAt: -1 });

    const passwordHash = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      email: emailNorm,
      passwordHash,
      nombre: lead?.nombre || "",
      telefono: lead?.telefono || "",
    });

    // ✅ “Claim”: asociar el lead al usuario
    if (lead) {
      lead.userId = user._id;
      await lead.save();
    }

    const token = signToken(user);
    return res.json({
      token,
      user: { id: user._id, email: user.email, nombre: user.nombre },
      claimedLead: !!lead,
    });
  } catch (e) {
    console.error("register error:", e);
    return res.status(500).json({ msg: "Error en registro" });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    const emailNorm = String(email || "").toLowerCase().trim();

    const user = await User.findOne({ email: emailNorm });
    if (!user) return res.status(401).json({ msg: "Credenciales inválidas" });

    const ok = await bcrypt.compare(String(password || ""), user.passwordHash);
    if (!ok) return res.status(401).json({ msg: "Credenciales inválidas" });

    const token = signToken(user);
    return res.json({
      token,
      user: { id: user._id, email: user.email, nombre: user.nombre },
    });
  } catch (e) {
    console.error("login error:", e);
    return res.status(500).json({ msg: "Error en login" });
  }
}

export async function me(req, res) {
  const user = await User.findById(req.user.id).select("email nombre telefono");
  return res.json({ user });
}
