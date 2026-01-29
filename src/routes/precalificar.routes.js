// src/routes/precalificar.routes.js
import { Router } from "express";
import {
  evaluarProbabilidadPorBanco,
} from "../lib/scoring.js";
import { normalizeResultadoParaSalida } from "../utils/hlResultado.js";

const router = Router();

/* --------- helpers --------- */
const toBool = (v) => {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return false;
  return s === "true" || s === "1" || s === "sí" || s === "si" || s === "s";
};

const toNum = (v, def = 0) => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : def;
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const pickNumber = (...vals) => {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};
const pickBool = (...vals) => {
  for (const v of vals) {
    if (typeof v === "boolean") return v;
  }
  return undefined;
};

/**
 * ✅ Normalizador PRO de input
 * Acepta input nuevo y legacy
 */
function normalizarInputHL(body = {}) {
  const afiliadoRaw =
    body.afiliadoIess ??
    body.afiliadoIESS ??
    body.afiliado_iess ??
    body.afiliado;

  const iessAportesTotales = toNum(
    body.iessAportesTotales ??
      body.aportesTotales ??
      body.iess_totales ??
      0,
    0
  );

  const iessAportesConsecutivos = toNum(
    body.iessAportesConsecutivos ??
      body.iessAportesConsecutivas ??
      body.aportesConsecutivos ??
      0,
    0
  );

  const ingresoNetoMensual = toNum(
    body.ingresoNetoMensual ?? body.ingreso ?? 0,
    0
  );
  const ingresoPareja = toNum(body.ingresoPareja ?? 0, 0);
  const otrasDeudasMensuales = toNum(
    body.otrasDeudasMensuales ?? body.deudas ?? 0,
    0
  );

  const valorVivienda = toNum(body.valorVivienda ?? body.valor ?? 0, 0);
  const entradaDisponible = toNum(
    body.entradaDisponible ?? body.entrada ?? 0,
    0
  );

  const edad = toNum(body.edad ?? 30, 30);
  const tipoIngreso = body.tipoIngreso ?? "Dependiente";
  const aniosEstabilidad = toNum(body.aniosEstabilidad ?? 0, 0);

  const primeraVivienda = body.primeraVivienda ?? null;
  const viviendaUsada = body.viviendaUsada ?? null;
  const viviendaEstrenar =
    body.viviendaEstrenar ?? body.viviendaNueva ?? true;

  const nacionalidad = body.nacionalidad ?? "ecuatoriana";
  const estadoCivil = body.estadoCivil ?? "soltero";
  const declaracionBuro = body.declaracionBuro ?? "ninguno";
  const sustentoIndependiente = body.sustentoIndependiente ?? null;
  const horizonteCompra =
    body.horizonteCompra ?? body.tiempoCompra ?? null;

  const plazoAnios = body.plazoAnios ?? null;

  return {
    ...body,
    ingresoNetoMensual,
    ingresoPareja,
    otrasDeudasMensuales,
    valorVivienda,
    entradaDisponible,
    edad,
    tipoIngreso,
    aniosEstabilidad,

    // ✅ IMPORTANTE: aquí ya lo dejamos como boolean o null
    afiliadoIess: afiliadoRaw == null ? null : toBool(afiliadoRaw),

    iessAportesTotales,
    iessAportesConsecutivos,
    primeraVivienda,
    viviendaUsada,
    viviendaEstrenar,
    nacionalidad,
    estadoCivil,
    declaracionBuro,
    sustentoIndependiente,
    horizonteCompra,
    plazoAnios,
  };
}

/**
 * ✅ Reglas duras para sinOferta (solo como "red flag")
 * Regla de oro: si el motor ya determinó una ruta viable, NO se puede forzar sinOferta aquí
 * (salvo data corrupta / señales inexistentes).
 */
