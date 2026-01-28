// src/utils/fichaComercialPdf.js
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

const pct0 = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "-";
  // Si viene como 0.10 => 10%
  if (x > 0 && x <= 1) return `${Math.round(x * 100)}%`;
  // Si viene como 10 => 10%
  return `${Math.round(x)}%`;
};

function computeEntradaPct(precioVivienda, entradaUSD) {
  const pv = Number(precioVivienda);
  const en = Number(entradaUSD);
  if (!Number.isFinite(pv) || !Number.isFinite(en) || pv <= 0) return null;
  return en / pv; // devolvemos ratio 0-1 para pct0
}

/**
 * Genera y envía el PDF directamente al response (streaming).
 *
 * ✅ Ahora soporta 2 formatos:
 * - data “viejo” (score, tipoIngreso, precioVivienda, entradaUSD, entradaPct)
 * - data “nuevo” basado en Lead (scoreHL, edad, tipo_ingreso, valor_vivienda, entrada_disponible)
 */
export function generarFichaComercialPDF(res, data) {
  const codigo = safe(
    data?.codigo ??
      data?.codigoHL ??
      data?.lead?.codigoHL,
    "HL"
  );

  const filename = `HL_FICHA_${String(codigo).replace(/[^\w\-]/g, "_")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: "A4", margin: 42 });
  doc.pipe(res);

  // =========================
  // ✅ Normalización de inputs (aquí está el fix)
  // =========================
  const score =
    data?.score ??
    data?.scoreHL ??
    data?.lead?.scoreHL ??
    null;

  const edad =
    data?.edad ??
    data?.lead?.edad ??
    null;

  const tipoIngreso =
    data?.tipoIngreso ??
    data?.tipo_ingreso ??
    data?.lead?.tipo_ingreso ??
    "-";

  const precioVivienda =
    data?.precioVivienda ??
    data?.valor_vivienda ??
    data?.lead?.valor_vivienda ??
    null;

  const entradaUSD =
    data?.entradaUSD ??
    data?.entrada_disponible ??
    data?.lead?.entrada_disponible ??
    null;

  const entradaPct =
    data?.entradaPct ??
    computeEntradaPct(precioVivienda, entradaUSD);

  // Header fields
  const fecha = safe(data?.fecha);
  const plaza = safe(data?.plaza ?? data?.ciudad_compra ?? data?.ciudad ?? data?.lead?.ciudad_compra ?? data?.lead?.ciudad);

  const nombre = data?.nombre ?? data?.lead?.nombre ?? null;
  const telefono = data?.telefono ?? data?.lead?.telefono ?? null;
  const email = data?.email ?? data?.lead?.email ?? null;

  // =========================
  // Estilos
  // =========================
  const COLOR_TEXT = "#0F172A";
  const COLOR_MUTED = "#64748B";
  const COLOR_LINE = "#E2E8F0";

  const h1 = (t) =>
    doc.font("Helvetica-Bold").fontSize(18).fillColor(COLOR_TEXT).text(t);
  const h2 = (t) =>
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_TEXT).text(t);
  const small = (t) =>
    doc.font("Helvetica").fontSize(9).fillColor(COLOR_MUTED).text(t);

  const hr = () => {
    const x1 = doc.page.margins.left;
    const x2 = doc.page.width - doc.page.margins.right;
    const y = doc.y + 8;
    doc
      .moveTo(x1, y)
      .lineTo(x2, y)
      .lineWidth(0.7)
      .strokeColor(COLOR_LINE)
      .stroke();
    doc.moveDown(1.2);
  };

  const row2 = (label1, value1, label2, value2) => {
    const x = doc.page.margins.left;
    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const col = (w - 16) / 2;

    const y = doc.y;
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text(label1, x, y, { width: col });
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(COLOR_TEXT)
      .text(value1, x, y + 12, { width: col });

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text(label2, x + col + 16, y, { width: col });
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(COLOR_TEXT)
      .text(value2, x + col + 16, y + 12, { width: col });

    doc.moveDown(2.1);
  };

  // =========================
  // Header
  // =========================
  h1("FICHA COMERCIAL HABITALIBRE v1.5");
  doc.moveDown(0.35);

  small(`Código HL: ${safe(codigo)}   •   Fecha: ${fecha}   •   Plaza: ${plaza}`);

  const contacto = [];
  if (nombre) contacto.push(`Nombre: ${safe(nombre)}`);
  if (telefono) contacto.push(`Tel: ${safe(telefono)}`);
  if (email) contacto.push(`Email: ${safe(email)}`);
  if (contacto.length) small(contacto.join("   •   "));

  hr();

  // =========================
  // 1) Core
  // =========================
  h2("1) Campos clave (core)");
  doc.moveDown(0.7);

  row2("Score HL", numOrDash(score), "Edad", edad != null ? String(edad) : "-");

  row2("Tipo de ingreso", safe(tipoIngreso), "—", "—");

  row2(
    "Precio de vivienda (declarado)",
    precioVivienda != null ? money0(precioVivienda) : "-",
    "Entrada (USD)",
    entradaUSD != null ? money0(entradaUSD) : "-"
  );

  row2(
    "Entrada (%)",
    entradaPct != null ? pct0(entradaPct) : "-",
    "—",
    "—"
  );

  doc.moveDown(0.2);
  small("Nota: Información declarada + cálculos estimados. El banco realiza la validación y underwriting final.");

  doc.end();
}
