// src/scripts/backfillLeadCamposRapidos.js
import "dotenv/config";
import mongoose from "mongoose";

import Lead from "../models/Lead.js";
import { normalizeResultadoParaSalida } from "../utils/hlResultado.js";
import { leadDecision } from "../lib/leadDecision.js";

// ---------------------------
// helpers
// ---------------------------
function toNumberOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toBoolOrNull(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "si" || s === "sí") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

function isEmpty(v) {
  return v == null || v === "" || (typeof v === "number" && Number.isNaN(v));
}

// 👇 OJO: para scoreHL consideramos 0 como “vacío” porque te está rompiendo el PDF
function isEmptyScore(v) {
  return v == null || v === 0 || (typeof v === "number" && Number.isNaN(v));
}

function extraerScoreHL(resultadoNorm) {
  if (!resultadoNorm) return null;

  // puntajeHabitaLibre: number
  const s0 = resultadoNorm?.puntajeHabitaLibre;
  if (typeof s0 === "number") return s0;

  // puntajeHabitaLibre: { score }
  const s1 = resultadoNorm?.puntajeHabitaLibre?.score;
  if (typeof s1 === "number") return s1;

  // legacy: scoreHL: { total }
  const s2 = resultadoNorm?.scoreHL?.total;
  if (typeof s2 === "number") return s2;

  // legacy: scoreHL number
  if (typeof resultadoNorm?.scoreHL === "number") return resultadoNorm.scoreHL;

  return null;
}

function extraerProducto(resultadoNorm) {
  if (!resultadoNorm) return null;
  return (
    resultadoNorm.productoElegido ||
    resultadoNorm.tipoCreditoElegido ||
    resultadoNorm.productoSugerido ||
    resultadoNorm.producto ||
    null
  );
}

// toma perfil desde resultado o metadata (compat)
function extraerPerfilCompat(lead, resultadoNorm) {
  const perfil =
    resultadoNorm?.perfil ||
    lead?.resultado?.perfil ||
    lead?.metadata?.perfil ||
    null;

  // compat nombres viejos
  const tipoIngreso =
    (perfil?.tipoIngreso != null ? String(perfil.tipoIngreso).trim() : null) ||
    (lead?.metadata?.perfil?.tipoIngreso != null
      ? String(lead.metadata.perfil.tipoIngreso).trim()
      : null);

  const edad = perfil?.edad != null ? toNumberOrNull(perfil.edad) : null;

  const valorVivienda =
    resultadoNorm?.valorVivienda != null
      ? toNumberOrNull(resultadoNorm.valorVivienda)
      : (perfil?.valorVivienda != null ? toNumberOrNull(perfil.valorVivienda) : null);

  const entradaDisponible =
    resultadoNorm?.entradaDisponible != null
      ? toNumberOrNull(resultadoNorm.entradaDisponible)
      : (perfil?.entradaDisponible != null ? toNumberOrNull(perfil.entradaDisponible) : null);

  return { edad, tipoIngreso, valorVivienda, entradaDisponible };
}

// mapea a enum del schema (Dependiente/Independiente/Mixto)
function normalizarTipoIngreso(tipoIngresoRaw) {
  if (!tipoIngresoRaw) return null;
  const s = String(tipoIngresoRaw).trim().toLowerCase();
  if (s.includes("depend")) return "Dependiente";
  if (s.includes("independ")) return "Independiente";
  if (s.includes("mixto")) return "Mixto";
  return null;
}

function scoreHLDetalleDesdeResultado(resultadoNorm) {
  if (!resultadoNorm) return null;
  return (
    resultadoNorm?.puntajeHabitaLibre ??
    resultadoNorm?.scoreHL ??
    null
  );
}

