// src/routes/properties.routes.js
import express from "express";
import {
  listarPropiedades,
  obtenerPropiedad,
  crearPropiedad,
  actualizarPropiedad,
  cambiarEstadoPropiedad,
  eliminarPropiedad,
} from "../controllers/properties.controller.js";

const router = express.Router();

function requirePropertyAdminKey(req, res, next) {
  const expectedKey = process.env.PROPERTY_ADMIN_KEY;

  if (!expectedKey) {
    return res.status(500).json({
      ok: false,
      message: "PROPERTY_ADMIN_KEY no está configurado en el servidor.",
    });
  }

  const receivedKey = req.header("x-admin-key");

  if (!receivedKey || receivedKey !== expectedKey) {
    return res.status(401).json({
      ok: false,
      message: "No autorizado para administrar propiedades.",
    });
  }

  return next();
}

/**
 * Públicas para mobile / web
 */
router.get("/", listarPropiedades);
router.get("/:id", obtenerPropiedad);

/**
 * Admin protegido por x-admin-key
 */
router.post("/", requirePropertyAdminKey, crearPropiedad);
router.put("/:id", requirePropertyAdminKey, actualizarPropiedad);
router.patch("/:id/status", requirePropertyAdminKey, cambiarEstadoPropiedad);
router.delete("/:id", requirePropertyAdminKey, eliminarPropiedad);

export default router;