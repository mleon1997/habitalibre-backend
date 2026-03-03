/**
 * generarMensajeGuia(snapshot)
 * Devuelve SIEMPRE:
 * - 1 recomendación
 * - 1 razón (por qué)
 * - 1 micro-CTA
 * - tipoEstado: mejora | estable | alerta
 */
export function generarMensajeGuia(snapshot) {
  const dti = Number(snapshot?.output?.dti ?? snapshot?.output?.dtiConHipoteca ?? 0);
  const entrada = Number(snapshot?.input?.entrada ?? snapshot?.input?.entradaDisponible ?? 0);

  const ruta = snapshot?.rutaRecomendada || "privada";
  const prep = Number(snapshot?.preparacionPorRuta?.[ruta] ?? 0);

  // 1) Alertas fuertes
  if (Number.isFinite(dti) && dti >= 55) {
    return {
      mensaje: "Tu siguiente mejor paso: bajar tu DTI.",
      razon:
        "Con un DTI alto, tu aprobación baja y la cuota se vuelve más frágil. Si lo reducimos, tu ruta se vuelve mucho más viable.",
      microAccion: "Reducir deudas",
      tipoEstado: "alerta",
    };
  }

  // 2) Entrada baja
  if (Number.isFinite(entrada) && entrada < 10000) {
    return {
      mensaje: "Tu siguiente mejor paso: fortalecer tu entrada.",
      razon:
        "Una entrada más sólida reduce el riesgo, mejora tu aprobación y te deja negociar mejor tasa y plazo.",
      microAccion: "Plan de entrada",
      tipoEstado: "mejora",
    };
  }

  // 3) Ya listo
  if (prep >= 80) {
    return {
      mensaje: "Estás listo para hablar con un banco.",
      razon:
        "Tu perfil ya está en un rango saludable para la ruta recomendada. Podemos avanzar con calma y con estrategia.",
      microAccion: "Hablar con banco",
      tipoEstado: "estable",
    };
  }

  // 4) Default: progreso
  return {
    mensaje: "Sigamos fortaleciendo tu perfil.",
    razon:
      "Vas bien. Con 1–2 ajustes enfocados, tu preparación sube y tu ruta recomendada se vuelve más sólida.",
    microAccion: "Optimizar perfil",
    tipoEstado: "mejora",
  };
}