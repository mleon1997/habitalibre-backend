// src/utils/mailer.js
import nodemailer from "nodemailer";

/* ===========================================================
   Variables de entorno
   =========================================================== */
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  FROM_EMAIL,
  FROM_NAME,
  NOTIFY_EMAILS,
} = process.env;

console.log("SMTP_USER :", SMTP_USER);
console.log("FROM_EMAIL:", FROM_EMAIL);

/* ===========================================================
   Transporter (singleton)
   =========================================================== */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST || "smtp-relay.sendinblue.com",
    port: Number(SMTP_PORT || 587),
    secure: String(SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return _transporter;
}

/* ===========================================================
   Remitente FINAL (siempre hello@habitalibre.com)
   =========================================================== */
const FINAL_FROM_EMAIL = FROM_EMAIL || SMTP_USER || "hello@habitalibre.com";
const FINAL_FROM_NAME  = FROM_NAME  || "HabitaLibre";
const FINAL_FROM       = `"${FINAL_FROM_NAME}" <${FINAL_FROM_EMAIL}>`;

console.log("FINAL_FROM usándose para todos los correos =>", FINAL_FROM);

/* ===========================================================
   Utilidad: lista de correos internos
   =========================================================== */
const INTERNAL_RECIPIENTS = (NOTIFY_EMAILS || FINAL_FROM_EMAIL)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* ===========================================================
   verifySmtp  (usado en /api/diag/smtp-verify)
   =========================================================== */
export async function verifySmtp() {
  const tx = getTransporter();

  try {
    await tx.verify();
    return {
      ok: true,
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
    };
  } catch (err) {
    console.error("❌ Error verificando SMTP:", err?.message || err);
    throw err;
  }
}

/* ===========================================================
   sendTestEmail  (usado en /api/diag/send-test)
   =========================================================== */
export async function sendTestEmail(to) {
  const tx = getTransporter();

  const info = await tx.sendMail({
    from: FINAL_FROM,          // 👈 remitente SIEMPRE de tu dominio
    to,
    subject: "Prueba HabitaLibre – SMTP OK",
    text: "Si ves este correo, el SMTP de HabitaLibre está funcionando correctamente.",
    html: `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;">
        <h2>Prueba de correo – HabitaLibre</h2>
        <p>Si ves este correo, el SMTP de HabitaLibre está funcionando correctamente ✅.</p>
      </div>
    `,
  });

  return info;
}

/* ===========================================================
   Plantilla simple para el cliente
   =========================================================== */
