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

    currentStep: { type: String, default: "start", index: true },

    // ✅ 1:1 con tu POST /api/precalificar (normalizado)
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
      tipoIngreso: { type: String, default: "Dependiente" },
      aniosEstabilidad: { type: Number, default: null },
      plazoAnios: { type: Number, default: null },
      // ✅ útil si luego agregas “solo/en pareja”
      comprarEnPareja: { type: Boolean, default: null },
      // ✅ ciudad objetivo (tu flow ya la pregunta)
      ciudadCompra: { type: String, default: null },
    },

    // -------------------------
    // ✅ Trazabilidad / Debug
    // -------------------------
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
    attempts: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Guardar últimos inputs del usuario (máx 30)
    history: {
      type: [
        {
          ts: { type: Date, default: Date.now },
          kind: { type: String, enum: ["text", "postback", "quick_reply"], default: "text" },
          text: { type: String, default: "" },
          payload: { type: String, default: "" },
        },
      ],
      default: [],
    },

    // Último resultado del motor (para reintentos sin recalcular)
    lastDecision: { type: mongoose.Schema.Types.Mixed, default: null },
    lastDecisionAt: { type: Date, default: null },

    // -------------------------
    // ✅ Anti-doble-proceso
    // -------------------------
    // El mid de IG del último evento procesado (si lo guardas, puedes deduplicar)
    lastProcessedMid: { type: String, default: null, index: true },

    // Lock simple (por si llegan 2 mensajes seguidos y el bot corre 2 veces)
    processing: { type: Boolean, default: false, index: true },
    processingAt: { type: Date, default: null },

    // -------------------------
    // ✅ Fechas
    // -------------------------
    lastUserMessageAt: { type: Date, default: null, index: true },
    lastBotMessageAt: { type: Date, default: null, index: true },

    // ✅ TTL: si está abandonada o completada, se borra sola luego de X días
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

ConversationSessionSchema.index(
  { channel: 1, channelUserId: 1 },
  { unique: true }
);

// ✅ TTL Index (Mongo borra docs cuando expiresAt < now)
// OJO: solo se borra si expiresAt tiene valor (no null)
ConversationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ✅ Helper: setear expiración según status (ej: 14 días)
ConversationSessionSchema.pre("save", function (next) {
  try {
    if (this.status === "completed" || this.status === "abandoned") {
      // 14 días desde ahora
      const d = new Date();
      d.setDate(d.getDate() + 14);
      this.expiresAt = d;
    } else {
      // activa => no expira
      this.expiresAt = null;
    }

    // mantener history máximo 30
    if (Array.isArray(this.history) && this.history.length > 30) {
      this.history = this.history.slice(this.history.length - 30);
    }

    next();
  } catch (e) {
    next(e);
  }
});

export default mongoose.model("ConversationSession", ConversationSessionSchema);
