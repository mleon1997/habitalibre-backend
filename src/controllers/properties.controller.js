// src/controllers/properties.controller.js
import mongoose from "mongoose";
import Property from "../models/Property.js";

function toNumberOrNull(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNumberOrDefault(value, fallback) {
  const n = toNumberOrNull(value);
  return n == null ? fallback : n;
}

function toBoolean(value, fallback = false) {
  if (value === true || value === "true" || value === "sí" || value === "si") {
    return true;
  }

  if (
    value === false ||
    value === "false" ||
    value === "no" ||
    value === 0 ||
    value === "0"
  ) {
    return false;
  }

  return fallback;
}

function toDateOrNull(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function cleanString(value) {
  return String(value || "").trim();
}

function cleanArray(value) {
  if (Array.isArray(value)) {
    return value.map((x) => cleanString(x)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((x) => cleanString(x))
      .filter(Boolean);
  }

  return [];
}

function normalizeMiduviStatus(value) {
  const raw = cleanString(value).toLowerCase();

  if (["si", "sí", "yes", "true"].includes(raw)) return "si";
  if (["no", "false"].includes(raw)) return "no";
  if (["pendiente", "pending"].includes(raw)) return "pendiente";
  if (["no_aplica", "no aplica", "n/a", "na"].includes(raw)) return "no_aplica";

  return "no_aplica";
}

function normalizeTipoEntrega(value) {
  const raw = cleanString(value).toLowerCase();

  if (["inmediata", "entrega_inmediata", "terminado"].includes(raw)) {
    return "inmediata";
  }

  if (["planos", "sobre_planos"].includes(raw)) {
    return "planos";
  }

  return "construccion";
}

function normalizeEtapaProyecto(value, tipoEntrega) {
  const raw = cleanString(value).toLowerCase();

  const allowed = [
    "planos",
    "construccion",
    "entrega_proxima",
    "entrega_inmediata",
    "terminado",
  ];

  if (allowed.includes(raw)) return raw;

  if (tipoEntrega === "inmediata") return "entrega_inmediata";
  if (tipoEntrega === "planos") return "planos";

  return "construccion";
}

function normalizeEstadoComercial(value) {
  const raw = cleanString(value).toLowerCase();

  if (["disponible", "reservado", "vendido", "pausado", "oculto"].includes(raw)) {
    return raw;
  }

  return "disponible";
}

function normalizeTipoInmueble(value) {
  const raw = cleanString(value).toLowerCase();

  if (["departamento", "suite", "casa", "terreno"].includes(raw)) {
    return raw;
  }

  return "departamento";
}

function normalizeTipoProyecto(value) {
  const raw = cleanString(value).toLowerCase();

  if (["edificio", "conjunto", "urbanizacion", "independiente", "otro"].includes(raw)) {
    return raw;
  }

  return "edificio";
}

function normalizeUso(value) {
  const raw = cleanString(value).toLowerCase();

  if (["vivienda_principal", "inversion", "terreno", "comercial", "otro"].includes(raw)) {
    return raw;
  }

  return "vivienda_principal";
}

function normalizePropertyPayload(payload = {}, { isUpdate = false } = {}) {
  const cleanPayload = { ...payload };

  delete cleanPayload._id;
  delete cleanPayload.createdAt;
  delete cleanPayload.updatedAt;
  delete cleanPayload.__v;

  if (isUpdate) {
    delete cleanPayload.id;
  }

  const tipoEntrega = normalizeTipoEntrega(cleanPayload.tipoEntrega);
  const estadoComercial = normalizeEstadoComercial(cleanPayload.estadoComercial);

  const porcentajeEntradaRequerida = toNumberOrDefault(
    cleanPayload.porcentajeEntradaRequerida ??
      cleanPayload.financing?.downPaymentPct,
    0.1
  );

  const reservaMinima = toNumberOrDefault(
    cleanPayload.reservaMinima ?? cleanPayload.financing?.reserveMin,
    0
  );

  const mesesConstruccionRestantes = toNumberOrDefault(
    cleanPayload.mesesConstruccionRestantes ??
      cleanPayload.financing?.monthsConstruction,
    0
  );

  const montoFirmaPromesa = toNumberOrDefault(
    cleanPayload.montoFirmaPromesa ?? cleanPayload.financing?.promesaAmount,
    0
  );

  const numeroCuotasEntrada = toNumberOrDefault(
    cleanPayload.numeroCuotasEntrada ??
      cleanPayload.financing?.entryInstallmentsCount,
    0
  );

  const m2Construccion = toNumberOrDefault(
    cleanPayload.m2Construccion ?? cleanPayload.m2,
    0
  );

  const m2 = toNumberOrDefault(cleanPayload.m2 ?? cleanPayload.m2Construccion, 0);

  const productIds = Array.isArray(cleanPayload.mortgageProfile?.productIds)
    ? cleanPayload.mortgageProfile.productIds
    : cleanArray(cleanPayload.productIds || cleanPayload.mortgageProfile?.productIds);

  const viviendaNueva = toBoolean(
    cleanPayload.viviendaNueva ?? cleanPayload.proyectoNuevo,
    true
  );

  const publicado =
    ["vendido", "reservado", "pausado", "oculto"].includes(estadoComercial)
      ? false
      : toBoolean(cleanPayload.publicado, true);

  const normalized = {
    ...cleanPayload,

    developer: cleanString(cleanPayload.developer || "GLS Constructores"),
    proyecto: cleanString(cleanPayload.proyecto),
    titulo: cleanString(cleanPayload.titulo),
    descripcion: cleanString(cleanPayload.descripcion),

    unidad: cleanString(cleanPayload.unidad),
    torre: cleanString(cleanPayload.torre),
    bloque: cleanString(cleanPayload.bloque),
    piso: toNumberOrNull(cleanPayload.piso),
    manzana: cleanString(cleanPayload.manzana),
    lote: cleanString(cleanPayload.lote),

    tipoInmueble: normalizeTipoInmueble(cleanPayload.tipoInmueble),
    tipoProyecto: normalizeTipoProyecto(cleanPayload.tipoProyecto),
    uso: normalizeUso(cleanPayload.uso),

    precio: toNumberOrDefault(cleanPayload.precio, 0),
    m2,
    m2Construccion,
    m2Terreno: toNumberOrDefault(cleanPayload.m2Terreno, 0),

    dormitorios: toNumberOrDefault(cleanPayload.dormitorios, 0),
    banos: toNumberOrDefault(cleanPayload.banos, 0),
    parqueaderos: toNumberOrDefault(cleanPayload.parqueaderos, 0),
    bodega: toBoolean(cleanPayload.bodega, false),
    alicuotaEstimada: toNumberOrDefault(cleanPayload.alicuotaEstimada, 0),

    ciudad: cleanString(cleanPayload.ciudad || "Quito"),
    zona: cleanString(cleanPayload.zona || "Quito"),
    ciudadZona: cleanString(cleanPayload.ciudadZona),
    sector: cleanString(cleanPayload.sector),
    direccionReferencial: cleanString(cleanPayload.direccionReferencial),
    googleMapsUrl: cleanString(cleanPayload.googleMapsUrl),

    viviendaNueva,
    proyectoNuevo: viviendaNueva,

    tipoEntrega,
    etapaProyecto: normalizeEtapaProyecto(cleanPayload.etapaProyecto, tipoEntrega),
    fechaEntregaEstimada: toDateOrNull(cleanPayload.fechaEntregaEstimada),
    fechaEscrituraEstimada: toDateOrNull(cleanPayload.fechaEscrituraEstimada),

    permiteEntradaEnCuotas: toBoolean(cleanPayload.permiteEntradaEnCuotas, true),
    mesesConstruccionRestantes,
    porcentajeEntradaRequerida,
    reservaMinima,
    montoFirmaPromesa,
    numeroCuotasEntrada,
    fechaLimiteEntrada: toDateOrNull(cleanPayload.fechaLimiteEntrada),

    financing: {
      ...(cleanPayload.financing || {}),
      downPaymentPct: porcentajeEntradaRequerida,
      mortgagePct: Math.max(0, 1 - porcentajeEntradaRequerida),
      allowInstallments: toBoolean(cleanPayload.permiteEntradaEnCuotas, true),
      reserveMin: reservaMinima,
      monthsConstruction: mesesConstruccionRestantes,
      promesaAmount: montoFirmaPromesa,
      entryInstallmentsCount: numeroCuotasEntrada,
      entryDeadlineDate: toDateOrNull(cleanPayload.fechaLimiteEntrada),
    },

    mortgageProfile: {
      ...(cleanPayload.mortgageProfile || {}),
      productIds,
      requiresFirstHome: toBoolean(
        cleanPayload.requiresFirstHome ??
          cleanPayload.mortgageProfile?.requiresFirstHome,
        false
      ),
      requiresNewConstruction: toBoolean(
        cleanPayload.requiresNewConstruction ??
          cleanPayload.mortgageProfile?.requiresNewConstruction,
        viviendaNueva
      ),
      requiresMiduviQualifiedProject: toBoolean(
        cleanPayload.requiresMiduviQualifiedProject ??
          cleanPayload.mortgageProfile?.requiresMiduviQualifiedProject,
        false
      ),

      acceptsMortgageCredit: toBoolean(
        cleanPayload.aceptaCreditoHipotecario ??
          cleanPayload.acceptsMortgageCredit ??
          cleanPayload.mortgageProfile?.acceptsMortgageCredit,
        true
      ),
      acceptsBIESS: toBoolean(
        cleanPayload.aceptaBIESS ??
          cleanPayload.acceptsBIESS ??
          cleanPayload.mortgageProfile?.acceptsBIESS,
        true
      ),
      acceptsPrivateBank: toBoolean(
        cleanPayload.aceptaBancaPrivada ??
          cleanPayload.acceptsPrivateBank ??
          cleanPayload.mortgageProfile?.acceptsPrivateBank,
        true
      ),
      acceptsCooperatives: toBoolean(
        cleanPayload.aceptaCooperativas ??
          cleanPayload.acceptsCooperatives ??
          cleanPayload.mortgageProfile?.acceptsCooperatives,
        false
      ),
      acceptsCash: toBoolean(
        cleanPayload.aceptaContado ??
          cleanPayload.acceptsCash ??
          cleanPayload.mortgageProfile?.acceptsCash,
        true
      ),
      alliedBank: cleanString(
        cleanPayload.bancoAliado ||
          cleanPayload.alliedBank ||
          cleanPayload.mortgageProfile?.alliedBank
      ),
      miduviQualificationStatus: normalizeMiduviStatus(
        cleanPayload.proyectoCalificadoMiduvi ||
          cleanPayload.miduviQualificationStatus ||
          cleanPayload.mortgageProfile?.miduviQualificationStatus
      ),
    },

    matchReason: cleanString(cleanPayload.matchReason),
    matchBadge: cleanString(cleanPayload.matchBadge),

    imagen: cleanString(cleanPayload.imagen),
    galeria: cleanArray(cleanPayload.galeria),
    brochureUrl: cleanString(cleanPayload.brochureUrl),
    videoUrl: cleanString(cleanPayload.videoUrl),

    estadoComercial,
    publicado,
    orden: toNumberOrDefault(cleanPayload.orden, 0),
    fuenteCarga: cleanPayload.fuenteCarga || "manual",
  };

  if (!isUpdate) {
    normalized.id = cleanString(cleanPayload.id);
  }

  return normalized;
}

function buildPropertyFilter(query = {}) {
  const filter = {};

  if (query.publicado !== "all") {
    filter.publicado = true;
  }

  if (query.estadoComercial) {
    filter.estadoComercial = String(query.estadoComercial).trim();
  } else if (query.publicado !== "all") {
    filter.estadoComercial = "disponible";
  }

  if (query.proyecto) {
    filter.proyecto = new RegExp(String(query.proyecto).trim(), "i");
  }

  if (query.developer) {
    filter.developer = new RegExp(String(query.developer).trim(), "i");
  }

  if (query.zona) {
    filter.zona = new RegExp(String(query.zona).trim(), "i");
  }

  if (query.ciudad) {
    filter.ciudad = new RegExp(String(query.ciudad).trim(), "i");
  }

  if (query.sector) {
    filter.sector = new RegExp(String(query.sector).trim(), "i");
  }

  if (query.tipoInmueble) {
    filter.tipoInmueble = String(query.tipoInmueble).trim();
  }

  if (query.tipoEntrega) {
    filter.tipoEntrega = String(query.tipoEntrega).trim();
  }

  if (query.minPrecio || query.maxPrecio) {
    filter.precio = {};

    if (query.minPrecio) {
      filter.precio.$gte = Number(query.minPrecio);
    }

    if (query.maxPrecio) {
      filter.precio.$lte = Number(query.maxPrecio);
    }
  }

  if (query.productId) {
    filter["mortgageProfile.productIds"] = String(query.productId).trim();
  }

  if (query.aceptaBIESS != null) {
    filter["mortgageProfile.acceptsBIESS"] = toBoolean(query.aceptaBIESS, true);
  }

  if (query.aceptaBancaPrivada != null) {
    filter["mortgageProfile.acceptsPrivateBank"] = toBoolean(
      query.aceptaBancaPrivada,
      true
    );
  }

  if (query.search) {
    filter.$text = { $search: String(query.search).trim() };
  }

  return filter;
}

function buildPropertyLookup(identifier) {
  const value = String(identifier || "").trim();

  if (!value) {
    return { id: "__missing_property_id__" };
  }

  if (mongoose.Types.ObjectId.isValid(value)) {
    return { _id: value };
  }

  return { id: value };
}

function sanitizeUpdatePayload(payload = {}) {
  const cleanPayload = { ...payload };

  delete cleanPayload._id;
  delete cleanPayload.id;
  delete cleanPayload.createdAt;
  delete cleanPayload.updatedAt;
  delete cleanPayload.__v;

  return cleanPayload;
}

export async function listarPropiedades(req, res) {
  try {
const query = {
  ...(req.query || {}),
  ...(req.adminPropertiesAll ? { publicado: "all" } : {}),
};

const filter = buildPropertyFilter(query);
    const limit = Math.min(Number(req.query.limit) || 100, 300);

    const properties = await Property.find(filter)
      .sort({ orden: 1, precio: 1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      ok: true,
      count: properties.length,
      properties,
    });
  } catch (error) {
    console.error("[properties] Error listarPropiedades:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudieron cargar las propiedades.",
    });
  }
}

export async function obtenerPropiedad(req, res) {
  try {
    const { id } = req.params;

    const property = await Property.findOne(buildPropertyLookup(id)).lean();

    if (!property) {
      return res.status(404).json({
        ok: false,
        message: "Propiedad no encontrada.",
      });
    }

    return res.json({
      ok: true,
      property,
    });
  } catch (error) {
    console.error("[properties] Error obtenerPropiedad:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo cargar la propiedad.",
    });
  }
}

export async function crearPropiedad(req, res) {
  try {
    const payload = normalizePropertyPayload(req.body || {}, { isUpdate: false });

    if (!payload.id || !payload.proyecto || !payload.titulo || !payload.precio) {
      return res.status(400).json({
        ok: false,
        message: "Faltan campos obligatorios: id, proyecto, titulo, precio.",
      });
    }

    const exists = await Property.findOne({ id: payload.id }).lean();

    if (exists) {
      return res.status(409).json({
        ok: false,
        message: "Ya existe una propiedad con ese id.",
      });
    }

    const property = await Property.create(payload);

    return res.status(201).json({
      ok: true,
      property,
    });
  } catch (error) {
    console.error("[properties] Error crearPropiedad:", error);
    return res.status(500).json({
      ok: false,
      message: error?.message || "No se pudo crear la propiedad.",
    });
  }
}

export async function actualizarPropiedad(req, res) {
  try {
    const { id } = req.params;

    const rawPayload = sanitizeUpdatePayload(req.body || {});

    const property = await Property.findOne(buildPropertyLookup(id));

    if (!property) {
      return res.status(404).json({
        ok: false,
        message: "Propiedad no encontrada.",
      });
    }

    const current = property.toObject();

    const mergedPayload = {
      ...current,
      ...rawPayload,

      financing: {
        ...(current.financing || {}),
        ...(rawPayload.financing || {}),
      },

      mortgageProfile: {
        ...(current.mortgageProfile || {}),
        ...(rawPayload.mortgageProfile || {}),
      },
    };

    const payload = normalizePropertyPayload(mergedPayload, { isUpdate: true });

    property.set(payload);
    await property.save();

    return res.json({
      ok: true,
      property,
    });
  } catch (error) {
    console.error("[properties] Error actualizarPropiedad:", error);
    return res.status(500).json({
      ok: false,
      message: error?.message || "No se pudo actualizar la propiedad.",
    });
  }
}

export async function cambiarEstadoPropiedad(req, res) {
  try {
    const { id } = req.params;
    const { estadoComercial, publicado } = req.body || {};

    const update = {};

    if (estadoComercial) {
      update.estadoComercial = normalizeEstadoComercial(estadoComercial);
    }

    if (typeof publicado === "boolean") {
      update.publicado = publicado;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        ok: false,
        message: "Debes enviar estadoComercial y/o publicado.",
      });
    }

    const property = await Property.findOne(buildPropertyLookup(id));

    if (!property) {
      return res.status(404).json({
        ok: false,
        message: "Propiedad no encontrada.",
      });
    }

    property.set(update);
    await property.save();

    return res.json({
      ok: true,
      property,
    });
  } catch (error) {
    console.error("[properties] Error cambiarEstadoPropiedad:", error);
    return res.status(500).json({
      ok: false,
      message: error?.message || "No se pudo cambiar el estado de la propiedad.",
    });
  }
}

export async function eliminarPropiedad(req, res) {
  try {
    const { id } = req.params;

    const property = await Property.findOneAndDelete(buildPropertyLookup(id));

    if (!property) {
      return res.status(404).json({
        ok: false,
        message: "Propiedad no encontrada.",
      });
    }

    return res.json({
      ok: true,
      message: "Propiedad eliminada correctamente.",
      property,
    });
  } catch (error) {
    console.error("[properties] Error eliminarPropiedad:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo eliminar la propiedad.",
    });
  }
}