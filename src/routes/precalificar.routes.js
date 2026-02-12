// src/routes/precalificar.routes.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { precalificarHL } from "../services/precalificar.service.js";

const router = Router();

/**
 * Auth opcional (NO bloquea precalificar).
 * Si viene token Customer Journey:
 *  - valida secret CUSTOMER_JWT_SECRET
 *  - requiere typ === "customer"
 *  - pone req.customer = { id, email, leadId, typ }
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

    const secret = process.env.CUSTOMER_JWT_SECRET || "";
    if (!secret) return next();

    const payload = jwt.verify(token, secret);

    // ✅ SOLO tokens customer
    if (!payload?.id || payload?.typ !== "customer") return next();

    req.customer = {
      id: String(payload.id),
      email: payload.email || "",
      leadId: payload.leadId || null,
      typ: "customer",
    };

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

    // ✅ toda la lógica vive en el service
    const { input, respuesta } = precalificarHL(body);

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
      customerId: req.customer?.id || null,
    });

    /**
     * ✅ Guardar snapshot financiero en User si está logueado (Customer Journey)
     * ESTE snapshot alimenta /admin/users “tipo quick win”.
     */
    const userId = req.customer?.id || null;

    if (userId) {
      const out = {
        scoreHL: respuesta?.scoreHL ?? respuesta?.output?.scoreHL ?? null,
        sinOferta:
          respuesta?.flags?.sinOferta ??
          respuesta?.sinOferta ??
          respuesta?.output?.sinOferta ??
          null,
        bancoSugerido:
          respuesta?.bancoSugerido ?? respuesta?.output?.bancoSugerido ?? null,
        productoSugerido:
          respuesta?.productoSugerido ??
          respuesta?.output?.productoSugerido ??
          null,
        capacidadPago:
          respuesta?.capacidadPago ?? respuesta?.output?.capacidadPago ?? null,
        cuotaEstimada:
          respuesta?.cuotaEstimada ?? respuesta?.output?.cuotaEstimada ?? null,
        dtiConHipoteca:
          respuesta?.dtiConHipoteca ?? respuesta?.output?.dtiConHipoteca ?? null,
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
