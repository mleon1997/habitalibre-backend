// src/server.js
import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({
    path: new URL("../.env", import.meta.url).pathname,
  });

  console.log("✅ Local .env cargado");
}

import app from "./app.js";

// Render normalmente inyecta process.env.PORT.
// Si no existe, usamos 10000 como fallback más compatible con Render.
const PORT = Number(process.env.PORT || 10000);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `✅ API HabitaLibre escuchando en 0.0.0.0:${PORT} (NODE_ENV=${process.env.NODE_ENV})`
  );
});

server.on("error", (err) => {
  console.error("❌ Server error:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});