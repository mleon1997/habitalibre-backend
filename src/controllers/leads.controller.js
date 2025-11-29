// src/controllers/leads.controller.js
import Lead from "../models/Lead.js";
import { enviarCorreoCliente, enviarCorreoLead } from "../utils/mailer.js";
import { generarCodigoHLDesdeObjectId } from "../utils/codigoHL.js";

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
    resultado.producto ||
    null
  );
}

/* ===========================================================
   POST /api/leads   (crear lead desde el simulador)
   Body:
    - nombre, email, telefono, ciudad
    - aceptaTerminos, aceptaCompartir
    - tiempoCompra
    - sustentoIndependiente
    - resultado: objeto devuelto por /api/precalificar
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
      tiempoCompra, // horizonte de compra
      sustentoIndependiente, // "declaracion" | "movimientos" | "ninguno" | null
    } = req.body || {};

    if (!nombre || !email || !resultado) {
      return res.status(400).json({
        ok: false,
        msg: "Faltan datos obligatorios (nombre, email o resultado).",
      });
    }

    console.info("✅ Nuevo lead recibido:", {
      nombre,
      email,
      telefono,
      ciudad,
      aceptaTerminos,
      aceptaCompartir,
      tiempoCompra,
      sustentoIndependiente,
      productoElegido: resultado?.productoElegido,
    });

    const scoreHL = extraerScoreHL(resultado);
    const producto = extraerProducto(resultado);

    // 1) Guardar lead en Mongo (sin código todavía)
    let lead = await Lead.create({
      nombre,
      email,
      telefono,
      ciudad,
      aceptaTerminos: !!aceptaTerminos,
      aceptaCompartir: !!aceptaCompartir,

      producto,
      scoreHL,
      tiempoCompra: tiempoCompra || null,

      // sustento de ingresos independientes/mixtos
      sustentoIndependiente: sustentoIndependiente || null,

      // resultado completo del simulador
      resultado,

      origen: "Simulador Hipoteca Exprés",
      metadata: {
        canal: "Web",
      },
    });

    // 2) Generar Código HabitaLibre a partir del _id y guardarlo
    const codigoHL = generarCodigoHLDesdeObjectId(lead._id);
    lead.codigoHL = codigoHL;
    await lead.save();

    // 3) Objetos "planos" para el mailer/PDF, incluyendo codigoHL
    const leadPlano = lead.toObject();
    const resultadoConCodigo = { ...resultado, codigoHL };

    // 4) Enviar correos (cliente + interno) con el código incluido
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
   GET /api/leads   (listado paginado + filtros suaves)
   Query:
    - pagina (1..n)
    - limit
    - email, telefono, ciudad, tiempoCompra
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

    if (email) {
      filter.email = { $regex: email.trim(), $options: "i" };
    }
    if (telefono) {
      filter.telefono = { $regex: telefono.trim(), $options: "i" };
    }
    if (ciudad) {
      filter.ciudad = { $regex: ciudad.trim(), $options: "i" };
    }

    // Horizonte de compra
    if (tiempoCompra) {
      filter.tiempoCompra = tiempoCompra;
    }

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
   GET /api/leads/stats  (total, hoy)
=========================================================== */
export async function statsLeads(req, res) {
  try {
    const total = await Lead.countDocuments({});
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const hoy = await Lead.countDocuments({
      createdAt: { $gte: inicioHoy },
    });

    return res.json({
      ok: true,
      total,
      hoy,
    });
  } catch (err) {
    console.error("❌ Error en statsLeads:", err);
    return res.status(500).json({
      ok: false,
      total: 0,
      hoy: 0,
    });
  }
}
