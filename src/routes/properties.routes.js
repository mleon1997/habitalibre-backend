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
 * Admin: inventario completo.
 * Importante: esta ruta va ANTES de "/:id".
 */
router.get("/admin/all", adminAuth, (req, res, next) => {
  req.adminPropertiesAll = true;
  return listarPropiedades(req, res, next);
});

/**
 * Público para mobile / web.
 * Solo debe devolver propiedades publicadas/disponibles.
 */
router.get("/", listarPropiedades);

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