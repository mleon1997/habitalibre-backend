// src/utils/pdf/fichaComercialPdf.js
import PDFDocument from "pdfkit";

const safe = (v, fallback = "-") => (v == null || v === "" ? fallback : v);

const money0 = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return `$${Math.round(x).toLocaleString("es-EC")}`;
};

const pctStr = (s) => safe(s, "-");

const numOrDash = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? String(x) : "-";
};

/**
 * Genera y envía el PDF directamente al response (streaming).
 * Firma compatible con tu controller: generarFichaComercialPDF(res, dataPDF)
 */
export function generarFichaComercialPDF(res, data) {
  // ✅ Headers PDF
  const codigo = safe(data?.codigo, "HL");
  const filename = `HL_FICHA_${String(codigo).replace(/[^\w\-]/g, "_")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  // ✅ PDFKit doc
  const doc = new PDFDocument({ size: "A4", margin: 42 });
  doc.pipe(res);

  // =========================
  // Estilos simples (v1.2)
  // =========================
  const COLOR_TEXT = "#0F172A";
  const COLOR_MUTED = "#64748B";
  const COLOR_LINE = "#E2E8F0";

  const h1 = (t) => doc.font("Helvetica-Bold").fontSize(16).fillColor(COLOR_TEXT).text(t);
  const h2 = (t) => doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_TEXT).text(t);
  const p = (t) => doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT).text(t);
  const small = (t) => doc.font("Helvetica").fontSize(9).fillColor(COLOR_MUTED).text(t);

  const hr = () => {
    const x1 = doc.page.margins.left;
    const x2 = doc.page.width - doc.page.margins.right;
    const y = doc.y + 8;
    doc.moveTo(x1, y).lineTo(x2, y).lineWidth(0.7).strokeColor(COLOR_LINE).stroke();
    doc.moveDown(1.2);
  };

  const row2 = (label1, value1, label2, value2) => {
    const x = doc.page.margins.left;
    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const col = (w - 16) / 2;

    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED).text(label1, x, y, { width: col });
    doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT).text(value1, x, y + 12, { width: col });

    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED).text(label2, x + col + 16, y, { width: col });
    doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT).text(value2, x + col + 16, y + 12, { width: col });

    doc.moveDown(2.2);
  };

  const row1 = (label, value) => {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED).text(label);
    doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT).text(value);
    doc.moveDown(0.6);
  };

  // =========================
  // Header
  // =========================
  h1("FICHA COMERCIAL HABITALIBRE v1.2");
  doc.moveDown(0.3);
  small(`Código HL: ${safe(data?.codigo)}   •   Fecha: ${safe(data?.fecha)}   •   Plaza: ${safe(data?.plaza)}`);
  hr();

  // =========================
  // Bloque 1: Métricas clave (sin juicios)
  // =========================
  h2("1) Métricas clave (numéricas)");
  doc.moveDown(0.6);

  row2("Score HL", numOrDash(data?.score), "Ingreso mensual", data?.ingresoMensual != null ? money0(data?.ingresoMensual) : "-");
  row2("Tipo de ingreso", safe(data?.tipoIngreso), "Antigüedad (años)", safe(data?.antiguedadAnios));
  row2("Tasa anual estimada", data?.tasaAnual != null ? `${(Number(data?.tasaAnual) * 100).toFixed(2)}%` : "-", "Plazo (meses)", data?.plazoMeses != null ? String(data?.plazoMeses) : "-");
  row2("Cuota estimada", data?.cuotaEstimada != null ? money0(data?.cuotaEstimada) : "-", "Monto máx. vivienda", data?.montoMaxVivienda != null ? money0(data?.montoMaxVivienda) : "-");

  hr();

  // =========================
  // Bloque 2: Contexto de precalificación (factual)
  // =========================
  h2("2) Contexto de precalificación (factual)");
  doc.moveDown(0.6);

  row2("Precalificación", safe(data?.preclasif), "Producto elegido", safe(data?.productoElegido));
  row2("Resultado motor", safe(data?.resultadoOk), "Índice hipoteca", safe(data?.indiceHipoteca));

  hr();

  // =========================
  // Bloque 3: Costos y entrada
  // =========================
  h2("3) Costos y entrada (si aplica)");
  doc.moveDown(0.6);

  row2("Entrada (USD)", data?.entradaUSD != null ? money0(data?.entradaUSD) : "-", "Entrada (%)", pctStr(data?.entradaPct));
  row2("Costo inicial (USD)", data?.costoInicialUSD != null ? money0(data?.costoInicialUSD) : "-", "Avalúo (USD)", data?.avaluoUSD != null ? money0(data?.avaluoUSD) : "-");
  row2("Seguros (anuales)", data?.segurosAnuales != null ? money0(data?.segurosAnuales) : "-", "—", "—");

  hr();

  // =========================
  // Bloque 4: Operación (solo conteos)
  // =========================
  h2("4) Señales operativas (conteos)");
  doc.moveDown(0.6);

  row2("Documentos adjuntos", data?.docsCount != null ? String(data?.docsCount) : "-", "Acciones registradas", data?.accionesCount != null ? String(data?.accionesCount) : "-");
  row2("Ventana de cierre", safe(data?.ventanaCierre), "Tiempo óptimo contacto", safe(data?.tiempoOptimoContacto));

  doc.moveDown(0.4);
  small(
    "Nota: Este reporte consolida información declarada y cálculos estimados. El banco realiza la validación y underwriting final."
  );

  // Final
  doc.end();
}
