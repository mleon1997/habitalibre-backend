// src/models/CustomerLead.js
import mongoose from "mongoose";

const CustomerLeadSchema = new mongoose.Schema(
  {
    customerId: { type: String, index: true, required: true },
    customerEmail: { type: String, default: "" },

    // ✅ canonical
    entrada: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ✅ compat legacy (por si tu front viejo lee input)
    input: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ✅ compat legacy (por si en algún momento guardaste aquí)
    metadata: {
      input: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    resultado: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, default: "precalificado" },
    source: { type: String, default: "journey" },
  },
  { timestamps: true }
);

export default mongoose.model("CustomerLead", CustomerLeadSchema);
