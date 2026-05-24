// src/utils/propertyExcelMapper.js
import XLSX from "xlsx";

export const PROPERTY_TEMPLATE_COLUMNS = [
  "id",
  "developer",
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

  "tipoEntrega",
  "etapaProyecto",
  "fechaEntregaEstimada",
  "fechaEscrituraEstimada",
  "viviendaNueva",

  "permiteEntradaEnCuotas",
  "porcentajeEntradaRequerida",
  "reservaMinima",
  "montoFirmaPromesa",
  "numeroCuotasEntrada",
  "fechaLimiteEntrada",

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
    notas: "0.1 significa 10%. 0.05 significa 5%.",
  },
  {
    campo: "fechas",
    valoresPermitidos: "YYYY-MM-DD",
    ejemplos: "2027-12-01",
    notas: "Usa este formato para evitar errores.",
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
    notas: "Promotor o desarrollador.",
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
    campo: "tipoEntrega",
    obligatorio: "Sí",
    formatoEsperado: "construccion / inmediata / planos",
    ejemploValido: "construccion",
    notas: "Sirve para calcular si puede pagar entrada durante construcción.",
  },
  {
    campo: "fechaEntregaEstimada",
    obligatorio: "No",
    formatoEsperado: "YYYY-MM-DD",
    ejemploValido: "2027-12-01",
    notas: "Muy recomendable si está en construcción o planos.",
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
    "Puedes usar 0.1, 10 o 10%. El sistema interpreta 0.1 como 10%.",
  ],
  [
    "7. Fechas",
    "Usa formato YYYY-MM-DD. Ejemplo: 2027-12-01.",
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
    "10. Campos obligatorios mínimos",
    "id, proyecto, titulo, precio, m2Construccion, tipoInmueble, tipoProyecto, tipoEntrega, estadoComercial y publicado.",
  ],
];

