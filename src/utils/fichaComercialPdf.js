// src/utils/fichaComercialPdf.js
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const safe = (v, fallback = "-") => (v == null || v === "" ? fallback : v);

const money0 = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return `$${Math.round(x).toLocaleString("es-EC")}`;
};

const numOrDash = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? String(x) : "-";
};

const yesNoDash = (v) => {
  if (v === true) return "Sí";
  if (v === false) return "No";
  const s = String(v ?? "").trim().toLowerCase();
  if (["si", "sí", "true", "1"].includes(s)) return "Sí";
  if (["no", "false", "0"].includes(s)) return "No";
  return "-";
};

const pct0 = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "-";
  if (x >= 0 && x <= 1) return `${Math.round(x * 100)}%`;
  return `${Math.round(x)}%`;
};

const ratePct2 = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "-";
  if (x > 0 && x <= 1) return `${(x * 100).toFixed(2)}%`;
  return `${x.toFixed(2)}%`;
};

// Helpers: calcula entrada %
function calcEntradaPct(valorVivienda, entradaUSD) {
  const v = Number(valorVivienda);
  const e = Number(entradaUSD);
  if (!Number.isFinite(v) || !Number.isFinite(e) || v <= 0) return null;
  return (e / v) * 100;
}

// Helper: devuelve el primer valor no vacío
function pick(...vals) {
  for (const v of vals) {
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function toNum(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function toLower(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s || null;
}

function heatLabel(h) {
  const x = Number(h);
  if (!Number.isFinite(x)) return "-";
  if (x >= 80) return "🔥 Muy caliente";
  if (x >= 60) return "✅ Caliente";
  if (x >= 40) return "🟡 Tibio";
  return "❄️ Frío";
}

/**
 * ✅ Precalificación “a prueba de balas”
 * (SIN BANCO: orientado a venta B2B a bancos)
 *
 * Prioridad:
 * 1) data.precalificacion (snapshot plano)
 * 2) data.resultado (motor)
 * 3) data.decision.ruta (fallback)
 */
function pickPrecalif(data = {}) {
  const snap = data?.precalificacion || null;

  const r = data?.resultado || {};
  const d = data?.decision || {};
  const ruta = d?.ruta || r?.rutaRecomendada || null;

  const productoSugerido = pick(
    snap?.productoSugerido,
    r?.productoSugerido,
    ruta?.tipo,
    ruta?.producto,
    r?.rutaRecomendada?.tipo
  );

  const tasaAnual = pick(snap?.tasaAnual, r?.tasaAnual, ruta?.tasaAnual);
  const plazoMeses = pick(snap?.plazoMeses, r?.plazoMeses, ruta?.plazoMeses);

  const cuotaEstimada = pick(
    snap?.cuotaEstimada,
    r?.cuotaEstimada,
    ruta?.cuotaEstimada,
    ruta?.cuota,
    r?.cuota
  );

  const cuotaStress = pick(
    snap?.cuotaStress,
    r?.cuotaStress,
    r?.stressTest?.cuotaStress,
    r?.stressTest?.cuota
  );

  const dtiConHipoteca = pick(snap?.dtiConHipoteca, r?.dtiConHipoteca, d?.dti);
  const ltv = pick(snap?.ltv, r?.ltv, d?.ltv);

  const montoMaximo = pick(
    snap?.montoMaximo,
    r?.montoMaximo,
    r?.montoPrestamoMax,
    r?.prestamoMax,
    ruta?.montoMaximo
  );

  const precioMaxVivienda = pick(
    snap?.precioMaxVivienda,
    r?.precioMaxVivienda,
    r?.precioMax,
    r?.valorMaxVivienda,
    ruta?.precioMaxVivienda
  );

  const capacidadPago = pick(
    snap?.capacidadPago,
    r?.capacidadPagoPrograma,
    r?.capacidadPago,
    r?.capacidadPagoGlobal,
    d?.capacidadPago,
    ruta?.capacidadPago
  );

  return {
    productoSugerido,
    tasaAnual,
    plazoMeses,
    cuotaEstimada,
    cuotaStress,
    dtiConHipoteca,
    ltv,
    montoMaximo,
    precioMaxVivienda,
    capacidadPago,
  };
}

/**
 * =========================================================
 * ✅ PDF “World Class” para VENDER a bancos (B2B)
 * - Header brand (logo + barra color)
 * - Cards con look premium
 * - NO muestra “Top bancos”
 * - Enfatiza eficiencia: Score / Estado / Etapa / Heat / Métricas clave
 * - Incluye: Estado civil + Con codeudor
 * =========================================================
 */
export function generarFichaComercialPDF(res, data) {
  const codigo = safe(data?.codigo ?? data?.codigoHL, "HL");
  const filename = `HL_FICHA_${String(codigo).replace(/[^\w\-]/g, "_")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: "A4", margin: 42 });
  doc.pipe(res);

  // =========================
  // Theme (HabitaLibre)
  // =========================
  const COLOR_BRAND = "#10B981"; // emerald
  const COLOR_BRAND_DARK = "#0EA371";
  const COLOR_BG = "#F6F8FB";
  const COLOR_CARD = "#FFFFFF";
  const COLOR_TEXT = "#0F172A";
  const COLOR_MUTED = "#64748B";
  const COLOR_LINE = "#E6ECF5";
  const COLOR_PILL = "#ECFDF5";

  // =========================
  // Helpers drawing
  // =========================
  const pageW = () => doc.page.width;
  const pageH = () => doc.page.height;
  const left = () => doc.page.margins.left;
  const right = () => doc.page.width - doc.page.margins.right;
  const contentW = () => right() - left();

  const roundRect = (x, y, w, h, r = 14, fill = null, stroke = null) => {
    doc.roundedRect(x, y, w, h, r);
    if (fill) doc.fillColor(fill).fill();
    if (stroke) doc.lineWidth(1).strokeColor(stroke).stroke();
  };

  const text = (t, x, y, opts = {}) => {
    doc.text(t, x, y, opts);
  };

  const h1 = (t, x, y, w) => {
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#FFFFFF");
    text(t, x, y, { width: w });
  };

  const smallWhite = (t, x, y, w) => {
    doc.font("Helvetica").fontSize(9).fillColor("#EAFBF4");
    text(t, x, y, { width: w });
  };

  const label = (t) => doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED).text(t);
  const value = (t) => doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_TEXT).text(t);

  const chip = (x, y, t, bg, fg, padX = 10, h = 18) => {
    doc.font("Helvetica-Bold").fontSize(9);
    const tw = doc.widthOfString(String(t));
    const w = tw + padX * 2;
    roundRect(x, y, w, h, 9, bg, null);
    doc.fillColor(fg);
    doc.text(String(t), x + padX, y + 4, { width: w - padX * 2, align: "center" });
    return w;
  };

  const card = (x, y, w, h, titleText = null) => {
    // shadow-ish: draw a faint rect behind
    roundRect(x, y + 2, w, h, 18, "#EEF3FA", null);
    roundRect(x, y, w, h, 18, COLOR_CARD, COLOR_LINE);

    if (titleText) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_TEXT);
      doc.text(titleText, x + 18, y + 16, { width: w - 36 });
    }
  };

  const grid2 = (x, y, w, items, rowGap = 14, colGap = 18) => {
    const colW = (w - colGap) / 2;
    let cy = y;
    for (let i = 0; i < items.length; i += 2) {
      const A = items[i];
      const B = items[i + 1];

      // A
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED);
      doc.text(A.label, x, cy, { width: colW });
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_TEXT);
      doc.text(A.value, x, cy + 12, { width: colW });

      // B
      if (B) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED);
        doc.text(B.label, x + colW + colGap, cy, { width: colW });
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_TEXT);
        doc.text(B.value, x + colW + colGap, cy + 12, { width: colW });
      }

      cy += 12 + 12 + rowGap; // label + value + gap
    }
    return cy;
  };

  const scoreBadge = (x, y, score) => {
    const r = 22;
    // ring
    doc.circle(x + r, y + r, r).lineWidth(2).strokeColor("#F59E0B").stroke();
    // number
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#B45309");
    doc.text(String(score ?? "-"), x, y + 10, { width: r * 2, align: "center" });
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#B45309");
    doc.text("Score HL", x, y + 26, { width: r * 2, align: "center" });
  };

  // =========================
  // Inputs normalization
  // =========================
  const resultado = data?.resultado || null;
  const decision = data?.decision || null;

  const codigoHL = pick(data?.codigo, data?.codigoHL, data?.codigoUnico, data?.codigoUnicoHL);
  const fecha = pick(data?.fecha, resultado?._echo?.fecha, resultado?._echo?._fecha);
  const plaza = pick(data?.plaza, data?.ciudad, data?.ciudadCompra, resultado?.perfil?.ciudadCompra);

  const nombre = pick(data?.nombre, data?.nombreCompleto);
  const telefono = pick(data?.telefono);
  const email = pick(data?.email);

  const producto = pick(
    data?.producto,
    resultado?.productoElegido,
    resultado?.tipoCreditoElegido,
    resultado?.productoSugerido,
    decision?.producto,
    decision?.ruta?.producto,
    decision?.ruta?.tipo
  );

  const score = pick(
    data?.score,
    data?.scoreHL,
    decision?.scoreHL,
    resultado?.puntajeHabitaLibre?.score,
    typeof resultado?.puntajeHabitaLibre === "number" ? resultado.puntajeHabitaLibre : null,
    resultado?.scoreHL?.total
  );

  const edad = pick(data?.edad, decision?.edad, resultado?.perfil?.edad);

  const tipoIngreso = pick(
    data?.tipoIngreso,
    data?.tipo_ingreso,
    decision?.tipo_ingreso,
    resultado?.perfil?.tipoIngreso,
    resultado?.perfil?.tipo_ingreso
  );

  const valorViviendaDeclarado = pick(
    data?.valorVivienda,
    data?.valor_vivienda,
    resultado?._echo?.valorVivienda,
    resultado?._echo?.valor_vivienda
  );

  const entradaUSDDeclarado = pick(
    data?.entradaUSD,
    data?.entrada_disponible,
    data?.entradaDisponible,
    resultado?._echo?.entradaDisponible,
    resultado?._echo?.entrada_disponible
  );

  const ciudadCompra = pick(
    data?.ciudadCompra,
    data?.ciudad_compra,
    data?.ciudad,
    resultado?.perfil?.ciudadCompra
  );

  const tipoCompra = pick(
    data?.tipoCompra,
    data?.tipo_compra,
    resultado?._echo?.tipoCompra,
    resultado?._echo?.tipo_compra
  );

  const ingresoMensual = pick(
    data?.ingresoMensual,
    data?.ingreso_mensual,
    data?.ingresoNetoMensual,
    resultado?.perfil?.ingresoTotal,
    resultado?._echo?.ingresoNetoMensual,
    resultado?._echo?.ingreso_mensual
  );

  const deudasMensuales = pick(
    data?.deudasMensuales,
    data?.deuda_mensual_aprox,
    data?.otrasDeudasMensuales,
    resultado?.perfil?.otrasDeudasMensuales,
    resultado?._echo?.otrasDeudasMensuales,
    resultado?._echo?.deuda_mensual_aprox
  );

  const afiliadoIess = pick(
    data?.afiliadoIess,
    data?.afiliado_iess,
    resultado?.perfil?.afiliadoIess,
    resultado?._echo?.afiliadoIess,
    resultado?._echo?.afiliado_iess
  );

  const aniosEstabilidad = pick(
    data?.aniosEstabilidad,
    data?.anios_estabilidad,
    resultado?.perfil?.aniosEstabilidad,
    resultado?._echo?.aniosEstabilidad,
    resultado?._echo?.anios_estabilidad
  );

  const estadoCivil = pick(
    data?.estadoCivil,
    data?.estado_civil,
    resultado?.perfil?.estadoCivil,
    resultado?.perfil?.estado_civil
  );

  const conCodeudor = pick(
    data?.conCodeudor,
    data?.con_codeudor,
    data?.tieneCodeudor,
    resultado?.perfil?.conCodeudor,
    resultado?.perfil?.tieneCodeudor
  );

  // flags / sinOferta
  const sinOferta = (() => {
    const rFlag = resultado?.flags?.sinOferta;
    if (typeof rFlag === "boolean") return rFlag;
    if (typeof resultado?.sinOferta === "boolean") return resultado.sinOferta;
    if (typeof decision?.sinOferta === "boolean") return decision.sinOferta;
    return null;
  })();

  // Decision commercial
  const decisionEstado = pick(decision?.estado, data?.decision_estado);
  const decisionEtapa = pick(decision?.etapa, data?.decision_etapa);
  const decisionHeat = pick(decision?.heat, data?.decision_heat);
  const llamarHoy = pick(decision?.llamarHoy, data?.decision_llamarHoy);

  // Precalif metrics (sin banco)
  const pre = pickPrecalif({ ...data, resultado, decision });

  // Si no hay valor declarado, usa precio máximo sugerido
  const valorViviendaParaMostrar = pick(valorViviendaDeclarado, pre?.precioMaxVivienda);

  // Entrada %
  const entradaPctCalc =
    data?.entradaPct != null
      ? toNum(data.entradaPct)
      : calcEntradaPct(valorViviendaParaMostrar, entradaUSDDeclarado);

  // DTI base (sin hipoteca) aprox
  const ingresoNum = toNum(ingresoMensual);
  const deudaNum = toNum(deudasMensuales);
  const dtiBase = ingresoNum && ingresoNum > 0 && deudaNum != null ? deudaNum / ingresoNum : null;

  // =========================
  // Layout constants
  // =========================
  const X = left();
  const W = contentW();

  // Background
  doc.save();
  doc.rect(0, 0, pageW(), pageH()).fill(COLOR_BG);
  doc.restore();

  // =========================
  // Brand Header (barra)
  // =========================
  const headerH = 92;
  doc.save();
  doc.rect(0, 0, pageW(), headerH).fill(COLOR_BRAND);
  doc.restore();

  // Logo container
  const logoBox = { x: X, y: 18, w: 64, h: 64, r: 14 };
  roundRect(logoBox.x, logoBox.y, logoBox.w, logoBox.h, logoBox.r, "#FFFFFF", null);

  // Try to render LOGOHL.png from /public
  try {
    const logoPath = path.resolve(process.cwd(), "public", "LOGOHL.png");
    if (fs.existsSync(logoPath)) {
      // keep some padding inside the box
      doc.image(logoPath, logoBox.x + 10, logoBox.y + 10, { fit: [44, 44], align: "center", valign: "center" });
    } else {
      // fallback simple HL text
      doc.font("Helvetica-Bold").fontSize(18).fillColor(COLOR_BRAND_DARK);
      doc.text("HL", logoBox.x, logoBox.y + 22, { width: logoBox.w, align: "center" });
    }
  } catch {
    // ignore
  }

  // Title + subtitle
  const titleX = logoBox.x + logoBox.w + 16;
  const titleW = W - (logoBox.w + 16);
  h1("Ficha Comercial", titleX, 20, titleW);

  doc.font("Helvetica").fontSize(10).fillColor("#EAFBF4");
  doc.text("HabitaLibre • v1.9 (B2B Bancos)", titleX, 44, { width: titleW });

  const metaLine = `Fecha: ${safe(fecha, "-")}  •  Plaza: ${safe(plaza || ciudadCompra, "-")}`;
  smallWhite(metaLine, titleX, 62, titleW);

  // Chips (Estado + Código) on header right
  const chipsY = 22;
  let cx = right() - 10;

  // Código chip
  const codeChipText = `Código: ${safe(codigoHL)}`;
  doc.font("Helvetica-Bold").fontSize(9);
  const codeW = doc.widthOfString(codeChipText) + 20;
  cx -= codeW;
  chip(cx, chipsY, codeChipText, "#E0F2FE", "#075985", 10, 20);

  // Estado chip (si existe)
  const estadoTxt = safe(decisionEstado, "-");
  let estadoBg = "#EEF2FF";
  let estadoFg = "#3730A3";
  const eLower = String(decisionEstado || "").toLowerCase();
  if (eLower === "bancable") {
    estadoBg = "#DCFCE7";
    estadoFg = "#166534";
  } else if (eLower === "rescatable") {
    estadoBg = "#FEF9C3";
    estadoFg = "#854D0E";
  } else if (eLower === "descartable") {
    estadoBg = "#F1F5F9";
    estadoFg = "#334155";
  } else if (eLower === "por_calificar") {
    estadoBg = "#E0E7FF";
    estadoFg = "#3730A3";
  }

  const estText = estadoTxt;
  const estW = doc.widthOfString(estText) + 20;
  cx -= (estW + 10);
  chip(cx, chipsY, estText, estadoBg, estadoFg, 10, 20);

  // =========================
  // Lead Card (principal)
  // =========================
  const leadCardY = headerH - 12;
  const leadCardH = 110;
  card(X, leadCardY, W, leadCardH, null);

  // Score badge
  const scoreVal = toNum(score);
  scoreBadge(X + 18, leadCardY + 22, scoreVal != null ? Math.round(scoreVal) : "-");

  // Lead name + contact
  const leadTextX = X + 18 + 54 + 14; // badge area
  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOR_TEXT);
  doc.text(safe(nombre, "Lead"), leadTextX, leadCardY + 18, { width: W - (leadTextX - X) - 18 });

  const contactLine = [
    telefono ? `Tel: ${safe(telefono)}` : null,
    email ? `Email: ${safe(email)}` : null,
  ]
    .filter(Boolean)
    .join("   •   ");

  doc.font("Helvetica").fontSize(10).fillColor(COLOR_MUTED);
  doc.text(contactLine || "-", leadTextX, leadCardY + 40, { width: W - (leadTextX - X) - 18 });

  // Chips row inside card (Etapa / Producto / Heat / Llamar hoy)
  let chipX = leadTextX;
  const chipY2 = leadCardY + 64;

  const etapaText = `Etapa: ${safe(decisionEtapa, "—")}`;
  chipX += chip(chipX, chipY2, etapaText, "#EEF2FF", "#3730A3", 10, 20) + 8;

  const prodText = `Producto: ${safe(producto || pre?.productoSugerido, "—")}`;
  chipX += chip(chipX, chipY2, prodText, "#E0F2FE", "#075985", 10, 20) + 8;

  const heatText =
    decisionHeat != null
      ? `Heat: ${safe(String(decisionHeat))} • ${heatLabel(decisionHeat)}`
      : "Heat: —";
  chipX += chip(chipX, chipY2, heatText, "#F1F5F9", "#334155", 10, 20) + 8;

  const callText = llamarHoy === true ? "Acción: Llamar hoy" : "Acción: No urgente";
  const callBg = llamarHoy === true ? "#FFE4E6" : "#F1F5F9";
  const callFg = llamarHoy === true ? "#9F1239" : "#334155";
  chip(chipX, chipY2, callText, callBg, callFg, 10, 20);

  // =========================
  // Cards: Core / Perfil / Precalif / Decision notes
  // =========================
  let y = leadCardY + leadCardH + 18;

  // --- Card 1: Campos clave (core)
  const c1H = 150;
  card(X, y, W, c1H, "1) Campos clave (core)");

  const coreItems = [
    { label: "Edad", value: edad != null ? String(edad) : "-" },
    { label: "Tipo de ingreso", value: safe(tipoIngreso) },

    { label: "Estado civil", value: safe(estadoCivil) },
    { label: "Con codeudor", value: yesNoDash(conCodeudor) },

    {
      label: "Precio de vivienda (decl.)",
      value: valorViviendaDeclarado != null ? money0(valorViviendaDeclarado) : "-",
    },
    {
      label: "Entrada (USD)",
      value: entradaUSDDeclarado != null ? money0(entradaUSDDeclarado) : "-",
    },

    { label: "Entrada (%)", value: entradaPctCalc != null ? pct0(entradaPctCalc) : "-" },
    { label: "Ciudad compra", value: safe(ciudadCompra) },
  ];

  grid2(X + 18, y + 46, W - 36, coreItems, 12, 18);
  y += c1H + 14;

  // --- Card 2: Perfil financiero
  const c2H = 124;
  card(X, y, W, c2H, "2) Perfil financiero");

  const pfItems = [
    { label: "Ingreso mensual (decl.)", value: ingresoMensual != null ? money0(ingresoMensual) : "-" },
    { label: "Deudas mensuales (aprox.)", value: deudasMensuales != null ? money0(deudasMensuales) : "-" },

    { label: "Afiliado IESS", value: yesNoDash(afiliadoIess) },
    { label: "Años de estabilidad", value: aniosEstabilidad != null ? String(aniosEstabilidad) : "-" },

    { label: "DTI sin hipoteca", value: dtiBase != null ? `${Math.round(dtiBase * 100)}%` : "-" },
    { label: "Sin oferta", value: yesNoDash(sinOferta) },
  ];
  grid2(X + 18, y + 46, W - 36, pfItems, 12, 18);
  y += c2H + 14;

  // --- Card 3: Precalificación (estimada) - SIN BANCO
  const c3H = 140;
  card(X, y, W, c3H, "3) Precalificación (estimada)");

  const plazoAnios = pre?.plazoMeses != null ? Math.round(Number(pre.plazoMeses) / 12) : null;

  const preItems = [
    { label: "Producto sugerido", value: safe(pre?.productoSugerido) },
    { label: "Tasa anual", value: pre?.tasaAnual != null ? ratePct2(pre.tasaAnual) : "-" },

    {
      label: "Plazo",
      value:
        pre?.plazoMeses != null
          ? `${numOrDash(pre.plazoMeses)} meses (${plazoAnios ?? "-"} años)`
          : "-",
    },
    { label: "Cuota estimada", value: pre?.cuotaEstimada != null ? money0(pre.cuotaEstimada) : "-" },

    { label: "Capacidad de pago", value: pre?.capacidadPago != null ? money0(pre.capacidadPago) : "-" },
    { label: "Cuota stress", value: pre?.cuotaStress != null ? money0(pre.cuotaStress) : "-" },

    { label: "DTI con hipoteca", value: pre?.dtiConHipoteca != null ? pct0(pre.dtiConHipoteca) : "-" },
    { label: "LTV", value: pre?.ltv != null ? pct0(pre.ltv) : "-" },
  ];

  grid2(X + 18, y + 46, W - 36, preItems, 12, 18);
  y += c3H + 14;

  // --- Card 4: Decisión comercial (HabitaLibre) - para banca (priorización)
  const c4H = 138;
  card(X, y, W, c4H, "4) Priorización comercial (HabitaLibre)");

  const priItems = [
    { label: "Estado", value: safe(decisionEstado) },
    { label: "Etapa", value: safe(decisionEtapa) },

    {
      label: "Heat",
      value: decisionHeat != null ? `${numOrDash(decisionHeat)} • ${heatLabel(decisionHeat)}` : "-",
    },
    { label: "Acción", value: llamarHoy === true ? "Llamar hoy" : "No urgente" },

    { label: "Tipo de compra", value: safe(tipoCompra) },
    { label: "Valor vivienda (ref.)", value: valorViviendaParaMostrar != null ? money0(valorViviendaParaMostrar) : "-" },
  ];

  // left top of content inside card
  let afterPriY = grid2(X + 18, y + 46, W - 36, priItems, 12, 18);

  // Notes / razones (máx 5) — estilo “bullet” suave
  const razones =
    pick(decision?.razones, decision?.reasons, decision?.motivos, decision?.observaciones, decision?.porQue) || null;

  if (Array.isArray(razones) && razones.length) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED);
    doc.text("Notas operativas", X + 18, afterPriY - 2, { width: W - 36 });
    doc.moveDown(0.2);

    const startY = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT);
    razones.slice(0, 5).forEach((x) => {
      doc.text(`• ${String(x)}`, X + 18, doc.y, { width: W - 36 });
      doc.moveDown(0.1);
    });

    // ensure it doesn't overflow beyond card; if it does, we simply allow it (PDFKit flows)
    if (doc.y < y + c4H - 18) {
      doc.y = Math.min(doc.y, y + c4H - 18);
    } else {
      // if overflow, keep going (rare)
    }
  }

  // Footer note (legal + B2B)
  const footerY = pageH() - 54;
  doc.font("Helvetica").fontSize(8.5).fillColor(COLOR_MUTED);
  doc.text(
    "Nota B2B: HabitaLibre realiza precalificación operativa/comercial con información declarada y cálculos estimados. La aprobación final y underwriting corresponden exclusivamente a la entidad financiera.",
    X,
    footerY,
    { width: W, align: "left" }
  );

  doc.end();
}
