// src/utils/mailer.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import PDFDocument from "pdfkit";
import { PassThrough } from "stream";
import { generarPDFLeadAvanzado } from "./pdf.js";

// Cargar .env antes de leer process.env
dotenv.config();

/* =========================
   ENV
   ========================= */
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  FROM_NAME,
  FROM_EMAIL,
  NOTIFY_EMAILS,
} = process.env;

// Validación temprana de credenciales
if (!SMTP_USER || !SMTP_PASS) {
  console.error("❌ Faltan credenciales SMTP. Revisa .env (SMTP_USER / SMTP_PASS).");
}

/* =========================
   TRANSPORTER (Brevo/Sendinblue)
   ========================= */
export const transporter = nodemailer.createTransport({
  host: SMTP_HOST || "smtp-relay.sendinblue.com",
  port: Number(SMTP_PORT || 587),
  secure: false, // STARTTLS
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  // Evita falsos negativos de certificado cuando el proveedor redirige
  tls: { servername: SMTP_HOST || "smtp-relay.sendinblue.com" },
});

/* =========================
   VERIFICACIÓN SMTP
   ========================= */
export async function verifySmtp() {
  try {
    await transporter.verify();
    console.log("✅ Conexión SMTP verificada correctamente");
    return true;
  } catch (err) {
    console.error("❌ Error verificando SMTP:", err?.message || err);
    throw err;
  }
}

/* =========================
   HELPERS DE FORMATO
   ========================= */
const money = (n, d = 0) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : `$${Number(n).toLocaleString("es-EC", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      })}`;

const pct = (p, d = 1) =>
  p == null || Number.isNaN(Number(p)) ? "—" : `${(Number(p) * 100).toFixed(d)}%`;

const years = (m) => (m ? `${Math.round(Number(m) / 12)} años` : "—");

/* ============================================================
   PDF: Timeout wrapper + fallback (para no dejar sin adjunto)
   ============================================================ */
async function generatePdfBuffer(lead, resultado) {
  // Generador real (reporte completo)
  return await generarPDFLeadAvanzado(lead, resultado);
}

function withTimeout(promise, ms = 15000, label = "pdf") {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout ${ms}ms (${label})`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function generatePdfSafe(lead, resultado, ms = 15000) {
  const t0 = Date.now();
  try {
    const buf = await withTimeout(generatePdfBuffer(lead, resultado), ms, "pdf");
    console.log(`🧾 PDF generado en ${Date.now() - t0}ms (${Math.round(buf.length / 1024)} KB)`);
    return buf;
  } catch (err) {
    console.warn(`⚠️ No se pudo generar PDF en ${ms}ms: ${err.message}. Enviando fallback.`);
    return await simpleFallbackPdfBuffer(lead, resultado);
  }
}

// PDF fallback minimalista (1 página) para asegurar adjunto
async function simpleFallbackPdfBuffer(lead, resultado) {
  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (c) => chunks.push(c));

  return new Promise((resolve, reject) => {
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);

    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: "Precalificación HabitaLibre (resumen)" } });
    doc.pipe(stream);

    const nowEC = new Date().toLocaleString("es-EC");
    doc
      .fontSize(20)
      .text("HabitaLibre – Precalificación", { underline: true })
      .moveDown(0.5);

    doc.fontSize(12).text(`Cliente: ${lead?.nombre || "Cliente"}`);
    doc.text(`Email: ${lead?.email || "—"}`);
    doc.text(`Fecha: ${nowEC}`).moveDown(1);

    doc.fontSize(14).text("Resumen:", { underline: true }).moveDown(0.3);
    doc.fontSize(12);
    doc.text(`Capacidad de pago: ${money(resultado?.capacidadPago, 0)}`);
    doc.text(`Monto máximo: ${money(resultado?.montoMaximo, 0)}`);
    doc.text(`LTV: ${pct(resultado?.ltv, 0)}`);
    doc.text(
      `Tasa / Plazo: ${
        resultado?.tasaAnual != null ? `${(Number(resultado.tasaAnual) * 100).toFixed(2)}%` : "—"
      } • ${years(resultado?.plazoMeses)}`
    );

    doc
      .moveDown(1)
      .fontSize(10)
      .fillColor("#64748b")
      .text(
        "Este es un PDF de respaldo generado automáticamente si tu reporte detallado no estaba listo a tiempo. " +
          "Te enviaremos el reporte completo en cuanto esté disponible.",
        { width: 480 }
      );

    doc.end();
  });
}

/* =========================
   EMAIL INTERNO (notificación a equipo)
   ========================= */
export async function enviarCorreoLead(lead, resultado = {}, opts = {}) {
  const subject = `Nuevo Lead HabitaLibre: ${lead?.nombre || "Cliente"}`;
  const to = (NOTIFY_EMAILS || "hello@habitalibre.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f172a">
      <h2 style="margin:0 0 6px 0;color:#4F46E5">🏡 Nuevo Lead recibido</h2>
      <table style="border-collapse:collapse;width:100%;max-width:680px;font-size:14px">
        ${[
          ["Nombre", lead?.nombre],
          ["Email", lead?.email],
          ["Teléfono", lead?.telefono],
          ["Ciudad", lead?.ciudad],
          ["Producto sugerido", resultado?.productoElegido || resultado?.tipoCreditoElegido || "—"],
          ["Monto máximo", money(resultado?.montoMaximo, 0)],
          ["Capacidad de pago", money(resultado?.capacidadPago, 0)],
          ["LTV", pct(resultado?.ltv, 0)],
          ["DTI", pct(resultado?.dtiConHipoteca, 0)],
        ]
          .map(
            ([k, v]) =>
              `<tr>
                <td style="padding:8px;border-bottom:1px solid #eee"><b>${k}</b></td>
                <td style="padding:8px;border-bottom:1px solid #eee">${v ?? "—"}</td>
              </tr>`
          )
          .join("")}
      </table>
      <p style="color:#64748b;font-size:12px;margin-top:10px">UA: ${lead?.userAgent || "—"} • IP: ${
    lead?.ip || "—"
  }</p>
    </div>
  `;

  const attachments = [];
  if (opts?.pdfBuffer) {
    const nombreSafe = String(lead?.nombre || "cliente").replace(/[^a-zA-Z0-9\s\-_]/g, "");
    attachments.push({
      filename: `Lead-${nombreSafe}.pdf`,
      content: opts.pdfBuffer,
      contentType: "application/pdf",
    });
  }

  await transporter.sendMail({
    from: `${FROM_NAME || "HabitaLibre"} <${FROM_EMAIL || SMTP_USER}>`,
    to,
    subject,
    html,
    attachments,
  });

  console.log("📩 Correo interno enviado OK");
}

