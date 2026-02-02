// src/routes/precalificar.routes.js
import { Router } from "express";
import { precalificarHL } from "../services/precalificar.service.js";

const router = Router();

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

    // ✅ DRY: toda la lógica vive en el service
    const { input, respuesta } = precalificarHL(body);

    // ✅ Logs (idénticos a lo que tenías, pero ahora vienen del service)
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

    console.log("✅ /api/precalificar OK ->", {
      productoSugerido: respuesta.productoSugerido,
      bancoSugerido: respuesta.bancoSugerido,
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
