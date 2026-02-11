// src/controllers/adminUsers.controller.js
import User from "../models/User.js";
import Lead from "../models/Lead.js";

/* -------------------------
   Helpers
------------------------- */
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const safeRegex = (s) => {
  const t = String(s || "").trim();
  if (!t) return null;
  return new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
};

const maxIso = (...vals) => {
  const times = vals
    .map((x) => (x ? new Date(x).getTime() : 0))
    .filter((t) => Number.isFinite(t));
  const t = Math.max(0, ...times);
  return t ? new Date(t).toISOString() : null;
};

// ---- extrae “motor result” desde Lead.resultado con tolerancia
function pickSinOferta(resultado) {
  if (!resultado) return null;
  if (typeof resultado?.sinOferta === "boolean") return resultado.sinOferta;
  if (typeof resultado?.flags?.sinOferta === "boolean") return resultado.flags.sinOferta;
  if (typeof resultado?.output?.sinOferta === "boolean") return resultado.output.sinOferta;
  return null;
}

function pickProducto(resultado, lead) {
  // prioridad: motor > lead.producto (rápido) > fallback
  return (
    resultado?.productoSugerido ||
    resultado?.output?.productoSugerido ||
    lead?.producto ||
    "—"
  );
}

function pickBanco(resultado) {
  return resultado?.bancoSugerido || resultado?.output?.bancoSugerido || "—";
}

function pickCuota(resultado, lead) {
  const x =
    resultado?.cuotaEstimada ??
    resultado?.output?.cuotaEstimada ??
    lead?.precalificacion_cuotaEstimada ??
    null;
  return Number.isFinite(Number(x)) ? Number(x) : null;
}

function pickCapacidad(resultado) {
  const x = resultado?.capacidadPago ?? resultado?.output?.capacidadPago ?? null;
  return Number.isFinite(Number(x)) ? Number(x) : null;
}

function pickDTI(resultado) {
  const x = resultado?.dtiConHipoteca ?? resultado?.output?.dtiConHipoteca ?? null;
  return Number.isFinite(Number(x)) ? Number(x) : null;
}

// ---- construye input “quick win style” desde Lead (campos planos)
function buildInputFromLead(lead) {
  if (!lead) return null;
  return {
    ingresoNetoMensual: lead.ingreso_mensual ?? null,
    ingresoPareja: null, // no está en Lead (si luego lo agregas, aquí lo pones)
    otrasDeudasMensuales: lead.deuda_mensual_aprox ?? null,
    valorVivienda: lead.valor_vivienda ?? null,
    entradaDisponible: lead.entrada_disponible ?? null,
    edad: lead.edad ?? null,
    afiliadoIess: lead.afiliado_iess ?? null,
    iessAportesTotales: null,
    iessAportesConsecutivos: null,
    tipoIngreso: lead.tipo_ingreso ?? null,
    aniosEstabilidad: lead.anios_estabilidad ?? null,
    plazoAnios: null,
    ciudad: lead.ciudad || lead.ciudad_compra || null,
    tiempoCompra: lead.tiempoCompra || null,
  };
}

// ---- construye output “quick win style” desde Lead
function buildOutputFromLead(lead) {
  if (!lead) return null;
  const r = lead.resultado || null;
  return {
    scoreHL: lead.scoreHL ?? r?.scoreHL ?? r?.output?.scoreHL ?? null,
    sinOferta: pickSinOferta(r),
    bancoSugerido: pickBanco(r),
    productoSugerido: pickProducto(r, lead),
    capacidadPago: pickCapacidad(r),
    cuotaEstimada: pickCuota(r, lead),
    dtiConHipoteca: pickDTI(r),
  };
}

// ---- compute “etapa” tipo quick win
function computeEtapa({ snapshotOut, lead }) {
  const sinOferta =
    snapshotOut?.sinOferta === true ||
    (snapshotOut?.sinOferta == null && pickSinOferta(lead?.resultado) === true);

  if (sinOferta) return "sin_oferta";

  const hasPrecalif =
    snapshotOut?.scoreHL != null ||
    !!snapshotOut?.bancoSugerido ||
    !!snapshotOut?.productoSugerido ||
    (lead?.scoreHL != null) ||
    !!lead?.producto ||
    !!lead?.precalificacion_cuotaEstimada;

  if (hasPrecalif) return "precalificado";
  return "registro";
}

