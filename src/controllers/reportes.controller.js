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

function toNumOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeStr(v, fallback = "-") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

// Busca primer número válido dentro de una lista de “paths” ya resueltos
function firstNum(...vals) {
  for (const v of vals) {
    const n = toNumOrNull(v);
    if (n != null) return n;
  }
  return null;
}

// Devuelve primer string “usable”
function firstStr(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "-";
}

// Intenta normalizar canal/origen para el PDF (solo informativo)
function getCanal(lead) {
  // 1) canal directo
  const c = String(lead?.canal || "").trim();
  if (c) return c;

  // 2) metadata.canal
  const mc = String(lead?.metadata?.canal || "").trim();
  if (mc) return mc;

  // 3) fallback: si no, Web
  return "Web";
}

function getOrigen(lead) {
  const o = String(lead?.origen || "").trim();
  if (o) return o;
  // si tu backend guarda fuente/origen de otra forma, ponlo aquí
  return "Simulador Hipoteca Exprés";
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

    // =========================
    // Fuentes internas
    // =========================
    const r = lead?.resultado || {};
    const echo = r?._echo || {};
    const perfil = r?.perfil || {};

    // =========================
    // Score HL (NO debe caer en 0)
    // =========================
    const score =
      firstNum(
        lead?.scoreHL,
        r?.puntajeHabitaLibre?.score,
        r?.puntajeHabitaLibre?.puntaje,
        r?.puntajeHabitaLibre
      ) ?? null;

    // =========================
    // Contacto / básicos
    // =========================
    const nombre = firstStr(lead?.nombre, lead?.nombreCompleto);
    const email = firstStr(lead?.email);
    const telefono = firstStr(lead?.telefono);

    const plaza = firstStr(lead?.ciudad, lead?.ciudad_compra, lead?.ciudadCompra);
    const canal = getCanal(lead);
    const origen = getOrigen(lead);

    // =========================
    // Edad / ingreso / deudas
    // =========================
    const edad = firstNum(lead?.edad, perfil?.edad, echo?.edad);

    const ingresoMensual = firstNum(
      lead?.ingreso_mensual,
      lead?.ingresoMensual,
      lead?.ingresoTotal,
      perfil?.ingresoTotal,
      echo?.ingresoNetoMensual,
      echo?.ingresoTotal
    );

    const deudaMensual = firstNum(
      lead?.deuda_mensual_aprox,
      lead?.deudaMensual,
      perfil?.otrasDeudasMensuales,
      echo?.otrasDeudasMensuales
    );

    // =========================
    // Métricas motor
    // =========================
    const dtiConHipoteca = firstNum(
      r?.dtiConHipoteca,
      r?.dti_con_hipoteca,
      r?.dti
    );

    const ltv = firstNum(r?.ltv, r?.LTV);

    const productoElegido = firstStr(
      r?.productoElegido,
      r?.tipoCreditoElegido,
      lead?.producto,
      lead?.tipoProducto
    );

    const ventanaCierre = firstStr(lead?.tiempoCompra, lead?.tiempo_compra);

    const tasaAnual = firstNum(r?.tasaAnual, r?.tasa_anual, r?.stressTest?.tasaBase, r?.costos?.tcea);
    const plazoMeses = firstNum(r?.plazoMeses, r?.plazo_meses);

    const cuotaEstimada = firstNum(r?.cuotaEstimada, r?.cuota_estimada, r?.capacidadPago);

    const precioMaxVivienda = firstNum(
      r?.precioMaxVivienda,
      r?.precioMaximoVivienda,
      r?.precioMaximo,
      r?.precioMax
    );

    const montoMaxPrestamo = firstNum(
      r?.montoMaximo,
      r?.montoMax,
      r?.montoMaximoPrestamo,
      r?.montoMaximoCredito
    );

    // =========================
    // Perfil / reglas (solo factual)
    // =========================
    const tipoIngreso = firstStr(perfil?.tipoIngreso, lead?.tipoIngreso);
    const antiguedadAnios = firstNum(perfil?.aniosEstabilidad, lead?.anios_estabilidad, lead?.aniosEstabilidad);
    const afiliadoIess = firstStr(perfil?.afiliadoIess, lead?.afiliado_iess);
    // "Primera vivienda" -> en tu perfil viene como tieneVivienda (false => primera vivienda Sí)
    // Para no “interpretar”, lo mandamos como viene: true/false/"-"
    const tieneVivienda = (perfil?.tieneVivienda !== undefined && perfil?.tieneVivienda !== null)
      ? String(perfil.tieneVivienda)
      : (lead?.tieneVivienda != null ? String(lead.tieneVivienda) : "-");

    // =========================
    // Top 3 bancos: viene en resultado (web)
    // =========================
    const bancosTop3 = Array.isArray(r?.bancosTop3) ? r.bancosTop3 : [];

    // =========================
    // Conteos (si existen)
    // =========================
    const docsCount = Array.isArray(lead?.documentos) ? lead.documentos.length : 0;
    const accionesCount = Array.isArray(lead?.acciones) ? lead.acciones.length : 0;

    // =========================
    // Código final
    // =========================
    const codigoFinal =
      lead.codigo || lead.codigoHL || lead.codigoUnico || lead.codigoLead || lead.codigo_lead || code;

    // =========================
    // Data para PDF (alineado a fichaComercialPdf.js)
    // =========================
    const dataPDF = {
      codigo: codigoFinal,
      fecha: hoyEC(),
      plaza,

      // contacto
      nombre,
      telefono,
      email,

      // métricas
      score,
      edad,
      ingresoMensual,
      deudaMensual,
      dtiConHipoteca,
      ltv,

      productoElegido,
      ventanaCierre,

      tasaAnual,
      plazoMeses,
      cuotaEstimada,

      precioMaxVivienda,
      montoMaxPrestamo,

      // perfil
      tipoIngreso,
      antiguedadAnios,
      afiliadoIess: afiliadoIess === "true" ? "Sí" : afiliadoIess === "false" ? "No" : afiliadoIess,
      tieneVivienda,

      // bancos
      bancosTop3,

      // contexto
      origen,
      canal,

      // conteos
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

