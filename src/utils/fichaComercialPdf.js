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

function calcEntradaPct(valorVivienda, entradaUSD) {
  const v = Number(valorVivienda);
  const e = Number(entradaUSD);
  if (!Number.isFinite(v) || !Number.isFinite(e) || v <= 0) return null;
  return (e / v) * 100;
}

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

function heatLabel(h) {
  const x = Number(h);
  if (!Number.isFinite(x)) return "-";
  if (x >= 80) return "🔥 Muy caliente";
  if (x >= 60) return "✅ Caliente";
  if (x >= 40) return "🟡 Tibio";
  return "❄️ Frío";
}

// =========================
// Precalif (sin banco)
// =========================
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
 * ✅ PDF “World Class” B2B (sin páginas en blanco)
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
  // Theme
  // =========================
  const COLOR_BRAND = "#10B981";
  const COLOR_BRAND_DARK = "#0EA371";
  const COLOR_BG = "#F6F8FB";
  const COLOR_CARD = "#FFFFFF";
  const COLOR_TEXT = "#0F172A";
  const COLOR_MUTED = "#64748B";
  const COLOR_LINE = "#E6ECF5";

  // =========================
  // Geometry
  // =========================
  const pageW = () => doc.page.width;
  const pageH = () => doc.page.height;
  const left = () => doc.page.margins.left;
  const right = () => doc.page.width - doc.page.margins.right;
  const contentW = () => right() - left();

  const X = left();
  const W = contentW();

  const FOOTER_H = 52; // reserva inferior
  const PAGE_SAFE_BOTTOM = () => pageH() - doc.page.margins.bottom - FOOTER_H;

  // =========================
  // Drawing helpers
  // =========================
  const roundRect = (x, y, w, h, r = 14, fill = null, stroke = null) => {
    doc.roundedRect(x, y, w, h, r);
    if (fill) doc.fillColor(fill).fill();
    if (stroke) doc.lineWidth(1).strokeColor(stroke).stroke();
  };

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
    roundRect(x, y + 2, w, h, 18, "#EEF3FA", null);
    roundRect(x, y, w, h, 18, COLOR_CARD, COLOR_LINE);
    if (titleText) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_TEXT);
      doc.text(titleText, x + 18, y + 16, { width: w - 36 });
    }
  };

  const grid2 = (x, y, w, items, rowGap = 12, colGap = 18) => {
    const colW = (w - colGap) / 2;
    let cy = y;

    for (let i = 0; i < items.length; i += 2) {
      const A = items[i];
      const B = items[i + 1];

      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED);
      doc.text(A.label, x, cy, { width: colW });
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_TEXT);
      doc.text(A.value, x, cy + 12, { width: colW });

      if (B) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED);
        doc.text(B.label, x + colW + colGap, cy, { width: colW });
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_TEXT);
        doc.text(B.value, x + colW + colGap, cy + 12, { width: colW });
      }

      cy += 12 + 12 + rowGap;
    }
    return cy;
  };

  const scoreBadge = (x, y, score) => {
    const r = 22;
    doc.circle(x + r, y + r, r).lineWidth(2).strokeColor("#F59E0B").stroke();
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#B45309");
    doc.text(String(score ?? "-"), x, y + 10, { width: r * 2, align: "center" });
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#B45309");
    doc.text("Score HL", x, y + 26, { width: r * 2, align: "center" });
  };

  // ✅ altura dinámica (para evitar recortes)
  const GRID_TOP_PAD = 46;
  const GRID_BOTTOM_PAD = 18;
  const ROW_GAP = 12;
  const calcCardHeightForGrid = (itemsCount) => {
    const rows = Math.ceil(itemsCount / 2);
    const rowBlock = 12 + 12 + ROW_GAP;
    const gridH = rows * rowBlock;
    return GRID_TOP_PAD + gridH + GRID_BOTTOM_PAD;
  };

  // ✅ Page helpers (evita páginas en blanco)
  const paintBackground = () => {
    doc.save();
    doc.rect(0, 0, pageW(), pageH()).fill(COLOR_BG);
    doc.restore();
  };

  const paintMiniHeader = (opts = {}) => {
    const { codigoHL, decisionEstado } = opts;

    // barra pequeña
    const h = 34;
    doc.save();
    doc.rect(0, 0, pageW(), h).fill(COLOR_BRAND);
    doc.restore();

    // mini logo
    const box = { x: X, y: 6, w: 22, h: 22 };
    roundRect(box.x, box.y, box.w, box.h, 7, "#FFFFFF", null);

    try {
      const logoPath = path.resolve(process.cwd(), "public", "LOGOHL.png");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, box.x + 4, box.y + 4, { fit: [14, 14] });
      } else {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_BRAND_DARK);
        doc.text("HL", box.x, box.y + 6, { width: box.w, align: "center" });
      }
    } catch {}

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#FFFFFF");
    doc.text("Ficha Comercial", box.x + box.w + 10, 10, { width: W - 200 });

    // chips right
    let cx = right() - 10;
    doc.font("Helvetica-Bold").fontSize(9);

    const codeTxt = `Código: ${safe(codigoHL)}`;
    const codeW = doc.widthOfString(codeTxt) + 18;
    cx -= codeW;
    chip(cx, 8, codeTxt, "#E0F2FE", "#075985", 9, 18);

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
    }

    const estW = doc.widthOfString(estadoTxt) + 18;
    cx -= (estW + 8);
    chip(cx, 8, estadoTxt, estadoBg, estadoFg, 9, 18);
  };

  const ensureSpace = (neededH, state) => {
    if (state.y + neededH <= PAGE_SAFE_BOTTOM()) return;

    doc.addPage();
    paintBackground();
    paintMiniHeader(state.headerMini);
    state.y = 52; // después de mini header
  };

  const drawFooter = () => {
    const y = pageH() - 44;
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOR_MUTED);
    doc.text(
      "Nota B2B: HabitaLibre realiza precalificación operativa/comercial con información declarada y cálculos estimados. La aprobación final y underwriting corresponden exclusivamente a la entidad financiera.",
      X,
      y,
      { width: W, align: "left" }
    );
  };

  // =========================
  // Normalize inputs
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
    resultado?.perfil?.ciudadCompra,
    resultado?._echo?.ciudadCompra,
    resultado?._echo?.ciudad_compra
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

  const sinOferta = (() => {
    const rFlag = resultado?.flags?.sinOferta;
    if (typeof rFlag === "boolean") return rFlag;
    if (typeof resultado?.sinOferta === "boolean") return resultado.sinOferta;
    if (typeof decision?.sinOferta === "boolean") return decision.sinOferta;
    return null;
  })();

  const decisionEstado = pick(decision?.estado, data?.decision_estado);
  const decisionEtapa = pick(decision?.etapa, data?.decision_etapa);
  const decisionHeat = pick(decision?.heat, data?.decision_heat);
  const llamarHoy = pick(decision?.llamarHoy, data?.decision_llamarHoy);

  const pre = pickPrecalif({ ...data, resultado, decision });

  const valorViviendaParaMostrar = pick(valorViviendaDeclarado, pre?.precioMaxVivienda);

  const entradaPctRaw = pick(
    data?.entradaPct,
    data?.entrada_pct,
    data?.entradaPorcentaje,
    resultado?._echo?.entradaPct,
    resultado?._echo?.entrada_pct
  );

  const entradaPctCalc =
    entradaPctRaw != null ? toNum(entradaPctRaw) : calcEntradaPct(valorViviendaParaMostrar, entradaUSDDeclarado);

  const ingresoNum = toNum(ingresoMensual);
  const deudaNum = toNum(deudasMensuales);
  const dtiBase = ingresoNum && ingresoNum > 0 && deudaNum != null ? deudaNum / ingresoNum : null;

  // =========================
  // Paint page 1
  // =========================
  paintBackground();

  // Header grande (solo página 1)
  const headerH = 92;
  doc.save();
  doc.rect(0, 0, pageW(), headerH).fill(COLOR_BRAND);
  doc.restore();

  const logoBox = { x: X, y: 18, w: 64, h: 64, r: 14 };
  roundRect(logoBox.x, logoBox.y, logoBox.w, logoBox.h, logoBox.r, "#FFFFFF", null);

  try {
    const logoPath = path.resolve(process.cwd(), "public", "LOGOHL.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoBox.x + 10, logoBox.y + 10, { fit: [44, 44] });
    } else {
      doc.font("Helvetica-Bold").fontSize(18).fillColor(COLOR_BRAND_DARK);
      doc.text("HL", logoBox.x, logoBox.y + 22, { width: logoBox.w, align: "center" });
    }
  } catch {}

  const titleX = logoBox.x + logoBox.w + 16;
  const titleW = W - (logoBox.w + 16);

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#FFFFFF");
  doc.text("Ficha Comercial", titleX, 20, { width: titleW });

  doc.font("Helvetica").fontSize(10).fillColor("#EAFBF4");
  doc.text("HabitaLibre • v1.9 (B2B Bancos)", titleX, 44, { width: titleW });

  const metaLine = `Fecha: ${safe(fecha, "-")}  •  Plaza: ${safe(plaza || ciudadCompra, "-")}`;
  doc.font("Helvetica").fontSize(9).fillColor("#EAFBF4");
  doc.text(metaLine, titleX, 62, { width: titleW });

  // Chips right
  const chipsY = 22;
  let cx = right() - 10;

  const codeChipText = `Código: ${safe(codigoHL)}`;
  doc.font("Helvetica-Bold").fontSize(9);
  const codeW = doc.widthOfString(codeChipText) + 20;
  cx -= codeW;
  chip(cx, chipsY, codeChipText, "#E0F2FE", "#075985", 10, 20);

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
  }

  const estW = doc.widthOfString(estadoTxt) + 20;
  cx -= estW + 10;
  chip(cx, chipsY, estadoTxt, estadoBg, estadoFg, 10, 20);

  // Lead card
  const leadCardY = headerH - 12;
  const leadCardH = 110;
  card(X, leadCardY, W, leadCardH, null);

  const scoreVal = toNum(score);
  scoreBadge(X + 18, leadCardY + 22, scoreVal != null ? Math.round(scoreVal) : "-");

  const leadTextX = X + 18 + 54 + 14;
  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOR_TEXT);
  doc.text(safe(nombre, "Lead"), leadTextX, leadCardY + 18, { width: W - (leadTextX - X) - 18 });

  const contactLine = [telefono ? `Tel: ${safe(telefono)}` : null, email ? `Email: ${safe(email)}` : null]
    .filter(Boolean)
    .join("   •   ");

  doc.font("Helvetica").fontSize(10).fillColor(COLOR_MUTED);
  doc.text(contactLine || "-", leadTextX, leadCardY + 40, { width: W - (leadTextX - X) - 18 });

  let chipX = leadTextX;
  const chipY2 = leadCardY + 64;

  chipX += chip(chipX, chipY2, `Etapa: ${safe(decisionEtapa, "—")}`, "#EEF2FF", "#3730A3", 10, 20) + 8;
  chipX += chip(chipX, chipY2, `Producto: ${safe(producto || pre?.productoSugerido, "—")}`, "#E0F2FE", "#075985", 10, 20) + 8;

  const heatText =
    decisionHeat != null ? `Heat: ${safe(String(decisionHeat))} • ${heatLabel(decisionHeat)}` : "Heat: —";
  chipX += chip(chipX, chipY2, heatText, "#F1F5F9", "#334155", 10, 20) + 8;

  const callText = llamarHoy === true ? "Acción: Llamar hoy" : "Acción: No urgente";
  chip(chipX, chipY2, callText, llamarHoy === true ? "#FFE4E6" : "#F1F5F9", llamarHoy === true ? "#9F1239" : "#334155", 10, 20);

  // =========================
  // Content cards with safe pagination
  // =========================
  const state = {
    y: leadCardY + leadCardH + 18,
    headerMini: { codigoHL, decisionEstado },
  };

  // Card 1
  const coreItems = [
    { label: "Edad", value: edad != null ? String(edad) : "-" },
    { label: "Tipo de ingreso", value: safe(tipoIngreso) },

    { label: "Estado civil", value: safe(estadoCivil) },
    { label: "Con codeudor", value: yesNoDash(conCodeudor) },

    { label: "Precio de vivienda (decl.)", value: valorViviendaDeclarado != null ? money0(valorViviendaDeclarado) : "-" },
    { label: "Entrada (USD)", value: entradaUSDDeclarado != null ? money0(entradaUSDDeclarado) : "-" },

    { label: "Entrada (%)", value: entradaPctCalc != null ? pct0(entradaPctCalc) : "-" },
    { label: "Ciudad compra", value: safe(ciudadCompra) },
  ];
  const c1H = calcCardHeightForGrid(coreItems.length);
  ensureSpace(c1H + 14, state);
  card(X, state.y, W, c1H, "1) Campos clave (core)");
  grid2(X + 18, state.y + GRID_TOP_PAD, W - 36, coreItems, ROW_GAP, 18);
  state.y += c1H + 14;

  // Card 2
  const pfItems = [
    { label: "Ingreso mensual (decl.)", value: ingresoMensual != null ? money0(ingresoMensual) : "-" },
    { label: "Deudas mensuales (aprox.)", value: deudasMensuales != null ? money0(deudasMensuales) : "-" },

    { label: "Afiliado IESS", value: yesNoDash(afiliadoIess) },
    { label: "Años de estabilidad", value: aniosEstabilidad != null ? String(aniosEstabilidad) : "-" },

    { label: "DTI sin hipoteca", value: dtiBase != null ? `${Math.round(dtiBase * 100)}%` : "-" },
    { label: "Sin oferta", value: yesNoDash(sinOferta) },
  ];
  const c2H = calcCardHeightForGrid(pfItems.length);
  ensureSpace(c2H + 14, state);
  card(X, state.y, W, c2H, "2) Perfil financiero");
  grid2(X + 18, state.y + GRID_TOP_PAD, W - 36, pfItems, ROW_GAP, 18);
  state.y += c2H + 14;

  // Card 3
  const plazoAnios = pre?.plazoMeses != null ? Math.round(Number(pre.plazoMeses) / 12) : null;
  const preItems = [
    { label: "Producto sugerido", value: safe(pre?.productoSugerido) },
    { label: "Tasa anual", value: pre?.tasaAnual != null ? ratePct2(pre.tasaAnual) : "-" },

    { label: "Plazo", value: pre?.plazoMeses != null ? `${numOrDash(pre.plazoMeses)} meses (${plazoAnios ?? "-"} años)` : "-" },
    { label: "Cuota estimada", value: pre?.cuotaEstimada != null ? money0(pre.cuotaEstimada) : "-" },

    { label: "Capacidad de pago", value: pre?.capacidadPago != null ? money0(pre.capacidadPago) : "-" },
    { label: "Cuota stress", value: pre?.cuotaStress != null ? money0(pre.cuotaStress) : "-" },

    { label: "DTI con hipoteca", value: pre?.dtiConHipoteca != null ? pct0(pre.dtiConHipoteca) : "-" },
    { label: "LTV", value: pre?.ltv != null ? pct0(pre.ltv) : "-" },
  ];
  const c3H = calcCardHeightForGrid(preItems.length);
  ensureSpace(c3H + 14, state);
  card(X, state.y, W, c3H, "3) Precalificación (estimada)");
  grid2(X + 18, state.y + GRID_TOP_PAD, W - 36, preItems, ROW_GAP, 18);
  state.y += c3H + 14;

  // Card 4 + Notas (sin overflow)
  const priItems = [
    { label: "Estado", value: safe(decisionEstado) },
    { label: "Etapa", value: safe(decisionEtapa) },

    { label: "Heat", value: decisionHeat != null ? `${numOrDash(decisionHeat)} • ${heatLabel(decisionHeat)}` : "-" },
    { label: "Acción", value: llamarHoy === true ? "Llamar hoy" : "No urgente" },

    { label: "Tipo de compra", value: safe(tipoCompra) },
    { label: "Valor vivienda (ref.)", value: valorViviendaParaMostrar != null ? money0(valorViviendaParaMostrar) : "-" },
  ];

  const razones =
    pick(decision?.razones, decision?.reasons, decision?.motivos, decision?.observaciones, decision?.porQue) || [];

  // Reservamos espacio para "Notas" (si hay)
  const notesLinesMax = 3; // evita empujar páginas
  const notesH = Array.isArray(razones) && razones.length ? 16 + notesLinesMax * 14 + 10 : 0;

  const c4H = calcCardHeightForGrid(priItems.length) + (notesH ? notesH : 0);
  ensureSpace(c4H + 10, state);

  card(X, state.y, W, c4H, "4) Priorización comercial (HabitaLibre)");
  const afterGridY = grid2(X + 18, state.y + GRID_TOP_PAD, W - 36, priItems, ROW_GAP, 18);

  if (notesH) {
    const boxY = Math.min(afterGridY - 6, state.y + c4H - notesH - 16);
    // título
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED);
    doc.text("Notas operativas", X + 18, boxY, { width: W - 36 });

    // bullets (truncate)
    doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT);
    const lines = razones.slice(0, notesLinesMax);
    let ly = boxY + 14;
    for (const x of lines) {
      doc.text(`• ${String(x)}`, X + 18, ly, { width: W - 36 });
      ly += 14;
    }
    if (razones.length > notesLinesMax) {
      doc.font("Helvetica").fontSize(9).fillColor(COLOR_MUTED);
      doc.text(`+${razones.length - notesLinesMax} más…`, X + 18, ly + 2, { width: W - 36 });
    }
  }

  // Footer en TODAS las páginas sin empujar layout
  drawFooter();

  doc.end();
}