function computeCiudad({ user, lead, snapshotIn }) {
  return (
    user?.ciudad ||
    snapshotIn?.ciudad ||
    lead?.ciudad ||
    lead?.ciudad_compra ||
    "—"
  );
}

function computeHorizonte({ lead, snapshotIn }) {
  return snapshotIn?.tiempoCompra || lead?.tiempoCompra || "—";
}

/* -------------------------
   Filters builder
------------------------- */
function buildUserMatch(q) {
  const match = {};

  // q: email/nombre/telefono
  if (q.q) {
    const r = safeRegex(q.q);
    if (r) {
      match.$or = [{ nombre: r }, { apellido: r }, { email: r }, { telefono: r }];
    }
  }

  // “soloJourney” = tiene lead, snapshot o lastLogin o currentLeadId
  if (q.soloJourney === "true") {
    match.$or = [
      { lastLogin: { $ne: null } },
      { "ultimoSnapshotHL.createdAt": { $ne: null } },
      { currentLeadId: { $ne: null } },
    ];
  }

  return match;
}

/* -------------------------
   GET /api/admin/users/kpis
------------------------- */
export const kpisAdminUsers = async (req, res) => {
  try {
    const match = buildUserMatch(req.query);

    // agregamos lookup para contar cuántos tienen lead (aunque no tengan snapshot)
    const [agg] = await User.aggregate([
      { $match: match },

      {
        $lookup: {
          from: "leads",
          let: { uid: "$_id", lid: "$currentLeadId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $ne: ["$$lid", null] }, { $eq: ["$_id", "$$lid"] }] },
                    { $eq: ["$userId", "$$uid"] },
                  ],
                },
              },
            },
            { $sort: { updatedAt: -1, createdAt: -1 } },
            { $limit: 1 },
            {
              $project: {
                scoreHL: 1,
                producto: 1,
                precalificacion_cuotaEstimada: 1,
                resultado: 1,
              },
            },
          ],
          as: "leadTop",
        },
      },
      { $addFields: { leadTop: { $arrayElemAt: ["$leadTop", 0] } } },

      {
        $addFields: {
          hasSnapshot: {
            $and: [
              { $ne: ["$ultimoSnapshotHL", null] },
              { $ne: ["$ultimoSnapshotHL.createdAt", null] },
            ],
          },
          hasLead: { $ne: ["$leadTop", null] },
          sinOfertaAny: {
            $cond: [
              { $eq: ["$ultimoSnapshotHL.output.sinOferta", true] },
              true,
              {
                $cond: [
                  { $eq: ["$leadTop.resultado.flags.sinOferta", true] },
                  true,
                  { $eq: ["$leadTop.resultado.sinOferta", true] },
                ],
              },
            ],
          },
          precalifAny: {
            $or: [
              { $ne: ["$ultimoSnapshotHL.output.scoreHL", null] },
              { $ne: ["$leadTop.scoreHL", null] },
              { $ne: ["$leadTop.precalificacion_cuotaEstimada", null] },
            ],
          },
        },
      },

      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          conLogin: { $sum: { $cond: [{ $ne: ["$lastLogin", null] }, 1, 0] } },
          conSnapshot: { $sum: { $cond: ["$hasSnapshot", 1, 0] } },
          conLead: { $sum: { $cond: ["$hasLead", 1, 0] } },
          precalificados: {
            $sum: {
              $cond: [
                { $and: ["$precalifAny", { $ne: ["$sinOfertaAny", true] }] },
                1,
                0,
              ],
            },
          },
          sinOferta: { $sum: { $cond: ["$sinOfertaAny", 1, 0] } },
        },
      },
    ]);

    res.json({
      ok: true,
      totalUsers: agg?.totalUsers || 0,
      conLogin: agg?.conLogin || 0,
      conSnapshot: agg?.conSnapshot || 0,
      conLead: agg?.conLead || 0,
      precalificados: agg?.precalificados || 0,
      sinOferta: agg?.sinOferta || 0,
    });
  } catch (e) {
    console.error("kpisAdminUsers error:", e);
    res.status(500).json({ ok: false, message: "No se pudo cargar KPIs" });
  }
};

