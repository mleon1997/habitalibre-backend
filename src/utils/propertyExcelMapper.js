// src/utils/propertyExcelMapper.js
import XLSX from "xlsx";

export const PROPERTY_TEMPLATE_COLUMNS = [
  "id",
  "developer",
  "constructora",
  "promotor",
  "proyecto",
  "titulo",
  "descripcion",

  "unidad",
  "torre",
  "bloque",
  "piso",
  "manzana",
  "lote",

  "tipoInmueble",
  "tipoPropiedad",
  "tipoProyecto",
  "uso",

  "precio",
  "m2Construccion",
  "m2Terreno",
  "dormitorios",
  "banos",
  "parqueaderos",
  "bodega",
  "alicuotaEstimada",

  "ciudad",
  "zona",
  "ciudadZona",
  "sector",
  "direccionReferencial",
  "googleMapsUrl",
  "lat",
  "lng",

  "tipoEntrega",
  "etapaProyecto",
  "estadoProyecto",
  "fechaEntrega",
  "fechaEntregaEstimada",
  "fechaEscrituraEstimada",
  "viviendaNueva",
  "proyectoNuevo",
  "mesesConstruccion",

  "permiteEntradaEnCuotas",
  "porcentajeEntradaRequerida",
  "entradaMinima",
  "reservaMinima",
  "montoFirmaPromesa",
  "numeroCuotasEntrada",
  "fechaLimiteEntrada",

  "cuotaEstimada",
  "tasaReferencial",
  "plazoAnios",

  "productIds",

  "aceptaCreditoHipotecario",
  "aceptaBIESS",
  "aceptaBancaPrivada",
  "aceptaCooperativas",
  "aceptaContado",
  "bancoAliado",
  "proyectoCalificadoMiduvi",

  "requiresFirstHome",
  "requiresNewConstruction",
  "requiresMiduviQualifiedProject",

  "imagen",
  "galeria",
  "planoUrl",
  "nearby",
  "amenities",
  "brochureUrl",
  "videoUrl",

  "estadoComercial",
  "publicado",
  "orden",
];

export const PROPERTY_ALLOWED_VALUES = [
  {
    campo: "tipoInmueble",
    valoresPermitidos: "departamento | suite | estudio | casa | terreno",
    ejemplos: "departamento, estudio, casa",
    notas: "Si es estudio, usar dormitorios = 0.",
  },
  {
    campo: "tipoPropiedad",
    valoresPermitidos: "Texto visible",
    ejemplos: "Estudio, Departamento, Casa",
    notas: "Campo más comercial para mostrar en Property Detail. Puede coincidir con tipoInmueble.",
  },
  {
    campo: "tipoProyecto",
    valoresPermitidos: "edificio | conjunto | urbanizacion | independiente | otro",
    ejemplos: "edificio, conjunto",
    notas: "Para casas en conjunto usar tipoProyecto = conjunto.",
  },
  {
    campo: "uso",
    valoresPermitidos: "vivienda_principal | inversion | terreno | comercial | otro",
    ejemplos: "vivienda_principal",
    notas: "Para HabitaLibre normalmente usar vivienda_principal.",
  },
  {
    campo: "tipoEntrega",
    valoresPermitidos: "construccion | inmediata | planos",
    ejemplos: "construccion",
    notas: "No necesitas avance de obra exacto.",
  },
  {
    campo: "etapaProyecto",
    valoresPermitidos:
      "planos | construccion | entrega_proxima | entrega_inmediata | terminado",
    ejemplos: "construccion, entrega_inmediata",
    notas: "Puede ser una aproximación comercial.",
  },
  {
    campo: "estadoProyecto",
    valoresPermitidos: "Texto libre",
    ejemplos: "Proyecto nuevo, En construcción, Entrega inmediata",
    notas: "Texto visible en la ficha de propiedad.",
  },
  {
    campo: "estadoComercial",
    valoresPermitidos: "disponible | pausado | reservado | vendido | oculto",
    ejemplos: "pausado",
    notas: "Recomendado cargar inicialmente como pausado.",
  },
  {
    campo: "proyectoCalificadoMiduvi",
    valoresPermitidos: "si | no | pendiente | no_aplica",
    ejemplos: "pendiente",
    notas: "Si no sabes, usa pendiente o no_aplica.",
  },
  {
    campo: "booleanos",
    valoresPermitidos: "si | no | true | false | 1 | 0",
    ejemplos: "si",
    notas: "El sistema acepta variaciones razonables.",
  },
  {
    campo: "porcentajeEntradaRequerida",
    valoresPermitidos: "0.1 | 10% | 10",
    ejemplos: "0.1",
    notas: "0.1 significa 10%. 0.05 significa 5%. Si usas entradaMinima, el sistema puede calcular el porcentaje.",
  },
  {
    campo: "entradaMinima",
    valoresPermitidos: "Número",
    ejemplos: "5290",
    notas: "Monto de entrada requerido. Se muestra en Property Detail.",
  },
  {
    campo: "cuotaEstimada",
    valoresPermitidos: "Número",
    ejemplos: "240",
    notas: "Cuota hipotecaria referencial mensual. Si no se conoce, dejar vacío.",
  },
  {
    campo: "tasaReferencial",
    valoresPermitidos: "Número",
    ejemplos: "8.5",
    notas: "Tasa anual referencial. Si no se conoce, dejar vacío.",
  },
  {
    campo: "plazoAnios",
    valoresPermitidos: "Número",
    ejemplos: "20",
    notas: "Plazo referencial en años. Si no se conoce, dejar vacío.",
  },
  {
    campo: "fechas",
    valoresPermitidos: "YYYY-MM-DD",
    ejemplos: "2027-12-01",
    notas: "Usa este formato para evitar errores. fechaEntrega puede ser texto comercial.",
  },
  {
    campo: "productIds",
    valoresPermitidos: "VIP | VIS | BIESS | PRIVATE separados por coma",
    ejemplos: "VIP,PRIVATE",
    notas: "Campo legacy. HabitaLibre igual calcula rutas con reglas internas.",
  },
  {
    campo: "galeria",
    valoresPermitidos: "URLs separadas por coma, punto y coma o salto de línea",
    ejemplos: "https://imagen1.com, https://imagen2.com",
    notas: "Opcional.",
  },
  {
    campo: "planoUrl",
    valoresPermitidos: "URL",
    ejemplos: "https://.../plano.jpg",
    notas: "Plano de distribución para Property Detail.",
  },
  {
    campo: "nearby",
    valoresPermitidos: "Textos separados por coma, punto y coma o salto de línea",
    ejemplos: "Zona financiera, Transporte cercano, Supermercados",
    notas: "Se muestra como entorno cercano.",
  },
  {
    campo: "amenities",
    valoresPermitidos: "Textos separados por coma, punto y coma o salto de línea",
    ejemplos: "Lobby, Terraza, Coworking, Gimnasio",
    notas: "Amenidades del proyecto.",
  },
  {
    campo: "lat/lng",
    valoresPermitidos: "Número decimal",
    ejemplos: "-0.1807, -78.4678",
    notas: "Coordenadas para abrir la zona en Google Maps.",
  },
];

