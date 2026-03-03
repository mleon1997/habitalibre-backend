/**
 * calcularPreparacion(snapshot)
 * Devuelve preparación (%) por ruta y ruta recomendada.
 * No hardcodea 80 como fijo: eso lo usaremos en freno elegante luego.
 */
export function calcularPreparacion(snapshot) {
  const dti = Number(snapshot?.output?.dti ?? snapshot?.output?.dtiConHipoteca ?? 0);
  const score = Number(snapshot?.output?.scoreHL ?? snapshot?.output?.puntajeHabitaLibre ?? 0);

  const entrada = Number(snapshot?.input?.entrada ?? snapshot?.input?.entradaDisponible ?? 0);
  const estabilidad = Number(snapshot?.input?.estabilidadLaboral ?? snapshot?.input?.aniosEstabilidad ?? 0);
  const afiliadoIESS = Boolean(
    snapshot?.input?.afiliadoIESS ?? snapshot?.input?.afiliadoIess ?? snapshot?.input?.afiliado_iess ?? false
  );

  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  // ========= BIESS =========
  let biess = 0;
  biess += afiliadoIESS ? 28 : 0;
  biess += entrada >= 15000 ? 22 : entrada >= 8000 ? 16 : 10;
  biess += dti <= 40 ? 28 : dti <= 50 ? 18 : 10;
  biess += score >= 75 ? 22 : score >= 65 ? 15 : 8;

  // ========= PRIVADA =========
  let privada = 0;
  privada += entrada >= 20000 ? 30 : entrada >= 12000 ? 20 : 12;
  privada += dti <= 42 ? 30 : dti <= 52 ? 20 : 10;
  privada += score >= 78 ? 25 : score >= 68 ? 18 : 10;
  privada += estabilidad >= 2 ? 15 : estabilidad >= 1 ? 12 : 8;

  // ========= VIS/VIP =========
  let vis = 0;
  vis += entrada >= 6000 ? 30 : entrada >= 3000 ? 20 : 12;
  vis += dti <= 45 ? 30 : dti <= 55 ? 22 : 12;
  vis += score >= 65 ? 20 : score >= 55 ? 14 : 8;
  vis += afiliadoIESS ? 20 : 12;

  const preparacionPorRuta = {
    biess: clamp(biess),
    privada: clamp(privada),
    vis: clamp(vis),
  };

  const rutaRecomendada = Object.keys(preparacionPorRuta).reduce((a, b) =>
    preparacionPorRuta[a] >= preparacionPorRuta[b] ? a : b
  );

  return { ...preparacionPorRuta, rutaRecomendada };
}