// src/controllers/properties.controller.js
import Property from "../models/Property.js";

function buildPropertyFilter(query = {}) {
  const filter = {};

  if (query.publicado !== "all") {
    filter.publicado = true;
  }

  if (query.estadoComercial) {
    filter.estadoComercial = query.estadoComercial;
  } else if (query.publicado !== "all") {
    filter.estadoComercial = "disponible";
  }

  if (query.proyecto) {
    filter.proyecto = new RegExp(String(query.proyecto).trim(), "i");
  }

  if (query.zona) {
    filter.zona = new RegExp(String(query.zona).trim(), "i");
  }

  if (query.sector) {
    filter.sector = new RegExp(String(query.sector).trim(), "i");
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

  if (query.search) {
    filter.$text = { $search: String(query.search).trim() };
  }

  return filter;
}

export async function listarPropiedades(req, res) {
  try {
    const filter = buildPropertyFilter(req.query);

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

    const property = await Property.findOne({
      $or: [{ id }, { _id: id }],
    }).lean();

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
    const payload = req.body || {};

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
      message: "No se pudo crear la propiedad.",
    });
  }
}

export async function actualizarPropiedad(req, res) {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    delete payload._id;
    delete payload.createdAt;
    delete payload.updatedAt;

    const property = await Property.findOneAndUpdate(
      { $or: [{ id }, { _id: id }] },
      payload,
      { new: true, runValidators: true }
    );

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
    console.error("[properties] Error actualizarPropiedad:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo actualizar la propiedad.",
    });
  }
}

export async function cambiarEstadoPropiedad(req, res) {
  try {
    const { id } = req.params;
    const { estadoComercial, publicado } = req.body || {};

    const update = {};

    if (estadoComercial) {
      update.estadoComercial = estadoComercial;
    }

    if (typeof publicado === "boolean") {
      update.publicado = publicado;
    }

    const property = await Property.findOneAndUpdate(
      { $or: [{ id }, { _id: id }] },
      update,
      { new: true, runValidators: true }
    );

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
    console.error("[properties] Error cambiarEstadoPropiedad:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo cambiar el estado de la propiedad.",
    });
  }
}

export async function eliminarPropiedad(req, res) {
  try {
    const { id } = req.params;

    const property = await Property.findOneAndDelete({
      $or: [{ id }, { _id: id }],
    });

    if (!property) {
      return res.status(404).json({
        ok: false,
        message: "Propiedad no encontrada.",
      });
    }

    return res.json({
      ok: true,
      message: "Propiedad eliminada.",
    });
  } catch (error) {
    console.error("[properties] Error eliminarPropiedad:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo eliminar la propiedad.",
    });
  }
}