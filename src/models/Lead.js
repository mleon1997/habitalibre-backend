// src/models/Lead.js
import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema(
  {
    nombre: String,
    email: { type: String, index: true },
    telefono: { type: String, index: true },
    ciudad: { type: String, index: true },

    // vínculo con customer/user
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

    producto: { type: String },
    scoreHL: { type: Number },

    tiempoCompra: { type: String, index: true },

    sustentoIndependiente: {
      type: String,
      enum: ["declaracion", "movimientos", "ninguno", null],
      default: null,
      index: true,
    },

    // ✅ CANÓNICO: aquí debe quedar el resultado del simulador
    resultado: { type: Object },

    // ✅ timestamps explícitos (para elegir siempre el más reciente)
    resultadoUpdatedAt: { type: Date, index: true },

    aceptaTerminos: Boolean,
    aceptaCompartir: Boolean,
    origen: String,
    metadata: Object,

    codigoHL: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Lead", LeadSchema);
