// src/controllers/reportes.controller.js
import Lead from "../models/Lead.js";
import { generarFichaComercialPDF } from "../utils/fichaComercialPdf.js";

const REPORTES_VERSION = "2026-01-27-ficha-v1.5-focus-core";

function hoyEC() {
  return new Date().toLocaleDateString("es-EC", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function toNumOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstNum(...vals) {
  for (const v of vals) {
    const n = toNumOrNull(v);
    if (n != null) return n;
  }
  return null;
}

function firstStr(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "-";
}

// ✅ Score HL: evita “0 default” (si tu score real es 0-100, 0 normalmente = no calculado)
function getScoreHL(lead) {
  const r = lead?.resultado || {};
  const s =
    firstNum(
      lead?.scoreHL,
      lead?.decision?.scoreHL,
      r?.puntajeHabitaLibre?.score,
      r?.puntajeHabitaLibre?.puntaje,
      r?.puntajeHabitaLibre
    );

  // Si viene 0, lo tratamos como “no disponible”
  if (s === 0) return null;
  return s != null ? s : null;
}

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

    const r = lead?.resultado || {};
    const echo = r?._echo || {};
    const perfil = r?.perfil || {};
    const costos = r?.costos || lead?.costos || {};

    // ✅ Código final para imprimir
    const codigoFinal =
      lead.codigo || lead.codigoHL || lead.codigoUnico || lead.codigoLead || lead.codigo_lead || code;

    // ✅ Campos core que SÍ quieres
    const score = getScoreHL(lead);

    const edad = firstNum(
      lead?.edad,
      perfil?.edad,
      echo?.edad
    );

    const tipoIngreso = firstStr(
      lead?.tipoIngreso,
      perfil?.tipoIngreso,
      echo?.tipoIngreso
    );

    // ✅ Precio vivienda (declarado) — NO “max”
    // Ajusta los keys según tu motor: aquí puse los más típicos que he visto en tus estructuras
    const precioVivienda = firstNum(
      lead?.precio_vivienda,
      lead?.precioVivienda,
      echo?.precioVivienda,
      echo?.precioObjetivo,
      r?.precioVivienda
    );

    // ✅ Entrada (USD) y % (si hay precio)
    const entradaUSD = firstNum(
      lead?.entrada,
      lead?.entradaUSD,
      echo?.entrada,
      echo?.entradaUSD,
      costos?.entrada
    );

    const entradaPct =
      (entradaUSD != null && precioVivienda != null && precioVivienda > 0)
        ? (entradaUSD / precioVivienda)
        : null;

    // (Opcional) Plaza + contacto, se mantienen porque ayudan al ejecutivo y no “ensucian”
    const plaza = firstStr(lead?.ciudad, lead?.ciudad_compra, lead?.ciudadCompra);
    const nombre = firstStr(lead?.nombre, lead?.nombreCompleto);
    const telefono = firstStr(lead?.telefono);
    const email = firstStr(lead?.email);

    const dataPDF = {
      codigo: codigoFinal,
      fecha: hoyEC(),
      plaza,

      nombre,
      telefono,
      email,

      score,
      edad,
      tipoIngreso,
      precioVivienda,
      entradaUSD,
      entradaPct,
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


