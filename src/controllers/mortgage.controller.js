// src/controllers/mortgage.controller.js
import runMortgageMatcher from "../services/mortgageMatcher.service.js";

/**
 * POST /api/mortgage/match
 * Recibe el perfil del usuario y devuelve:
 * - bestMortgage
 * - rankedMortgages
 * - bancosTop3
 * - subsidies
 * - scenarios
 * - recommendationExplanation
 */
export async function evaluarHipotecas(req, res) {
  try {
    console.log("---- MORTGAGE MATCH DEBUG ----");
    console.log("content-type:", req.headers["content-type"]);
    console.log("body keys:", Object.keys(req.body || {}));
    console.log("body raw:", req.body);

    const input = req.body || {};

    const resultado = await runMortgageMatcher(input);

    console.log(
      "🔥 CONTROLLER recommendationExplanation:",
      resultado?.recommendationExplanation
    );

    return res.status(200).json({
      ok: true,
      ...resultado,
    });
  } catch (error) {
    console.error("[mortgage.controller] evaluarHipotecas error:", error);

    return res.status(500).json({
      ok: false,
      message: "Error al evaluar hipotecas",
      error: error?.message || "MORTGAGE_MATCH_ERROR",
    });
  }
}

/**
 * GET /api/mortgage/catalog
 * Devuelve el catálogo hipotecario actual que usa el matcher.
 * Útil para debug o panel admin futuro.
 */
export async function obtenerCatalogoHipotecario(req, res) {
  try {
    const mod = await import("../config/mortgageCatalog.js");
    const catalog = mod.mortgageCatalog || [];
    const sbu = mod.SBU ?? null;

    return res.status(200).json({
      ok: true,
      sbu,
      total: catalog.length,
      products: catalog,
    });
  } catch (error) {
    console.error("[mortgage.controller] obtenerCatalogoHipotecario error:", error);

    return res.status(500).json({
      ok: false,
      message: "Error al obtener catálogo hipotecario",
      error: error?.message || "MORTGAGE_CATALOG_ERROR",
    });
  }
}