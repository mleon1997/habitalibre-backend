// src/routes/precalificar.routes.js
import { Router } from "express";

const router = Router();

/* --------- helpers financieros --------- */
function pmt(rate, nper, pv) {
  if (!rate) return pv / nper;
  return (pv * rate) / (1 - Math.pow(1 + rate, -nper));
}
const toBool =
  (v) => v === true || v === "true" || v === "1" || v === 1 || v === "Sí" || v === "si";

const RULES = {
  VIS_MAX_VALOR: 83660,
  VIP_MAX_VALOR: 107630,
  VIS_MAX_INGRESO: 2070,
  VIP_MAX_INGRESO: 2900,
};

function sugerirProducto({ nacionalidad, primeraVivienda, valorVivienda, ingresoUsado, afiliadoIESS }) {
  const ecuatoriano = (nacionalidad || "").toLowerCase() === "ecuatoriana";
  if (ecuatoriano && primeraVivienda && valorVivienda <= RULES.VIS_MAX_VALOR && ingresoUsado <= RULES.VIS_MAX_INGRESO) return "VIS";
  if (ecuatoriano && primeraVivienda && valorVivienda <= RULES.VIP_MAX_VALOR && ingresoUsado <= RULES.VIP_MAX_INGRESO) return "VIP";
  if (afiliadoIESS) return "BIESS";
  return "PRIVADA";
}
function tasaPlazoPorProducto(producto) {
  switch ((producto || "").toUpperCase()) {
    case "VIS": return { tasaAnual: 0.0488, plazoMeses: 240 };
    case "VIP": return { tasaAnual: 0.0499, plazoMeses: 300 };
    case "BIESS": return { tasaAnual: 0.079, plazoMeses: 300 };
    default: return { tasaAnual: 0.115, plazoMeses: 240 };
  }
}
function scoreHL({ ltv, dtiConHipoteca, afiliadoIESS, edad }) {
  let s = 100;
  if (ltv != null) { if (ltv > 0.9) s -= 15; else if (ltv > 0.8) s -= 8; }
  if (dtiConHipoteca != null) {
    if (dtiConHipoteca > 0.45) s -= 20; else if (dtiConHipoteca > 0.4) s -= 12; else if (dtiConHipoteca > 0.35) s -= 6;
  }
  if (!afiliadoIESS) s -= 4;
  if (edad < 23 || edad > 70) s -= 6;
  s = Math.max(0, Math.min(100, s));
  const label = s >= 80 ? "Sólido" : s >= 60 ? "Medio" : "Ajustar";
  return { score: Math.round(s), label };
}
function armarEscenarios({ loan, ingresoTotal, deudas, afiliadoIESS }) {
  const base = [
    { key: "VIS", ...tasaPlazoPorProducto("VIS") },
    { key: "VIP", ...tasaPlazoPorProducto("VIP") },
    { key: "BIESS", ...tasaPlazoPorProducto("BIESS") },
    { key: "PRIVADA", ...tasaPlazoPorProducto("PRIVADA") },
  ];
  const dtiMax = afiliadoIESS ? 0.4 : 0.35;
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

/* --------- DEBUG: GET /api/precalificar/ping --------- */
router.get("/ping", (req, res) => {
  res.json({ ok: true, message: "precalificar OK", origin: req.headers.origin || null });
});

/* --------- POST /api/precalificar --------- */
router.post("/", async (req, res) => {
  try {
    console.log("➡️  POST /api/precalificar payload:", {
      ingresoNetoMensual: req.body?.ingresoNetoMensual,
      ingresoPareja: req.body?.ingresoPareja,
      otrasDeudasMensuales: req.body?.otrasDeudasMensuales,
      valorVivienda: req.body?.valorVivienda,
      entradaDisponible: req.body?.entradaDisponible,
      edad: req.body?.edad,
      afiliadoIESS: req.body?.afiliadoIESS ?? req.body?.afiliadoIess,
    });

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

    const esPareja =
      ["casado", "union_de_hecho"].includes(String(estadoCivil).toLowerCase());
    const afiliadoIESS = toBool(afiliadoIESSRaw);
    const ingresoTotal =
      Number(ingresoNetoMensual || 0) + (esPareja ? Number(ingresoPareja || 0) : 0);
    const deudas = Number(otrasDeudasMensuales || 0);
    const valor = Number(valorVivienda || 0);
    const entrada = Number(entradaDisponible || 0);
    const loan = Math.max(0, valor - entrada);
    const ltv = valor > 0 ? loan / valor : null;

    const dtiMax = afiliadoIESS ? 0.4 : 0.35;
    const capacidadPago = Math.max(0, (ingresoTotal - deudas) * dtiMax);

    const productoElegido = sugerirProducto({
      nacionalidad,
      primeraVivienda: !toBool(tieneVivienda),
      valorVivienda: valor,
      ingresoUsado: ingresoTotal,
      afiliadoIESS,
    });
    const { tasaAnual, plazoMeses } = tasaPlazoPorProducto(productoElegido);
    const cuotaEstimada = loan > 0 ? pmt(tasaAnual / 12, plazoMeses, loan) : 0;

    const dtiConHipoteca =
      ingresoTotal > 0 ? (deudas + cuotaEstimada) / ingresoTotal : null;

    let precioMaxVivienda = valor || null;
    if (loan > 0 && cuotaEstimada > capacidadPago && capacidadPago > 0) {
      const loanMax =
        (capacidadPago * (1 - Math.pow(1 + tasaAnual / 12, -plazoMeses))) /
        (tasaAnual / 12);
      const precioMax = Math.max(0, loanMax + entrada);
      precioMaxVivienda = Number.isFinite(precioMax) ? precioMax : null;
    }

    const tasaStress = tasaAnual + 0.02;
    const cuotaStress = loan > 0 ? pmt(tasaStress / 12, plazoMeses, loan) : 0;

    const escenarios = armarEscenarios({ loan, ingresoTotal, deudas, afiliadoIESS });
    const puntajeHabitaLibre = scoreHL({ ltv, dtiConHipoteca, afiliadoIESS, edad });

    const respuesta = {
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
      _echo: {
        ingresoNetoMensual: Number(ingresoNetoMensual || 0),
        ingresoPareja: esPareja ? Number(ingresoPareja || 0) : 0,
        otrasDeudasMensuales: Number(otrasDeudasMensuales || 0),
        valorVivienda: Number(valorVivienda || 0),
        entradaDisponible: Number(entradaDisponible || 0),
        edad: Number(edad || 0),
        afiliadoIESS: Boolean(afiliadoIESS),
        nacionalidad,
        estadoCivil,
      },
    };

    console.log("✅ /api/precalificar OK ->", {
      productoElegido,
      cuotaEstimada: Math.round(cuotaEstimada),
      capacidadPago: Math.round(capacidadPago),
    });

    return res.json(respuesta);
  } catch (err) {
    console.error("❌ Error en /precalificar:", err?.stack || err);
    return res.status(500).json({ ok: false, error: "Error interno al precalificar" });
  }
});

export default router;