export const PROPERTY_FIELD_GUIDE = [
  {
    campo: "id",
    obligatorio: "Sí",
    formatoEsperado: "Texto único, sin espacios",
    ejemploValido: "gls_hp6_a1201",
    notas: "Si el ID ya existe, la carga masiva actualizará esa propiedad.",
  },
  {
    campo: "developer",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "GLS Constructores",
    notas: "Promotor o desarrollador. Se mantiene por compatibilidad.",
  },
  {
    campo: "constructora",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "GLS Constructores",
    notas: "Nombre visible como constructora.",
  },
  {
    campo: "promotor",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "GLS Constructores",
    notas: "Nombre visible como promotor.",
  },
  {
    campo: "proyecto",
    obligatorio: "Sí",
    formatoEsperado: "Texto",
    ejemploValido: "High Point 6",
    notas: "Nombre comercial del proyecto.",
  },
  {
    campo: "titulo",
    obligatorio: "Sí",
    formatoEsperado: "Texto",
    ejemploValido: "Departamento A1201 - High Point 6",
    notas: "Título visible para el usuario/admin.",
  },
  {
    campo: "descripcion",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "Departamento disponible en proyecto High Point 6.",
    notas: "Descripción comercial corta.",
  },
  {
    campo: "unidad",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "A1201",
    notas: "Código interno de unidad, departamento, casa o lote.",
  },
  {
    campo: "torre",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "Torre A",
    notas: "Opcional para edificios.",
  },
  {
    campo: "tipoInmueble",
    obligatorio: "Sí",
    formatoEsperado: "departamento / suite / estudio / casa / terreno",
    ejemploValido: "estudio",
    notas: "Estudio es un tipo de inmueble, no una característica.",
  },
  {
    campo: "tipoPropiedad",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "Estudio",
    notas: "Texto más comercial para mostrar en Property Detail.",
  },
  {
    campo: "tipoProyecto",
    obligatorio: "Sí",
    formatoEsperado: "edificio / conjunto / urbanizacion / independiente / otro",
    ejemploValido: "edificio",
    notas: "Para casas puede ser conjunto o urbanizacion.",
  },
  {
    campo: "uso",
    obligatorio: "No",
    formatoEsperado: "vivienda_principal / inversion / terreno / comercial / otro",
    ejemploValido: "vivienda_principal",
    notas: "Normalmente vivienda_principal.",
  },
  {
    campo: "precio",
    obligatorio: "Sí",
    formatoEsperado: "Número",
    ejemploValido: "98500",
    notas: "Precio de venta. No uses símbolos si puedes evitarlo.",
  },
  {
    campo: "m2Construccion",
    obligatorio: "Sí",
    formatoEsperado: "Número",
    ejemploValido: "72",
    notas: "Metros cuadrados de construcción.",
  },
  {
    campo: "m2Terreno",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "0",
    notas: "Para departamentos puede ir 0. Para casas/lotes sí es útil.",
  },
  {
    campo: "dormitorios",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "2",
    notas: "Para estudio usar 0.",
  },
  {
    campo: "banos",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "2",
    notas: "Usar número entero.",
  },
  {
    campo: "parqueaderos",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "1",
    notas: "Usar 0 si no tiene.",
  },
  {
    campo: "ciudad",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "Quito",
    notas: "Ciudad principal.",
  },
  {
    campo: "zona",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "Quito",
    notas: "Zona general.",
  },
  {
    campo: "sector",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "Centro Norte",
    notas: "Sector comercial.",
  },
  {
    campo: "direccionReferencial",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "Av. 6 de Diciembre y Portugal",
    notas: "Dirección aproximada o referencial.",
  },
  {
    campo: "googleMapsUrl",
    obligatorio: "No",
    formatoEsperado: "URL",
    ejemploValido: "https://maps.google.com/...",
    notas: "Opcional.",
  },
  {
    campo: "lat",
    obligatorio: "No",
    formatoEsperado: "Número decimal",
    ejemploValido: "-0.1807",
    notas: "Latitud para mapa.",
  },
  {
    campo: "lng",
    obligatorio: "No",
    formatoEsperado: "Número decimal",
    ejemploValido: "-78.4678",
    notas: "Longitud para mapa.",
  },
  {
    campo: "tipoEntrega",
    obligatorio: "Sí",
    formatoEsperado: "construccion / inmediata / planos",
    ejemploValido: "construccion",
    notas: "Sirve para calcular si puede pagar entrada durante construcción.",
  },
  {
    campo: "estadoProyecto",
    obligatorio: "No",
    formatoEsperado: "Texto",
    ejemploValido: "Proyecto nuevo",
    notas: "Texto visible en Property Detail.",
  },
  {
    campo: "fechaEntrega",
    obligatorio: "No",
    formatoEsperado: "Texto comercial",
    ejemploValido: "Diciembre 2026",
    notas: "Texto visible para el usuario.",
  },
  {
    campo: "fechaEntregaEstimada",
    obligatorio: "No",
    formatoEsperado: "YYYY-MM-DD",
    ejemploValido: "2027-12-01",
    notas: "Muy recomendable si está en construcción o planos.",
  },
  {
    campo: "mesesConstruccion",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "18",
    notas: "Meses restantes de construcción. Si hay fechaEntregaEstimada, puede recalcularse.",
  },
  {
    campo: "viviendaNueva",
    obligatorio: "No",
    formatoEsperado: "si / no",
    ejemploValido: "si",
    notas: "Relevante para VIP/VIS/BIESS según reglas internas.",
  },
  {
    campo: "porcentajeEntradaRequerida",
    obligatorio: "No",
    formatoEsperado: "0.1 o 10%",
    ejemploValido: "0.1",
    notas: "0.1 = 10%.",
  },
  {
    campo: "entradaMinima",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "9850",
    notas: "Monto de entrada requerido.",
  },
  {
    campo: "reservaMinima",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "500",
    notas: "Monto mínimo de reserva.",
  },
  {
    campo: "montoFirmaPromesa",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "2500",
    notas: "Monto pagado a la firma de promesa.",
  },
  {
    campo: "numeroCuotasEntrada",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "18",
    notas: "Número de cuotas disponibles para pagar entrada.",
  },
  {
    campo: "cuotaEstimada",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "420",
    notas: "Cuota hipotecaria referencial mensual.",
  },
  {
    campo: "tasaReferencial",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "8.5",
    notas: "Tasa anual referencial. Si no se sabe, dejar vacío.",
  },
  {
    campo: "plazoAnios",
    obligatorio: "No",
    formatoEsperado: "Número",
    ejemploValido: "20",
    notas: "Plazo referencial en años.",
  },
  {
    campo: "aceptaBIESS",
    obligatorio: "No",
    formatoEsperado: "si / no",
    ejemploValido: "si",
    notas: "Si no sabes, usa si solo si el proyecto normalmente acepta BIESS.",
  },
  {
    campo: "aceptaBancaPrivada",
    obligatorio: "No",
    formatoEsperado: "si / no",
    ejemploValido: "si",
    notas: "Bancos privados.",
  },
  {
    campo: "aceptaCooperativas",
    obligatorio: "No",
    formatoEsperado: "si / no",
    ejemploValido: "no",
    notas: "Opcional.",
  },
  {
    campo: "proyectoCalificadoMiduvi",
    obligatorio: "No",
    formatoEsperado: "si / no / pendiente / no_aplica",
    ejemploValido: "pendiente",
    notas: "No bloquea carga. Sirve para rutas VIP/VIS.",
  },
  {
    campo: "imagen",
    obligatorio: "No",
    formatoEsperado: "URL",
    ejemploValido: "https://via.placeholder.com/1200x800",
    notas: "Imagen principal.",
  },
  {
    campo: "galeria",
    obligatorio: "No",
    formatoEsperado: "URLs separadas por coma o salto de línea",
    ejemploValido: "https://img1.com, https://img2.com",
    notas: "Opcional.",
  },
  {
    campo: "planoUrl",
    obligatorio: "No",
    formatoEsperado: "URL",
    ejemploValido: "https://via.placeholder.com/1200x800",
    notas: "Plano de distribución.",
  },
  {
    campo: "nearby",
    obligatorio: "No",
    formatoEsperado: "Texto separado por coma",
    ejemploValido: "Zona financiera, Transporte cercano, Supermercados",
    notas: "Se muestra en Entorno cercano.",
  },
  {
    campo: "amenities",
    obligatorio: "No",
    formatoEsperado: "Texto separado por coma",
    ejemploValido: "Lobby, Terraza, Coworking, Gimnasio",
    notas: "Se muestra en Sobre el proyecto.",
  },
  {
    campo: "estadoComercial",
    obligatorio: "Sí",
    formatoEsperado: "disponible / pausado / reservado / vendido / oculto",
    ejemploValido: "pausado",
    notas: "Recomendado iniciar en pausado para revisar antes de publicar.",
  },
  {
    campo: "publicado",
    obligatorio: "Sí",
    formatoEsperado: "si / no",
    ejemploValido: "no",
    notas: "Recomendado cargar como no y publicar luego desde admin.",
  },
];

