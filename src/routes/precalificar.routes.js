// src/routes/precalificar.routes.js
import { Router } from "express";

const router = Router();

// PMT mensual (rate en decimal anual/12, nper meses, pv principal)
function pmt(rate, nper, pv) {
  if (!rate) return pv / nper;
  return (pv * rate) / (1 - Math.pow(1 + rate, -nper));
}

// Normaliza truthy/falsy
const toBool = (v) => v === true || v === "true" || v === "1" || v === 1 || v === "Sí" || v === "si";

// Reglas VIS/VIP (ajusta si cambian)
const RULES = {
  VIS_MAX_VALOR: 83660,
  VIP_MAX_VALOR: 107630,
  VIS_MAX_INGRESO: 2070,
  VIP_MAX_INGRESO: 2900,
};

// Sugerencia de producto
function sugerirProducto({ nacionalidad, primeraVivienda, valorVivienda, ingresoUsado, afiliadoIESS }) {
  const ecuatoriano = (nacionalidad || "").toLowerCase() === "ecuatoriana";
  if (ecuatoriano && primeraVivienda && valorVivienda <= RULES.VIS_MAX_VALOR && ingresoUsado <= RULES.VIS_MAX_INGRESO) {
    return "VIS";
  }
  if (ecuatoriano && primeraVivienda && valorVivienda <= RULES.VIP_MAX_VALOR && ingresoUsado <= RULES.VIP_MAX_INGRESO) {
    return "VIP";
  }
  if (afiliadoIESS) return "BIESS";
  return "PRIVADA";
}

// Tasa/plazo referencial por producto (ajusta con tus tablas reales)
function tasaPlazoPorProducto(producto) {
  switch ((producto || "").toUpperCase()) {
    case "VIS":   return { tasaAnual: 0.0488, plazoMeses: 240 };
    case "VIP":   return { tasaAnual: 0.0499, plazoMeses: 300 };
    case "BIESS": return { tasaAnual: 0.0790, plazoMeses: 300 };
    default:      return { tasaAnual: 0.1150, plazoMeses: 240 }; // banca privada
  }
}

// Pequeño score HL (0–100) para ranking interno
function scoreHL({ ltv, dtiConHipoteca, afiliadoIESS, edad }) {
  let s = 100;
  if (ltv != null) {
    if (ltv > 0.9) s -= 15;
    if (ltv > 0.8 && ltv <= 0.9) s -= 8;
  }
  if (dtiConHipoteca != null) {
    if (dtiConHipoteca > 0.45) s -= 20;
    else if (dtiConHipoteca > 0.40) s -= 12;
    else if (dtiConHipoteca > 0.35) s -= 6;
  }
  if (!afiliadoIESS) s -= 4;
  if (edad < 23 || edad > 70) s -= 6;
  if (s < 0) s = 0;
  if (s > 100) s = 100;
  const label = s >= 80 ? "Sólido" : s >= 60 ? "Medio" : "Ajustar";
  return { score: Math.round(s), label };
}

// Construye escenarios comparativos
function armarEscenarios({ loan, ingresoTotal, deudas, afiliadoIESS }) {
  const base = [
    { key: "VIS",   ...tasaPlazoPorProducto("VIS") },
    { key: "VIP",   ...tasaPlazoPorProducto("VIP") },
    { key: "BIESS", ...tasaPlazoPorProducto("BIESS") },
    { key: "PRIVADA", ...tasaPlazoPorProducto("PRIVADA") },
  ];
  const dtiMax = afiliadoIESS ? 0.40 : 0.35;
  const capacidadPago = Math.max(0, (ingresoTotal - deudas) * dtiMax);

  const out = {};
  for (const e of base) {
    const cuota = loan > 0 ? pmt(e.tasaAnual / 12, e.plazoMeses, loan) : 0;
    out[e.key] = {
      viable: cuota <= Math.max(0, capacidadPago) + 1e-6,
      tasaAnual: e.tasaAnual,
      plazoMeses: e.plazoMeses,
      cuota,
      bounds: { cuotaMaxProducto: capacidadPago },
    };
  }
  return out;
}

