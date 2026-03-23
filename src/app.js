import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import compression from "compression";
import helmet from "helmet";

import snapshotsRoutes from "./routes/snapshots.routes.js";
import mortgageRoutes from "./routes/mortgage.routes.js";
import { reportesRoutes } from "./routes/reportes.routes.js";
import { verifySmtp } from "./utils/mailer.js";

import Lead from "./models/Lead.js";
import igRoutes from "./routes/ig.routes.js";

// ================================
// Conversación IG (state machine)
// ================================
import ConversationSession from "./models/ConversationSession.js";
import {
  getInitialSessionPatch,
  runConversationTurn,
} from "./services/igConversationEngine.js";

// ✅ Motor real (misma lógica que /api/precalificar)
import { precalificarHL } from "./services/precalificar.service.js";

// ✅ NUEVO: Envío directo por Graph API (IG Messaging)
import { igSendText } from "./services/igSend.js";

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

// ✅ BODY PARSERS PRIMERO
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ MIDDLEWARES GENERALES
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(compression());

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
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "https://habitalibre.com",
  "https://www.habitalibre.com",
  "https://habitalibre-web.onrender.com",

  // Capacitor / app móvil
  "http://localhost",
  "http://127.0.0.1",
  "capacitor://localhost",
  "ionic://localhost",

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

    console.log("🌐 ORIGIN:", origin, "NORM:", norm);

    // Capacitor / Ionic
    if (norm === "capacitor://localhost") return cb(null, true);
    if (norm === "ionic://localhost") return cb(null, true);

    // localhost / 127.0.0.1 con cualquier puerto
    if (origin.startsWith("http://localhost")) return cb(null, true);
    if (origin.startsWith("https://localhost")) return cb(null, true);
    if (origin.startsWith("http://127.0.0.1")) return cb(null, true);
    if (origin.startsWith("https://127.0.0.1")) return cb(null, true);

    // allowList normal
    if (allowList.includes(norm)) return cb(null, true);

    console.warn(`🚫 CORS bloqueado para: ${origin}`);
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
    routes: routes.sort((a, b) =>
      String(a.path).localeCompare(String(b.path))
    ),
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
// Helpers IG webhook
// ================================
function shouldIgnoreIgMessage(m) {
  if (m?.message?.is_echo) return true;
  if (m?.read) return true;
  if (m?.delivery) return true;
  return false;
}

function extractUserText(m) {
  return m?.message?.text?.trim() || "";
}

/**
 * ✅ NUEVO: Envío real a Instagram (Graph API)
 * - Requiere IG_BUSINESS_ID y PAGE_ACCESS_TOKEN en .env
 * - Fallback opcional a n8n si defines N8N_IG_OUT_WEBHOOK_URL
 */
async function sendIgText(toUserId, text) {
  const n8nUrl = process.env.N8N_IG_OUT_WEBHOOK_URL;

  if (n8nUrl) {
    await fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId, text }),
    });
    return;
  }

  await igSendText({ toUserId, text });
}

