// src/utils/mailerCustomerAuth.js
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
  REPLY_TO_EMAIL,
  NODE_ENV,
  APP_URL,
} = process.env;

/* ===========================================================
   Transporter (singleton)
=========================================================== */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const port = Number(SMTP_PORT || 587);
  const secure =
    String(SMTP_SECURE || "").toLowerCase() === "true" ? true : port === 465;

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST || "smtp-relay.sendinblue.com",
    port,
    secure,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return _transporter;
}

/* ===========================================================
   Remitente FINAL
=========================================================== */
const FINAL_FROM_EMAIL = FROM_EMAIL || SMTP_USER || "hello@habitalibre.com";
const FINAL_FROM_NAME = FROM_NAME || "HabitaLibre";
const FINAL_FROM = `"${FINAL_FROM_NAME}" <${FINAL_FROM_EMAIL}>`;
const FINAL_REPLY_TO = REPLY_TO_EMAIL || FINAL_FROM_EMAIL;
const FINAL_APP_URL = APP_URL || "https://habitalibre.com";

if (NODE_ENV !== "production") {
  console.log("[mailerCustomerAuth] FINAL_FROM =>", FINAL_FROM);
}

/* ===========================================================
   Helpers HTML
=========================================================== */
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlBase({ title = "", subtitle = "", body = "", ctaLabel = "", ctaUrl = "" }) {
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  const safeCtaLabel = escapeHtml(ctaLabel);
  const safeCtaUrl = escapeHtml(ctaUrl);

  return `
  <div style="margin:0;padding:0;background:#020617;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#020617;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                 style="max-width:640px;background:#0b1220;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;border-radius:24px;overflow:hidden;border:1px solid rgba(148,163,184,0.2);">
            
            <tr>
              <td style="padding:24px;background:radial-gradient(circle at 0 0,#2dd4bf,#0f172a 58%);">
                <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,0.75);">
                  HabitaLibre
                </div>
                <div style="font-size:24px;font-weight:750;line-height:1.2;margin-top:8px;color:#ffffff;">
                  ${safeTitle}
                </div>
                ${
                  safeSubtitle
                    ? `<div style="font-size:14px;color:rgba(255,255,255,0.82);line-height:1.5;margin-top:8px;">${safeSubtitle}</div>`
                    : ""
                }
              </td>
            </tr>

            <tr>
              <td style="padding:22px 24px 8px 24px;">
                ${body}

                ${
                  safeCtaLabel && safeCtaUrl
                    ? `
                    <div style="margin-top:20px;">
                      <a href="${safeCtaUrl}"
                         style="display:inline-block;padding:13px 20px;border-radius:999px;background:#2dd4bf;color:#02111f;font-size:14px;font-weight:800;text-decoration:none;">
                        ${safeCtaLabel}
                      </a>
                    </div>
                    `
                    : ""
                }
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px 22px 24px;font-size:11px;color:#64748b;line-height:1.5;">
                Este correo fue enviado por HabitaLibre. Si no creaste una cuenta, puedes ignorarlo.
              </td>
            </tr>
          </table>

          <div style="max-width:640px;padding:10px 12px;color:#64748b;font-size:11px;font-family:system-ui,-apple-system, Segoe UI, Roboto, Arial, sans-serif;">
            HabitaLibre · Quito, Ecuador
          </div>
        </td>
      </tr>
    </table>
  </div>
  `;
}

