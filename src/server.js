// src/server.js
import app from "./app.js";

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0"; // <- asegura que escuche en todas las interfaces

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Servidor HabitaLibre escuchando en http://${HOST}:${PORT} (pid ${process.pid})`);
});

// Manejo de errores del servidor (puerto ocupado, permisos, etc.)
server.on("error", (err) => {
  console.error("❌ Error al iniciar el servidor:", err.code || err.message, err);
  process.exit(1);
});
