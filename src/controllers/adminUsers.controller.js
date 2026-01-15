import User from "../models/User.js";

/**
 * GET /api/admin/users/kpis
 * KPIs básicos del dashboard de usuarios.
 */
export async function kpisAdminUsers(req, res) {
  try {
    const totalUsers = await User.countDocuments({});
    return res.json({ ok: true, totalUsers });
  } catch (err) {
    console.error("[kpisAdminUsers]", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al calcular KPIs de usuarios" });
  }
}
