// src/controllers/leads.controller.js
import Lead from "../models/Lead.js";
import User from "../models/User.js";
import { enviarCorreoCliente, enviarCorreoLead } from "../utils/mailer.js";
import { generarCodigoHLDesdeObjectId } from "../utils/codigoHL.js";
import { normalizeResultadoParaSalida } from "../utils/hlResultado.js";

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

   REGLA:
   - BORRAR solo `resultado.sinOferta` (top-level legacy)
   - ❌ NO BORRAR `resultado.flags.sinOferta` porque ESA es la fuente del motor
=========================================================== */
function sanitizarResultadoCliente(resultado = {}) {
  const limpio = { ...(resultado || {}) };

  // legacy: top-level sinOferta (lo eliminamos para evitar pisar)
  if ("sinOferta" in limpio) delete limpio.sinOferta;

  // ✅ IMPORTANTÍSIMO:
  // NO tocar flags.sinOferta (si el frontend lo manda, es la verdad del motor)
  // Solo aseguramos que flags sea objeto plano si existe.
  if (limpio.flags && typeof limpio.flags === "object") {
    limpio.flags = { ...limpio.flags };
  }

  return limpio;
}

/* ===========================================================
   POST /api/leads   (crear lead desde el simulador)
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

    // ✅ 1) Sanitiza lo que llega del FRONT (sin borrar flags.sinOferta)
    const resultadoSanitizado = sanitizarResultadoCliente(resultado);

    // ✅ DEBUG CRÍTICO (para que esto NO vuelva a ser a ciegas)
    console.log("🧪 [LEADS] resultado recibido (keys):", Object.keys(resultado || {}));
    console.log("🧪 [LEADS] flags recibidos:", resultado?.flags || null);
    console.log(
      "🧪 [LEADS] flags.sinOferta recibido:",
      typeof resultado?.flags?.sinOferta === "boolean" ? resultado.flags.sinOferta : "(no viene boolean)"
    );

    // ✅ 2) Normaliza (si flags.sinOferta viene, NO se recalcula)
    const resultadoNormalizado = normalizeResultadoParaSalida(resultadoSanitizado);

    // ✅ Extrae campos consistentes
    const scoreHL = extraerScoreHL(resultadoNormalizado);
    const producto = extraerProducto(resultadoNormalizado);

    // ✅ sinOferta: SOLO desde normalizador (que respeta flags.sinOferta si vino)
    const sinOferta = resultadoNormalizado?.flags?.sinOferta === true;

    console.info("✅ Nuevo lead recibido:", {
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
    });

    /* ======================================================
       Link userId si existe
    ====================================================== */
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

    // 1) Crear lead
    let lead = await Lead.create({
      nombre,
      email: emailEfectivo,
      telefono,
      ciudad,

      aceptaTerminos: !!aceptaTerminos,
      aceptaCompartir: !!aceptaCompartir,

      producto: producto || null,
      scoreHL: typeof scoreHL === "number" ? scoreHL : null,

      tiempoCompra: tiempoCompra || null,
      sustentoIndependiente: sustentoIndependiente || null,

      // ✅ guardar NORMALIZADO
      resultado: resultadoNormalizado,

      origen: "Simulador Hipoteca Exprés",
      metadata: {
        canal: "Web",
        customerLeadIdFromToken: req.customer?.leadId || null,
      },

      userId: userIdFinal || null,
    });

    // 2) Código HL
    const codigoHL = generarCodigoHLDesdeObjectId(lead._id);
    lead.codigoHL = codigoHL;
    await lead.save();

    if (userIdFinal) {
      await User.updateOne(
        { _id: userIdFinal },
        { $set: { currentLeadId: lead._id } }
      );
    }

    // 3) Preparar para mailer/PDF
    const leadPlano = lead.toObject();

    const resultadoConCodigo = {
      ...resultadoNormalizado,
      codigoHL,

      // ✅ flags CONSISTENTES
      flags: {
        ...(resultadoNormalizado.flags || {}),
        sinOferta: resultadoNormalizado?.flags?.sinOferta === true,
      },

      // compat
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

    console.log("📩 resultado para mailer/PDF (FULL CHECK):", {
      sinOferta: resultadoConCodigo?.flags?.sinOferta,
      productoElegido: resultadoConCodigo.productoElegido,
      productoSugerido: resultadoConCodigo.productoSugerido,
      bancoSugerido: resultadoConCodigo.bancoSugerido,
      cuotaEstimada: resultadoConCodigo.cuotaEstimada,
      capacidadPago:
        resultadoConCodigo.capacidadPagoPrograma ??
        resultadoConCodigo.capacidadPago ??
        resultadoConCodigo.capacidadPagoGlobal ??
        null,
      dtiConHipoteca: resultadoConCodigo.dtiConHipoteca,
      ltv: resultadoConCodigo.ltv,
      tasaAnual: resultadoConCodigo.tasaAnual,
      plazoMeses: resultadoConCodigo.plazoMeses,
    });

    // 4) Enviar correos
    try {
      await Promise.all([
        enviarCorreoCliente(leadPlano, resultadoConCodigo),
        enviarCorreoLead(leadPlano, resultadoConCodigo),
      ]);
    } catch (errMail) {
      console.error("❌ Error enviando correos de lead:", errMail);
    }

    return res.status(201).json({
      ok: true,
      msg: "Lead creado correctamente",
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
=========================================================== */
export async function listarLeads(req, res) {
  try {
    const pagina = Math.max(parseInt(req.query.pagina || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "10", 10), 1),
      100
    );

    const { email, telefono, ciudad, tiempoCompra } = req.query || {};
    const filter = {};

    if (email) filter.email = { $regex: email.trim(), $options: "i" };
    if (telefono) filter.telefono = { $regex: telefono.trim(), $options: "i" };
    if (ciudad) filter.ciudad = { $regex: ciudad.trim(), $options: "i" };
    if (tiempoCompra) filter.tiempoCompra = tiempoCompra;

    const total = await Lead.countDocuments(filter);
    const totalPaginas = Math.max(1, Math.ceil(total / limit));
    const skip = (pagina - 1) * limit;

    const leads = await Lead.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.json({
      ok: true,
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
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const hoy = await Lead.countDocuments({
      createdAt: { $gte: inicioHoy },
    });

    return res.json({ ok: true, total, hoy });
  } catch (err) {
    console.error("❌ Error en statsLeads:", err);
    return res.status(500).json({ ok: false, total: 0, hoy: 0 });
  }
}

/* ===========================================================
   POST /api/leads/whatsapp  (crear/actualizar lead desde ManyChat)
   - Seguridad por API KEY
   - Upsert por telefono (principal) o email (si viene)
   - Guarda todo en metadata.whatsapp para no romper tu schema
=========================================================== */
export async function crearLeadWhatsapp(req, res) {
  try {
    // ✅ Seguridad simple (ideal para webhooks)
    const apiKey = String(req.headers["x-api-key"] || "");
    const expected = String(process.env.MANYCHAT_API_KEY || "");
    if (!expected || apiKey !== expected) {
      return res.status(401).json({ ok: false, msg: "No autorizado" });
    }

    const body = req.body || {};

    // ManyChat puede mandar campos con nombres distintos.
    // Normalizamos lo mínimo:
    const nombre = String(body.nombre || body.full_name || body.name || "").trim() || null;

    const emailRaw = body.email || body.email_address || null;
    const email = emailRaw ? String(emailRaw).trim().toLowerCase() : null;

    // Tel: clave para upsert. Asegura formato string.
    const telefonoRaw =
      body.telefono || body.phone || body.phone_number || body.whatsapp_phone || null;
    const telefono = telefonoRaw ? String(telefonoRaw).trim() : null;

    // Ciudad final
    const ciudad = String(body.ciudad || body.ciudad_compra || body.city || "").trim() || null;

    // Campos de tu flow
    const tipoCompraNumero = body.tipo_compra_numero ?? body.tipo_compra ?? null; // 1/2
    const tipoCompraTexto =
      String(body.tipo_compra_texto || "").trim() ||
      (String(tipoCompraNumero) === "1" ? "SOLO" : String(tipoCompraNumero) === "2" ? "EN_PAREJA" : null);

    const ingresoMensual =
      body.ingreso_mensual ?? body.ingreso ?? body.ingreso_neto_mensual ?? null;

    const afiliadoIess =
      typeof body.afiliado_iess === "boolean"
        ? body.afiliado_iess
        : String(body.afiliado_iess || "").toLowerCase() === "si"
        ? true
        : String(body.afiliado_iess || "").toLowerCase() === "no"
        ? false
        : null;

    const tiempoCompra = String(body.tiempo_compra || body.horizonte || "").trim() || null;

    // ✅ Validación mínima: al menos teléfono o email para identificar lead
    if (!telefono && !email) {
      return res.status(400).json({
        ok: false,
        msg: "Falta identificador: telefono o email",
      });
    }

    // 🔎 filtro principal para upsert
    const filter = telefono ? { telefono } : { email };

    // ✅ payload base
    const update = {
      $set: {
        ...(nombre ? { nombre } : {}),
        ...(email ? { email } : {}),
        ...(telefono ? { telefono } : {}),
        ...(ciudad ? { ciudad } : {}),
        ...(tiempoCompra ? { tiempoCompra } : {}),
        origen: "WhatsApp (ManyChat)",
        // Guarda todo lo recibido sin pelearte con schema
        metadata: {
          canal: "WhatsApp",
          whatsapp: {
            ...body, // 👈 así nunca pierdes data
            tipo_compra_texto: tipoCompraTexto,
          },
        },
        resultadoUpdatedAt: new Date(), // útil para ordenar “último update”
      },
      $setOnInsert: {
        aceptaTerminos: null,
        aceptaCompartir: null,
      },
    };

    // ✅ Upsert
    let lead = await Lead.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
    });

    // ✅ Si es nuevo y no tiene codigoHL, generarlo una sola vez
    if (!lead.codigoHL) {
      const codigoHL = generarCodigoHLDesdeObjectId(lead._id);
      lead.codigoHL = codigoHL;
      await lead.save();
    }

    return res.status(200).json({
      ok: true,
      msg: "Lead WhatsApp guardado",
      leadId: lead._id,
      codigoHL: lead.codigoHL,
    });
  } catch (err) {
    console.error("❌ Error en crearLeadWhatsapp:", err);
    return res.status(500).json({ ok: false, msg: "Error interno" });
  }
}

