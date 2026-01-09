// src/routes/diag.routes.js
import { Router } from "express";
import { authCustomerRequired } from "../middlewares/authCustomer.js";

const router = Router();

// ✅ ruta protegida solo para customer logueado
router.get("/ping", authCustomerRequired, (req, res) => {
  res.json({
    ok: true,
    message: "customer auth ok",
    customer: req.customer || null,
  });
});

export default router;
