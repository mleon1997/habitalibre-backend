// src/controllers/customerLeads.controller.js
import CustomerLead from "../models/CustomerLead.js";

/**
 * POST /api/customer/leads/save-journey
 * Guarda el progreso del simulador en la cuenta del customer logueado.
 */
export async function guardarLeadJourneyCustomer(req, res) {
  try {
    const customerId = req.customer?.id;
    if (!customerId) return res.status(401).json({ ok: false, message: "No autorizado" });

    const { entrada, resultado, status } = req.body || {};

    const doc = await CustomerLead.findOneAndUpdate(
      { customerId },
      {
        customerId,
        customerEmail: req.customer?.email || "",
        entrada: entrada || {},
        resultado: resultado || {},
        status: status || "precalificado",
        source: "journey",
      },
      { upsert: true, new: true }
    );

    return res.json({ ok: true, lead: doc }); // 👈 "lead" para tu Progreso.jsx
  } catch (err) {
    console.error("[guardarLeadJourneyCustomer]", err);
    return res.status(500).json({ ok: false, message: "Error guardando progreso" });
  }
}

/**
 * GET /api/customer/leads/mine
 * Devuelve el progreso guardado del customer logueado.
 */
export async function obtenerLeadMineCustomer(req, res) {
  try {
    const customerId = req.customer?.id;
    if (!customerId) return res.status(401).json({ ok: false, message: "No autorizado" });

    const doc = await CustomerLead.findOne({ customerId }).lean();
    return res.json({ ok: true, lead: doc || null }); // 👈 "lead"
  } catch (err) {
    console.error("[obtenerLeadMineCustomer]", err);
    return res.status(500).json({ ok: false, message: "Error cargando progreso" });
  }
}

/* =========================
   Aliases para que routes viejas no rompan
========================= */
export const guardarJourneyCustomer = guardarLeadJourneyCustomer;
export const guardarLeadJourney = guardarLeadJourneyCustomer;
export const obtenerMineCustomer = obtenerLeadMineCustomer;

