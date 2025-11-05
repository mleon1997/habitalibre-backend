// src/routes/diag.routes.js
import { Router } from "express";
import { verifySmtp, enviarCorreoCliente } from "../utils/mailer.js";

const router = Router();

// Verifica la conexión SMTP (handshake TLS + auth)
router.get("/smtp-verify", async (req, res) => {
  try {
    await verifySmtp();
    res.json({ ok: true, message: "✅ Conexión SMTP verificada correctamente" });
  } catch (error) {
    console.error("❌ Error verificando SMTP:", error?.message || error);
    res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
});

// Envía un correo de prueba al email indicado, con un PDF adjunto generado on-the-fly
router.post("/mail-test", async (req, res) => {
  try {
    const { email = "" } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ ok: false, error: "Email inválido" });
    }

    // lead y resultado mínimos de prueba
    const lead = {
      nombre: "Prueba HabitaLibre",
      email: email.trim(),
      telefono: "+593 990000000",
      ciudad: "Quito",
      canal: "Email",
    };

    const resultado = {
      capacidadPago: 680,
      montoMaximo: 95000,
      precioMaxVivienda: 120000,
      ltv: 0.79,
      dtiConHipoteca: 0.36,
      tasaAnual: 0.095,
      plazoMeses: 240,
      cuotaEstimada: 670,
      cuotaStress: 740,
      productoElegido: "Banca privada",
      puntajeHabitaLibre: { score: 78, label: "Bueno", categoria: "medio" },
    };

    // usa tu función real de envío al cliente (adjunta PDF)
    await enviarCorreoCliente(lead, resultado);

    res.json({ ok: true, message: `📨 Correo de prueba enviado a ${lead.email}` });
  } catch (error) {
    console.error("❌ Error enviando el correo de prueba:", error?.message || error);
    res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
});

export default router;
