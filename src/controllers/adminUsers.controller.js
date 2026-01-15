// src/controllers/adminUsers.controller.js
import User from "../models/User.js";
import CustomerLead from "../models/CustomerLead.js";

function normStr(v) {
  return String(v || "").trim();
}

function toIdStr(v) {
  if (!v) return "";
  try {
    return String(v);
  } catch {
    return "";
  }
}

function pickEntrada(lead) {
  return lead?.entrada || lead?.input || lead?.metadata?.input || {};
}

function pickResultado(lead) {
  return lead?.resultado || {};
}

function pickProducto(resultado) {
  return (
    resultado?.productoSugerido ||
    resultado?.producto ||
    resultado?.productoTentativo ||
    ""
  );
}

function pickScore(resultado) {
  const s =
    resultado?.scoreHL ??
    resultado?.score ??
    resultado?.scoreHabitaLibre ??
    null;
  return s === null || s === undefined ? null : Number(s);
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function buildAdminUsersItems(req, { limitOverride } = {}) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = limitOverride
    ? Math.min(Math.max(parseInt(String(limitOverride), 10), 1), 5000)
    : Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const q = normStr(req.query.q);
  const statusFilter = normStr(req.query.status);
  const productoFilter = normStr(req.query.producto);
  const ciudadFilter = normStr(req.query.ciudad);
  const horizonteFilter = normStr(req.query.horizonte);
  const soloJourney = normStr(req.query.soloJourney) === "1";

  const userFilter = {};
  if (q) {
    userFilter.$or = [
      { email: { $regex: q, $options: "i" } },
      { nombre: { $regex: q, $options: "i" } },
      { apellido: { $regex: q, $options: "i" } },
      { telefono: { $regex: q, $options: "i" } },
    ];
  }

  const users = await User.find(userFilter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const userIdStrs = users.map((u) => toIdStr(u._id));
  const userEmails = users
    .map((u) => normStr(u.email).toLowerCase())
    .filter(Boolean);

  // Leads que matcheen:
  // - customerId string en CustomerLead
  // - customerId ObjectId en CustomerLead
  // - fallback por email
  const leads = await CustomerLead.find({
    $or: [
      { customerId: { $in: userIdStrs } }, // docs donde customerId es string
      { customerId: { $in: users.map((u) => u._id) } }, // docs donde customerId es ObjectId
      { customerEmail: { $in: userEmails } }, // fallback
    ],
  })
    .sort({ updatedAt: -1 })
    .lean();

  // Índice por customerId string
  const leadByCustomerIdStr = new Map();
  for (const l of leads) {
    const cid = toIdStr(l.customerId);
    if (cid && !leadByCustomerIdStr.has(cid)) leadByCustomerIdStr.set(cid, l);
  }

  // Índice por email
  const leadByEmail = new Map();
  for (const l of leads) {
    const em = normStr(l.customerEmail).toLowerCase();
    if (em && !leadByEmail.has(em)) leadByEmail.set(em, l);
  }

  let items = users.map((u) => {
    const uid = toIdStr(u._id);
    const emailLc = normStr(u.email).toLowerCase();

    const lead = leadByCustomerIdStr.get(uid) || leadByEmail.get(emailLc) || null;

    const entrada = pickEntrada(lead);
    const resultado = pickResultado(lead);

    const producto = pickProducto(resultado);
    const scoreHL = pickScore(resultado);

    const ciudad = entrada?.ciudad || entrada?.city || "";
    const horizonte = entrada?.horizonteCompra || entrada?.horizonte || "";

    // Etapa v1
    let etapa = "sin_journey";
    if (lead) etapa = producto ? "califica" : "en_camino";

    // Opcionales (si existen en tu motor)
    const capacidadCompra =
      resultado?.capacidadCompra ??
      resultado?.capacidad_compra ??
      resultado?.capacidad ??
      "";
    const cuotaEstimada = resultado?.cuotaEstimada ?? resultado?.cuota ?? "";

    return {
      userId: uid,
      email: u.email || "",
      nombre: u.nombre || "",
      apellido: u.apellido || "",
      telefono: u.telefono || "",
      hasJourney: !!lead,
      status: lead?.status || "sin_journey",
      etapa, // califica | en_camino | sin_journey
      producto: producto || "",
      scoreHL,
      ciudad,
      horizonte,
      capacidadCompra,
      cuotaEstimada,
      lastActivity: lead?.updatedAt || u.updatedAt,
      createdAt: u.createdAt,
    };
  });

  // Filtros por datos del lead
  if (soloJourney) items = items.filter((x) => x.hasJourney);
  if (statusFilter) items = items.filter((x) => String(x.status) === statusFilter);
  if (productoFilter)
    items = items.filter((x) =>
      String(x.producto).toLowerCase().includes(productoFilter.toLowerCase())
    );
  if (ciudadFilter)
    items = items.filter(
      (x) => String(x.ciudad).toLowerCase() === ciudadFilter.toLowerCase()
    );
  if (horizonteFilter)
    items = items.filter((x) => String(x.horizonte) === horizonteFilter);

  return { items, page, limit };
}

/**
 * GET /api/admin/users/kpis
 */
export async function kpisAdminUsers(req, res) {
  try {
    const totalUsers = await User.countDocuments({});
    return res.json({ ok: true, totalUsers });
  } catch (err) {
    console.error("[kpisAdminUsers]", err);
    return res
      .status(500)
      .json({ ok: false, message: "Error al calcular KPIs de usuarios" });
  }
}

/**
 * GET /api/admin/users
 */
export async function listarAdminUsers(req, res) {
  try {
    const { items, page, limit } = await buildAdminUsersItems(req);

    // Para UI: total users (sin filtros de lead), si lo quieres aquí también
    const q = normStr(req.query.q);
    const userFilter = {};
    if (q) {
      userFilter.$or = [
        { email: { $regex: q, $options: "i" } },
        { nombre: { $regex: q, $options: "i" } },
        { apellido: { $regex: q, $options: "i" } },
        { telefono: { $regex: q, $options: "i" } },
      ];
    }

    const totalUsers = await User.countDocuments(userFilter);

    return res.json({
      ok: true,
      page,
      limit,
      totalUsers,
      items,
    });
  } catch (err) {
    console.error("[listarAdminUsers]", err);
    return res.status(500).json({ ok: false, message: "Error listando usuarios" });
  }
}

/**
 * GET /api/admin/users/export.csv
 * Exporta CSV con los filtros actuales.
 */
export async function exportAdminUsersCSV(req, res) {
  try {
    // exporta más filas
    const limitOverride = req.query.limit || "2000";
    const { items } = await buildAdminUsersItems(req, { limitOverride });

    const header = [
      "userId",
      "email",
      "nombre",
      "apellido",
      "telefono",
      "ciudad",
      "etapa",
      "status",
      "producto",
      "scoreHL",
      "horizonte",
      "capacidadCompra",
      "cuotaEstimada",
      "lastActivity",
      "createdAt",
    ];

    const rows = [header.join(",")];

    for (const u of items) {
      const line = [
        u.userId,
        u.email,
        u.nombre,
        u.apellido,
        u.telefono,
        u.ciudad,
        u.etapa,
        u.status,
        u.producto,
        u.scoreHL ?? "",
        u.horizonte,
        u.capacidadCompra ?? "",
        u.cuotaEstimada ?? "",
        u.lastActivity ? new Date(u.lastActivity).toISOString() : "",
        u.createdAt ? new Date(u.createdAt).toISOString() : "",
      ].map(csvEscape);

      rows.push(line.join(","));
    }

    const csv = rows.join("\n");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="habitalibre-users-${ts}.csv"`
    );
    return res.status(200).send(csv);
  } catch (err) {
    console.error("[exportAdminUsersCSV]", err);
    return res.status(500).json({ ok: false, message: "Error exportando CSV" });
  }
}
