// src/controllers/propertiesBulk.controller.js
import XLSX from "xlsx";
import Property from "../models/Property.js";
import {
  PROPERTY_ALLOWED_VALUES,
  PROPERTY_TEMPLATE_COLUMNS,
  buildPropertyTemplateRows,
  normalizePropertyExcelRow,
  validatePropertyPayload,
} from "../utils/propertyExcelMapper.js";

const MAX_ROWS = 500;

function readWorkbookRows(buffer) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });

  const sheetName = workbook.SheetNames?.[0];

  if (!sheetName) {
    throw new Error("El archivo no contiene hojas.");
  }

  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });

  return rows;
}

export async function descargarPlantillaPropiedades(req, res) {
  try {
    const workbook = XLSX.utils.book_new();

    const templateRows = buildPropertyTemplateRows();

    const templateSheet = XLSX.utils.json_to_sheet(templateRows, {
      header: PROPERTY_TEMPLATE_COLUMNS,
    });

    XLSX.utils.book_append_sheet(workbook, templateSheet, "Propiedades");

    const dictionarySheet = XLSX.utils.json_to_sheet(PROPERTY_ALLOWED_VALUES);
    XLSX.utils.book_append_sheet(workbook, dictionarySheet, "Diccionario");

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="plantilla-propiedades-habitalibre.xlsx"`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.status(200).send(buffer);
  } catch (error) {
    console.error("[propertiesBulk] descargarPlantillaPropiedades:", error);

    return res.status(500).json({
      ok: false,
      message: "No se pudo generar la plantilla.",
    });
  }
}

export async function previewCargaMasivaPropiedades(req, res) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        ok: false,
        message: "Debes subir un archivo Excel en el campo 'archivo'.",
      });
    }

    const rows = readWorkbookRows(req.file.buffer);

    if (!rows.length) {
      return res.status(400).json({
        ok: false,
        message: "El Excel no contiene filas de propiedades.",
      });
    }

    if (rows.length > MAX_ROWS) {
      return res.status(400).json({
        ok: false,
        message: `El archivo tiene ${rows.length} filas. Máximo permitido: ${MAX_ROWS}.`,
      });
    }

    const normalizedRows = rows.map((row, idx) =>
      normalizePropertyExcelRow(row, idx + 2)
    );

    const validPayloads = normalizedRows
      .filter((row) => row.ok)
      .map((row) => row.payload);

    const ids = validPayloads.map((p) => p.id).filter(Boolean);

    const existing = await Property.find({ id: { $in: ids } })
      .select("id")
      .lean();

    const existingSet = new Set(existing.map((p) => p.id));

    const validRows = normalizedRows
      .filter((row) => row.ok)
      .map((row) => ({
        ...row,
        action: existingSet.has(row.payload.id) ? "update" : "create",
      }));

    const errorRows = normalizedRows.filter((row) => !row.ok);

    const summary = {
      totalRows: rows.length,
      validRows: validRows.length,
      errorRows: errorRows.length,
      toCreate: validRows.filter((r) => r.action === "create").length,
      toUpdate: validRows.filter((r) => r.action === "update").length,
    };

    return res.status(200).json({
      ok: true,
      summary,
      validRows,
      errorRows,
    });
  } catch (error) {
    console.error("[propertiesBulk] previewCargaMasivaPropiedades:", error);

    return res.status(500).json({
      ok: false,
      message: error?.message || "No se pudo procesar el Excel.",
    });
  }
}

export async function confirmarCargaMasivaPropiedades(req, res) {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

    if (!rows.length) {
      return res.status(400).json({
        ok: false,
        message: "No hay filas para confirmar.",
      });
    }

    if (rows.length > MAX_ROWS) {
      return res.status(400).json({
        ok: false,
        message: `Máximo permitido: ${MAX_ROWS} propiedades por carga.`,
      });
    }

    const results = {
      created: 0,
      updated: 0,
      errors: [],
      items: [],
    };

    for (const row of rows) {
      const payload = row?.payload || row;
      const rowNumber = row?.rowNumber || null;

      const errors = validatePropertyPayload(payload, rowNumber);

      if (errors.length) {
        results.errors.push({
          rowNumber,
          id: payload?.id || "",
          errors,
        });
        continue;
      }

      try {
        const existed = await Property.exists({ id: payload.id });

        const saved = await Property.findOneAndUpdate(
          { id: payload.id },
          { $set: payload },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true,
          }
        ).lean();

        if (existed) {
          results.updated += 1;
        } else {
          results.created += 1;
        }

        results.items.push({
          id: saved.id,
          titulo: saved.titulo,
          action: existed ? "updated" : "created",
        });
      } catch (error) {
        results.errors.push({
          rowNumber,
          id: payload?.id || "",
          errors: [error?.message || "Error guardando propiedad."],
        });
      }
    }

    return res.status(200).json({
      ok: true,
      ...results,
      totalProcessed: results.created + results.updated,
      totalErrors: results.errors.length,
    });
  } catch (error) {
    console.error("[propertiesBulk] confirmarCargaMasivaPropiedades:", error);

    return res.status(500).json({
      ok: false,
      message: "No se pudo confirmar la carga masiva.",
    });
  }
}