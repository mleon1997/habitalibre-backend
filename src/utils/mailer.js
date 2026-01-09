// src/utils/mailer.js
import nodemailer from "nodemailer";
import { generarPDFLeadAvanzado } from "./pdf.js";
import { normalizeResultadoParaSalida } from "./hlResultado.js";

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
  REPLY_TO_EMAIL,
  NODE_ENV,
} = process.env;

if (NODE_ENV !== "production") {
  console.log("SMTP_USER :", SMTP_USER);
  console.log("FROM_EMAIL:", FROM_EMAIL);
}

/* ===========================================================
   Transporter (singleton)
=========================================================== */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const port = Number(SMTP_PORT || 587);

  // Si SMTP_SECURE viene explícito, lo respetamos.
  // Si no, inferimos por puerto (465 suele ser secure).
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
   Remitente FINAL (default hello@habitalibre.com)
=========================================================== */
const FINAL_FROM_EMAIL = FROM_EMAIL || SMTP_USER || "hello@habitalibre.com";
const FINAL_FROM_NAME = FROM_NAME || "HabitaLibre";
const FINAL_FROM = `"${FINAL_FROM_NAME}" <${FINAL_FROM_EMAIL}>`;

// Reply-To para que el cliente responda a HabitaLibre (no a sí mismo)
const FINAL_REPLY_TO = REPLY_TO_EMAIL || FINAL_FROM_EMAIL;

if (NODE_ENV !== "production") {
  console.log("FINAL_FROM usándose para todos los correos =>", FINAL_FROM);
  console.log("FINAL_REPLY_TO =>", FINAL_REPLY_TO);
}

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
    return { ok: true, host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE };
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
    replyTo: FINAL_REPLY_TO,
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
   ✅ Consistencia con PDF (sinOferta + capacidadPago efectiva)
