// src/server.js
import dotenv from "dotenv";

// ✅ 1) DOTENV SIEMPRE PRIMERO (ANTES DE CUALQUIER OTRO IMPORT)
dotenv.config({
  // Carga el .env del root del backend (un nivel arriba de /src)
  path: new URL("../.env", import.meta.url).pathname,
  override: true,
});

// ✅ Debug inmediato (puedes dejarlo mientras arreglas)
console.log("✅ DOTENV path:", new URL("../.env", import.meta.url).pathname);
console.log("✅ DOTENV loaded keys:", Object.keys(process.env || {}).length);
console.log("✅ ENV check:", {
  CWD: process.cwd(),
  NODE_ENV: process.env.NODE_ENV,
  CUSTOMER_JWT_SECRET: !!process.env.CUSTOMER_JWT_SECRET,
  CUSTOMER_JWT_SECRET_len: process.env.CUSTOMER_JWT_SECRET?.length || 0,
});

// ✅ 2) Recién después importas tu app (y todo lo demás)
import app from "./app.js";

const PORT = Number(process.env.PORT || 4000);

// ✅ Host robusto:
// - En Render/producción: 0.0.0.0 (necesario)
// - En local: 127.0.0.1 (evita líos IPv6/localhost en Mac)
const IS_RENDER =
  !!process.env.RENDER || !!process.env.ONRENDER || !!process.env.RENDER_SERVICE_ID;

const HOST =
  process.env.HOST ||
  (IS_RENDER || process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

// ✅ Levantar server
const server = app.listen(PORT, HOST, () => {
  const addr = server.address(); // puede ser string | object | null

  // 🔒 FIX: handle null + formatos distintos
  let where = `http://${HOST}:${PORT}`;

  if (typeof addr === "string") {
    where = addr;
  } else if (addr && typeof addr === "object") {
    const host = addr.address === "::" ? "localhost" : addr.address; // bonito en Mac
    where = `http://${host}:${addr.port}`;
  } else {
    // addr === null -> dejamos fallback
    where = `http://${HOST}:${PORT}`;
  }

  console.log(`✅ API HabitaLibre escuchando en: ${where}`);
  console.log(`   HOST=${HOST} PORT=${PORT} NODE_ENV=${process.env.NODE_ENV}`);
});

// Manejo básico de errores para no “morir” sin info
server.on("error", (err) => {
  console.error("❌ Error levantando server:", err?.code || "", err?.message || err);

  // Tip típico: puerto ocupado
  if (err?.code === "EADDRINUSE") {
    console.error(`⚠️  Puerto en uso: ${PORT}. Prueba cerrar el proceso o cambiar PORT.`);
  }

  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("🔥 Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err);
  try {
    server.close(() => process.exit(1));
  } catch {
    process.exit(1);
  }
});
