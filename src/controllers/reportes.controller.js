// src/controllers/reportes.controller.js
import Lead from "../models/Lead.js";
import { generarFichaComercialPDF } from "../utils/fichaComercialPdf.js";

const REPORTES_VERSION = "2026-01-28-ficha-v1.5-plus-perfil-financiero";

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

function firstBoolOrNull(...vals) {
  for (const v of vals) {
    if (v === true) return true;
    if (v === false) return false;
    const s = String(v ?? "").trim().toLowerCase();
    if (s === "true" || s === "1" || s === "si" || s === "sí") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  return null;
}

// ✅ Score HL: evita “0 default”
function getScoreHL(lead) {
  const r = lead?.resultado || {};
  const s = firstNum(
    lead?.scoreHL,
    lead?.decision?.scoreHL,
    r?.puntajeHabitaLibre?.score,
    r?.puntajeHabitaLibre?.puntaje,
    r?.puntajeHabitaLibre,
    r?.scoreHL?.total,
    r?.scoreHL
  );

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

    const codigoFinal =
      lead.codigo || lead.codigoHL || lead.codigoUnico || lead.codigoLead || lead.codigo_lead || code;

    // =========================
    // CORE
    // =========================
    const score = getScoreHL(lead);

    const edad = firstNum(lead?.edad, perfil?.edad, echo?.edad);

    // ✅ Ahora sí: campo plano real es tipo_ingreso
    const tipoIngreso = firstStr(
      lead?.tipo_ingreso,
      lead?.tipoIngreso, // legacy
      perfil?.tipoIngreso,
      echo?.tipoIngreso
    );

    // ✅ Precio vivienda declarado: nuevo campo plano es valor_vivienda
    const valorVivienda = firstNum(
      lead?.valor_vivienda,
      lead?.precio_vivienda,
      lead?.precioVivienda,
      echo?.precioVivienda,
      echo?.precioObjetivo,
      r?.valorVivienda,
      r?.precioVivienda
    );

    // ✅ Entrada USD: nuevo campo plano es entrada_disponible
    const entradaUSD = firstNum(
      lead?.entrada_disponible,
      lead?.entrada,
      lead?.entradaUSD,
      echo?.entrada,
      echo?.entradaUSD,
      costos?.entrada,
      r?.entradaDisponible
    );

    const entradaPct =
      entradaUSD != null && valorVivienda != null && valorVivienda > 0
        ? entradaUSD / valorVivienda
        : null;

    // =========================
    // PERFIL FINANCIERO (para el PDF)
    // =========================
    const ingresoMensual = firstNum(
      lead?.ingreso_mensual,
      perfil?.ingresoTotal,
      perfil?.ingresoMensual,
      echo?.ingresoMensual,
      echo?.ingreso_mensual
    );

    const deudasMensuales = firstNum(
      lead?.deuda_mensual_aprox,
      perfil?.otrasDeudasMensuales,
      perfil?.deudaMensualAprox,
      echo?.otrasDeudasMensuales,
      echo?.deudaMensualAprox,
      echo?.deuda_mensual_aprox
    );

    const afiliadoIess = firstBoolOrNull(
      lead?.afiliado_iess,
      perfil?.afiliadoIess,
      echo?.afiliadoIess,
      echo?.afiliado_iess
    );

    const aniosEstabilidad = firstNum(
      lead?.anios_estabilidad,
      perfil?.aniosEstabilidad,
      echo?.aniosEstabilidad,
      echo?.anios_estabilidad
    );

    const ciudadCompra = firstStr(
      lead?.ciudad_compra,
      perfil?.ciudadCompra,
      echo?.ciudadCompra,
      lead?.ciudad
    );

    const tipoCompra = firstStr(
      lead?.tipo_compra,
      perfil?.tipoCompra,
      echo?.tipoCompra
    );

    const producto = firstStr(
      lead?.producto,
      r?.productoElegido,
      r?.tipoCreditoElegido,
      r?.productoSugerido,
      r?.producto
    );

    // =========================
    // CONTACTO
    // =========================
    const plaza = firstStr(lead?.ciudad, lead?.ciudad_compra, lead?.ciudadCompra);
    const nombre = firstStr(lead?.nombre, lead?.nombreCompleto);
    const telefono = firstStr(lead?.telefono);
    const email = firstStr(lead?.email);

    // ✅ Data final para el PDF (con llaves nuevas esperadas por fichaComercialPdf.js nuevo)
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
      producto,

      valorVivienda,
      entradaUSD,
      entradaPct,

      ingresoMensual,
      deudasMensuales,
      afiliadoIess,
      aniosEstabilidad,
      ciudadCompra,
      tipoCompra,
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
