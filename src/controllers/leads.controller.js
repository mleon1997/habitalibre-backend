// src/controllers/leads.controller.js
import Lead from "../models/Lead.js";
import User from "../models/User.js";
import { enviarCorreoCliente, enviarCorreoLead } from "../utils/mailer.js";
import { generarCodigoHLDesdeObjectId } from "../utils/codigoHL.js";
import { normalizeResultadoParaSalida } from "../utils/hlResultado.js";

// ✅ PDF ficha comercial
import { generarFichaComercialPDF } from "../utils/fichaComercialPdf.js";

// ✅ leadDecision (tu archivo real en /src/lib)
import { leadDecision } from "../lib/leadDecision.js";

// ✅ Merge Web + ManyChat (un solo lead por persona)
import { upsertLeadMerged } from "../services/leadMerge.js";

const LEADS_CONTROLLER_VERSION = "2026-01-29-leads-controller-v1";

/* ===========================================================
   Helpers para extraer datos del resultado
=========================================================== */
function extraerScoreHL(resultado) {
  if (!resultado) return null;

  // ✅ Caso más común: puntajeHabitaLibre es NUMBER (ej: 72)
  const s0 = resultado?.puntajeHabitaLibre;
  if (typeof s0 === "number") return s0;

  // ✅ Caso alterno: puntajeHabitaLibre es objeto { score: 72 }
  const s1 = resultado?.puntajeHabitaLibre?.score;
  if (typeof s1 === "number") return s1;

  // ✅ legacy: scoreHL es objeto { total, bandas }
  const s2 = resultado?.scoreHL?.total;
  if (typeof s2 === "number") return s2;

  // compat muy viejo: scoreHL number
  if (typeof resultado.scoreHL === "number") return resultado.scoreHL;

  return null;
}

function extraerProducto(resultado) {
  if (!resultado) return null;

  return (
    resultado.productoElegido ||
    resultado.tipoCreditoElegido ||
    resultado.productoSugerido ||
    resultado.producto ||
    null
  );
}

/* ===========================================================
   ✅ SANITIZAR resultado recibido del FRONT
=========================================================== */
function sanitizarResultadoCliente(resultado = {}) {
  const limpio = { ...(resultado || {}) };

  // legacy: top-level sinOferta (lo eliminamos para evitar pisar)
  if ("sinOferta" in limpio) delete limpio.sinOferta;

  // NO tocar flags.sinOferta (pero clonamos flags)
  if (limpio.flags && typeof limpio.flags === "object") {
    limpio.flags = { ...limpio.flags };
  }

  return limpio;
}

/* ===========================================================
   ✅ Helpers parsing (WEB + Manychat)
=========================================================== */
function toNumberOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toLowerOrNull(v) {
  const s = String(v ?? "").trim();
  return s ? s.toLowerCase() : null;
}

function mapTipoCompraNumero(tipoCompraRawLower) {
  if (tipoCompraRawLower === "solo") return 1;
  if (tipoCompraRawLower === "pareja" || tipoCompraRawLower === "en_pareja")
    return 2;
  return null;
}

function toBoolOrNull(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "si" || s === "sí") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

/**
 * ✅ Extrae “campos rápidos” desde resultadoNormalizado.perfil (si existe)
 * para que WEB también tenga ingreso/estabilidad/deudas/etc.
 */
function extraerCamposRapidosDesdeResultado(resultadoNormalizado) {
  const perfil = resultadoNormalizado?.perfil || null;

  const afiliadoIess =
    perfil?.afiliadoIess != null ? toBoolOrNull(perfil.afiliadoIess) : null;

  const aniosEstabilidad =
    perfil?.aniosEstabilidad != null
      ? toNumberOrNull(perfil.aniosEstabilidad)
      : null;

  // perfil.ingresoTotal suele ser suma (individual + pareja)
  const ingresoMensual =
    perfil?.ingresoTotal != null ? toNumberOrNull(perfil.ingresoTotal) : null;

  const deudaMensualAprox =
    perfil?.otrasDeudasMensuales != null
      ? toNumberOrNull(perfil.otrasDeudasMensuales)
      : null;

  const ciudadCompra =
    perfil?.ciudadCompra != null ? String(perfil.ciudadCompra).trim() : null;

  // 👇 NUEVOS (si existen en resultado)
  const edad = perfil?.edad != null ? toNumberOrNull(perfil.edad) : null;

  const tipoIngreso =
    perfil?.tipoIngreso != null ? String(perfil.tipoIngreso).trim() : null;

  // 👇 Estos suelen venir top-level en scoring.js (pero si no vienen, queda null)
  const valorVivienda =
    resultadoNormalizado?.valorVivienda != null
      ? toNumberOrNull(resultadoNormalizado.valorVivienda)
      : null;

  const entradaDisponible =
    resultadoNormalizado?.entradaDisponible != null
      ? toNumberOrNull(resultadoNormalizado.entradaDisponible)
      : null;

  return {
    afiliadoIess,
    aniosEstabilidad,
    ingresoMensual,
    deudaMensualAprox,
    ciudadCompra,
    edad,
    tipoIngreso,
    valorVivienda,
    entradaDisponible,
  };
}

