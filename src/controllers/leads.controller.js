// src/controllers/leads.controller.js
import Lead from "../models/Lead.js";
import User from "../models/User.js";
import { enviarCorreoCliente, enviarCorreoLead } from "../utils/mailer.js";
import { generarCodigoHLDesdeObjectId } from "../utils/codigoHL.js";
import { normalizeResultadoParaSalida } from "../utils/hlResultado.js";

// ✅ NUEVO: Merge Web + ManyChat (un solo lead por persona)
import { upsertLeadMerged } from "../services/leadMerge.js";

const LEADS_CONTROLLER_VERSION = "2026-01-22-merge-web-manychat-v1";

/* ===========================================================
   Helpers para extraer datos del resultado
=========================================================== */
function extraerScoreHL(resultado) {
  if (!resultado) return null;

  if (
    resultado.puntajeHabitaLibre &&
    typeof resultado.puntajeHabitaLibre.score === "number"
  ) {
    return resultado.puntajeHabitaLibre.score;
  }

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

  // NO tocar flags.sinOferta
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
    perfil?.aniosEstabilidad != null ? toNumberOrNull(perfil.aniosEstabilidad) : null;

  // perfil.ingresoTotal suele ser suma (individual + pareja)
  const ingresoMensual =
    perfil?.ingresoTotal != null ? toNumberOrNull(perfil.ingresoTotal) : null;

  const deudaMensualAprox =
    perfil?.otrasDeudasMensuales != null
      ? toNumberOrNull(perfil.otrasDeudasMensuales)
      : null;

  const ciudadCompra =
    perfil?.ciudadCompra != null ? String(perfil.ciudadCompra).trim() : null;

  // tipo_compra no suele venir en perfil; lo dejamos null
  return {
    afiliadoIess,
    aniosEstabilidad,
    ingresoMensual,
    deudaMensualAprox,
    ciudadCompra,
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
 * - NO asume: si viene canal explícito, lo usa
 * - si no viene, infiere por campos observables del payload:
 *   - si hay instagram_username -> instagram
 *   - si hay whatsapp_phone/phone -> whatsapp
 */
function inferCanalManychat(body = {}) {
  const canalRaw = String(body.canal || body.channel || "").trim().toLowerCase();
  if (canalRaw === "instagram" || canalRaw === "ig") return "instagram";
  if (canalRaw === "whatsapp" || canalRaw === "wa") return "whatsapp";

  const ig = pickIgUsername(body);
  if (ig) return "instagram";

  const tel = pickTelefono(body);
  if (tel) return "whatsapp";

  // fallback seguro
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
   POST /api/leads   (crear lead desde el simulador)
   ✅ AHORA: MERGE con leads de ManyChat (email/telefono/ig/subscriber)
   ✅ AHORA: guarda campos “rápidos” (ingreso/estabilidad/deudas/...)
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
    } = req.body || {};

    if (!nombre || !email || !resultado) {
      return res.status(400).json({
        ok: false,
        msg: "Faltan datos obligatorios (nombre, email o resultado).",
      });
    }

    const emailNorm = String(email).toLowerCase().trim();
    const tokenEmail = String(req.customer?.email || "").toLowerCase().trim();
    const emailEfectivo = tokenEmail || emailNorm;

    const resultadoSanitizado = sanitizarResultadoCliente(resultado);
    const resultadoNormalizado = normalizeResultadoParaSalida(resultadoSanitizado);

    const scoreHL = extraerScoreHL(resultadoNormalizado);
    const producto = extraerProducto(resultadoNormalizado);
    const sinOferta = resultadoNormalizado?.flags?.sinOferta === true;

    // ✅ Derivar campos rápidos desde resultado.perfil (fallback si no vienen del FRONT)
    const derivados = extraerCamposRapidosDesdeResultado(resultadoNormalizado);

    // ✅ Normalizar inputs del FRONT (si vienen)
    const afiliadoIessNorm =
      afiliadoIess != null ? toBoolOrNull(afiliadoIess) : derivados.afiliadoIess;

    const aniosEstabilidadNorm =
      aniosEstabilidad != null ? toNumberOrNull(aniosEstabilidad) : derivados.aniosEstabilidad;

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
      tipoCompra != null ? toLowerOrNull(tipoCompra) : null;

    const tipoCompraNumeroNorm =
      tipoCompraNumero != null
        ? toNumberOrNull(tipoCompraNumero)
        : mapTipoCompraNumero(tipoCompraLower);

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

      // campos rápidos
      afiliado_iess: afiliadoIessNorm,
      anios_estabilidad: aniosEstabilidadNorm,
      ingreso_mensual: ingresoMensualNorm,
      deuda_mensual_aprox: deudaMensualNorm,
      ciudad_compra: ciudadCompraNorm,
      tipo_compra: tipoCompraLower,
      tipo_compra_numero: tipoCompraNumeroNorm,
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

    // ✅ Upsert + MERGE (Web)
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

        // ✅ CANÓNICO
        resultado: resultadoNormalizado,

        // ✅ CAMPOS PLANOS (para dashboard + filtros)
        afiliado_iess: afiliadoIessNorm,
        ingreso_mensual: ingresoMensualNorm,
        anios_estabilidad: aniosEstabilidadNorm,
        deuda_mensual_aprox: deudaMensualNorm,
        ciudad_compra: ciudadCompraNorm,
        tipo_compra: tipoCompraLower || null,
        tipo_compra_numero: tipoCompraNumeroNorm,

        origen: "Simulador Hipoteca Exprés",
        metadata: {
          canal: "Web",
          customerLeadIdFromToken: req.customer?.leadId || null,
        },
      },
    });

    // ✅ link a user (no depende del merge)
    if (userIdFinal) {
      lead.userId = userIdFinal;
      await lead.save();
      await User.updateOne(
        { _id: userIdFinal },
        { $set: { currentLeadId: lead._id } }
      );
    }

    // ✅ Código HL (solo si no existe)
    if (!lead.codigoHL) {
      lead.codigoHL = generarCodigoHLDesdeObjectId(lead._id);
      await lead.save();
    }
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

    // Enviar correos SOLO si el lead viene del web (aunque haya merge)
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
   ✅ agrega sustentoIndependiente + canal + fuente
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
    if (ciudad) filter.ciudad = { $regex: String(ciudad).trim(), $options: "i" };
    if (tiempoCompra) filter.tiempoCompra = String(tiempoCompra).trim();

    if (sustentoIndependiente) {
      filter.sustentoIndependiente = String(sustentoIndependiente).trim();
    }

    if (canal) filter.canal = String(canal).trim().toLowerCase();
    if (fuente) filter.fuente = String(fuente).trim().toLowerCase();

    const total = await Lead.countDocuments(filter);
    const totalPaginas = Math.max(1, Math.ceil(total / limit));
    const skip = (pagina - 1) * limit;

    const leadsDocs = await Lead.find(filter)
  .sort({ updatedAt: -1, createdAt: -1 })
  .skip(skip)
  .limit(limit);

