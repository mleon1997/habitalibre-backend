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
  // soporta 0..1 y 0..100
  if (x > 0 && x <= 1) return `${Math.round(x * 100)}%`;
  return `${Math.round(x)}%`;
};

const ratePct2 = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "-";
  // tasa anual suele venir 0.0499
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

// Helper: convierte a número o null
function toNum(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * data esperado (recomendado):
 * {
 *  codigo, fecha, plaza, nombre, telefono, email,
 *  score, edad, tipoIngreso,
 *  valorVivienda, entradaUSD,
 *  ingresoMensual, deudasMensuales, afiliadoIess, aniosEstabilidad,
 *  ciudadCompra, tipoCompra, producto,
 *  resultado (opcional) -> objeto de simulación/precalificación
 * }
 *
 * ✅ Este archivo ahora soporta también snake_case:
 *  valor_vivienda, entrada_disponible, tipo_ingreso, ingreso_mensual, deuda_mensual_aprox, afiliado_iess...
 */
export function generarFichaComercialPDF(res, data) {
  const codigo = safe(data?.codigo ?? data?.codigoHL, "HL");
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
  // Normalización de inputs (camelCase + snake_case + resultado)
  // =========================
  const resultado = data?.resultado || null;

  const codigoHL = pick(data?.codigo, data?.codigoHL);

  const nombre = pick(data?.nombre);
  const telefono = pick(data?.telefono);
  const email = pick(data?.email);

  const producto = pick(
    data?.producto,
    resultado?.productoElegido,
    resultado?.tipoCreditoElegido,
    resultado?.productoSugerido
  );

  const score = pick(
    data?.score,
    data?.scoreHL,
    resultado?.puntajeHabitaLibre?.score,
    resultado?.puntajeHabitaLibre
  );

  const edad = pick(data?.edad);

  const tipoIngreso = pick(data?.tipoIngreso, data?.tipo_ingreso);

  // Declarados (o desde DB)
  const valorViviendaDeclarado = pick(data?.valorVivienda, data?.valor_vivienda);
  const entradaUSDDeclarado = pick(data?.entradaUSD, data?.entrada_disponible);

  const ciudadCompra = pick(data?.ciudadCompra, data?.ciudad_compra, data?.ciudad);

  const tipoCompra = pick(data?.tipoCompra, data?.tipo_compra);

  // Perfil financiero
  const ingresoMensual = pick(data?.ingresoMensual, data?.ingreso_mensual);
  const deudasMensuales = pick(data?.deudasMensuales, data?.deuda_mensual_aprox);
  const afiliadoIess = pick(data?.afiliadoIess, data?.afiliado_iess);
  const aniosEstabilidad = pick(data?.aniosEstabilidad, data?.anios_estabilidad);

  // Fallbacks desde resultado (cuando no hay declarado)
  const precioMaxVivienda = pick(resultado?.precioMaxVivienda);
  const montoMaximo = pick(resultado?.montoMaximo);
  const tasaAnual = pick(resultado?.tasaAnual);
  const plazoMeses = pick(resultado?.plazoMeses);
  const cuotaEstimada = pick(resultado?.cuotaEstimada);
  const cuotaStress = pick(resultado?.cuotaStress);
  const bancoSugerido = pick(resultado?.bancoSugerido);
  const dti = pick(resultado?.dtiConHipoteca);
  const ltv = pick(resultado?.ltv);

  // Si no hay "valor vivienda declarado", a veces sirve mostrar "precio máximo sugerido"
  const valorViviendaParaMostrar = pick(valorViviendaDeclarado, precioMaxVivienda);

  // Entrada %
  const entradaPctCalc =
    data?.entradaPct != null
      ? toNum(data.entradaPct)
      : calcEntradaPct(valorViviendaParaMostrar, entradaUSDDeclarado);

  // =========================
  // Header
  // =========================
  h1("FICHA COMERCIAL HABITALIBRE v1.6");
  doc.moveDown(0.35);

  small(
    `Código HL: ${safe(codigoHL)}   •   Fecha: ${safe(
      data?.fecha
    )}   •   Plaza: ${safe(data?.plaza)}`
  );

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

  row2(
    "Score HL",
    numOrDash(score),
    "Edad",
    edad != null ? String(edad) : "-"
  );

  row2("Tipo de ingreso", safe(tipoIngreso), "Producto", safe(producto));

  row2(
    "Precio de vivienda (decl.)",
    valorViviendaDeclarado != null ? money0(valorViviendaDeclarado) : "-",
    "Entrada (USD)",
    entradaUSDDeclarado != null ? money0(entradaUSDDeclarado) : "-"
  );

  row2(
    "Entrada (%)",
    entradaPctCalc != null ? pct0(entradaPctCalc) : "-",
    "Ciudad compra",
    safe(ciudadCompra)
  );

  // =========================
  // 2) Perfil financiero
  // =========================
  doc.moveDown(0.4);
  h2("2) Perfil financiero");
  doc.moveDown(0.7);

  row2(
    "Ingreso mensual (decl.)",
    ingresoMensual != null ? money0(ingresoMensual) : "-",
    "Deudas mensuales (aprox.)",
    deudasMensuales != null ? money0(deudasMensuales) : "-"
  );

  row2(
    "Afiliado IESS",
    yesNoDash(afiliadoIess),
    "Años de estabilidad",
    aniosEstabilidad != null ? String(aniosEstabilidad) : "-"
  );

  row2("Tipo de compra", safe(tipoCompra), "—", "—");

  // =========================
  // 3) Precalificación (estimada) — desde data.resultado
  // =========================
  doc.moveDown(0.4);
  h2("3) Precalificación (estimada)");
  doc.moveDown(0.7);

  // Solo mostramos valores si existe resultado; si no, igual deja claro que falta
  row2(
    "Banco sugerido",
    safe(bancoSugerido, resultado ? "-" : "-"),
    "Tasa anual",
    tasaAnual != null ? ratePct2(tasaAnual) : "-"
  );

  const plazoAnios = plazoMeses != null ? Math.round(Number(plazoMeses) / 12) : null;

  row2(
    "Plazo",
    plazoMeses != null ? `${numOrDash(plazoMeses)} meses (${plazoAnios ?? "-"} años)` : "-",
    "Cuota estimada",
    cuotaEstimada != null ? money0(cuotaEstimada) : "-"
  );

  row2(
    "Cuota stress",
    cuotaStress != null ? money0(cuotaStress) : "-",
    "DTI con hipoteca",
    dti != null ? pct0(dti) : "-"
  );

  row2(
    "Monto máximo",
    montoMaximo != null ? money0(montoMaximo) : "-",
    "Precio máximo vivienda",
    precioMaxVivienda != null ? money0(precioMaxVivienda) : "-"
  );

  row2(
    "LTV",
    ltv != null ? pct0(ltv) : "-",
    "Valor vivienda (ref.)",
    valorViviendaParaMostrar != null ? money0(valorViviendaParaMostrar) : "-"
  );

  doc.moveDown(0.2);
  small(
    "Nota: Información declarada + cálculos estimados. El banco realiza la validación y underwriting final."
  );

  doc.end();
}
