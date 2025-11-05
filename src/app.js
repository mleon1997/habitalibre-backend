// src/app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import "dotenv/config";

// Importar rutas
import diagRoutes from "./routes/diag.routes.js";
import precalificarRoutes from "./routes/precalificar.routes.js";
import leadsRoutes from "./routes/leads.routes.js";
import healthRoutes from "./routes/health.routes.js";
import { verifySmtp } from "./utils/mailer.js";

// Inicializar app y cargar variables
dotenv.config();
const app = express();

/* ===========================================================
   1️⃣ Conexión a MongoDB
   =========================================================== */
const mongoUri = process.env.MONGODB_URI;
mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) => console.error("❌ Error conectando a MongoDB:", err.message));

/* ===========================================================
   2️⃣ Configuración de CORS
   =========================================================== */
const envOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
  "https://habitalibre.com",
  "https://www.habitalibre.com",
  ...envOrigins,
];

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Permitir peticiones sin origin (Postman, health checks)
    if (allowedOrigins.includes(origin)) return cb(null, true);
    console.warn(`🚫 CORS bloqueado para origen no autorizado: ${origin}`);
    return cb(new Error(`CORS bloqueado para origen: ${origin}`), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false, // true solo si usas cookies o autenticación basada en sesión
  optionsSuccessStatus: 204,
};

// Aplicar CORS global
app.use(cors(corsOptions));

// Aceptar preflights OPTIONS (Express 5 no acepta "*", usamos RegExp)
app.options(/^\/.*$/, cors(corsOptions));

/* ===========================================================
   3️⃣ Middlewares base
   =========================================================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ===========================================================
   4️⃣ Rutas API
   =========================================================== */
app.use("/api/diag", diagRoutes);
app.use("/api/precalificar", precalificarRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/health", healthRoutes);

/* ===========================================================
   5️⃣ Ruta 404
   =========================================================== */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Ruta no encontrada" });
});

/* ===========================================================
   6️⃣ Verificación SMTP (solo al inicio)
   =========================================================== */
verifySmtp()
  .then(() => console.log("📧 SMTP verificado correctamente"))
  .catch((err) => console.error("❌ Error verificando SMTP:", err.message));

export default app;
