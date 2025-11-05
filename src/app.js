// src/app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose"; // 👈 asegúrate de importar mongoose

// Rutas
import diagRoutes from "./routes/diag.routes.js";
import precalificarRoutes from "./routes/precalificar.routes.js";
import leadsRoutes from "./routes/leads.routes.js";
import healthRoutes from "./routes/health.routes.js";

import { verifySmtp } from "./utils/mailer.js";

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
   2️⃣ Middlewares base
   =========================================================== */
app.use(
  cors({
    origin: [
      "http://localhost:5173", // Front local
      "https://habitalibre.com", // dominio producción (ajústalo cuando despliegues)
    ],
    credentials: true,
  })
);
app.use(express.json());

/* ===========================================================
   3️⃣ Rutas API
   =========================================================== */
app.use("/api/diag", diagRoutes);
app.use("/api/precalificar", precalificarRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/health", healthRoutes);

/* ===========================================================
   4️⃣ Ruta fallback 404
   =========================================================== */
app.use((req, res) => res.status(404).json({ ok: false, error: "Ruta no encontrada" }));

/* ===========================================================
   5️⃣ Verificación SMTP (opcional)
   =========================================================== */
verifySmtp()
  .then(() => console.log("📧 SMTP verificado correctamente"))
  .catch((err) => console.error("❌ Error verificando SMTP:", err.message));

export default app;



