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

const yesNoDash = (v) => {
  if (v === true) return "Sí";
  if (v === false) return "No";
  return "-";
};

const pct0 = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "-";
  if (x > 0 && x <= 1) return `${Math.round(x * 100)}%`;
  return `${Math.round(x)}%`;
};

// Helpers: calcula entrada %
function calcEntradaPct(valorVivienda, entradaUSD) {
  const v = Number(valorVivienda);
  const e = Number(entradaUSD);
  if (!Number.isFinite(v) || !Number.isFinite(e) || v <= 0) return null;
  return (e / v) * 100;
}

/**
 * data esperado (recomendado):
 * {
 *  codigo, fecha, plaza, nombre, telefono, email,
 *  score, edad, tipoIngreso,
 *  valorVivienda, entradaUSD,
 *  ingresoMensual, deudasMensuales, afiliadoIess, aniosEstabilidad,
 *  ciudadCompra, tipoCompra, producto
 * }
 */
export function generarFichaComercialPDF(res, data) {
  const codigo = safe(data?.codigo, "HL");
  const filename = `HL_FICHA_${String(codigo).replace(/[^\w\-]/g, "_")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: "A4", margin: 42 });
  doc.pipe(res);

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

  small(
    `Código HL: ${safe(data?.codigo)}   •   Fecha: ${safe(
      data?.fecha
    )}   •   Plaza: ${safe(data?.plaza)}`
  );

  const contacto = [];
  if (data?.nombre) contacto.push(`Nombre: ${safe(data?.nombre)}`);
  if (data?.telefono) contacto.push(`Tel: ${safe(data?.telefono)}`);
  if (data?.email) contacto.push(`Email: ${safe(data?.email)}`);
  if (contacto.length) small(contacto.join("   •   "));

  hr();

  // =========================
  // 1) Core
  // =========================
  h2("1) Campos clave (core)");
  doc.moveDown(0.7);

  row2("Score HL", numOrDash(data?.score), "Edad", data?.edad != null ? String(data.edad) : "-");

  row2("Tipo de ingreso", safe(data?.tipoIngreso), "Producto", safe(data?.producto));

  row2(
    "Precio de vivienda (declarado)",
    data?.valorVivienda != null ? money0(data?.valorVivienda) : "-",
    "Entrada (USD)",
    data?.entradaUSD != null ? money0(data?.entradaUSD) : "-"
  );

  const entradaPctCalc =
    data?.entradaPct != null ? data.entradaPct : calcEntradaPct(data?.valorVivienda, data?.entradaUSD);

  row2("Entrada (%)", entradaPctCalc != null ? pct0(entradaPctCalc) : "-", "Ciudad compra", safe(data?.ciudadCompra));

  // =========================
  // 2) Perfil financiero (lo que faltaba)
  // =========================
  doc.moveDown(0.4);
  h2("2) Perfil financiero");
  doc.moveDown(0.7);

  row2(
    "Ingreso mensual (decl.)",
    data?.ingresoMensual != null ? money0(data?.ingresoMensual) : "-",
    "Deudas mensuales (aprox.)",
    data?.deudasMensuales != null ? money0(data?.deudasMensuales) : "-"
  );

  row2(
    "Afiliado IESS",
    yesNoDash(data?.afiliadoIess),
    "Años de estabilidad",
    data?.aniosEstabilidad != null ? String(data.aniosEstabilidad) : "-"
  );

  row2("Tipo de compra", safe(data?.tipoCompra), "—", "—");

  doc.moveDown(0.2);
  small("Nota: Información declarada + cálculos estimados. El banco realiza la validación y underwriting final.");

  doc.end();
}
