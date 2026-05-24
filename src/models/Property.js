// src/models/Property.js
import mongoose from "mongoose";

const FinancingSchema = new mongoose.Schema(
  {
    downPaymentPct: { type: Number, default: 0.1, min: 0, max: 1 },
    mortgagePct: { type: Number, default: 0.9, min: 0, max: 1 },
    allowInstallments: { type: Boolean, default: true },
    reserveMin: { type: Number, default: 0, min: 0 },
    monthsConstruction: { type: Number, default: 0, min: 0 },

    // Nuevos campos comerciales
    promesaAmount: { type: Number, default: 0, min: 0 },
    entryInstallmentsCount: { type: Number, default: 0, min: 0 },
    entryDeadlineDate: { type: Date, default: null },
  },
  { _id: false }
);

const MortgageProfileSchema = new mongoose.Schema(
  {
    // Campo legacy. Lo mantenemos para no romper propertyMatch.service.js
    productIds: {
      type: [String],
      default: [],
      index: true,
    },

    requiresFirstHome: { type: Boolean, default: false },
    requiresNewConstruction: { type: Boolean, default: false },
    requiresMiduviQualifiedProject: { type: Boolean, default: false },

    // Nuevos campos objetivos / operativos
    acceptsMortgageCredit: { type: Boolean, default: true },
    acceptsBIESS: { type: Boolean, default: true },
    acceptsPrivateBank: { type: Boolean, default: true },
    acceptsCooperatives: { type: Boolean, default: false },
    acceptsCash: { type: Boolean, default: true },

    alliedBank: { type: String, default: "", trim: true },

    // No es "califica VIP/VIS", sino estado documental/comercial del proyecto.
    // La categoría estimada debe calcularla HabitaLibre por precio/reglas.
    miduviQualificationStatus: {
      type: String,
      enum: ["si", "no", "pendiente", "no_aplica"],
      default: "no_aplica",
      index: true,
    },
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
      index: true,
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

    // Identificación comercial de unidad
    unidad: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    torre: {
      type: String,
      default: "",
      trim: true,
    },

    bloque: {
      type: String,
      default: "",
      trim: true,
    },

    piso: {
      type: Number,
      default: null,
    },

    manzana: {
      type: String,
      default: "",
      trim: true,
    },

    lote: {
      type: String,
      default: "",
      trim: true,
    },

    // Tipo de inmueble
    tipoInmueble: {
      type: String,
      enum: ["departamento", "suite", "estudio", "casa", "terreno"],
      default: "departamento",
      index: true,
    },

    tipoProyecto: {
      type: String,
      enum: ["edificio", "conjunto", "urbanizacion", "independiente", "otro"],
      default: "edificio",
      index: true,
    },

    uso: {
      type: String,
      enum: ["vivienda_principal", "inversion", "terreno", "comercial", "otro"],
      default: "vivienda_principal",
      index: true,
    },

    precio: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },

    // Legacy: lo mantenemos para compatibilidad con frontend/matcher actual.
    m2: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Nuevos campos más claros
    m2Construccion: {
      type: Number,
      default: 0,
      min: 0,
    },

    m2Terreno: {
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

    bodega: {
      type: Boolean,
      default: false,
    },

    alicuotaEstimada: {
      type: Number,
      default: 0,
      min: 0,
    },

    ciudad: {
      type: String,
      default: "Quito",
      trim: true,
      index: true,
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

    direccionReferencial: {
      type: String,
      default: "",
      trim: true,
    },

    googleMapsUrl: {
      type: String,
      default: "",
      trim: true,
    },

    // Legacy: proyectoNuevo se mantiene porque el matcher actual probablemente lo usa.
    proyectoNuevo: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Nuevo nombre más natural
    viviendaNueva: {
      type: Boolean,
      default: true,
      index: true,
    },

    tipoEntrega: {
      type: String,
      enum: ["construccion", "inmediata", "planos"],
      default: "construccion",
      index: true,
    },

    etapaProyecto: {
      type: String,
      enum: [
        "planos",
        "construccion",
        "entrega_proxima",
        "entrega_inmediata",
        "terminado",
      ],
      default: "construccion",
      index: true,
    },

    fechaEntregaEstimada: {
      type: Date,
      default: null,
      index: true,
    },

    fechaEscrituraEstimada: {
      type: Date,
      default: null,
    },

    permiteEntradaEnCuotas: {
      type: Boolean,
      default: true,
    },

    // Legacy. Lo dejamos, pero idealmente se calcula desde fechaEntregaEstimada.
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

    montoFirmaPromesa: {
      type: Number,
      default: 0,
      min: 0,
    },

    numeroCuotasEntrada: {
      type: Number,
      default: 0,
      min: 0,
    },

    fechaLimiteEntrada: {
      type: Date,
      default: null,
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

    brochureUrl: {
      type: String,
      default: "",
      trim: true,
    },

    videoUrl: {
      type: String,
      default: "",
      trim: true,
    },

    estadoComercial: {
      type: String,
      enum: ["disponible", "reservado", "vendido", "pausado", "oculto"],
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

    fuenteCarga: {
      type: String,
      enum: ["manual", "csv", "excel", "api", "seed"],
      default: "manual",
    },
  },
  {
    timestamps: true,
  }
);

function monthsUntil(dateValue) {
  if (!dateValue) return 0;

  const targetDate = new Date(dateValue);
  if (Number.isNaN(targetDate.getTime())) return 0;

  const now = new Date();

  const yearDiff = targetDate.getFullYear() - now.getFullYear();
  const monthDiff = targetDate.getMonth() - now.getMonth();

  const rawMonths = yearDiff * 12 + monthDiff;

  return Math.max(0, rawMonths);
}

PropertySchema.pre("validate", function normalizeProperty(next) {
  // Mantener compatibilidad entre campos viejos y nuevos.
  if (!this.m2Construccion && this.m2) {
    this.m2Construccion = this.m2;
  }

  if (!this.m2 && this.m2Construccion) {
    this.m2 = this.m2Construccion;
  }

  if (this.viviendaNueva == null) {
    this.viviendaNueva = this.proyectoNuevo !== false;
  }

  if (this.proyectoNuevo == null) {
    this.proyectoNuevo = this.viviendaNueva !== false;
  }

  // Si existe fecha de entrega, calculamos meses restantes como fallback legacy.
  if (this.fechaEntregaEstimada) {
    this.mesesConstruccionRestantes = monthsUntil(this.fechaEntregaEstimada);
  }

  // Si no hay número de cuotas, usamos meses restantes como aproximación.
  if (!this.numeroCuotasEntrada && this.mesesConstruccionRestantes) {
    this.numeroCuotasEntrada = this.mesesConstruccionRestantes;
  }

  // Mantener financing sincronizado.
  const downPaymentPct =
    typeof this.porcentajeEntradaRequerida === "number"
      ? this.porcentajeEntradaRequerida
      : 0.1;

  this.financing = {
    ...(this.financing || {}),
    downPaymentPct,
    mortgagePct: Math.max(0, 1 - downPaymentPct),
    allowInstallments: this.permiteEntradaEnCuotas !== false,
    reserveMin: this.reservaMinima || 0,
    monthsConstruction: this.mesesConstruccionRestantes || 0,
    promesaAmount: this.montoFirmaPromesa || 0,
    entryInstallmentsCount: this.numeroCuotasEntrada || 0,
    entryDeadlineDate: this.fechaLimiteEntrada || null,
  };

  // Coherencia comercial: si no está disponible, no debería publicarse.
  if (
    ["vendido", "reservado", "pausado", "oculto"].includes(
      String(this.estadoComercial || "")
    )
  ) {
    this.publicado = false;
  }

  next();
});

PropertySchema.index({
  titulo: "text",
  proyecto: "text",
  sector: "text",
  ciudadZona: "text",
  ciudad: "text",
  unidad: "text",
  torre: "text",
  manzana: "text",
  lote: "text",
});

const Property =
  mongoose.models.Property || mongoose.model("Property", PropertySchema);

export default Property;