export const PROPERTY_INSTRUCTIONS = [
  ["Instrucción", "Detalle"],
  [
    "1. No cambies los nombres de columnas",
    "La fila 1 debe mantenerse igual para que HabitaLibre pueda leer el archivo.",
  ],
  [
    "2. Una propiedad por fila",
    "Cada fila representa una unidad, casa, estudio, suite, lote o departamento.",
  ],
  [
    "3. Primero previsualiza",
    "La carga masiva no guarda nada hasta que presiones Confirmar carga.",
  ],
  [
    "4. Usa estado pausado al inicio",
    "Recomendado: estadoComercial = pausado y publicado = no.",
  ],
  [
    "5. Estudio",
    "Para estudios usa tipoInmueble = estudio y dormitorios = 0.",
  ],
  [
    "6. Entrada requerida",
    "Puedes usar porcentajeEntradaRequerida o entradaMinima. Si usas entradaMinima, HabitaLibre puede calcular el porcentaje contra el precio.",
  ],
  [
    "7. Fechas",
    "Usa formato YYYY-MM-DD en fechaEntregaEstimada. Para fechaEntrega puedes usar texto comercial como Diciembre 2026.",
  ],
  [
    "8. Booleanos",
    "Puedes usar si/no, true/false o 1/0.",
  ],
  [
    "9. Actualización por ID",
    "Si cargas una fila con un id existente, el sistema actualizará esa propiedad.",
  ],
  [
    "10. Property Detail",
    "Para una ficha completa, llena imagen, galeria, planoUrl, nearby, amenities, lat/lng, entradaMinima, cuotaEstimada, tasaReferencial y plazoAnios.",
  ],
  [
    "11. Campos obligatorios mínimos",
    "id, proyecto, titulo, precio, m2Construccion, tipoInmueble, tipoProyecto, tipoEntrega, estadoComercial y publicado.",
  ],
];