const leads = leadsDocs.map((d) => d.toJSON()); // aquí sí entran virtuals

return res.json({
  ok: true,
  version: LEADS_CONTROLLER_VERSION,
  pagina,
  totalPaginas,
  total,
  leads,
});


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
   ✅ hoy + semana + semanaAnterior + breakdown por canal/fuente
=========================================================== */
export async function statsLeads(req, res) {
  try {
    const total = await Lead.countDocuments({});

    const now = new Date();

    // hoy (desde 00:00)
    const inicioHoy = new Date(now);
    inicioHoy.setHours(0, 0, 0, 0);

    // inicio semana (lunes 00:00)
    const inicioSemana = new Date(now);
    const day = inicioSemana.getDay(); // 0 domingo, 1 lunes...
    const diffToMonday = (day + 6) % 7; // lunes => 0
    inicioSemana.setDate(inicioSemana.getDate() - diffToMonday);
    inicioSemana.setHours(0, 0, 0, 0);

    // semana anterior: [inicioSemanaAnterior, inicioSemana)
    const inicioSemanaAnterior = new Date(inicioSemana);
    inicioSemanaAnterior.setDate(inicioSemanaAnterior.getDate() - 7);

    const hoy = await Lead.countDocuments({ createdAt: { $gte: inicioHoy } });
    const semana = await Lead.countDocuments({ createdAt: { $gte: inicioSemana } });
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
   ✅ AHORA: MERGE con leads Web (email/telefono/ig/subscriber)
=========================================================== */
export async function crearLeadManychat(req, res) {
  try {
    if (!getApiKeyOk(req)) {
      return res.status(401).json({ ok: false, msg: "No autorizado" });
    }

    const body = req.body || {};

    const canal = inferCanalManychat(body); // whatsapp | instagram
    const subscriberId = pickSubscriberId(body);
    const igUsername = canal === "instagram" ? pickIgUsername(body) : null;

    const nombre = pickNombreManychat(body);
    const email = pickEmail(body);
    const telefono = pickTelefono(body);

    const ciudad = pickCiudad(body);
    const tiempoCompra = pickTiempoCompra(body);

    // Campos del flow (rápidos)
    const afiliadoIess = toBoolSiNo(body.afiliado_iess);
    const ingresoMensual = toNumberOrNull(body.ingreso_mensual);
    const aniosEstabilidad = toNumberOrNull(body.anios_estabilidad);
    const deudaMensualAprox = toNumberOrNull(body.deuda_mensual_aprox);

    const tipoCompraLower = toLowerOrNull(body.tipo_compra); // "solo" | "pareja" | ...
    const tipoCompraNumero = mapTipoCompraNumero(tipoCompraLower);

    // ✅ Regla de identificación (NO asumir)
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
        // identidad base
        ...(nombre ? { nombre } : {}),
        ...(email ? { email } : {}),
        ...(telefono ? { telefono } : {}),
        ...(ciudad ? { ciudad } : {}),
        ...(tiempoCompra ? { tiempoCompra } : {}),

        // IDs manychat / IG
        ...(subscriberId ? { manychatSubscriberId: subscriberId } : {}),
        ...(igUsername ? { igUsername } : {}),

        origen:
          canal === "instagram"
            ? "Instagram (ManyChat)"
            : "WhatsApp (ManyChat)",

        // ✅ CAMPOS PLANOS (para dashboard + filtros)
        afiliado_iess: afiliadoIess,
        ingreso_mensual: ingresoMensual,
        anios_estabilidad: aniosEstabilidad,
        deuda_mensual_aprox: deudaMensualAprox,

        ciudad_compra: ciudad || null,

        tipo_compra: tipoCompraLower || null,
        tipo_compra_numero: tipoCompraNumero,

        // metadata completo (auditoría)
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
   Compat: POST /api/leads/whatsapp  (mantiene tu endpoint actual)
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