/* =========================
   EMAIL AL CLIENTE (resumen + PDF adjunto)
   ========================= */
/* =========================
   EMAIL AL CLIENTE (resumen + PDF adjunto)
   ========================= */
export async function enviarCorreoCliente(lead, resultado = {}, opts = {}) {
  // --- Helper: dejar SOLO lo que usa el PDF y normalizar ---
  const toNum = (v, def = null) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };
  const toInt = (v, def = null) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  };
  const cleanStr = (s, max = 120) => {
    if (s == null) return null;
    const t = String(s);
    return t.length > max ? t.slice(0, max) : t;
  };

  // Mantén SOLO campos usados por pdf.js y limpia NaN/valores raros
  const R = {
    capacidadPago: toNum(resultado?.capacidadPago, null),
    montoMaximo: toNum(resultado?.montoMaximo, null),
    precioMaxVivienda: toNum(resultado?.precioMaxVivienda, null),
    tasaAnual: toNum(resultado?.tasaAnual, null),
    plazoMeses: toInt(resultado?.plazoMeses, null),
    ltv: toNum(resultado?.ltv, null),
    dtiConHipoteca: toNum(resultado?.dtiConHipoteca, null),
    cuotaEstimada: toNum(resultado?.cuotaEstimada, null),
    cuotaStress: toNum(resultado?.cuotaStress, null),
    productoElegido: cleanStr(
      resultado?.productoElegido ?? resultado?.tipoCreditoElegido ?? ""
    ),
    valorVivienda: toNum(resultado?.valorVivienda, null),
    entradaDisponible: toNum(resultado?.entradaDisponible, null),
    // Ignoramos 'escenarios', 'bounds' grandes, etc. para evitar recursión/profundidad
  };

  const nombre = (lead?.nombre || "Cliente").split(" ")[0];

  const capacidadPago = money(R.capacidadPago, 0);
  const montoMaximo = money(R.montoMaximo, 0);
  const ltv = pct(R.ltv, 0);
  const tasa = R.tasaAnual != null ? `${(Number(R.tasaAnual) * 100).toFixed(2)}%` : "—";
  const plazo = years(R.plazoMeses);

  const productoSugerido = (() => {
    const k = String(R.productoElegido || "").toLowerCase();
    if (k.includes("vis")) return "Crédito VIS";
    if (k.includes("vip")) return "Crédito VIP";
    if (k.includes("biess") && (k.includes("pref") || k.includes("prefer"))) return "BIESS Preferencial";
    if (k.includes("biess")) return "Crédito BIESS";
    return "Banca privada";
  })();

  const tips = [];
  if ((R.ltv ?? 0) > 0.9) tips.push("Aumenta tu entrada para bajar el LTV (ideal ≤ 80%).");
  if ((R.dtiConHipoteca ?? 0) > 0.42) tips.push("Reduce deudas mensuales para llevar tu DTI ≤ 42%.");
  if (R.cuotaStress && R.capacidadPago && R.cuotaStress > R.capacidadPago) {
    tips.push("Con +2% de tasa, la cuota supera tu capacidad. Considera mayor plazo o sumar ingreso familiar.");
  }
  if (!tips.length) tips.push("Perfil sólido. Negocia tasas preferenciales y solicita pre-aprobación.");

  const subject = "Tu precalificación HabitaLibre está lista 🏡";

  // Generar PDF si no vino desde el controlador (con timeout y logs detallados)
  let pdfBuffer = opts?.pdfBuffer;
  if (!pdfBuffer) {
    try {
      const make = generarPDFLeadAvanzado(lead, R);
      const timeoutMs = Number(process.env.PDF_TIMEOUT_MS || 30000);

      pdfBuffer = await Promise.race([
        make,
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error(`PDF timeout ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
    } catch (err) {
      console.error(
        `⚠️ No se pudo generar PDF en ${(process.env.PDF_TIMEOUT_MS || 30000)}ms:`,
        err?.stack || err?.message || err
      );
      // No re-lanzamos; seguimos con fallback abajo
    }
  }

  // HTML
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:28px 0; color:#0f172a;">
    <div style="max-width:680px;margin:auto;background:#ffffff;border-radius:14px;padding:36px;box-shadow:0 6px 20px rgba(2,6,23,.06);border:1px solid #e5e7eb">
      <h2 style="margin:0 0 8px 0;color:#4F46E5;font-size:22px;font-weight:800;">Hola ${nombre} 👋</h2>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6">
        Gracias por usar <b>HabitaLibre</b>. Abajo va tu <b>resumen ejecutivo</b> y te adjuntamos tu
        <b>reporte PDF</b> para descargar y compartir con tu banco.
      </p>

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:18px 0 8px 0;">
        <div style="background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:12px;padding:14px;">
          <div style="font-size:11px;color:#64748b;letter-spacing:.04em;text-transform:uppercase;">Capacidad de pago</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px;">${capacidadPago}</div>
        </div>
        <div style="background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:12px;padding:14px;">
          <div style="font-size:11px;color:#64748b;letter-spacing:.04em;text-transform:uppercase;">Monto máximo</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px;">${montoMaximo}</div>
        </div>
        <div style="background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:12px;padding:14px;">
          <div style="font-size:11px;color:#64748b;letter-spacing:.04em;text-transform:uppercase;">LTV estimado</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px;">${ltv}</div>
        </div>
        <div style="background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:12px;padding:14px;">
          <div style="font-size:11px;color:#64748b;letter-spacing:.04em;text-transform:uppercase;">Tasa / Plazo</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px;">${tasa} • ${plazo}</div>
        </div>
      </div>

      <div style="margin:12px 0 18px 0;font-size:14px;">
        <div style="padding:12px 14px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;">
          <b style="color:#4338ca">Crédito sugerido:</b> ${productoSugerido}
        </div>
      </div>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;">
        <div style="font-size:13px;color:#334155;margin-bottom:6px"><b>Recomendaciones para mejorar tu perfil:</b></div>
        <ul style="margin:6px 0 0 18px;color:#475569;font-size:13px;line-height:1.5;">
          ${tips.map((t) => `<li>${t}</li>`).join("")}
        </ul>
      </div>

      <div style="text-align:center;margin:24px 0 6px;">
        <a href="https://wa.me/593999999999?text=${encodeURIComponent(
          `Hola, ya recibí mi precalificación y quiero continuar con un asesor.`
        )}"
           style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">
          Hablar con un asesor por WhatsApp
        </a>
      </div>

      <p style="font-size:12px;color:#94a3b8;margin-top:18px;border-top:1px solid #e5e7eb;padding-top:12px;">
        Adjuntamos tu <b>PDF de precalificación</b>. Este correo fue generado automáticamente; no respondas a esta dirección.
      </p>
      <p style="font-size:11px;color:#94a3b8;margin:0;">HabitaLibre © ${new Date().getFullYear()} • Quito, Ecuador 🇪🇨</p>
    </div>
  </div>`;

  const attachments = [];
  if (pdfBuffer) {
    const nombreSafe = String(lead?.nombre || "Cliente").replace(/[^a-zA-Z0-9\s\-_]/g, "");
    attachments.push({
      filename: `Precalificacion-${nombreSafe}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    });
  } else {
    // Fallback “bonito” si algo raro ocurre
    const fallback = Buffer.from(
      `%PDF-1.4
% Fallback simple generado por mailer (no detallado)
`, "utf8");
    attachments.push({
      filename: "Precalificacion.pdf",
      content: fallback,
      contentType: "application/pdf",
    });
  }

  await transporter.sendMail({
    from: `${FROM_NAME || "HabitaLibre"} <${FROM_EMAIL || SMTP_USER}>`,
    to: lead?.email,
    subject,
    html,
    attachments,
  });

  console.log(`📧 Correo enviado al cliente ${lead?.email} con${pdfBuffer ? "" : " SIN"} PDF detallado`);
}