/* ===========================================================
   Helpers Manychat
=========================================================== */
function getApiKeyOk(req) {
  const apiKey = String(req.headers["x-api-key"] || "");
  const expected = String(process.env.MANYCHAT_API_KEY || "");
  return !!expected && apiKey === expected;
}

function toBoolSiNo(v) {
  if (typeof v === "boolean") return v;
  const s = String(v || "").trim().toLowerCase();
  if (s === "si" || s === "sí") return true;
  if (s === "no") return false;
  return null;
}

function pickNombreManychat(body = {}) {
  const first = String(body.first_name || body.firstName || "").trim();
  const last = String(body.last_name || body.lastName || "").trim();
  const full =
    String(body.nombre || body.full_name || body.name || "").trim() ||
    [first, last].filter(Boolean).join(" ").trim();

  return full || null;
}

function pickIgUsername(body = {}) {
  const u =
    String(
      body.instagram_username ||
        body.ig_username ||
        body.username ||
        body.igUsername ||
        ""
    ).trim() || null;

  return u ? u.replace(/^@/, "") : null;
}

function pickTelefono(body = {}) {
  const telefonoRaw =
    body.telefono ||
    body.phone ||
    body.phone_number ||
    body.whatsapp_phone ||
    null;

  return telefonoRaw ? String(telefonoRaw).trim() : null;
}

function pickEmail(body = {}) {
  const emailRaw = body.email || body.email_address || null;
  return emailRaw ? String(emailRaw).trim().toLowerCase() : null;
}

function pickCiudad(body = {}) {
  return (
    String(body.ciudad || body.ciudad_compra || body.city || "").trim() || null
  );
}

function pickTiempoCompra(body = {}) {
  return (
    String(body.tiempoCompra || body.tiempo_compra || body.horizonte || "")
      .trim() || null
  );
}

/**
 * Normaliza canal a { web, whatsapp, instagram }
 */
function inferCanalManychat(body = {}) {
  const canalRaw = String(body.canal || body.channel || "").trim().toLowerCase();
  if (canalRaw === "instagram" || canalRaw === "ig") return "instagram";
  if (canalRaw === "whatsapp" || canalRaw === "wa") return "whatsapp";

  const ig = pickIgUsername(body);
  if (ig) return "instagram";

  const tel = pickTelefono(body);
  if (tel) return "whatsapp";

  return "whatsapp";
}

function pickSubscriberId(body = {}) {
  const id =
    body.subscriber_id ||
    body.subscriberId ||
    body.contact_id ||
    body.contactId ||
    body.id ||
    null;

  return id != null ? String(id).trim() : null;
}

/* ===========================================================
   Helper: guardar decision en lead sin romper el request
   ✅ setea decision_* planos indexables
=========================================================== */
async function safeDecisionSave(leadDoc, tag = "GEN") {
  try {
    const d = leadDecision(leadDoc.toObject());

    leadDoc.decision = d;
    leadDoc.decisionUpdatedAt = new Date();

    leadDoc.decision_estado = d?.estado || null;
    leadDoc.decision_etapa = d?.etapa || null;
    leadDoc.decision_heat = Number.isFinite(Number(d?.heat))
      ? Number(d.heat)
      : 0;
    leadDoc.decision_llamarHoy = d?.llamarHoy === true;

    await leadDoc.save();
  } catch (e) {
    console.warn(`⚠️ No se pudo calcular decision (${tag}):`, e?.message || e);
  }
}

