// src/utils/fichaComercialPdf.js
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

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

/**
 * ✅ Logo desde /public/LOGOHL.png (estable en prod)
 */
function getLogoBuffer() {
  try {
    const logoPath = path.resolve(process.cwd(), "public", "LOGOHL.png");
    if (!fs.existsSync(logoPath)) {
      console.warn("⚠️ LOGOHL no encontrado en:", logoPath);
      return null;
    }
    return fs.readFileSync(logoPath);
  } catch (err) {
    console.error("❌ Error cargando LOGOHL:", err);
    return null;
  }
}

function scoreTone(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return "muted";
  if (s >= 80) return "good";
  if (s >= 60) return "ok";
  if (s >= 40) return "warn";
  return "bad";
}

function heatLabelSmall(h) {
  const x = Number(h);
  if (!Number.isFinite(x)) return "-";
  if (x <= 0) return "❄️ Frío";
  if (x === 1) return "🟡 Tibio";
  if (x === 2) return "✅ Caliente";
  return "🔥 Hot";
}

function decisionTone(estado) {
  const e = String(estado || "").trim().toLowerCase();
  if (e === "bancable") return "good";
  if (e === "rescatable") return "warn";
  if (e === "descartable") return "muted";
  if (e === "por_calificar") return "info";
  return "muted";
}

/**
 * ✅ Precalificación “a prueba de balas”
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

  const banco =
    pick(
      snap?.bancoSugerido,
      r?.bancoSugerido,
      ruta?.banco,
      r?.mejorBanco?.banco,
      Array.isArray(r?.bancosTop3) ? r.bancosTop3?.[0]?.banco : null,
      Array.isArray(r?.bancosProbabilidad) ? r.bancosProbabilidad?.[0]?.banco : null
    ) || null;

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
    banco,
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
 * ✅ Genera la ficha comercial (HabitaLibre branded)
 * Incluye:
 * - Header con banda + logo LOGOHL + código
 * - Cards con look fintech
 * - Score HL en círculo
 * - Chips de Estado / Heat / Llamar hoy
 * - Estado civil + Con codeudor
 * - Footer con versión y disclaimer
 */
