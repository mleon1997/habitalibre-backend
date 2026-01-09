// src/models/JourneySnapshot.js
import mongoose from "mongoose";

const JourneySnapshotSchema = new mongoose.Schema(
  {
    // ✅ v1: identificamos al "usuario" por email (del token admin por ahora)
    usuarioEmail: { type: String, required: true, index: true },

    // tracking opcional
    codigoHL: { type: String, default: null, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null, index: true },

    resultado: {
      capacidadPago: { type: Number, default: null },
      montoMaximo: { type: Number, default: null },
      precioMaxVivienda: { type: Number, default: null },
      cuotaEstimada: { type: Number, default: null },
      tasaAnual: { type: Number, default: null },
      plazoMeses: { type: Number, default: null },
      ltv: { type: Number, default: null },
      dtiConHipoteca: { type: Number, default: null },
      scoreHL: { type: Number, default: null },
      productoSugerido: { type: String, default: null },
      bancoSugerido: { type: String, default: null },
      meta: { type: Object, default: {} },
    },

    input: {
      ingresoMensual: { type: Number, default: null },
      deudasMensuales: { type: Number, default: null },
      dependientes: { type: Number, default: null },
      entradaDisponible: { type: Number, default: null },
      metaCuota: { type: Number, default: null },
      metaPrecio: { type: Number, default: null },
      meta: { type: Object, default: {} },
    },

    etapa: {
      type: String,
      enum: ["simulado", "guardado", "preparacion", "listo_para_aplicar"],
      default: "guardado",
      index: true,
    },
  },
  { timestamps: true }
);

const JourneySnapshot =
  mongoose.models.JourneySnapshot ||
  mongoose.model("JourneySnapshot", JourneySnapshotSchema);

export default JourneySnapshot;
