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
  const raw = String(value ?? "").trim().toLowerCase();

  if (
    value === true ||
    raw === "true" ||
    raw === "sí" ||
    raw === "si" ||
    raw === "yes" ||
    raw === "1"
  ) {
    return true;
  }

  if (
    value === false ||
    raw === "false" ||
    raw === "no" ||
    value === 0 ||
    raw === "0"
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

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
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

  if (["departamento", "suite", "estudio", "casa", "terreno"].includes(raw)) {
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

function normalizeEstadoProyectoTexto(value, etapaProyecto, tipoEntrega, proyectoNuevo) {
  const explicit = cleanString(value);
  if (explicit) return explicit;

  if (etapaProyecto === "entrega_inmediata" || tipoEntrega === "inmediata") {
    return "Entrega inmediata";
  }

  if (etapaProyecto === "entrega_proxima") {
    return "Entrega próxima";
  }

  if (etapaProyecto === "planos" || tipoEntrega === "planos") {
    return "En planos";
  }

  if (etapaProyecto === "terminado") {
    return "Terminado";
  }

  return proyectoNuevo ? "Proyecto nuevo" : "En construcción";
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

  const precio = toNumberOrDefault(
    firstNonEmpty(
      cleanPayload.precio,
      cleanPayload.price,
      cleanPayload.valor,
      cleanPayload.listPrice
    ),
    0
  );

  const entradaMinima = toNumberOrNull(
    firstNonEmpty(
      cleanPayload.entradaMinima,
      cleanPayload.entradaRequerida,
      cleanPayload.downPaymentAmount,
      cleanPayload.financing?.downPaymentAmount
    )
  );

  const porcentajeEntradaRequeridaRaw = toNumberOrDefault(
    firstNonEmpty(
      cleanPayload.porcentajeEntradaRequerida,
      cleanPayload.financing?.downPaymentPct
    ),
    0.1
  );

  const porcentajeEntradaRequerida =
    entradaMinima != null && precio > 0
      ? Math.min(1, Math.max(0, entradaMinima / precio))
      : porcentajeEntradaRequeridaRaw;

  const reservaMinima = toNumberOrDefault(
    firstNonEmpty(cleanPayload.reservaMinima, cleanPayload.financing?.reserveMin),
    0
  );

  const mesesConstruccionRestantes = toNumberOrDefault(
    firstNonEmpty(
      cleanPayload.mesesConstruccionRestantes,
      cleanPayload.mesesConstruccion,
      cleanPayload.mesesEntrega,
      cleanPayload.financing?.monthsConstruction
    ),
    0
  );

  const montoFirmaPromesa = toNumberOrDefault(
    firstNonEmpty(
      cleanPayload.montoFirmaPromesa,
      cleanPayload.financing?.promesaAmount
    ),
    0
  );

  const numeroCuotasEntrada = toNumberOrDefault(
    firstNonEmpty(
      cleanPayload.numeroCuotasEntrada,
      cleanPayload.financing?.entryInstallmentsCount
    ),
    0
  );

  const m2Construccion = toNumberOrDefault(
    firstNonEmpty(
      cleanPayload.m2Construccion,
      cleanPayload.m2,
      cleanPayload.area,
      cleanPayload.metros,
      cleanPayload.metros2
    ),
    0
  );

  const m2 = toNumberOrDefault(
    firstNonEmpty(
      cleanPayload.m2,
      cleanPayload.m2Construccion,
      cleanPayload.area,
      cleanPayload.metros,
      cleanPayload.metros2
    ),
    0
  );

  const productIds = Array.isArray(cleanPayload.mortgageProfile?.productIds)
    ? cleanPayload.mortgageProfile.productIds
    : cleanArray(cleanPayload.productIds || cleanPayload.mortgageProfile?.productIds);

  const viviendaNueva = toBoolean(
    firstNonEmpty(cleanPayload.viviendaNueva, cleanPayload.proyectoNuevo),
    true
  );

  const publicado =
    ["vendido", "reservado", "pausado", "oculto"].includes(estadoComercial)
      ? false
      : toBoolean(cleanPayload.publicado, true);

  const cuotaEstimada = toNumberOrNull(
    firstNonEmpty(
      cleanPayload.cuotaEstimada,
      cleanPayload.cuota,
      cleanPayload.monthlyPaymentEstimate,
      cleanPayload.financing?.monthlyPaymentEstimate
    )
  );

  const tasaReferencial = toNumberOrNull(
    firstNonEmpty(
      cleanPayload.tasaReferencial,
      cleanPayload.tasa,
      cleanPayload.referenceRate,
      cleanPayload.financing?.referenceRate
    )
  );

  const plazoAnios = toNumberOrNull(
    firstNonEmpty(
      cleanPayload.plazoAnios,
      cleanPayload.plazoAños,
      cleanPayload.plazo,
      cleanPayload.termYears,
      cleanPayload.financing?.termYears
    )
  );

  const lat = toNumberOrNull(
    firstNonEmpty(
      cleanPayload.lat,
      cleanPayload.latitude,
      cleanPayload.ubicacion?.lat,
      cleanPayload.location?.lat
    )
  );

  const lng = toNumberOrNull(
    firstNonEmpty(
      cleanPayload.lng,
      cleanPayload.lon,
      cleanPayload.longitude,
      cleanPayload.ubicacion?.lng,
      cleanPayload.location?.lng
    )
  );

  const developer = cleanString(
    firstNonEmpty(
      cleanPayload.developer,
      cleanPayload.constructora,
      cleanPayload.promotor,
      "GLS Constructores"
    )
  );

  const constructora = cleanString(
    firstNonEmpty(
      cleanPayload.constructora,
      cleanPayload.developer,
      cleanPayload.promotor,
      "GLS Constructores"
    )
  );

  const promotor = cleanString(
    firstNonEmpty(
      cleanPayload.promotor,
      cleanPayload.constructora,
      cleanPayload.developer,
      "GLS Constructores"
    )
  );

  const tipoInmueble = normalizeTipoInmueble(
    firstNonEmpty(cleanPayload.tipoInmueble, cleanPayload.tipoPropiedad)
  );

  const etapaProyecto = normalizeEtapaProyecto(cleanPayload.etapaProyecto, tipoEntrega);

  const fechaEntregaEstimada = toDateOrNull(
    firstNonEmpty(cleanPayload.fechaEntregaEstimada, cleanPayload.fechaEntrega)
  );

  const fechaEntrega = cleanString(
    firstNonEmpty(cleanPayload.fechaEntrega, cleanPayload.fechaEntregaEstimada)
  );

  const estadoProyecto = normalizeEstadoProyectoTexto(
    firstNonEmpty(cleanPayload.estadoProyecto, cleanPayload.statusProyecto),
    etapaProyecto,
    tipoEntrega,
    viviendaNueva
  );

  const imagen = cleanString(
    firstNonEmpty(cleanPayload.imagen, cleanPayload.image, cleanPayload.imageUrl)
  );

  const galeria = cleanArray(
    firstNonEmpty(
      cleanPayload.galeria,
      cleanPayload.gallery,
      cleanPayload.imagenes,
      cleanPayload.images,
      cleanPayload.fotos
    )
  );

  const planoUrl = cleanString(
    firstNonEmpty(
      cleanPayload.planoUrl,
      cleanPayload.plano,
      cleanPayload.floorPlan,
      cleanPayload.floorPlanUrl
    )
  );

  const nearby = cleanArray(
    firstNonEmpty(
      cleanPayload.nearby,
      cleanPayload.cercaDe,
      cleanPayload.entorno,
      cleanPayload.puntosCercanos
    )
  );

  const amenities = cleanArray(
    firstNonEmpty(cleanPayload.amenities, cleanPayload.amenidades)
  );

  const normalized = {
    ...cleanPayload,

    developer,
    constructora,
    promotor,

    proyecto: cleanString(cleanPayload.proyecto),
    titulo: cleanString(cleanPayload.titulo),
    descripcion: cleanString(cleanPayload.descripcion),

    unidad: cleanString(cleanPayload.unidad),
    torre: cleanString(cleanPayload.torre),
    bloque: cleanString(cleanPayload.bloque),
    piso: toNumberOrNull(cleanPayload.piso),
    manzana: cleanString(cleanPayload.manzana),
    lote: cleanString(cleanPayload.lote),

    tipoInmueble,
    tipoPropiedad: cleanString(
      firstNonEmpty(cleanPayload.tipoPropiedad, cleanPayload.tipoInmueble, tipoInmueble)
    ),
    tipoProyecto: normalizeTipoProyecto(cleanPayload.tipoProyecto),
    uso: normalizeUso(cleanPayload.uso),

    precio,
    m2,
    m2Construccion,
    m2Terreno: toNumberOrDefault(cleanPayload.m2Terreno, 0),

    dormitorios: toNumberOrDefault(
      firstNonEmpty(cleanPayload.dormitorios, cleanPayload.bedrooms, cleanPayload.habitaciones),
      0
    ),
    banos: toNumberOrDefault(
      firstNonEmpty(cleanPayload.banos, cleanPayload.baños, cleanPayload.bathrooms, cleanPayload.baths),
      0
    ),
    parqueaderos: toNumberOrDefault(
      firstNonEmpty(cleanPayload.parqueaderos, cleanPayload.parking, cleanPayload.garajes),
      0
    ),
    bodega: toBoolean(cleanPayload.bodega, false),
    alicuotaEstimada: toNumberOrDefault(cleanPayload.alicuotaEstimada, 0),

    ciudad: cleanString(cleanPayload.ciudad || "Quito"),
    zona: cleanString(cleanPayload.zona || cleanPayload.sector || "Quito"),
    ciudadZona: cleanString(cleanPayload.ciudadZona),
    sector: cleanString(cleanPayload.sector),
    direccionReferencial: cleanString(cleanPayload.direccionReferencial),
    googleMapsUrl: cleanString(cleanPayload.googleMapsUrl),

    lat,
    lng,
    ubicacion: {
      ...(cleanPayload.ubicacion || {}),
      lat,
      lng,
    },
    location: {
      ...(cleanPayload.location || {}),
      lat,
      lng,
    },

    viviendaNueva,
    proyectoNuevo: viviendaNueva,

    tipoEntrega,
    etapaProyecto,
    estadoProyecto,
    fechaEntregaEstimada,
    fechaEntrega,
    fechaEscrituraEstimada: toDateOrNull(cleanPayload.fechaEscrituraEstimada),

    permiteEntradaEnCuotas: toBoolean(cleanPayload.permiteEntradaEnCuotas, true),
    mesesConstruccionRestantes,
    mesesConstruccion: mesesConstruccionRestantes,

    porcentajeEntradaRequerida,
    entradaMinima,
    entradaRequerida: entradaMinima,

    reservaMinima,
    montoFirmaPromesa,
    numeroCuotasEntrada,
    fechaLimiteEntrada: toDateOrNull(cleanPayload.fechaLimiteEntrada),

    cuotaEstimada,
    cuota: cuotaEstimada,

    tasaReferencial,
    tasa: tasaReferencial,

    plazoAnios,
    plazo: plazoAnios,

    financing: {
      ...(cleanPayload.financing || {}),
      downPaymentPct: porcentajeEntradaRequerida,
      mortgagePct: Math.max(0, 1 - porcentajeEntradaRequerida),
      allowInstallments: toBoolean(cleanPayload.permiteEntradaEnCuotas, true),
      reserveMin: reservaMinima,
      monthsConstruction: mesesConstruccionRestantes,
      downPaymentAmount: entradaMinima,
      monthlyPaymentEstimate: cuotaEstimada,
      referenceRate: tasaReferencial,
      termYears: plazoAnios,
      promesaAmount: montoFirmaPromesa,
      entryInstallmentsCount: numeroCuotasEntrada,
      entryDeadlineDate: toDateOrNull(cleanPayload.fechaLimiteEntrada),
    },

    mortgageProfile: {
      ...(cleanPayload.mortgageProfile || {}),
      productIds,
      requiresFirstHome: toBoolean(
        firstNonEmpty(
          cleanPayload.requiresFirstHome,
          cleanPayload.mortgageProfile?.requiresFirstHome
        ),
        false
      ),
      requiresNewConstruction: toBoolean(
        firstNonEmpty(
          cleanPayload.requiresNewConstruction,
          cleanPayload.mortgageProfile?.requiresNewConstruction
        ),
        viviendaNueva
      ),
      requiresMiduviQualifiedProject: toBoolean(
        firstNonEmpty(
          cleanPayload.requiresMiduviQualifiedProject,
          cleanPayload.mortgageProfile?.requiresMiduviQualifiedProject
        ),
        false
      ),

      acceptsMortgageCredit: toBoolean(
        firstNonEmpty(
          cleanPayload.aceptaCreditoHipotecario,
          cleanPayload.acceptsMortgageCredit,
          cleanPayload.mortgageProfile?.acceptsMortgageCredit
        ),
        true
      ),
      acceptsBIESS: toBoolean(
        firstNonEmpty(
          cleanPayload.aceptaBIESS,
          cleanPayload.acceptsBIESS,
          cleanPayload.mortgageProfile?.acceptsBIESS
        ),
        true
      ),
      acceptsPrivateBank: toBoolean(
        firstNonEmpty(
          cleanPayload.aceptaBancaPrivada,
          cleanPayload.acceptsPrivateBank,
          cleanPayload.mortgageProfile?.acceptsPrivateBank
        ),
        true
      ),
      acceptsCooperatives: toBoolean(
        firstNonEmpty(
          cleanPayload.aceptaCooperativas,
          cleanPayload.acceptsCooperatives,
          cleanPayload.mortgageProfile?.acceptsCooperatives
        ),
        false
      ),
      acceptsCash: toBoolean(
        firstNonEmpty(
          cleanPayload.aceptaContado,
          cleanPayload.acceptsCash,
          cleanPayload.mortgageProfile?.acceptsCash
        ),
        true
      ),
      alliedBank: cleanString(
        firstNonEmpty(
          cleanPayload.bancoAliado,
          cleanPayload.alliedBank,
          cleanPayload.mortgageProfile?.alliedBank
        )
      ),
      miduviQualificationStatus: normalizeMiduviStatus(
        firstNonEmpty(
          cleanPayload.proyectoCalificadoMiduvi,
          cleanPayload.miduviQualificationStatus,
          cleanPayload.mortgageProfile?.miduviQualificationStatus
        )
      ),
    },

    matchReason: cleanString(cleanPayload.matchReason),
    matchBadge: cleanString(cleanPayload.matchBadge),

    imagen,
    image: imagen,
    imageUrl: imagen,

    galeria,
    gallery: galeria,
    imagenes: galeria,

    planoUrl,
    plano: planoUrl,
    floorPlan: planoUrl,
    floorPlanUrl: planoUrl,

    nearby,
    cercaDe: nearby,
    entorno: nearby,

    amenities,
    amenidades: amenities,

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

  if (query.tipoPropiedad) {
    filter.tipoPropiedad = new RegExp(String(query.tipoPropiedad).trim(), "i");
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

    const isAdminAll = req.adminPropertiesAll === true;

    const defaultLimit = isAdminAll ? 1000 : 100;
    const maxLimit = isAdminAll ? 2000 : 300;

    const limit = Math.min(
      Math.max(Number(req.query.limit) || defaultLimit, 1),
      maxLimit
    );

    const total = await Property.countDocuments(filter);

    const properties = await Property.find(filter)
      .sort({ orden: 1, precio: 1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      ok: true,
      count: properties.length,
      total,
      limit,
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

      ubicacion: {
        ...(current.ubicacion || {}),
        ...(rawPayload.ubicacion || {}),
      },

      location: {
        ...(current.location || {}),
        ...(rawPayload.location || {}),
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