// src/controllers/adminUsers.controller.js
import User from "../models/User.js";
import ConversationSession from "../models/ConversationSession.js";

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const safeRegex = (s) => {
  const t = String(s || "").trim();
  if (!t) return null;
  return new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
};

const buildUserMatch = (q) => {
  const match = {};

  if (q.q) {
    const r = safeRegex(q.q);
    if (r) {
      match.$or = [{ nombre: r }, { apellido: r }, { email: r }, { telefono: r }];
    }
  }

  // Filtros financieros opcionales
  const scoreMin = toNum(q.scoreMin);
  const scoreMax = toNum(q.scoreMax);
  if (scoreMin != null || scoreMax != null) {
    match["ultimoSnapshotHL.output.scoreHL"] = {};
    if (scoreMin != null) match["ultimoSnapshotHL.output.scoreHL"].$gte = scoreMin;
    if (scoreMax != null) match["ultimoSnapshotHL.output.scoreHL"].$lte = scoreMax;
  }

  const ingresoMin = toNum(q.ingresoMin);
  const ingresoMax = toNum(q.ingresoMax);
  if (ingresoMin != null || ingresoMax != null) {
    match["ultimoSnapshotHL.input.ingresoNetoMensual"] = {};
    if (ingresoMin != null) match["ultimoSnapshotHL.input.ingresoNetoMensual"].$gte = ingresoMin;
    if (ingresoMax != null) match["ultimoSnapshotHL.input.ingresoNetoMensual"].$lte = ingresoMax;
  }

  if (q.sinOferta === "true") match["ultimoSnapshotHL.output.sinOferta"] = true;
  if (q.sinOferta === "false") match["ultimoSnapshotHL.output.sinOferta"] = false;

  if (q.banco) {
    const r = safeRegex(q.banco);
    if (r) match["ultimoSnapshotHL.output.bancoSugerido"] = r;
  }
  if (q.productoSugerido) {
    const r = safeRegex(q.productoSugerido);
    if (r) match["ultimoSnapshotHL.output.productoSugerido"] = r;
  }

  // ojo: "soloJourney" lo resolvemos con lookup también (sessions)
  return match;
};

const computeEtapa = (u) => {
  const out = u?.ultimoSnapshotHL?.output;
  if (out?.sinOferta === true) return "sin_oferta";
  if (out?.scoreHL != null || out?.bancoSugerido || out?.productoSugerido) return "precalificado";
  return "registro";
};

const computeProducto = (u) => u?.ultimoSnapshotHL?.output?.productoSugerido || "-";
const computeCiudad = (u) => u?.ciudad || u?.ultimoSnapshotHL?.input?.ciudad || "-";
const computeCuota = (u) => u?.ultimoSnapshotHL?.output?.cuotaEstimada ?? null;

const computeLastActivity = (u) => {
  const a = u?.lastLogin ? new Date(u.lastLogin).getTime() : 0;
  const b = u?.ultimoSnapshotHL?.createdAt ? new Date(u.ultimoSnapshotHL.createdAt).getTime() : 0;
  const c = u?.updatedAt ? new Date(u.updatedAt).getTime() : 0;
  const t = Math.max(a, b, c);
  return t ? new Date(t).toISOString() : null;
};

// GET /api/admin/users/kpis
export const kpisAdminUsers = async (req, res) => {
  try {
    const match = buildUserMatch(req.query);

    const [agg] = await User.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          conLogin: { $sum: { $cond: [{ $ne: ["$lastLogin", null] }, 1, 0] } },
          conSnapshot: {
            $sum: {
              $cond: [{ $ne: ["$ultimoSnapshotHL.createdAt", null] }, 1, 0],
            },
          },
          sinOferta: { $sum: { $cond: ["$ultimoSnapshotHL.output.sinOferta", 1, 0] } },
        },
      },
    ]);

    res.json({
      ok: true,
      totalUsers: agg?.totalUsers || 0,
      conLogin: agg?.conLogin || 0,
      conSnapshot: agg?.conSnapshot || 0,
      sinOferta: agg?.sinOferta || 0,
    });
  } catch (e) {
    console.error("kpisAdminUsers error:", e);
    res.status(500).json({ ok: false, message: "No se pudo cargar KPIs" });
  }
};