=========================================================== */
const pickNumber = (...vals) => {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const pickBool = (...vals) => {
  for (const v of vals) {
    if (typeof v === "boolean") return v;
  }
  return undefined;
};

// MISMO fallback heurístico numérico que pdf.js (NO por producto)
function calcularSinOfertaFallback(R = {}) {
  const montoMax = R.montoMaximo;
  const precioMax = R.precioMaxVivienda;

  const noSignals =
    !(typeof montoMax === "number" && Number.isFinite(montoMax)) ||
    montoMax <= 0 ||
    !(typeof precioMax === "number" && Number.isFinite(precioMax)) ||
    precioMax <= 0 ||
    !(typeof R.capacidadPago === "number" && Number.isFinite(R.capacidadPago)) ||
    R.capacidadPago <= 0;

  if (noSignals) return true;

  if (typeof R.dtiConHipoteca === "number" && Number.isFinite(R.dtiConHipoteca) && R.dtiConHipoteca > 0.5)
    return true;

  if (typeof R.ltv === "number" && Number.isFinite(R.ltv) && R.ltv > 0.9) return true;

  if (
    typeof R.cuotaEstimada === "number" &&
    Number.isFinite(R.cuotaEstimada) &&
    typeof R.capacidadPago === "number" &&
    Number.isFinite(R.capacidadPago) &&
    R.cuotaEstimada > R.capacidadPago
  )
    return true;

  return false;
}

function computeCapacidadEfectiva(resultado = {}) {
  return pickNumber(
    resultado?.capacidadPagoPrograma,
    resultado?.capacidadPago,
    resultado?.capacidadPagoGlobal,
    resultado?.bounds?.capacidadPago,
    resultado?.perfil?.capacidadPago
  );
}

function computeSinOfertaFinal(resultado = {}) {
  const sinOfertaFromEngine = pickBool(resultado?.flags?.sinOferta, resultado?.sinOferta);

  const capacidadEfectiva = computeCapacidadEfectiva(resultado);

  const R = {
    capacidadPago: capacidadEfectiva,
    montoMaximo: pickNumber(resultado?.montoMaximo, resultado?.montoPrestamoMax, resultado?.prestamoMax),
    precioMaxVivienda: pickNumber(resultado?.precioMaxVivienda, resultado?.precioMax, resultado?.valorMaxVivienda),
    ltv: pickNumber(resultado?.ltv),
    dtiConHipoteca: pickNumber(resultado?.dtiConHipoteca),
    cuotaEstimada: pickNumber(resultado?.cuotaEstimada),
  };

  const sinOferta = typeof sinOfertaFromEngine === "boolean" ? sinOfertaFromEngine : calcularSinOfertaFallback(R);

  return { sinOferta, capacidadEfectiva };
}

// “vista” de resultado para email (mismo sinOferta/capacidad que PDF)
function resultadoParaEmail(resultado = {}) {
  const { sinOferta, capacidadEfectiva } = computeSinOfertaFinal(resultado);

  const capFinal = Number.isFinite(Number(capacidadEfectiva))
    ? Number(capacidadEfectiva)
    : Number.isFinite(Number(resultado?.capacidadPago))
    ? Number(resultado.capacidadPago)
    : undefined;

  return {
    ...resultado,
    ...(capFinal !== undefined ? { capacidadPago: capFinal } : {}),
    flags: { ...(resultado?.flags || {}), sinOferta },
  };
}

/* ===========================================================
   Render: ranking de bancos (cliente)
=========================================================== */
function renderTopBancosCliente(resultado = {}) {
  const r = resultadoParaEmail(resultado);
  const sinOferta = r?.flags?.sinOferta === true;
  if (sinOferta) return "";

  const bancosTop3 = r.bancosTop3 && r.bancosTop3.length ? r.bancosTop3 : (r.bancosProbabilidad || []).slice(0, 3);

  if (!bancosTop3 || bancosTop3.length === 0) return "";

  const mejorBanco = r.mejorBanco || bancosTop3[0];

  const filas = bancosTop3
    .map((b, idx) => {
      const nombre = b.banco || b.nombre || "Banco";

      let rawScore = null;
      if (isNum(b.probScore)) rawScore = b.probScore; // 0–100
      else if (isNum(b.probPct)) rawScore = b.probPct; // 0–100
      else if (isNum(b.probabilidad)) rawScore = b.probabilidad * 100; // 0–1 => %
      else if (isNum(b.prob)) rawScore = b.prob * 100; // 0–1 => %
      else if (isNum(b.score)) rawScore = b.score; // 0–100

      const probScore = rawScore !== null ? Math.round(rawScore) : null;
      const probLabel = b.probLabel || "Probabilidad media";

      const tipoProducto = b.tipoProducto || b.tipoCredito || b.tipo || b.producto || "";

      const filaIdx = idx + 1;
      const scoreTexto = probScore !== null ? `${probScore}%` : "—";

      return `
        <tr>
          <td style="padding:6px 10px;font-size:12px;color:#e5e7eb;border-bottom:1px solid rgba(30,64,175,0.4);">
            <span style="opacity:0.8;">${filaIdx}.</span> ${nombre}
          </td>
          <td style="padding:6px 10px;font-size:12px;color:#bfdbfe;border-bottom:1px solid rgba(30,64,175,0.4);text-align:center;">
            ${probLabel}
            ${probScore !== null ? `<span style="opacity:0.8;"> · ${scoreTexto}</span>` : ""}
          </td>
          <td style="padding:6px 10px;font-size:11px;color:#94a3b8;border-bottom:1px solid rgba(30,64,175,0.4);text-align:right;">
            ${tipoProducto || "—"}
          </td>
        </tr>
      `;
    })
    .join("");

  const mejorNombre = mejorBanco?.banco || mejorBanco?.nombre || "la entidad con mejor ajuste";

  let mejorRaw = null;
  if (isNum(mejorBanco?.probScore)) mejorRaw = mejorBanco.probScore;
  else if (isNum(mejorBanco?.probPct)) mejorRaw = mejorBanco.probPct;
  else if (isNum(mejorBanco?.probabilidad)) mejorRaw = mejorBanco.probabilidad * 100;
  else if (isNum(mejorBanco?.prob)) mejorRaw = mejorBanco.prob * 100;
  else if (isNum(mejorBanco?.score)) mejorRaw = mejorBanco.score;

  const mejorScore = mejorRaw !== null ? `${Math.round(mejorRaw)}%` : "";
  const mejorLabel = mejorBanco?.probLabel || "Alta";

  return `
    <div style="margin-top:18px;border-radius:18px;background:rgba(15,23,42,0.92);border:1px solid rgba(59,130,246,0.5);padding:14px 16px;">
      <div style="font-size:12px;font-weight:600;color:#bfdbfe;margin-bottom:4px;">
        ¿Dónde tienes más probabilidad de aprobación?
      </div>
      <div style="font-size:11px;color:#cbd5f5;margin-bottom:10px;line-height:1.5;">
        Según tu perfil actual, la entidad que mejor encaja hoy es 
        <span style="font-weight:600;color:#a5b4fc;">${mejorNombre}</span>
        (${mejorLabel}${mejorScore ? ` · ${mejorScore}` : ""}).<br/>
        Te recomendamos empezar tu trámite allí y luego comparar con 1–2 bancos adicionales.
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
             style="border-collapse:collapse;border-radius:12px;overflow:hidden;background:rgba(15,23,42,0.9);">
        <thead>
          <tr>
            <th style="font-size:11px;color:#9ca3af;font-weight:500;padding:6px 10px;text-align:left;border-bottom:1px solid rgba(30,64,175,0.7);">
              Banco
            </th>
            <th style="font-size:11px;color:#9ca3af;font-weight:500;padding:6px 10px;text-align:center;border-bottom:1px solid rgba(30,64,175,0.7);">
              Probabilidad
            </th>
            <th style="font-size:11px;color:#9ca3af;font-weight:500;padding:6px 10px;text-align:right;border-bottom:1px solid rgba(30,64,175,0.7);">
              Tipo de producto
            </th>
          </tr>
        </thead>
        <tbody>
          ${filas}
        </tbody>
      </table>
      <div style="font-size:10px;color:#64748b;margin-top:8px;">
        Estas probabilidades son referenciales y se basan en la información que ingresaste
        + políticas promedio de cada entidad. El banco siempre tomará la decisión final.
      </div>
    </div>
  `;
}

/* ===========================================================
   Render: ranking de bancos (interno)
=========================================================== */
function renderTopBancosInterno(resultado = {}) {
  const r = resultadoParaEmail(resultado);

  const bancosTop3 = r.bancosTop3 && r.bancosTop3.length ? r.bancosTop3 : (r.bancosProbabilidad || []).slice(0, 3);

  if (!bancosTop3 || bancosTop3.length === 0) return "";

  const mejorBanco = r.mejorBanco || bancosTop3[0];

  const filas = bancosTop3
    .map((b, idx) => {
      const nombre = b.banco || b.nombre || "Banco";

      let rawScore = null;
      if (isNum(b.probScore)) rawScore = b.probScore;
      else if (isNum(b.probPct)) rawScore = b.probPct;
      else if (isNum(b.probabilidad)) rawScore = b.probabilidad * 100;
      else if (isNum(b.prob)) rawScore = b.prob * 100;
      else if (isNum(b.score)) rawScore = b.score;

      const probScore = rawScore !== null ? Math.round(rawScore) : null;
      const probLabel = b.probLabel || "Media";

      const dtiBanco = isNum(b.dtiBanco) ? b.dtiBanco : null;
      const dtiTexto = dtiBanco !== null ? `${(dtiBanco * 100).toFixed(0)}%` : "—";

      const scoreTexto = probScore !== null ? `${probScore}%` : "—";
      const filaIdx = idx + 1;

      return `
        <tr>
          <td style="padding:4px 8px;font-size:12px;color:#e5e7eb;border-bottom:1px solid #1f2937;">
            ${filaIdx}. ${nombre}
          </td>
          <td style="padding:4px 8px;font-size:12px;color:#bfdbfe;border-bottom:1px solid #1f2937;text-align:center;">
            ${probLabel}${probScore !== null ? ` · ${scoreTexto}` : ""}
          </td>
          <td style="padding:4px 8px;font-size:12px;color:#9ca3af;border-bottom:1px solid #1f2937;text-align:center;">
            DTI ref.: ${dtiTexto}
          </td>
        </tr>
      `;
    })
    .join("");

  const mejorNombre = mejorBanco?.banco || mejorBanco?.nombre || "—";

  let mejorRaw = null;
  if (isNum(mejorBanco?.probScore)) mejorRaw = mejorBanco.probScore;
  else if (isNum(mejorBanco?.probPct)) mejorRaw = mejorBanco.probPct;
  else if (isNum(mejorBanco?.probabilidad)) mejorRaw = mejorBanco.probabilidad * 100;
  else if (isNum(mejorBanco?.prob)) mejorRaw = mejorBanco.prob * 100;
  else if (isNum(mejorBanco?.score)) mejorRaw = mejorBanco.score;

  const mejorScore = mejorRaw !== null ? `${Math.round(mejorRaw)}%` : "";
  const mejorLabel = mejorBanco?.probLabel || "";

  return `
    <div style="margin-top:12px;border-radius:16px;background:#020617;border:1px solid #1f2937;padding:10px 12px;">
      <div style="font-size:12px;font-weight:600;color:#93c5fd;margin-bottom:4px;">
        Ranking de probabilidad por banco (HabitaLibre)
      </div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:6px;">
        Mejor ajuste actual: <strong>${mejorNombre}</strong> (${mejorLabel}${mejorScore ? ` · ${mejorScore}` : ""}).
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
             style="border-collapse:collapse;">
        <tbody>
          ${filas}
        </tbody>
      </table>
    </div>
  `;
}

/* ===========================================================
   Bloque: ¿Por qué te recomendamos esta ruta? (cliente)
=========================================================== */
function renderPorQueRecomendado(resultado = {}) {
  const r = resultadoParaEmail(resultado);
  const sinOferta = r?.flags?.sinOferta === true;
  if (sinOferta) return "";

  const tipoRaw = r.productoSugerido || r.productoElegido || r.tipoCreditoElegido || "CRÉDITO";

  const cuotaNum = isNum(r.cuotaEstimada) ? r.cuotaEstimada : null;
  const capacidadNum = isNum(r.capacidadPago) ? r.capacidadPago : null;
  const dtiNum = isNum(r.dtiConHipoteca) ? r.dtiConHipoteca : null;
  const ltvNum = isNum(r.ltv) ? r.ltv : null;

  const cuotaTxt = cuotaNum != null ? money(cuotaNum) : "una cuota manejable";
  const capacidadTxt = capacidadNum != null ? money(capacidadNum) : "tu capacidad de pago mensual";

  const dtiTxt = dtiNum != null ? `${(dtiNum * 100).toFixed(0)}%` : null;
  const ltvTxt = ltvNum != null ? `${(ltvNum * 100).toFixed(0)}%` : null;

  const tipoLabelMap = {
    VIS: "crédito VIS (tasa preferencial)",
    VIP: "crédito VIP (tasa preferencial)",
    BIESS: "crédito BIESS",
    PRIVADA: "banca privada",
    "BANCA PRIVADA": "banca privada",
  };
  const tipoKey = String(tipoRaw || "").toUpperCase();
  const tipoLabel = tipoLabelMap[tipoKey] || `esta ruta de crédito`;

  const showDtiLtv = dtiTxt || ltvTxt;

  return `
    <div style="margin-top:10px;border-radius:14px;background:rgba(15,23,42,0.92);padding:10px 12px;border:1px solid rgba(59,130,246,0.45);">
      <div style="font-size:11px;font-weight:600;color:#bfdbfe;margin-bottom:4px;">
        ¿Por qué te recomendamos esta ruta?
      </div>
      <div style="font-size:11px;color:#e5e7eb;line-height:1.5;margin-bottom:4px;">
        Según tus ingresos, deudas y entrada, hoy la mejor combinación para ti es 
        <span style="font-weight:600;color:#a5b4fc;">${tipoLabel}</span>.
      </div>
      <ul style="margin:0;padding-left:16px;font-size:11px;color:#cbd5f5;line-height:1.45;">
        <li>La cuota estimada (${cuotaTxt}) se mantiene dentro de ${capacidadTxt}, sin sobreendeudarte.</li>
        ${
          showDtiLtv
            ? `<li>Tu endeudamiento total quedaría en torno a ${dtiTxt || "un porcentaje sano"} y el banco financiaría aprox. ${
                ltvTxt || "una parte razonable del valor de la vivienda"
              }.</li>`
            : ""
        }
        <li>Es donde vemos mejor ajuste entre lo que puedes pagar y lo que los bancos normalmente aprueban para perfiles como el tuyo.</li>
      </ul>
    </div>
  `;
}

/* ===========================================================
   HTML world-class para el CLIENTE
=========================================================== */
function htmlResumenCliente(lead = {}, resultadoRaw = {}) {
  const resultadoNorm = normalizeResultadoParaSalida(resultadoRaw);
  const resultado = resultadoParaEmail(resultadoNorm);
  const sinOferta = resultado?.flags?.sinOferta === true;

  const nombre = lead?.nombre?.split(" ")[0] || "¡Hola!";

  // ✅ Producto sólo si HAY oferta
  const productoBase = resultado?.productoSugerido || resultado?.productoElegido || "Crédito hipotecario";
  const producto = sinOferta ? "Perfil en construcción" : productoBase;

  const capacidad = money(resultado?.capacidadPago);
  const cuota = money(resultado?.cuotaEstimada);
  const stress = money(resultado?.cuotaStress);
  const ltv = pct(resultado?.ltv);
  const dti = pct(resultado?.dtiConHipoteca);
  const monto = money(resultado?.montoMaximo);
  const precio = money(resultado?.precioMaxVivienda);

  const codigoHL = lead?.codigoHL || resultado?.codigoHL || null;

  const pillLabel = sinOferta ? "Perfil en construcción" : "Precalificación aprobada";

  const introParrafo = sinOferta
    ? `Con la información que ingresaste, hoy no se identifica una oferta hipotecaria sostenible para ti ni para los bancos. Esto no es un “no” definitivo, es un “todavía no”. En el PDF adjunto verás qué fortalecer (ingresos, deudas y entrada) para que tu perfil se vuelva viable.`
    : `Con la información que ingresaste estimamos el rango de vivienda y de crédito que podrían aprobarte. En el PDF adjunto verás el detalle de tu simulación, stress test de tasa, tabla de amortización y un plan de acción para mejorar aún más tus probabilidades.`;

  const textoBajadaProducto = sinOferta
    ? `Hoy tu perfil aún está en construcción. En el PDF te mostramos un plan de acción concreto para acercarte a una hipoteca sostenible.`
    : `Con tu perfil actual puedes buscar vivienda hasta <span style="font-weight:600;color:#4ade80;">${precio}</span> aprox.`;

  const precioMostrar = sinOferta ? "—" : precio;
  const montoMostrar = sinOferta ? "—" : monto;

  // ✅ bancos / porqué sólo si HAY oferta
  const bloquePorQue = sinOferta ? "" : renderPorQueRecomendado(resultado);
  const bloqueBancos = sinOferta ? "" : renderTopBancosCliente(resultado);

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
                <div style="font-size:13px;color:#cbd5f5;margin-top:6px;max-width:520px;line-height:1.5;">
                  ${introParrafo}
                </div>
                ${
                  codigoHL
                    ? `<div style="font-size:11px;color:#a5b4fc;margin-top:8px;">
                        Código HabitaLibre para tu trámite: 
                        <span style="font-weight:600;color:#bfdbfe;">${codigoHL}</span><br/>
                        Si llevas este reporte a un banco, pide que registren este código como referencia HabitaLibre.
                       </div>`
                    : ""
                }
              </td>
            </tr>

            <tr>
              <td style="padding:0 16px 24px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                  style="border-radius:24px;background:radial-gradient(circle at 0 0,#4f46e5,#0f172a);padding:24px;box-shadow:0 20px 45px rgba(15,23,42,0.7);">
                  <tr>
                    <td style="color:#e5e7eb;font-size:14px;">

                      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;">
                        <div>
                          <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c7d2fe;margin-bottom:4px;">
                            ${pillLabel}
                          </div>
                          <div style="font-size:18px;font-weight:600;margin-bottom:4px;">${producto}</div>
                          <div style="font-size:13px;${sinOferta ? "color:#fee2e2" : "color:#bbf7d0"};max-width:360px;">
                            ${textoBajadaProducto}
                          </div>
                        </div>
                        <div style="padding:4px 10px;border-radius:999px;background:${
                          sinOferta ? "rgba(248,113,113,0.16)" : "rgba(34,197,94,0.16)"
                        };border:1px solid ${
                          sinOferta ? "rgba(248,113,113,0.5)" : "rgba(74,222,128,0.4)"
                        };font-size:11px;color:${
                          sinOferta ? "#fecaca" : "#bbf7d0"
                        };font-weight:500;">
                          ${sinOferta ? "Sin oferta viable hoy · perfil en ajuste" : "✔ Precalificación vigente según los datos ingresados"}
                        </div>
                      </div>

                      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
                        <div style="flex:1 1 180px;min-width:180px;border-radius:16px;background:rgba(15,23,42,0.75);padding:12px 14px;border:1px solid rgba(148,163,184,0.3);">
                          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.12em;">Precio máx. vivienda</div>
                          <div style="font-size:18px;font-weight:600;margin-top:4px;">${precioMostrar}</div>
                        </div>
                        <div style="flex:1 1 180px;min-width:180px;border-radius:16px;background:rgba(15,23,42,0.75);padding:12px 14px;border:1px solid rgba(148,163,184,0.3);">
                          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.12em;">Monto préstamo máx.</div>
                          <div style="font-size:18px;font-weight:600;margin-top:4px;">${montoMostrar}</div>
                        </div>
                      </div>

                      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
                        <div style="flex:1 1 180px;min-width:180px;border-radius:16px;background:rgba(15,23,42,0.85);padding:12px 14px;">
                          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.12em;">Cuota estimada</div>
                          <div style="font-size:18px;font-weight:600;margin-top:4px;">${cuota}</div>
                        </div>
                        <div style="flex:1 1 180px;min-width:180px;border-radius:16px;background:rgba(15,23,42,0.85);padding:12px 14px;">
                          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.12em;">Capacidad de pago</div>
                          <div style="font-size:18px;font-weight:600;margin-top:4px;">${capacidad}</div>
                        </div>
                      </div>

                      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:10px;">
                        <div style="flex:1 1 160px;min-width:160px;border-radius:14px;background:rgba(15,23,42,0.9);padding:10px 12px;">
                          <div style="font-size:11px;color:#9ca3af;">Stress (+2% tasa)</div>
                          <div style="font-size:14px;font-weight:500;margin-top:2px;">${stress}</div>
                        </div>
                        <div style="flex:1 1 140px;min-width:140px;border-radius:14px;background:rgba(15,23,42,0.9);padding:10px 12px;">
                          <div style="font-size:11px;color:#9ca3af;">LTV estimado</div>
                          <div style="font-size:14px;font-weight:500;margin-top:2px;">${ltv}</div>
                        </div>
                        <div style="flex:1 1 140px;min-width:140px;border-radius:14px;background:rgba(15,23,42,0.9);padding:10px 12px;">
                          <div style="font-size:11px;color:#9ca3af;">DTI con hipoteca</div>
                          <div style="font-size:14px;font-weight:500;margin-top:2px;">${dti}</div>
                        </div>
                      </div>

                      ${bloquePorQue}
                      ${bloqueBancos}

                      <div style="font-size:12px;color:#cbd5f5;margin-top:14px;line-height:1.5;">
                        Adjuntamos un reporte detallado en PDF con explicación de cada métrica, stress test de tasa,
                        tabla de amortización y un plan de acción para que sepas exactamente qué mejorar paso a paso.
                        <br/><br/>
                        Si lo deseas, podemos acompañarte a comparar bancos y preparar tu carpeta.
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

            <tr>
              <td style="padding:0 24px 24px 24px;font-size:11px;color:#94a3b8;">
                Este resultado es referencial y no constituye una oferta de crédito.
                Está sujeto a validación documental y a las políticas de cada entidad financiera.
              </td>
            </tr>

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
function htmlInterno(lead = {}, resultadoRaw = {}) {
  const resultadoNorm = normalizeResultadoParaSalida(resultadoRaw);
  const resultado = resultadoParaEmail(resultadoNorm);

  const sinOferta = resultado?.flags?.sinOferta === true;
  const producto = sinOferta
    ? "Perfil en construcción"
    : resultado?.productoSugerido || resultado?.productoElegido || "Crédito hipotecario";

  const codigoHL = lead?.codigoHL || resultado?.codigoHL || "—";
  const bloqueBancosInterno = renderTopBancosInterno(resultado);

  return `
  <div style="margin:0;padding:0;background:#0b1120;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0b1120;padding:20px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#020617;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
            <tr>
              <td style="padding:16px 24px 8px 24px;">
                <div style="font-size:13px;color:#93c5fd;margin-bottom:4px;">Nuevo lead capturado</div>
                <div style="font-size:20px;font-weight:600;">
                  ${lead?.nombre || "Cliente"} · ${producto}
                </div>
                <div style="font-size:12px;color:#a5b4fc;margin-top:4px;">
                  Código HabitaLibre: <strong>${codigoHL}</strong>
                </div>
                <div style="font-size:12px;color:#64748b;margin-top:4px;">
                  Origen: ${lead?.origen || "Simulador web"} · Canal: ${lead?.canal || "Web"}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:0 16px 12px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                  style="border-radius:20px;background:#020617;border:1px solid #1e293b;padding:16px;">
                  <tr>
                    <td style="font-size:13px;color:#e5e7eb;vertical-align:top;">
                      <div style="font-size:12px;font-weight:600;color:#9ca3af;margin-bottom:8px;">Datos de contacto</div>
                      <div><strong>Nombre:</strong> ${lead?.nombre || "—"}</div>
                      <div><strong>Email:</strong> ${lead?.email || "—"}</div>
                      <div><strong>Teléfono:</strong> ${lead?.telefono || "—"}</div>
                      <div><strong>Ciudad:</strong> ${lead?.ciudad || "—"}</div>
                      <div><strong>Código HL:</strong> ${codigoHL}</div>
                    </td>
                    <td width="32"></td>
                    <td style="font-size:13px;color:#e5e7eb;vertical-align:top;">
                      <div style="font-size:12px;font-weight:600;color:#9ca3af;margin-bottom:8px;">Resumen numérico</div>
                      <div><strong>Capacidad pago:</strong> ${money(resultado?.capacidadPago)}</div>
                      <div><strong>Cuota ref.:</strong> ${money(resultado?.cuotaEstimada)}</div>
                      <div><strong>Stress (+2%):</strong> ${money(resultado?.cuotaStress)}</div>
                      <div><strong>LTV:</strong> ${pct(resultado?.ltv)}</div>
                      <div><strong>DTI:</strong> ${pct(resultado?.dtiConHipoteca)}</div>
                      <div><strong>Monto máx.:</strong> ${money(resultado?.montoMaximo)}</div>
                      <div><strong>Sin oferta:</strong> ${sinOferta ? "Sí" : "No"}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 16px 12px 16px;">
                ${bloqueBancosInterno}
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
async function generarPDFBuffer(lead, resultadoRaw) {
  try {
    const resultadoNorm = normalizeResultadoParaSalida(resultadoRaw);
    const resultado = resultadoParaEmail(resultadoNorm);

    const codigoHL = lead?.codigoHL || resultado?.codigoHL || null;
    const leadConCodigo = codigoHL ? { ...lead, codigoHL } : lead;
    const resultadoConCodigo = codigoHL ? { ...resultado, codigoHL } : resultado;

    const buffer = await generarPDFLeadAvanzado(leadConCodigo, resultadoConCodigo);
    return buffer;
  } catch (err) {
    console.error("❌ Error generando PDF avanzado:", err);
    return null;
  }
}

/* ===========================================================
   💌 enviarCorreoCliente: correo al lead + PDF avanzado
=========================================================== */
export async function enviarCorreoCliente(lead, resultadoRaw) {
  if (!lead?.email) {
    console.warn("⚠️ enviarCorreoCliente: lead sin email, se omite envío.");
    return null;
  }

  const tx = getTransporter();

  const resultadoNorm = normalizeResultadoParaSalida(resultadoRaw);
  const resultado = resultadoParaEmail(resultadoNorm);

  const pdfBuffer = await generarPDFBuffer(lead, resultado);

  const info = await tx.sendMail({
    from: FINAL_FROM,
    to: lead.email,
    replyTo: FINAL_REPLY_TO,
    subject: "Tu precalificación HabitaLibre está lista 🏡",
    html: htmlResumenCliente(lead, resultado),
    text:
      "Gracias por usar el simulador de HabitaLibre. " +
      "Adjuntamos un PDF con el resumen detallado de tu precalificación.",
    attachments: pdfBuffer ? [{ filename: "HabitaLibre-precalificacion.pdf", content: pdfBuffer }] : [],
  });

  return info;
}

/* ===========================================================
   💌 enviarCorreoLead: correo interno al equipo + mismo PDF
=========================================================== */
export async function enviarCorreoLead(lead, resultadoRaw) {
  const tx = getTransporter();

  const resultadoNorm = normalizeResultadoParaSalida(resultadoRaw);
  const resultado = resultadoParaEmail(resultadoNorm);

  const pdfBuffer = await generarPDFBuffer(lead, resultado);

  const info = await tx.sendMail({
    from: FINAL_FROM,
    to: INTERNAL_RECIPIENTS.join(","),
    subject: `Nuevo lead: ${lead?.nombre || "Cliente"} (${lead?.canal || "—"})`,
    html: htmlInterno(lead, resultado),
    replyTo: lead?.email ? `"${lead?.nombre || "Cliente"}" <${lead.email}>` : undefined,
    attachments: pdfBuffer ? [{ filename: "HabitaLibre-precalificacion.pdf", content: pdfBuffer }] : [],
  });

  return info;
}