/* -------------------------
   GET /api/admin/users
------------------------- */
export const listAdminUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const match = buildUserMatch(req.query);

    const sortKey = String(req.query.sort || "activity_desc");
    const sortMap = {
      createdAt_desc: { createdAt: -1 },
      createdAt_asc: { createdAt: 1 },
      activity_desc: { updatedAt: -1 },
      activity_asc: { updatedAt: 1 },
    };
    const sort = sortMap[sortKey] || sortMap.activity_desc;

    const [agg] = await User.aggregate([
      { $match: match },

      // ✅ Trae el lead asociado (por currentLeadId o por userId)
      {
        $lookup: {
          from: "leads",
          let: { uid: "$_id", lid: "$currentLeadId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $ne: ["$$lid", null] }, { $eq: ["$_id", "$$lid"] }] },
                    { $eq: ["$userId", "$$uid"] },
                  ],
                },
              },
            },
            { $sort: { updatedAt: -1, createdAt: -1 } },
            { $limit: 1 },
          ],
          as: "leadTop",
        },
      },
      { $addFields: { leadTop: { $arrayElemAt: ["$leadTop", 0] } } },

      // ✅ Filtros adicionales que vienen del FRONT
      ...(req.query.ciudad && req.query.ciudad !== "Quito, Gye..."
        ? [
            {
              $match: {
                $or: [
                  { ciudad: safeRegex(req.query.ciudad) || /.*/i },
                  { "leadTop.ciudad": safeRegex(req.query.ciudad) || /.*/i },
                  { "leadTop.ciudad_compra": safeRegex(req.query.ciudad) || /.*/i },
                ],
              },
            },
          ]
        : []),

      ...(req.query.horizonte && req.query.horizonte !== "0–6, 6–12..."
        ? [
            {
              $match: {
                "leadTop.tiempoCompra": safeRegex(req.query.horizonte) || /.*/i,
              },
            },
          ]
        : []),

      ...(req.query.producto && req.query.producto !== "VIP, VIS, BIESS"
        ? [
            {
              $match: {
                $or: [
                  { "ultimoSnapshotHL.output.productoSugerido": safeRegex(req.query.producto) || /.*/i },
                  { "leadTop.producto": safeRegex(req.query.producto) || /.*/i },
                  { "leadTop.resultado.productoSugerido": safeRegex(req.query.producto) || /.*/i },
                ],
              },
            },
          ]
        : []),

      ...(req.query.soloJourney === "true"
        ? [
            {
              $match: {
                $or: [
                  { lastLogin: { $ne: null } },
                  { "ultimoSnapshotHL.createdAt": { $ne: null } },
                  { currentLeadId: { $ne: null } },
                  { leadTop: { $ne: null } },
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
            {
              $project: {
                passwordHash: 0,
                resetPasswordTokenHash: 0,
                resetPasswordExpiresAt: 0,
                __v: 0,
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const rawItems = agg?.items || [];
    const count = agg?.total?.[0]?.count || 0;

    const items = rawItems.map((u) => {
      const lead = u.leadTop || null;

      // snapshot: si existe, úsalo; si no, fabrícalo desde Lead
      const snapshotIn =
        u?.ultimoSnapshotHL?.input ||
        buildInputFromLead(lead) ||
        null;

      const snapshotOut =
        u?.ultimoSnapshotHL?.output ||
        buildOutputFromLead(lead) ||
        null;

      const etapa = computeEtapa({ snapshotOut, lead });

      // status filter (si lo usan como texto)
      if (req.query.status) {
        const st = String(req.query.status).trim().toLowerCase();
        if (st && st !== etapa) {
          // no lo filtramos aquí porque ya está facet; el filtro real se puede implementar arriba,
          // pero lo dejamos en UI (la UI hoy manda "precalificado" por defecto).
        }
      }

      const ciudad = computeCiudad({ user: u, lead, snapshotIn });
      const horizonte = computeHorizonte({ lead, snapshotIn });

      const lastActivity = maxIso(
        u.lastLogin,
        u.updatedAt,
        u?.ultimoSnapshotHL?.createdAt,
        lead?.updatedAt,
        lead?.createdAt
      );

      return {
        userId: u._id,
        email: u.email || "—",
        nombre: u.nombre || "",
        apellido: u.apellido || "",
        telefono: u.telefono || "—",

        ciudad,
        horizonte,

        etapa,

        // ✅ financiero (tipo quick win)
        ingreso: snapshotIn?.ingresoNetoMensual ?? null,
        deudas: snapshotIn?.otrasDeudasMensuales ?? null,
        valorVivienda: snapshotIn?.valorVivienda ?? null,
        entrada: snapshotIn?.entradaDisponible ?? null,

        scoreHL: snapshotOut?.scoreHL ?? null,
        producto: snapshotOut?.productoSugerido || lead?.producto || "—",
        banco: snapshotOut?.bancoSugerido || "—",
        cuotaEstimada: snapshotOut?.cuotaEstimada ?? null,
        dtiConHipoteca: snapshotOut?.dtiConHipoteca ?? null,
        sinOferta: snapshotOut?.sinOferta ?? null,

        // meta
        lastLogin: u.lastLogin || null,
        lastActivity,

        // debug / trazabilidad
        leadId: lead?._id || u.currentLeadId || null,
        snapshotAt: u?.ultimoSnapshotHL?.createdAt || null,
      };
    });

    res.json({ ok: true, items, count });
  } catch (e) {
    console.error("listAdminUsers error:", e);
    res.status(500).json({ ok: false, message: "No se pudo cargar usuarios" });
  }
};

/* -------------------------
   GET /api/admin/users/export/csv
------------------------- */
export const exportAdminUsersCSV = async (req, res) => {
  try {
    const match = buildUserMatch(req.query);

    // buscamos más amplio (sin paginación) y hacemos lookup a lead para backfill
    const users = await User.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "leads",
          let: { uid: "$_id", lid: "$currentLeadId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $ne: ["$$lid", null] }, { $eq: ["$_id", "$$lid"] }] },
                    { $eq: ["$userId", "$$uid"] },
                  ],
                },
              },
            },
            { $sort: { updatedAt: -1, createdAt: -1 } },
            { $limit: 1 },
          ],
          as: "leadTop",
        },
      },
      { $addFields: { leadTop: { $arrayElemAt: ["$leadTop", 0] } } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          passwordHash: 0,
          resetPasswordTokenHash: 0,
          resetPasswordExpiresAt: 0,
          __v: 0,
        },
      },
    ]);

    const header = [
      "userId",
      "email",
      "nombre",
      "apellido",
      "telefono",
      "ciudad",
      "horizonte",
      "etapa",

      // financiero
      "ingreso",
      "deudas",
      "valorVivienda",
      "entrada",
      "scoreHL",
      "producto",
      "banco",
      "cuotaEstimada",
      "dtiConHipoteca",
      "sinOferta",

      // actividad
      "createdAt",
      "lastLogin",
      "lastActivity",

      // trazabilidad
      "leadId",
      "snapshotAt",
    ];

    const escape = (v) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
      return s;
    };

    const rows = users.map((u) => {
      const lead = u.leadTop || null;

      const snapshotIn =
        u?.ultimoSnapshotHL?.input ||
        buildInputFromLead(lead) ||
        null;

      const snapshotOut =
        u?.ultimoSnapshotHL?.output ||
        buildOutputFromLead(lead) ||
        null;

      const ciudad = computeCiudad({ user: u, lead, snapshotIn });
      const horizonte = computeHorizonte({ lead, snapshotIn });
      const etapa = computeEtapa({ snapshotOut, lead });

      const lastActivity = maxIso(
        u.lastLogin,
        u.updatedAt,
        u?.ultimoSnapshotHL?.createdAt,
        lead?.updatedAt,
        lead?.createdAt
      );

      return [
        u._id,
        u.email || "",
        u.nombre || "",
        u.apellido || "",
        u.telefono || "",
        ciudad,
        horizonte,
        etapa,

        snapshotIn?.ingresoNetoMensual ?? "",
        snapshotIn?.otrasDeudasMensuales ?? "",
        snapshotIn?.valorVivienda ?? "",
        snapshotIn?.entradaDisponible ?? "",

        snapshotOut?.scoreHL ?? "",
        snapshotOut?.productoSugerido || lead?.producto || "",
        snapshotOut?.bancoSugerido || "",
        snapshotOut?.cuotaEstimada ?? "",
        snapshotOut?.dtiConHipoteca ?? "",
        snapshotOut?.sinOferta ?? "",

        u.createdAt ? new Date(u.createdAt).toISOString() : "",
        u.lastLogin ? new Date(u.lastLogin).toISOString() : "",
        lastActivity || "",

        lead?._id || u.currentLeadId || "",
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
