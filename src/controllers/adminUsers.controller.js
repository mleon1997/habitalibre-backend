// src/controllers/adminUsers.controller.js
import mongoose from "mongoose";
import User from "../models/User.js";
import CustomerLead from "../models/CustomerLead.js";

// Helpers
function pickStr(v) {
  return String(v ?? "").trim();
}

function contains(a, b) {
  return pickStr(a).toLowerCase().includes(pickStr(b).toLowerCase());
}

function toISO(d) {
  try {
    return new Date(d).toISOString();
  } catch {
    return null;
  }
}

// ✅ KPI simple: total de users
export async function kpisAdminUsers(req, res) {
  try {
    const totalUsers = await User.countDocuments({});
    return res.json({ ok: true, totalUsers });
  } catch (err) {
    console.error("[kpisAdminUsers]", err);
    return res.status(500).json({ ok: false, message: "Error cargando KPIs" });
  }
}

/**
 * GET /api/admin/users
 * Query params:
 * - page, limit
 * - q (email/nombre/telefono)
 * - status (precalificado | sin_journey | etc)
 * - producto (VIP|VIS|BIESS)
 * - ciudad
 * - horizonte
 * - soloJourney (true/false)
 */
export async function listAdminUsers(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 20)));
    const skip = (page - 1) * limit;

    const q = pickStr(req.query.q);
    const statusFilter = pickStr(req.query.status);
    const productoFilter = pickStr(req.query.producto);
    const ciudadFilter = pickStr(req.query.ciudad);
    const horizonteFilter = pickStr(req.query.horizonte);
    const soloJourney = String(req.query.soloJourney || "").toLowerCase() === "true";

    // 1) Users base
    const [totalUsers, users] = await Promise.all([
      User.countDocuments({}),
      User.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    // 2) Buscar customer leads por esos users
    const userIds = users.map((u) => u._id);

    // OJO: en tu DB ya vi que customerId a veces está como ObjectId (no como string),
    // así que buscamos por ambas variantes.
    const userIdStrings = userIds.map((id) => String(id));

    const leads = await CustomerLead.find({
      $or: [
        { customerId: { $in: userIds } },       // si quedó ObjectId
        { customerId: { $in: userIdStrings } }, // si quedó string
      ],
    })
      .sort({ updatedAt: -1 })
      .lean();

    // 3) Map: latest lead por user
    const latestLeadByUser = new Map();
    for (const l of leads) {
      const cid = l.customerId;
      const key = String(cid);
      const cur = latestLeadByUser.get(key);
      if (!cur) {
        latestLeadByUser.set(key, l);
        continue;
      }
      const curTime = new Date(cur.updatedAt || cur.createdAt || 0).getTime();
      const newTime = new Date(l.updatedAt || l.createdAt || 0).getTime();
      if (newTime > curTime) latestLeadByUser.set(key, l);
    }

    // 4) Construir items enriquecidos
    let items = users.map((u) => {
      const lead = latestLeadByUser.get(String(u._id)) || null;

      // intenta sacar datos desde entrada/resultado
      const entrada = lead?.entrada || lead?.input || lead?.metadata?.input || {};
      const resultado = lead?.resultado || {};

      const ciudad = pickStr(entrada?.ciudad || entrada?.city || "");
      const horizonte = pickStr(entrada?.horizonte || entrada?.horizonteCompra || "");
      const producto = pickStr(resultado?.productoSugerido || resultado?.producto || "");
      const cuotaEstimada = Number(resultado?.cuotaEstimada || 0) || 0;
      const scoreHL = resultado?.scoreHL ?? resultado?.score ?? null;

      const status = lead ? pickStr(lead.status || "precalificado") : "sin_journey";
      const etapa = lead ? (resultado?.etapa || resultado?.stage || "califica") : "sin_journey";

      const lastActivity = lead?.updatedAt || u.updatedAt || u.createdAt;

      return {
        userId: String(u._id),
        email: u.email,
        nombre: pickStr(u.nombre),
        apellido: pickStr(u.apellido),
        telefono: pickStr(u.telefono),

        hasJourney: !!lead,
        status,
        etapa,

        ciudad,
        horizonte,
        producto: producto || (lead ? "-" : "-"),
        cuotaEstimada: cuotaEstimada || "",
        scoreHL,

        lastActivity: toISO(lastActivity),
        createdAt: toISO(u.createdAt),
      };
    });

    // 5) Filtros (en memoria, suficiente para MVP)
    if (soloJourney) items = items.filter((x) => x.hasJourney);

    if (q) {
      items = items.filter((x) =>
        [x.email, `${x.nombre} ${x.apellido}`, x.telefono].some((v) => contains(v, q))
      );
    }

    if (statusFilter) {
      items = items.filter((x) => String(x.status) === statusFilter);
    }

    if (productoFilter) {
      items = items.filter((x) => contains(x.producto, productoFilter));
    }

    if (ciudadFilter) {
      items = items.filter((x) => contains(x.ciudad, ciudadFilter));
    }

    if (horizonteFilter) {
      items = items.filter((x) => contains(x.horizonte, horizonteFilter));
    }

    return res.json({
      ok: true,
      page,
      limit,
      totalUsers,
      count: items.length,
      items,
    });
  } catch (err) {
    console.error("[listAdminUsers]", err);
    return res.status(500).json({ ok: false, message: "Error listando usuarios" });
  }
}

/**
 * GET /api/admin/users/export/csv
 * Exporta el listado (con filtros) como CSV
 */
export async function exportAdminUsersCSV(req, res) {
  try {
    // Reusamos listAdminUsers pero forzando un límite mayor
    const fakeReq = {
      ...req,
      query: { ...req.query, page: 1, limit: 200 },
    };

    // Ejecutamos listAdminUsers y capturamos resultado
    let payload = null;
    const fakeRes = {
      status: () => fakeRes,
      json: (j) => {
        payload = j;
        return j;
      },
    };

    await listAdminUsers(fakeReq, fakeRes);

    if (!payload?.ok) {
      return res.status(500).json({ ok: false, message: "No se pudo generar CSV" });
    }

    const rows = payload.items || [];
    const cols = [
      "userId",
      "email",
      "nombre",
      "apellido",
      "telefono",
      "ciudad",
      "horizonte",
      "hasJourney",
      "status",
      "etapa",
      "producto",
      "cuotaEstimada",
      "scoreHL",
      "lastActivity",
      "createdAt",
    ];

    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv =
      cols.join(",") +
      "\n" +
      rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="hl-users-${Date.now()}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error("[exportAdminUsersCSV]", err);
    return res.status(500).json({ ok: false, message: "Error exportando CSV" });
  }
}