function htmlResumenCliente(lead = {}, resultado = {}) {
  const safe = (n) =>
    typeof n === "number" ? n.toLocaleString("en-US") : n ?? "—";
  const pct = (n) =>
    typeof n === "number" ? `${(n * 100).toFixed(1)} %` : "—";

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.45;color:#0f172a">
      <h2 style="margin:0 0 6px">¡Hola ${
        lead?.nombre?.split(" ")[0] || "!"
      } 👋</h2>
      <p>Gracias por usar el simulador de <strong>HabitaLibre</strong>. Este es tu resumen tentativo:</p>

      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border-radius:10px">
        <tr><td><b>Producto</b></td><td>${
          resultado?.productoElegido || resultado?.tipoCreditoElegido || "—"
        }</td></tr>
        <tr><td><b>Capacidad de pago</b></td><td>$ ${safe(
          resultado?.capacidadPago
        )}</td></tr>
        <tr><td><b>Cuota referencial</b></td><td>$ ${safe(
          resultado?.cuotaEstimada
        )}</td></tr>
        <tr><td><b>Stress (+2%)</b></td><td>$ ${safe(
          resultado?.cuotaStress
        )}</td></tr>
        <tr><td><b>LTV estimado</b></td><td>${pct(resultado?.ltv)}</td></tr>
        <tr><td><b>DTI con hipoteca</b></td><td>${pct(
          resultado?.dtiConHipoteca
        )}</td></tr>
        <tr><td><b>Monto préstamo máx.</b></td><td>$ ${safe(
          resultado?.montoMaximo
        )}</td></tr>
        <tr><td><b>Precio máx. vivienda</b></td><td>$ ${safe(
          resultado?.precioMaxVivienda
        )}</td></tr>
      </table>

      <p style="margin-top:12px;font-size:12px;color:#475569">
        Este resultado es referencial y no constituye una oferta de crédito.
        Sujeto a validación documental y políticas de cada entidad.
      </p>

      <p style="margin-top:16px">
        Un asesor de HabitaLibre se pondrá en contacto contigo por <b>${
          lead?.canal || "WhatsApp"
        }</b>.
      </p>
    </div>
  `;
}

/* ===========================================================
   Plantilla simple interna (equipo HL)
   =========================================================== */
function htmlInterno(lead = {}, resultado = {}) {
  const row = (k, v) =>
    `<tr><td style="padding:6px 8px"><b>${k}:</b></td><td style="padding:6px 8px">${
      v ?? "—"
    }</td></tr>`;
  const safe = (n) =>
    typeof n === "number" ? n.toLocaleString("en-US") : n ?? "—";
  const pct = (n) =>
    typeof n === "number" ? `${(n * 100).toFixed(1)} %` : "—";

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      <h3 style="margin:0 0 8px">🆕 Nuevo lead (HabitaLibre)</h3>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border-radius:10px">
        ${row("Nombre", lead?.nombre)}
        ${row("Email", lead?.email)}
        ${row("Teléfono", lead?.telefono)}
        ${row("Ciudad", lead?.ciudad)}
        ${row("Canal", lead?.canal)}
        ${row("Origen", lead?.origen)}
      </table>

      <h4 style="margin:14px 0 6px">Resultado tentativo</h4>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f1f5f9;border-radius:10px">
        ${row(
          "Producto",
          resultado?.productoElegido || resultado?.tipoCreditoElegido
        )}
        ${row("Capacidad de pago", `$ ${safe(resultado?.capacidadPago)}`)}
        ${row("Cuota", `$ ${safe(resultado?.cuotaEstimada)}`)}
        ${row("Stress (+2%)", `$ ${safe(resultado?.cuotaStress)}`)}
        ${row("LTV", pct(resultado?.ltv))}
        ${row("DTI", pct(resultado?.dtiConHipoteca))}
        ${row("Monto máx.", `$ ${safe(resultado?.montoMaximo)}`)}
        ${row(
          "Precio máx. vivienda",
          `$ ${safe(resultado?.precioMaxVivienda)}`
        )}
      </table>
    </div>
  `;
}

/* ===========================================================
   💌 enviarCorreoCliente: correo al lead
   =========================================================== */
export async function enviarCorreoCliente(lead, resultado) {
  if (!lead?.email) {
    console.warn("⚠️ enviarCorreoCliente: lead sin email, se omite envío.");
    return null;
  }

  const tx = getTransporter();

  const info = await tx.sendMail({
    from: FINAL_FROM, // 👈 SIEMPRE hello@habitalibre.com
    to: lead.email,
    replyTo: lead.email
      ? `"${lead.nombre || "Cliente"}" <${lead.email}>`
      : undefined,
    subject: "Tu precalificación HabitaLibre está lista 🏡",
    html: htmlResumenCliente(lead, resultado),
    text: "Gracias por usar el simulador de HabitaLibre. Revisa tu correo en formato HTML.",
  });

  return info;
}

/* ===========================================================
   💌 enviarCorreoLead: correo interno al equipo
   =========================================================== */
export async function enviarCorreoLead(lead, resultado) {
  const tx = getTransporter();

  const info = await tx.sendMail({
    from: FINAL_FROM, // 👈 remitente autenticado
    to: INTERNAL_RECIPIENTS.join(","),
    subject: `Nuevo lead: ${lead?.nombre || "Cliente"} (${lead?.canal || "—"})`,
    html: htmlInterno(lead, resultado),
    replyTo: lead?.email
      ? `"${lead?.nombre || "Cliente"}" <${lead.email}>`
      : undefined,
  });

  return info;
}
