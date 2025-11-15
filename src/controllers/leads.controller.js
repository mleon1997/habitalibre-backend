// src/controllers/leads.controller.js
import Lead from "../models/Lead.js";

/* ===========================================================
   Helper para derivar producto y score desde resultado
   =========================================================== */
function derivarProductoYScore(resultado = {}) {
  if (!resultado || typeof resultado !== "object") return {};

  const producto =
    resultado.productoPrincipal ||
    resultado.producto ||
    resultado.mejorProducto ||
    resultado.mejorOpcion?.nombre ||
    null;

  const scoreHL =
    resultado.scoreHL ??
    resultado.scoreHl ??
    resultado.scoreHabitaLibre ??
    resultado.score ??
    null;

  return { producto, scoreHL };
}

/* ===========================================================
   CREAR NUEVO LEAD (POST /api/leads)
   =========================================================== */
export const crearLead = async (req, res) => {
  try {
    const data = req.body || {};
    console.log("📥 Nuevo lead recibido:", data);

    if (!data.email && !data.telefono) {
      return res.status(400).json({
        ok: false,
        message: "Se requiere al menos email o teléfono para crear un lead",
      });
    }

    // Si no vienen producto / scoreHL pero sí viene resultado, los derivamos
    if (!data.producto || data.scoreHL == null) {
      const derivados = derivarProductoYScore(data.resultado || {});
      if (!data.producto) data.producto = derivados.producto;
      if (data.scoreHL == null) data.scoreHL = derivados.scoreHL;
    }

    const lead = new Lead(data);
    await lead.save();

    return res.status(201).json({
      ok: true,
      message: "Lead creado correctamente",
      lead,
    });
  } catch (error) {
    console.error("❌ Error creando lead:", error);
    return res.status(500).json({
      ok: false,
      message: "Error al crear el lead",
    });
  }
};

/* ===========================================================
   LISTAR LEADS (GET /api/leads)
   =========================================================== */
export const listarLeads = async (req, res) => {
  try {
    console.log("🔎 Consultando leads con query:", req.query);

    let {
      pagina = 1,
      limit = 20,
      email = "",
      telefono = "",
      ciudad = "",
    } = req.query;

    pagina = parseInt(pagina, 10) || 1;
    limit = parseInt(limit, 10) || 20;

    if (pagina < 1) pagina = 1;
    if (limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const skip = (pagina - 1) * limit;

    const filtro = {};
    if (email) filtro.email = { $regex: email, $options: "i" };
    if (telefono) filtro.telefono = { $regex: telefono, $options: "i" };
    if (ciudad) filtro.ciudad = { $regex: ciudad, $options: "i" };

    const [rawLeads, total] = await Promise.all([
      Lead.find(filtro)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Lead.countDocuments(filtro),
    ]);

    // 👉 Aquí derivamos producto/scoreHL también para los leads viejos
    const leads = rawLeads.map((leadDoc) => {
      const lead = leadDoc.toObject({ getters: true, virtuals: false });

      let { producto, scoreHL } = lead;
      if (!producto || scoreHL == null) {
        const derivados = derivarProductoYScore(lead.resultado || {});
        if (!producto) producto = derivados.producto;
        if (scoreHL == null) scoreHL = derivados.scoreHL;
      }

      return {
        ...lead,
        producto: producto || null,
        scoreHL: scoreHL ?? null,
      };
    });

    const totalPaginas = Math.max(1, Math.ceil(total / limit));

    return res.json({
      ok: true,
      leads,
      total,
      pagina,
      totalPaginas,
    });
  } catch (error) {
    console.error("❌ Error listando leads:", error);
    return res.status(500).json({
      ok: false,
      message: "Error al obtener los leads",
    });
  }
};

/* ===========================================================
   ESTADÍSTICAS DE LEADS (GET /api/leads/stats)
   =========================================================== */
export const statsLeads = async (req, res) => {
  try {
    const total = await Lead.countDocuments();

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const totalHoy = await Lead.countDocuments({
      createdAt: { $gte: inicioHoy },
    });

    return res.json({
      ok: true,
      total,
      totalHoy,
    });
  } catch (error) {
    console.error("❌ Error obteniendo estadísticas de leads:", error);
    return res.status(500).json({
      ok: false,
      message: "Error al obtener estadísticas de leads",
    });
  }
};
