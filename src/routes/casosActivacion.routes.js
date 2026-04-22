import express from "express";
import mongoose from "mongoose";
import CasoActivacion from "../models/CasoActivacion.js";
import authCustomer from "../middlewares/authCustomer.js";
import adminAuth from "../middlewares/adminAuth.js";

const router = express.Router();

const GENERAL_STATUSES = [
  "pendiente_revision_habitalibre",
  "listo_para_envio",
  "enviado_a_promotor",
  "enviado_a_banco",
  "enviado_a_ambos",
  "requiere_info_usuario",
  "cerrado",
];

const PROJECT_STATUSES = [
  "por_revisar",
  "enviado",
  "revisando",
  "respondio",
  "cerrado",
];

const BANK_STATUSES = [
  "por_revisar",
  "enviado",
  "evaluando",
  "respondio",
  "cerrado",
];

const READINESS_STATUSES = [
  "no_listo",
  "revisar_ruta",
  "comparar_propiedades",
  "listo_para_promotor",
  "listo_para_promotor_y_banco",
];

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeProbabilityLabel(v) {
  if (v == null || String(v).trim() === "") return null;
  return String(v).trim();
}

function getActorFromReq(req) {
  return req.customer || req.user || req.usuario || null;
}

function buildCustomerName(actor, body = {}) {
  const fromActor =
    actor?.nombreCompleto ||
    actor?.fullName ||
    `${actor?.nombre || ""} ${actor?.apellido || ""}`.trim() ||
    actor?.name ||
    "";

  const fromBody =
    body?.customerName ||
    body?.nombreCompleto ||
    `${body?.nombre || ""} ${body?.apellido || ""}`.trim() ||
    "";

  return String(fromActor || fromBody || "").trim();
}

function buildCustomerEmail(actor, body = {}) {
  return String(actor?.email || body?.customerEmail || body?.email || "")
    .trim()
    .toLowerCase();
}

function buildCustomerPhone(actor, body = {}) {
  return String(
    actor?.telefono || actor?.phone || body?.customerPhone || body?.telefono || ""
  ).trim();
}

function pushEvent(doc, { type, message, req, meta = null }) {
  const actor = getActorFromReq(req);

  doc.events.push({
    type,
    message,
    createdAt: new Date(),
    createdBy:
      actor?._id && isValidObjectId(String(actor._id)) ? actor._id : null,
    createdByEmail: actor?.email ? String(actor.email).trim().toLowerCase() : null,
    meta,
  });
}

function buildSelectedProperty(raw = {}) {
  if (!raw || typeof raw !== "object") return null;

  return {
    id: raw.id || raw._id || raw.propertyId || null,
    title:
      raw.title ||
      raw.titulo ||
      raw.nombre ||
      raw.proyecto ||
      raw.projectName ||
      null,
    city: raw.city || raw.ciudad || raw.zona || raw.sector || null,
    price: toNum(raw.price ?? raw.precio ?? raw.valor ?? raw.listPrice),
    projectName: raw.projectName || raw.proyecto || raw.title || raw.nombre || null,
    developerName: raw.developerName || raw.promotor || raw.developer || null,
    status: raw.status || raw.selectedPropertyStatus || null,
    raw,
  };
}

/**
 * POST /
 * Usuario solicita activar su caso
 * Entra a la cola operativa de HabitaLibre
 */
