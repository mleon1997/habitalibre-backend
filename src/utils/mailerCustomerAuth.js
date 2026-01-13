// src/utils/mailerCustomerAuth.js
import nodemailer from "nodemailer";

/* ===========================================================
   Variables de entorno (reusa las mismas del quick win)
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
} = process.env;

/* ===========================================================
   Transporter (singleton)
=========================================================== */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const port = Number(SMTP_PORT || 587);
  const secure = String(SMTP_SECURE || "").toLowerCase() === "true" ? true : port === 465;

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST || "smtp-relay.sendinblue.com",
    port,
    secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return _transporter;
}

/* ===========================================================
   Remitente FINAL (misma marca)
=========================================================== */
const FINAL_FROM_EMAIL = FROM_EMAIL || SMTP_USER || "hello@habitalibre.com";
const FINAL_FROM_NAME = FROM_NAME || "HabitaLibre";
const FINAL_FROM = `"${FINAL_FROM_NAME}" <${FINAL_FROM_EMAIL}>`;
const FINAL_REPLY_TO = REPLY_TO_EMAIL || FINAL_FROM_EMAIL;

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

function htmlResetPassword({ nombre = "", resetUrl = "", expiresMinutes = 20 }) {
  const n = escapeHtml(nombre || "Hola");
  const url = escapeHtml(resetUrl);

  return `
  <div style="margin:0;padding:0;background:#020617;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#020617;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                 style="max-width:640px;background:#0b1220;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;border-radius:24px;overflow:hidden;border:1px solid rgba(148,163,184,0.2);">
            <tr>
              <td style="padding:22px 24px;background:radial-gradient(circle at 0 0,#22c55e,#0f172a);">
                <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,0.75);">
                  HabitaLibre · Customer Journey
                </div>
                <div style="font-size:22px;font-weight:650;line-height:1.25;margin-top:6px;color:#ffffff;">
                  Restablece tu contraseña
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px 8px 24px;">
                <div style="font-size:14px;color:#e5e7eb;line-height:1.6;">
                  ${n}, recibimos una solicitud para restablecer tu contraseña.<br/>
                  Haz clic en el botón para crear una nueva contraseña.
                </div>

                <div style="margin-top:16px;">
                  <a href="${url}"
                     style="display:inline-block;padding:12px 18px;border-radius:999px;background:#22c55e;color:#022c22;font-size:13px;font-weight:700;text-decoration:none;">
                    Crear nueva contraseña
                  </a>
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
              </td>
            </tr>

            <tr>
              <td style="padding:14px 24px 18px 24px;font-size:11px;color:#64748b;">
                Por tu seguridad, nunca compartas tu contraseña. HabitaLibre nunca te la pedirá por correo.
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

/* ===========================================================
   ✅ EXPORT NOMBRADO (esto resuelve tu error)
=========================================================== */
export async function enviarCorreoResetPasswordCustomer({
  to,
  nombre = "",
  resetUrl,
  expiresMinutes = 20,
} = {}) {
  if (!to) throw new Error("enviarCorreoResetPasswordCustomer: falta 'to'");
  if (!resetUrl) throw new Error("enviarCorreoResetPasswordCustomer: falta 'resetUrl'");

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
