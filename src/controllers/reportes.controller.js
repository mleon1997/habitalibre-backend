// src/controllers/reportes.controller.js
import Lead from "../models/Lead.js";
import { generarFichaComercialPDF } from "../utils/fichaComercialPdf.js";

const REPORTES_VERSION = "2026-01-27-ficha-v1.3-find-or";

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
 * Busca el lead por múltiples campos de código (codigo, codigoHL, etc.)
 */
export async function descargarFichaComercial(req, res) {
  try {
    const { codigo } = req.params;
    const code = String(codigo || "").trim();

    if (!code) {
      return res.status(400).json({
        ok: false,
        message: "Código requerido",
        version: REPORTES_VERSION,
      });
    }

    // ✅ Buscar por todos los campos típicos
    const lead = await Lead.findOne({
      $or: [
        { codigo: code },
        { codigoHL: code },
        { codigoUnico: code },
        { codigoLead: code },
        { codigo_lead: code },
      ],
    });

    if (!lead) {
      return res.status(404).json({
        ok: false,
        message: "Lead no encontrado para el código proporcionado",
        codigoBuscado: code,
        buscadoEn: ["codigo", "codigoHL", "codigoUnico", "codigoLead", "codigo_lead"],
        version: REPORTES_VERSION,
      });
    }

    const resultadoObj = lead.resultado || {};
    const scoreObj = lead.score || {};
    const perfil = lead.perfil || {};
    const costos = lead.costos || {};

    const score =
      (num(scoreObj.total) != null ? num(scoreObj.total) : null) ??
      (num(lead.scoreHL) != null ? num(lead.scoreHL) : null) ??
      (num(resultadoObj?.puntajeHabitaLibre?.score) != null ? num(resultadoObj?.puntajeHabitaLibre?.score) : null) ??
      "-";

    const ingresoMensual = perfil.ingresoTotal ?? lead.ingresoTotal ?? null;
    const tipoIngreso = perfil.tipoIngreso ?? lead.tipoIngreso ?? "-";
    const antiguedadAnios = perfil.antiguedadLaboral ?? lead.antiguedadLaboral ?? "-";

    const tasaAnual = lead.tasaAnual ?? scoreObj.tasaBase ?? null;
    const plazoMeses = lead.plazoMeses ?? scoreObj.plazoMeses ?? null;

    const cuotaEstimada =
      lead.cuotaEstimada ??
      (typeof lead.cuotaEstimadaStr === "string"
        ? num(lead.cuotaEstimadaStr.replace(/[^\d.]/g, ""))
        : null) ??
      null;

    const montoMaxVivienda =
      lead.montoMaxVivienda ??
      lead.montoMaxViviendaSugerido ??
      null;

    const entradaUSD = costos.entrada ?? null;
    const costoInicialUSD = costos.costoInicial ?? null;
    const avaluoUSD = costos.avaluo ?? null;

    const entradaPct = pctFrom(entradaUSD, montoMaxVivienda, 0);

    const plaza = lead.ciudad ?? "-";
    const preclasif = lead.preclasif ?? "-";
    const productoElegido = lead.productoElegido ?? lead.producto ?? "-";
    const resultadoOk = resultadoObj.ok === true ? "ok=true" : `ok=${String(resultadoObj.ok ?? "-")}`;

    const ventanaCierre = lead.tiempoCompra ?? "-";
    const tiempoOptimoContacto = "≤ 48h";

    const docsCount = Array.isArray(lead.documentos) ? lead.documentos.length : 0;
    const accionesCount = Array.isArray(lead.acciones) ? lead.acciones.length : 0;

    // ✅ Usa el “mejor” código disponible para imprimir
    const codigoFinal =
      lead.codigo || lead.codigoHL || lead.codigoUnico || lead.codigoLead || lead.codigo_lead || code;

    const dataPDF = {
      codigo: codigoFinal,
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