// GET /api/admin/users
export const listAdminUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const match = buildUserMatch(req.query);

    const sortKey = String(req.query.sort || "createdAt_desc");
    const sortMap = {
      createdAt_desc: { createdAt: -1 },
      createdAt_asc: { createdAt: 1 },
      lastLogin_desc: { lastLogin: -1 },
      lastLogin_asc: { lastLogin: 1 },
      score_desc: { "ultimoSnapshotHL.output.scoreHL": -1 },
      score_asc: { "ultimoSnapshotHL.output.scoreHL": 1 },
      ingreso_desc: { "ultimoSnapshotHL.input.ingresoNetoMensual": -1 },
      ingreso_asc: { "ultimoSnapshotHL.input.ingresoNetoMensual": 1 },
    };
    const sort = sortMap[sortKey] || sortMap.createdAt_desc;

    const [agg] = await User.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "conversationsessions",
          localField: "_id",
          foreignField: "userId",
          as: "cjSessions",
        },
      },
      { $addFields: { cjSessionsCount: { $size: "$cjSessions" } } },

      ...(req.query.soloJourney === "true"
        ? [
            {
              $match: {
                $or: [
                  { lastLogin: { $ne: null } },
                  { "ultimoSnapshotHL.createdAt": { $ne: null } },
                  { cjSessionsCount: { $gt: 0 } },
                ],
              },
            },
          ]
        : []),

      { $sort: sort },

      {
        $facet: {
          items: [
            { $skip: skip },
            { $limit: limit },
            { $project: { passwordHash: 0, __v: 0, cjSessions: 0 } },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const rawItems = agg?.items || [];
    const count = agg?.total?.[0]?.count || 0;

    const items = rawItems.map((u) => ({
      userId: u._id,
      email: u.email || "-",
      nombre: u.nombre || "",
      apellido: u.apellido || "",
      telefono: u.telefono || "-",

      ciudad: computeCiudad(u),
      etapa: computeEtapa(u),
      producto: computeProducto(u),
      cuotaEstimada: computeCuota(u),

      lastLogin: u.lastLogin || null,
      lastActivity: computeLastActivity(u),

      // ✅ lo que tu frontend necesita para “quick win”
      finanzas: u?.ultimoSnapshotHL?.input || null,
      resultado: u?.ultimoSnapshotHL?.output || null,
      snapshotAt: u?.ultimoSnapshotHL?.createdAt || null,

      cjSessionsCount: u?.cjSessionsCount ?? 0,
    }));

    res.json({ ok: true, items, count });
  } catch (e) {
    console.error("listAdminUsers error:", e);
    res.status(500).json({ ok: false, message: "No se pudo cargar usuarios" });
  }
};

// GET /api/admin/users/export/csv
export const exportAdminUsersCSV = async (req, res) => {
  try {
    const match = buildUserMatch(req.query);

    const users = await User.find(match)
      .select("nombre apellido email telefono ciudad createdAt lastLogin updatedAt ultimoSnapshotHL")
      .sort({ createdAt: -1 })
      .lean();

    const header = [
      "userId",
      "nombre",
      "apellido",
      "email",
      "telefono",
      "ciudad",
      "createdAt",
      "lastLogin",
      "lastActivity",
      "ingresoNetoMensual",
      "ingresoPareja",
      "otrasDeudasMensuales",
      "valorVivienda",
      "entradaDisponible",
      "edad",
      "afiliadoIess",
      "iessAportesTotales",
      "iessAportesConsecutivos",
      "tipoIngreso",
      "aniosEstabilidad",
      "plazoAnios",
      "scoreHL",
      "sinOferta",
      "bancoSugerido",
      "productoSugerido",
      "capacidadPago",
      "cuotaEstimada",
      "dtiConHipoteca",
      "snapshotAt",
    ];

    const escape = (v) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
      return s;
    };

    const rows = users.map((u) => {
      const input = u?.ultimoSnapshotHL?.input || {};
      const out = u?.ultimoSnapshotHL?.output || {};

      const lastActivity = (() => {
        const a = u?.lastLogin ? new Date(u.lastLogin).getTime() : 0;
        const b = u?.ultimoSnapshotHL?.createdAt ? new Date(u.ultimoSnapshotHL.createdAt).getTime() : 0;
        const c = u?.updatedAt ? new Date(u.updatedAt).getTime() : 0;
        const t = Math.max(a, b, c);
        return t ? new Date(t).toISOString() : "";
      })();

      return [
        u._id,
        u.nombre || "",
        u.apellido || "",
        u.email || "",
        u.telefono || "",
        u.ciudad || "",
        u.createdAt ? new Date(u.createdAt).toISOString() : "",
        u.lastLogin ? new Date(u.lastLogin).toISOString() : "",
        lastActivity,

        input.ingresoNetoMensual ?? "",
        input.ingresoPareja ?? "",
        input.otrasDeudasMensuales ?? "",
        input.valorVivienda ?? "",
        input.entradaDisponible ?? "",
        input.edad ?? "",
        input.afiliadoIess ?? "",
        input.iessAportesTotales ?? "",
        input.iessAportesConsecutivos ?? "",
        input.tipoIngreso ?? "",
        input.aniosEstabilidad ?? "",
        input.plazoAnios ?? "",

        out.scoreHL ?? "",
        out.sinOferta ?? "",
        out.bancoSugerido ?? "",
        out.productoSugerido ?? "",
        out.capacidadPago ?? "",
        out.cuotaEstimada ?? "",
        out.dtiConHipoteca ?? "",
        u?.ultimoSnapshotHL?.createdAt ? new Date(u.ultimoSnapshotHL.createdAt).toISOString() : "",
      ];
    });

    const csv = [header.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="hl-customer-journey-users.csv"`);
    res.status(200).send(csv);
  } catch (e) {
    console.error("exportAdminUsersCSV error:", e);
    res.status(500).json({ ok: false, message: "No se pudo exportar CSV" });
  }
};
