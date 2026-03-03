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

/* --------- DEBUG / HEALTH --------- */
router.get("/ping", (req, res) => {
  // útil para ver CORS/origin en Android WebView
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    message: "precalificar OK",
    origin: req.headers.origin || null,
    now: new Date().toISOString(),
    hasCustomer: !!req.customer,
  });
});

/* --------- GET /api/precalificar/last --------- */
router.get("/last", optionalCustomerAuth, async (req, res) => {
  try {
    const userId = req.customer?.id || null;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: "No autenticado (customer token requerido).",
      });
    }

    const u = await User.findById(userId)
      .select("ultimoSnapshotHL")
      .lean();

    const snap = u?.ultimoSnapshotHL || null;

    if (!snap) {
      return res.json({
        ok: true,
        hasSnapshot: false,
        snapshot: null,
      });
    }

    return res.json({
      ok: true,
      hasSnapshot: true,
      snapshot: snap,
    });
  } catch (err) {
    console.error("❌ Error en GET /precalificar/last:", err?.stack || err);
    return res
      .status(500)
      .json({ ok: false, error: "Error interno al cargar snapshot" });
  }
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
     * Mejor: guarda el output completo (no solo campos recortados),
     * así Home puede mostrar más cosas de valor luego.
     */
    const userId = req.customer?.id || null;

    if (userId) {
      const output = {
        // guarda lo que ya tenías + deja el output completo si quieres
        scoreHL: respuesta?.scoreHL ?? null,
        flags: respuesta?.flags ?? null,
        bancoSugerido: respuesta?.bancoSugerido ?? null,
        productoSugerido: respuesta?.productoSugerido ?? null,
        capacidadPago: respuesta?.capacidadPago ?? null,
        cuotaEstimada: respuesta?.cuotaEstimada ?? null,
        dtiConHipoteca: respuesta?.dtiConHipoteca ?? null,

        // 👇 extra: deja el objeto entero por si tu service ya trae más
        // (si no quieres esto, bórralo)
        raw: respuesta,
      };

      await User.updateOne(
        { _id: userId },
        {
          $set: {
            ultimoSnapshotHL: {
              input,
              output,
              createdAt: new Date(),
            },
          },
        }
      ).catch((e) => {
        console.error("⚠️ No se pudo guardar ultimoSnapshotHL:", e?.message || e);
      });
    }

    /**
     * ✅ Respuesta consistente hacia el frontend
     * (Tu frontend ya soporta data.output, pero esto ayuda mucho)
     */
    return res.json({
      ok: true,
      input,
      output: respuesta,
    });
  } catch (err) {
    console.error("❌ Error en /precalificar:", err?.stack || err);
    return res
      .status(500)
      .json({ ok: false, error: "Error interno al precalificar" });
  }
});

export default router;