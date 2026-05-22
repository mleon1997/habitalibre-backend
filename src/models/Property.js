// src/models/Property.js
import mongoose from "mongoose";

const FinancingSchema = new mongoose.Schema(
  {
    downPaymentPct: { type: Number, default: 0.1 },
    mortgagePct: { type: Number, default: 0.9 },
    allowInstallments: { type: Boolean, default: true },
    reserveMin: { type: Number, default: 0 },
    monthsConstruction: { type: Number, default: 0 },
  },
  { _id: false }
);

const MortgageProfileSchema = new mongoose.Schema(
  {
    productIds: {
      type: [String],
      default: [],
      index: true,
    },
    requiresFirstHome: { type: Boolean, default: false },
    requiresNewConstruction: { type: Boolean, default: false },
    requiresMiduviQualifiedProject: { type: Boolean, default: false },
  },
  { _id: false }
);

const PropertySchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    developer: {
      type: String,
      default: "GLS Constructores",
      trim: true,
    },

    proyecto: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    titulo: {
      type: String,
      required: true,
      trim: true,
    },

    descripcion: {
      type: String,
      default: "",
      trim: true,
    },

    precio: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },

    m2: {
      type: Number,
      default: 0,
      min: 0,
    },

    dormitorios: {
      type: Number,
      default: 0,
      min: 0,
    },

    banos: {
      type: Number,
      default: 0,
      min: 0,
    },

    parqueaderos: {
      type: Number,
      default: 0,
      min: 0,
    },

    zona: {
      type: String,
      default: "Quito",
      trim: true,
      index: true,
    },

    ciudadZona: {
      type: String,
      default: "",
      trim: true,
    },

    sector: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    proyectoNuevo: {
      type: Boolean,
      default: true,
      index: true,
    },

    tipoEntrega: {
      type: String,
      enum: ["construccion", "inmediata"],
      default: "construccion",
      index: true,
    },

    permiteEntradaEnCuotas: {
      type: Boolean,
      default: true,
    },

    mesesConstruccionRestantes: {
      type: Number,
      default: 0,
      min: 0,
    },

    porcentajeEntradaRequerida: {
      type: Number,
      default: 0.1,
      min: 0,
      max: 1,
    },

    reservaMinima: {
      type: Number,
      default: 0,
      min: 0,
    },

    financing: {
      type: FinancingSchema,
      default: () => ({}),
    },

    mortgageProfile: {
      type: MortgageProfileSchema,
      default: () => ({}),
    },

    matchReason: {
      type: String,
      default: "",
      trim: true,
    },

    matchBadge: {
      type: String,
      default: "",
      trim: true,
    },

    imagen: {
      type: String,
      default: "",
      trim: true,
    },

    galeria: {
      type: [String],
      default: [],
    },

    estadoComercial: {
      type: String,
      enum: ["disponible", "reservado", "vendido", "oculto"],
      default: "disponible",
      index: true,
    },

    publicado: {
      type: Boolean,
      default: true,
      index: true,
    },

    orden: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

PropertySchema.index({
  titulo: "text",
  proyecto: "text",
  sector: "text",
  ciudadZona: "text",
});

const Property =
  mongoose.models.Property || mongoose.model("Property", PropertySchema);

export default Property;