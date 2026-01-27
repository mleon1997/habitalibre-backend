// src/controllers/reportes.controller.js
import Lead from "../models/Lead.js";
import { generarFichaComercialPDF } from "../utils/fichaComercialPdf.js";

const REPORTES_VERSION = "2026-01-27-ficha-v1.4-web-fields";

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
 * y genera una ficha comercial (solo números y contacto, sin juicios).
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

    // --- fuentes del doc ---
    const resultadoObj = lead.resultado || {};
    const scoreObj = lead.score || {}; // (si existiera)
    const perfilLegacy = lead.perfil || {};
    const costosLegacy = lead.costos || {};

    // ✅ WEB (motor): perfil + echo
    const perfilMotor = resultadoObj?.perfil || {};
    const echo = resultadoObj?._echo || {};

    // -----------------------
    // Campos clave (numéricos)
    // -----------------------

    // Score HL: prioriza lead.scoreHL → resultado.puntajeHabitaLibre.score → score.total
    const score =
      (num(lead?.scoreHL) != null ? num(lead?.scoreHL) : null) ??
      (num(resultadoObj?.puntajeHabitaLibre?.score) != null ? num(resultadoObj?.puntajeHabitaLibre?.score) : null) ??
      (num(scoreObj?.total) != null ? num(scoreObj?.total) : null) ??
      "-";

    // Edad: perfil.edad → _echo.edad → lead.edad
    const edad =
      (num(perfilMotor?.edad) != null ? num(perfilMotor?.edad) : null) ??
      (num(echo?.edad) != null ? num(echo?.edad) : null) ??
      (num(lead?.edad) != null ? num(lead?.edad) : null) ??
      null;

    // Ingreso mensual: perfil.ingresoTotal → _echo.ingresoNetoMensual → lead.ingresoTotal → perfilLegacy.ingresoTotal
    const ingresoMensual =
      (num(perfilMotor?.ingresoTotal) != null ? num(perfilMotor?.ingresoTotal) : null) ??
      (num(echo?.ingresoNetoMensual) != null ? num(echo?.ingresoNetoMensual) : null) ??
      (num(lead?.ingresoTotal) != null ? num(lead?.ingresoTotal) : null) ??
      (num(perfilLegacy?.ingresoTotal) != null ? num(perfilLegacy?.ingresoTotal) : null) ??
      null;

    // Deudas mensuales: _echo.otrasDeudasMensuales → lead.deudaMensual → lead.otrasDeudasMensuales
    const deudaMensual =
      (num(echo?.otrasDeudasMensuales) != null ? num(echo?.otrasDeudasMensuales) : null) ??
      (num(lead?.deudaMensual) != null ? num(lead?.deudaMensual) : null) ??
      (num(lead?.otrasDeudasMensuales) != null ? num(lead?.otrasDeudasMensuales) : null) ??
      null;

    // DTI/LTV/PrecioMax (directo del resultado del motor)
    const dtiConHipoteca =
      (num(resultadoObj?.dtiConHipoteca) != null ? num(resultadoObj?.dtiConHipoteca) : null) ?? null;

    const ltv =
      (num(resultadoObj?.ltv) != null ? num(resultadoObj?.ltv) : null) ?? null;

    const precioMaxVivienda =
      (num(resultadoObj?.precioMaxVivienda) != null ? num(resultadoObj?.precioMaxVivienda) : null) ??
      (num(resultadoObj?.precioMaximoVivienda) != null ? num(resultadoObj?.precioMaximoVivienda) : null) ??
      null;

    // Bancos Top 3 (si existe)
    const bancosTop3 = Array.isArray(resultadoObj?.bancosTop3) ? resultadoObj.bancosTop3 : [];

    // -----------------------
    // Contexto (factual)
    // -----------------------
    const tipoIngreso = perfilMotor?.tipoIngreso ?? lead?.tipoIngreso ?? "-";
    const antiguedadAnios =
      (num(perfilMotor?.aniosEstabilidad) != null ? num(perfilMotor?.aniosEstabilidad) : null) ??
      lead?.antiguedadLaboral ??
      "-";

    const tasaAnual =
      (num(resultadoObj?.tasaAnual) != null ? num(resultadoObj?.tasaAnual) : null) ??
      (num(lead?.tasaAnual) != null ? num(lead?.tasaAnual) : null) ??
      (num(scoreObj?.tasaBase) != null ? num(scoreObj?.tasaBase) : null) ??
      null;

    const plazoMeses =
      (num(resultadoObj?.plazoMeses) != null ? num(resultadoObj?.plazoMeses) : null) ??
      (num(lead?.plazoMeses) != null ? num(lead?.plazoMeses) : null) ??
      (num(scoreObj?.plazoMeses) != null ? num(scoreObj?.plazoMeses) : null) ??
      null;

    const cuotaEstimada =
      (num(resultadoObj?.cuotaEstimada) != null ? num(resultadoObj?.cuotaEstimada) : null) ??
      (num(lead?.cuotaEstimada) != null ? num(lead?.cuotaEstimada) : null) ??
      null;

    // “montoMaxVivienda” (si tuvieras uno) — fallback a resultado.montoMaximo / lead.montoMax...
    const montoMaxVivienda =
      (num(lead?.montoMaxVivienda) != null ? num(lead?.montoMaxVivienda) : null) ??
      (num(lead?.montoMaxViviendaSugerido) != null ? num(lead?.montoMaxViviendaSugerido) : null) ??
      (num(resultadoObj?.montoMaximo) != null ? num(resultadoObj?.montoMaximo) : null) ??
      null;

    // Costos / entrada: si no tienes en lead, intenta resultado.costos
    const costosMotor = resultadoObj?.costos || {};
    const entradaUSD =
      (num(costosLegacy?.entrada) != null ? num(costosLegacy?.entrada) : null) ??
      (num(echo?.entradaDisponible) != null ? num(echo?.entradaDisponible) : null) ??
      (num(lead?.entradaDisponible) != null ? num(lead?.entradaDisponible) : null) ??
      null;

    const costoInicialUSD =
      (num(costosLegacy?.costoInicial) != null ? num(costosLegacy?.costoInicial) : null) ?? null;

    const avaluoUSD =
      (num(costosLegacy?.avaluo) != null ? num(costosLegacy?.avaluo) : null) ??
      (num(costosMotor?.avaluo) != null ? num(costosMotor?.avaluo) : null) ??
      null;

    const segurosAnuales =
      (num(lead?.segurosAnuales) != null ? num(lead?.segurosAnuales) : null) ??
      (num(costosMotor?.segurosAnuales) != null ? num(costosMotor?.segurosAnuales) : null) ??
      null;

    // Entrada %
    const entradaPct = pctFrom(entradaUSD, montoMaxVivienda || precioMaxVivienda, 0);

    // Producto elegido
    const productoElegido =
      resultadoObj?.productoElegido ??
      lead?.productoElegido ??
      lead?.producto ??
      "-";

    const plaza = String(lead?.ciudad || "-").trim() || "-";
    const ventanaCierre = lead?.tiempoCompra ?? "-";

    const resultadoOk = resultadoObj?.ok === true ? "ok=true" : `ok=${String(resultadoObj?.ok ?? "-")}`;

    // Señales operativas (solo conteos)
    const docsCount = Array.isArray(lead.documentos) ? lead.documentos.length : 0;
    const accionesCount = Array.isArray(lead.acciones) ? lead.acciones.length : 0;

    // Contacto (sin juicio)
    const nombre = lead?.nombre ?? lead?.nombreCompleto ?? "-";
    const email = lead?.email ?? "-";
    const telefono = lead?.telefono ?? "-";

    const canal = lead?.metadata?.canal ?? lead?.canal ?? "Web";
    const origen = lead?.origen ?? "Simulador Hipoteca Exprés";

    // Campos informativos (sin juicio)
    const afiliadoIess = perfilMotor?.afiliadoIess ?? null; // "Sí"/"No" o boolean
    const tieneVivienda =
      typeof perfilMotor?.tieneVivienda === "boolean"
        ? (perfilMotor.tieneVivienda ? "Sí" : "No")
        : (typeof lead?.tieneVivienda === "boolean" ? (lead.tieneVivienda ? "Sí" : "No") : "-");

    // ✅ Mejor código para imprimir
    const codigoFinal =
      lead.codigo || lead.codigoHL || lead.codigoUnico || lead.codigoLead || lead.codigo_lead || code;

    const dataPDF = {
      // Identificación
      codigo: codigoFinal,
      fecha: hoyEC(),
      plaza,

      // Contacto / origen
      nombre,
      email,
      telefono,
      canal,
      origen,

      // Métricas (sin juicio)
      score,
      edad,
      ingresoMensual,
      deudaMensual,
      dtiConHipoteca,
      ltv,
      precioMaxVivienda,

      // Contexto del motor
      productoElegido,
      tasaAnual,
      plazoMeses,
      cuotaEstimada,
      montoMaxVivienda,

      // Perfil declarado
      tipoIngreso,
      antiguedadAnios,
      afiliadoIess,
      tieneVivienda,

      // Costos
      entradaUSD,
      entradaPct,
      costoInicialUSD,
      avaluoUSD,
      segurosAnuales,

      // Otros
      resultadoOk,
      ventanaCierre,
      tiempoOptimoContacto: "≤ 48h",

      // Operación
      docsCount,
      accionesCount,

      // Bancos
      bancosTop3,
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
