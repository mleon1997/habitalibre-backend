// src/models/Lead.js
import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema(
  {
    // contact
    nombre: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    telefono: { type: String, trim: true },
    ciudad: { type: String, trim: true },

    // preferencias
    canal: { type: String, enum: ["WhatsApp", "Email", "Teléfono"], default: "WhatsApp" },
    aceptaTerminos: { type: Boolean, default: false },
    aceptaCompartir: { type: Boolean, default: true },
    aceptaMarketing: { type: Boolean, default: false },

    // payload del simulador (echo del front)
    nacionalidad: { type: String },
    estadoCivil: { type: String },
    ingresoNetoMensual: { type: Number },
    ingresoPareja: { type: Number },
    otrasDeudasMensuales: { type: Number },

    valorVivienda: { type: Number },
    entradaDisponible: { type: Number },
    tieneVivienda: { type: Boolean },

    tipoIngreso: { type: String },
    aniosEstabilidad: { type: Number },
    edad: { type: Number },
    afiliadoIESS: { type: Boolean },
    iessAportesTotales: { type: Number },
    iessAportesConsecutivas: { type: Number },
    declaracionBuro: { type: String },

    // resultados calculados (lo que te devuelve /precalificar)
    resultado: { type: Object },

    // metadatos
    origen: { type: String, default: "simulador" },
    ip: { type: String },
    userAgent: { type: String },
    estado: { type: String, enum: ["nuevo", "contactado", "cerrado"], default: "nuevo" },
  },
  { timestamps: true }
);

export default mongoose.model("Lead", LeadSchema);

