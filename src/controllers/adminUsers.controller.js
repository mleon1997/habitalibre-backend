// src/controllers/adminUsers.controller.js
import User from "../models/User.js";
import Lead from "../models/Lead.js";

/* -------------------------
   Helpers
------------------------- */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PHONE_REGEX = /(\+?593|0)?9[\d\s-]{8,}/;

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

const isEmailValid = (v) => EMAIL_REGEX.test(String(v || "").trim());

const isPhoneValid = (v) => {
  const raw = String(v || "").trim();
  const digits = raw.replace(/[^\d]/g, "");

  if (digits.startsWith("593")) return digits.length === 12 && digits[3] === "9";
  if (digits.startsWith("09")) return digits.length === 10;

  return PHONE_REGEX.test(raw);
};

const cleanPhoneForWhatsapp = (v) => {
  const digits = String(v || "").replace(/[^\d]/g, "");

  if (!digits) return "";
  if (digits.startsWith("593")) return digits;
  if (digits.startsWith("09")) return `593${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 9) return `593${digits}`;

  return digits;
};

const pickFirst = (...vals) => {
  for (const v of vals) {
    if (v === 0) return 0;
    if (v == null) continue;

    const n = toNum(v);
    if (n != null) return n;

    const s = String(v).trim();
    if (s) return v;
  }

  return null;
};

const boolVal = (v) => v === true || String(v).toLowerCase() === "true";

const safeString = (v, fallback = "—") => {
  const s = String(v ?? "").trim();
  return s || fallback;
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
  const x =
    resultado?.cuotaEstimada ??
    resultado?.output?.cuotaEstimada ??
    lead?.precalificacion_cuotaEstimada ??
    lead?.precalificacion?.cuotaEstimada ??
    null;

  return Number.isFinite(Number(x)) ? Number(x) : null;
}

function pickCapacidad(resultado) {
  const x =
    resultado?.capacidadPago ??
    resultado?.output?.capacidadPago ??
    resultado?.precioMaxVivienda ??
    resultado?.output?.precioMaxVivienda ??
    resultado?.financialCapacity?.estimatedMaxPropertyValue ??
    resultado?.output?.financialCapacity?.estimatedMaxPropertyValue ??
    null;

  return Number.isFinite(Number(x)) ? Number(x) : null;
}

function pickDTI(resultado) {
  const x =
    resultado?.dtiConHipoteca ??
    resultado?.output?.dtiConHipoteca ??
    resultado?.financialCapacity?.dtiWithMortgage ??
    resultado?.output?.financialCapacity?.dtiWithMortgage ??
    null;

  return Number.isFinite(Number(x)) ? Number(x) : null;
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
    iessAportesTotales: null,
    iessAportesConsecutivos: null,
    tipoIngreso: lead.tipo_ingreso ?? null,
    aniosEstabilidad: lead.anios_estabilidad ?? null,
    plazoAnios: null,
    ciudad: lead.ciudad || lead.ciudad_compra || null,
    tiempoCompra: lead.tiempoCompra || null,
  };
}

function buildOutputFromLead(lead) {
  if (!lead) return null;

  const r = lead.resultado || null;

  return {
    scoreHL: lead.scoreHL ?? r?.scoreHL ?? r?.output?.scoreHL ?? null,
    sinOferta: pickSinOferta(r),
    bancoSugerido: pickBanco(r, lead),
    productoSugerido: pickProducto(r, lead),
    capacidadPago: pickCapacidad(r),
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

function computeAccionable({ email, telefono, ingreso, scoreHL, cuota, producto, banco, sinOferta }) {
  const contactable = isPhoneValid(telefono) || isEmailValid(email);
  const hasIngreso = Number.isFinite(Number(ingreso)) && Number(ingreso) > 0;
  const hasResult =
    Number.isFinite(Number(scoreHL)) ||
    Number.isFinite(Number(cuota)) ||
    (producto && producto !== "—") ||
    (banco && banco !== "—");

  return contactable && hasIngreso && hasResult && sinOferta !== true;
}

/* -------------------------
   Aggregation pipeline helpers
------------------------- */

function buildInitialUserMatch() {
  return {};
}

function leadLookupStage() {
  return {
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
  };
}

function addComputedStages() {
  return [
    { $addFields: { leadTop: { $arrayElemAt: ["$leadTop", 0] } } },

    {
      $addFields: {
        "_computed.emailAny": {
          $cond: [
            {
              $gt: [
                {
                  $strLenCP: {
                    $trim: { input: { $ifNull: ["$email", ""] } },
                  },
                },
                0,
              ],
            },
            "$email",
            "$leadTop.email",
          ],
        },

        "_computed.telefonoAny": {
          $cond: [
            {
              $gt: [
                {
                  $strLenCP: {
                    $trim: { input: { $ifNull: ["$telefono", ""] } },
                  },
                },
                0,
              ],
            },
            "$telefono",
            "$leadTop.telefono",
          ],
        },

        "_computed.ciudadAny": {
          $cond: [
            {
              $gt: [
                {
                  $strLenCP: {
                    $trim: { input: { $ifNull: ["$ciudad", ""] } },
                  },
                },
                0,
              ],
            },
            "$ciudad",
            {
              $ifNull: ["$ultimoSnapshotHL.input.ciudad", {
                $ifNull: ["$leadTop.ciudad", "$leadTop.ciudad_compra"],
              }],
            },
          ],
        },

        "_computed.ingresoAny": {
          $ifNull: [
            "$ultimoSnapshotHL.input.ingresoNetoMensual",
            {
              $ifNull: [
                "$ultimoSnapshotHL.input.ingreso",
                "$leadTop.ingreso_mensual",
              ],
            },
          ],
        },

        "_computed.deudasAny": {
          $ifNull: [
            "$ultimoSnapshotHL.input.otrasDeudasMensuales",
            {
              $ifNull: [
                "$ultimoSnapshotHL.input.deudas",
                "$leadTop.deuda_mensual_aprox",
              ],
            },
          ],
        },

        "_computed.valorViviendaAny": {
          $ifNull: [
            "$ultimoSnapshotHL.input.valorVivienda",
            "$leadTop.valor_vivienda",
          ],
        },

        "_computed.entradaAny": {
          $ifNull: [
            "$ultimoSnapshotHL.input.entradaDisponible",
            "$leadTop.entrada_disponible",
          ],
        },

        "_computed.scoreAny": {
          $ifNull: [
            "$ultimoSnapshotHL.output.scoreHL",
            {
              $ifNull: [
                "$ultimoSnapshotHL.output.score",
                {
                  $ifNull: [
                    "$leadTop.scoreHL",
                    {
                      $ifNull: [
                        "$leadTop.resultado.scoreHL",
                        "$leadTop.resultado.output.scoreHL",
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },

        "_computed.productoAny": {
          $ifNull: [
            "$ultimoSnapshotHL.output.productoSugerido",
            {
              $ifNull: [
                "$leadTop.resultado.productoSugerido",
                {
                  $ifNull: [
                    "$leadTop.resultado.output.productoSugerido",
                    "$leadTop.producto",
                  ],
                },
              ],
            },
          ],
        },

        "_computed.bancoAny": {
          $ifNull: [
            "$ultimoSnapshotHL.output.bancoSugerido",
            {
              $ifNull: [
                "$leadTop.resultado.bancoSugerido",
                {
                  $ifNull: [
                    "$leadTop.resultado.output.bancoSugerido",
                    "$leadTop.precalificacion_banco",
                  ],
                },
              ],
            },
          ],
        },

        "_computed.cuotaAny": {
          $ifNull: [
            "$ultimoSnapshotHL.output.cuotaEstimada",
            {
              $ifNull: [
                "$leadTop.resultado.cuotaEstimada",
                {
                  $ifNull: [
                    "$leadTop.resultado.output.cuotaEstimada",
                    "$leadTop.precalificacion_cuotaEstimada",
                  ],
                },
              ],
            },
          ],
        },

        "_computed.dtiAny": {
          $ifNull: [
            "$ultimoSnapshotHL.output.dtiConHipoteca",
            {
              $ifNull: [
                "$leadTop.resultado.dtiConHipoteca",
                "$leadTop.resultado.output.dtiConHipoteca",
              ],
            },
          ],
        },

        "_computed.sinOfertaAny": {
          $cond: [
            { $eq: ["$ultimoSnapshotHL.output.sinOferta", true] },
            true,
            {
              $cond: [
                { $eq: ["$leadTop.resultado.flags.sinOferta", true] },
                true,
                {
                  $cond: [
                    { $eq: ["$leadTop.resultado.sinOferta", true] },
                    true,
                    { $eq: ["$leadTop.resultado.output.sinOferta", true] },
                  ],
                },
              ],
            },
          ],
        },

        "_computed.hasSnapshot": {
          $and: [
            { $ne: ["$ultimoSnapshotHL", null] },
            { $ne: ["$ultimoSnapshotHL.createdAt", null] },
          ],
        },

        "_computed.hasLead": { $ne: ["$leadTop", null] },

        "_computed.decisionEstado": {
          $ifNull: ["$leadTop.decision_estado", "$leadTop.decision.estado"],
        },

        "_computed.decisionEtapa": {
          $ifNull: ["$leadTop.decision_etapa", "$leadTop.decision.etapa"],
        },

        "_computed.decisionHeat": {
          $ifNull: ["$leadTop.decision_heat", "$leadTop.decision.heat"],
        },

        "_computed.llamarHoy": {
          $or: [
            { $eq: ["$leadTop.decision_llamarHoy", true] },
            { $eq: ["$leadTop.decision.llamarHoy", true] },
          ],
        },
      },
    },

    {
      $addFields: {
        "_computed.hasEmailValid": {
          $regexMatch: {
            input: { $ifNull: ["$_computed.emailAny", ""] },
            regex: EMAIL_REGEX,
          },
        },

        "_computed.hasPhoneValid": {
          $regexMatch: {
            input: { $ifNull: ["$_computed.telefonoAny", ""] },
            regex: PHONE_REGEX,
          },
        },

        "_computed.hasIngreso": {
          $gt: [{ $toDouble: { $ifNull: ["$_computed.ingresoAny", 0] } }, 0],
        },

        "_computed.hasCiudad": {
          $gt: [
            {
              $strLenCP: {
                $trim: { input: { $ifNull: ["$_computed.ciudadAny", ""] } },
              },
            },
            0,
          ],
        },

        "_computed.hasProducto": {
          $and: [
            { $ne: ["$_computed.productoAny", null] },
            { $ne: ["$_computed.productoAny", ""] },
            { $ne: ["$_computed.productoAny", "—"] },
          ],
        },

        "_computed.hasBanco": {
          $and: [
            { $ne: ["$_computed.bancoAny", null] },
            { $ne: ["$_computed.bancoAny", ""] },
            { $ne: ["$_computed.bancoAny", "—"] },
          ],
        },

        "_computed.hasCuota": {
          $gt: [{ $toDouble: { $ifNull: ["$_computed.cuotaAny", 0] } }, 0],
        },
      },
    },

    {
      $addFields: {
        "_computed.contactable": {
          $or: ["$_computed.hasEmailValid", "$_computed.hasPhoneValid"],
        },

        "_computed.precalifAny": {
          $or: [
            { $ne: ["$_computed.scoreAny", null] },
            "$_computed.hasProducto",
            "$_computed.hasBanco",
            "$_computed.hasCuota",
          ],
        },

        "_computed.accionable": {
          $and: [
            "$_computed.hasPhoneValid",
            "$_computed.hasIngreso",
            {
              $or: [
                { $ne: ["$_computed.scoreAny", null] },
                "$_computed.hasProducto",
                "$_computed.hasBanco",
                "$_computed.hasCuota",
              ],
            },
            { $ne: ["$_computed.sinOfertaAny", true] },
          ],
        },
      },
    },
  ];
}

function buildCommonPipeline(query = {}) {
  const pipeline = [
    { $match: buildInitialUserMatch() },
    leadLookupStage(),
    ...addComputedStages(),
  ];

  const qRegex = safeRegex(query.q);

  if (qRegex) {
    pipeline.push({
      $match: {
        $or: [
          { nombre: qRegex },
          { apellido: qRegex },
          { email: qRegex },
          { telefono: qRegex },
          { "leadTop.nombre": qRegex },
          { "leadTop.email": qRegex },
          { "leadTop.telefono": qRegex },
          { "_computed.ciudadAny": qRegex },
          { "_computed.productoAny": qRegex },
          { "_computed.bancoAny": qRegex },
        ],
      },
    });
  }

  if (query.soloJourney === "true") {
    pipeline.push({
      $match: {
        $or: [
          { lastLogin: { $ne: null } },
          { currentLeadId: { $ne: null } },
          { "_computed.hasSnapshot": true },
          { "_computed.hasLead": true },
        ],
      },
    });
  }

  if (query.hasPhone === "true") {
    pipeline.push({ $match: { "_computed.hasPhoneValid": true } });
  }

  if (query.hasPhone === "false") {
    pipeline.push({ $match: { "_computed.hasPhoneValid": { $ne: true } } });
  }

  if (query.hasEmail === "true") {
    pipeline.push({ $match: { "_computed.hasEmailValid": true } });
  }

  if (query.hasEmail === "false") {
    pipeline.push({ $match: { "_computed.hasEmailValid": { $ne: true } } });
  }

  if (query.contactable === "true") {
    pipeline.push({ $match: { "_computed.contactable": true } });
  }

  if (query.accionable === "true") {
    pipeline.push({ $match: { "_computed.accionable": true } });
  }

  if (query.hasSnapshot === "true") {
    pipeline.push({ $match: { "_computed.hasSnapshot": true } });
  }

  if (query.hasSnapshot === "false") {
    pipeline.push({ $match: { "_computed.hasSnapshot": { $ne: true } } });
  }

  if (query.sinOferta === "true") {
    pipeline.push({ $match: { "_computed.sinOfertaAny": true } });
  }

  if (query.sinOferta === "false") {
    pipeline.push({ $match: { "_computed.sinOfertaAny": { $ne: true } } });
  }

  const scoreMin = toNum(query.scoreMin);
  const scoreMax = toNum(query.scoreMax);

  if (scoreMin != null || scoreMax != null) {
    const scoreMatch = {};
    if (scoreMin != null) scoreMatch.$gte = scoreMin;
    if (scoreMax != null) scoreMatch.$lte = scoreMax;

    pipeline.push({
      $match: {
        "_computed.scoreAny": scoreMatch,
      },
    });
  }

  const ingresoMin = toNum(query.ingresoMin);
  const ingresoMax = toNum(query.ingresoMax);

  if (ingresoMin != null || ingresoMax != null) {
    const ingresoMatch = {};
    if (ingresoMin != null) ingresoMatch.$gte = ingresoMin;
    if (ingresoMax != null) ingresoMatch.$lte = ingresoMax;

    pipeline.push({
      $match: {
        "_computed.ingresoAny": ingresoMatch,
      },
    });
  }

  const ciudadRegex = safeRegex(query.ciudad);
  if (ciudadRegex && String(query.ciudad) !== "Quito, Gye...") {
    pipeline.push({
      $match: {
        "_computed.ciudadAny": ciudadRegex,
      },
    });
  }

  const productoRegex = safeRegex(query.producto);
  if (productoRegex && String(query.producto) !== "VIP, VIS, BIESS") {
    pipeline.push({
      $match: {
        "_computed.productoAny": productoRegex,
      },
    });
  }

  const bancoRegex = safeRegex(query.banco);
  if (bancoRegex) {
    pipeline.push({
      $match: {
        "_computed.bancoAny": bancoRegex,
      },
    });
  }

  const decisionEstado = String(query.decisionEstado || "").trim();
  if (decisionEstado) {
    pipeline.push({
      $match: {
        "_computed.decisionEstado": decisionEstado,
      },
    });
  }

  if (query.llamarHoy === "true") {
    pipeline.push({
      $match: {
        "_computed.llamarHoy": true,
      },
    });
  }

  const etapa = String(query.etapa || query.status || "").trim();
  if (etapa) {
    if (etapa === "sin_oferta") {
      pipeline.push({ $match: { "_computed.sinOfertaAny": true } });
    }

    if (etapa === "precalificado") {
      pipeline.push({
        $match: {
          "_computed.precalifAny": true,
          "_computed.sinOfertaAny": { $ne: true },
        },
      });
    }

    if (etapa === "registro") {
      pipeline.push({
        $match: {
          "_computed.precalifAny": { $ne: true },
          "_computed.sinOfertaAny": { $ne: true },
        },
      });
    }
  }

  return pipeline;
}

/* -------------------------
   GET /api/admin/users/kpis
------------------------- */

export const kpisAdminUsers = async (req, res) => {
  try {
    const pipeline = buildCommonPipeline(req.query);

    const [agg] = await User.aggregate([
      ...pipeline,
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,

                totalUsers: { $sum: 1 },

                conLogin: {
                  $sum: {
                    $cond: [{ $ne: ["$lastLogin", null] }, 1, 0],
                  },
                },

                conSnapshot: {
                  $sum: {
                    $cond: ["$_computed.hasSnapshot", 1, 0],
                  },
                },

                conLead: {
                  $sum: {
                    $cond: ["$_computed.hasLead", 1, 0],
                  },
                },

                conEmailValido: {
                  $sum: {
                    $cond: ["$_computed.hasEmailValid", 1, 0],
                  },
                },

                conTelefonoValido: {
                  $sum: {
                    $cond: ["$_computed.hasPhoneValid", 1, 0],
                  },
                },

                contactables: {
                  $sum: {
                    $cond: ["$_computed.contactable", 1, 0],
                  },
                },

                accionables: {
                  $sum: {
                    $cond: ["$_computed.accionable", 1, 0],
                  },
                },

                conIngreso: {
                  $sum: {
                    $cond: ["$_computed.hasIngreso", 1, 0],
                  },
                },

                conCiudad: {
                  $sum: {
                    $cond: ["$_computed.hasCiudad", 1, 0],
                  },
                },

                sinIngreso: {
                  $sum: {
                    $cond: ["$_computed.hasIngreso", 0, 1],
                  },
                },

                sinCiudad: {
                  $sum: {
                    $cond: ["$_computed.hasCiudad", 0, 1],
                  },
                },

                precalificados: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          "$_computed.precalifAny",
                          { $ne: ["$_computed.sinOfertaAny", true] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },

                sinOferta: {
                  $sum: {
                    $cond: ["$_computed.sinOfertaAny", 1, 0],
                  },
                },

                scoreAlto: {
                  $sum: {
                    $cond: [
                      { $gte: [{ $toDouble: { $ifNull: ["$_computed.scoreAny", -1] } }, 75] },
                      1,
                      0,
                    ],
                  },
                },

                scoreMedio: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: [{ $toDouble: { $ifNull: ["$_computed.scoreAny", -1] } }, 45] },
                          { $lt: [{ $toDouble: { $ifNull: ["$_computed.scoreAny", -1] } }, 75] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },

                scoreBajo: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ["$_computed.scoreAny", null] },
                          { $lt: [{ $toDouble: { $ifNull: ["$_computed.scoreAny", 999] } }, 45] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },

                llamarHoy: {
                  $sum: {
                    $cond: ["$_computed.llamarHoy", 1, 0],
                  },
                },

                decisionBancable: {
                  $sum: {
                    $cond: [{ $eq: ["$_computed.decisionEstado", "bancable"] }, 1, 0],
                  },
                },

                decisionRescatable: {
                  $sum: {
                    $cond: [{ $eq: ["$_computed.decisionEstado", "rescatable"] }, 1, 0],
                  },
                },

                decisionDescartable: {
                  $sum: {
                    $cond: [{ $eq: ["$_computed.decisionEstado", "descartable"] }, 1, 0],
                  },
                },
              },
            },
          ],

          byProduct: [
            {
              $group: {
                _id: { $ifNull: ["$_computed.productoAny", "Sin producto"] },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],

          byCity: [
            {
              $group: {
                _id: { $ifNull: ["$_computed.ciudadAny", "Sin ciudad"] },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],

          byDecision: [
            {
              $group: {
                _id: { $ifNull: ["$_computed.decisionEstado", "Sin decisión"] },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ],
        },
      },
    ]);

    const totals = agg?.totals?.[0] || {};

    res.json({
      ok: true,

      totalUsers: totals.totalUsers || 0,
      conLogin: totals.conLogin || 0,
      conSnapshot: totals.conSnapshot || 0,
      conLead: totals.conLead || 0,

      conEmailValido: totals.conEmailValido || 0,
      conTelefonoValido: totals.conTelefonoValido || 0,
      contactables: totals.contactables || 0,
      accionables: totals.accionables || 0,

      conIngreso: totals.conIngreso || 0,
      conCiudad: totals.conCiudad || 0,
      sinIngreso: totals.sinIngreso || 0,
      sinCiudad: totals.sinCiudad || 0,

      precalificados: totals.precalificados || 0,
      sinOferta: totals.sinOferta || 0,

      scoreAlto: totals.scoreAlto || 0,
      scoreMedio: totals.scoreMedio || 0,
      scoreBajo: totals.scoreBajo || 0,

      llamarHoy: totals.llamarHoy || 0,
      decisionBancable: totals.decisionBancable || 0,
      decisionRescatable: totals.decisionRescatable || 0,
      decisionDescartable: totals.decisionDescartable || 0,

      byProduct: agg?.byProduct || [],
      byCity: agg?.byCity || [],
      byDecision: agg?.byDecision || [],
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

    const sortKey = String(req.query.sort || "activity_desc");

    const sortMap = {
      createdAt_desc: { createdAt: -1 },
      createdAt_asc: { createdAt: 1 },
      activity_desc: { "_computed.lastActivitySort": -1 },
      activity_asc: { "_computed.lastActivitySort": 1 },
      score_desc: { "_computed.scoreAny": -1 },
      score_asc: { "_computed.scoreAny": 1 },
      ingreso_desc: { "_computed.ingresoAny": -1 },
      ingreso_asc: { "_computed.ingresoAny": 1 },
      heat_desc: { "_computed.decisionHeat": -1 },
    };

    const sort = sortMap[sortKey] || sortMap.activity_desc;

    const [agg] = await User.aggregate([
      ...buildCommonPipeline(req.query),

      {
        $addFields: {
          "_computed.lastActivitySort": {
            $max: [
              "$lastLogin",
              "$updatedAt",
              "$ultimoSnapshotHL.createdAt",
              "$leadTop.updatedAt",
              "$leadTop.resultadoUpdatedAt",
              "$leadTop.createdAt",
            ],
          },
        },
      },

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

      const snapshotIn =
        u?.ultimoSnapshotHL?.input ||
        buildInputFromLead(lead) ||
        null;

      const snapshotOut =
        u?.ultimoSnapshotHL?.output ||
        buildOutputFromLead(lead) ||
        null;

      const etapa = computeEtapa({ snapshotOut, lead });
      const ciudad = computeCiudad({ user: u, lead, snapshotIn });
      const horizonte = computeHorizonte({ lead, snapshotIn });

      const lastActivity = maxIso(
        u.lastLogin,
        u.updatedAt,
        u?.ultimoSnapshotHL?.createdAt,
        lead?.updatedAt,
        lead?.resultadoUpdatedAt,
        lead?.createdAt
      );

      const email = safeString(u.email || lead?.email, "");
      const telefono = safeString(u.telefono || lead?.telefono, "");

      const scoreHL = pickFirst(
        snapshotOut?.scoreHL,
        u?._computed?.scoreAny,
        lead?.scoreHL,
        lead?.resultado?.scoreHL,
        lead?.resultado?.output?.scoreHL
      );

      const producto = pickFirst(
        snapshotOut?.productoSugerido,
        u?._computed?.productoAny,
        lead?.producto
      );

      const banco = pickFirst(
        snapshotOut?.bancoSugerido,
        u?._computed?.bancoAny,
        lead?.precalificacion_banco
      );

      const cuotaEstimada = pickFirst(
        snapshotOut?.cuotaEstimada,
        u?._computed?.cuotaAny,
        lead?.precalificacion_cuotaEstimada
      );

      const ingreso = pickFirst(
        snapshotIn?.ingresoNetoMensual,
        u?._computed?.ingresoAny,
        lead?.ingreso_mensual
      );

      const deudas = pickFirst(
        snapshotIn?.otrasDeudasMensuales,
        u?._computed?.deudasAny,
        lead?.deuda_mensual_aprox
      );

      const valorVivienda = pickFirst(
        snapshotIn?.valorVivienda,
        u?._computed?.valorViviendaAny,
        lead?.valor_vivienda
      );

      const entrada = pickFirst(
        snapshotIn?.entradaDisponible,
        u?._computed?.entradaAny,
        lead?.entrada_disponible
      );

      const sinOferta =
        snapshotOut?.sinOferta ??
        u?._computed?.sinOfertaAny ??
        pickSinOferta(lead?.resultado);

      const accionable = computeAccionable({
        email,
        telefono,
        ingreso,
        scoreHL,
        cuota: cuotaEstimada,
        producto,
        banco,
        sinOferta,
      });

      return {
        userId: u._id,
        email: email || "—",
        emailValido: isEmailValid(email),

        nombre: u.nombre || lead?.nombre || "",
        apellido: u.apellido || "",

        telefono: telefono || "—",
        telefonoValido: isPhoneValid(telefono),
        telefonoWhatsapp: cleanPhoneForWhatsapp(telefono),

        contactable: isEmailValid(email) || isPhoneValid(telefono),
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
        dtiConHipoteca: snapshotOut?.dtiConHipoteca ?? u?._computed?.dtiAny ?? null,
        sinOferta: sinOferta ?? null,

        decisionEstado: computeDecisionEstado(lead),
        decisionEtapa: lead?.decision_etapa || lead?.decision?.etapa || "—",
        decisionHeat: lead?.decision_heat ?? lead?.decision?.heat ?? null,
        llamarHoy: computeLlamarHoy(lead),

        lastLogin: u.lastLogin || null,
        lastActivity,

        hasSnapshot: u?._computed?.hasSnapshot === true,
        hasLead: !!lead,

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
    const users = await User.aggregate([
      ...buildCommonPipeline(req.query),
      {
        $addFields: {
          "_computed.lastActivitySort": {
            $max: [
              "$lastLogin",
              "$updatedAt",
              "$ultimoSnapshotHL.createdAt",
              "$leadTop.updatedAt",
              "$leadTop.resultadoUpdatedAt",
              "$leadTop.createdAt",
            ],
          },
        },
      },
      { $sort: { "_computed.lastActivitySort": -1 } },
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

      const email = safeString(u.email || lead?.email, "");
      const telefono = safeString(u.telefono || lead?.telefono, "");

      const ciudad = computeCiudad({ user: u, lead, snapshotIn });
      const horizonte = computeHorizonte({ lead, snapshotIn });
      const etapa = computeEtapa({ snapshotOut, lead });

      const lastActivity = maxIso(
        u.lastLogin,
        u.updatedAt,
        u?.ultimoSnapshotHL?.createdAt,
        lead?.updatedAt,
        lead?.resultadoUpdatedAt,
        lead?.createdAt
      );

      const scoreHL = pickFirst(
        snapshotOut?.scoreHL,
        u?._computed?.scoreAny,
        lead?.scoreHL
      );

      const producto = pickFirst(
        snapshotOut?.productoSugerido,
        u?._computed?.productoAny,
        lead?.producto
      );

      const banco = pickFirst(
        snapshotOut?.bancoSugerido,
        u?._computed?.bancoAny,
        lead?.precalificacion_banco
      );

      const cuotaEstimada = pickFirst(
        snapshotOut?.cuotaEstimada,
        u?._computed?.cuotaAny,
        lead?.precalificacion_cuotaEstimada
      );

      const ingreso = pickFirst(
        snapshotIn?.ingresoNetoMensual,
        u?._computed?.ingresoAny,
        lead?.ingreso_mensual
      );

      const deudas = pickFirst(
        snapshotIn?.otrasDeudasMensuales,
        u?._computed?.deudasAny,
        lead?.deuda_mensual_aprox
      );

      const valorVivienda = pickFirst(
        snapshotIn?.valorVivienda,
        u?._computed?.valorViviendaAny,
        lead?.valor_vivienda
      );

      const entrada = pickFirst(
        snapshotIn?.entradaDisponible,
        u?._computed?.entradaAny,
        lead?.entrada_disponible
      );

      const sinOferta =
        snapshotOut?.sinOferta ??
        u?._computed?.sinOfertaAny ??
        pickSinOferta(lead?.resultado);

      const accionable = computeAccionable({
        email,
        telefono,
        ingreso,
        scoreHL,
        cuota: cuotaEstimada,
        producto,
        banco,
        sinOferta,
      });

      return [
        u._id,
        email,
        isEmailValid(email) ? "sí" : "no",
        u.nombre || lead?.nombre || "",
        u.apellido || "",
        telefono,
        isPhoneValid(telefono) ? "sí" : "no",
        cleanPhoneForWhatsapp(telefono),
        isEmailValid(email) || isPhoneValid(telefono) ? "sí" : "no",
        accionable ? "sí" : "no",

        ciudad,
        horizonte,
        etapa,

        ingreso ?? "",
        deudas ?? "",
        valorVivienda ?? "",
        entrada ?? "",
        scoreHL ?? "",
        producto || "",
        banco || "",
        cuotaEstimada ?? "",
        snapshotOut?.dtiConHipoteca ?? u?._computed?.dtiAny ?? "",
        sinOferta ?? "",

        computeDecisionEstado(lead),
        lead?.decision_etapa || lead?.decision?.etapa || "",
        lead?.decision_heat ?? lead?.decision?.heat ?? "",
        computeLlamarHoy(lead) ? "sí" : "no",

        u.createdAt ? new Date(u.createdAt).toISOString() : "",
        u.lastLogin ? new Date(u.lastLogin).toISOString() : "",
        lastActivity || "",

        lead?._id || u.currentLeadId || "",
        u?.ultimoSnapshotHL?.createdAt
          ? new Date(u.ultimoSnapshotHL.createdAt).toISOString()
          : "",
      ];
    });

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