// src/controllers/customerLeads.controller.js
import CustomerLead from "../models/CustomerLead.js";

function normalizeEntrada(body = {}) {
  // soporta: entrada (nuevo), input (viejo), metadata.input (viejo)
  const entrada =
    body?.entrada ??
    body?.input ??
    body?.metadata?.input ??
    {};

  return entrada && typeof entrada === "object" ? entrada : {};
}

/**
 * POST /api/customer/leads/save-journey
 * Guarda el progreso del simulador en la cuenta del customer logueado.
 */
export async function guardarLeadJourneyCustomer(req, res) {
  try {
    const customerId = req.customer?.id;
    if (!customerId) return res.status(401).json({ ok: false, message: "No autorizado" });

    const { resultado, status } = req.body || {};
    const entrada = normalizeEntrada(req.body);

    const doc = await CustomerLead.findOneAndUpdate(
      { customerId },
      {
        customerId,
        customerEmail: req.customer?.email || "",

        // ✅ canonical
        entrada,

        // ✅ compat: mantiene input y metadata.input para que nada viejo se rompa
        input: entrada,
        metadata: { input: entrada },

        resultado: resultado || {},
        status: status || "precalificado",
        source: "journey",
      },
      { upsert: true, new: true }
    ).lean();

    // ✅ respuesta normalizada: siempre incluye entrada
    return res.json({ ok: true, lead: { ...(doc || {}), entrada: doc?.entrada || entrada } });
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

    if (!doc) return res.json({ ok: true, lead: null });

    // ✅ normaliza: si por algún motivo entrada no existe, recupérala de input / metadata.input
    const entrada = doc?.entrada || doc?.input || doc?.metadata?.input || {};

    return res.json({
      ok: true,
      lead: {
        ...doc,
        entrada,
      },
    });
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
