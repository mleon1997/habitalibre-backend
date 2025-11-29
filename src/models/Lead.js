// src/models/Lead.js
import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema(
  {
    nombre: String,
    email: { type: String, index: true },
    telefono: { type: String, index: true },
    ciudad: { type: String, index: true },

    // 👇 Campos que usa el dashboard
    producto: { type: String },
    scoreHL: { type: Number },

    // 👇 Horizonte de compra (0-6, 6-12, 12-24, 24+)
    tiempoCompra: { type: String, index: true },

    // 👇 NUEVO: sustento de ingresos para análisis
    sustentoIndependiente: {
      type: String,
      enum: ["declaracion", "movimientos", "ninguno", null],
      default: null,
      index: true,
    },

    // 👇 Aquí guardas TODO el resultado del simulador
    resultado: { type: Object },

    aceptaTerminos: Boolean,
    aceptaCompartir: Boolean,
    origen: String,
    metadata: Object,

    // 👇 NUEVO: Código HabitaLibre para tracking con bancos
    codigoHL: {
      type: String,
      unique: true,
      sparse: true,   // permite que algunos leads no tengan código sin romper el índice
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Lead", LeadSchema);
