import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

/**
 * HabitaLibre PDF — Reporte educativo y accionable (world-class)
 * - Números normalizados (sin NaN)
 * - Layout determinístico
 * - Chips, barras, tabla de amortización y sensibilidad de tasa
 * - Proyección a 5 años y plan de mejora
 */

// Ruta del logo (debe existir en el BACKEND: /public/LOGOHL.png)
const LOGO_PATH = path.join(process.cwd(), "public", "LOGOHL.png");

// ============== Helpers de formato ==============
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const toNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const toInt = (v, def = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);

const money = (n, d = 2) =>
  isNum(n)
    ? `$ ${Number(n).toLocaleString("es-EC", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      })}`
    : "—";

const pct = (p, d = 1) => (isNum(p) ? `${(p * 100).toFixed(d)}%` : "—");

const titleCase = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());

const safe = (s) => (s == null || String(s).trim() === "" ? "—" : String(s));

// ============== Finanzas ==============
function pmt(rate, nper, pv) {
  const r = toNum(rate, 0);
  const n = toInt(nper, 1);
  const P = toNum(pv, 0);
  if (r === 0) return P / n;
  return (P * r) / (1 - Math.pow(1 + r, -n));
}

function proyeccionCincoAnios(pv, rateMensual, cuota) {
  const r = toNum(rateMensual);
  const c = toNum(cuota);
  let saldo = toNum(pv);
  let intereses = 0;
  let capital = 0;
  const meses = Math.min(60, 600);
  for (let i = 0; i < meses && saldo > 0; i++) {
    const it = saldo * r;
    const cap = Math.max(0, c - it);
    intereses += it;
    capital += cap;
    saldo = Math.max(0, saldo - cap);
  }
  return { intereses, capital, saldo };
}

// ============== Paleta / medidas ==============
const brand = {
  // Fondo del topbar = mismo tono oscuro del logo
  primary: "#020617", // casi negro / slate muy oscuro
  // Acento turquesa del logo para links y detalles
  primaryDark: "#22d3ee",

  text: "#0f172a",
  mut: "#64748b",
  soft: "#94a3b8",
  chipBg: "#f1f5f9",
  stroke: "#e5e7eb",
  ok: "#10b981",
  warn: "#f59e0b",
  bad: "#ef4444",
  barBg: "#e5e7eb",
};

const M = 56; // margen

// ============== UI primitives ==============
function rule(doc) {
  const x = M;
  const y = doc.y + 8;
  const w = doc.page.width - M * 2;
  doc
    .save()
    .moveTo(x, y)
    .lineTo(x + w, y)
    .strokeColor(brand.stroke)
    .lineWidth(1)
    .stroke()
    .restore();
  doc.moveDown(0.6);
}

function sectionTitle(doc, text) {
  doc
    .fillColor(brand.text)
    .fontSize(14)
    .text(String(text), M, doc.y + 10, {
      underline: true,
      width: doc.page.width - M * 2,
    })
    .moveDown(0.3);
}

function chipAt(doc, x, y, label, value, w = 260, h = 54) {
  doc
    .save()
    .roundedRect(x, y, w, h, 10)
    .fillAndStroke(brand.chipBg, "#e2e8f0")
    .restore();
  doc
    .fillColor(brand.mut)
    .fontSize(9)
    .text(String(label).toUpperCase(), x + 12, y + 10);
  doc
    .fillColor(brand.text)
    .fontSize(15)
    .text(String(value), x + 12, y + 26, {
      width: w - 24,
      height: 20,
    });
      // 👇 Asegura que el cursor siempre quede después del chip
  doc.y = Math.max(doc.y, y + h + 2);
}

function barScore(doc, x, y, label, v01, hint, color) {
  const W = 360;
  const H = 10;
  const v = Math.max(0, Math.min(W, Math.round(clamp01(v01) * W)));
  doc.fillColor(brand.text).fontSize(11.5).text(label, x, y);
  const yb = y + 16;
  doc.save().roundedRect(x, yb, W, H, 5).fill(brand.barBg).restore();
  if (v > 0)
    doc.save().roundedRect(x, yb, v, H, 5).fill(color || brand.ok).restore();
  doc.fillColor(brand.mut).fontSize(10).text(hint, x, yb + 14, {
    width: W,
  });
}

function miniBar(doc, x, y, label, current, total, color = brand.primary) {
  const W = 380;
  const H = 10;
  const denom = Math.max(1, toNum(total));
  const ratio = Math.max(0, Math.min(1, toNum(current) / denom));
  const v = Math.round(ratio * W);
  doc.fillColor(brand.text).fontSize(11).text(label, x, y);
  const yb = y + 16;
  doc.save().roundedRect(x, yb, W, H, 5).fill(brand.barBg).restore();
  if (v > 0) doc.save().roundedRect(x, yb, v, H, 5).fill(color).restore();
}

// ============== Bancos recomendados (helpers nuevos) ==============
function getTopBancos(resultado = {}) {
  const rawTop =
    Array.isArray(resultado.bancosTop3) && resultado.bancosTop3.length
      ? resultado.bancosTop3
      : Array.isArray(resultado.bancosProbabilidad)
      ? resultado.bancosProbabilidad
      : [];

  const top = rawTop.slice(0, 3);
  let mejor = resultado.mejorBanco;
  if (!mejor && top.length) mejor = top[0];

  return { top, mejor };
}

function colorProbabilidad(label) {
  const t = String(label || "").toLowerCase();
  if (t.includes("alta")) return brand.ok;
  if (t.includes("media")) return brand.warn;
  if (t.includes("baja")) return brand.bad;
  return brand.primary;
}

// ============== Textos educativos ==============
const explLTV = (ltv) =>
  !isNum(ltv)
    ? "LTV = % financiado sobre el valor de la vivienda."
    : ltv <= 0.8
    ? "LTV saludable (≤80%): favorece tasa y aprobación."
    : ltv <= 0.9
    ? "LTV moderado (80–90%): sube tu entrada para mejorar condiciones."
    : "LTV alto (>90%): considera aumentar tu entrada.";

