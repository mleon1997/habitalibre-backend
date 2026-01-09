// src/models/CustomerLead.js
import mongoose from "mongoose";

const CustomerLeadSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    // último payload del wizard (lo que mandas a precalificar)
    entrada: { type: Object, default: {} },

    // último resultado de precalificar
    resultado: { type: Object, default: {} },

    // estado/etapa del journey
    status: {
      type: String,
      default: "iniciado",
      enum: ["iniciado", "precalificado", "en_proceso", "cerrado"],
    },

    // tracking opcional
    source: { type: String, default: "journey" },
  },
  { timestamps: true }
);

// evita OverwriteModelError en hot reload
const CustomerLead =
  mongoose.models.CustomerLead ||
  mongoose.model("CustomerLead", CustomerLeadSchema);

export default CustomerLead;
