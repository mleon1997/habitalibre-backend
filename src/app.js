// src/app.js

// ================================
// Imports
// ================================
import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import compression from "compression";
import helmet from "helmet";


// Rutas
import authRoutes from "./routes/auth.routes.js"; // 🔐 ADMIN
import customerAuthRoutes from "./routes/customerAuth.routes.js"; // 👤 CUSTOMER AUTH
import customerRoutes from "./routes/customer.routes.js";
import diagRoutes from "./routes/diag.routes.js";
import precalificarRoutes from "./routes/precalificar.routes.js";
import leadsRoutes from "./routes/leads.routes.js";
import healthRoutes from "./routes/health.routes.js";
import customerLeadsRoutes from "./routes/customerLeads.routes.js";
import diagMailerRoutes from "./routes/diagMailer.routes.js";
import adminUsersRoutes from "./routes/adminUsers.routes.js";


import { verifySmtp } from "./utils/mailer.js";

// ================================
// App
// ================================
const app = express();

app.set("trust proxy", true);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));


/* ================================
   Helpers CORS
================================ */
function parseOrigins(str) {
  return String(str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeOrigin(origin) {
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.host}`;
  } catch {
    return origin;
  }
}

/* ================================
   Allowed Origins
================================ */
const allowList = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
  "https://habitalibre.com",
  "https://www.habitalibre.com",
  "https://habitalibre-web.onrender.com",
  ...parseOrigins(process.env.CORS_ORIGIN),
]
  .map(normalizeOrigin)
  .filter(Boolean);

console.log("🔐 ALLOWED ORIGINS:", allowList);

/* ================================
   CORS (ANTES de rutas)
================================ */
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Postman / health checks / server-to-server
    const norm = normalizeOrigin(origin);
    if (allowList.includes(norm)) return cb(null, true);

    console.warn(`🚫 CORS bloqueado para: ${origin} (norm: ${norm})`);
    return cb(new Error(`CORS bloqueado para origen: ${origin}`), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use("/api/diag", diagMailerRoutes);
app.use("/api/admin/users", adminUsersRoutes);


/* ================================
   Healthcheck (Render)
================================ */
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

/* ================================
   Rutas API (UNA sola vez)
================================ */
// 🔐 Admin
app.use("/api/auth", authRoutes);

// 👤 Customer Journey
app.use("/api/customer-auth", customerAuthRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/customer/leads", customerLeadsRoutes);

// Diagnóstico / Precalificación
app.use("/api/diag", diagRoutes);
app.use("/api/precalificar", precalificarRoutes);
app.use("/api/health", healthRoutes);

// 📩 Leads
app.use("/api/leads", leadsRoutes);

/* ================================
   MongoDB
================================ */
const mongoUri = process.env.MONGODB_URI;

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) => console.error("❌ Error conectando a MongoDB:", err.message));

/* ================================
   404
================================ */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Ruta no encontrada" });
});

/* ================================
   Manejo global de errores
================================ */
app.use((err, req, res, next) => {
  const code = err.status || 500;

  const msg = err?.message?.includes("CORS")
    ? "Origen no permitido por CORS"
    : err?.message || "Error";

  console.error("❌ Error middleware:", code, msg);

  res.status(code).json({ ok: false, error: msg });
});

/* ================================
   Verificación SMTP (no bloquea server)
================================ */
verifySmtp()
  .then(() => console.log("📧 SMTP verificado correctamente"))
  .catch((err) => console.error("❌ Error verificando SMTP:", err.message));

export default app;