/* ===========================================================
   POST /api/leads   (crear lead desde el simulador)
   ✅ MERGE Web + ManyChat
   ✅ guarda campos “rápidos”
   ✅ calcula lead.decision aquí mismo
   ✅ guarda lead.precalificacion snapshot (para PDF)
=========================================================== */
export async function crearLead(req, res) {
  try {
    const {
      nombre,
      email,
      telefono,
      ciudad,
      aceptaTerminos,
      aceptaCompartir,
      resultado,
      tiempoCompra,
      sustentoIndependiente,

      // ✅ OPCIONAL (desde el FRONT)
      afiliadoIess,
      aniosEstabilidad,
      ingresoNetoMensual,
      otrasDeudasMensuales,
      ciudadCompra,
      tipoCompra,
      tipoCompraNumero,

      // ✅ opcional
      valorVivienda,
      entradaDisponible,

      // ✅ opcional (planos)
      edad,
      tipoIngreso,
    } = req.body || {};

    if (!nombre || !email || !resultado) {
      return res.status(400).json({
        ok: false,
        msg: "Faltan datos obligatorios (nombre, email o resultado).",
      });
    }

    // ✅ aceptar snake_case/camelCase para campos mínimos
    const body = req.body || {};

    const edadRaw =
      edad ??
      body.edad ??
      body.perfil?.edad ??
      body.metadata?.perfil?.edad ??
      null;

    const tipoIngresoRaw =
      tipoIngreso ??
      body.tipo_ingreso ??
      body.tipoIngreso ??
      body.perfil?.tipo_ingreso ??
      body.perfil?.tipoIngreso ??
      body.metadata?.perfil?.tipoIngreso ??
      null;

    const valorViviendaRaw =
      valorVivienda ??
      body.valor_vivienda ??
      body.valorVivienda ??
      body.precio_vivienda ??
      body.precioVivienda ??
      body.perfil?.valor_vivienda ??
      body.perfil?.valorVivienda ??
      body.metadata?.perfil?.valorVivienda ??
      null;

    const entradaDisponibleRaw =
      entradaDisponible ??
      body.entrada_disponible ??
      body.entradaDisponible ??
      body.entrada_usd ??
      body.entradaUsd ??
      body.perfil?.entrada_disponible ??
      body.perfil?.entradaDisponible ??
      body.metadata?.perfil?.entradaDisponible ??
      null;

    const tipoCompraRaw =
      tipoCompra ?? body.tipo_compra ?? body.tipoCompra ?? null;

    const tipoCompraNumeroRaw =
      tipoCompraNumero ??
      body.tipo_compra_numero ??
      body.tipoCompraNumero ??
      null;

    const emailNorm = String(email).toLowerCase().trim();
    const tokenEmail = String(req.customer?.email || "").toLowerCase().trim();
    const emailEfectivo = tokenEmail || emailNorm;

    const resultadoSanitizado = sanitizarResultadoCliente(resultado);
    const resultadoNormalizado = normalizeResultadoParaSalida(
      resultadoSanitizado
    );

    const scoreHL = extraerScoreHL(resultadoNormalizado);
    const producto = extraerProducto(resultadoNormalizado);
    const sinOferta = resultadoNormalizado?.flags?.sinOferta === true;

    const derivados = extraerCamposRapidosDesdeResultado(resultadoNormalizado);

    const afiliadoIessNorm =
      afiliadoIess != null
        ? toBoolOrNull(afiliadoIess)
        : derivados.afiliadoIess;

    const aniosEstabilidadNorm =
      aniosEstabilidad != null
        ? toNumberOrNull(aniosEstabilidad)
        : derivados.aniosEstabilidad;

    const ingresoMensualNorm =
      ingresoNetoMensual != null
        ? toNumberOrNull(ingresoNetoMensual)
        : derivados.ingresoMensual;

    const deudaMensualNorm =
      otrasDeudasMensuales != null
        ? toNumberOrNull(otrasDeudasMensuales)
        : derivados.deudaMensualAprox;

    const ciudadCompraNorm =
      (ciudadCompra != null ? String(ciudadCompra).trim() : null) ||
      derivados.ciudadCompra ||
      (ciudad ? String(ciudad).trim() : null) ||
      null;

    const tipoCompraLower =
      tipoCompraRaw != null ? toLowerOrNull(tipoCompraRaw) : null;

    const tipoCompraNumeroNorm =
      tipoCompraNumeroRaw != null
        ? toNumberOrNull(tipoCompraNumeroRaw)
        : mapTipoCompraNumero(tipoCompraLower);

    // ✅ Prioridad valor/entrada
    const valorViviendaNorm =
      valorViviendaRaw != null
        ? toNumberOrNull(valorViviendaRaw)
        : derivados.valorVivienda != null
        ? derivados.valorVivienda
        : null;

    const entradaDisponibleNorm =
      entradaDisponibleRaw != null
        ? toNumberOrNull(entradaDisponibleRaw)
        : derivados.entradaDisponible != null
        ? derivados.entradaDisponible
        : null;

    const edadNorm =
      edadRaw != null
        ? toNumberOrNull(edadRaw)
        : derivados.edad != null
        ? derivados.edad
        : null;

    const tipoIngresoNorm =
      (tipoIngresoRaw != null ? String(tipoIngresoRaw).trim() : null) ||
      (derivados.tipoIngreso != null
        ? String(derivados.tipoIngreso).trim()
        : null);

    // ✅ score detalle para debug/admin
    const scoreHLDetalleNorm =
      resultadoNormalizado?.puntajeHabitaLibre != null
        ? resultadoNormalizado.puntajeHabitaLibre
        : resultadoNormalizado?.scoreHL != null
        ? resultadoNormalizado.scoreHL
        : null;

    console.info("✅ Nuevo lead recibido (WEB):", {
      nombre,
      email: emailEfectivo,
      telefono,
      ciudad,
      aceptaTerminos,
      aceptaCompartir,
      tiempoCompra,
      sustentoIndependiente,
      productoElegido: producto,
      sinOferta,
      customerLeadIdFromToken: req.customer?.leadId || null,
      afiliado_iess: afiliadoIessNorm,
      anios_estabilidad: aniosEstabilidadNorm,
      ingreso_mensual: ingresoMensualNorm,
      deuda_mensual_aprox: deudaMensualNorm,
      ciudad_compra: ciudadCompraNorm,
      tipo_compra: tipoCompraLower,
      tipo_compra_numero: tipoCompraNumeroNorm,
      valor_vivienda: valorViviendaNorm,
      entrada_disponible: entradaDisponibleNorm,
      edad: edadNorm,
      tipoIngreso: tipoIngresoNorm,
      scoreHL,
    });

    let userIdFinal = null;
    let linkedToUser = false;
    let linkedMethod = "none";

    if (tokenEmail) {
      const user = await User.findOne({ email: tokenEmail }).select("_id");
      if (user?._id) {
        userIdFinal = user._id;
        linkedToUser = true;
        linkedMethod = "token_email";
      }
    }

    if (!userIdFinal) {
      const user = await User.findOne({ email: emailNorm }).select("_id");
      if (user?._id) {
        userIdFinal = user._id;
        linkedToUser = true;
        linkedMethod = "email";
      }
    }

    const { lead, isNew } = await upsertLeadMerged({
      source: "web",
      canal: "web",
      fuente: "form",
      payload: {
        nombre,
        email: emailEfectivo,
        telefono,
        ciudad,

        aceptaTerminos: !!aceptaTerminos,
        aceptaCompartir: !!aceptaCompartir,

        tiempoCompra: tiempoCompra || null,
        sustentoIndependiente: sustentoIndependiente || null,

        producto: producto || null,
        scoreHL: typeof scoreHL === "number" ? scoreHL : null,
        scoreHLDetalle: scoreHLDetalleNorm || null,

        // ✅ CANÓNICO
        resultado: resultadoNormalizado,

        // ✅ CAMPOS PLANOS
        afiliado_iess: afiliadoIessNorm,
        ingreso_mensual: ingresoMensualNorm,
        anios_estabilidad: aniosEstabilidadNorm,
        deuda_mensual_aprox: deudaMensualNorm,
        ciudad_compra: ciudadCompraNorm,
        tipo_compra: tipoCompraLower || null,
        tipo_compra_numero: tipoCompraNumeroNorm,

        ...(edadNorm != null ? { edad: edadNorm } : {}),
        ...(tipoIngresoNorm ? { tipo_ingreso: tipoIngresoNorm } : {}),
        ...(valorViviendaNorm != null
          ? { valor_vivienda: valorViviendaNorm }
          : {}),
        ...(entradaDisponibleNorm != null
          ? { entrada_disponible: entradaDisponibleNorm }
          : {}),

        origen: "Simulador Hipoteca Exprés",
        metadata: {
          canal: "Web",
          customerLeadIdFromToken: req.customer?.leadId || null,
          perfil: {
            ...(edadNorm != null ? { edad: edadNorm } : {}),
            ...(tipoIngresoNorm ? { tipoIngreso: tipoIngresoNorm } : {}),
            ...(valorViviendaNorm != null
              ? { valorVivienda: valorViviendaNorm }
              : {}),
            ...(entradaDisponibleNorm != null
              ? { entradaDisponible: entradaDisponibleNorm }
              : {}),
          },
        },
      },
    });

    if (userIdFinal) {
      lead.userId = userIdFinal;
      await lead.save();
      await User.updateOne(
        { _id: userIdFinal },
        { $set: { currentLeadId: lead._id } }
      );
    }

    if (!lead.codigoHL) {
      lead.codigoHL = generarCodigoHLDesdeObjectId(lead._id);
      await lead.save();
    }

    // ✅ decision (ya setea planos)
    await safeDecisionSave(lead, "WEB");

    const codigoHL = lead.codigoHL;
    const leadPlano = lead.toObject();

    const resultadoConCodigo = {
      ...resultadoNormalizado,
      codigoHL,
      flags: {
        ...(resultadoNormalizado.flags || {}),
        sinOferta: resultadoNormalizado?.flags?.sinOferta === true,
      },
      productoElegido:
        producto ||
        resultadoNormalizado.productoElegido ||
        resultadoNormalizado.productoSugerido ||
        null,
      tipoCreditoElegido:
        resultadoNormalizado.tipoCreditoElegido ||
        producto ||
        resultadoNormalizado.productoElegido ||
        resultadoNormalizado.productoSugerido ||
        null,
      bancoSugerido: resultadoNormalizado.bancoSugerido || null,
      productoSugerido: resultadoNormalizado.productoSugerido || null,
    };

    // ✅ Guardar snapshot plano para PDFs (opcional pero recomendado)
    try {
      lead.precalificacion = {
        bancoSugerido: resultadoConCodigo?.bancoSugerido ?? null,
        productoSugerido:
          resultadoConCodigo?.productoSugerido ??
          resultadoConCodigo?.rutaRecomendada?.tipo ??
          resultadoConCodigo?.productoElegido ??
          null,

        tasaAnual:
          resultadoConCodigo?.tasaAnual ??
          resultadoConCodigo?.rutaRecomendada?.tasaAnual ??
          null,

        plazoMeses:
          resultadoConCodigo?.plazoMeses ??
          resultadoConCodigo?.rutaRecomendada?.plazoMeses ??
          (Number.isFinite(Number(resultadoConCodigo?.rutaRecomendada?.plazoAnios))
            ? Number(resultadoConCodigo.rutaRecomendada.plazoAnios) * 12
            : null),

        cuotaEstimada:
          resultadoConCodigo?.cuotaEstimada ??
          resultadoConCodigo?.rutaRecomendada?.cuotaEstimada ??
          resultadoConCodigo?.rutaRecomendada?.cuota ??
          null,

        cuotaStress:
          resultadoConCodigo?.cuotaStress ??
          resultadoConCodigo?.stressTest?.cuotaStress ??
          null,

        dtiConHipoteca: resultadoConCodigo?.dtiConHipoteca ?? null,

        ltv:
          resultadoConCodigo?.ltv ??
          resultadoConCodigo?.rutaRecomendada?.ltv ??
          null,

        montoMaximo:
          resultadoConCodigo?.montoMaximo ??
          resultadoConCodigo?.rutaRecomendada?.montoMaximo ??
          null,

        precioMaxVivienda:
          resultadoConCodigo?.precioMaxVivienda ??
          resultadoConCodigo?.rutaRecomendada?.precioMaxVivienda ??
          null,

        capacidadPago:
          resultadoConCodigo?.capacidadPago ??
          resultadoConCodigo?.rutaRecomendada?.capacidadPago ??
          null,
      };

      await lead.save();
    } catch (e) {
      console.warn(
        "⚠️ No se pudo guardar precalificacion snapshot:",
        e?.message || e
      );
    }

    try {
      await Promise.all([
        enviarCorreoCliente(leadPlano, resultadoConCodigo),
        enviarCorreoLead(leadPlano, resultadoConCodigo),
      ]);
    } catch (errMail) {
      console.error("❌ Error enviando correos de lead:", errMail);
    }

    const status = isNew ? 201 : 200;

    return res.status(status).json({
      ok: true,
      msg: isNew
        ? "Lead creado correctamente"
        : "Lead actualizado (merge) correctamente",
      leadId: lead._id,
      codigoHL,
      linkedToUser,
      linkedMethod,
      debug: {
        scoreHL: lead.scoreHL,
        scoreHLDetalle: lead.scoreHLDetalle || null,
        valor_vivienda: lead.valor_vivienda || null,
        entrada_disponible: lead.entrada_disponible || null,
        tipo_ingreso: lead.tipo_ingreso || null,
        edad: lead.edad || null,
        perfilMeta: lead?.metadata?.perfil || null,
        decision_heat: lead.decision_heat ?? 0,
      },
    });
  } catch (err) {
    console.error("❌ Error en crearLead:", err);
    return res.status(500).json({
      ok: false,
      msg: "Error interno al registrar el lead",
    });
  }
}

