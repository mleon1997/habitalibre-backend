// src/controllers/leads.controller.js
import Lead from "../models/Lead.js";
import { enviarCorreoLead, enviarCorreoCliente } from "../utils/mailer.js";
import { mapearBancos } from "../lib/scoring.js";

/**
 * Crear lead desde el simulador o formulario web
 * - Si el frontend no envía `resultado`, lo calculamos con mapearBancos()
 * - Guardamos en Mongo
 * - Disparamos correos (interno + cliente con PDF adjunto) en paralelo
 */

const titleCase = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());

const cleanEmail = (e = "") => String(e).trim();
const safeNum = (v) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null);

function buildResultadoDesdeBody(body = {}) {
  // Compatibilidad con payloads previos del front
  return {
    capacidadPago: safeNum(body.capacidadPago),
    montoMaximo: safeNum(body.montoMaximo),
    ltv: safeNum(body.ltv),
    tasaAnual: safeNum(body.tasaAnual),
    plazoMeses: safeNum(body.plazoMeses),
    dtiConHipoteca: safeNum(body.dtiConHipoteca),
    precioMaxVivienda: safeNum(body.precioMaxVivienda),
    cuotaEstimada: safeNum(body.cuotaEstimada),
    cuotaStress: safeNum(body.cuotaStress),
    productoElegido: body.productoElegido ?? body.tipoCreditoElegido ?? null,
    afinidad:
      body.afinidad ?? body.productoElegido ?? body.tipoCreditoElegido ?? null,
    puntajeHabitaLibre:
      body.puntajeHabitaLibre ?? {
        score: safeNum(body.scoreHL),
        label: body.scoreLabel ?? null,
        categoria: body.scoreCategoria ?? null,
      },
  };
}

function sanityCheckResultado(R = {}) {
  const mustHave = [
    "capacidadPago",
    "montoMaximo",
    "precioMaxVivienda",
    "ltv",
    "tasaAnual",
    "plazoMeses",
    "cuotaEstimada",
    "cuotaStress",
    "dtiConHipoteca",
    "productoElegido",
  ];
  const missing = mustHave.filter((k) => R[k] == null || Number.isNaN(R[k]));
  if (missing.length) {
    console.warn("⚠️ Campos faltantes/NaN en resultado:", missing);
  }
  return { missing, ok: missing.length === 0 };
}

export async function crearLead(req, res) {
  const t0 = Date.now();
  try {
    const body = req.body || {};

    // 1) Construir/Calcular resultado
    let resultado = null;

    if (body.resultado && typeof body.resultado === "object") {
      // Si el front manda `resultado`, lo usamos tal cual
      resultado = body.resultado;
    } else {
      // Si NO manda, intentamos construir desde campos sueltos...
      const provisional = buildResultadoDesdeBody(body);
      const tieneMinimosProvisionales =
        provisional.capacidadPago != null ||
        provisional.montoMaximo != null ||
        provisional.cuotaEstimada != null;

      if (tieneMinimosProvisionales) {
        resultado = provisional;
      } else {
        // ...y si ni eso, calculamos con tu motor de scoring usando el body completo
        // (mapearBancos aplicará reglas VIS/VIP/BIESS/Comercial con `scoring.js`)
        resultado = mapearBancos(body);
      }
    }

    // 2) Sanity check (para detectar por qué veías "—")
    const sanity = sanityCheckResultado(resultado);

    // 3) Guardar lead
    const nuevoLead = await Lead.create({
      ...body,
      // Persistir un resumen útil para el CRM
      resumen: {
        producto: resultado.productoElegido ?? null,
        montoMaximo: safeNum(resultado.montoMaximo) ?? null,
        cuotaEstimada: safeNum(resultado.cuotaEstimada) ?? null,
        tasaAnual: safeNum(resultado.tasaAnual) ?? null,
        plazoMeses: safeNum(resultado.plazoMeses) ?? null,
        ltv: safeNum(resultado.ltv) ?? null,
        dtiConHipoteca: safeNum(resultado.dtiConHipoteca) ?? null,
      },
      nombre: titleCase(body?.nombre || body?.firstName || "Cliente"),
      email: cleanEmail(body?.email || ""),
      ciudad: titleCase(body?.ciudad || ""),
      ip: req.headers["x-forwarded-for"] || req.ip,
      userAgent: req.headers["user-agent"],
      origen: body.origen || "simulador",
      estado: "nuevo",
    });

    // 4) Enviar correos (no bloquear respuesta, pero loggear resultado detallado)
    Promise.allSettled([
      enviarCorreoLead(nuevoLead, resultado),     // notificación interna
      enviarCorreoCliente(nuevoLead, resultado),  // correo al cliente + PDF adjunto
    ]).then((results) => {
      results.forEach((r, i) => {
        const cual = i === 0 ? "enviarCorreoLead" : "enviarCorreoCliente";
        if (r.status === "rejected") {
          console.error(`❌ Error en ${cual}:`, r.reason?.message || r.reason);
        } else {
          console.log(`✅ ${cual} enviado correctamente`);
        }
      });
    });

    const t = ((Date.now() - t0) / 1000).toFixed(2);
    return res.json({
      ok: true,
      lead: nuevoLead,
      resultado, // útil para el front
      debug: { sanityMissing: sanity.missing, tiempo: `${t}s` },
    });
  } catch (err) {
    console.error("❌ Error creando lead:", err);
    res.status(500).json({ ok: false, error: "Error interno al crear lead" });
  }
}

export async function listarLeads(req, res) {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 }).limit(300);
    return res.json({ ok: true, leads });
  } catch (err) {
    console.error("❌ Error listando leads:", err);
    res.status(500).json({ ok: false, error: "Error al listar leads" });
  }
}
