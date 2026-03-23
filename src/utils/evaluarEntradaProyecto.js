// src/utils/evaluarEntradaProyecto.js

export function evaluarEntradaProyecto({
  precioVivienda,
  porcentajeEntradaRequerida = 0.1,
  entradaDisponibleHoy = 0,
  capacidadEntradaMensual = 0,
  tipoEntrega = "inmediata",
  permiteEntradaEnCuotas = false,
  mesesConstruccionRestantes = 0,
  reservaMinima = 0,
}) {
  const precio = Number(precioVivienda) || 0;
  const pctEntrada = Number(porcentajeEntradaRequerida) || 0;

  const entradaHoy = Number(entradaDisponibleHoy) || 0;
  const capacidadMensual = Number(capacidadEntradaMensual) || 0;

  const meses = Math.max(0, Number(mesesConstruccionRestantes) || 0);
  const reserva = Number(reservaMinima) || 0;

  const entradaRequerida = precio * pctEntrada;

  const faltanteEntrada = Math.max(0, entradaRequerida - entradaHoy);

  const tieneReservaMinima = entradaHoy >= reserva;

  const puedeSepararHoy = tieneReservaMinima;

  // =========================================================
  // CASO 1: PROYECTO ENTREGA INMEDIATA
  // =========================================================

  if (tipoEntrega !== "construccion" || !permiteEntradaEnCuotas) {
    const viableEntrada =
      tieneReservaMinima && entradaHoy >= entradaRequerida;

    let razon =
      "Este proyecto requiere contar con la entrada completa al momento de la compra.";

    if (viableEntrada) {
      razon = "Tienes la entrada requerida hoy.";
    } else if (!tieneReservaMinima) {
      razon = "No cumples con la reserva mínima requerida por el proyecto.";
    }

    return {
      modalidadEntrada: "inmediata",

      entradaRequerida,
      entradaDisponibleHoy: entradaHoy,
      faltanteEntrada,

      cuotaEntradaMensual: null,
      mesesConstruccionRestantes: 0,

      tieneReservaMinima,
      puedeSepararHoy,

      puedeCubrirCuota: false,
      puedeCompletarEntradaDuranteObra: false,

      viableEntrada,
      razon,
    };
  }

  // =========================================================
  // CASO 2: PROYECTO EN CONSTRUCCIÓN
  // =========================================================

  const mesesValidos = Math.max(1, meses);

  const cuotaEntradaMensual =
    faltanteEntrada === 0
      ? 0
      : faltanteEntrada / mesesValidos;

  const puedeCubrirCuota =
    faltanteEntrada === 0 ||
    cuotaEntradaMensual <= capacidadMensual;

  const puedeCompletarEntradaDuranteObra = puedeCubrirCuota;

  const viableEntrada =
    tieneReservaMinima && puedeCubrirCuota;

  let razon =
    "No alcanza a completar la entrada dentro del tiempo de obra.";

  if (viableEntrada) {
    razon =
      "Puedes completar la entrada durante la construcción.";
  } else if (!tieneReservaMinima && puedeCubrirCuota) {
    razon =
      "No tienes la reserva mínima hoy, pero sí podrías completar la entrada durante la construcción.";
  } else if (!tieneReservaMinima) {
    razon =
      "No cumples con la reserva mínima requerida para separar este proyecto.";
  } else if (!puedeCubrirCuota) {
    razon =
      "La cuota mensual de entrada requerida supera tu capacidad mensual estimada.";
  }

  return {
    modalidadEntrada: "construccion",

    entradaRequerida,
    entradaDisponibleHoy: entradaHoy,
    faltanteEntrada,

    cuotaEntradaMensual,
    mesesConstruccionRestantes: mesesValidos,

    tieneReservaMinima,
    puedeSepararHoy,

    puedeCubrirCuota,
    puedeCompletarEntradaDuranteObra,

    viableEntrada,

    razon,
  };
}