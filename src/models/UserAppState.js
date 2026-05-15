// src/models/UserAppState.js
import mongoose from "mongoose";

const UserAppStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    selectedProperty: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    docsChecklist: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    journey: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    lastSelectedPropertyAt: {
      type: Date,
      default: null,
    },

    lastDocsChecklistAt: {
      type: Date,
      default: null,
    },

    lastJourneyAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

UserAppStateSchema.index({ userId: 1, updatedAt: -1 });

const UserAppState =
  mongoose.models.UserAppState ||
  mongoose.model("UserAppState", UserAppStateSchema);

export default UserAppState;