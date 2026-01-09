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

    // ✅ Journey independiente: no se enlaza automáticamente a simulación
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