router.post("/", authCustomer, async (req, res) => {
  try {
    const actor = getActorFromReq(req);
    const body = req.body || {};

    const customerId =
      actor?._id && isValidObjectId(String(actor._id)) ? actor._id : null;
    const customerEmail = buildCustomerEmail(actor, body);
    const customerName = buildCustomerName(actor, body);
    const customerPhone = buildCustomerPhone(actor, body);

    if (!customerEmail) {
      return res.status(400).json({
        ok: false,
        error: "No se pudo determinar el email del cliente.",
      });
    }

    if (!customerName) {
      return res.status(400).json({
        ok: false,
        error: "No se pudo determinar el nombre del cliente.",
      });
    }

    const selectedProperty = buildSelectedProperty(body.selectedProperty);
    const snapshot = body.snapshot || null;
    const journey = body.journey || null;
    const docsChecklist = body.docsChecklist || null;

    const score = toNum(body.score);
    const probability = toNum(body.probability);
    const probabilityLabel = normalizeProbabilityLabel(body.probabilityLabel);
    const estimatedQuota = toNum(body.estimatedQuota);
    const estimatedMaxPurchase = toNum(body.estimatedMaxPurchase);

    const readinessStatus = READINESS_STATUSES.includes(body.readinessStatus)
      ? body.readinessStatus
      : null;

    const caso = new CasoActivacion({
      customerId,
      customerEmail,
      customerName,
      customerPhone,

      requestedAt: new Date(),
      requestedByUser: true,

      statusGeneral: "pendiente_revision_habitalibre",
      projectStatus: "por_revisar",
      bankStatus: "por_revisar",

      selectedProperty,
      snapshot,
      journey,
      docsChecklist,

      score,
      probability,
      probabilityLabel,
      estimatedQuota,
      estimatedMaxPurchase,
      readinessStatus,

      internalNotes: "",
    });

    pushEvent(caso, {
      type: "solicitud_creada",
      message: "El usuario solicitó activar su caso.",
      req,
      meta: {
        selectedPropertyId: selectedProperty?.id || null,
        readinessStatus,
      },
    });

    await caso.save();

    return res.status(201).json({
      ok: true,
      casoId: caso._id,
      statusGeneral: caso.statusGeneral,
      projectStatus: caso.projectStatus,
      bankStatus: caso.bankStatus,
      requestedAt: caso.requestedAt,
      message: "Caso recibido por HabitaLibre y enviado a cola operativa.",
    });
  } catch (error) {
    console.error("❌ Error creando caso de activación:", error);
    return res.status(500).json({
      ok: false,
      error: "No se pudo crear la solicitud de activación.",
    });
  }
});

/**
 * GET /mine/latest
 * Último caso del cliente autenticado
 */
router.get("/mine/latest", authCustomer, async (req, res) => {
  try {
    const actor = getActorFromReq(req);
    const customerEmail = buildCustomerEmail(actor);

    if (!customerEmail) {
      return res.status(400).json({
        ok: false,
        error: "No se pudo determinar el email del cliente.",
      });
    }

    const caso = await CasoActivacion.findOne({ customerEmail })
      .sort({ createdAt: -1 })
      .lean();

    if (!caso) {
      return res.status(404).json({
        ok: false,
        error: "No hay casos de activación para este usuario.",
      });
    }

    return res.json({ ok: true, caso });
  } catch (error) {
    console.error("❌ Error obteniendo último caso del cliente:", error);
    return res.status(500).json({
      ok: false,
      error: "No se pudo obtener el caso del cliente.",
    });
  }
});

/**
 * GET /
 * Lista para dashboard interno de HabitaLibre
 */
router.get("/", adminAuth, async (req, res) => {
  try {
    const {
      statusGeneral,
      projectStatus,
      bankStatus,
      q,
      customerEmail,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};

    if (statusGeneral && GENERAL_STATUSES.includes(String(statusGeneral))) {
      query.statusGeneral = String(statusGeneral);
    }

    if (projectStatus && PROJECT_STATUSES.includes(String(projectStatus))) {
      query.projectStatus = String(projectStatus);
    }

    if (bankStatus && BANK_STATUSES.includes(String(bankStatus))) {
      query.bankStatus = String(bankStatus);
    }

    if (customerEmail) {
      query.customerEmail = String(customerEmail).trim().toLowerCase();
    }

    if (q && String(q).trim()) {
      const search = String(q).trim();
      query.$or = [
        { customerName: { $regex: search, $options: "i" } },
        { customerEmail: { $regex: search, $options: "i" } },
        { customerPhone: { $regex: search, $options: "i" } },
        { "selectedProperty.title": { $regex: search, $options: "i" } },
        { "selectedProperty.projectName": { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      CasoActivacion.find(query)
        .sort({ requestedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      CasoActivacion.countDocuments(query),
    ]);

    return res.json({
      ok: true,
      total,
      page: pageNum,
      limit: limitNum,
      items,
    });
  } catch (error) {
    console.error("❌ Error listando casos de activación:", error);
    return res.status(500).json({
      ok: false,
      error: "No se pudieron listar los casos de activación.",
    });
  }
});

/**
 * GET /:id
 * Detalle para dashboard interno
 */
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        error: "ID de caso inválido.",
      });
    }

    const caso = await CasoActivacion.findById(id).lean();

    if (!caso) {
      return res.status(404).json({
        ok: false,
        error: "Caso no encontrado.",
      });
    }

    return res.json({ ok: true, caso });
  } catch (error) {
    console.error("❌ Error obteniendo detalle del caso:", error);
    return res.status(500).json({
      ok: false,
      error: "No se pudo obtener el detalle del caso.",
    });
  }
});