function calcularSinOfertaHard(resultado = {}) {
  // 0) Si el motor ya marcó viable, NO overrides (alinea motor vs UI/PDF)
  const tipoRuta = resultado?.rutaRecomendada?.tipo || resultado?.productoSugerido || resultado?.productoElegido;
  const viableByRuta = resultado?.rutaRecomendada?.viable === true;

  const viableByEscenario =
    tipoRuta &&
    resultado?.escenariosHL &&
    resultado.escenariosHL[String(tipoRuta).toLowerCase()]?.viable === true;

  const hayViable = viableByRuta || viableByEscenario;

  // 1) Números base
  const capacidad = pickNumber(
    resultado?.capacidadPagoPrograma,
    resultado?.capacidadPago,
    resultado?.capacidadPagoGlobal,
    resultado?.bounds?.capacidadPago,
    resultado?.perfil?.capacidadPago
  );

  const cuota = pickNumber(resultado?.cuotaEstimada);
  const dti = pickNumber(resultado?.dtiConHipoteca);
  const ltv = pickNumber(resultado?.ltv);

  const montoMax = pickNumber(
    resultado?.montoMaximo,
    resultado?.montoPrestamoMax,
    resultado?.prestamoMax
  );
  const precioMax = pickNumber(
    resultado?.precioMaxVivienda,
    resultado?.precioMax,
    resultado?.valorMaxVivienda
  );

  // 2) Si faltan señales fuertes -> solo marcar sin oferta si NO hay viable.
  // (si hay viable, no debería pasar, pero evitamos false negatives)
  const noSignals =
    !isNum(montoMax) || montoMax <= 0 ||
    !isNum(precioMax) || precioMax <= 0;

  if (noSignals) return !hayViable;

  // 3) Reglas duras globales (pueden mantenerse)
  // OJO: si decides que DTI>0.50 es red flag, ok, pero NO debe contradecir un viable del motor.
  if (!hayViable) {
    if (isNum(dti) && dti > 0.50) return true;
    if (isNum(ltv) && ltv > 0.90) return true;
  }

  // 4) Regla cuota > capacidad: SOLO para rutas donde aplique (Privada/Comercial)
  const tipo = String(tipoRuta || "").toLowerCase();
  const aplicaReglaFlujo = tipo.includes("priv") || tipo.includes("comercial");

  if (!hayViable && aplicaReglaFlujo) {
    if (isNum(cuota) && isNum(capacidad) && cuota > capacidad) return true;
  }

  return false;
}


/* --------- DEBUG --------- */
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "precalificar OK",
    origin: req.headers.origin || null,
  });
});

/* --------- POST /api/precalificar --------- */
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    // 1️⃣ Normalizar input
    const input = normalizarInputHL(body);

    console.log("➡️ POST /api/precalificar (normalizado):", {
      ingresoNetoMensual: input.ingresoNetoMensual,
      ingresoPareja: input.ingresoPareja,
      otrasDeudasMensuales: input.otrasDeudasMensuales,
      valorVivienda: input.valorVivienda,
      entradaDisponible: input.entradaDisponible,
      edad: input.edad,
      afiliadoIess: input.afiliadoIess,
      iessAportesTotales: input.iessAportesTotales,
      iessAportesConsecutivos: input.iessAportesConsecutivos,
      tipoIngreso: input.tipoIngreso,
      aniosEstabilidad: input.aniosEstabilidad,
      plazoAnios: input.plazoAnios,
    });

    // 2️⃣ Scoring + bancos
    const resultadoRaw = evaluarProbabilidadPorBanco(input);

    // 3️⃣ NORMALIZACIÓN ÚNICA
    const resultado = normalizeResultadoParaSalida(resultadoRaw);

    // ✅ Asegura flags object
    if (!resultado.flags || typeof resultado.flags !== "object") {
      resultado.flags = {};
    }

    // ✅ Compat: si venía sinOferta top-level, lo absorbemos
    const sinOfertaEngine = pickBool(resultado?.flags?.sinOferta, resultado?.sinOferta);

    // ✅ Fuente de verdad: reglas duras
    const sinOfertaHard = calcularSinOfertaHard(resultado);

    const tipoRuta =
  resultado?.rutaRecomendada?.tipo ||
  resultado?.productoSugerido ||
  resultado?.productoElegido ||
  null;

