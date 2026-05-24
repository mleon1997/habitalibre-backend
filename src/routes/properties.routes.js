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
import adminAuth from "../middlewares/adminAuth.js";

const router = express.Router();

/**
 * Público para mobile / web.
 * Solo debe devolver propiedades publicadas/disponibles.
 */
router.get("/", (req, res, next) => {
  if (req.query?.publicado === "all") {
    return res.status(403).json({
      ok: false,
      message: "No autorizado para ver inventario completo.",
    });
  }

  return listarPropiedades(req, res, next);
});

/**
 * Admin: inventario completo.
 */
router.get("/admin/all", adminAuth, (req, res, next) => {
  req.query.publicado = "all";
  return listarPropiedades(req, res, next);
});

/**
 * Público: detalle de propiedad.
 */
router.get("/:id", obtenerPropiedad);

/**
 * Admin protegido por login admin JWT.
 */
router.post("/", adminAuth, crearPropiedad);
router.put("/:id", adminAuth, actualizarPropiedad);
router.patch("/:id/status", adminAuth, cambiarEstadoPropiedad);
router.delete("/:id", adminAuth, eliminarPropiedad);

export default router;