// src/models/User.js
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    nombre: {
      type: String,
      default: "",
      trim: true,
    },

    apellido: {
      type: String,
      default: "",
      trim: true,
    },

    telefono: {
      type: String,
      default: "",
      trim: true,
    },

    // Reset password (olvidé mi contraseña)
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpiresAt: { type: Date, default: null },

    // ✅ Journey independiente: no se enlaza automáticamente a simulación
    currentLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
      index: true,
    },

    // ✅ Actividad (para dashboard CJ)
    lastLogin: { type: Date, default: null },

    // ✅ Snapshot financiero + resultado del motor (para dashboard CJ)
    ultimoSnapshotHL: {
      input: {
        ingresoNetoMensual: { type: Number, default: null },
        ingresoPareja: { type: Number, default: null },
        otrasDeudasMensuales: { type: Number, default: null },
        valorVivienda: { type: Number, default: null },
        entradaDisponible: { type: Number, default: null },
        edad: { type: Number, default: null },
        afiliadoIess: { type: Boolean, default: null },
        iessAportesTotales: { type: Number, default: null },
        iessAportesConsecutivos: { type: Number, default: null },
        tipoIngreso: { type: String, default: null },
        aniosEstabilidad: { type: Number, default: null },
        plazoAnios: { type: Number, default: null },
        ciudad: { type: String, default: null },
      },
      output: {
        scoreHL: { type: Number, default: null },
        sinOferta: { type: Boolean, default: null },
        productoSugerido: { type: String, default: null },
        bancoSugerido: { type: String, default: null },
        capacidadPago: { type: Number, default: null },
        cuotaEstimada: { type: Number, default: null },
        dtiConHipoteca: { type: Number, default: null },
      },
      createdAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
