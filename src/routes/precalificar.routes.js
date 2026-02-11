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

    // ✅ usa el mismo secret que signCustomerToken()
    const secret = process.env.CUSTOMER_JWT_SECRET || "";
    if (!secret) return next();

    const payload = jwt.verify(token, secret);

    // ✅ valida el shape esperado
    if (!payload?.id || payload?.typ !== "customer") return next();

    req.customer = payload; // { id, email, typ, leadId }
    return next();
  } catch {
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
      customerId: req.customer?.id || null, // ✅ FIX
    });

    /**
     * ✅ Guardar snapshot financiero en el User (solo si está logueado en CJ)
     * Alimenta el dashboard /admin/users (tipo quick win).
     */
    const userId = req.customer?.id || null; // ✅ FIX: era userId, debe ser id
    if (userId) {
      // output “quick win style” (campos flat)
      const out = {
        scoreHL: respuesta?.scoreHL ?? null,
        sinOferta: respuesta?.flags?.sinOferta ?? null,
        bancoSugerido: respuesta?.bancoSugerido ?? null,
        productoSugerido: respuesta?.productoSugerido ?? null,
        capacidadPago: respuesta?.capacidadPago ?? null,
        cuotaEstimada: respuesta?.cuotaEstimada ?? null,
        dtiConHipoteca: respuesta?.dtiConHipoteca ?? null,
      };

      await User.updateOne(
        { _id: userId },
        {
          $set: {
            // ✅ opcional: si no tienes ciudad en User, la llenamos con input
            ciudad: input?.ciudad || input?.ciudadCompra || undefined,

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
