// src/models/ConversationSession.js
import mongoose from "mongoose";

const ConversationSessionSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ["instagram"], required: true, index: true },
    channelUserId: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ["active", "completed", "abandoned"],
      default: "active",
      index: true,
    },

    currentStep: { type: String, default: "start" },

    // ✅ 1:1 con tu POST /api/precalificar
    data: {
      ingresoNetoMensual: { type: Number, default: null },
      ingresoPareja: { type: Number, default: 0 },
      otrasDeudasMensuales: { type: Number, default: 0 },
      valorVivienda: { type: Number, default: null },
      entradaDisponible: { type: Number, default: 0 },
      edad: { type: Number, default: null },
      afiliadoIess: { type: Boolean, default: null },
      iessAportesTotales: { type: Number, default: 0 },
      iessAportesConsecutivos: { type: Number, default: 0 },
      tipoIngreso: { type: String, default: "Dependiente" }, // default razonable
      aniosEstabilidad: { type: Number, default: null },
      plazoAnios: { type: Number, default: null },
    },

    // Texto crudo para trazabilidad / debugging
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },

    attempts: { type: mongoose.Schema.Types.Mixed, default: {} },

    lastUserMessageAt: { type: Date, default: null },
    lastBotMessageAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ConversationSessionSchema.index(
  { channel: 1, channelUserId: 1 },
  { unique: true }
);

export default mongoose.model("ConversationSession", ConversationSessionSchema);
