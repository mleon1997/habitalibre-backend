// src/controllers/adminUsers.controller.js
import User from "../models/User.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

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

const pickFirst = (...vals) => {
  for (const v of vals) {
    if (v === 0) return 0;
    if (v == null) continue;

    const n = toNum(v);
    if (n != null) return n;

    const s = String(v).trim();
    if (s && s !== "—" && s.toLowerCase() !== "nan") return s;
  }

  return null;
};

const isEmailValid = (v) => EMAIL_REGEX.test(String(v || "").trim());

const isPhoneValid = (v) => {
  const digits = String(v || "").replace(/[^\d]/g, "");

  if (digits.startsWith("593")) {
    return digits.length === 12 && digits[3] === "9";
  }

  if (digits.startsWith("09")) {
    return digits.length === 10;
  }

  if (digits.startsWith("9")) {
    return digits.length === 9;
  }

  return false;
};

const cleanPhoneForWhatsapp = (v) => {
  const digits = String(v || "").replace(/[^\d]/g, "");

  if (!digits) return "";
  if (digits.startsWith("593")) return digits;
  if (digits.startsWith("09")) return `593${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 9) return `593${digits}`;

  return digits;
};

function pickSinOferta(resultado) {
  if (!resultado) return null;

  if (typeof resultado?.sinOferta === "boolean") return resultado.sinOferta;
  if (typeof resultado?.flags?.sinOferta === "boolean") {
    return resultado.flags.sinOferta;
  }
  if (typeof resultado?.output?.sinOferta === "boolean") {
    return resultado.output.sinOferta;
  }

  return null;
}

function pickProducto(resultado, lead) {
  return (
    resultado?.productoSugerido ||
    resultado?.output?.productoSugerido ||
    lead?.producto ||
    lead?.precalificacion?.producto ||
    "—"
  );
}

function pickBanco(resultado, lead) {
  return (
    resultado?.bancoSugerido ||
    resultado?.output?.bancoSugerido ||
    lead?.precalificacion_banco ||
    lead?.precalificacion?.banco ||
    "—"
  );
}

function pickCuota(resultado, lead) {
  return pickFirst(
    resultado?.cuotaEstimada,
    resultado?.output?.cuotaEstimada,
    lead?.precalificacion_cuotaEstimada,
    lead?.precalificacion?.cuotaEstimada
  );
}

function pickDTI(resultado) {
  return pickFirst(
    resultado?.dtiConHipoteca,
    resultado?.output?.dtiConHipoteca,
    resultado?.financialCapacity?.dtiWithMortgage,
    resultado?.output?.financialCapacity?.dtiWithMortgage
  );
}

function buildInputFromLead(lead) {
  if (!lead) return null;

  return {
    ingresoNetoMensual: lead.ingreso_mensual ?? null,
    ingresoPareja: null,
    otrasDeudasMensuales: lead.deuda_mensual_aprox ?? null,
    valorVivienda: lead.valor_vivienda ?? null,
    entradaDisponible: lead.entrada_disponible ?? null,
    edad: lead.edad ?? null,
    afiliadoIess: lead.afiliado_iess ?? null,
    tipoIngreso: lead.tipo_ingreso ?? null,
    aniosEstabilidad: lead.anios_estabilidad ?? null,
    ciudad: lead.ciudad || lead.ciudad_compra || null,
    tiempoCompra: lead.tiempoCompra || null,
  };
}

function buildOutputFromLead(lead) {
  if (!lead) return null;

  const r = lead.resultado || null;

  return {
    scoreHL: pickFirst(lead.scoreHL, r?.scoreHL, r?.output?.scoreHL),
    sinOferta: pickSinOferta(r),
    bancoSugerido: pickBanco(r, lead),
    productoSugerido: pickProducto(r, lead),
    cuotaEstimada: pickCuota(r, lead),
    dtiConHipoteca: pickDTI(r),
  };
}

function computeEtapa({ snapshotOut, lead }) {
  const sinOferta =
    snapshotOut?.sinOferta === true ||
    (snapshotOut?.sinOferta == null && pickSinOferta(lead?.resultado) === true);

  if (sinOferta) return "sin_oferta";

  const decisionEtapa = lead?.decision_etapa || lead?.decision?.etapa || null;
  if (decisionEtapa) return decisionEtapa;

  const hasPrecalif =
    snapshotOut?.scoreHL != null ||
    !!snapshotOut?.bancoSugerido ||
    !!snapshotOut?.productoSugerido ||
    lead?.scoreHL != null ||
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

function computeDecisionEstado(lead) {
  return lead?.decision_estado || lead?.decision?.estado || "—";
}

function computeLlamarHoy(lead) {
  return lead?.decision_llamarHoy === true || lead?.decision?.llamarHoy === true;
}

function computeAccionable({
  telefonoValido,
  ingreso,
  scoreHL,
  cuota,
  producto,
  banco,
  sinOferta,
}) {
  const hasIngreso = Number.isFinite(Number(ingreso)) && Number(ingreso) > 0;

  const hasResult =
    Number.isFinite(Number(scoreHL)) ||
    Number.isFinite(Number(cuota)) ||
    (producto && producto !== "—") ||
    (banco && banco !== "—");

  return telefonoValido && hasIngreso && hasResult && sinOferta !== true;
}

function rowFromUser(u) {
  const lead = u.leadTop || null;

  const snapshotIn = u?.ultimoSnapshotHL?.input || buildInputFromLead(lead);
  const snapshotOut = u?.ultimoSnapshotHL?.output || buildOutputFromLead(lead);

  const email = String(u.email || lead?.email || "").trim();
  const telefono = String(u.telefono || lead?.telefono || "").trim();

  const emailValido = isEmailValid(email);
  const telefonoValido = isPhoneValid(telefono);

  const ciudad = computeCiudad({ user: u, lead, snapshotIn });
  const horizonte = computeHorizonte({ lead, snapshotIn });
  const etapa = computeEtapa({ snapshotOut, lead });

  const ingreso = pickFirst(
    snapshotIn?.ingresoNetoMensual,
    snapshotIn?.ingreso,
    lead?.ingreso_mensual
  );

  const deudas = pickFirst(
    snapshotIn?.otrasDeudasMensuales,
    snapshotIn?.deudas,
    lead?.deuda_mensual_aprox
  );

  const valorVivienda = pickFirst(
    snapshotIn?.valorVivienda,
    lead?.valor_vivienda
  );

  const entrada = pickFirst(
    snapshotIn?.entradaDisponible,
    lead?.entrada_disponible
  );

  const scoreHL = pickFirst(
    snapshotOut?.scoreHL,
    snapshotOut?.score,
    lead?.scoreHL,
    lead?.resultado?.scoreHL,
    lead?.resultado?.output?.scoreHL
  );

  const producto = pickFirst(
    snapshotOut?.productoSugerido,
    lead?.producto,
    lead?.resultado?.productoSugerido,
    lead?.resultado?.output?.productoSugerido
  );

  const banco = pickFirst(
    snapshotOut?.bancoSugerido,
    lead?.precalificacion_banco,
    lead?.resultado?.bancoSugerido,
    lead?.resultado?.output?.bancoSugerido
  );

  const cuotaEstimada = pickFirst(
    snapshotOut?.cuotaEstimada,
    lead?.precalificacion_cuotaEstimada,
    lead?.resultado?.cuotaEstimada,
    lead?.resultado?.output?.cuotaEstimada
  );

  const dtiConHipoteca = pickFirst(
    snapshotOut?.dtiConHipoteca,
    lead?.resultado?.dtiConHipoteca,
    lead?.resultado?.output?.dtiConHipoteca
  );

  const sinOferta =
    snapshotOut?.sinOferta ??
    pickSinOferta(lead?.resultado) ??
    null;

  const contactable = emailValido || telefonoValido;

  const accionable = computeAccionable({
    telefonoValido,
    ingreso,
    scoreHL,
    cuota: cuotaEstimada,
    producto,
    banco,
    sinOferta,
  });

  const lastActivity = maxIso(
    u.lastLogin,
    u.updatedAt,
    u?.ultimoSnapshotHL?.createdAt,
    lead?.updatedAt,
    lead?.resultadoUpdatedAt,
    lead?.createdAt
  );

  const decisionEstado = computeDecisionEstado(lead);
  const llamarHoy = computeLlamarHoy(lead);

  return {
    userId: u._id,

    email: email || "—",
    emailValido,

    nombre: u.nombre || lead?.nombre || "",
    apellido: u.apellido || "",

    telefono: telefono || "—",
    telefonoValido,
    telefonoWhatsapp: cleanPhoneForWhatsapp(telefono),

    contactable,
    accionable,

    ciudad,
    horizonte,
    etapa,

    ingreso: ingreso ?? null,
    deudas: deudas ?? null,
    valorVivienda: valorVivienda ?? null,
    entrada: entrada ?? null,

    scoreHL: scoreHL ?? null,
    producto: producto || "—",
    banco: banco || "—",
    cuotaEstimada: cuotaEstimada ?? null,
    dtiConHipoteca: dtiConHipoteca ?? null,
    sinOferta,

    decisionEstado,
    decisionEtapa: lead?.decision_etapa || lead?.decision?.etapa || "—",
    decisionHeat: lead?.decision_heat ?? lead?.decision?.heat ?? null,
    llamarHoy,

    lastLogin: u.lastLogin || null,
    lastActivity,

    hasSnapshot: !!u?.ultimoSnapshotHL?.createdAt,
    hasLead: !!lead,

    leadId: lead?._id || u.currentLeadId || null,
    snapshotAt: u?.ultimoSnapshotHL?.createdAt || null,

    createdAt: u.createdAt || null,
  };
}

async function getAllRows() {
  const users = await User.aggregate([
    {
      $lookup: {
        from: "leads",
        let: { uid: "$_id", lid: "$currentLeadId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  {
                    $and: [
                      { $ne: ["$$lid", null] },
                      { $eq: ["$_id", "$$lid"] },
                    ],
                  },
                  { $eq: ["$userId", "$$uid"] },
                ],
              },
            },
          },
          { $sort: { updatedAt: -1, resultadoUpdatedAt: -1, createdAt: -1 } },
          { $limit: 1 },
        ],
        as: "leadTop",
      },
    },
    { $addFields: { leadTop: { $arrayElemAt: ["$leadTop", 0] } } },
    {
      $project: {
        passwordHash: 0,
        resetPasswordTokenHash: 0,
        resetPasswordExpiresAt: 0,
        __v: 0,
      },
    },
  ]);

  return users.map(rowFromUser);
}

function filterRows(rows, query = {}) {
  let out = [...rows];

  const qRegex = safeRegex(query.q);

  if (qRegex) {
    out = out.filter((r) => {
      const haystack = [
        r.email,
        r.telefono,
        r.nombre,
        r.apellido,
        r.ciudad,
        r.producto,
        r.banco,
        r.etapa,
        r.decisionEstado,
      ].join(" ");

      return qRegex.test(haystack);
    });
  }

  if (query.soloJourney === "true") {
    out = out.filter(
      (r) => r.lastLogin || r.hasSnapshot || r.hasLead || r.leadId
    );
  }

  if (query.hasPhone === "true") {
    out = out.filter((r) => r.telefonoValido);
  }

  if (query.hasPhone === "false") {
    out = out.filter((r) => !r.telefonoValido);
  }

  if (query.hasEmail === "true") {
    out = out.filter((r) => r.emailValido);
  }

  if (query.hasEmail === "false") {
    out = out.filter((r) => !r.emailValido);
  }

  if (query.hasSnapshot === "true") {
    out = out.filter((r) => r.hasSnapshot);
  }

  if (query.hasSnapshot === "false") {
    out = out.filter((r) => !r.hasSnapshot);
  }

  if (query.contactable === "true") {
    out = out.filter((r) => r.contactable);
  }

  if (query.accionable === "true") {
    out = out.filter((r) => r.accionable);
  }

  if (query.llamarHoy === "true") {
    out = out.filter((r) => r.llamarHoy);
  }

  if (query.sinOferta === "true") {
    out = out.filter((r) => r.sinOferta === true);
  }

  if (query.sinOferta === "false") {
    out = out.filter((r) => r.sinOferta !== true);
  }

  const scoreMin = toNum(query.scoreMin);
  const scoreMax = toNum(query.scoreMax);

  if (scoreMin != null) {
    out = out.filter((r) => toNum(r.scoreHL) != null && toNum(r.scoreHL) >= scoreMin);
  }

  if (scoreMax != null) {
    out = out.filter((r) => toNum(r.scoreHL) != null && toNum(r.scoreHL) <= scoreMax);
  }

  const ingresoMin = toNum(query.ingresoMin);
  const ingresoMax = toNum(query.ingresoMax);

  if (ingresoMin != null) {
    out = out.filter(
      (r) => toNum(r.ingreso) != null && toNum(r.ingreso) >= ingresoMin
    );
  }

  if (ingresoMax != null) {
    out = out.filter(
      (r) => toNum(r.ingreso) != null && toNum(r.ingreso) <= ingresoMax
    );
  }

  const ciudadRegex = safeRegex(query.ciudad);
  if (ciudadRegex) {
    out = out.filter((r) => ciudadRegex.test(String(r.ciudad || "")));
  }

  const productoRegex = safeRegex(query.producto);
  if (productoRegex) {
    out = out.filter((r) => productoRegex.test(String(r.producto || "")));
  }

  const bancoRegex = safeRegex(query.banco);
  if (bancoRegex) {
    out = out.filter((r) => bancoRegex.test(String(r.banco || "")));
  }

  const decisionEstado = String(query.decisionEstado || "").trim();
  if (decisionEstado) {
    out = out.filter((r) => String(r.decisionEstado || "") === decisionEstado);
  }

  const etapa = String(query.etapa || query.status || "").trim();

  if (etapa) {
    if (etapa === "sin_oferta") {
      out = out.filter((r) => r.sinOferta === true);
    }

    if (etapa === "precalificado") {
      out = out.filter((r) => r.etapa === "precalificado" && r.sinOferta !== true);
    }

    if (etapa === "registro") {
      out = out.filter((r) => r.etapa === "registro" && r.sinOferta !== true);
    }
  }

  return out;
}

function sortRows(rows, sortKey = "activity_desc") {
  const arr = [...rows];

  const dateVal = (v) => {
    const t = v ? new Date(v).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  };

  const numVal = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : -Infinity;
  };

  if (sortKey === "createdAt_asc") {
    return arr.sort((a, b) => dateVal(a.createdAt) - dateVal(b.createdAt));
  }

  if (sortKey === "createdAt_desc") {
    return arr.sort((a, b) => dateVal(b.createdAt) - dateVal(a.createdAt));
  }

  if (sortKey === "activity_asc") {
    return arr.sort((a, b) => dateVal(a.lastActivity) - dateVal(b.lastActivity));
  }

  if (sortKey === "score_desc") {
    return arr.sort((a, b) => numVal(b.scoreHL) - numVal(a.scoreHL));
  }

  if (sortKey === "score_asc") {
    return arr.sort((a, b) => numVal(a.scoreHL) - numVal(b.scoreHL));
  }

  if (sortKey === "ingreso_desc") {
    return arr.sort((a, b) => numVal(b.ingreso) - numVal(a.ingreso));
  }

  if (sortKey === "ingreso_asc") {
    return arr.sort((a, b) => numVal(a.ingreso) - numVal(b.ingreso));
  }

  if (sortKey === "heat_desc") {
    return arr.sort((a, b) => numVal(b.decisionHeat) - numVal(a.decisionHeat));
  }

  return arr.sort((a, b) => dateVal(b.lastActivity) - dateVal(a.lastActivity));
}

function countWhere(rows, fn) {
  return rows.reduce((acc, r) => acc + (fn(r) ? 1 : 0), 0);
}

function breakdown(rows, key, fallback = "Sin dato") {
  const map = new Map();

  for (const r of rows) {
    const raw = r?.[key];
    const label =
      raw == null || String(raw).trim() === "" || raw === "—"
        ? fallback
        : String(raw).trim();

    map.set(label, (map.get(label) || 0) + 1);
  }

  return [...map.entries()]
    .map(([label, count]) => ({ _id: label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/* -------------------------
   GET /api/admin/users/kpis
------------------------- */

export const kpisAdminUsers = async (req, res) => {
  try {
    const allRows = await getAllRows();
    const rows = filterRows(allRows, req.query);

    const totalUsers = rows.length;

    res.json({
      ok: true,

      totalUsers,
      conLogin: countWhere(rows, (r) => !!r.lastLogin),
      conSnapshot: countWhere(rows, (r) => !!r.hasSnapshot),
      conLead: countWhere(rows, (r) => !!r.hasLead),

      conEmailValido: countWhere(rows, (r) => !!r.emailValido),
      conTelefonoValido: countWhere(rows, (r) => !!r.telefonoValido),
      contactables: countWhere(rows, (r) => !!r.contactable),
      accionables: countWhere(rows, (r) => !!r.accionable),

      conIngreso: countWhere(rows, (r) => toNum(r.ingreso) != null && toNum(r.ingreso) > 0),
      conCiudad: countWhere(rows, (r) => r.ciudad && r.ciudad !== "—"),
      sinIngreso: countWhere(rows, (r) => !(toNum(r.ingreso) != null && toNum(r.ingreso) > 0)),
      sinCiudad: countWhere(rows, (r) => !r.ciudad || r.ciudad === "—"),

      precalificados: countWhere(
        rows,
        (r) =>
          r.sinOferta !== true &&
          (toNum(r.scoreHL) != null ||
            toNum(r.cuotaEstimada) != null ||
            (r.producto && r.producto !== "—") ||
            (r.banco && r.banco !== "—"))
      ),

      sinOferta: countWhere(rows, (r) => r.sinOferta === true),

      scoreAlto: countWhere(rows, (r) => toNum(r.scoreHL) != null && toNum(r.scoreHL) >= 75),
      scoreMedio: countWhere(
        rows,
        (r) => toNum(r.scoreHL) != null && toNum(r.scoreHL) >= 45 && toNum(r.scoreHL) < 75
      ),
      scoreBajo: countWhere(rows, (r) => toNum(r.scoreHL) != null && toNum(r.scoreHL) < 45),

      llamarHoy: countWhere(rows, (r) => !!r.llamarHoy),

      decisionBancable: countWhere(rows, (r) => r.decisionEstado === "bancable"),
      decisionRescatable: countWhere(rows, (r) => r.decisionEstado === "rescatable"),
      decisionDescartable: countWhere(rows, (r) => r.decisionEstado === "descartable"),

      byProduct: breakdown(rows, "producto", "Sin producto"),
      byCity: breakdown(rows, "ciudad", "Sin ciudad"),
      byDecision: breakdown(rows, "decisionEstado", "Sin decisión"),
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

    const allRows = await getAllRows();
    const filtered = filterRows(allRows, req.query);
    const sorted = sortRows(filtered, String(req.query.sort || "activity_desc"));

    const items = sorted.slice(skip, skip + limit);

    res.json({
      ok: true,
      items,
      count: filtered.length,
    });
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
    const allRows = await getAllRows();
    const filtered = filterRows(allRows, req.query);
    const sorted = sortRows(filtered, String(req.query.sort || "activity_desc"));

    const header = [
      "userId",
      "email",
      "emailValido",
      "nombre",
      "apellido",
      "telefono",
      "telefonoValido",
      "telefonoWhatsapp",
      "contactable",
      "accionable",

      "ciudad",
      "horizonte",
      "etapa",

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

      "decisionEstado",
      "decisionEtapa",
      "decisionHeat",
      "llamarHoy",

      "createdAt",
      "lastLogin",
      "lastActivity",

      "leadId",
      "snapshotAt",
    ];

    const escape = (v) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replaceAll('"', '""')}"`;
      }
      return s;
    };

    const rows = sorted.map((r) => [
      r.userId,
      r.email === "—" ? "" : r.email,
      r.emailValido ? "sí" : "no",
      r.nombre || "",
      r.apellido || "",
      r.telefono === "—" ? "" : r.telefono,
      r.telefonoValido ? "sí" : "no",
      r.telefonoWhatsapp || "",
      r.contactable ? "sí" : "no",
      r.accionable ? "sí" : "no",

      r.ciudad === "—" ? "" : r.ciudad,
      r.horizonte === "—" ? "" : r.horizonte,
      r.etapa || "",

      r.ingreso ?? "",
      r.deudas ?? "",
      r.valorVivienda ?? "",
      r.entrada ?? "",
      r.scoreHL ?? "",
      r.producto === "—" ? "" : r.producto,
      r.banco === "—" ? "" : r.banco,
      r.cuotaEstimada ?? "",
      r.dtiConHipoteca ?? "",
      r.sinOferta ?? "",

      r.decisionEstado === "—" ? "" : r.decisionEstado,
      r.decisionEtapa === "—" ? "" : r.decisionEtapa,
      r.decisionHeat ?? "",
      r.llamarHoy ? "sí" : "no",

      r.createdAt ? new Date(r.createdAt).toISOString() : "",
      r.lastLogin ? new Date(r.lastLogin).toISOString() : "",
      r.lastActivity || "",

      r.leadId || "",
      r.snapshotAt ? new Date(r.snapshotAt).toISOString() : "",
    ]);

    const csv = [
      header.join(","),
      ...rows.map((r) => r.map(escape).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="hl-customer-journey-users.csv"`
    );

    res.status(200).send(csv);
  } catch (e) {
    console.error("exportAdminUsersCSV error:", e);
    res.status(500).json({ ok: false, message: "No se pudo exportar CSV" });
  }
};