function htmlBienvenida({ nombre = "" }) {
  const n = escapeHtml(nombre || "Hola");

  const body = `
    <div style="font-size:15px;color:#e5e7eb;line-height:1.65;">
      Hola ${n},<br/><br/>
      Bienvenido a <strong>HabitaLibre</strong>. Tu cuenta ya fue creada correctamente.
      <br/><br/>
      Desde ahora puedes completar tu evaluación, guardar tu progreso y entender mejor tu camino hacia tu primera vivienda.
    </div>

    <div style="margin-top:18px;padding:16px;border-radius:18px;background:rgba(45,212,191,0.08);border:1px solid rgba(45,212,191,0.20);">
      <div style="font-size:14px;font-weight:800;color:#ffffff;margin-bottom:8px;">
        ¿Qué puedes hacer ahora?
      </div>

      <div style="font-size:13px;color:#cbd5e1;line-height:1.6;">
        • Completar tu evaluación financiera.<br/>
        • Ver cuánto podrías comprar hoy.<br/>
        • Conocer una cuota mensual referencial.<br/>
        • Explorar propiedades e hipotecas alineadas con tu perfil.
      </div>
    </div>

    <div style="font-size:12px;color:#94a3b8;line-height:1.55;margin-top:16px;">
      Los resultados de HabitaLibre son referenciales y pueden variar según la evaluación final de cada entidad financiera.
    </div>
  `;

  return htmlBase({
    title: "Bienvenido a HabitaLibre",
    subtitle: "Tu camino a tu primera vivienda empieza aquí.",
    body,
    ctaLabel: "Ir a HabitaLibre",
    ctaUrl: FINAL_APP_URL,
  });
}

function htmlResetPassword({ nombre = "", resetUrl = "", expiresMinutes = 20 }) {
  const n = escapeHtml(nombre || "Hola");
  const url = escapeHtml(resetUrl);

  const body = `
    <div style="font-size:14px;color:#e5e7eb;line-height:1.6;">
      ${n}, recibimos una solicitud para restablecer tu contraseña.<br/>
      Haz clic en el botón para crear una nueva contraseña.
    </div>

    <div style="font-size:12px;color:#cbd5f5;line-height:1.55;margin-top:14px;">
      Este enlace caduca en <strong>${Number(expiresMinutes) || 20} minutos</strong>.
      Si no solicitaste este cambio, puedes ignorar este correo.
    </div>

    <div style="font-size:11px;color:#94a3b8;margin-top:16px;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:
      <div style="margin-top:8px;word-break:break-all;padding:10px 12px;border-radius:14px;background:rgba(2,6,23,0.6);border:1px solid rgba(148,163,184,0.2);color:#bfdbfe;">
        ${url}
      </div>
    </div>
  `;

  return htmlBase({
    title: "Restablece tu contraseña",
    subtitle: "Crea una nueva contraseña de forma segura.",
    body,
    ctaLabel: "Crear nueva contraseña",
    ctaUrl: resetUrl,
  });
}

/* ===========================================================
   Correo de bienvenida
=========================================================== */
export async function enviarCorreoBienvenidaCustomer({ to, nombre = "" } = {}) {
  if (!to) throw new Error("enviarCorreoBienvenidaCustomer: falta 'to'");

  const tx = getTransporter();

  return tx.sendMail({
    from: FINAL_FROM,
    to,
    replyTo: FINAL_REPLY_TO,
    subject: "Bienvenido a HabitaLibre",
    html: htmlBienvenida({ nombre }),
    text:
      `Bienvenido a HabitaLibre\n\n` +
      `Hola ${nombre || ""}, tu cuenta ya fue creada correctamente.\n\n` +
      `Ahora puedes completar tu evaluación, guardar tu progreso y entender mejor tu camino hacia tu primera vivienda.\n\n` +
      `Ir a HabitaLibre: ${FINAL_APP_URL}`,
  });
}

/* ===========================================================
   Correo de reset password
=========================================================== */
export async function enviarCorreoResetPasswordCustomer({
  to,
  nombre = "",
  resetUrl,
  expiresMinutes = 20,
} = {}) {
  if (!to) throw new Error("enviarCorreoResetPasswordCustomer: falta 'to'");
  if (!resetUrl) {
    throw new Error("enviarCorreoResetPasswordCustomer: falta 'resetUrl'");
  }

  const tx = getTransporter();

  return tx.sendMail({
    from: FINAL_FROM,
    to,
    replyTo: FINAL_REPLY_TO,
    subject: "Restablece tu contraseña – HabitaLibre",
    html: htmlResetPassword({ nombre, resetUrl, expiresMinutes }),
    text:
      `HabitaLibre - Restablecer contraseña\n\n` +
      `Abre este enlace para crear una nueva contraseña (caduca en ${expiresMinutes} min):\n` +
      `${resetUrl}\n\n` +
      `Si no solicitaste este cambio, ignora este correo.`,
  });
}