const explDTI = (dti) =>
  !isNum(dti)
    ? "DTI = deudas mensuales (incluida la hipoteca) / ingreso."
    : dti <= 0.35
    ? "DTI saludable (≤35%): buena señal."
    : dti <= 0.42
    ? "DTI aceptable (35–42%): controla otras deudas."
    : "DTI > 42%: reduce deudas o amplía plazo.";

const explTasa = (t) =>
  !isNum(t)
    ? "La tasa es el costo del crédito."
    : "La tasa mostrada es referencial; se aplicará cuando definas un monto y plazo de crédito viables.";

// ============== Portada / pie ==============
function portada(doc, lead, codigoHL) {
  // Franja superior full-width con color del logo
  const headerHeight = 90;
  doc
    .save()
    .rect(0, 0, doc.page.width, headerHeight)
    .fill(brand.primary)
    .restore();

  const hasLogo = fs.existsSync(LOGO_PATH);
  const W = doc.page.width - M * 2;

  if (hasLogo) {
    const logoWidth = 95;
    const logoX = M;
    const logoY = 14;

    doc.image(LOGO_PATH, logoX, logoY, {
      width: logoWidth,
    });

    doc
      .fillColor("#e5e7eb")
      .fontSize(11.5)
      .text(
        "Informe de Precalificación Hipotecaria",
        logoX + logoWidth + 18,
        logoY + 30,
        {
          width: doc.page.width - (logoX + logoWidth + 18) - M,
          align: "left",
        }
      );
  } else {
    console.warn("[HabitaLibre PDF] Logo no encontrado en:", LOGO_PATH);
    doc
      .fillColor("#fff")
      .fontSize(22)
      .text("HabitaLibre", M, 32, { continued: true });
    doc.fontSize(12).text("  •  Informe de Precalificación Hipotecaria");
  }

  // Línea sutil debajo del header para separar
  doc
    .moveTo(M, headerHeight)
    .lineTo(doc.page.width - M, headerHeight)
    .strokeColor("#111827")
    .lineWidth(0.7)
    .stroke();

  // Título principal
  doc
    .fillColor(brand.text)
    .fontSize(24)
    .text(
      "Tu guía para conseguir la mejor hipoteca según tu perfil",
      M,
      headerHeight + 22,
      {
        width: W,
      }
    )
    .moveDown(0.2);

  // Datos del cliente
  doc
    .fontSize(12)
    .fillColor(brand.mut)
    .text(`Cliente: ${titleCase(lead?.nombre || "—")}`, M)
    .text(`Email: ${safe(lead?.email)}`, M);

  if (codigoHL) {
    doc.text(`Código HabitaLibre: ${codigoHL}`, M);
  }

  doc.text(`Fecha: ${new Date().toLocaleString("es-EC")}`, M).moveDown(0.3);

  // Marca de versión visible
  doc
    .fontSize(10)
    .fillColor(brand.soft)
    .text("HabitaLibre – Reporte avanzado", M, doc.y, { width: W });

  rule(doc);
}

function pie(doc, codigoHL) {
  const footerHeight = 45; // espacio aproximado que usa el texto (ajustable)
  const usableBottom = doc.page.height - M; // límite inferior "seguro"

  // Si ya estoy muy abajo, mejor abrir una página nueva ANTES del footer
  if (doc.y > usableBottom - footerHeight) {
    doc.addPage();
  }

  // Posicionamos el pie cerca del fondo, pero con margen suficiente
  const y = usableBottom - footerHeight + 8;

  doc
    .fontSize(9.5)
    .fillColor(brand.soft)
    .text(
      "Este reporte es referencial y no constituye oferta de crédito. Sujeto a validación documental y políticas de cada entidad.",
      M,
      y,
      { width: doc.page.width - M * 2, align: "center" }
    );

  if (codigoHL) {
    doc
      .moveDown(0.2)
      .fontSize(9)
      .fillColor(brand.mut)
      .text(
        `Si presentas este informe en un banco o cooperativa aliada, menciona tu Código HabitaLibre: ${codigoHL}.`,
        M,
        doc.y,
        { width: doc.page.width - M * 2, align: "center" }
      );
  }
}