export function generarFichaComercialPDF(res, data) {
  const codigo = safe(data?.codigo ?? data?.codigoHL, "HL");
  const filename = `HL_FICHA_${String(codigo).replace(/[^\w\-]/g, "_")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: "A4", margin: 42 });
  doc.pipe(res);

  // =========================
  // Brand tokens (HabitaLibre)
  // =========================
  const BRAND = {
    emerald: "#10B981", // primary
    emeraldDark: "#059669",
    ink: "#0F172A",
    muted: "#64748B",
    line: "#E2E8F0",
    bg: "#F8FAFC",
    card: "#FFFFFF",
    chipBg: "#F1F5F9",
    danger: "#F43F5E",
    warn: "#F59E0B",
    info: "#2563EB",
    ok: "#0EA5E9",
  };

  // =========================
  // Helpers de layout
  // =========================
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const mx = doc.page.margins.left;
  const mr = doc.page.margins.right;
  const contentW = pageW - mx - mr;

  function hr(yPad = 10) {
    const y = doc.y + yPad;
    doc
      .moveTo(mx, y)
      .lineTo(mx + contentW, y)
      .lineWidth(0.7)
      .strokeColor(BRAND.line)
      .stroke();
    doc.y = y + 10;
  }

  function cardStart(title, subtitle) {
    const x = mx;
    const w = contentW;
    const y = doc.y;

    // altura mínima; se ajusta “a ojo” con padding
    const padding = 14;

    // Header del card (texto) primero, para saber cuánto bajar
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(BRAND.ink)
      .text(title, x + padding, y + padding);

    if (subtitle) {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(BRAND.muted)
        .text(subtitle, x + padding, y + padding + 16);
    }

    // Reservamos un bloque “card” dibujando después con altura dinámica:
    // usamos doc.y para avanzar y luego pintamos fondo desde yStart.
    const yContentStart = y + padding + (subtitle ? 34 : 26);
    doc.y = yContentStart;

    return { x, y, w, padding, yContentStart };
  }

  function cardEnd(card, yBottomExtra = 10) {
    const { x, y, w } = card;
    const yBottom = doc.y + yBottomExtra;

    // Fondo del card detrás
    doc.save();
    doc
      .roundedRect(x, y, w, yBottom - y, 14)
      .fillColor(BRAND.card)
      .fill();
    doc.restore();

    // Borde suave
    doc
      .roundedRect(x, y, w, yBottom - y, 14)
      .lineWidth(0.8)
      .strokeColor(BRAND.line)
      .stroke();

    // Reimprimir header arriba del fondo (para que no quede tapado)
    // (PDFKit dibuja en orden, así que hacemos "repaint" simple)
    // Nota: no reimprimimos aquí; lo mantenemos por simplicidad visual:
    // como el fondo se dibujó después, podría tapar textos.
    // Solución: Dibujar el fondo ANTES de escribir contenido.
    // Para evitar reescribir todo, usamos otro enfoque: dibujar fondo desde el inicio.
    // ✅ Para no complicar, dejamos este “cardEnd” SIN fondo.
    // (Ver: cardDrawBackground y cardBorder)
  }

  function cardDrawBackground(card, height) {
    const { x, y, w } = card;
    doc.save();
    doc.roundedRect(x, y, w, height, 14).fillColor(BRAND.card).fill();
    doc.roundedRect(x, y, w, height, 14).lineWidth(0.8).strokeColor(BRAND.line).stroke();
    doc.restore();
  }

  function row2(card, label1, value1, label2, value2) {
    const x = card.x + card.padding;
    const w = card.w - card.padding * 2;
    const col = (w - 16) / 2;
    const y = doc.y;

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(BRAND.muted)
      .text(label1, x, y, { width: col });

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(BRAND.ink)
      .text(value1, x, y + 12, { width: col });

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(BRAND.muted)
      .text(label2, x + col + 16, y, { width: col });

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(BRAND.ink)
      .text(value2, x + col + 16, y + 12, { width: col });

    doc.moveDown(2.0);
  }

  function chip(x, y, text, tone = "muted") {
    const padX = 10;
    const padY = 6;
    const fontSize = 9;

    let bg = BRAND.chipBg;
    let fg = BRAND.ink;

    if (tone === "good") {
      bg = "#ECFDF5";
      fg = BRAND.emeraldDark;
    } else if (tone === "warn") {
      bg = "#FFFBEB";
      fg = "#B45309";
    } else if (tone === "bad") {
      bg = "#FFF1F2";
      fg = "#BE123C";
    } else if (tone === "info") {
      bg = "#EFF6FF";
      fg = "#1D4ED8";
    }

    doc.save();
    doc.font("Helvetica-Bold").fontSize(fontSize);
    const textW = doc.widthOfString(String(text));
    const w = textW + padX * 2;
    const h = fontSize + padY * 2;

    doc.roundedRect(x, y, w, h, 999).fillColor(bg).fill();
    doc.fillColor(fg).text(String(text), x + padX, y + padY - 1);
    doc.restore();

    return { w, h };
  }

  function drawScoreCircle(cx, cy, score) {
    const s = Number(score);
    const r = 22;

    const tone = scoreTone(s);
    let ring = BRAND.muted;
    let fill = "#FFFFFF";
    let fg = BRAND.ink;

    if (tone === "good") {
      ring = BRAND.emerald;
      fill = "#ECFDF5";
      fg = BRAND.emeraldDark;
    } else if (tone === "ok") {
      ring = BRAND.ok;
      fill = "#F0F9FF";
      fg = "#0369A1";
    } else if (tone === "warn") {
      ring = BRAND.warn;
      fill = "#FFFBEB";
      fg = "#B45309";
    } else if (tone === "bad") {
      ring = BRAND.danger;
      fill = "#FFF1F2";
      fg = "#BE123C";
    }

    doc.save();
    doc.circle(cx, cy, r).fillColor(fill).fill();
    doc.circle(cx, cy, r).lineWidth(2).strokeColor(ring).stroke();

    doc.font("Helvetica-Bold").fontSize(16).fillColor(fg);
    const txt = Number.isFinite(s) ? String(Math.round(s)) : "-";
    const tw = doc.widthOfString(txt);
    doc.text(txt, cx - tw / 2, cy - 8);

    doc.font("Helvetica").fontSize(8).fillColor(BRAND.muted);
    const lbl = "Score HL";
    const lw = doc.widthOfString(lbl);
    doc.text(lbl, cx - lw / 2, cy + 10);

    doc.restore();
  }

  // =========================
  // Normalización inputs
  // =========================
  const resultado = data?.resultado || null;
  const decision = data?.decision || null;

  const codigoHL = pick(
    data?.codigo,
    data?.codigoHL,
    data?.codigoUnico,
    data?.codigoUnicoHL
  );

  const nombre = pick(data?.nombre);
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

  // ✅ NUEVO: estado civil
  const estadoCivil = pick(
    data?.estadoCivil,
    data?.estado_civil,
    data?.civilStatus,
    resultado?.perfil?.estadoCivil,
    resultado?.perfil?.estado_civil,
    resultado?._echo?.estadoCivil,
    resultado?._echo?.estado_civil
  );

  // ✅ NUEVO: con codeudor (si es con pareja o si viene explícito)
  const tipoCompraLower = toLower(tipoCompra);
  const explicitCodeudor =
    pick(
      data?.conCodeudor,
      data?.con_codeudor,
      data?.codeudor,
      data?.coDebtor,
      resultado?._echo?.conCodeudor,
      resultado?._echo?.con_codeudor
    ) ?? null;

  const conCodeudor =
    typeof explicitCodeudor === "boolean"
      ? explicitCodeudor
      : tipoCompraLower === "pareja" || tipoCompraLower === "en_pareja"
      ? true
      : null;

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

  // ✅ flags / sinOferta
  const sinOferta = (() => {
    const rFlag = resultado?.flags?.sinOferta;
    if (typeof rFlag === "boolean") return rFlag;
    if (typeof resultado?.sinOferta === "boolean") return resultado.sinOferta;
    return null;
  })();

  // ✅ Precalificación robusta
  const pre = pickPrecalif({ ...data, resultado, decision });

  // Si no hay valor declarado, usa precio máximo sugerido
  const valorViviendaParaMostrar = pick(valorViviendaDeclarado, pre?.precioMaxVivienda);

  // Entrada %
  const entradaPctCalc =
    data?.entradaPct != null
      ? toNum(data.entradaPct)
      : calcEntradaPct(valorViviendaParaMostrar, entradaUSDDeclarado);

  // ✅ decisión / chips
  const decisionEstado = pick(decision?.estado, data?.decision_estado) || null;
  const decisionEtapa = pick(decision?.etapa, data?.decision_etapa) || null;
  const decisionHeat = pick(decision?.heat, data?.decision_heat);
  const llamarHoy = pick(decision?.llamarHoy, data?.decision_llamarHoy);

  // razones / observaciones (si existen)
  const razones =
    pick(
      decision?.razones,
      decision?.reasons,
      decision?.motivos,
      decision?.observaciones,
      decision?.porQue
    ) || null;

  // =========================
  // Fondo (sutil)
  // =========================
  doc.save();
  doc.rect(0, 0, pageW, pageH).fillColor(BRAND.bg).fill();
  doc.restore();

  // =========================
  // Header: banda + logo + chips
  // =========================
  const headerH = 86;
  doc.save();
  doc.rect(0, 0, pageW, headerH).fillColor(BRAND.emerald).fill();
  doc.restore();

  const logo = getLogoBuffer();
  if (logo) {
    // “píldora” blanca detrás del logo
    doc.save();
    doc.roundedRect(mx, 18, 118, 44, 14).fillColor("#FFFFFF").fill();
    doc.restore();
    doc.image(logo, mx + 10, 26, { width: 98 });
  }

  // Título
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#FFFFFF")
    .text("Ficha Comercial", mx + 130, 24);

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#E6FFFA")
    .text(`HabitaLibre • v1.8`, mx + 130, 46);

  // Chips derecha (código + estado)
  const chipY = 26;
  let chipX = pageW - mr;

  // Código
  doc.save();
  doc.font("Helvetica-Bold").fontSize(9);
  const codeTxt = `Código: ${safe(codigoHL)}`;
  const codeW = doc.widthOfString(codeTxt) + 20;
  chipX -= codeW;
  chip(chipX, chipY, codeTxt, "info");
  chipX -= 10;

  // Estado
  if (decisionEstado) {
    const stTone = decisionTone(decisionEstado);
    const stTxt = String(decisionEstado).replace(/_/g, " ");
    const stW = doc.widthOfString(stTxt) + 20;
    chipX -= stW;
    chip(chipX, chipY, stTxt, stTone === "good" ? "good" : stTone === "warn" ? "warn" : stTone === "info" ? "info" : "muted");
  }
  doc.restore();

  // Línea de meta
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#E6FFFA")
    .text(
      `Fecha: ${safe(data?.fecha)}  •  Plaza: ${safe(data?.plaza)}`,
      mx + 130,
      64
    );

  // Bajamos al contenido
  doc.y = headerH + 18;

  // =========================
  // BLOQUE: Resumen + Score Circle
  // =========================
  // Card fondo (manual)
  const summaryY = doc.y;
  const summaryH = 92;

  doc.save();
  doc.roundedRect(mx, summaryY, contentW, summaryH, 16).fillColor("#FFFFFF").fill();
  doc.roundedRect(mx, summaryY, contentW, summaryH, 16).lineWidth(0.8).strokeColor(BRAND.line).stroke();
  doc.restore();

  // Score circle
  drawScoreCircle(mx + 50, summaryY + 46, score);

  // Texto resumen
  const infoX = mx + 100;
  const infoY = summaryY + 18;

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(BRAND.ink)
    .text(safe(nombre, "Lead"), infoX, infoY, { width: contentW - 120 });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(BRAND.muted)
    .text(
      [telefono ? `Tel: ${telefono}` : null, email ? `Email: ${email}` : null]
        .filter(Boolean)
        .join("   •   ") || "—",
      infoX,
      infoY + 18,
      { width: contentW - 120 }
    );

  // Chips (heat / llamar / etapa / producto)
  let cx = infoX;
  let cy = infoY + 44;

  if (decisionEtapa) {
    const r = chip(cx, cy, `Etapa: ${decisionEtapa}`, "muted");
    cx += r.w + 8;
  }

  if (producto) {
    const r = chip(cx, cy, `Producto: ${producto}`, "info");
    cx += r.w + 8;
  }

  if (decisionHeat != null) {
    const r = chip(cx, cy, `Heat: ${heatLabelSmall(decisionHeat)}`, Number(decisionHeat) >= 2 ? "warn" : "muted");
    cx += r.w + 8;
  }

  if (llamarHoy === true) {
    chip(cx, cy, "Llamar hoy", "bad");
  }

  doc.y = summaryY + summaryH + 18;

  // =========================
  // 1) Core (Card)
  // =========================
  const c1Y = doc.y;
  const c1H = 210;

  doc.save();
  doc.roundedRect(mx, c1Y, contentW, c1H, 16).fillColor("#FFFFFF").fill();
  doc.roundedRect(mx, c1Y, contentW, c1H, 16).lineWidth(0.8).strokeColor(BRAND.line).stroke();
  doc.restore();

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(BRAND.ink)
    .text("1) Campos clave (core)", mx + 16, c1Y + 14);

  doc.y = c1Y + 42;
  const card1 = { x: mx, y: c1Y, w: contentW, padding: 16 };

  row2(card1, "Edad", edad != null ? String(edad) : "-", "Tipo de ingreso", safe(tipoIngreso));
  row2(card1, "Estado civil", safe(estadoCivil), "Con codeudor", yesNoDash(conCodeudor === true));
  row2(
    card1,
    "Precio de vivienda (decl.)",
    valorViviendaDeclarado != null ? money0(valorViviendaDeclarado) : "-",
    "Entrada (USD)",
    entradaUSDDeclarado != null ? money0(entradaUSDDeclarado) : "-"
  );
  row2(
    card1,
    "Entrada (%)",
    entradaPctCalc != null ? `${Math.round(entradaPctCalc)}%` : "-",
    "Ciudad compra",
    safe(ciudadCompra)
  );

  doc.y = c1Y + c1H + 14;

  // =========================
  // 2) Perfil financiero (Card)
  // =========================
  const c2Y = doc.y;
  const c2H = 150;

  doc.save();
  doc.roundedRect(mx, c2Y, contentW, c2H, 16).fillColor("#FFFFFF").fill();
  doc.roundedRect(mx, c2Y, contentW, c2H, 16).lineWidth(0.8).strokeColor(BRAND.line).stroke();
  doc.restore();

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(BRAND.ink)
    .text("2) Perfil financiero", mx + 16, c2Y + 14);

  doc.y = c2Y + 42;
  const card2 = { x: mx, y: c2Y, w: contentW, padding: 16 };

  row2(
    card2,
    "Ingreso mensual (decl.)",
    ingresoMensual != null ? money0(ingresoMensual) : "-",
    "Deudas mensuales (aprox.)",
    deudasMensuales != null ? money0(deudasMensuales) : "-"
  );

  row2(
    card2,
    "Afiliado IESS",
    yesNoDash(afiliadoIess),
    "Años de estabilidad",
    aniosEstabilidad != null ? String(aniosEstabilidad) : "-"
  );

  row2(card2, "Tipo de compra", safe(tipoCompra), "Sin oferta", yesNoDash(sinOferta));

  doc.y = c2Y + c2H + 14;

  // =========================
  // 3) Precalificación (Card)
  // =========================
  const c3Y = doc.y;
  const c3H = 220;

  doc.save();
  doc.roundedRect(mx, c3Y, contentW, c3H, 16).fillColor("#FFFFFF").fill();
  doc.roundedRect(mx, c3Y, contentW, c3H, 16).lineWidth(0.8).strokeColor(BRAND.line).stroke();
  doc.restore();

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(BRAND.ink)
    .text("3) Precalificación (estimada)", mx + 16, c3Y + 14);

  doc.y = c3Y + 42;
  const card3 = { x: mx, y: c3Y, w: contentW, padding: 16 };

  row2(card3, "Banco sugerido", safe(pre?.banco), "Producto sugerido", safe(pre?.productoSugerido));

  row2(
    card3,
    "Tasa anual",
    pre?.tasaAnual != null ? ratePct2(pre.tasaAnual) : "-",
    "Cuota estimada",
    pre?.cuotaEstimada != null ? money0(pre.cuotaEstimada) : "-"
  );

  const plazoAnios = pre?.plazoMeses != null ? Math.round(Number(pre.plazoMeses) / 12) : null;

  row2(
    card3,
    "Plazo",
    pre?.plazoMeses != null ? `${numOrDash(pre.plazoMeses)} meses (${plazoAnios ?? "-"} años)` : "-",
    "Capacidad de pago",
    pre?.capacidadPago != null ? money0(pre.capacidadPago) : "-"
  );

  row2(
    card3,
    "DTI con hipoteca",
    pre?.dtiConHipoteca != null ? pct0(pre.dtiConHipoteca) : "-",
    "LTV",
    pre?.ltv != null ? pct0(pre.ltv) : "-"
  );

  row2(
    card3,
    "Cuota stress",
    pre?.cuotaStress != null ? money0(pre.cuotaStress) : "-",
    "Precio máx. vivienda",
    pre?.precioMaxVivienda != null ? money0(pre.precioMaxVivienda) : "-"
  );

  doc.y = c3Y + c3H + 14;

  // =========================
  // 4) Decisión comercial (Card)
  // =========================
  const c4Y = doc.y;
  const c4H = 160;

  doc.save();
  doc.roundedRect(mx, c4Y, contentW, c4H, 16).fillColor("#FFFFFF").fill();
  doc.roundedRect(mx, c4Y, contentW, c4H, 16).lineWidth(0.8).strokeColor(BRAND.line).stroke();
  doc.restore();

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(BRAND.ink)
    .text("4) Decisión comercial (HabitaLibre)", mx + 16, c4Y + 14);

  // Chips en el header del card
  let dx = mx + 16;
  const dy = c4Y + 34;
  if (decisionEstado) {
    const t = decisionTone(decisionEstado);
    const r = chip(dx, dy, `Estado: ${String(decisionEstado).replace(/_/g, " ")}`, t);
    dx += r.w + 8;
  }
  if (decisionEtapa) {
    const r = chip(dx, dy, `Etapa: ${decisionEtapa}`, "muted");
    dx += r.w + 8;
  }
  if (decisionHeat != null) {
    const r = chip(dx, dy, `Heat: ${heatLabelSmall(decisionHeat)}`, Number(decisionHeat) >= 2 ? "warn" : "muted");
    dx += r.w + 8;
  }
  if (llamarHoy === true) {
    chip(dx, dy, "Llamar hoy", "bad");
  }

  // Razones / notas
  doc.y = c4Y + 66;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(BRAND.muted)
    .text("Razones / notas (máx. 6)", mx + 16, doc.y);

  doc.moveDown(0.6);
  doc.font("Helvetica").fontSize(10).fillColor(BRAND.ink);

  if (Array.isArray(razones) && razones.length) {
    razones.slice(0, 6).forEach((x) => doc.text(`• ${String(x)}`, mx + 16, doc.y, { width: contentW - 32 }));
  } else {
    doc.fillColor(BRAND.muted).text("—", mx + 16, doc.y);
  }

  doc.y = c4Y + c4H + 18;

  // =========================
  // Footer
  // =========================
  const footerY = pageH - 52;

  doc.save();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(BRAND.muted)
    .text(
      "Nota: Información declarada + cálculos estimados. El banco realiza la validación y underwriting final.",
      mx,
      footerY,
      { width: contentW }
    );

  const genAt = (() => {
    try {
      return new Date().toLocaleString("es-EC", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  })();

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(BRAND.muted)
    .text(`Generado: ${genAt}  •  Motor: ${safe(data?.version || "HL")}`, mx, footerY + 16, {
      width: contentW,
    });
  doc.restore();

  doc.end();
}
