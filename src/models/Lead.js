// src/models/Lead.js
import mongoose from "mongoose";
import { leadDecision } from "../lib/leadDecision.js";

const LeadSchema = new mongoose.Schema(
  {
    nombre: String,
    email: { type: String, index: true },
    telefono: { type: String, index: true },
    ciudad: { type: String, index: true },

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

    canal: {
      type: String,
      enum: ["web", "whatsapp", "instagram", null],
      default: "web",
      index: true,
    },
    fuente: {
      type: String,
      enum: ["form", "manychat", "manual", null],
      default: "form",
      index: true,
    },

    manychatSubscriberId: { type: String, index: true },
    igUsername: { type: String, index: true },

    afiliado_iess: { type: Boolean, default: null, index: true },
    anios_estabilidad: { type: Number, default: null, index: true },
    ingreso_mensual: { type: Number, default: null, index: true },
    deuda_mensual_aprox: { type: Number, default: null, index: true },

    ciudad_compra: { type: String, default: null, index: true },

    tipo_compra: { type: String, default: null, index: true },
    tipo_compra_numero: { type: Number, default: null, index: true },

    resultado: { type: Object },
    resultadoUpdatedAt: { type: Date, index: true },

    aceptaTerminos: Boolean,
    aceptaCompartir: Boolean,
    origen: String,
    metadata: Object,

    identidades: {
      emailNorm: { type: String, index: true },
      telefonoNorm: { type: String, index: true },
      igUsernameNorm: { type: String, index: true },
      manychatSubscriberId: { type: String, index: true },
    },

    fuentesInfo: {
      web: {
        seen: { type: Boolean, default: false },
        lastAt: { type: Date, default: null },
        completed: { type: Boolean, default: false },
      },
      manychat: {
        seen: { type: Boolean, default: false },
        lastAt: { type: Date, default: null },
        completed: { type: Boolean, default: false },
      },
      manual: {
        seen: { type: Boolean, default: false },
        lastAt: { type: Date, default: null },
        completed: { type: Boolean, default: false },
      },
    },

    scoreConfianza: {
      type: String,
      enum: ["alta", "media", "baja", null],
      default: null,
      index: true,
    },

    // ==========================
    // ✅ DECISIÓN OPERATIVA (alineada con src/lib/leadDecision.js)
    // ==========================
    decision: {
      callToday: { type: Boolean, default: false, index: true },

      // bancable | rescatable | descartable
      bucket: {
        type: String,
        enum: ["bancable", "rescatable", "descartable"],
        default: "rescatable",
        index: true,
      },

      // captura_incompleta | necesita_info | evaluado
      stage: {
        type: String,
        enum: ["captura_incompleta", "necesita_info", "evaluado"],
        default: "captura_incompleta",
        index: true,
      },

      // 0-100
      heat: { type: Number, default: 0, index: true },

      // Campos faltantes (para UI)
      missing: { type: [String], default: [] },

      // Razones explicables (para UI)
      reasons: { type: [String], default: [] },
    },

    decisionUpdatedAt: { type: Date, default: null, index: true },

    codigoHL: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ✅ (Opcional) helper: recalcular decision antes de guardar si cambian campos
// Si no lo quieres automático, puedes borrar este hook y dejarlo solo en controller.
LeadSchema.pre("save", function (next) {
  try {
    // si ya viene seteada desde controller, no la pises
    if (this.isModified("decision")) return next();

    const d = leadDecision(this.toObject());
    this.decision = d;
    this.decisionUpdatedAt = new Date();
    return next();
  } catch {
    return next();
  }
});

export default mongoose.model("Lead", LeadSchema);
