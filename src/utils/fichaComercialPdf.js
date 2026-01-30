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

  // ✅ PRODUCTO SUGERIDO (para mostrarlo en el PDF si quieres)
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
 * ✅ Genera la ficha comercial
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

  // =========================
  // Header
  // =========================
  h1("FICHA COMERCIAL HABITALIBRE v1.7");
  doc.moveDown(0.35);

  small(
    `Código HL: ${safe(codigoHL)}   •   Fecha: ${safe(data?.fecha)}   •   Plaza: ${safe(data?.plaza)}`
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

  row2("Score HL", numOrDash(score), "Edad", edad != null ? String(edad) : "-");

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

  row2("Tipo de compra", safe(tipoCompra), "Sin oferta", yesNoDash(sinOferta));

  // =========================
  // 3) Precalificación
  // =========================
  doc.moveDown(0.4);
  h2("3) Precalificación (estimada)");
  doc.moveDown(0.7);

  row2(
    "Banco sugerido",
    safe(pre?.banco),
    "Producto sugerido",
    safe(pre?.productoSugerido)
  );

  row2(
    "Tasa anual",
    pre?.tasaAnual != null ? ratePct2(pre.tasaAnual) : "-",
    "Cuota estimada",
    pre?.cuotaEstimada != null ? money0(pre.cuotaEstimada) : "-"
  );

  const plazoAnios =
    pre?.plazoMeses != null ? Math.round(Number(pre.plazoMeses) / 12) : null;

  row2(
    "Plazo",
    pre?.plazoMeses != null
      ? `${numOrDash(pre.plazoMeses)} meses (${plazoAnios ?? "-"} años)`
      : "-",
    "Capacidad de pago",
    pre?.capacidadPago != null ? money0(pre.capacidadPago) : "-"
  );

  row2(
    "DTI con hipoteca",
    pre?.dtiConHipoteca != null ? pct0(pre.dtiConHipoteca) : "-",
    "LTV",
    pre?.ltv != null ? pct0(pre.ltv) : "-"
  );

  row2(
    "Cuota stress",
    pre?.cuotaStress != null ? money0(pre.cuotaStress) : "-",
    "Precio máx. vivienda",
    pre?.precioMaxVivienda != null ? money0(pre.precioMaxVivienda) : "-"
  );

  row2(
    "Monto máximo",
    pre?.montoMaximo != null ? money0(pre.montoMaximo) : "-",
    "Valor vivienda (ref.)",
    valorViviendaParaMostrar != null ? money0(valorViviendaParaMostrar) : "-"
  );

  // =========================
  // 4) Decisión comercial (lo que más te sirve para ventas)
  // =========================
  doc.moveDown(0.4);
  h2("4) Decisión comercial (HabitaLibre)");
  doc.moveDown(0.7);

  const decisionEstado = pick(decision?.estado, data?.decision_estado);
  const decisionEtapa = pick(decision?.etapa, data?.decision_etapa);
  const decisionHeat = pick(decision?.heat, data?.decision_heat);
  const llamarHoy = pick(decision?.llamarHoy, data?.decision_llamarHoy);

  row2(
    "Estado",
    safe(decisionEstado),
    "Etapa",
    safe(decisionEtapa)
  );

  row2(
    "Heat",
    decisionHeat != null ? `${numOrDash(decisionHeat)} • ${heatLabel(decisionHeat)}` : "-",
    "Llamar hoy",
    yesNoDash(llamarHoy === true)
  );

  // razones / observaciones (si existen)
  const razones =
    pick(
      decision?.razones,
      decision?.reasons,
      decision?.motivos,
      decision?.observaciones
    ) || null;

  if (Array.isArray(razones) && razones.length) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text("Razones / notas", doc.page.margins.left, doc.y);
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT);
    razones.slice(0, 6).forEach((x) => doc.text(`• ${String(x)}`));
    doc.moveDown(0.6);
  }

  doc.moveDown(0.2);
  small(
    "Nota: Información declarada + cálculos estimados. El banco realiza la validación y underwriting final."
  );

  doc.end();
}