/**
 * PATCH /:id
 * Actualización manual desde dashboard interno
 */
router.patch("/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        error: "ID de caso inválido.",
      });
    }

    const caso = await CasoActivacion.findById(id);

    if (!caso) {
      return res.status(404).json({
        ok: false,
        error: "Caso no encontrado.",
      });
    }

    const {
      statusGeneral,
      projectStatus,
      bankStatus,
      internalNotes,
      markProjectSubmitted,
      markBankSubmitted,
      actionLabel,
    } = req.body || {};

    const changes = {};

    if (statusGeneral) {
      if (!GENERAL_STATUSES.includes(String(statusGeneral))) {
        return res.status(400).json({
          ok: false,
          error: "statusGeneral inválido.",
        });
      }
      caso.statusGeneral = String(statusGeneral);
      changes.statusGeneral = caso.statusGeneral;
    }

    if (projectStatus) {
      if (!PROJECT_STATUSES.includes(String(projectStatus))) {
        return res.status(400).json({
          ok: false,
          error: "projectStatus inválido.",
        });
      }
      caso.projectStatus = String(projectStatus);
      changes.projectStatus = caso.projectStatus;

      if (
        (String(projectStatus) === "enviado" || markProjectSubmitted === true) &&
        !caso.projectSubmittedAt
      ) {
        caso.projectSubmittedAt = new Date();
      }
    }

    if (bankStatus) {
      if (!BANK_STATUSES.includes(String(bankStatus))) {
        return res.status(400).json({
          ok: false,
          error: "bankStatus inválido.",
        });
      }
      caso.bankStatus = String(bankStatus);
      changes.bankStatus = caso.bankStatus;

      if (
        (String(bankStatus) === "enviado" || markBankSubmitted === true) &&
        !caso.bankSubmittedAt
      ) {
        caso.bankSubmittedAt = new Date();
      }
    }

    if (markProjectSubmitted === true && !caso.projectSubmittedAt) {
      caso.projectSubmittedAt = new Date();
      if (caso.projectStatus === "por_revisar") {
        caso.projectStatus = "enviado";
        changes.projectStatus = caso.projectStatus;
      }
    }

    if (markBankSubmitted === true && !caso.bankSubmittedAt) {
      caso.bankSubmittedAt = new Date();
      if (caso.bankStatus === "por_revisar") {
        caso.bankStatus = "enviado";
        changes.bankStatus = caso.bankStatus;
      }
    }

    if (typeof internalNotes === "string") {
      caso.internalNotes = internalNotes.trim();
      changes.internalNotes = true;
    }

    const actor = getActorFromReq(req);
    if (actor?._id && isValidObjectId(String(actor._id))) {
      caso.reviewedBy = actor._id;
    }
    caso.reviewedAt = new Date();

    pushEvent(caso, {
      type: "actualizacion_operativa",
      message:
        actionLabel ||
        "HabitaLibre actualizó manualmente el estado del caso.",
      req,
      meta: changes,
    });

    await caso.save();

    return res.json({
      ok: true,
      message: "Caso actualizado correctamente.",
      caso,
    });
  } catch (error) {
    console.error("❌ Error actualizando caso de activación:", error);
    return res.status(500).json({
      ok: false,
      error: "No se pudo actualizar el caso.",
    });
  }
});

export default router;