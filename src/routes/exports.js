// src/routes/exports.js
import express from "express";
import { pgQuery } from "../pg.js";


const router = express.Router();

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Wrap in quotes if it contains special chars
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, columns) {
  const header = columns.map(csvEscape).join(",") + "\n";
  const lines = rows
    .map((r) => columns.map((c) => csvEscape(r[c])).join(","))
    .join("\n");
  return header + lines + (lines ? "\n" : "");
}

function setCsvHeaders(res, filename) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // optional: stops caching
  res.setHeader("Cache-Control", "no-store");
}

/**
 * GET /api/exports/products.csv
 */
router.get("/products.csv", async (req, res) => {
  try {
    const { rows } = await pgQuery(`
      SELECT
        id, sku, code, name, notes, on_ebay,
        cost, retail, fees, postage, quantity,
        created_at
      FROM products
      ORDER BY id ASC
    `);

    const columns = [
      "id","sku","code","name","notes","on_ebay",
      "cost","retail","fees","postage","quantity",
      "created_at"
    ];

    setCsvHeaders(res, "products.csv");

    // ✅ record last export time
    await pgQuery(`
        INSERT INTO export_logs (key, last_exported)
        VALUES ('products', NOW())
        ON CONFLICT (key)
        DO UPDATE SET last_exported = NOW()
        `);

        res.send(toCsv(rows, columns));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to export products" });
  }
});

/**
 * GET /api/exports/refurb.csv
 * Joins refurb_items + refurb_details to make one backup file.
 */
router.get("/refurb.csv", async (req, res) => {
  try {
    const { rows } = await pgQuery(`
      SELECT
        ri.id,
        ri.sku,
        ri.serial,
        ri.description,
        ri.status,
        ri.parts_status,
        ri.supplier,
        ri.category,
        ri.cpu,
        ri.colour,
        ri.storage,
        ri.controller,
        ri.cost,
        ri.retail,
        ri.notes,
        ri.created_at,

        rd.specs_cpu,
        rd.specs_ram,
        rd.specs_storage,
        rd.specs_gpu,
        rd.specs_screen,
        rd.os_version,
        rd.parts_needed,
        rd.parts_cost,
        rd.checklist,
        rd.notes AS detail_notes,
        rd.updated_at AS detail_updated_at
      FROM refurb_items ri
      LEFT JOIN refurb_details rd ON rd.refurb_id = ri.id
      ORDER BY ri.id ASC
    `);

    // checklist is JSONB — stringify it so it fits nicely in a CSV cell
    const cleaned = rows.map(r => ({
      ...r,
      checklist: r.checklist ? JSON.stringify(r.checklist) : ""
    }));

    const columns = [
      "id","sku","serial","description","status","parts_status","supplier","category",
      "cpu","colour","storage","controller",
      "cost","retail","notes","created_at",

      "specs_cpu","specs_ram","specs_storage","specs_gpu","specs_screen","os_version",
      "parts_needed","parts_cost","checklist","detail_notes","detail_updated_at"
    ];

    setCsvHeaders(res, "refurb.csv");
    res.send(toCsv(cleaned, columns));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to export refurb" });
  }
});

/**
 * GET /api/exports/last
 * Returns last export timestamps
 */
router.get("/last", async (req, res) => {
  try {
    const { rows } = await pgQuery(`
      SELECT key, last_exported
      FROM export_logs
    `);

    const map = {};
    rows.forEach(r => {
      map[r.key] = r.last_exported;
    });

    res.json(map);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch export times" });
  }
});



export default router;
