import mongoose from "mongoose";

const { Schema } = mongoose;

const selectedPropertySchema = new Schema(
  {
    id: { type: String, default: null },
    title: { type: String, default: null },
    city: { type: String, default: null },
    price: { type: Number, default: null },
    projectName: { type: String, default: null },
    developerName: { type: String, default: null },
    status: { type: String, default: null },
    raw: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const activationEventSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdByEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

const casoActivacionSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    customerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    customerName: {
      type: String,
      required: true,
      trim: true,
    },

    customerPhone: {
      type: String,
      default: null,
      trim: true,
    },

    requestedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    requestedByUser: {
      type: Boolean,
      default: true,
    },

    statusGeneral: {
      type: String,
      enum: [
        "pendiente_revision_habitalibre",
        "listo_para_envio",
        "enviado_a_promotor",
        "enviado_a_banco",
        "enviado_a_ambos",
        "requiere_info_usuario",
        "cerrado",
      ],
      default: "pendiente_revision_habitalibre",
      index: true,
    },

    projectStatus: {
      type: String,
      enum: ["por_revisar", "enviado", "revisando", "respondio", "cerrado"],
      default: "por_revisar",
      index: true,
    },

    bankStatus: {
      type: String,
      enum: ["por_revisar", "enviado", "evaluando", "respondio", "cerrado"],
      default: "por_revisar",
      index: true,
    },

    selectedProperty: {
      type: selectedPropertySchema,
      default: null,
    },

    docsChecklist: {
      type: Schema.Types.Mixed,
      default: null,
    },

    snapshot: {
      type: Schema.Types.Mixed,
      default: null,
    },

    journey: {
      type: Schema.Types.Mixed,
      default: null,
    },

    score: {
      type: Number,
      default: null,
    },

    probability: {
      type: Number,
      default: null,
    },

    probabilityLabel: {
      type: String,
      default: null,
      trim: true,
    },

    estimatedQuota: {
      type: Number,
      default: null,
    },

    estimatedMaxPurchase: {
      type: Number,
      default: null,
    },

    readinessStatus: {
      type: String,
      enum: [
        "no_listo",
        "revisar_ruta",
        "comparar_propiedades",
        "listo_para_promotor",
        "listo_para_promotor_y_banco",
      ],
      default: null,
      index: true,
    },

    internalNotes: {
      type: String,
      default: "",
      trim: true,
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    projectSubmittedAt: {
      type: Date,
      default: null,
    },

    bankSubmittedAt: {
      type: Date,
      default: null,
    },

    projectResponseAt: {
      type: Date,
      default: null,
    },

    bankResponseAt: {
      type: Date,
      default: null,
    },

    events: {
      type: [activationEventSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

casoActivacionSchema.index({ customerEmail: 1, createdAt: -1 });
casoActivacionSchema.index({ statusGeneral: 1, requestedAt: -1 });
casoActivacionSchema.index({ projectStatus: 1, bankStatus: 1, requestedAt: -1 });

export default mongoose.model("CasoActivacion", casoActivacionSchema);