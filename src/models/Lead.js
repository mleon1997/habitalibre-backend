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

    // 👇 Aquí guardas TODO el resultado del simulador
    resultado: { type: Object },

    aceptaTerminos: Boolean,
    aceptaCompartir: Boolean,
    origen: String,
    metadata: Object,
  },
  { timestamps: true }
);

export default mongoose.model("Lead", LeadSchema);