/* ================================
   Lead helpers (IG)
================================ */
function pickScoreHL(respuesta) {
  const candidates = [
    respuesta?.puntajeHabitaLibre,
    respuesta?.scoreHL,
    respuesta?.score,
    respuesta?._echo?.scoreHL,
  ];

  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

async function upsertLeadFromInstagram({
  senderId,
  precalifInput,
  respuesta,
  session,
}) {
  const now = new Date();

  let lead = await Lead.findOne({ "metadata.igSenderId": String(senderId) });

  if (!lead) {
    lead = new Lead({
      canal: "instagram",
      fuente: "manual",
      metadata: { igSenderId: String(senderId) },
      fuentesInfo: {
        web: { seen: false, lastAt: null, completed: false },
        manychat: { seen: false, lastAt: null, completed: false },
        manual: { seen: true, lastAt: now, completed: true },
      },
    });
  } else {
    lead.canal = "instagram";
    lead.fuente = lead.fuente || "manual";
    lead.metadata = { ...(lead.metadata || {}), igSenderId: String(senderId) };

    lead.fuentesInfo = lead.fuentesInfo || {};
    lead.fuentesInfo.manual =
      lead.fuentesInfo.manual || {
        seen: false,
        lastAt: null,
        completed: false,
      };

    lead.fuentesInfo.manual.seen = true;
    lead.fuentesInfo.manual.lastAt = now;
    lead.fuentesInfo.manual.completed = true;
  }

  lead.edad = precalifInput?.edad ?? lead.edad ?? null;
  lead.tipo_ingreso = precalifInput?.tipoIngreso ?? lead.tipo_ingreso ?? null;
  lead.valor_vivienda =
    precalifInput?.valorVivienda ?? lead.valor_vivienda ?? null;
  lead.entrada_disponible =
    precalifInput?.entradaDisponible ?? lead.entrada_disponible ?? null;

  lead.afiliado_iess =
    precalifInput?.afiliadoIess ?? lead.afiliado_iess ?? null;
  lead.anios_estabilidad =
    precalifInput?.aniosEstabilidad ?? lead.anios_estabilidad ?? null;
  lead.ingreso_mensual =
    precalifInput?.ingresoNetoMensual ?? lead.ingreso_mensual ?? null;
  lead.deuda_mensual_aprox =
    precalifInput?.otrasDeudasMensuales ?? lead.deuda_mensual_aprox ?? null;

  lead.resultado = respuesta;
  lead.resultadoUpdatedAt = now;

  const sinOferta = Boolean(respuesta?.flags?.sinOferta);
  lead.producto = sinOferta
    ? "Sin oferta viable hoy"
    : respuesta?.productoSugerido || "Oferta viable (por definir)";

  lead.scoreHL = pickScoreHL(respuesta);

  lead.precalificacion = {
    bancoSugerido: respuesta?.bancoSugerido ?? null,
    productoSugerido: respuesta?.productoSugerido ?? null,
    cuotaEstimada: respuesta?.cuotaEstimada ?? null,
    capacidadPago: respuesta?.capacidadPago ?? null,
    dtiConHipoteca: respuesta?.dtiConHipoteca ?? null,
    sinOferta,
    input: precalifInput,
    conversationSessionId: session?._id ? String(session._id) : null,
  };

  lead.precalificacion_banco = respuesta?.bancoSugerido ?? null;
  lead.precalificacion_cuotaEstimada = respuesta?.cuotaEstimada ?? null;

  await lead.save();
  return lead;
}

/* ================================
   Instagram Webhook (POST events)
================================ */
app.post("/webhooks/instagram", (req, res) => {
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

          const turn1 = await runConversationTurn(session, userText);
          const updated = turn1.session;

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

          await sendIgText(senderId, turn1.replyText);

          if (turn1.shouldRunDecision) {
            const { input, respuesta } = precalificarHL(updated.data);

            updated.raw = updated.raw || {};
            updated.raw.precalifInput = input;
            updated.raw.precalifResult = respuesta;

            const lead = await upsertLeadFromInstagram({
              senderId,
              precalifInput: input,
              respuesta,
              session: updated,
            });

            updated.raw.leadId = String(lead._id);
            updated.currentStep = "result";

            const turn2 = await runConversationTurn(updated, "");

            await ConversationSession.updateOne(
              { _id: updated._id },
              {
                $set: {
                  status: "completed",
                  currentStep: updated.currentStep,
                  data: updated.data,
                  raw: updated.raw,
                  attempts: updated.attempts,
                  lastBotMessageAt: new Date(),
                },
              }
            );

            await sendIgText(senderId, turn2.replyText);
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

// Diagnóstico / Precalificación / Mortgage
app.use("/api/diag/mailer", diagMailerRoutes);
app.use("/api/diag", diagRoutes);
app.use("/api/precalificar", precalificarRoutes);
app.use("/api/mortgage", mortgageRoutes);
app.use("/api/snapshots", snapshotsRoutes);
app.use("/api/health", healthRoutes);

// IG
app.use("/api/ig", igRoutes);

// Leads
app.use("/api/leads", leadsRoutes);

// Reportes
app.use("/api/reportes", reportesRoutes);

app.get("/__version", (req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    renderCommit: process.env.RENDER_GIT_COMMIT || null,
  });
});

/* ================================
   MongoDB
================================ */
const mongoUri = process.env.MONGODB_URI;

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) =>
    console.error("❌ Error conectando a MongoDB:", err.message)
  );

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
   Verificación SMTP
================================ */
verifySmtp()
  .then(() => console.log("📧 SMTP verificado correctamente"))
  .catch((err) =>
    console.error("❌ Error verificando SMTP:", err.message)
  );

export default app;