// ---------------------------
// main
// ---------------------------
async function run() {
  const MONGO_URI =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    process.env.MONGO_URL;

  if (!MONGO_URI) {
    console.error("❌ Falta MONGODB_URI/MONGO_URI en .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("✅ Conectado a Mongo");

  const total = await Lead.countDocuments({});
  console.log("🔍 Leads a revisar:", total);

  // procesamos en batches
  const BATCH = 200;
  let updated = 0;
  let scanned = 0;

  for (let skip = 0; ; skip += BATCH) {
    const leads = await Lead.find({})
      .sort({ _id: 1 })
      .skip(skip)
      .limit(BATCH);

    if (!leads.length) break;

    for (const lead of leads) {
      scanned++;

      const update = {};
      const set = (k, v) => {
        if (v === undefined) return;
        update[k] = v;
      };

      // 1) Normaliza resultado si existe (sin reescribirlo si ya está ok)
      let resultadoNorm = null;
      if (lead.resultado) {
        try {
          resultadoNorm = normalizeResultadoParaSalida(lead.resultado);
        } catch {
          resultadoNorm = lead.resultado; // fallback
        }
      }

      // 2) scoreHL + producto + scoreHLDetalle
      if (isEmptyScore(lead.scoreHL) && resultadoNorm) {
        const s = extraerScoreHL(resultadoNorm);
        if (typeof s === "number" && s > 0) set("scoreHL", s);
      }

      if (isEmpty(lead.producto) && resultadoNorm) {
        const p = extraerProducto(resultadoNorm);
        if (p) set("producto", p);
      }

      if (isEmpty(lead.scoreHLDetalle) && resultadoNorm) {
        const det = scoreHLDetalleDesdeResultado(resultadoNorm);
        if (det != null) set("scoreHLDetalle", det);
      }

      // 3) Campos rápidos core: edad / tipo_ingreso / valor_vivienda / entrada_disponible
      const { edad, tipoIngreso, valorVivienda, entradaDisponible } =
        extraerPerfilCompat(lead, resultadoNorm);

      if (lead.edad == null && edad != null) set("edad", edad);

      if (lead.tipo_ingreso == null && tipoIngreso) {
        const t = normalizarTipoIngreso(tipoIngreso);
        if (t) set("tipo_ingreso", t);
      }

      if (lead.valor_vivienda == null && valorVivienda != null) set("valor_vivienda", valorVivienda);
      if (lead.entrada_disponible == null && entradaDisponible != null) set("entrada_disponible", entradaDisponible);

      // 4) Backfill “manychat” fields desde resultado/perfil si existen (algunos leads web igual los tienen)
      const perfil = resultadoNorm?.perfil || lead?.metadata?.perfil || lead?.resultado?.perfil || null;

      if (lead.afiliado_iess == null && perfil?.afiliadoIess != null) {
        set("afiliado_iess", toBoolOrNull(perfil.afiliadoIess));
      }
      if (lead.anios_estabilidad == null && perfil?.aniosEstabilidad != null) {
        set("anios_estabilidad", toNumberOrNull(perfil.aniosEstabilidad));
      }
      if (lead.ingreso_mensual == null && perfil?.ingresoTotal != null) {
        set("ingreso_mensual", toNumberOrNull(perfil.ingresoTotal));
      }
      if (lead.deuda_mensual_aprox == null && perfil?.otrasDeudasMensuales != null) {
        set("deuda_mensual_aprox", toNumberOrNull(perfil.otrasDeudasMensuales));
      }
      if (lead.ciudad_compra == null && perfil?.ciudadCompra != null) {
        set("ciudad_compra", String(perfil.ciudadCompra).trim());
      }

      // 5) decision recalculada (si cambió algo)
      const keys = Object.keys(update);
      if (keys.length) {
        // aplicamos update en memoria para calcular decision con data nueva
        const merged = { ...lead.toObject(), ...update };
        try {
          const d = leadDecision(merged);
          update.decision = d;
          update.decisionUpdatedAt = new Date();
        } catch {
          // no bloquees el backfill si decision falla
        }

        await Lead.updateOne({ _id: lead._id }, { $set: update });
        updated++;
      }
    }
  }

  console.log("✅ Leads escaneados:", scanned);
  console.log("✅ Leads actualizados:", updated);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error("❌ Error en backfill:", e);
  process.exit(1);
});
