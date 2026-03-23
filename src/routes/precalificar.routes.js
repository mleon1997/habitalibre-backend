// src/routes/precalificar.routes.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { precalificarHL } from "../services/precalificar.service.js";

const router = Router();

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

/* =========================
   Helpers para enriquecer bancos
========================= */
function getEscenarioPorTipo(tipoProducto, escenariosHL = {}) {
  const tipo = String(tipoProducto || "").toUpperCase();

  if (tipo === "VIS") return escenariosHL?.vis || null;
  if (tipo === "VIP") return escenariosHL?.vip || null;

  if (tipo === "BIESS") {
    return (
      escenariosHL?.biess ||
      escenariosHL?.biess_pref ||
      escenariosHL?.biess_std ||
      null
    );
  }

  if (
    tipo === "NORMAL" ||
    tipo === "PRIVADA" ||
    tipo === "COMERCIAL"
  ) {
    return escenariosHL?.comercial || null;
  }

  return null;
}

function enrichBanco(banco, escenariosHL = {}) {
  const esc = getEscenarioPorTipo(banco?.tipoProducto, escenariosHL);

  return {
    ...banco,
    tasaAnual: esc?.tasaAnual ?? banco?.tasaAnual ?? null,
    cuota: esc?.cuota ?? banco?.cuota ?? null,
    montoPrestamo: esc?.montoPrestamo ?? banco?.montoPrestamo ?? null,
    plazoMeses: esc?.plazoMeses ?? banco?.plazoMeses ?? null,
    ltvMax: esc?.ltvMax ?? banco?.ltvMax ?? null,
    precioMaxVivienda: esc?.precioMaxVivienda ?? banco?.precioMaxVivienda ?? null,
  };
}

function enrichRespuestaBancos(respuesta = {}) {
  const escenariosHL = respuesta?.escenariosHL || respuesta?.escenarios || {};

  const bancosProbabilidadRaw = Array.isArray(respuesta?.bancosProbabilidad)
    ? respuesta.bancosProbabilidad
    : [];

  const bancosProbabilidad = bancosProbabilidadRaw.map((b) =>
    enrichBanco(b, escenariosHL)
  );

  const bancosTop3Raw =
    Array.isArray(respuesta?.bancosTop3) && respuesta.bancosTop3.length
      ? respuesta.bancosTop3
      : bancosProbabilidad.slice(0, 3);

  const bancosTop3 = bancosTop3Raw.map((b) => enrichBanco(b, escenariosHL));
  const mejorBanco = bancosTop3[0] || respuesta?.mejorBanco || null;

  return {
    ...respuesta,
    bancosProbabilidad,
    bancosTop3,
    mejorBanco,
  };
}

/* --------- DEBUG / HEALTH --------- */
router.get("/ping", (req, res) => {
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

    const { input, respuesta: respuestaBase } = precalificarHL(body);
    const respuesta = enrichRespuestaBancos(respuestaBase);

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

    console.log("✅ bancosTop3 final:", respuesta?.bancosTop3);

    const userId = req.customer?.id || null;

    if (userId) {
      const output = {
        scoreHL: respuesta?.scoreHL ?? null,
        flags: respuesta?.flags ?? null,
        bancoSugerido: respuesta?.bancoSugerido ?? null,
        productoSugerido: respuesta?.productoSugerido ?? null,
        capacidadPago: respuesta?.capacidadPago ?? null,
        cuotaEstimada: respuesta?.cuotaEstimada ?? null,
        dtiConHipoteca: respuesta?.dtiConHipoteca ?? null,
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