export function buildPropertyTemplateRows() {
  return [
    {
      id: "gls_hp6_a1201",
      developer: "GLS Constructores",
      constructora: "GLS Constructores",
      promotor: "GLS Constructores",
      proyecto: "High Point 6",
      titulo: "Departamento A1201 - High Point 6",
      descripcion: "Departamento disponible en proyecto High Point 6.",

      unidad: "A1201",
      torre: "Torre A",
      bloque: "",
      piso: 12,
      manzana: "",
      lote: "",

      tipoInmueble: "departamento",
      tipoPropiedad: "Departamento",
      tipoProyecto: "edificio",
      uso: "vivienda_principal",

      precio: 98500,
      m2Construccion: 72,
      m2Terreno: 0,
      dormitorios: 2,
      banos: 2,
      parqueaderos: 1,
      bodega: "no",
      alicuotaEstimada: 0,

      ciudad: "Quito",
      zona: "Quito",
      ciudadZona: "Norte de Quito",
      sector: "Centro Norte",
      direccionReferencial: "",
      googleMapsUrl: "",
      lat: -0.1807,
      lng: -78.4678,

      tipoEntrega: "construccion",
      etapaProyecto: "construccion",
      estadoProyecto: "Proyecto nuevo",
      fechaEntrega: "Diciembre 2027",
      fechaEntregaEstimada: "2027-12-01",
      fechaEscrituraEstimada: "",
      viviendaNueva: "si",
      proyectoNuevo: "si",
      mesesConstruccion: 18,

      permiteEntradaEnCuotas: "si",
      porcentajeEntradaRequerida: 0.1,
      entradaMinima: 9850,
      reservaMinima: 500,
      montoFirmaPromesa: 2500,
      numeroCuotasEntrada: 18,
      fechaLimiteEntrada: "",

      cuotaEstimada: 420,
      tasaReferencial: 8.5,
      plazoAnios: 20,

      productIds: "VIP,PRIVATE",

      aceptaCreditoHipotecario: "si",
      aceptaBIESS: "si",
      aceptaBancaPrivada: "si",
      aceptaCooperativas: "no",
      aceptaContado: "si",
      bancoAliado: "",
      proyectoCalificadoMiduvi: "pendiente",

      requiresFirstHome: "si",
      requiresNewConstruction: "si",
      requiresMiduviQualifiedProject: "no",

      imagen: "https://via.placeholder.com/1200x800",
      galeria:
        "https://via.placeholder.com/1200x800, https://via.placeholder.com/1200x801",
      planoUrl: "https://via.placeholder.com/1200x800",
      nearby: "Zona financiera, Transporte cercano, Supermercados y servicios",
      amenities: "Lobby, Terraza, Coworking, Seguridad",
      brochureUrl: "",
      videoUrl: "",

      estadoComercial: "pausado",
      publicado: "no",
      orden: 1,
    },
    {
      id: "gls_hp6_estudio_001",
      developer: "GLS Constructores",
      constructora: "GLS Constructores",
      promotor: "GLS Constructores",
      proyecto: "High Point 6",
      titulo: "Estudio E401 - High Point 6",
      descripcion: "Estudio disponible en proyecto High Point 6.",

      unidad: "E401",
      torre: "Torre A",
      bloque: "",
      piso: 4,
      manzana: "",
      lote: "",

      tipoInmueble: "estudio",
      tipoPropiedad: "Estudio",
      tipoProyecto: "edificio",
      uso: "vivienda_principal",

      precio: 71500,
      m2Construccion: 45,
      m2Terreno: 0,
      dormitorios: 0,
      banos: 1,
      parqueaderos: 1,
      bodega: "no",
      alicuotaEstimada: 0,

      ciudad: "Quito",
      zona: "Quito",
      ciudadZona: "Norte de Quito",
      sector: "Centro Norte",
      direccionReferencial: "",
      googleMapsUrl: "",
      lat: -0.1807,
      lng: -78.4678,

      tipoEntrega: "construccion",
      etapaProyecto: "construccion",
      estadoProyecto: "Proyecto nuevo",
      fechaEntrega: "Diciembre 2027",
      fechaEntregaEstimada: "2027-12-01",
      fechaEscrituraEstimada: "",
      viviendaNueva: "si",
      proyectoNuevo: "si",
      mesesConstruccion: 18,

      permiteEntradaEnCuotas: "si",
      porcentajeEntradaRequerida: "10%",
      entradaMinima: 7150,
      reservaMinima: 500,
      montoFirmaPromesa: 2500,
      numeroCuotasEntrada: 18,
      fechaLimiteEntrada: "",

      cuotaEstimada: 305,
      tasaReferencial: 8.5,
      plazoAnios: 20,

      productIds: "VIP,PRIVATE",

      aceptaCreditoHipotecario: "si",
      aceptaBIESS: "si",
      aceptaBancaPrivada: "si",
      aceptaCooperativas: "no",
      aceptaContado: "si",
      bancoAliado: "",
      proyectoCalificadoMiduvi: "pendiente",

      requiresFirstHome: "si",
      requiresNewConstruction: "si",
      requiresMiduviQualifiedProject: "no",

      imagen: "https://via.placeholder.com/1200x800",
      galeria:
        "https://via.placeholder.com/1200x800, https://via.placeholder.com/1200x801",
      planoUrl: "https://via.placeholder.com/1200x800",
      nearby: "Zona financiera, Transporte cercano, Cafeterías",
      amenities: "Lobby, Coworking, Terraza",
      brochureUrl: "",
      videoUrl: "",

      estadoComercial: "pausado",
      publicado: "no",
      orden: 2,
    },
    {
      id: "gls_casas_c01",
      developer: "GLS Constructores",
      constructora: "GLS Constructores",
      promotor: "GLS Constructores",
      proyecto: "Conjunto Casas GLS",
      titulo: "Casa C01 - Conjunto Casas GLS",
      descripcion: "Casa en conjunto residencial.",

      unidad: "C01",
      torre: "",
      bloque: "",
      piso: "",
      manzana: "M1",
      lote: "L01",

      tipoInmueble: "casa",
      tipoPropiedad: "Casa",
      tipoProyecto: "conjunto",
      uso: "vivienda_principal",

      precio: 125000,
      m2Construccion: 105,
      m2Terreno: 140,
      dormitorios: 3,
      banos: 2,
      parqueaderos: 2,
      bodega: "no",
      alicuotaEstimada: 0,

      ciudad: "Quito",
      zona: "Quito",
      ciudadZona: "Norte de Quito",
      sector: "Tumbaco",
      direccionReferencial: "",
      googleMapsUrl: "",
      lat: -0.212,
      lng: -78.427,

      tipoEntrega: "inmediata",
      etapaProyecto: "entrega_inmediata",
      estadoProyecto: "Entrega inmediata",
      fechaEntrega: "Entrega inmediata",
      fechaEntregaEstimada: "",
      fechaEscrituraEstimada: "",
      viviendaNueva: "si",
      proyectoNuevo: "si",
      mesesConstruccion: 0,

      permiteEntradaEnCuotas: "no",
      porcentajeEntradaRequerida: 0.1,
      entradaMinima: 12500,
      reservaMinima: 1000,
      montoFirmaPromesa: 5000,
      numeroCuotasEntrada: 0,
      fechaLimiteEntrada: "",

      cuotaEstimada: 535,
      tasaReferencial: 8.5,
      plazoAnios: 20,

      productIds: "PRIVATE,BIESS",

      aceptaCreditoHipotecario: "si",
      aceptaBIESS: "si",
      aceptaBancaPrivada: "si",
      aceptaCooperativas: "no",
      aceptaContado: "si",
      bancoAliado: "",
      proyectoCalificadoMiduvi: "no_aplica",

      requiresFirstHome: "no",
      requiresNewConstruction: "si",
      requiresMiduviQualifiedProject: "no",

      imagen: "https://via.placeholder.com/1200x800",
      galeria: "",
      planoUrl: "",
      nearby: "Zona residencial, Áreas verdes, Vías principales",
      amenities: "Guardianía, Áreas comunales",
      brochureUrl: "",
      videoUrl: "",

      estadoComercial: "pausado",
      publicado: "no",
      orden: 3,
    },
  ];
}

