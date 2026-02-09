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
// NUEVO: Conversación IG (state machine)
// ================================
import ConversationSession from "./models/ConversationSession.js";
import { getInitialSessionPatch, runConversationTurn } from "./services/igConversationEngine.js";

// ================================
// Rutas
// ================================
import adminAuthRoutes from "./routes/adminAuth.routes.js";
import adminUsersRoutes from "./routes/adminUsers.routes.js";

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
    if (!origin) return cb(null, true);
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
  const stack = app?._router?.stack || app?.router?.stack || [];
  const routes = [];

  for (const layer of stack) {
    if (!layer) continue;

    if (layer.route?.path) {
      const methods = Object.keys(layer.route.methods || {})
        .filter((m) => layer.route.methods[m])
        .map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
      continue;
    }

    if (layer.name === "router" && layer.handle?.stack) {
      for (const l2 of layer.handle.stack) {
        if (!l2?.route?.path) continue;
        const methods = Object.keys(l2.route.methods || {})
          .filter((m) => l2.route.methods[m])
          .map((m) => m.toUpperCase());
        routes.push({ path: l2.route.path, methods });
      }
    }
  }

  res.json({
    ok: true,
    count: routes.length,
    routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
  });
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

// ================================
// NUEVO: Helpers IG webhook
// ================================
function shouldIgnoreIgMessage(m) {
  if (m?.message?.is_echo) return true; // mensaje del bot (echo)
  if (m?.read) return true;            // read receipts
  if (m?.delivery) return true;        // delivery receipts
  return false;
}

function extractUserText(m) {
  return m?.message?.text?.trim() || "";
}

/**
 * Envío:
 * - Si usas n8n para enviar: define N8N_IG_OUT_WEBHOOK_URL
 * - Si no, por ahora loguea (no rompe nada)
 */
async function sendIgText(toUserId, text) {
  const url = process.env.N8N_IG_OUT_WEBHOOK_URL;

  if (url) {
    // Node 18+ ya trae fetch global
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId, text }),
    });
    return;
  }

  console.log("➡️ BOT SHOULD SEND TO", toUserId, ":", text);
}

/* ================================
   Instagram Webhook (POST events)
   ✅ Estado conversacional + guardado en Mongo
================================ */
app.post("/webhooks/instagram", (req, res) => {
  // ✅ Meta necesita 200 rápido
  res.status(200).json({ ok: true });

  (async () => {
    try {
      const entries = req.body?.entry || [];

      for (const e of entries) {
        const messagingArr = e?.messaging || [];

        for (const m of messagingArr) {
          if (shouldIgnoreIgMessage(m)) continue;

          const senderId = m?.sender?.id;
          if (!senderId) continue;

          const userText = extractUserText(m);
          if (!userText) continue;

          // 1) Load/upsert sesión
          const base = getInitialSessionPatch();

          const session = await ConversationSession.findOneAndUpdate(
            { channel: "instagram", channelUserId: senderId },
            {
              $setOnInsert: {
                channel: "instagram",
                channelUserId: senderId,
                ...base,
              },
              $set: { lastUserMessageAt: new Date() },
            },
            { new: true, upsert: true }
          );

          // 2) Turno de conversación
          const { session: updated, replyText, shouldRunDecision } =
            await runConversationTurn(session, userText);

          // 3) Guardar estado intermedio
          await ConversationSession.updateOne(
            { _id: updated._id },
            {
              $set: {
                currentStep: updated.currentStep,
                data: updated.data,
                raw: updated.raw,
                attempts: updated.attempts,
                lastBotMessageAt: new Date(),
              },
            }
          );

          // 4) Responder (primer mensaje post-turno)
          await sendIgText(senderId, replyText);

          // 5) Si toca ejecutar motor /api/precalificar, por ahora dejamos stub.
          //    (En el siguiente paso lo conectamos a tu motor REAL sin HTTP)
          if (shouldRunDecision) {
            updated.raw = updated.raw || {};
            updated.raw.precalifResult = {
              sinOferta: true,
              cuotaEstimada: null,
              capacidadPago: null,
              dtiConHipoteca: null,
              bancoSugerido: null,
              productoSugerido: null,
              _note: "TODO: conectar al motor real /api/precalificar",
            };

            // Forzar a RESULT y enviar
            updated.currentStep = "result";
            const r2 = await runConversationTurn(updated, ""); // ask result

            await ConversationSession.updateOne(
              { _id: updated._id },
              {
                $set: {
                  currentStep: updated.currentStep,
                  data: updated.data,
                  raw: updated.raw,
                  attempts: updated.attempts,
                  lastBotMessageAt: new Date(),
                },
              }
            );

            await sendIgText(senderId, r2.replyText);
          }
        }
      }
    } catch (err) {
      console.error("❌ IG webhook processing error:", err);
    }
  })();
});

/* ================================
   Rutas API
================================ */

// 🔐 Admin
app.use("/api/admin", adminAuthRoutes);
app.use("/api/admin/users", adminUsersRoutes);

// 👤 Customer Journey
app.use("/api/customer-auth", customerAuthRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/customer/leads", customerLeadsRoutes);

// Diagnóstico / Precalificación
app.use("/api/diag/mailer", diagMailerRoutes);
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
