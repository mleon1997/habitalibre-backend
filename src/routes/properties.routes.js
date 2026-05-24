// src/routes/properties.routes.js
import express from "express";
import multer from "multer";

import {
  listarPropiedades,
  obtenerPropiedad,
  crearPropiedad,
  actualizarPropiedad,
  cambiarEstadoPropiedad,
  eliminarPropiedad,
} from "../controllers/properties.controller.js";

import {
  descargarPlantillaPropiedades,
  previewCargaMasivaPropiedades,
  confirmarCargaMasivaPropiedades,
} from "../controllers/propertiesBulk.controller.js";

import adminAuth from "../middlewares/adminAuth.js";

const router = express.Router();

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ];

    const allowedExt = /\.(xlsx|xls)$/i.test(file.originalname || "");

    if (allowedMimes.includes(file.mimetype) || allowedExt) {
      return cb(null, true);
    }

    return cb(new Error("Solo se permiten archivos Excel .xlsx o .xls"));
  },
});

/**
 * Admin: inventario completo.
 * Importante: esta ruta va ANTES de "/:id".
 */
router.get("/admin/all", adminAuth, (req, res, next) => {
  req.adminPropertiesAll = true;
  return listarPropiedades(req, res, next);
});

/**
 * Admin: carga masiva Excel.
 * Importante: estas rutas van ANTES de "/:id".
 */
router.get(
  "/admin/bulk/template",
  adminAuth,
  descargarPlantillaPropiedades
);

router.post(
  "/admin/bulk/preview",
  adminAuth,
  uploadExcel.single("archivo"),
  previewCargaMasivaPropiedades
);

router.post(
  "/admin/bulk/confirm",
  adminAuth,
  confirmarCargaMasivaPropiedades
);

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