function normalizeKey(key) {
  return String(key || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeRow(row) {
  const out = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    out[normalizeKey(key)] = value;
  });

  return out;
}

function get(row, keys, fallback = "") {
  for (const key of keys) {
    const normalized = normalizeKey(key);

    if (Object.prototype.hasOwnProperty.call(row, normalized)) {
      return row[normalized];
    }
  }

  return fallback;
}

function cleanString(value, fallback = "") {
  const s = String(value ?? "").trim();
  return s || fallback;
}

function parseNumber(value, fallback = 0) {
  if (value === "" || value == null) return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  let s = String(value).trim();
  if (!s) return fallback;

  s = s.replace(/\$/g, "").replace(/\s/g, "");

  if (s.includes(",") && !s.includes(".")) {
    const parts = s.split(",");

    if (parts.length === 2 && parts[1]?.length === 3) {
      s = parts.join("");
    } else {
      s = s.replace(",", ".");
    }
  } else if (s.includes(",") && s.includes(".")) {
    const commaIndex = s.lastIndexOf(",");
    const dotIndex = s.lastIndexOf(".");

    if (commaIndex > dotIndex) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(".")) {
    const parts = s.split(".");

    if (parts.length === 2 && parts[1]?.length === 3) {
      s = parts.join("");
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function parseNumberOrNull(value) {
  if (value === "" || value == null) return null;

  const n = parseNumber(value, NaN);

  return Number.isFinite(n) ? n : null;
}

function parseCoordinate(value) {
  if (value === "" || value == null) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;

    if (Math.abs(value) <= 180) return value;

    const dividedBy1000 = value / 1000;
    if (Math.abs(dividedBy1000) <= 180) return dividedBy1000;

    const dividedBy10000 = value / 10000;
    if (Math.abs(dividedBy10000) <= 180) return dividedBy10000;

    return null;
  }

  const s = String(value).trim().replace(",", ".");

  if (!s) return null;

  const n = Number(s);

  if (!Number.isFinite(n)) return null;

  if (Math.abs(n) <= 180) return n;

  const dividedBy1000 = n / 1000;
  if (Math.abs(dividedBy1000) <= 180) return dividedBy1000;

  const dividedBy10000 = n / 10000;
  if (Math.abs(dividedBy10000) <= 180) return dividedBy10000;

  return null;
}

function parseBoolean(value, fallback = false) {
  if (value === "" || value == null) return fallback;

  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const s = String(value).trim().toLowerCase();

  if (["true", "si", "sí", "s", "yes", "y", "1", "x"].includes(s)) {
    return true;
  }

  if (["false", "no", "n", "0"].includes(s)) {
    return false;
  }

  return fallback;
}

function parsePercentage(value, fallback = 0.1) {
  if (value === "" || value == null) return fallback;

  const raw = String(value).trim();

  if (raw.endsWith("%")) {
    const n = parseNumber(raw.replace("%", ""), NaN);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n / 100)) : fallback;
  }

  const n = parseNumber(value, NaN);

  if (!Number.isFinite(n)) return fallback;

  if (n > 1) return Math.max(0, Math.min(1, n / 100));

  return Math.max(0, Math.min(1, n));
}

