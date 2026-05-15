// src/routes/userAppState.routes.js
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import UserAppState from "../models/UserAppState.js";

const router = express.Router();

function getTokenFromReq(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.replace("Bearer ", "").trim();
}

function getJwtSecrets() {
  return [
    process.env.CUSTOMER_JWT_SECRET,
    process.env.JWT_CUSTOMER_SECRET,
    process.env.JWT_SECRET,
    process.env.ACCESS_TOKEN_SECRET,
    process.env.AUTH_SECRET,
  ].filter(Boolean);
}

async function authCustomerRequired(req, res, next) {
  try {
    const token = getTokenFromReq(req);

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "Token requerido",
      });
    }

    const secrets = getJwtSecrets();

    if (!secrets.length) {
      return res.status(500).json({
        ok: false,
        error:
          "No hay JWT secret configurado. Revisa CUSTOMER_JWT_SECRET o JWT_SECRET.",
      });
    }

    let decoded = null;
    let lastError = null;

    for (const secret of secrets) {
      try {
        decoded = jwt.verify(token, secret);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!decoded) {
      return res.status(401).json({
        ok: false,
        error: "Token inválido",
        detail:
          process.env.NODE_ENV === "production"
            ? undefined
            : lastError?.message || null,
      });
    }

    const idCandidate =
      decoded.userId ||
      decoded.id ||
      decoded._id ||
      decoded.sub ||
      decoded.customerId ||
      null;

    const emailCandidate = decoded.email
      ? String(decoded.email).trim().toLowerCase()
      : null;

    let user = null;

    if (idCandidate && mongoose.Types.ObjectId.isValid(String(idCandidate))) {
      user = await User.findById(idCandidate).select(
        "_id email nombre apellido telefono leadId currentLeadId"
      );
    }

    if (!user && emailCandidate) {
      user = await User.findOne({ email: emailCandidate }).select(
        "_id email nombre apellido telefono leadId currentLeadId"
      );
    }

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "Usuario no encontrado para este token",
      });
    }

    req.customer = {
      _id: user._id,
      userId: user._id,
      id: user._id,
      email: user.email,
      nombre: user.nombre || "",
      apellido: user.apellido || "",
      telefono: user.telefono || "",
      leadId: user.leadId || user.currentLeadId || null,
    };

    return next();
  } catch (err) {
    console.error("❌ authCustomerRequired user-app-state:", err);
    return res.status(401).json({
      ok: false,
      error: "No autorizado",
    });
  }
}

async function getOrCreateState(userId) {
  return UserAppState.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        selectedProperty: null,
        docsChecklist: {},
        journey: {},
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean();
}

router.get("/me", authCustomerRequired, async (req, res) => {
  try {
    const userId = req.customer.userId;
    const state = await getOrCreateState(userId);

    return res.json({
      ok: true,
      state,
    });
  } catch (err) {
    console.error("❌ GET /user-app-state/me:", err);
    return res.status(500).json({
      ok: false,
      error: "No se pudo obtener el estado del usuario",
    });
  }
});

router.patch("/selected-property", authCustomerRequired, async (req, res) => {
  try {
    const userId = req.customer.userId;

    const hasSelectedProperty = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "selectedProperty"
    );

    const hasProperty = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "property"
    );

    const hasPropiedad = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "propiedad"
    );

    if (!hasSelectedProperty && !hasProperty && !hasPropiedad) {
      return res.status(400).json({
        ok: false,
        error:
          "Debes enviar selectedProperty, property o propiedad. No se aceptan bodies genéricos.",
      });
    }

    const selectedProperty = hasSelectedProperty
      ? req.body.selectedProperty
      : hasProperty
      ? req.body.property
      : req.body.propiedad;

    const state = await UserAppState.findOneAndUpdate(
      { userId },
      {
        $set: {
          selectedProperty,
          lastSelectedPropertyAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.json({
      ok: true,
      state,
    });
  } catch (err) {
    console.error("❌ PATCH /user-app-state/selected-property:", err);
    return res.status(500).json({
      ok: false,
      error: "No se pudo guardar la propiedad seleccionada",
    });
  }
});

router.patch("/docs-checklist", authCustomerRequired, async (req, res) => {
  try {
    const userId = req.customer.userId;

    const docsChecklist =
      req.body?.docsChecklist ||
      req.body?.checklist ||
      req.body?.documents ||
      req.body ||
      {};

    const state = await UserAppState.findOneAndUpdate(
      { userId },
      {
        $set: {
          docsChecklist,
          lastDocsChecklistAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.json({
      ok: true,
      state,
    });
  } catch (err) {
    console.error("❌ PATCH /user-app-state/docs-checklist:", err);
    return res.status(500).json({
      ok: false,
      error: "No se pudo guardar el checklist documental",
    });
  }
});

router.patch("/journey", authCustomerRequired, async (req, res) => {
  try {
    const userId = req.customer.userId;

    const journey = req.body?.journey || req.body || {};

    const state = await UserAppState.findOneAndUpdate(
      { userId },
      {
        $set: {
          journey,
          lastJourneyAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.json({
      ok: true,
      state,
    });
  } catch (err) {
    console.error("❌ PATCH /user-app-state/journey:", err);
    return res.status(500).json({
      ok: false,
      error: "No se pudo guardar el journey del usuario",
    });
  }
});

router.patch("/", authCustomerRequired, async (req, res) => {
  try {
    const userId = req.customer.userId;

    const patch = {};
    const now = new Date();

    if ("selectedProperty" in req.body) {
      patch.selectedProperty = req.body.selectedProperty;
      patch.lastSelectedPropertyAt = now;
    }

    if ("docsChecklist" in req.body) {
      patch.docsChecklist = req.body.docsChecklist || {};
      patch.lastDocsChecklistAt = now;
    }

    if ("journey" in req.body) {
      patch.journey = req.body.journey || {};
      patch.lastJourneyAt = now;
    }

    const state = await UserAppState.findOneAndUpdate(
      { userId },
      {
        $set: patch,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.json({
      ok: true,
      state,
    });
  } catch (err) {
    console.error("❌ PATCH /user-app-state:", err);
    return res.status(500).json({
      ok: false,
      error: "No se pudo guardar el estado del usuario",
    });
  }
});

export default router;