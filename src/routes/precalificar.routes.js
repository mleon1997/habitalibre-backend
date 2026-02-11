// src/routes/precalificar.routes.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { precalificarHL } from "../services/precalificar.service.js";

const router = Router();

/**
 * Auth opcional (NO bloquea precalificar).
 * Si viene token del Customer Journey, pone req.customer = payload.
 *
 * Soporta:
 *  - Authorization: Bearer <customer_token>
 *  - Cookie: customer_token=<token> (por si lo usas)
 */
function optionalCustomerAuth(req, _res, next) {
  try {
    const auth = String(req.headers.authorization || "");
    let token = "";

    if (auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();

    if (!token && req.headers.cookie) {
      const m = String(req.headers.cookie).match(
        /(?:^|;\s*)customer_token=([^;]+)/
      );
      if (m?.[1]) token = decodeURIComponent(m[1]);
    }

    if (!token) return next();

    // OJO: usa el MISMO secret que usas en signCustomerToken()
    // Ajusta tu env para que exista (recomendado): CUSTOMER_JWT_SECRET
    const secret =
      process.env.CUSTOMER_JWT_SECRET ||
      process.env.JWT_CUSTOMER_SECRET ||
      process.env.CUSTOMER_AUTH_JWT_SECRET ||
      process.env.JWT_SECRET ||
      "";

    if (!secret) return next();

    const payload = jwt.verify(token, secret);
    req.customer = payload;
    return next();
  } catch {
    // token inválido => seguimos como anónimo
    return next();
  }
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
router.post("/", optionalCustomerAuth, async (req, res) => {
  try {
    const body = req.body || {};

    // ✅ Toda la lógica vive en el service
    const { input, respuesta } = precalificarHL(body);

    // ✅ Logs
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
      customerUserId: req.customer?.userId || null,
    });

    /**
     * ✅ Guardar snapshot financiero en el User (solo si está logueado en CJ)
     * Esto es lo que alimenta tu dashboard /admin/users con info “tipo quick win”.
     */
    const userId = req.customer?.userId || null;
    if (userId) {
      // Armamos un output compacto pero suficiente para dashboard + export CSV
      const out = {
        scoreHL: respuesta?.scoreHL ?? respuesta?.output?.scoreHL ?? null,
        sinOferta:
          respuesta?.flags?.sinOferta ??
          respuesta?.sinOferta ??
          respuesta?.output?.sinOferta ??
          null,
        bancoSugerido: respuesta?.bancoSugerido ?? respuesta?.output?.bancoSugerido ?? null,
        productoSugerido:
          respuesta?.productoSugerido ?? respuesta?.output?.productoSugerido ?? null,
        capacidadPago: respuesta?.capacidadPago ?? respuesta?.output?.capacidadPago ?? null,
        cuotaEstimada: respuesta?.cuotaEstimada ?? respuesta?.output?.cuotaEstimada ?? null,
        dtiConHipoteca: respuesta?.dtiConHipoteca ?? respuesta?.output?.dtiConHipoteca ?? null,
      };

      await User.updateOne(
        { _id: userId },
        {
          $set: {
            ultimoSnapshotHL: {
              input,
              output: out,
              createdAt: new Date(),
            },
          },
        }
      ).catch((e) => {
        // No rompemos la respuesta al usuario por fallo de snapshot
        console.error("⚠️ No se pudo guardar ultimoSnapshotHL:", e?.message || e);
      });
    }

    return res.json(respuesta);
  } catch (err) {
    console.error("❌ Error en /precalificar:", err?.stack || err);
    return res
      .status(500)
      .json({ ok: false, error: "Error interno al precalificar" });
  }
});

export default router;