function parseDate(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed?.y && parsed?.m && parsed?.d) {
      const yyyy = String(parsed.y).padStart(4, "0");
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const s = String(value).trim();

  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (slash) {
    const dd = slash[1].padStart(2, "0");
    const mm = slash[2].padStart(2, "0");
    const yyyy = slash[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const d = new Date(s);

  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return null;
}

function cleanCSV(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

function cleanLines(value) {
  return String(value || "")
    .split(/[\n,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function enumValue(value, allowed, fallback, aliases = {}) {
  const raw = cleanString(value, fallback);
  const normalized = normalizeKey(raw);

  if (aliases[normalized]) return aliases[normalized];

  const direct = allowed.find((x) => normalizeKey(x) === normalized);

  return direct || fallback;
}

function inferEstadoProyecto(etapaProyecto, tipoEntrega, viviendaNueva) {
  if (etapaProyecto === "entrega_inmediata" || tipoEntrega === "inmediata") {
    return "Entrega inmediata";
  }

  if (etapaProyecto === "entrega_proxima") {
    return "Entrega próxima";
  }

  if (etapaProyecto === "planos" || tipoEntrega === "planos") {
    return "En planos";
  }

  if (etapaProyecto === "terminado") {
    return "Terminado";
  }

  return viviendaNueva ? "Proyecto nuevo" : "En construcción";
}

export function normalizePropertyExcelRow(rawRow, rowNumber) {
  const row = normalizeRow(rawRow);

  const tipoInmueble = enumValue(
    get(row, ["tipoInmueble", "tipo inmueble", "tipoPropiedad", "tipo propiedad"], "departamento"),
    ["departamento", "suite", "estudio", "casa", "terreno"],
    "departamento",
    {
      depto: "departamento",
      departamento: "departamento",
      departamentos: "departamento",
      suite: "suite",
      suites: "suite",
      estudio: "estudio",
      studio: "estudio",
      monoambiente: "estudio",
      casa: "casa",
      casas: "casa",
      terreno: "terreno",
      lote: "terreno",
    }
  );

  const tipoProyecto = enumValue(
    get(row, ["tipoProyecto", "tipo proyecto"], "edificio"),
    ["edificio", "conjunto", "urbanizacion", "independiente", "otro"],
    "edificio",
    {
      edificio: "edificio",
      conjunto: "conjunto",
      urbanizacion: "urbanizacion",
      urbanización: "urbanizacion",
      independiente: "independiente",
      otro: "otro",
    }
  );

  const tipoEntrega = enumValue(
    get(row, ["tipoEntrega", "tipo entrega"], "construccion"),
    ["construccion", "inmediata", "planos"],
    "construccion",
    {
      construccion: "construccion",
      construccionenobra: "construccion",
      enconstruccion: "construccion",
      inmediata: "inmediata",
      entregainmediata: "inmediata",
      planos: "planos",
      enplanos: "planos",
    }
  );

  const etapaProyecto = enumValue(
    get(row, ["etapaProyecto", "etapa proyecto"], tipoEntrega),
    [
      "planos",
      "construccion",
      "entrega_proxima",
      "entrega_inmediata",
      "terminado",
    ],
    tipoEntrega === "inmediata" ? "entrega_inmediata" : tipoEntrega,
    {
      planos: "planos",
      construccion: "construccion",
      entrega: "entrega_proxima",
      entregaproxima: "entrega_proxima",
      entregainmediata: "entrega_inmediata",
      inmediata: "entrega_inmediata",
      terminado: "terminado",
    }
  );

  const estadoComercial = enumValue(
    get(row, ["estadoComercial", "estado comercial"], "pausado"),
    ["disponible", "pausado", "reservado", "vendido", "oculto"],
    "pausado",
    {
      disponible: "disponible",
      publicado: "disponible",
      pausado: "pausado",
      pausa: "pausado",
      reservado: "reservado",
      vendida: "vendido",
      vendido: "vendido",
      oculto: "oculto",
    }
  );

  const proyectoCalificadoMiduvi = enumValue(
    get(
      row,
      ["proyectoCalificadoMiduvi", "proyecto calificado miduvi"],
      "no_aplica"
    ),
    ["si", "no", "pendiente", "no_aplica"],
    "no_aplica",
    {
      si: "si",
      sí: "si",
      no: "no",
      pendiente: "pendiente",
      noaplica: "no_aplica",
      na: "no_aplica",
    }
  );

  const precio = parseNumber(
    get(row, ["precio", "precioVenta", "precio venta"], 0),
    0
  );

  const m2Construccion = parseNumber(
    get(
      row,
      ["m2Construccion", "m2 construcción", "m2", "metros construccion", "area", "área"],
      0
    ),
    0
  );

  const entradaMinima = parseNumberOrNull(
    get(row, ["entradaMinima", "entrada mínima", "entradaRequerida", "entrada requerida"], "")
  );

  const downPaymentPct = entradaMinima != null && precio > 0
    ? Math.max(0, Math.min(1, entradaMinima / precio))
    : parsePercentage(
        get(
          row,
          ["porcentajeEntradaRequerida", "porcentaje entrada", "entrada requerida"],
          0.1
        ),
        0.1
      );

  const reserveMin = parseNumber(
    get(row, ["reservaMinima", "reserva mínima", "reserva"], 0),
    0
  );

  const monthsConstruction = parseNumber(
    get(
      row,
      [
        "mesesConstruccion",
        "meses construcción",
        "mesesConstruccionRestantes",
        "meses construcción restantes",
        "mesesEntrega",
      ],
      0
    ),
    0
  );

  const promesaAmount = parseNumber(
    get(row, ["montoFirmaPromesa", "monto firma promesa", "promesa"], 0),
    0
  );

  const entryInstallmentsCount = parseNumber(
    get(row, ["numeroCuotasEntrada", "numero cuotas entrada", "cuotas entrada"], monthsConstruction),
    monthsConstruction
  );

  const cuotaEstimada = parseNumberOrNull(
    get(row, ["cuotaEstimada", "cuota estimada", "cuota", "monthlyPaymentEstimate"], "")
  );

  const tasaReferencial = parseNumberOrNull(
    get(row, ["tasaReferencial", "tasa referencial", "tasa", "referenceRate"], "")
  );

  const plazoAnios = parseNumberOrNull(
    get(row, ["plazoAnios", "plazo años", "plazoAños", "plazo", "termYears"], "")
  );

const lat = parseCoordinate(
  get(row, ["lat", "latitude", "latitud"], "")
);

const lng = parseCoordinate(
  get(row, ["lng", "lon", "longitude", "longitud"], "")
);

  const aceptaBIESS = parseBoolean(
    get(row, ["aceptaBIESS", "acepta biess"], true),
    true
  );

  const aceptaBancaPrivada = parseBoolean(
    get(row, ["aceptaBancaPrivada", "acepta banca privada"], true),
    true
  );

  const rawProductIds = cleanCSV(
    get(row, ["productIds", "productosHipotecarios"], "")
  );

  const productIds = rawProductIds.length
    ? rawProductIds
    : [
        ...(aceptaBIESS ? ["BIESS"] : []),
        ...(aceptaBancaPrivada ? ["PRIVATE"] : []),
      ];

  const publicadoRaw = parseBoolean(get(row, ["publicado"], false), false);
  const publicado = estadoComercial === "disponible" ? publicadoRaw : false;

  const fechaEntregaEstimada = parseDate(
    get(row, ["fechaEntregaEstimada", "fecha entrega estimada"], "")
  );

  const fechaEntregaVisible = cleanString(
    get(row, ["fechaEntrega", "fecha entrega"], fechaEntregaEstimada || "")
  );

  const fechaLimiteEntrada = parseDate(
    get(row, ["fechaLimiteEntrada", "fecha limite entrada"], "")
  );

  const viviendaNueva = parseBoolean(
    get(row, ["viviendaNueva", "vivienda nueva"], true),
    true
  );

  const proyectoNuevo = parseBoolean(
    get(row, ["proyectoNuevo", "proyecto nuevo"], viviendaNueva),
    viviendaNueva
  );

  const developer = cleanString(
    get(row, ["developer", "promotor", "desarrollador", "constructora"], "GLS Constructores")
  );

  const constructora = cleanString(
    get(row, ["constructora", "developer", "promotor", "desarrollador"], developer)
  );

  const promotor = cleanString(
    get(row, ["promotor", "constructora", "developer", "desarrollador"], constructora)
  );

  const estadoProyecto = cleanString(
    get(
      row,
      ["estadoProyecto", "estado proyecto", "statusProyecto", "status proyecto"],
      inferEstadoProyecto(etapaProyecto, tipoEntrega, viviendaNueva)
    )
  );

  const tipoPropiedad = cleanString(
    get(row, ["tipoPropiedad", "tipo propiedad"], tipoInmueble)
  );

  const imagen = cleanString(
    get(row, ["imagen", "imagenPrincipal", "imagen principal", "image", "imageUrl"], "")
  );

  const galeria = cleanLines(
    get(row, ["galeria", "galería", "gallery", "imagenes", "imágenes", "fotos"], "")
  );

  const planoUrl = cleanString(
    get(row, ["planoUrl", "plano", "floorPlan", "floorPlanUrl", "plano url"], "")
  );

  const nearby = cleanLines(
    get(row, ["nearby", "cercaDe", "cerca de", "entorno", "puntosCercanos"], "")
  );

  const amenities = cleanLines(
    get(row, ["amenities", "amenidades"], "")
  );

  const payload = {
    id: cleanString(get(row, ["id", "idComercial", "id comercial"], "")),

    developer,
    constructora,
    promotor,

    proyecto: cleanString(get(row, ["proyecto"], "")),
    titulo: cleanString(get(row, ["titulo", "título", "tituloComercial"], "")),
    descripcion: cleanString(get(row, ["descripcion", "descripción"], "")),

    unidad: cleanString(get(row, ["unidad"], "")),
    torre: cleanString(get(row, ["torre"], "")),
    bloque: cleanString(get(row, ["bloque"], "")),
    piso: parseNumberOrNull(get(row, ["piso"], "")),
    manzana: cleanString(get(row, ["manzana"], "")),
    lote: cleanString(get(row, ["lote"], "")),

    tipoInmueble,
    tipoPropiedad,
    tipoProyecto,
    uso: enumValue(
      get(row, ["uso"], "vivienda_principal"),
      ["vivienda_principal", "inversion", "terreno", "comercial", "otro"],
      "vivienda_principal",
      {
        vivienda: "vivienda_principal",
        viviendaprincipal: "vivienda_principal",
        inversion: "inversion",
        inversión: "inversion",
        terreno: "terreno",
        comercial: "comercial",
        otro: "otro",
      }
    ),

    precio,
    m2: m2Construccion,
    m2Construccion,
    m2Terreno: parseNumber(get(row, ["m2Terreno", "m2 terreno"], 0), 0),
    dormitorios:
      tipoInmueble === "estudio"
        ? 0
        : parseNumber(get(row, ["dormitorios", "habitaciones"], 0), 0),
    banos: parseNumber(get(row, ["banos", "baños", "bathrooms"], 0), 0),
    parqueaderos: parseNumber(get(row, ["parqueaderos", "garajes", "parking"], 0), 0),
    bodega: parseBoolean(get(row, ["bodega"], false), false),
    alicuotaEstimada: parseNumber(
      get(row, ["alicuotaEstimada", "alicuota estimada", "alícuota"], 0),
      0
    ),

    ciudad: cleanString(get(row, ["ciudad"], "Quito")),
    zona: cleanString(get(row, ["zona"], "Quito")),
    ciudadZona: cleanString(get(row, ["ciudadZona", "ciudad zona"], "")),
    sector: cleanString(get(row, ["sector"], "")),
    direccionReferencial: cleanString(
      get(row, ["direccionReferencial", "direccion", "dirección"], "")
    ),
    googleMapsUrl: cleanString(get(row, ["googleMapsUrl", "maps"], "")),

    lat,
    lng,
    ubicacion: { lat, lng },
    location: { lat, lng },

    proyectoNuevo,
    viviendaNueva,
    tipoEntrega,
    etapaProyecto,
    estadoProyecto,
    fechaEntrega: fechaEntregaVisible,
    fechaEntregaEstimada,
    fechaEscrituraEstimada: parseDate(
      get(row, ["fechaEscrituraEstimada", "fecha escritura"], "")
    ),

    permiteEntradaEnCuotas: parseBoolean(
      get(row, ["permiteEntradaEnCuotas", "permite entrada en cuotas"], true),
      true
    ),
    mesesConstruccionRestantes: monthsConstruction,
    mesesConstruccion: monthsConstruction,
    porcentajeEntradaRequerida: downPaymentPct,
    entradaMinima,
    entradaRequerida: entradaMinima,
    reservaMinima: reserveMin,
    montoFirmaPromesa: promesaAmount,
    numeroCuotasEntrada: entryInstallmentsCount,
    fechaLimiteEntrada,

    cuotaEstimada,
    cuota: cuotaEstimada,
    tasaReferencial,
    tasa: tasaReferencial,
    plazoAnios,
    plazo: plazoAnios,

    financing: {
      downPaymentPct,
      mortgagePct: Math.max(0, 1 - downPaymentPct),
      allowInstallments: parseBoolean(
        get(row, ["permiteEntradaEnCuotas", "permite entrada en cuotas"], true),
        true
      ),
      reserveMin,
      monthsConstruction,
      downPaymentAmount: entradaMinima,
      monthlyPaymentEstimate: cuotaEstimada,
      referenceRate: tasaReferencial,
      termYears: plazoAnios,
      promesaAmount,
      entryInstallmentsCount,
      entryDeadlineDate: fechaLimiteEntrada,
    },

    productIds,

    requiresFirstHome: parseBoolean(
      get(row, ["requiresFirstHome", "requiere primera vivienda"], false),
      false
    ),
    requiresNewConstruction: parseBoolean(
      get(row, ["requiresNewConstruction", "requiere vivienda nueva"], true),
      true
    ),
    requiresMiduviQualifiedProject: parseBoolean(
      get(
        row,
        ["requiresMiduviQualifiedProject", "requiere proyecto calificado miduvi"],
        false
      ),
      false
    ),

    aceptaCreditoHipotecario: parseBoolean(
      get(row, ["aceptaCreditoHipotecario", "acepta credito hipotecario"], true),
      true
    ),
    aceptaBIESS,
    aceptaBancaPrivada,
    aceptaCooperativas: parseBoolean(
      get(row, ["aceptaCooperativas", "acepta cooperativas"], false),
      false
    ),
    aceptaContado: parseBoolean(
      get(row, ["aceptaContado", "acepta contado"], true),
      true
    ),
    bancoAliado: cleanString(get(row, ["bancoAliado", "banco aliado"], "")),
    proyectoCalificadoMiduvi,

    mortgageProfile: {
      productIds,
      requiresFirstHome: parseBoolean(
        get(row, ["requiresFirstHome", "requiere primera vivienda"], false),
        false
      ),
      requiresNewConstruction: parseBoolean(
        get(row, ["requiresNewConstruction", "requiere vivienda nueva"], true),
        true
      ),
      requiresMiduviQualifiedProject: parseBoolean(
        get(
          row,
          [
            "requiresMiduviQualifiedProject",
            "requiere proyecto calificado miduvi",
          ],
          false
        ),
        false
      ),
      acceptsMortgageCredit: parseBoolean(
        get(
          row,
          ["aceptaCreditoHipotecario", "acepta credito hipotecario"],
          true
        ),
        true
      ),
      acceptsBIESS: aceptaBIESS,
      acceptsPrivateBank: aceptaBancaPrivada,
      acceptsCooperatives: parseBoolean(
        get(row, ["aceptaCooperativas", "acepta cooperativas"], false),
        false
      ),
      acceptsCash: parseBoolean(
        get(row, ["aceptaContado", "acepta contado"], true),
        true
      ),
      alliedBank: cleanString(get(row, ["bancoAliado", "banco aliado"], "")),
      miduviQualificationStatus: proyectoCalificadoMiduvi,
    },

    imagen,
    image: imagen,
    imageUrl: imagen,

    galeria,
    gallery: galeria,
    imagenes: galeria,

    planoUrl,
    plano: planoUrl,
    floorPlan: planoUrl,
    floorPlanUrl: planoUrl,

    nearby,
    cercaDe: nearby,
    entorno: nearby,

    amenities,
    amenidades: amenities,

    brochureUrl: cleanString(get(row, ["brochureUrl", "brochure"], "")),
    videoUrl: cleanString(get(row, ["videoUrl", "video"], "")),

    estadoComercial,
    publicado,
    orden: parseNumber(get(row, ["orden"], 1), 1),
    fuenteCarga: "excel",
  };

  const errors = validatePropertyPayload(payload, rowNumber);

  return {
    rowNumber,
    ok: errors.length === 0,
    errors,
    payload,
  };
}

export function validatePropertyPayload(payload, rowNumber = null) {
  const prefix = rowNumber ? `Fila ${rowNumber}: ` : "";
  const errors = [];

  if (!payload?.id) errors.push(`${prefix}id es obligatorio.`);
  if (!payload?.proyecto) errors.push(`${prefix}proyecto es obligatorio.`);
  if (!payload?.titulo) errors.push(`${prefix}titulo es obligatorio.`);

  if (!Number.isFinite(Number(payload?.precio)) || Number(payload.precio) <= 0) {
    errors.push(`${prefix}precio debe ser mayor a 0.`);
  }

  if (
    !Number.isFinite(Number(payload?.m2Construccion)) ||
    Number(payload.m2Construccion) <= 0
  ) {
    errors.push(`${prefix}m2Construccion debe ser mayor a 0.`);
  }

  const tipoInmuebleAllowed = [
    "departamento",
    "suite",
    "estudio",
    "casa",
    "terreno",
  ];

  if (!tipoInmuebleAllowed.includes(payload?.tipoInmueble)) {
    errors.push(`${prefix}tipoInmueble inválido.`);
  }

  const tipoProyectoAllowed = [
    "edificio",
    "conjunto",
    "urbanizacion",
    "independiente",
    "otro",
  ];

  if (!tipoProyectoAllowed.includes(payload?.tipoProyecto)) {
    errors.push(`${prefix}tipoProyecto inválido.`);
  }

  const estadoAllowed = [
    "disponible",
    "pausado",
    "reservado",
    "vendido",
    "oculto",
  ];

  if (!estadoAllowed.includes(payload?.estadoComercial)) {
    errors.push(`${prefix}estadoComercial inválido.`);
  }

  if (payload?.lat != null && !Number.isFinite(Number(payload.lat))) {
    errors.push(`${prefix}lat debe ser un número válido.`);
  }

  if (payload?.lng != null && !Number.isFinite(Number(payload.lng))) {
    errors.push(`${prefix}lng debe ser un número válido.`);
  }

  return errors;
}