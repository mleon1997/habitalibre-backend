// src/routes/precalificar.routes.js
import { Router } from "express";
import calcularPrecalificacion, {
  evaluarProbabilidadPorBanco,
} from "../lib/scoring.js";
import { normalizeResultadoParaSalida } from "../utils/hlResultado.js";

const router = Router();

/* --------- helpers --------- */
const toBool = (v) => {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "sí" || s === "si" || s === "s";
};

const toNum = (v, def = 0) => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : def;
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
    afiliadoIess: afiliadoRaw,
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

    // 3️⃣ NORMALIZACIÓN ÚNICA (clave)
    const resultado = normalizeResultadoParaSalida(resultadoRaw);

    // Bancos
    const bancosProbabilidad = resultado.bancosProbabilidad || [];
    const bancosTop3 = resultado.bancosTop3 || [];
    const mejorBanco = resultado.mejorBanco || null;

    // 4️⃣ Sugeridos flat (SIN lógica peligrosa)
    const productoSugerido = resultado.productoSugerido || null;
    const bancoSugerido =
      resultado.bancoSugerido ||
      (productoSugerido ? mejorBanco?.banco || null : null);

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
