// src/routes/customerLeads.routes.js
import { Router } from "express";
import {
  guardarLeadJourneyCustomer,
  obtenerLeadMineCustomer,
} from "../controllers/customerLeads.controller.js";
import { verificarCustomer } from "../middlewares/authCustomer.js";

const router = Router();

router.post("/save-journey", verificarCustomer, guardarLeadJourneyCustomer);
router.get("/mine", verificarCustomer, obtenerLeadMineCustomer);

export default router;
