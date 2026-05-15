// src/models/UserSnapshot.js
import mongoose from "mongoose";

const UserSnapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },

    fecha: {
      type: Date,
      default: Date.now,
      index: true,
    },

    input: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    output: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    preparacionPorRuta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    rutaRecomendada: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

UserSnapshotSchema.index({ userId: 1, fecha: -1 });
UserSnapshotSchema.index({ userId: 1, createdAt: -1 });

const UserSnapshot =
  mongoose.models.UserSnapshot ||
  mongoose.model("UserSnapshot", UserSnapshotSchema);

export default UserSnapshot;