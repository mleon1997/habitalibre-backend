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

    // ✅ Top-level score para tabla/dashboard
    scoreHL: { type: Number, default: null, index: true },

    // ✅ (Recomendado) guarda el objeto completo del score por fuera de resultado
    scoreHLDetalle: { type: mongoose.Schema.Types.Mixed, default: null },

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

    // ==========================
    // ✅ CAMPOS “RÁPIDOS” (planos)
    // ==========================
    edad: { type: Number, default: null, index: true },
    tipo_ingreso: {
      type: String,
      enum: ["Dependiente", "Independiente", "Mixto", null],
      default: null,
      index: true,
    },
    valor_vivienda: { type: Number, default: null, index: true },
    entrada_disponible: { type: Number, default: null, index: true },

    afiliado_iess: { type: Boolean, default: null, index: true },
    anios_estabilidad: { type: Number, default: null, index: true },
    ingreso_mensual: { type: Number, default: null, index: true },
    deuda_mensual_aprox: { type: Number, default: null, index: true },

    ciudad_compra: { type: String, default: null, index: true },

    tipo_compra: { type: String, default: null, index: true },
    tipo_compra_numero: { type: Number, default: null, index: true },

    // ✅ Mixed para que Mongoose no te elimine/transforme campos anidados
    resultado: { type: mongoose.Schema.Types.Mixed, default: null },
    resultadoUpdatedAt: { type: Date, index: true },

    aceptaTerminos: Boolean,
    aceptaCompartir: Boolean,
    origen: String,
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },

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
    // ✅ DECISION (Opción A)
    // Guardamos TODO el objeto (ruta, bancosTop3, nextActions, etc.)
    // ==========================
    decision: { type: mongoose.Schema.Types.Mixed, default: null },

    // ✅ Campos planos indexables para filtros/sort en dashboard
    decision_estado: { type: String, default: null, index: true }, // bancable/rescatable/descartable/por_calificar
    decision_etapa: { type: String, default: null, index: true }, // captura_incompleta/precalificado/...
    decision_heat: { type: Number, default: 0, index: true },
    decision_llamarHoy: { type: Boolean, default: false, index: true },

    decisionUpdatedAt: { type: Date, default: null, index: true },

    // ==========================
    // ✅ Snapshot plano para PDF (precalificación)
    // ==========================
    precalificacion: { type: mongoose.Schema.Types.Mixed, default: null },

    // ✅ Campos planos (opcionales) para filtros/sort sin abrir el objeto
    precalificacion_banco: { type: String, default: null, index: true },
    precalificacion_tasaAnual: { type: Number, default: null, index: true },
    precalificacion_plazoMeses: { type: Number, default: null, index: true },
    precalificacion_cuotaEstimada: { type: Number, default: null, index: true },

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

// ✅ Hook: recalcular decision si NO viene seteada desde controller
LeadSchema.pre("save", function (next) {
  try {
    // si ya viene seteada desde controller, no la pises
    if (this.isModified("decision")) return next();

    const d = leadDecision(this.toObject());
    this.decision = d;
    this.decisionUpdatedAt = new Date();

    // ✅ set campos planos
    this.decision_estado = d?.estado || null;
    this.decision_etapa = d?.etapa || null;
    this.decision_heat = Number.isFinite(Number(d?.heat)) ? Number(d.heat) : 0;
    this.decision_llamarHoy = d?.llamarHoy === true;

    return next();
  } catch {
    return next();
  }
});

export default mongoose.model("Lead", LeadSchema);
