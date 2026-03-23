export function calcularScoreVivienda({
  puedeCubrirCuota,
  entradaDisponible,
  entradaMinimaRequerida,
  cuotaEstimada,
  ingresoMensual,
  deudasMensuales,
  rutaFuturaViable
}) {

  let score = 50

  // 1️⃣ Capacidad de pago
  if (puedeCubrirCuota) {
    score += 20
  }

  // 2️⃣ Relación deuda ingreso saludable
  const dti = (deudasMensuales || 0) / (ingresoMensual || 1)

  if (dti < 0.3) score += 10
  if (dti < 0.2) score += 5

  // 3️⃣ Entrada disponible
  const ratioEntrada =
    (entradaDisponible || 0) / (entradaMinimaRequerida || 1)

  if (ratioEntrada >= 1) {
    score += 25
  } else if (ratioEntrada >= 0.5) {
    score += 15
  } else if (ratioEntrada >= 0.25) {
    score += 8
  }

  // 4️⃣ Ruta futura viable
  if (rutaFuturaViable) {
    score += 10
  }

  // límite máximo
  score = Math.min(score, 95)

  return Math.round(score)
}