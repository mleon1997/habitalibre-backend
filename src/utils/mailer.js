// src/utils/mailer.js
import nodemailer from "nodemailer";
import { generarPDFLeadAvanzado } from "./pdf.js";

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
const FINAL_FROM_NAME = FROM_NAME || "HabitaLibre";
const FINAL_FROM = `"${FINAL_FROM_NAME}" <${FINAL_FROM_EMAIL}>`;

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
    from: FINAL_FROM,
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
   Helpers de formato para HTML
   =========================================================== */
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const money = (n, d = 2) =>
  isNum(n)
    ? `$ ${Number(n).toLocaleString("es-EC", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      })}`
    : "—";
const pct = (p, d = 1) => (isNum(p) ? `${(p * 100).toFixed(d)} %` : "—");

/* ===========================================================
   HTML world-class para el CLIENTE
   =========================================================== */
function htmlResumenCliente(lead = {}, resultado = {}) {
  const nombre = lead?.nombre?.split(" ")[0] || "¡Hola!";
  const producto =
    resultado?.productoElegido || resultado?.tipoCreditoElegido || "Crédito hipotecario";
  const capacidad = money(resultado?.capacidadPago);
  const cuota = money(resultado?.cuotaEstimada);
  const stress = money(resultado?.cuotaStress);
  const ltv = pct(resultado?.ltv);
  const dti = pct(resultado?.dtiConHipoteca);
  const monto = money(resultado?.montoMaximo);
  const precio = money(resultado?.precioMaxVivienda);

  return `
  <div style="margin:0;padding:0;background:#020617;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#020617;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#020617;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
            <tr>
              <td style="padding:0 24px 16px 24px;" align="left">
                <div style="font-size:13px;color:#64748b;margin-bottom:4px;">HabitaLibre · Resumen de precalificación</div>
                <div style="font-size:24px;font-weight:600;color:#e5e7eb;">${nombre}, tu resultado ya está listo 🏡</div>
              </td>
            </tr>

            <!-- Card principal -->
            <tr>
              <td style="padding:0 16px 24px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                  style="border-radius:24px;background:radial-gradient(circle at 0 0,#4f46e5,#0f172a);padding:24px;box-shadow:0 20px 45px rgba(15,23,42,0.7);">
                  <tr>
                    <td style="color:#e5e7eb;font-size:14px;">
                      <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#c7d2fe;margin-bottom:4px;">
                        Precalificación resumida
                      </div>
                      <div style="font-size:18px;font-weight:600;margin-bottom:12px;">${producto}</div>
                      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
                        <div style="flex:1 1 180px;min-width:180px;border-radius:16px;background:rgba(15,23,42,0.75);padding:12px 14px;border:1px solid rgba(148,163,184,0.3);">
                          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.12em;">Capacidad de pago</div>
                          <div style="font-size:18px;font-weight:600;margin-top:4px;">${capacidad}</div>
                        </div>
                        <div style="flex:1 1 180px;min-width:180px;border-radius:16px;background:rgba(15,23,42,0.75);padding:12px 14px;border:1px solid rgba(148,163,184,0.3);">
                          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.12em;">Cuota referencial</div>
                          <div style="font-size:18px;font-weight:600;margin-top:4px;">${cuota}</div>
                        </div>
                      </div>

                      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:10px;">
                        <div style="flex:1 1 160px;min-width:160px;border-radius:14px;background:rgba(15,23,42,0.85);padding:10px 12px;">
                          <div style="font-size:11px;color:#9ca3af;">Stress (+2%)</div>
                          <div style="font-size:14px;font-weight:500;margin-top:2px;">${stress}</div>
                        </div>
                        <div style="flex:1 1 140px;min-width:140px;border-radius:14px;background:rgba(15,23,42,0.85);padding:10px 12px;">
                          <div style="font-size:11px;color:#9ca3af;">LTV estimado</div>
                          <div style="font-size:14px;font-weight:500;margin-top:2px;">${ltv}</div>
                        </div>
                        <div style="flex:1 1 140px;min-width:140px;border-radius:14px;background:rgba(15,23,42,0.85);padding:10px 12px;">
                          <div style="font-size:11px;color:#9ca3af;">DTI con hipoteca</div>
                          <div style="font-size:14px;font-weight:500;margin-top:2px;">${dti}</div>
                        </div>
                      </div>

                      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:4px;">
                        <div style="flex:1 1 180px;min-width:180px;border-radius:14px;background:rgba(15,23,42,0.85);padding:10px 12px;">
                          <div style="font-size:11px;color:#9ca3af;">Monto préstamo máx.</div>
                          <div style="font-size:14px;font-weight:500;margin-top:2px;">${monto}</div>
                        </div>
                        <div style="flex:1 1 180px;min-width:180px;border-radius:14px;background:rgba(15,23,42,0.85);padding:10px 12px;">
                          <div style="font-size:11px;color:#9ca3af;">Precio máx. vivienda</div>
                          <div style="font-size:14px;font-weight:500;margin-top:2px;">${precio}</div>
                        </div>
                      </div>

                      <div style="font-size:12px;color:#cbd5f5;margin-top:14px;">
                        Adjuntamos un reporte detallado en PDF con explicación de cada métrica, stress test de tasa,
                        tabla de amortización y un plan de acción para mejorar tus probabilidades de aprobación.
                      </div>

                      <div style="margin-top:18px;">
                        <a href="https://habitalibre.com"
                           style="display:inline-block;padding:10px 18px;border-radius:999px;background:#22c55e;color:#022c22;
                                  font-size:13px;font-weight:600;text-decoration:none;">
                          Ver más sobre HabitaLibre
                        </a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Nota legal -->
            <tr>
              <td style="padding:0 24px 24px 24px;font-size:11px;color:#94a3b8;">
                Este resultado es referencial y no constituye una oferta de crédito.
                Está sujeto a validación documental y a las políticas de cada entidad financiera.
              </td>
            </tr>

            <!-- Footer pequeño -->
            <tr>
              <td style="padding:0 24px 8px 24px;font-size:11px;color:#64748b;">
                HabitaLibre · Quito, Ecuador
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
}

/* ===========================================================
   HTML world-class para correo INTERNO
   =========================================================== */
function htmlInterno(lead = {}, resultado = {}) {
  const producto =
    resultado?.productoElegido || resultado?.tipoCreditoElegido || "Crédito hipotecario";

  return `
  <div style="margin:0;padding:0;background:#0b1120;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0b1120;padding:20px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#020617;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
            <tr>
              <td style="padding:16px 24px 8px 24px;">
                <div style="font-size:13px;color:#93c5fd;margin-bottom:4px;">Nuevo lead capturado</div>
                <div style="font-size:20px;font-weight:600;">${lead?.nombre || "Cliente"} · ${producto}</div>
                <div style="font-size:12px;color:#64748b;margin-top:4px;">
                  Origen: ${lead?.origen || "Simulador web"} · Canal: ${lead?.canal || "Web"}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:0 16px 16px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                  style="border-radius:20px;background:#020617;border:1px solid #1e293b;padding:16px;">
                  <tr>
                    <td style="font-size:13px;color:#e5e7eb;">
                      <div style="font-size:12px;font-weight:600;color:#9ca3af;margin-bottom:8px;">Datos de contacto</div>
                      <div><strong>Nombre:</strong> ${lead?.nombre || "—"}</div>
                      <div><strong>Email:</strong> ${lead?.email || "—"}</div>
                      <div><strong>Teléfono:</strong> ${lead?.telefono || "—"}</div>
                      <div><strong>Ciudad:</strong> ${lead?.ciudad || "—"}</div>
                    </td>
                    <td width="32"></td>
                    <td style="font-size:13px;color:#e5e7eb;">
                      <div style="font-size:12px;font-weight:600;color:#9ca3af;margin-bottom:8px;">Resumen numérico</div>
                      <div><strong>Capacidad pago:</strong> ${money(resultado?.capacidadPago)}</div>
                      <div><strong>Cuota ref.:</strong> ${money(resultado?.cuotaEstimada)}</div>
                      <div><strong>Stress (+2%):</strong> ${money(resultado?.cuotaStress)}</div>
                      <div><strong>LTV:</strong> ${pct(resultado?.ltv)}</div>
                      <div><strong>DTI:</strong> ${pct(resultado?.dtiConHipoteca)}</div>
                      <div><strong>Monto máx.:</strong> ${money(resultado?.montoMaximo)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 16px 24px;font-size:12px;color:#9ca3af;">
                Adjuntamos el reporte PDF completo generado por el motor de scoring de HabitaLibre
                para que el equipo comercial pueda revisar el detalle antes de contactar al cliente.
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 8px 24px;font-size:11px;color:#64748b;">
                HabitaLibre · Panel interno
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
}

/* ===========================================================
   Helper: generar PDF avanzado desde pdf.js
   =========================================================== */
async function generarPDFBuffer(lead, resultado) {
  try {
    const buffer = await generarPDFLeadAvanzado(lead, resultado);
    return buffer;
  } catch (err) {
    console.error("❌ Error generando PDF avanzado:", err);
    return null;
  }
}

/* ===========================================================
   💌 enviarCorreoCliente: correo al lead + PDF avanzado
   =========================================================== */
export async function enviarCorreoCliente(lead, resultado) {
  if (!lead?.email) {
    console.warn("⚠️ enviarCorreoCliente: lead sin email, se omite envío.");
    return null;
  }

  const tx = getTransporter();
  const pdfBuffer = await generarPDFBuffer(lead, resultado);

  const info = await tx.sendMail({
    from: FINAL_FROM,
    to: lead.email,
    replyTo: lead.email
      ? `"${lead.nombre || "Cliente"}" <${lead.email}>`
      : undefined,
    subject: "Tu precalificación HabitaLibre está lista 🏡",
    html: htmlResumenCliente(lead, resultado),
    text:
      "Gracias por usar el simulador de HabitaLibre. " +
      "Adjuntamos un PDF con el resumen detallado de tu precalificación.",
    attachments: pdfBuffer
      ? [
          {
            filename: "HabitaLibre-precalificacion.pdf",
            content: pdfBuffer,
          },
        ]
      : [],
  });

  return info;
}

/* ===========================================================
   💌 enviarCorreoLead: correo interno al equipo + mismo PDF
   =========================================================== */
export async function enviarCorreoLead(lead, resultado) {
  const tx = getTransporter();
  const pdfBuffer = await generarPDFBuffer(lead, resultado);

  const info = await tx.sendMail({
    from: FINAL_FROM,
    to: INTERNAL_RECIPIENTS.join(","),
    subject: `Nuevo lead: ${lead?.nombre || "Cliente"} (${lead?.canal || "—"})`,
    html: htmlInterno(lead, resultado),
    replyTo: lead?.email
      ? `"${lead?.nombre || "Cliente"}" <${lead.email}>`
      : undefined,
    attachments: pdfBuffer
      ? [
          {
            filename: "HabitaLibre-precalificacion.pdf",
            content: pdfBuffer,
          },
        ]
      : [],
  });

  return info;
}
