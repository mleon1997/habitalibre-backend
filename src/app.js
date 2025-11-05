// src/app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose"; // 👈 asegúrate de importar mongoose
import 'dotenv/config';


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
    origin: (origin, callback) => {
      const allowed = [
        'http://localhost:5173',
        'https://habitalibre.com',
        'https://www.habitalibre.com',
        // opcional: si usas previews de Vercel
        /\.vercel\.app$/
      ];

      // Permite clientes sin origin (curl/healthchecks) o si hace match exacto/regex
      if (!origin ||
          allowed.includes(origin) ||
          allowed.some((rule) => rule instanceof RegExp && rule.test(origin))) {
        return callback(null, true);
      }
      return callback(new Error(`CORS bloqueado para origen: ${origin}`));
    },
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
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



