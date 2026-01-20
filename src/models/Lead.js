// src/models/Lead.js
import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema(
  {
    // -----------------------
    // Datos base
    // -----------------------
    nombre: String,
    email: { type: String, index: true },
    telefono: { type: String, index: true },
    ciudad: { type: String, index: true }, // ciudad general (web o manychat si quieres mapear)

    // vínculo con customer/user
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

    // -----------------------
    // Datos simulador web
    // -----------------------
    producto: { type: String },
    scoreHL: { type: Number },
    tiempoCompra: { type: String, index: true },

    sustentoIndependiente: {
      type: String,
      enum: ["declaracion", "movimientos", "ninguno", null],
      default: null,
      index: true,
    },

    // ✅ resultado simulador (web)
    resultado: { type: Object },
    resultadoUpdatedAt: { type: Date, index: true },

    aceptaTerminos: Boolean,
    aceptaCompartir: Boolean,

    // -----------------------
    // ✅ NUEVO: origen/canal canónico (para distinguir Web vs ManyChat)
    // -----------------------
    canal: {
      type: String,
      enum: ["web", "whatsapp", "instagram", "otro", null],
      default: null,
      index: true,
    },

    fuente: {
      type: String,
      enum: ["habitalibre_web", "manychat", "otro", null],
      default: null,
      index: true,
    },

    // -----------------------
    // ✅ NUEVO: campos canónicos capturados por ManyChat
    // (para que el dashboard los muestre sin leer metadata)
    // -----------------------
    afiliadoIess: { type: Boolean, default: null, index: true },
    aniosEstabilidad: { type: Number, default: null, index: true },
    ingresoMensual: { type: Number, default: null, index: true },
    deudaMensualAprox: { type: Number, default: null, index: true },

    ciudadCompra: { type: String, default: null, index: true },

    tipoCompra: { type: String, default: null, index: true }, // "solo" / "pareja"
    tipoCompraNumero: { type: Number, default: null, index: true }, // 1 / 2

    manychatSubscriberId: { type: String, default: null, index: true },
    igUsername: { type: String, default: null, index: true },

    // -----------------------
    // Mantén tu metadata flexible
    // -----------------------
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
