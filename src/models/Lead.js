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

    // ==========================
    // ✅ CANALES / FUENTE (ManyChat)
    // ==========================
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
    // ✅ CAMPOS “RÁPIDOS” DEL FLOW (para verlos en dashboard)
    // ==========================
    afiliado_iess: { type: Boolean, default: null, index: true },
    anios_estabilidad: { type: Number, default: null, index: true },
    ingreso_mensual: { type: Number, default: null, index: true },
    deuda_mensual_aprox: { type: Number, default: null, index: true },

    ciudad_compra: { type: String, default: null, index: true },

    tipo_compra: { type: String, default: null, index: true }, // "solo" | "pareja" | etc.
    tipo_compra_numero: { type: Number, default: null, index: true }, // 1 | 2

    // ✅ CANÓNICO: aquí debe quedar el resultado del simulador
    resultado: { type: Object },

    // ✅ timestamps explícitos
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
