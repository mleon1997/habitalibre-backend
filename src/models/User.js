// src/models/User.js
import mongoose from "mongoose";

const SnapshotHLSchema = new mongoose.Schema(
  {
    input: { type: Object, default: null }, // datos financieros normalizados
    output: { type: Object, default: null }, // resultado del motor (quick win fields)
    createdAt: { type: Date, default: null },
  },
  { _id: false }
);

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

    nombre: { type: String, default: "", trim: true },
    apellido: { type: String, default: "", trim: true },
    telefono: { type: String, default: "", trim: true },

    // opcional: para que tu dashboard “Ciudad” no sea siempre "-"
    ciudad: { type: String, default: "", trim: true },

    // ✅ login tracking (tu admin dashboard lo usa)
    lastLogin: { type: Date, default: null, index: true },

    // ✅ snapshot financiero para dashboard users (quick win style)
    ultimoSnapshotHL: { type: SnapshotHLSchema, default: null },

    // Reset password (olvidé mi contraseña)
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpiresAt: { type: Date, default: null },

    // ✅ Journey independiente
    currentLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
