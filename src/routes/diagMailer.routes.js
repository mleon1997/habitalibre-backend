// src/routes/diagMailer.routes.js
import { Router } from "express";
import { normalizeResultadoParaSalida } from "../utils/hlResultado.js";

const router = Router();

/**
 * POST /api/diag/mailer-check
 * Devuelve lo que interesa para validar consistencia:
 * - sinOferta final (ya normalizado)
 * - capacidadPago (normalizada)
 * - producto/banco flat (normalizados)
 */
router.post("/mailer-check", (req, res) => {
  try {
    const { lead = {}, resultado = {} } = req.body || {};

    const norm = normalizeResultadoParaSalida(resultado);

    return res.json({
      ok: true,
      lead: {
        nombre: lead?.nombre || null,
        email: lead?.email || null,
        codigoHL: lead?.codigoHL || null,
      },
      normalized: {
        sinOferta: norm?.flags?.sinOferta === true,
        capacidadPago: norm?.capacidadPagoPrograma ?? norm?.capacidadPago ?? norm?.capacidadPagoGlobal ?? null,
        cuotaEstimada: norm?.cuotaEstimada ?? null,
        productoSugerido: norm?.productoSugerido ?? null,
        bancoSugerido: norm?.bancoSugerido ?? null,
      },
      flags: norm?.flags || {},
    });
  } catch (err) {
    console.error("[mailer-check]", err);
    return res.status(500).json({ ok: false, message: err?.message || "Error" });
  }
});

export default router;