// POST /api/precalificar
router.post("/", async (req, res) => {
  try {
    const {
      nacionalidad = "ecuatoriana",
      estadoCivil = "soltero",
      ingresoNetoMensual = 0,
      ingresoPareja = 0,
      otrasDeudasMensuales = 0,
      valorVivienda = 0,
      entradaDisponible = 0,
      edad = 30,
      afiliadoIESS: afiliadoIESSRaw = false,
      tieneVivienda = false,
    } = req.body || {};

    const esPareja = ["casado", "union_de_hecho"].includes(String(estadoCivil).toLowerCase());
    const afiliadoIESS = toBool(afiliadoIESSRaw);
    const ingresoTotal = Number(ingresoNetoMensual || 0) + (esPareja ? Number(ingresoPareja || 0) : 0);
    const deudas = Number(otrasDeudasMensuales || 0);
    const valor = Number(valorVivienda || 0);
    const entrada = Number(entradaDisponible || 0);
    const loan = Math.max(0, valor - entrada);
    const ltv = valor > 0 ? loan / valor : null;

    // Capacidad con DTI permitido
    const dtiMax = afiliadoIESS ? 0.40 : 0.35;
    const capacidadPago = Math.max(0, (ingresoTotal - deudas) * dtiMax);

    // Sugerir producto y parámetros
    const productoElegido = sugerirProducto({
      nacionalidad,
      primeraVivienda: !toBool(tieneVivienda),
      valorVivienda: valor,
      ingresoUsado: ingresoTotal,
      afiliadoIESS,
    });

    const { tasaAnual, plazoMeses } = tasaPlazoPorProducto(productoElegido);
    const cuotaEstimada = loan > 0 ? pmt(tasaAnual / 12, plazoMeses, loan) : 0;

    // DTI con hipoteca (ratio de (deudas + cuota) / ingreso)
    const dtiConHipoteca = ingresoTotal > 0 ? (deudas + cuotaEstimada) / ingresoTotal : null;

    // Precio máximo referencial (si quisiéramos encajar a capacidadPago)
    // Backsolve muy simple: si cuota > capacidad, escala loan a la baja manteniendo tasa/plazo
    let precioMaxVivienda = valor || null;
    if (loan > 0 && cuotaEstimada > capacidadPago && capacidadPago > 0) {
      const loanMax = capacidadPago * (1 - Math.pow(1 + tasaAnual / 12, -plazoMeses)) / (tasaAnual / 12);
      const precioMax = Math.max(0, loanMax + entrada);
      precioMaxVivienda = isFinite(precioMax) ? precioMax : null;
    }

    // Stress +2% tasa
    const tasaStress = tasaAnual + 0.02;
    const cuotaStress = loan > 0 ? pmt(tasaStress / 12, plazoMeses, loan) : 0;

    // Escenarios comparativos
    const escenarios = armarEscenarios({ loan, ingresoTotal, deudas, afiliadoIESS });

    // Score HL
    const puntajeHabitaLibre = scoreHL({ ltv, dtiConHipoteca, afiliadoIESS, edad });

    // Respuesta
    return res.json({
      ok: true,
      productoElegido,
      tasaAnual,
      plazoMeses,
      cuotaEstimada,
      cuotaStress,
      capacidadPago,
      ltv,
      dtiConHipoteca,
      montoMaximo: loan > 0 ? loan : 0,
      precioMaxVivienda,
      escenarios,
      puntajeHabitaLibre,
      // eco mínimo útil
      _echo: {
        ingresoNetoMensual,
        ingresoPareja: esPareja ? ingresoPareja : 0,
        otrasDeudasMensuales,
        valorVivienda,
        entradaDisponible,
        edad,
        afiliadoIESS,
        nacionalidad,
        estadoCivil,
      },
    });
  } catch (err) {
    console.error("❌ Error en /precalificar:", err);
    return res.status(500).json({ ok: false, error: "Error interno al precalificar" });
  }
});

export default router;

