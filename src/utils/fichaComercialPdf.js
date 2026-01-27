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
  // Si viene como 0.45 => 45%
  if (x > 0 && x <= 1) return `${Math.round(x * 100)}%`;
  // Si viene como 45 => 45%
  return `${Math.round(x)}%`;
};

const pct2 = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "-";
  if (x > 0 && x <= 1) return `${(x * 100).toFixed(2)}%`;
  return `${x.toFixed(2)}%`;
};

const ratePct2 = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "-";
  // tasa anual: 0.0499 => 4.99%
  return `${(x * 100).toFixed(2)}%`;
};

function isArr(a) {
  return Array.isArray(a) && a.length > 0;
}

/**
 * Genera y envía el PDF directamente al response (streaming).
 * Firma compatible con tu controller: generarFichaComercialPDF(res, dataPDF)
 *
 * 🎯 Objetivo: “banco-friendly”
 * - SOLO números + contacto + origen
 * - SIN juicios de valor
 * - Top3 bancos como “estimado”
 */
export function generarFichaComercialPDF(res, data) {
  const codigo = safe(data?.codigo, "HL");
  const filename = `HL_FICHA_${String(codigo).replace(/[^\w\-]/g, "_")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: "A4", margin: 42 });
  doc.pipe(res);

  // =========================
  // Estilos simples
  // =========================
  const COLOR_TEXT = "#0F172A";
  const COLOR_MUTED = "#64748B";
  const COLOR_LINE = "#E2E8F0";

  const h1 = (t) => doc.font("Helvetica-Bold").fontSize(16).fillColor(COLOR_TEXT).text(t);
  const h2 = (t) => doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_TEXT).text(t);
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
  h1("FICHA COMERCIAL HABITALIBRE v1.4");
  doc.moveDown(0.3);

  const headerLine1 = `Código HL: ${safe(data?.codigo)}   •   Fecha: ${safe(data?.fecha)}   •   Plaza: ${safe(
    data?.plaza
  )}`;
  small(headerLine1);

  // Contacto visible (banco-friendly)
  const contacto = [];
  if (data?.nombre) contacto.push(`Nombre: ${safe(data?.nombre)}`);
  if (data?.telefono) contacto.push(`Tel: ${safe(data?.telefono)}`);
  if (data?.email) contacto.push(`Email: ${safe(data?.email)}`);
  if (contacto.length) small(contacto.join("   •   "));

  hr();

  // =========================
  // Bloque 1: Métricas clave
  // =========================
  h2("1) Métricas clave (numéricas)");
  doc.moveDown(0.6);

  row2("Score HL", numOrDash(data?.score), "Edad", data?.edad != null ? String(data.edad) : "-");

  row2(
    "Ingreso mensual",
    data?.ingresoMensual != null ? money0(data?.ingresoMensual) : "-",
    "Deudas mensuales",
    data?.deudaMensual != null ? money0(data?.deudaMensual) : "-"
  );

  row2("DTI con hipoteca", pct0(data?.dtiConHipoteca), "LTV", pct2(data?.ltv));

  row2("Producto elegido", safe(data?.productoElegido), "Tiempo compra", safe(data?.ventanaCierre));

  row2(
    "Tasa anual estimada",
    data?.tasaAnual != null ? ratePct2(data?.tasaAnual) : "-",
    "Plazo (meses)",
    data?.plazoMeses != null ? String(data?.plazoMeses) : "-"
  );

  row2(
    "Cuota estimada",
    data?.cuotaEstimada != null ? money0(data?.cuotaEstimada) : "-",
    "Precio máx. vivienda",
    data?.precioMaxVivienda != null ? money0(data?.precioMaxVivienda) : "-"
  );

  // ✅ Monto máx (si viene adicional)
  if (data?.montoMaxVivienda != null) {
    row1("Monto máx. préstamo (si aplica)", money0(data?.montoMaxVivienda));
  }

  hr();

  // =========================
  // Bloque 2: Perfil / Reglas
  // =========================
  h2("2) Perfil (declarado / motor)");
  doc.moveDown(0.6);

  row2(
    "Tipo de ingreso",
    safe(data?.tipoIngreso),
    "Años estabilidad",
    data?.antiguedadAnios != null ? String(data?.antiguedadAnios) : "-"
  );

  // ✅ “Primera vivienda” debe venir como Sí/No (desde controller)
  row2("IESS afiliado", safe(data?.afiliadoIess), "Primera vivienda", safe(data?.tieneVivienda));

  hr();

  // =========================
  // Bloque 3: Top 3 bancos
  // =========================
  h2("3) Top 3 bancos (estimado)");
  doc.moveDown(0.6);

  const top3 = isArr(data?.bancosTop3) ? data.bancosTop3 : [];
  if (!top3.length) {
    row1("—", "No disponible");
  } else {
    top3.slice(0, 3).forEach((b, idx) => {
      const nombre = safe(b?.banco || b?.nombre, `Banco ${idx + 1}`);
      const tipo = safe(b?.tipoProducto);
      const prob = safe(b?.probLabel);
      const score = b?.probScore != null ? `${String(b.probScore)}/100` : "-";
      const dtiBanco = b?.dtiBanco != null ? pct0(b.dtiBanco) : "-";

      row2(`Banco #${idx + 1}`, `${nombre}`, "Tipo / Probabilidad", `${tipo} • ${prob} • ${score}`);
      row2("DTI banco", dtiBanco, "—", "—");
      doc.moveDown(0.2);
    });
  }

  hr();

  // =========================
  // Bloque 4: Contexto / Operación
  // =========================
  h2("4) Contexto (factual)");
  doc.moveDown(0.6);

  row2("Origen", safe(data?.origen), "Canal", safe(data?.canal));
  row2(
    "Documentos adjuntos",
    data?.docsCount != null ? String(data?.docsCount) : "-",
    "Acciones registradas",
    data?.accionesCount != null ? String(data?.accionesCount) : "-"
  );

  doc.moveDown(0.4);
  small("Nota: Información declarada + cálculos estimados. El banco realiza la validación y underwriting final.");

  doc.end();
}
