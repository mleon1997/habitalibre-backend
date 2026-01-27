// src/controllers/reportes.controller.js
import Lead from "../models/Lead.js";
import { generarFichaComercialPDF } from "../utils/fichaComercialPdf.js";


const REPORTES_VERSION = "2026-01-27-ficha-v1.2-real";

function hoyEC() {
  return new Date().toLocaleDateString("es-EC", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function pctFrom(a, b, digits = 0) {
  const A = num(a);
  const B = num(b);
  if (A == null || B == null || B === 0) return "-";
  return `${((A / B) * 100).toFixed(digits)}%`;
}

/**
 * GET /api/reportes/ficha/:codigo
 * Busca por Lead.codigo (tu campo real) y genera PDF bajo pedido.
 */
export async function descargarFichaComercial(req, res) {
  try {
    const { codigo } = req.params;

    const lead = await Lead.findOne({ codigo: String(codigo) });
    if (!lead) {
      return res.status(404).json({
        ok: false,
        message: "Lead no encontrado para el código proporcionado",
        version: REPORTES_VERSION,
      });
    }

    // --- Fuentes reales de tu doc ---
    const resultadoObj = lead.resultado || {};
    const scoreObj = lead.score || {};
    const perfil = lead.perfil || {};
    const costos = lead.costos || {};

    // Score: preferimos score.total (0-100). Fallback a scoreHL si existiera.
    const score =
      (num(scoreObj.total) != null ? num(scoreObj.total) : null) ??
      (num(lead.scoreHL) != null ? num(lead.scoreHL) : null) ??
      "-";

    // Números clave (todos del doc real)
    const ingresoMensual = perfil.ingresoTotal ?? lead.ingresoTotal ?? null;
    const tipoIngreso = perfil.tipoIngreso ?? lead.tipoIngreso ?? "-";
    const antiguedadAnios = perfil.antiguedadLaboral ?? lead.antiguedadLaboral ?? "-";

    const tasaAnual = lead.tasaAnual ?? scoreObj.tasaBase ?? null;
    const plazoMeses = lead.plazoMeses ?? scoreObj.plazoMeses ?? null;

    const cuotaEstimada =
      lead.cuotaEstimada ??
      (typeof lead.cuotaEstimadaStr === "string" ? num(lead.cuotaEstimadaStr.replace(/[^\d.]/g, "")) : null) ??
      null;

    const montoMaxVivienda =
      lead.montoMaxVivienda ??
      lead.montoMaxViviendaSugerido ??
      null;

    // Costos
    const entradaUSD = costos.entrada ?? null;
    const costoInicialUSD = costos.costoInicial ?? null;
    const avaluoUSD = costos.avaluo ?? null;

    // Entrada %
    const entradaPct = pctFrom(entradaUSD, montoMaxVivienda, 0);

    // Otros
    const plaza = lead.ciudad ?? "-";
    const preclasif = lead.preclasif ?? "-";
    const productoElegido = lead.productoElegido ?? "-";
    const resultadoOk = resultadoObj.ok === true ? "ok=true" : `ok=${String(resultadoObj.ok ?? "-")}`;

    // “Prioridad” solo tiempos (sin juicio)
    const ventanaCierre = lead.tiempoCompra ?? "-";
    const tiempoOptimoContacto = "≤ 48h"; // si luego lo guardas en el lead, lo reemplazamos por lead.tiempoOptimoContacto

    // Observaciones operativas (factual)
    const docsCount = Array.isArray(lead.documentos) ? lead.documentos.length : 0;
    const accionesCount = Array.isArray(lead.acciones) ? lead.acciones.length : 0;

    const dataPDF = {
      codigo: lead.codigo,
      fecha: hoyEC(),
      plaza,

      score,
      ingresoMensual,
      tipoIngreso,
      antiguedadAnios,

      tasaAnual,
      plazoMeses,
      cuotaEstimada,
      montoMaxVivienda,

      preclasif,
      productoElegido,
      resultadoOk,

      ventanaCierre,
      tiempoOptimoContacto,

      entradaUSD,
      entradaPct,
      costoInicialUSD,
      avaluoUSD,
      segurosAnuales: lead.segurosAnuales ?? null,

      indiceHipoteca: lead.indiceHipoteca ?? "-",

      docsCount,
      accionesCount,
    };

    return generarFichaComercialPDF(res, dataPDF);
  } catch (err) {
    console.error("[reportes] descargarFichaComercial error:", err);
    return res.status(500).json({
      ok: false,
      message: "Error generando la ficha comercial",
      version: REPORTES_VERSION,
    });
  }
}