// ============== Puntaje global ==============
function puntajeGlobal({ ltv, dtiConHipoteca, tasaAnual }) {
  let score = 100;
  if (isNum(ltv)) {
    if (ltv > 0.9) score -= 25;
    else if (ltv > 0.8) score -= 10;
  }
  if (isNum(dtiConHipoteca)) {
    if (dtiConHipoteca > 0.45) score -= 30;
    else if (dtiConHipoteca > 0.42) score -= 15;
    else if (dtiConHipoteca > 0.35) score -= 5;
  }
  if (isNum(tasaAnual)) {
    if (tasaAnual > 0.12) score -= 20;
    else if (tasaAnual > 0.09) score -= 8;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ============== Recomendaciones ==============
function planMejora(R) {
  const tips = [];
  if (isNum(R.ltv) && R.ltv > 0.9)
    tips.push("Aumenta tu entrada para bajar el LTV a ≤ 80%.");
  if (isNum(R.dtiConHipoteca) && R.dtiConHipoteca > 0.42)
    tips.push("Reduce otras deudas para llevar el DTI por debajo de 42%.");
  if (
    isNum(R.cuotaStress) &&
    isNum(R.capacidadPago) &&
    R.cuotaStress > R.capacidadPago
  )
    tips.push(
      "Si la tasa sube +2%, tu cuota supera tu capacidad; amplía plazo o suma ingreso familiar."
    );
  if (!tips.length)
    tips.push(
      "Perfil sólido: negocia tasa preferencial y solicita pre-aprobación."
    );
  return tips;
}

// Plan de acción específico cuando no hay oferta viable
function planMejoraSinOferta(R = {}) {
  const tips = [];

  const ingresoTotal = toNum(R.ingresoTotal, 0);
  const dtiCon = toNum(R.dtiConHipoteca, 0);
  const valorVivienda = toNum(R.valorVivienda, 0);
  const entrada = toNum(R.entradaDisponible, 0);
  const ratioEntrada = valorVivienda > 0 ? entrada / valorVivienda : 0;

  const ingresoStr = ingresoTotal
    ? money(ingresoTotal, 0)
    : "tu ingreso actual";

  const ingresoBajo = ingresoTotal > 0 && ingresoTotal < 800; // referencia VIS
  const dtiAlto = dtiCon > 0.45;
  const entradaBaja = ratioEntrada < 0.1; // < 10 % de entrada

  // Mensaje marco
  tips.push(
    "Con tus ingresos y deudas actuales, un crédito hipotecario no sería sostenible ni para ti ni para los bancos. Esto no es un 'no' definitivo, es un 'todavía no'."
  );

  tips.push(
    `Hoy tu ingreso familiar aproximado está alrededor de ${ingresoStr}. El reto principal es ajustar la combinación entre ingreso, deudas y entrada para que una cuota hipotecaria sea sostenible.`
  );

  // 1) Ingreso
  if (ingresoBajo) {
    const metaIngreso = Math.max(800, Math.round(ingresoTotal * 1.2));
    tips.push(
      `Con un ingreso en ese rango es difícil que un banco vea margen para una cuota. Un objetivo razonable sería acercarte al menos a ${money(
        metaIngreso,
        0
      )} de ingreso familiar neto, manteniendo tus deudas de consumo bajo control.`
    );
  }

  // 2) Deudas / DTI
  if (dtiAlto && ingresoTotal > 0) {
    const gapUSD = Math.ceil((dtiCon - 0.42) * ingresoTotal);
    tips.push(
      `Hoy tus deudas de consumo pesan demasiado en tu presupuesto (DTI alto). Como referencia, reducir tus deudas en alrededor de ${money(
        gapUSD,
        0
      )} al mes (pagando saldos o cancelando obligaciones) te acercaría a un nivel de endeudamiento más sano para una hipoteca.`
    );
  } else {
    tips.push(
      "Evita tomar nuevas deudas de consumo y prioriza pagar las que ya tienes para liberar capacidad de pago."
    );
  }

  // 3) Entrada / ahorro
  if (entradaBaja && valorVivienda > 0) {
    const entrada20 = Math.round(valorVivienda * 0.2);
    const extraDown = Math.max(0, entrada20 - entrada);
    if (extraDown > 0) {
      tips.push(
        `Tu entrada hoy es muy ajustada para el valor de vivienda que buscas. Un objetivo práctico sería acumular al menos ${money(
          extraDown,
          0
        )} adicionales para acercarte a una entrada del 20 % sobre ese tipo de vivienda.`
      );
    }
  } else {
    tips.push(
      "Mantén un plan de ahorro para entrada, aunque sea pequeño y constante. Acercarte a una entrada del 20 % mejora mucho las condiciones de tasa y aprobación."
    );
  }

  // 4) Formalización
  tips.push(
    "Formaliza tus ingresos (roles de pago claros o RUC/declaraciones e historial bancario ordenado). La forma en que demuestras tu ingreso pesa tanto como el monto."
  );

  return tips;
}

// Plan de acción cuando el ingreso no está formalizado (Independiente/Mixto sin sustento)
function planMejoraSinSustento(R) {
  const tips = [];
  const ingresoTotal = toNum(R.ingresoTotal, 0);

  tips.push(
    "Tus ingresos actuales pueden ser suficientes para pensar en una hipoteca, pero hoy los bancos no pueden contarlos como ingresos formales."
  );

  if (ingresoTotal > 0) {
    tips.push(
      `Tu ingreso familiar estimado está alrededor de ${money(
        ingresoTotal,
        0
      )}. El problema no es el monto, sino que no está formalizado de una forma que el banco pueda usar.`
    );
  }

  tips.push(
    "Define tu camino principal: seguir como empleado (contrato + roles de pago) o como independiente (RUC, facturas y declaraciones de impuestos)."
  );

  tips.push(
    "Empieza a bancarizar tus ingresos: cobra la mayoría de tus pagos en 1–2 cuentas bancarias a tu nombre. Los bancos analizan tu historial de movimientos reales, no solo lo que declaras en el formulario."
  );

  tips.push(
    "Mantén un historial estable por al menos 9–12 meses con ingresos formales (roles o facturación constante) antes de volver a aplicar. Eso puede cambiar por completo la respuesta del banco."
  );

  tips.push(
    "Evita nuevas deudas y reduce las que ya tienes para mostrar una capacidad de pago limpia y predecible."
  );

  tips.push(
    "En paralelo, arma un plan de ahorro para tu entrada (por ejemplo USD 3.000–5.000). Llegar con ahorros + ingresos formalizados te pone en una posición muy fuerte frente a los bancos."
  );

  return tips;
}

// === drawAmortTable ===
function drawAmortTable(doc, rows) {
  const startX = M;
  const colW = [60, 110, 110, 110, 130]; // Mes, Cuota, Interés, Capital, Saldo
  const lineH = 18;

  function drawHeader(y) {
    doc.fillColor(brand.mut).fontSize(11);
    ["Mes", "Cuota", "Interés", "Capital", "Saldo"].forEach((h, i) => {
      const x = startX + colW.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(h, x, y, { width: colW[i] });
    });
  }

  let y = doc.y + 4;
  if (y > doc.page.height - M - 120) {
    doc.addPage();
    y = M;
  }
  drawHeader(y);
  y += lineH;

  doc.fillColor(brand.text).fontSize(11);
  rows.forEach((r) => {
    if (y > doc.page.height - M - 40) {
      doc.addPage();
      y = M;
      drawHeader(y);
      y += lineH;
    }
    const cells = [
      r.mes,
      money(r.cuota, 2),
      money(r.interes, 2),
      money(r.capital, 2),
      money(r.saldo, 2),
    ];
    cells.forEach((c, i) => {
      const x = startX + colW.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(String(c), x, y, { width: colW[i] });
    });
    y += lineH;
  });

  doc.y = y + 6;
}

// ============== Generador principal ==============
export async function generarPDFLead(lead = {}, resultado = {}) {
  console.log(
    "📄 [PDF v2] Generando PDF AVANZADO para:",
    lead?.email || lead?.nombre || "sin-identificar"
  );
 const echo = resultado?._echo || {};

  // Código único HabitaLibre para tracking (si no viene, puedes generarlo antes)
  const codigoHL =
    resultado?.codigoHL ||
    lead?.codigoHL ||
    lead?.codigoHabitaLibre ||
    resultado?.idHL ||
    lead?._id ||
    null;

  // Normalizar entrada
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
    productoElegido:
      resultado?.productoElegido ?? resultado?.tipoCreditoElegido ?? null,
    valorVivienda: toNum(resultado?.valorVivienda, null),
    entradaDisponible: toNum(resultado?.entradaDisponible, null),
    requeridos: resultado?.requeridos || {},
    bounds: resultado?.bounds || {},
    flags: resultado?.flags || {},
    escenarios: resultado?.escenarios || {},     // 👈 NUEVO
    // nuevo: ingreso total para plan de acción
    ingresoTotal: toNum(resultado?.perfil?.ingresoTotal, null),
  };


  // ==== Bancos recomendados (nuevo bloque de datos) ====
  const { top: bancosTop, mejor: mejorBanco } = getTopBancos(resultado || {});

  // ===== Lógica de plazo recortado por edad (para bloque explicativo) =====
  const edadCliente = resultado?.perfil?.edad || 0;
  const producto = (resultado?.productoElegido || "").toLowerCase();
  const plazoRecomendadoMeses = resultado?.plazoMeses || 0;

  // Plazo "normal" por tipo de producto
  const PLAZO_DEFAULT = {
    vis: 240,
    vip: 300,
    "biess preferencial": 300,
    biess: 300,
    comercial: 240,
  };

  const plazoDefaultProducto =
    PLAZO_DEFAULT[producto] || plazoRecomendadoMeses || 0;

  // Límite máximo por edad: que no pase de 75 años al vencimiento
  const maxPlazoPorEdadMeses = Math.max(0, (75 - edadCliente) * 12);

  const recortadoPorEdad =
    edadCliente > 0 &&
    plazoRecomendadoMeses > 0 &&
    plazoDefaultProducto > 0 &&
    maxPlazoPorEdadMeses < plazoDefaultProducto - 0.5 &&
    plazoRecomendadoMeses <= maxPlazoPorEdadMeses + 0.5;

  const plazoRecomendadoAnios =
    plazoRecomendadoMeses > 0
      ? (plazoRecomendadoMeses / 12).toFixed(0)
      : null;

  // Flag principal: sin oferta viable hoy
    const flagSinOferta = resultado?.flags?.sinOferta;

  // Flag principal: sin oferta viable hoy (reglas más realistas)
  const sinOferta =
    typeof flagSinOferta === "boolean"
      ? flagSinOferta
      : !isNum(R.montoMaximo) ||
        R.montoMaximo <= 0 ||
        !isNum(R.precioMaxVivienda) ||
        R.precioMaxVivienda <= 0 ||
        // DTI muy alto
        (isNum(R.dtiConHipoteca) && R.dtiConHipoteca > 0.5) ||
        // Cuota > capacidad de pago
        (isNum(R.cuotaEstimada) &&
          isNum(R.capacidadPago) &&
          R.cuotaEstimada > R.capacidadPago) ||
        // LTV demasiado alto
        (isNum(R.ltv) && R.ltv > 0.9);

  // Crear PDF
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: M, bottom: M, left: M, right: M },
    info: {
      Title: `Precalificación HabitaLibre - ${
        lead?.nombre || "Cliente"
      }${codigoHL ? ` (${codigoHL})` : ""}`,
      Author: "HabitaLibre",
      Producer: "HabitaLibre PDF Engine",
    },
  });

  // Mantener cursor consistente al agregar página
  doc.on("pageAdded", () => {
    doc.x = M;
    doc.y = M;
  });

  const chunks = [];
  const pdfDone = new Promise((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Portada
  portada(doc, lead, codigoHL);

  const W = doc.page.width - M * 2;

  // ========= NUEVA SECCIÓN: Recomendación patrimonial estratégica =========
  sectionTitle(doc, "Recomendación patrimonial estratégica");

  try {
    const precioMax = isNum(R.precioMaxVivienda) ? R.precioMaxVivienda : null;

    if (sinOferta) {
      doc
        .fontSize(12)
        .fillColor(brand.text)
        .text(
          "Hoy, con tus ingresos, deudas y el valor de vivienda ingresado, ningún tipo de crédito hipotecario resulta sostenible. Esto no significa que no puedas tener casa propia, sino que tu perfil aún está en construcción.",
          M,
          doc.y,
          { width: W }
        )
        .moveDown(0.4);

      doc
        .fontSize(11.5)
        .fillColor(brand.mut)
        .text(
          "En este escenario la prioridad no es escoger un banco, sino reforzar tu capacidad de pago, estabilidad laboral y nivel de ahorro. En las siguientes secciones encontrarás un plan de acción concreto para avanzar.",
          M,
          doc.y,
          { width: W }
        )
        .moveDown(0.6);

      rule(doc);
    } else if (precioMax && precioMax > 0) {
      const rangoMin = Math.round(precioMax * 0.9);
      const rangoMax = Math.round(precioMax);

      doc
        .fontSize(12)
        .fillColor(brand.text)
        .text(
          "Tus números no solo cuentan una historia financiera:",
          M,
          doc.y,
          { width: W }
        )
        .moveDown(0.2);

      doc
        .fontSize(12)
        .fillColor(brand.primaryDark)
        .text("revelan tu potencial patrimonial real.", M, doc.y, {
          width: W,
        })
        .moveDown(0.8);

      doc
        .fontSize(12.5)
        .fillColor(brand.text)
        .text("🎯 Rango recomendado de vivienda:", M, doc.y);

      doc
        .fontSize(16)
        .fillColor(brand.primaryDark)
        .text(
          `USD ${rangoMin.toLocaleString(
            "es-EC"
          )} — USD ${rangoMax.toLocaleString("es-EC")}`,
          M,
          doc.y + 6,
          { width: W }
        )
        .moveDown(1);

      doc.fontSize(11.5).fillColor(brand.text);
      doc.text(
        "1) Protege tu liquidez: este rango te permite avanzar con seguridad sin comprometer tu estabilidad futura.",
        M,
        doc.y,
        { width: W }
      );
      doc.moveDown(0.3);
      doc.text(
        "2) Mantiene tus métricas (LTV y DTI) en zonas estables que los bancos consideran de bajo riesgo.",
        M,
        doc.y,
        { width: W }
      );
      doc.moveDown(0.3);
      doc.text(
        "3) Minimiza riesgos de avalúo y evita diferencias que debas cubrir de tu bolsillo.",
        M,
        doc.y,
        { width: W }
      );
      doc.moveDown(0.3);
      doc.text(
        "4) Te posiciona en modo “negociador”: las entidades están más dispuestas a competir por un perfil como el tuyo.",
        M,
        doc.y,
        { width: W }
      );
      doc.moveDown(0.8);

      // Ajustes que mejorarían el perfil (usa resultado.requeridos)
      const needs = R?.requeridos || {};
      if (
        (isNum(needs.downTo80) && needs.downTo80 > 0) ||
        (isNum(needs.downTo90) && needs.downTo90 > 0)
      ) {
        sectionTitle(doc, "Ajustes que mejorarían tu perfil");

        if (isNum(needs.downTo80) && needs.downTo80 > 0) {
          doc
            .fontSize(11.5)
            .fillColor(brand.text)
            .text(
              `• Para llegar a un LTV ≤ 80% (tasa preferencial), necesitarías aprox. USD ${needs.downTo80.toLocaleString(
                "es-EC"
              )} adicionales.`,
              M,
              doc.y,
              { width: W }
            );
          doc.moveDown(0.3);
        }

        if (isNum(needs.downTo90) && needs.downTo90 > 0) {
          doc
            .fontSize(11.5)
            .fillColor(brand.text)
            .text(
              `• Para LTV ≤ 90% (nivel recomendado), requerirías aprox. USD ${needs.downTo90.toLocaleString(
                "es-EC"
              )}.`,
              M,
              doc.y,
              { width: W }
            );
          doc.moveDown(0.3);
        }
      }

      doc.moveDown(0.5);
      doc
        .fontSize(11.5)
        .fillColor(brand.primaryDark)
        .text(
          "Tu meta no es endeudarte: es construir patrimonio.",
          M,
          doc.y,
          { width: W }
        );
      doc
        .fontSize(11)
        .fillColor(brand.mut)
        .text(
          "Este rango es donde tu perfil financiero brilla y donde tomas la mejor decisión.",
          M,
          doc.y + 2,
          { width: W }
        );

      rule(doc);
    } else {
      doc
        .fontSize(11.5)
        .fillColor(brand.mut)
        .text(
          "Una vez que completes los datos de ingreso, deudas y vivienda, podrá mostrarse tu recomendación patrimonial personalizada.",
          M,
          doc.y,
          { width: W }
        )
        .moveDown(0.6);
      rule(doc);
    }
  } catch (err) {
    console.error("Error en bloque patrimonial del PDF:", err);
    doc
      .fontSize(11)
      .fillColor(brand.bad)
      .text(
        "No se pudo generar la sección de recomendación patrimonial.",
        M,
        doc.y
      );
    rule(doc);
  }

  // ========= Resumen ejecutivo =========
  sectionTitle(doc, "Resumen ejecutivo");
  const gap = 20;
  const colW = Math.floor((W - gap) / 2);
  const chipW = Math.min(260, colW);
  const chipH = 54;
  let x = M;
  let y = doc.y + 6;

  // 👇 Asegurarnos de que el bloque completo de 3 filas de chips quepa en la página
const alturaBloqueChips = chipH * 3 + 40; // 3 filas + algo de respiro
const limiteInferior = doc.page.height - M - 40; // margen de seguridad sobre el pie

if (y + alturaBloqueChips > limiteInferior) {
  doc.addPage();
  x = M;
  y = doc.y + 6;
}


  chipAt(
    doc,
    x,
    y,
    "Capacidad de pago (est.)",
    isNum(R.capacidadPago) ? money(R.capacidadPago, 0) : "—",
    chipW,
    chipH
  );
  chipAt(
    doc,
    x + chipW + gap,
    y,
    "Monto máximo (est.)",
    sinOferta || !isNum(R.montoMaximo) || R.montoMaximo <= 0
      ? "—"
      : money(R.montoMaximo, 0),
    chipW,
    chipH
  );
  y += chipH + 10;
  chipAt(
    doc,
    x,
    y,
    "Tasa referencial",
    isNum(R.tasaAnual) ? pct(R.tasaAnual, 2) : "—",
    chipW,
    chipH
  );
  chipAt(
    doc,
    x + chipW + gap,
    y,
    "Plazo recomendado",
    isNum(R.plazoMeses) ? `${Math.round(R.plazoMeses / 12)} años` : "—",
    chipW,
    chipH
  );
  y += chipH + 10;
  chipAt(
    doc,
    x,
    y,
    "LTV",
    sinOferta || !isNum(R.ltv) || R.ltv <= 0 ? "—" : pct(R.ltv, 1),
    chipW,
    chipH
  );
  chipAt(
    doc,
    x + chipW + gap,
    y,
    "Precio máx. de vivienda",
    sinOferta || !isNum(R.precioMaxVivienda) || R.precioMaxVivienda <= 0
      ? "—"
      : money(R.precioMaxVivienda, 0),
    chipW,
    chipH
  );

  if (sinOferta) {
    doc
      .fontSize(11.5)
      .fillColor(brand.text)
      .text(
        "Según tu perfil actual, hoy no se identifica una oferta hipotecaria viable. Usa este reporte como guía para fortalecer tu perfil y entender qué metas de ingreso, deuda y ahorro necesitas alcanzar.",
        M,
        y + chipH + 12,
        { width: W }
      );
  } else {
    const tipo = nombreProducto(R);
    doc
      .fontSize(11.5)
      .fillColor(brand.text)
      .text(
        `Según tu perfil actual, tu mejor ruta luce como: ${tipo}. Usa este reporte para negociar condiciones y acelerar tu aprobación.`,
        M,
        y + chipH + 12,
        { width: W }
      );
  }
  rule(doc);

  // ========= Score hipotecario + puntaje global =========
  sectionTitle(doc, "Tu “score hipotecario”");
  const scoreX = M;
  let scoreY = doc.y + 4;

  // Normalizaciones de score
  let sLTV = 0.5;
  if (isNum(R.ltv) && R.ltv > 0) {
    if (R.ltv <= 0.8) sLTV = 1;
    else if (R.ltv >= 1) sLTV = 0;
    else sLTV = Math.max(0, 1 - (R.ltv - 0.8) / 0.2);
  }
  let sDTI = 0.5;
  if (isNum(R.dtiConHipoteca) && R.dtiConHipoteca > 0) {
    if (R.dtiConHipoteca <= 0.35) sDTI = 1;
    else if (R.dtiConHipoteca >= 0.5) sDTI = 0;
    else sDTI = Math.max(0, 1 - (R.dtiConHipoteca - 0.35) / 0.15);
  }
  let sTasa = 0.5;
  if (isNum(R.tasaAnual) && R.tasaAnual > 0) {
    if (R.tasaAnual <= 0.055) sTasa = 1;
    else if (R.tasaAnual >= 0.12) sTasa = 0;
    else sTasa = Math.max(0, 1 - (R.tasaAnual - 0.055) / (0.12 - 0.055));
  }

  const colorL = sLTV >= 0.8 ? brand.ok : sLTV >= 0.5 ? brand.warn : brand.bad;
  const colorD = sDTI >= 0.8 ? brand.ok : sDTI >= 0.5 ? brand.warn : brand.bad;
  const colorT = sTasa >= 0.8 ? brand.ok : sTasa >= 0.5 ? brand.warn : brand.bad;

  const hintL = sinOferta
    ? "Aún no hay crédito asignado; el LTV se definirá cuando tu capacidad alcance una vivienda específica."
    : explLTV(R.ltv);
  const hintD = sinOferta
    ? "Hoy tus ingresos y deudas no permiten una cuota hipotecaria sostenible. Tu primer objetivo es reforzar la capacidad de pago."
    : explDTI(R.dtiConHipoteca);

  const ltvLabel =
    sinOferta || !isNum(R.ltv) || R.ltv <= 0 ? "LTV" : `LTV (${pct(R.ltv, 1)})`;
  const dtiLabel =
    sinOferta || !isNum(R.dtiConHipoteca) || R.dtiConHipoteca <= 0
      ? "DTI"
      : `DTI (${pct(R.dtiConHipoteca, 1)})`;

  barScore(doc, scoreX, scoreY, ltvLabel, sLTV, hintL, colorL);
  scoreY = doc.y + 4;
  barScore(doc, scoreX, scoreY, dtiLabel, sDTI, hintD, colorD);
  scoreY = doc.y + 4;
  barScore(
    doc,
    scoreX,
    scoreY,
    `Tasa ${isNum(R.tasaAnual) ? `(${(R.tasaAnual * 100).toFixed(2)}%)` : ""}`,
    sTasa,
    explTasa(R.tasaAnual),
    colorT
  );

  // Termómetro/puntaje global
  const scoreRaw = puntajeGlobal(R); // 0..100
  const score = sinOferta ? Math.min(scoreRaw, 40) : scoreRaw;
  const termW = 360;
  const termFill = Math.round((score / 100) * termW);
  const termColor =
    score >= 80 ? brand.ok : score >= 60 ? brand.warn : brand.bad;
  const yTherm = doc.y + 10;
  const scoreLabel = sinOferta
    ? `Puntaje global HabitaLibre: ${score}/100 (perfil en construcción)`
    : `Puntaje global HabitaLibre: ${score}/100`;

  doc.fillColor(brand.text).fontSize(11.5).text(scoreLabel, scoreX, yTherm);
  const yb = yTherm + 16;
  doc.save().roundedRect(scoreX, yb, termW, 10, 5).fill(brand.barBg).restore();
  if (termFill > 0)
    doc
      .save()
      .roundedRect(scoreX, yb, termFill, 10, 5)
      .fill(termColor)
      .restore();

  doc.moveDown(0.2);
  rule(doc);

  // ========= Glosario esencial =========
  sectionTitle(doc, "Qué significa cada métrica");
  doc.fontSize(11).fillColor(brand.text);
  doc.text(
    "LTV (Loan-to-Value): Porcentaje del valor que financias. Menor LTV = mejor tasa y mayor probabilidad de aprobación.",
    M
  );
  doc.text(
    "DTI (Debt-to-Income): Deudas mensuales (incluida la hipoteca) / ingreso. Mantenerlo bajo indica solvencia.",
    M
  );
  doc.text(
    "Tasa referencial: Costo anual del crédito. Puede variar por producto y perfil.",
    M
  );
  doc.text(
    "Plazo: Número de años para pagar. Más plazo, menor cuota (pero mayor costo total).",
    M
  );
  if (isNum(R.plazoMeses))
    doc
      .fillColor(brand.mut)
      .text(
        `~${Math.round(R.plazoMeses / 12)} años: balance cuota/costo total.`,
        M
      );
  rule(doc);

  // ========= Plan de acción recomendado =========
  sectionTitle(doc, "Plan de acción recomendado");

  let tips;
  if (resultado?.flags?.sinSustento) {
    tips = planMejoraSinSustento(R);
  } else if (sinOferta) {
    tips = planMejoraSinOferta(R);
  } else {
    tips = planMejora(R);
  }

  doc.fillColor(brand.text).fontSize(11);
  tips.forEach((t) => doc.text(`• ${t}`, M, doc.y, { width: W }));
  doc.moveDown(0.6);

  // ⚠️ Bloque extra cuando el plazo está limitado por edad
  if (recortadoPorEdad && plazoRecomendadoAnios) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#b91c1c") // rojo sobrio
      .text("Importante por tu edad", { continued: false });

    doc.moveDown(0.15);

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#374151")
      .text(
        `Por tu edad actual, la mayoría de bancos limitarán el plazo máximo a unos ${plazoRecomendadoAnios} años. ` +
          "Eso hace que la cuota sea más alta que en un crédito a 15–20 años. " +
          "Si participara un garante más joven, algunas entidades podrían ampliar el plazo y reducir la cuota mensual."
      );

    doc.moveDown(0.4);
  }

  // ========= NUEVA SECCIÓN: Dónde tienes más probabilidad de aprobación =========
  if (bancosTop && bancosTop.length) {
    sectionTitle(doc, "Dónde tienes más probabilidad de aprobación");

    const mejorNombre =
      mejorBanco?.banco || mejorBanco?.nombre || "la entidad con mejor ajuste";
    const mejorLabel = mejorBanco?.probLabel || "Probabilidad media";
    const mejorScore = isNum(mejorBanco?.probScore)
      ? `${mejorBanco.probScore}%`
      : "";

    const textoIntro = sinOferta
      ? "Aunque hoy tu perfil aún está en construcción, con la información que ingresaste podemos estimar en qué tipo de entidades tendrás mejor encaje cuando fortalezcas tu capacidad de pago."
      : "Con tu perfil actual, estas son las entidades donde, en principio, tienes mejor probabilidad de encajar. Úsalas como guía para priorizar tu trámite.";

    doc
      .fontSize(11.5)
      .fillColor(brand.text)
      .text(textoIntro, M, doc.y, { width: W })
      .moveDown(0.4);

    doc
      .fontSize(11)
      .fillColor(brand.primaryDark)
      .text(
        `Mejor ajuste estimado: ${mejorNombre} (${mejorLabel}${
          mejorScore ? ` · ${mejorScore}` : ""
        })`,
        M,
        doc.y,
        { width: W }
      )
      .moveDown(0.6);

    let yB = doc.y;
    bancosTop.forEach((b, idx) => {
      if (yB > doc.page.height - M - 40) {
        doc.addPage();
        yB = M;
      }

      const nombre = b.banco || b.nombre || "Banco";
      const probScore = isNum(b.probScore) ? b.probScore : null;
      const probLabel = b.probLabel || "";
      const tipoProducto = b.tipoProducto || "";
      const labelLinea = `${idx + 1}. ${nombre}${
        tipoProducto ? ` · ${tipoProducto}` : ""
      }`;
      const color = colorProbabilidad(probLabel);

      miniBar(
        doc,
        M,
        yB,
        labelLinea,
        probScore != null ? probScore : 0,
        100,
        color
      );
      yB = doc.y + 4;

      if (probLabel || probScore != null) {
        doc
          .fontSize(9.5)
          .fillColor(brand.mut)
          .text(
            `Probabilidad estimada: ${
              probLabel || "Media"
            }${probScore != null ? ` · ${probScore}%` : ""}`,
            M,
            yB,
            { width: W }
          );
        yB = doc.y + 6;
      }
    });

    doc.y = yB + 2;

    doc
      .fontSize(9.5)
      .fillColor(brand.soft)
      .text(
        "Estas probabilidades son referenciales y se basan en tu perfil + políticas promedio de cada tipo de entidad. La decisión final siempre la toma el banco o cooperativa.",
        M,
        doc.y,
        { width: W }
      );

    rule(doc);
  }

  // ========= Stress de tasa =========
  sectionTitle(doc, "¿Qué pasa si sube la tasa? (stress +1% / +2% / +3%)");

  if (
    !sinOferta &&
    isNum(R.montoMaximo) &&
    R.montoMaximo > 0 &&
    isNum(R.tasaAnual) &&
    isNum(R.plazoMeses)
  ) {
    const W2 = doc.page.width - M * 2;
    const barW = Math.min(380, W2 - 40);
    const barH = 10;
    const x0 = M;
    let y0 = doc.y + 2;

    const r0 = R.tasaAnual / 12;
    const c0 = pmt(r0, R.plazoMeses, R.montoMaximo);
    const totIntBase = c0 * R.plazoMeses - R.montoMaximo;

    // Etiqueta base
    doc
      .fontSize(11.5)
      .fillColor(brand.text)
      .text(`Base — cuota ${money(c0, 2)}`, x0, y0, { width: W2 });
    y0 += 16;
    // Barra base
    doc.save().roundedRect(x0, y0, barW, barH, 5).fill(brand.barBg).restore();
    const baseFill = Math.round((totIntBase / (totIntBase * 1.25)) * barW);
    if (baseFill > 0)
      doc
        .save()
        .roundedRect(x0, y0, baseFill, barH, 5)
        .fill(brand.primary)
        .restore();
    y0 += 24;

    const deltas = [0.01, 0.02, 0.03];
    deltas.forEach((d) => {
      if (y0 > doc.page.height - M - 40) {
        doc.addPage();
        y0 = M;
      }

      const r = (R.tasaAnual + d) / 12;
      const c = pmt(r, R.plazoMeses, R.montoMaximo);
      const totInt = c * R.plazoMeses - R.montoMaximo;

      doc
        .fontSize(11.5)
        .fillColor(brand.text)
        .text(
          `+${Math.round(d * 100)}% — cuota ${money(c, 2)}`,
          x0,
          y0,
          { width: W2 }
        );
      y0 += 16;

      doc.save().roundedRect(x0, y0, barW, barH, 5).fill(brand.barBg).restore();
      const fill = Math.max(
        0,
        Math.min(
          barW,
          Math.round((totInt / (totIntBase * 1.25)) * barW)
        )
      );
      if (fill > 0)
        doc
          .save()
          .roundedRect(x0, y0, fill, barH, 5)
          .fill(brand.primaryDark)
          .restore();
      y0 += 24;
    });

    doc.y = y0 + 2;
  } else {
    doc
      .fillColor(brand.mut)
      .fontSize(11)
      .text(
        "Cuando tu perfil alcance un monto de crédito viable, aquí verás cómo cambiaría tu cuota si la tasa sube.",
        M
      );
  }
  rule(doc);

  // ========= Amortización 12 meses + Proyección 5 años =========
  if (
    !sinOferta &&
    isNum(R.montoMaximo) &&
    R.montoMaximo > 0 &&
    isNum(R.tasaAnual) &&
    isNum(R.plazoMeses)
  ) {
    const r = R.tasaAnual / 12;
    const c = pmt(r, R.plazoMeses, R.montoMaximo);
    const interesesTot = c * R.plazoMeses - R.montoMaximo;

    sectionTitle(doc, "Amortización (primeros 12 meses) y costo total");
    doc.fillColor(brand.text).fontSize(11);
    doc.text(`Cuota estimada: ${money(c, 2)}`, M);
    doc.text(`Intereses totales aprox.: ${money(interesesTot, 2)}`, M);
    doc.text(`Capital financiado: ${money(R.montoMaximo, 2)}`, M);
    doc.moveDown(0.3);

    const tabla12 = (() => {
      let saldo = toNum(R.montoMaximo);
      const rows = [];
      for (let i = 1; i <= 12 && saldo > 0; i++) {
        const interes = saldo * r;
        const capital = Math.max(0, c - interes);
        saldo = Math.max(0, saldo - capital);
        rows.push({ mes: i, cuota: c, interes, capital, saldo });
      }
      return rows;
    })();

    drawAmortTable(doc, tabla12);
    rule(doc);

    const proj = proyeccionCincoAnios(R.montoMaximo, r, c);
    sectionTitle(doc, "Proyección a 5 años");
    doc.fontSize(11).fillColor(brand.text);
    doc.text(
      `Intereses pagados (60 meses): ${money(proj.intereses, 2)}`,
      M
    );
    doc.text(
      `Capital amortizado (60 meses): ${money(proj.capital, 2)}`,
      M
    );
    doc.text(
      `Saldo estimado al mes 60: ${money(proj.saldo, 2)}`,
      M
    );
    doc.moveDown(0.6);
  }

    // ========= Afinidad por tipo de crédito =========
  sectionTitle(doc, "Afinidad por tipo de crédito");

  // Usamos los escenarios que vienen del backend (legacy o nuevos)
  const esc =
    resultado?.escenarios || resultado?.escenariosHL || {};

  // Normalizamos por si vienen en mayúsculas / nombres distintos
  const escNorm = {
    vip: esc.vip || esc.VIP || null,
    vis: esc.vis || esc.VIS || null,
    biess: esc.biess || esc.BIESS || null,
    privada: esc.comercial || esc.PRIVADA || null,
  };

  function esViable(nodo) {
    if (!nodo) return false;
    if (typeof nodo.viable === "boolean") return nodo.viable;
    if (typeof nodo.score === "number") return nodo.score >= 0.5; // fallback genérico
    return false;
  }

  // 👉 Heurística específica para BIESS usando lo que devuelve /precalificar
  const afiliadoBIESS =
    !!echo.afiliadoIESS || !!resultado?.perfil?.afiliadoIess;

  const aportesTotales = toNum(
    echo.iessAportesTotales ?? echo.aportesTotalesIess,
    0
  );
  const aportesConsecutivos = toNum(
    echo.iessAportesConsecutivos ?? echo.aportesConsecutivosIess,
    0
  );

  // Reglas base BIESS
  const biessHeuristico =
    !sinOferta &&
    afiliadoBIESS &&
    aportesTotales >= 36 &&
    aportesConsecutivos >= 24 &&
    isNum(R.ltv) &&
    R.ltv <= 0.9 &&
    isNum(R.dtiConHipoteca) &&
    R.dtiConHipoteca <= 0.4;

  // Qué producto es el principal (para marcarlo como "Recomendado")
  const tagProd = String(R.productoElegido || "").toLowerCase();
  let creditoPrincipal = null;
  if (tagProd.includes("vip")) creditoPrincipal = "VIP";
  else if (tagProd.includes("vis")) creditoPrincipal = "VIS";
  else if (tagProd.includes("biess")) creditoPrincipal = "BIESS";
  else if (
    tagProd.includes("priv") ||
    tagProd.includes("banca") ||
    tagProd.includes("comercial")
  )
    creditoPrincipal = "Banca Privada";

  // Determinamos afinidad por escenarios + heurísticas
  const filasAfinidad = [
    { name: "VIP", key: "vip", ok: esViable(escNorm.vip) },
    { name: "VIS", key: "vis", ok: esViable(escNorm.vis) },
    {
      name: "BIESS",
      key: "biess",
      ok: esViable(escNorm.biess) || biessHeuristico,
    },
    {
      name: "Banca Privada",
      key: "privada",
      ok: esViable(escNorm.privada),
    },
  ];

  // 🔁 Fallback: si ningún escenario marca viable pero sí tenemos productoElegido,
  // marcamos solo ese producto como viable.
  if (!filasAfinidad.some((f) => f.ok) && creditoPrincipal) {
    const filaPrincipal = filasAfinidad.find(
      (f) => f.name === creditoPrincipal
    );
    if (filaPrincipal) filaPrincipal.ok = true;
  }

  const rowH = 18;
  let yA = doc.y + 2;

  filasAfinidad.forEach((row) => {
    if (yA > doc.page.height - M - rowH - 6) {
      doc.addPage();
      yA = M;
    }

    const colHalf = Math.floor((doc.page.width - M * 2) / 2);
    const esPrincipal = creditoPrincipal === row.name;

    doc
      .fillColor(brand.text)
      .fontSize(12)
      .text(row.name, M, yA, {
        width: colHalf,
        continued: false,
      });

    let labelAfinidad;
    let colorAfinidad;

    if (sinOferta) {
      labelAfinidad = "No viable hoy (ver plan de acción)";
      colorAfinidad = brand.mut;
    } else if (row.ok && esPrincipal) {
      // 👉 Solo UN producto recomendado
      labelAfinidad = "Recomendado";
      colorAfinidad = brand.ok;
    } else if (row.ok) {
      // Otros productos que sí podrían aplicar
      labelAfinidad = "Viable";
      colorAfinidad = brand.ok;
    } else {
      labelAfinidad = "Pendiente de análisis";
      colorAfinidad = brand.mut;
    }

    doc
      .fillColor(colorAfinidad)
      .fontSize(11)
      .text(labelAfinidad, M + colHalf, yA, { width: colHalf });

    yA += rowH;
  });

  doc.y = yA + 4;
  rule(doc);



  // === Cierre del generador ===
  pie(doc, codigoHL);
  doc.end();
  return await pdfDone;
}

// Alias para mailer.js
export const generarPDFLeadAvanzado = generarPDFLead;

