// src/routes/precalificar.routes.js
import { Router } from "express";
import calcularPrecalificacion from "../lib/scoring.js";

const router = Router();

/* --------- helper básico --------- */
const toBool = (v) =>
  v === true ||
  v === "true" ||
  v === "1" ||
  v === 1 ||
  v === "Sí" ||
  v === "si";

/**
 * Puntaje simple legacy para compatibilidad con el front actual.
 * (El motor nuevo también genera un score más avanzado; lo devolvemos aparte.)
 */
function scoreHLlegacy({ ltv, dtiConHipoteca, afiliadoIESS, edad }) {
  let s = 100;

  if (ltv != null) {
    if (ltv > 0.9) s -= 15;
    else if (ltv > 0.8) s -= 8;
  }

  if (dtiConHipoteca != null) {
    if (dtiConHipoteca > 0.45) s -= 20;
    else if (dtiConHipoteca > 0.4) s -= 12;
    else if (dtiConHipoteca > 0.35) s -= 6;
  }

  if (!afiliadoIESS) s -= 4;
  if (edad < 23 || edad > 70) s -= 6;

  s = Math.max(0, Math.min(100, s));
  const label = s >= 80 ? "Sólido" : s >= 60 ? "Medio" : "Ajustar";

  return { score: Math.round(s), label };
}

/* --------- DEBUG: GET /api/precalificar/ping --------- */
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

    console.log("➡️  POST /api/precalificar payload básico:", {
      ingresoNetoMensual: body?.ingresoNetoMensual,
      ingresoPareja: body?.ingresoPareja,
      otrasDeudasMensuales: body?.otrasDeudasMensuales,
      valorVivienda: body?.valorVivienda,
      entradaDisponible: body?.entradaDisponible,
      edad: body?.edad,
      afiliadoIESS: body?.afiliadoIESS ?? body?.afiliadoIess,
    });

    // Normalizamos afiliadoIess (el motor nuevo usa afiliadoIess)
    const afiliadoIessRaw = body.afiliadoIess ?? body.afiliadoIESS;

    // 🚨 Aquí agregamos los campos que faltaban
    const iessAportesTotales = Number(body.iessAportesTotales || 0);
    const iessAportesConsecutivas = Number(body.iessAportesConsecutivas || 0);

    console.log("➡️  APORTES IESS RECIBIDOS:", {
      totales: iessAportesTotales,
      consecutivos: iessAportesConsecutivas,
    });

    // Input final enviado al motor
    const input = {
      ...body,
      afiliadoIess: afiliadoIessRaw,
      iessAportesTotales,
      iessAportesConsecutivas,
    };

    // 🚀 Motor principal HabitaLibre (scoring avanzado)
    const resultado = calcularPrecalificacion(input);

    // Mapeo de escenarios a forma legacy (VIS, VIP, BIESS, PRIVADA)
    const escHL = resultado.escenarios || {};
    const escenariosLegacy = {
      VIS: escHL.vis || null,
      VIP: escHL.vip || null,
      BIESS: escHL.biess || null,
      PRIVADA: escHL.comercial || null,
    };

    // Puntaje simple legacy para no romper el front actual
    const afiliadoFlag = toBool(afiliadoIessRaw);
    const edadNum =
      (resultado.perfil && resultado.perfil.edad) ||
      Number(body.edad || 0) ||
      30;

    const puntajeHabitaLibreLegacy = scoreHLlegacy({
      ltv: resultado.ltv,
      dtiConHipoteca: resultado.dtiConHipoteca,
      afiliadoIESS: afiliadoFlag,
      edad: edadNum,
    });

    // Construimos la respuesta manteniendo compatibilidad
    const respuesta = {
      ok: resultado.ok,

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

      escenarios: escenariosLegacy,
      puntajeHabitaLibre: puntajeHabitaLibreLegacy,

      riesgoHabitaLibre: resultado.riesgoHabitaLibre,
      scoreHL: resultado.scoreHL,
      stressTest: resultado.stressTest,
      costos: resultado.costos,
      opciones: resultado.opciones,
      checklist: resultado.checklist,
      accionesClave: resultado.accionesClave,
      benchmark: resultado.benchmark,
      perfil: resultado.perfil,
      requeridos: resultado.requeridos,
      escenariosHL: resultado.escenarios,
      bounds: resultado.bounds || null,

      _echo: {
        ingresoNetoMensual: Number(body.ingresoNetoMensual || 0),
        ingresoPareja: Number(body.ingresoPareja || 0),
        otrasDeudasMensuales: Number(body.otrasDeudasMensuales || 0),
        valorVivienda: Number(body.valorVivienda || 0),
        entradaDisponible: Number(body.entradaDisponible || 0),
        edad: Number(body.edad || 0),
        afiliadoIESS: afiliadoFlag,
        nacionalidad: body.nacionalidad || "ecuatoriana",
        estadoCivil: body.estadoCivil || "soltero",
        iessAportesTotales,
        iessAportesConsecutivas,
      },
    };

    console.log("✅ /api/precalificar OK ->", {
      productoElegido: respuesta.productoElegido,
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