export function buildPropertyTemplateRows() {
  return [
    {
      id: "gls_hp6_a1201",
      developer: "GLS Constructores",
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

      tipoEntrega: "construccion",
      etapaProyecto: "construccion",
      fechaEntregaEstimada: "2027-12-01",
      fechaEscrituraEstimada: "",
      viviendaNueva: "si",

      permiteEntradaEnCuotas: "si",
      porcentajeEntradaRequerida: 0.1,
      reservaMinima: 500,
      montoFirmaPromesa: 2500,
      numeroCuotasEntrada: 18,
      fechaLimiteEntrada: "",

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
      galeria: "",
      brochureUrl: "",
      videoUrl: "",

      estadoComercial: "pausado",
      publicado: "no",
      orden: 1,
    },
    {
      id: "gls_hp6_estudio_001",
      developer: "GLS Constructores",
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

      tipoEntrega: "construccion",
      etapaProyecto: "construccion",
      fechaEntregaEstimada: "2027-12-01",
      fechaEscrituraEstimada: "",
      viviendaNueva: "si",

      permiteEntradaEnCuotas: "si",
      porcentajeEntradaRequerida: "10%",
      reservaMinima: 500,
      montoFirmaPromesa: 2500,
      numeroCuotasEntrada: 18,
      fechaLimiteEntrada: "",

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
      galeria: "",
      brochureUrl: "",
      videoUrl: "",

      estadoComercial: "pausado",
      publicado: "no",
      orden: 2,
    },
    {
      id: "gls_casas_c01",
      developer: "GLS Constructores",
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

      tipoEntrega: "inmediata",
      etapaProyecto: "entrega_inmediata",
      fechaEntregaEstimada: "",
      fechaEscrituraEstimada: "",
      viviendaNueva: "si",

      permiteEntradaEnCuotas: "no",
      porcentajeEntradaRequerida: 0.1,
      reservaMinima: 1000,
      montoFirmaPromesa: 5000,
      numeroCuotasEntrada: 0,
      fechaLimiteEntrada: "",

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

  // Si viene tipo "$52,900", la coma es separador de miles.
  // Si viene tipo "52,90", la coma probablemente es decimal.
  if (s.includes(",") && !s.includes(".")) {
    const parts = s.split(",");

    if (parts.length === 2 && parts[1]?.length === 3) {
      s = parts.join("");
    } else {
      s = s.replace(",", ".");
    }
  } else if (s.includes(",") && s.includes(".")) {
    // Caso tipo "1,250.50" o "1.250,50"
    const commaIndex = s.lastIndexOf(",");
    const dotIndex = s.lastIndexOf(".");

    if (commaIndex > dotIndex) {
      // Formato latino: 1.250,50
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // Formato US: 1,250.50
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(".")) {
    const parts = s.split(".");

    // Caso tipo "52.900" usado como miles
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

export function normalizePropertyExcelRow(rawRow, rowNumber) {
  const row = normalizeRow(rawRow);

  const tipoInmueble = enumValue(
    get(row, ["tipoInmueble", "tipo inmueble"], "departamento"),
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
      ["m2Construccion", "m2 construcción", "m2", "metros construccion"],
      0
    ),
    0
  );

  const downPaymentPct = parsePercentage(
    get(
      row,
      ["porcentajeEntradaRequerida", "entrada requerida", "porcentaje entrada"],
      0.1
    ),
    0.1
  );

  const reserveMin = parseNumber(
    get(row, ["reservaMinima", "reserva mínima", "reserva"], 0),
    0
  );

  const monthsConstruction = parseNumber(
    get(row, ["mesesConstruccionRestantes", "meses construcción restantes"], 0),
    0
  );

  const promesaAmount = parseNumber(
    get(row, ["montoFirmaPromesa", "monto firma promesa", "promesa"], 0),
    0
  );

  const entryInstallmentsCount = parseNumber(
    get(row, ["numeroCuotasEntrada", "numero cuotas entrada", "cuotas entrada"], 0),
    0
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

  const fechaLimiteEntrada = parseDate(
    get(row, ["fechaLimiteEntrada", "fecha limite entrada"], "")
  );

  const payload = {
    id: cleanString(get(row, ["id", "idComercial", "id comercial"], "")),
    developer: cleanString(
      get(row, ["developer", "promotor", "desarrollador"], "GLS Constructores")
    ),
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
    banos: parseNumber(get(row, ["banos", "baños"], 0), 0),
    parqueaderos: parseNumber(get(row, ["parqueaderos", "garajes"], 0), 0),
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

    proyectoNuevo: parseBoolean(
      get(row, ["proyectoNuevo", "proyecto nuevo"], true),
      true
    ),
    viviendaNueva: parseBoolean(
      get(row, ["viviendaNueva", "vivienda nueva"], true),
      true
    ),
    tipoEntrega,
    etapaProyecto,
    fechaEntregaEstimada: parseDate(
      get(row, ["fechaEntregaEstimada", "fecha entrega"], "")
    ),
    fechaEscrituraEstimada: parseDate(
      get(row, ["fechaEscrituraEstimada", "fecha escritura"], "")
    ),

    permiteEntradaEnCuotas: parseBoolean(
      get(row, ["permiteEntradaEnCuotas", "permite entrada en cuotas"], true),
      true
    ),
    mesesConstruccionRestantes: monthsConstruction,
    porcentajeEntradaRequerida: downPaymentPct,
    reservaMinima: reserveMin,
    montoFirmaPromesa: promesaAmount,
    numeroCuotasEntrada: entryInstallmentsCount,
    fechaLimiteEntrada,

    financing: {
      downPaymentPct,
      mortgagePct: Math.max(0, 1 - downPaymentPct),
      allowInstallments: parseBoolean(
        get(row, ["permiteEntradaEnCuotas", "permite entrada en cuotas"], true),
        true
      ),
      reserveMin,
      monthsConstruction,
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

    imagen: cleanString(get(row, ["imagen", "imagenPrincipal"], "")),
    galeria: cleanLines(get(row, ["galeria", "galería"], "")),
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

  return errors;
}