/* ===========================================================
   GET /api/leads   (listado paginado + filtros)
=========================================================== */
export async function listarLeads(req, res) {
  try {
    const pagina = Math.max(parseInt(req.query.pagina || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "10", 10), 1),
      100
    );

    const {
      email,
      telefono,
      ciudad,
      tiempoCompra,
      sustentoIndependiente,
      canal,
      fuente,
    } = req.query || {};

    const filter = {};

    if (email) filter.email = { $regex: String(email).trim(), $options: "i" };
    if (telefono)
      filter.telefono = { $regex: String(telefono).trim(), $options: "i" };
    if (ciudad)
      filter.ciudad = { $regex: String(ciudad).trim(), $options: "i" };
    if (tiempoCompra) filter.tiempoCompra = String(tiempoCompra).trim();
    if (sustentoIndependiente)
      filter.sustentoIndependiente = String(sustentoIndependiente).trim();
    if (canal) filter.canal = String(canal).trim().toLowerCase();
    if (fuente) filter.fuente = String(fuente).trim().toLowerCase();

    const total = await Lead.countDocuments(filter);
    const totalPaginas = Math.max(1, Math.ceil(total / limit));
    const skip = (pagina - 1) * limit;

    const leadsDocs = await Lead.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const leads = leadsDocs.map((d) => d.toJSON());

    return res.json({
      ok: true,
      version: LEADS_CONTROLLER_VERSION,
      pagina,
      totalPaginas,
      total,
      leads,
    });
  } catch (err) {
    console.error("❌ Error en listarLeads:", err);
    return res.status(500).json({
      ok: false,
      msg: "Error interno al listar leads",
      leads: [],
      total: 0,
      pagina: 1,
      totalPaginas: 1,
    });
  }
}

