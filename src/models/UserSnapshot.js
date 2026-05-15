// src/models/UserSnapshot.js
import mongoose from "mongoose";

const UserSnapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Guarda TODO el payload original del Journey.
    // Ej: ingresoNetoMensual, deudas, ciudadCompra, entradaDisponible,
    // tipoIngreso, IESS, historial crediticio, horizonteCompra, etc.
    input: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Guarda TODO el resultado del motor hipotecario.
    // Ej: bestMortgage, rankedMortgages, matchedProperties,
    // precioMaxVivienda, cuotaEstimada, bancosTop3, scenarios, etc.
    output: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    preparacionPorRuta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    rutaRecomendada: {
      type: String,
      default: null,
    },

    fecha: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    strict: false,
    minimize: false,
  }
);

UserSnapshotSchema.index({ userId: 1, fecha: -1 });
UserSnapshotSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.UserSnapshot ||
  mongoose.model("UserSnapshot", UserSnapshotSchema);