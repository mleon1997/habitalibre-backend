// src/app.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import compression from "compression";
import helmet from "helmet";
import { reportesRoutes } from "./routes/reportes.routes.js";
import { verifySmtp } from "./utils/mailer.js";

// ================================
// Rutas
// ================================
import adminAuthRoutes from "./routes/adminAuth.routes.js"; // POST /api/admin/login
import adminUsersRoutes from "./routes/adminUsers.routes.js"; // /api/admin/users/...

import customerAuthRoutes from "./routes/customerAuth.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import customerLeadsRoutes from "./routes/customerLeads.routes.js";

import diagRoutes from "./routes/diag.routes.js";
import diagMailerRoutes from "./routes/diagMailer.routes.js";
import precalificarRoutes from "./routes/precalificar.routes.js";
import leadsRoutes from "./routes/leads.routes.js";
import healthRoutes from "./routes/health.routes.js";

// ================================
// App
// ================================
const app = express();

app.set("trust proxy", true);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(express.json({ limit: "2mb" }));
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
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/* ================================
   Healthcheck (Render)
================================ */
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

/* ================================
   DEBUG: listar rutas registradas
================================ */
app.get("/__routes", (req, res) => {
  const routes = [];

  const stack = app?._router?.stack || [];
  for (const layer of stack) {
    if (layer?.route?.path) {
      const methods = Object.keys(layer.route.methods || {})
        .map((m) => m.toUpperCase())
        .join(",");
      routes.push({ path: layer.route.path, methods });
    }
  }

  res.json({ ok: true, count: routes.length, routes });
});


/* ================================
   Instagram Webhook (GET verify)
================================ */
app.get("/webhooks/instagram", (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "habitalibre_verify";

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Instagram webhook verificado");
   return res.status(200).type("text/plain").send(String(challenge || ""));

  }

  console.warn("🚫 Instagram webhook verify falló", { mode, token });
  return res.sendStatus(403);
});

/* ================================
   Instagram Webhook (POST events)
================================ */
app.post("/webhooks/instagram", (req, res) => {
  // Meta necesita 200 rápido
  res.status(200).json({ ok: true });

  // Log mínimo para confirmar que llegan eventos
  console.log("📩 IG webhook event:", JSON.stringify(req.body).slice(0, 2000));

  // Luego aquí reenviamos a n8n o procesamos (lo hacemos después)
});


/* ================================
   Rutas API
================================ */

// 🔐 Admin
app.use("/api/admin", adminAuthRoutes); // POST /api/admin/login
app.use("/api/admin/users", adminUsersRoutes); // GET /, /kpis, /export/csv



// 👤 Customer Journey
app.use("/api/customer-auth", customerAuthRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/customer/leads", customerLeadsRoutes);

// Diagnóstico / Precalificación
app.use("/api/diag/mailer", diagMailerRoutes); // 👈 separado para no pisar /api/diag
app.use("/api/diag", diagRoutes);
app.use("/api/precalificar", precalificarRoutes);
app.use("/api/health", healthRoutes);
app.get("/__version", (req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    renderCommit: process.env.RENDER_GIT_COMMIT || null,
  });
});

app.get("/__routes_check", (req, res) => {
  const paths = (app?._router?.stack || [])
    .map((l) => l?.route?.path)
    .filter(Boolean);

  res.json({
    ok: true,
    hasWebhookInstagram: paths.includes("/webhooks/instagram"),
    routesSample: paths.slice(0, 30),
  });
});



// 📩 Leads
app.use("/api/leads", leadsRoutes);

// 📄 Reportes (Ficha Comercial / PDFs)
app.use("/api/reportes", reportesRoutes);

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