const rutaViable =
  resultado?.rutaRecomendada?.viable === true ||
  (tipoRuta &&
    resultado?.escenariosHL &&
    resultado.escenariosHL[String(tipoRuta).toLowerCase()]?.viable === true) ||
  (Array.isArray(resultado?.rutasViables) && resultado.rutasViables.some((r) => r?.viable === true));

    // ✅ sinOfertaFinal = (engine true) OR (hard true)
    // Ojo: si engine dice false pero hard dice true, gana hard.
    const sinOfertaFinal =
      (typeof sinOfertaEngine === "boolean" ? sinOfertaEngine : false) || sinOfertaHard;

    // ✅ Set CONSISTENTE
    resultado.flags.sinOferta = sinOfertaFinal;
    resultado.sinOferta = sinOfertaFinal; // compat legacy

    // Bancos
    const bancosProbabilidad = resultado.bancosProbabilidad || [];
    const bancosTop3 = resultado.bancosTop3 || [];
    const mejorBanco = resultado.mejorBanco || null;

    // 4️⃣ Sugeridos flat
    // ✅ Si sinOferta => NO sugerir producto/banco (evita “aprobado” falso)
    const productoSugerido = sinOfertaFinal ? null : (resultado.productoSugerido || null);

    const bancoSugerido = sinOfertaFinal
      ? null
      : (
          resultado.bancoSugerido ||
          (productoSugerido ? mejorBanco?.banco || null : null)
        );

    // 5️⃣ Respuesta final
    const respuesta = {
      ok: resultado.ok,

      // métricas base
      productoElegido: resultado.productoElegido,
      tasaAnual: resultado.tasaAnual,
      plazoMeses: resultado.plazoMeses,
      cuotaEstimada: resultado.cuotaEstimada,
      cuotaStress: resultado.cuotaStress,
      capacidadPago: resultado.capacidadPago,
      ltv: resultado.ltv,
      dtiConHipoteca: resultado.dtiConHipoteca,
      montoMaximo: resultado.montoMaximo,
      precioMaxVivienda: resultado.precioMaxVivienda,

      // flags CONSISTENTES
      flags: resultado.flags,

      // scoring avanzado
      riesgoHabitaLibre: resultado.riesgoHabitaLibre,
      scoreHL: resultado.scoreHL,
      stressTest: resultado.stressTest,
      costos: resultado.costos,
      checklist: resultado.checklist,
      accionesClave: resultado.accionesClave,
      benchmark: resultado.benchmark,
      perfil: resultado.perfil,
      requeridos: resultado.requeridos,

      // escenarios
      escenariosHL: resultado.escenariosHL,
      rutasViables: resultado.rutasViables || [],
      rutaRecomendada: resultado.rutaRecomendada || null,

      // bancos
      bancosProbabilidad,
      bancosTop3,
      mejorBanco,

      // 👇 lo que usa Progreso.jsx / PDF / Mailer
      productoSugerido,
      bancoSugerido,

      // echo limpio
      _echo: resultado._echo || {},

      // ✅ debug (puedes borrar luego)
      _debugSinOferta: {
        sinOfertaEngine,
        sinOfertaHard,
        sinOfertaFinal,
        cuotaEstimada: resultado?.cuotaEstimada ?? null,
        capacidadPago: resultado?.capacidadPago ?? null,
        dtiConHipoteca: resultado?.dtiConHipoteca ?? null,
        ltv: resultado?.ltv ?? null,
      },
    };

    console.log("✅ /api/precalificar OK ->", {
      productoSugerido,
      bancoSugerido,
      sinOferta: respuesta.flags?.sinOferta,
      cuotaEstimada: Math.round(respuesta.cuotaEstimada || 0),
      capacidadPago: Math.round(respuesta.capacidadPago || 0),
      dtiConHipoteca: respuesta.dtiConHipoteca,
    });

    return res.json(respuesta);
  } catch (err) {
    console.error("❌ Error en /precalificar:", err?.stack || err);
    return res
      .status(500)
      .json({ ok: false, error: "Error interno al precalificar" });
  }
});

export default router;
