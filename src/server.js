// src/server.js
import dotenv from "dotenv";

// ✅ Cargar .env SOLO en local
if (process.env.NODE_ENV !== "production") {
  dotenv.config({
    path: new URL("../.env", import.meta.url).pathname,
  });

  console.log("✅ Local .env cargado");
}

// ✅ Importar app después
import app from "./app.js";

const PORT = Number(process.env.PORT || 4000);

// Render requiere 0.0.0.0
const HOST =
  process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";

const server = app.listen(PORT, HOST, () => {
  console.log(
    `✅ API HabitaLibre escuchando en ${HOST}:${PORT} (NODE_ENV=${process.env.NODE_ENV})`
  );
});

// Logs de error básicos (sin matar Render)
server.on("error", (err) => {
  console.error("❌ Server error:", err);
});