/* ===========================================================
   GET /api/leads/stats
=========================================================== */
export async function statsLeads(req, res) {
  try {
    const total = await Lead.countDocuments({});

    const now = new Date();

    const inicioHoy = new Date(now);
    inicioHoy.setHours(0, 0, 0, 0);

    const inicioSemana = new Date(now);
    const day = inicioSemana.getDay(); // 0 domingo, 1 lunes...
    const diffToMonday = (day + 6) % 7;
    inicioSemana.setDate(inicioSemana.getDate() - diffToMonday);
    inicioSemana.setHours(0, 0, 0, 0);

    const inicioSemanaAnterior = new Date(inicioSemana);
    inicioSemanaAnterior.setDate(inicioSemanaAnterior.getDate() - 7);

    const hoy = await Lead.countDocuments({ createdAt: { $gte: inicioHoy } });
    const semana = await Lead.countDocuments({
      createdAt: { $gte: inicioSemana },
    });
    const semanaAnterior = await Lead.countDocuments({
      createdAt: { $gte: inicioSemanaAnterior, $lt: inicioSemana },
    });

    const byCanal = await Lead.aggregate([
      { $group: { _id: "$canal", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    const byFuente = await Lead.aggregate([
      { $group: { _id: "$fuente", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    return res.json({
      ok: true,
      version: LEADS_CONTROLLER_VERSION,
      total,
      hoy,
      semana,
      semanaAnterior,
      byCanal,
      byFuente,
    });
  } catch (err) {
    console.error("❌ Error en statsLeads:", err);
    return res.status(500).json({
      ok: false,
      version: LEADS_CONTROLLER_VERSION,
      total: 0,
      hoy: 0,
      semana: 0,
      semanaAnterior: 0,
      byCanal: [],
      byFuente: [],
    });
  }
}

/* ===========================================================
   POST /api/leads/manychat  (unificado IG + WhatsApp)
   ✅ MERGE con leads Web
   ✅ calcula lead.decision aquí mismo
=========================================================== */
export async function crearLeadManychat(req, res) {
  try {
    if (!getApiKeyOk(req)) {
      return res.status(401).json({ ok: false, msg: "No autorizado" });
    }

    const body = req.body || {};

    const canal = inferCanalManychat(body);
    const subscriberId = pickSubscriberId(body);
    const igUsername = canal === "instagram" ? pickIgUsername(body) : null;

    const nombre = pickNombreManychat(body);
    const email = pickEmail(body);
    const telefono = pickTelefono(body);

    const ciudad = pickCiudad(body);
    const tiempoCompra = pickTiempoCompra(body);

    const afiliadoIess = toBoolSiNo(body.afiliado_iess);
    const ingresoMensual = toNumberOrNull(body.ingreso_mensual);
    const aniosEstabilidad = toNumberOrNull(body.anios_estabilidad);
    const deudaMensualAprox = toNumberOrNull(body.deuda_mensual_aprox);

    const tipoCompraLower = toLowerOrNull(body.tipo_compra);
    const tipoCompraNumero = mapTipoCompraNumero(tipoCompraLower);

    if (canal === "instagram") {
      if (!subscriberId && !igUsername) {
        return res.status(400).json({
          ok: false,
          msg: "Falta subscriber_id o instagram_username para Instagram",
        });
      }
    } else {
      if (!subscriberId && !telefono && !email) {
        return res.status(400).json({
          ok: false,
          msg: "Falta subscriber_id o telefono o email para WhatsApp",
        });
      }
    }

    const { lead } = await upsertLeadMerged({
      source: "manychat",
      canal,
      fuente: "manychat",
      payload: {
        ...(nombre ? { nombre } : {}),
        ...(email ? { email } : {}),
        ...(telefono ? { telefono } : {}),
        ...(ciudad ? { ciudad } : {}),
        ...(tiempoCompra ? { tiempoCompra } : {}),

        ...(subscriberId ? { manychatSubscriberId: subscriberId } : {}),
        ...(igUsername ? { igUsername } : {}),

        origen:
          canal === "instagram"
            ? "Instagram (ManyChat)"
            : "WhatsApp (ManyChat)",

        afiliado_iess: afiliadoIess,
        ingreso_mensual: ingresoMensual,
        anios_estabilidad: aniosEstabilidad,
        deuda_mensual_aprox: deudaMensualAprox,

        ciudad_compra: ciudad || null,
        tipo_compra: tipoCompraLower || null,
        tipo_compra_numero: tipoCompraNumero,

        metadata: {
          canal: canal === "instagram" ? "Instagram" : "WhatsApp",
          raw: body,
        },
      },
    });

    if (!lead.codigoHL) {
      lead.codigoHL = generarCodigoHLDesdeObjectId(lead._id);
      await lead.save();
    }

    await safeDecisionSave(lead, "MANYCHAT");

    return res.json({
      ok: true,
      version: LEADS_CONTROLLER_VERSION,
      leadId: lead._id,
      codigoHL: lead.codigoHL,
    });
  } catch (err) {
    console.error("❌ crearLeadManychat:", err);
    return res.status(500).json({
      ok: false,
      version: LEADS_CONTROLLER_VERSION,
      msg: "Error interno",
    });
  }
}

/* ===========================================================
   Compat: POST /api/leads/whatsapp
=========================================================== */
export async function crearLeadWhatsapp(req, res) {
  return crearLeadManychat(req, res);
}

/* ===========================================================
   Opcional: POST /api/leads/instagram
=========================================================== */
export async function crearLeadInstagram(req, res) {
  return crearLeadManychat(req, res);
}

/* ===========================================================
   ✅ GET /api/leads/:id  (detalle admin)
=========================================================== */
export async function obtenerLeadPorIdAdmin(req, res) {
  try {
    const { id } = req.params || {};
    if (!id) return res.status(400).json({ ok: false, msg: "Falta id" });

    const lead = await Lead.findById(id).lean();
    if (!lead)
      return res.status(404).json({ ok: false, msg: "Lead no encontrado" });

    return res.json({ ok: true, lead });
  } catch (err) {
    console.error("❌ obtenerLeadPorIdAdmin:", err);
    return res.status(500).json({ ok: false, msg: "Error interno" });
  }
}

/* ===========================================================
   ✅ PDF Ficha Comercial
   - GET /api/leads/:id/ficha-comercial.pdf
   - GET /api/leads/hl/:codigoHL/ficha-comercial.pdf
   ✅ “A prueba de balas”: si precalif está incompleta, recalcula con motor.
=========================================================== */
export async function descargarFichaComercialPDF(req, res) {
  try {
    const { id, codigoHL } = req.params || {};

    let lead = null;

    // 1) Buscar por ID
    if (id) {
      lead = await Lead.findById(id).lean();
    }

    // 2) Buscar por código HL
    if (!lead && codigoHL) {
      lead = await Lead.findOne({ codigoHL: String(codigoHL).trim() }).lean();
    }

    if (!lead) {
      return res.status(404).json({ ok: false, msg: "Lead no encontrado" });
    }

    // ✅ Fecha bonita dd/mm/yyyy
    const fecha = (() => {
      try {
        const d = lead.createdAt ? new Date(lead.createdAt) : new Date();
        return d.toLocaleDateString("es-EC", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      } catch {
        return "-";
      }
    })();

    // ✅ Plaza
    const plaza =
      lead.ciudad_compra ||
      lead.ciudad ||
      lead?.metadata?.perfil?.ciudadCompra ||
      "-";

    // ✅ Resultado tal cual guardado
    const resultadoStored = lead.resultado || null;

    // ✅ Snapshot guardado (si existe)
    const snap = lead.precalificacion || null;

    // ✅ Detectar si faltan campos CRÍTICOS (los que te interesan para banco)
    const faltaCritico =
      !snap ||
      snap?.bancoSugerido == null ||
      snap?.cuotaEstimada == null ||
      snap?.capacidadPago == null ||
      snap?.dtiConHipoteca == null;

    let precalificacion = snap;

    // ✅ Si falta, recalcular con el motor desde los campos planos del lead
    if (faltaCritico) {
      const bodyMotor = {
        ingresoNetoMensual: lead.ingreso_mensual ?? 0,
        ingresoPareja: 0,
        otrasDeudasMensuales: lead.deuda_mensual_aprox ?? 0,
        valorVivienda: lead.valor_vivienda ?? 0,
        entradaDisponible: lead.entrada_disponible ?? 0,
        edad: lead.edad ?? null,
        afiliadoIess: lead.afiliado_iess ?? null,
        iessAportesTotales: lead.iess_aportes_totales ?? 0,
        iessAportesConsecutivos: lead.iess_aportes_consecutivos ?? 0,
        tipoIngreso: lead.tipo_ingreso ?? lead.tipoIngreso ?? "Dependiente",
        aniosEstabilidad: lead.anios_estabilidad ?? 0,
        plazoAnios: null,
      };

      try {
        const { respuesta } = precalificarHL(bodyMotor);

        // ✅ Construir/Completar snapshot
        precalificacion = {
          ...(snap || {}),

          bancoSugerido: respuesta?.bancoSugerido ?? snap?.bancoSugerido ?? null,
          productoSugerido:
            respuesta?.productoSugerido ?? snap?.productoSugerido ?? null,

          tasaAnual: respuesta?.tasaAnual ?? snap?.tasaAnual ?? null,
          plazoMeses: respuesta?.plazoMeses ?? snap?.plazoMeses ?? null,

          cuotaEstimada: respuesta?.cuotaEstimada ?? snap?.cuotaEstimada ?? null,
          cuotaStress: respuesta?.cuotaStress ?? snap?.cuotaStress ?? null,

          dtiConHipoteca:
            respuesta?.dtiConHipoteca ?? snap?.dtiConHipoteca ?? null,

          ltv: respuesta?.ltv ?? snap?.ltv ?? null,

          montoMaximo: respuesta?.montoMaximo ?? snap?.montoMaximo ?? null,
          precioMaxVivienda:
            respuesta?.precioMaxVivienda ?? snap?.precioMaxVivienda ?? null,

          capacidadPago: respuesta?.capacidadPago ?? snap?.capacidadPago ?? null,
        };

        // ✅ Guardar snapshot para futuras descargas
        try {
          await Lead.updateOne(
            { _id: lead._id },
            { $set: { precalificacion } }
          );
        } catch (eSave) {
          console.warn(
            "⚠️ No se pudo guardar precalificacion recalculada:",
            eSave?.message || eSave
          );
        }

        // 🧪 Debug útil
        console.log("✅ PDF Comercial: precalificación recalculada", {
          codigoHL: lead.codigoHL,
          bancoSugerido: precalificacion?.bancoSugerido ?? null,
          cuotaEstimada: precalificacion?.cuotaEstimada ?? null,
          capacidadPago: precalificacion?.capacidadPago ?? null,
          dtiConHipoteca: precalificacion?.dtiConHipoteca ?? null,
        });
      } catch (eMotor) {
        console.warn(
          "⚠️ No se pudo recalcular precalificación para PDF:",
          eMotor?.message || eMotor
        );
        // seguimos con lo que haya
        precalificacion = snap;
      }
    }

    // ✅ Fallback final: si no hay snap ni motor, intenta armarlo desde resultadoStored
    if (!precalificacion && resultadoStored) {
      precalificacion = {
        bancoSugerido:
          resultadoStored?.bancoSugerido ??
          resultadoStored?.rutaRecomendada?.banco ??
          null,

        productoSugerido:
          resultadoStored?.productoSugerido ??
          resultadoStored?.rutaRecomendada?.tipo ??
          resultadoStored?.productoElegido ??
          null,

        tasaAnual:
          resultadoStored?.tasaAnual ??
          resultadoStored?.rutaRecomendada?.tasaAnual ??
          null,

        plazoMeses:
          resultadoStored?.plazoMeses ??
          resultadoStored?.rutaRecomendada?.plazoMeses ??
          (Number.isFinite(Number(resultadoStored?.rutaRecomendada?.plazoAnios))
            ? Number(resultadoStored.rutaRecomendada.plazoAnios) * 12
            : null),

        cuotaEstimada:
          resultadoStored?.cuotaEstimada ??
          resultadoStored?.rutaRecomendada?.cuotaEstimada ??
          resultadoStored?.rutaRecomendada?.cuota ??
          null,

        cuotaStress:
          resultadoStored?.cuotaStress ??
          resultadoStored?.stressTest?.cuotaStress ??
          null,

        dtiConHipoteca:
          resultadoStored?.dtiConHipoteca ??
          resultadoStored?.rutaRecomendada?.dtiConHipoteca ??
          null,

        ltv:
          resultadoStored?.ltv ?? resultadoStored?.rutaRecomendada?.ltv ?? null,

        montoMaximo:
          resultadoStored?.montoMaximo ??
          resultadoStored?.montoPrestamoMax ??
          resultadoStored?.prestamoMax ??
          resultadoStored?.rutaRecomendada?.montoMaximo ??
          null,

        precioMaxVivienda:
          resultadoStored?.precioMaxVivienda ??
          resultadoStored?.precioMax ??
          resultadoStored?.valorMaxVivienda ??
          resultadoStored?.rutaRecomendada?.precioMaxVivienda ??
          null,

        capacidadPago:
          resultadoStored?.capacidadPagoPrograma ??
          resultadoStored?.capacidadPago ??
          resultadoStored?.capacidadPagoGlobal ??
          resultadoStored?.rutaRecomendada?.capacidadPago ??
          null,
      };
    }

    // ✅ data que consume tu PDF util
    const data = {
      codigoHL: lead.codigoHL || "-",
      fecha,
      plaza,

      nombre: lead.nombre || "-",
      telefono: lead.telefono || "-",
      email: lead.email || "-",

      // campos core
      scoreHL: lead.scoreHL ?? null,
      edad: lead.edad ?? null,
      tipo_ingreso: lead.tipo_ingreso ?? null,
      valor_vivienda: lead.valor_vivienda ?? null,
      entrada_disponible: lead.entrada_disponible ?? null,
      ciudad_compra: lead.ciudad_compra ?? null,
      tipo_compra: lead.tipo_compra ?? null,
      producto: lead.producto ?? null,

      // perfil financiero
      ingreso_mensual: lead.ingreso_mensual ?? null,
      deuda_mensual_aprox: lead.deuda_mensual_aprox ?? null,
      afiliado_iess: lead.afiliado_iess ?? null,
      anios_estabilidad: lead.anios_estabilidad ?? null,

      // ✅ IMPORTANTES
      resultado: resultadoStored,
      decision: lead.decision || null,
      precalificacion,
    };

    // 🧪 DEBUG (déjalo un rato)
    console.log("🧪 DEBUG FICHA COMERCIAL (final):", {
      codigoHL: data.codigoHL,
      bancoSugerido: data.precalificacion?.bancoSugerido ?? null,
      cuotaEstimada: data.precalificacion?.cuotaEstimada ?? null,
      capacidadPago: data.precalificacion?.capacidadPago ?? null,
      dtiConHipoteca: data.precalificacion?.dtiConHipoteca ?? null,
      tasaAnual: data.precalificacion?.tasaAnual ?? null,
      plazoMeses: data.precalificacion?.plazoMeses ?? null,
    });

    return generarFichaComercialPDF(res, data);
  } catch (err) {
    console.error("❌ descargarFichaComercialPDF:", err?.stack || err);
    return res.status(500).json({ ok: false, msg: "Error generando PDF" });
  }
}
