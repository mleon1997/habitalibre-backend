// src/models/UserSnapshot.js
import mongoose from "mongoose";

const UserSnapshotSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true
  },
  fecha: {
    type: Date,
    default: Date.now,
    index: true
  },
  input: {
    ingresos: Number,
    deudas: Number,
    entrada: Number,
    edad: Number,
    estabilidadLaboral: Number,
    afiliadoIESS: Boolean
  },
  output: {
    scoreHL: Number,
    dti: Number,
    capacidadPago: Number,
    cuotaEstimada: Number,
    tasa: Number,
    ltv: Number
  },
  preparacionPorRuta: {
    biess: Number,
    privada: Number,
    vis: Number
  },
  rutaRecomendada: String
});

export default mongoose.model("UserSnapshot", UserSnapshotSchema);