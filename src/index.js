// src/index.js
import 'dotenv/config';

// test deploy

import exportsRouter from "./routes/exports.js";
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import auth from 'basic-auth';
import { fileURLToPath } from 'url';
import { pgQuery } from './pg.js';
import { initDb } from './db.js'
import {
  listProductsPG,
  createProductPG,
  getProductByIdPG,
  getProductByCodePG,
  adjustQtyPG,
  setQtyPG,
  insertSalePG,
  listSalesPG,
  getNextSkuForCategoryPG,
  logEbayUpdatePG,
  listEbayUpdatesPG,
  setEbayUpdateDonePG,
  getNextRefurbSkuPG,
  updateEbayStatusPG,
  ebayStatusCountsPG,
  findProductsByCodePG,


} from './pgProducts.js';
import fs from 'node:fs';
import multer from 'multer';

function categoryFromSkuPrefix(sku) {
  const s = String(sku || '').trim().toUpperCase();
  const p = s.charAt(0);

  if (p === 'L') return 'laptop';
  if (p === 'M') return 'pc';
  if (p === 'V') return 'phone';
  if (p === 'T' || p === 'Q') return 'tablet';
  if (p === 'H') return 'console';

  return null;
}


/* ---------- Paths ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ---------- App ---------- */
const app = express();


// ----- File uploads for Trade-ins -----
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, Date.now() + '-' + safeName);
  },
});

const upload = multer({ storage });

// Serve uploaded ID images
app.use('/uploads', express.static(uploadDir));


console.log('[startup] BASIC_USER:',
  process.env.BASIC_USER ? '(set)' : '(missing)',
  'BASIC_PASS:',
  process.env.BASIC_PASS ? '(set)' : '(missing)'
);

const USER = process.env.BASIC_USER || '';
const PASS = process.env.BASIC_PASS || '';

app.use((req, res, next) => {
  if (req.path.startsWith('/api/health')) {
    return next();
  }
  if (!USER || !PASS) return next();

  const creds = auth(req);

  if (creds && creds.name === USER && creds.pass === PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="stock-app"');
  return res.status(401).send('Authentication required');
});

app.use(cors());
app.use(express.json());
app.use("/api/exports", exportsRouter);


/* ---------- Static / Pages ---------- */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html')));
app.get('/products',       (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'products.html')));
app.get('/products/list',  (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'products-list.html')));
app.get('/import',         (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'import.html')));
app.get('/scan',           (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'scan.html')));
app.get('/stocktake',      (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'stocktake.html')));
app.get('/report/sales',   (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'report-sales.html')));
app.get('/report/stock',   (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'report-stock.html')));
app.get('/quick-add',      (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'quick-add.html')));
app.get('/refurb',         (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'refurb.html')));
app.get('/refurb/add',  (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'refurb-add.html')));
app.get('/refurb/list', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'refurb.html')));
app.get('/refurb/retired', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'refurb-retired.html')));
app.get('/refurb/:id', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'refurb-detail.html')));
app.get('/tradein',        (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'tradein.html')));
app.get('/tradeins',       (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'tradeins.html')));
app.get('/report-sales',   (req, res) => {res.sendFile(path.join(__dirname, '..', 'public', 'report-sales.html'));});
app.get('/inventory-add', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'inventory-add.html')));
app.get('/report/ebay-updates', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'report-ebay-updates.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html')));






/* Health once */
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Health check for Postgres
app.get('/api/test-items', async (req, res) => {
  try {
    const result = await pgQuery(
      'SELECT id, name FROM test_items ORDER BY id ASC'
    );

    res.json({
      ok: true,
      rows: result.rows,
    });
  } catch (err) {
    console.error('Error fetching test_items:', err);
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});



app.get('/api/health/db', async (req, res) => {
  try {
    const { rows } = await pgQuery('select now() as now');
    res.json({ ok: true, db: true, now: rows[0].now });
  } catch (err) {
    console.error('[PG health]', err);
    res.status(500).json({ ok: true, db: false, error: err.message });
  }
});

async function setEbayStatus(productId, status) {
  const { rows } = await pgQuery(
    `UPDATE products
     SET ebay_status = $2
     WHERE id = $1
     RETURNING *;`,
    [Number(productId), String(status)]
  );
  return rows[0] || null;
}

async function findProductByLooseCodePG(codeNorm) {
  const { rows } = await pgQuery(
    `
    SELECT *
    FROM products
    WHERE
      UPPER(name)  LIKE '%' || $1 || '%'
      OR UPPER(COALESCE(notes,'')) LIKE '%' || $1 || '%'
    ORDER BY sku ASC
    LIMIT 5;
    `,
    [codeNorm]
  );
  return rows;
}


/* ---------- API: Products ---------- */

app.get('/api/products', async (req, res) => {
  try {
    const ebay_status = req.query.ebay_status ? String(req.query.ebay_status) : undefined;
    const rows = await listProductsPG({ ebay_status });

    res.json(rows);
  } catch (err) {
    console.error('PG listProducts error:', err);
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  try {
    const row = await getProductByIdPG(id);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (err) {
    console.error('PG getProduct error:', err);
    res.status(500).json({ error: err.message });
  }
});


// Update (normalized, clears notes when blank) - Postgres
app.put('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const {
      sku,
      code = null,
      name,
      quantity = 0,
      onEbay = false,
      retail = 0,
      cost = 0,
      fees = 0,
      postage = 0,
      notes = null,
    } = req.body || {};

    const skuNorm   = String(sku || '').trim().toUpperCase();
    const codeNorm = (code == null || String(code).trim() === '')
  ? null
  : String(code).trim().toUpperCase();

    const notesNorm = (notes == null || String(notes).trim() === '')
      ? null
      : String(notes).trim();

    const data = {
      id,
      sku: skuNorm,
      name: String(name || '').trim(),
      notes: notesNorm,
      on_ebay:
        onEbay === true || onEbay === 'yes' || onEbay === 1
          ? 1
          : 0,
      cost: Number(cost) || 0,
      retail: Number(retail) || 0,
      fees: Number(fees) || 0,
      postage: Number(postage) || 0,
      quantity: Number(quantity) || 0,
    };

    const { rows } = await pgQuery(
      `
      UPDATE products
      SET
        sku = $1,
        code = $2,            -- ✅ add
        name = $3,
        notes = $4,
        on_ebay = $5,
        cost = $6,
        retail = $7,
        fees = $8,
        postage = $9,
        quantity = $10
      WHERE id = $11
      RETURNING *;

      `,
      [
        data.sku,
        codeNorm,
        data.name,
        data.notes,
        data.on_ebay,
        data.cost,
        data.retail,
        data.fees,
        data.postage,
        data.quantity,
        data.id,
      ]
    );

    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'not found' });

    res.json(row);
  } catch (err) {
    console.error('PG updateProduct error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Quick update eBay status / notes
app.patch('/api/products/:id/ebay', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const { ebay_status = null, ebay_notes = null } = req.body || {};

    // Optional: validate allowed statuses
    const allowed = new Set(['not_listed', 'ready_to_list', 'listed', 'sold_on_ebay']);
    if (ebay_status && !allowed.has(String(ebay_status))) {
      return res.status(400).json({ error: 'invalid ebay_status' });
    }

    const row = await updateEbayStatusPG(id, {
      ebay_status: ebay_status ? String(ebay_status) : null,
      ebay_notes:  ebay_notes  != null ? String(ebay_notes) : null,
    });

    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (err) {
    console.error('PG update ebay status error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/ebay', async (req, res) => {
  try {
    const rows = await ebayStatusCountsPG();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Lookup a product by code (SKU) using Postgres
app.get('/api/products/lookup/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();

  try {
    const row = await getProductByCodePG(code);   
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (err) {
    console.error('PG lookup error:', err);
    res.status(500).json({ error: err.message });
  }
});


// Delete (Postgres)
app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const result = await pgQuery(
      'DELETE FROM products WHERE id = $1',
      [id]
    );

    // pgQuery returns result.rowCount
    res.json({ deleted: result.rowCount > 0 });
  } catch (err) {
    console.error('PG deleteProduct error:', err);
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/products', async (req, res) => {
  try {
    const {
      sku,
      code = null, 
      name,
      quantity = 0,
      notes = null,
      onEbay = false,   // CSV / form uses onEbay
      cost = 0,
      retail = 0,
      fees = 0,
      postage = 0
    } = req.body || {};

    if (!sku || !name) {
      return res.status(400).json({ error: 'sku and name are required' });
    }

    const skuNorm   = String(sku).trim().toUpperCase();
    const codeNorm = (code == null || String(code).trim() === '')
  ? null
  : String(code).trim().toUpperCase();

    const notesNorm = (notes == null || String(notes).trim() === '')
      ? null
      : String(notes).trim();

    const data = {
      sku: skuNorm,
      code: codeNorm,  
      name: String(name).trim(),
      notes: notesNorm,
      on_ebay: (onEbay === true || onEbay === 1 || onEbay === '1' ||
                /^yes|y|true$/i.test(String(onEbay)))
                ? 1 : 0,
      cost:     Number(cost)     || 0,
      retail:   Number(retail)   || 0,
      fees:     Number(fees)     || 0,
      postage:  Number(postage)  || 0,
      quantity: Number(quantity) || 0,
    };

    const row = await createProductPG(data);
    return res.status(201).json(row);
  } catch (err) {
    console.error('PG createProduct error:', err);
    return res.status(400).json({ error: err.message });
  }
});


    // Smart add product (auto SKU or bump quantity by PART NUMBER)
// Smart add product (auto SKU or bump quantity by PART NUMBER)
app.post('/api/products/add-smart', async (req, res) => {
  try {
    const {
      category,
      code,          // part number you type in
      name = '',     // optional description
      quantity = 0,
      notes = null,
      onEbay = false,
      cost = 0,
      retail = 0,
      fees = 0,
      postage = 0,
      pick_id = null, // when duplicates exist, frontend can send the chosen product id
    } = req.body || {};

    const qtyDelta = Number(quantity) || 0;

    if (!code) return res.status(400).json({ error: 'part number (code) is required' });
    if (qtyDelta <= 0) return res.status(400).json({ error: 'quantity must be > 0' });

    const codeNorm = String(code).trim().toUpperCase();

    // 1) Duplicate check by PART NUMBER (code)
    const matches = await findProductsByCodePG(codeNorm);

    // MULTIPLE MATCHES -> require pick_id
    if (matches.length > 1) {
      const pickId = Number(pick_id);

      if (!Number.isFinite(pickId) || pickId <= 0) {
        return res.status(409).json({
          error: `Part number found in multiple products (${matches.length}). Please choose one.`,
          candidates: matches.map(m => ({
            id: m.id,
            sku: m.sku,
            name: m.name,
            notes: m.notes,
            quantity: m.quantity,
          })),
        });
      }

      const chosen = matches.find(m => Number(m.id) === pickId);
      if (!chosen) return res.status(400).json({ error: 'pick_id not in candidates' });

      const oldQty = Number(chosen.quantity) || 0;
      const updated = await adjustQtyPG(chosen.id, qtyDelta);
      const newQty = Number(updated.quantity) || 0;

      // if stock comes back from 0, mark as RELIST
      if (oldQty === 0 && newQty > 0) {
        await setEbayStatus(chosen.id, 'ready_to_list');
      }

      // If it’s an eBay item, log it for later
      if (Number(chosen.on_ebay) === 1) {
        await logEbayUpdatePG({
          sku: chosen.sku,
          code: chosen.code || codeNorm,
          delta: qtyDelta,
          oldQty,
          newQty,
          note: notes || null,
        });
      }

      return res.json({
        message: `UPDATED: SKU ${chosen.sku} (qty ${oldQty} → ${newQty}) ✅`,
      });
    }

    // SINGLE MATCH -> update it
    if (matches.length === 1) {
      const existing = matches[0];

      const oldQty = Number(existing.quantity) || 0;
      const updated = await adjustQtyPG(existing.id, qtyDelta);
      const newQty = Number(updated.quantity) || 0;

      if (oldQty === 0 && newQty > 0) {
        await setEbayStatus(existing.id, 'ready_to_list');
      }

      if (Number(existing.on_ebay) === 1) {
        await logEbayUpdatePG({
          sku: existing.sku,
          code: existing.code || codeNorm,
          delta: qtyDelta,
          oldQty,
          newQty,
          note: notes || null,
        });
      }

      return res.json({
        message: `UPDATED: SKU ${existing.sku} (qty ${oldQty} → ${newQty}) ✅`,
      });
    }

    // NO MATCH -> create new item (category required)
    const prefix = String(category || '').trim().toUpperCase();
    if (!prefix) return res.status(400).json({ error: 'category is required for new items' });

    const newSku = await getNextSkuForCategoryPG(prefix);

    const created = await createProductPG({
      sku: newSku,
      code: codeNorm,
      name: name || codeNorm,
      notes,
      on_ebay: onEbay ? 1 : 0,
      cost,
      retail,
      fees,
      postage,
      quantity: qtyDelta,
    });

    if (Number(created.on_ebay) === 1) {
      await logEbayUpdatePG({
        sku: created.sku,
        code: created.code || codeNorm,
        delta: qtyDelta,
        oldQty: 0,
        newQty: Number(created.quantity) || qtyDelta,
        note: notes || null,
      });
    }

    return res.json({
      message: `CREATED: New SKU ${created.sku} (qty ${created.quantity}) ✅ label the item`,
    });
  } catch (err) {
    console.error('add-smart failed:', err);
    res.status(500).json({ error: err.message });
  }
});


// List pending / done eBay updates
app.get('/api/ebay-updates', async (req, res) => {
  try {
    const done = String(req.query.done || 'false') === 'true';
    const rows = await listEbayUpdatesPG({ done });
    res.json(rows);
  } catch (err) {
    console.error('list ebay updates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mark an update as done/undone
app.put('/api/ebay-updates/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const done = !!req.body?.done;

    const row = await setEbayUpdateDonePG(id, done);
    if (!row) return res.status(404).json({ error: 'not found' });

    res.json(row);
  } catch (err) {
    console.error('set ebay update done error:', err);
    res.status(500).json({ error: err.message });
  }
});


/* ---------- API: Refurb items ---------- */

// Get all refurb items
app.get('/api/refurb', async (req, res) => {
  try {
    const view = String(req.query.view || '').trim().toLowerCase();

    // ✅ ACTIVE refurb list (hide scrapped + stripped)
    if (!view || view === 'active') {
      const { rows } = await pgQuery(
        `SELECT * FROM refurb_items
         WHERE status NOT IN ('scrapped', 'stripped')
         ORDER BY id DESC;`
      );
      return res.json(rows);
    }

    // ✅ RETIRED view (scrapped + stripped together)
    if (view === 'retired') {
      const { rows } = await pgQuery(
        `SELECT * FROM refurb_items
         WHERE status IN ('scrapped', 'stripped')
         ORDER BY id DESC;`
      );
      return res.json(rows);
    }

    // fallback (optional)
    const { rows } = await pgQuery(
      `SELECT * FROM refurb_items ORDER BY id DESC;`
    );
    res.json(rows);

  } catch (err) {
    console.error('Error fetching refurb items:', err);
    res.status(500).json({ error: 'Failed to fetch refurb items' });
  }
});


// Get one refurb + its detail record
app.get('/api/refurb/:id/detail', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const { rows } = await pgQuery(
      `
      SELECT r.*,
             d.specs_cpu, d.specs_ram, d.specs_storage, d.specs_gpu, d.specs_screen,
             d.os_version, d.parts_needed, d.parts_cost, d.checklist, d.notes AS detail_notes, d.updated_at
      FROM refurb_items r
      LEFT JOIN refurb_details d ON d.refurb_id = r.id
      WHERE r.id = $1
      `,
      [id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('refurb detail get error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upsert (insert if missing, otherwise update) detail record
app.put('/api/refurb/:id/detail', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const {
      specs_cpu = null,
      specs_ram = null,
      specs_storage = null,
      specs_gpu = null,
      specs_screen = null,
      os_version = null,
      parts_needed = null,
      parts_cost = 0,
      checklist = {},
      notes = null
    } = req.body || {};

    const { rows } = await pgQuery(
      `
      INSERT INTO refurb_details
        (refurb_id, specs_cpu, specs_ram, specs_storage, specs_gpu, specs_screen,
         os_version, parts_needed, parts_cost, checklist, notes, updated_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,NOW())
      ON CONFLICT (refurb_id)
      DO UPDATE SET
        specs_cpu = EXCLUDED.specs_cpu,
        specs_ram = EXCLUDED.specs_ram,
        specs_storage = EXCLUDED.specs_storage,
        specs_gpu = EXCLUDED.specs_gpu,
        specs_screen = EXCLUDED.specs_screen,
        os_version = EXCLUDED.os_version,
        parts_needed = EXCLUDED.parts_needed,
        parts_cost = EXCLUDED.parts_cost,
        checklist = EXCLUDED.checklist,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *;
      `,
      [
        id,
        specs_cpu,
        specs_ram,
        specs_storage,
        specs_gpu,
        specs_screen,
        os_version,
        parts_needed,
        Number(parts_cost) || 0,
        JSON.stringify(checklist || {}),
        notes
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('refurb detail save error:', err);
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/refurb', async (req, res) => {
  const {
    category,        // <-- from the form (V/M/L/H)
    sku,             // optional manual override
    serial,
    description,
    status,
    parts_status,
    cpu,
    supplier,
    cost,
    retail,
    notes,
  } = req.body || {};

  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }

  // If no SKU was supplied, auto-generate from category
  let skuNorm = sku ? String(sku).trim().toUpperCase() : null;

  if (!skuNorm) {
    const prefix = String(category || '').trim().toUpperCase();
    if (!prefix) return res.status(400).json({ error: 'category is required' });
    skuNorm = await getNextRefurbSkuPG(prefix);
  }

  try {
    const query = `
      INSERT INTO refurb_items (
      sku, serial, description, status, parts_status, cpu,
      supplier, category, cost, retail, notes
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)

      RETURNING *;
    `;

    const prefix = String(category || '').trim().toUpperCase(); // V/M/L/H

const values = [
  skuNorm,
  serial || null,
  description,
  status || 'refurb',
  parts_status || 'none',
  cpu || null,
  supplier || null,
  categoryFromSkuPrefix(skuNorm) || categoryFromSkuPrefix(prefix) || 'laptop',
  cost ?? 0,
  retail ?? 0,
  notes || null,
];


    const result = await pgQuery(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating refurb item:', err);
    res.status(500).json({ error: 'Failed to create refurb item' });
  }
});


// Update refurb item + if marked complete, sync with products by SKU
app.put('/api/refurb/:id', async (req, res) => {
  const { id } = req.params;
  const {
    status,
    parts_status,
    cpu,
    supplier,
    cost,
    retail,
    notes,
    sku, // allow editing SKU from the table
    description, 

    // NEW (optional fields for category-specific views)
    category,
    colour,
    storage,
    controller,
  } = req.body || {};

  // normalise SKU to uppercase like products
  const skuNorm = sku ? String(sku).trim().toUpperCase() : null;

  const autoCat = skuNorm ? categoryFromSkuPrefix(skuNorm) : null;

// If frontend sent a category, keep it.
// If not, and we can infer from SKU, use inferred value.
const categoryToUse = (category ?? null) || autoCat;


  try {
    // 1) Get the existing refurb row so we know its previous status
    const existing = await pgQuery(
      'SELECT id, status, sku FROM refurb_items WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Refurb item not found' });
    }

    const oldStatus = existing.rows[0].status;

    // 2) Update refurb row
        const query = `
      UPDATE refurb_items
      SET
        status       = COALESCE($1, status),
        parts_status = COALESCE($2, parts_status),
        cpu          = COALESCE($3, cpu),
        supplier     = COALESCE($4, supplier),
        cost         = COALESCE($5, cost),
        retail       = COALESCE($6, retail),
        notes        = COALESCE($7, notes),
        sku          = COALESCE($8, sku),
        description  = COALESCE($9, description),


        category     = COALESCE($10, category),
        colour       = COALESCE($11, colour),
        storage      = COALESCE($12, storage),
        controller   = COALESCE($13, controller)

      WHERE id = $14
      RETURNING *;
    `;


        const values = [
      status ?? null,
      parts_status ?? null,
      cpu ?? null,
      supplier ?? null,
      cost ?? null,
      retail ?? null,
      notes ?? null,
      skuNorm ?? null,
      description ?? null,

      categoryToUse ?? null,
      colour ?? null,
      storage ?? null,
      controller ?? null,

      id,
    ];


    const result  = await pgQuery(query, values);
    const updated = result.rows[0];

    const newStatus = updated.status;
    const skuToUse  = updated.sku;

    console.log('REFURB UPDATE', { id, oldStatus, newStatus, skuToUse });

    // 3) If status changed to 'complete' and we have a SKU, either:
    //    - bump existing product quantity
    //    - or create a new product with qty = 1
    if (
      oldStatus !== 'complete' &&
      newStatus === 'complete' &&
      skuToUse
    ) {
      try {
        // Look up existing product by SKU
        const existingProduct = await getProductByCodePG(skuToUse);

        if (existingProduct) {
          // If it exists, just bump quantity
          const bumped = await adjustQtyPG(existingProduct.id, 1);
          console.log(
            'Stock incremented by 1 for SKU',
            skuToUse,
            '→ product id',
            existingProduct.id,
            'new qty:',
            bumped.quantity
          );
        } else {
          // If it doesn't exist, create a new product with qty = 1
          const data = {
            sku: skuToUse,
            name: updated.description || `Refurb item #${updated.id}`,
            notes: `Auto-created from refurb #${updated.id}`,
            on_ebay: 0,
            cost: Number(updated.cost) || 0,
            retail: Number(updated.retail) || 0,
            fees: 0,
            postage: 0,
            quantity: 1,
          };

          const created = await createProductPG(data);
          console.log('Created new product from refurb complete:', {
            id: created.id,
            sku: created.sku,
            quantity: created.quantity,
          });
        }
      } catch (stockErr) {
        console.error('Failed to sync stock after refurb complete:', stockErr);
        // Don't fail the refurb update if stock sync fails
      }
    }

    // 4) Return the updated refurb row
    res.json(updated);

  } catch (err) {
    console.error('Error updating refurb:', err);
    res.status(500).json({ error: 'Failed to update refurb item' });
  }
});


// Delete a refurb item
app.delete('/api/refurb/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pgQuery(
      'DELETE FROM refurb_items WHERE id = $1',
      [id]
    );
    res.json({ deleted: result.rowCount > 0 });
  } catch (err) {
    console.error('Error deleting refurb item:', err);
    res.status(500).json({ error: 'Failed to delete refurb item' });
  }
});


/* ---------- API: Trade-ins ---------- */

// List trade-ins
app.get('/api/tradein', async (req, res) => {
  try {
    const { rows } = await pgQuery(
      'SELECT * FROM trade_ins ORDER BY id DESC;'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching trade-ins:', err);
    res.status(500).json({ error: 'Failed to fetch trade-ins' });
  }
});

// Create trade-in + auto-create refurb item
app.post('/api/tradein', upload.single('id_image'), async (req, res) => {
  console.log('HIT POST /api/tradein');
  try {
    const {
      customer_id, 
      customer_name,
      customer_phone,
      customer_address,
      serial,
      device_desc,
      valuation,
      agreed_value,
      create_refurb,  // "on" when checkbox ticked
    } = req.body || {};

        // ----------------------------
    // Resolve customer (existing or new)
    // ----------------------------
    let custId = customer_id ? Number(customer_id) : null;

    // if customer_id provided, load customer record
    if (custId) {
      const { rows } = await pgQuery('SELECT * FROM customers WHERE id = $1', [custId]);
      const c = rows[0];
      if (!c) return res.status(400).json({ error: 'customer not found' });

      // overwrite form values with stored ones (keeps things consistent)
      // (optional, but nice)
      // customer_name = c.name;   // can't reassign const, so just use c.name later if needed
    } else {
      // No customer_id → create a new customer record
      if (!customer_name) {
        return res.status(400).json({ error: 'Customer name is required' });
      }

      const { rows } = await pgQuery(
        `
        INSERT INTO customers (name, phone, email)
        VALUES ($1,$2,$3)
        RETURNING id;
        `,
        [
          String(customer_name).trim(),
          customer_phone || null,
          customer_address || null
        ]
      );
      custId = rows[0].id;
    }


    if ((!customer_id && !customer_name) || !device_desc) {
      return res.status(400).json({ error: 'Customer (name or selected customer) and device description are required' });
    }


    const valuationNum = valuation ? Number(valuation) : null;
    const agreedNum    = agreed_value ? Number(agreed_value) : null;

    const idImagePath = req.file ? `/uploads/${req.file.filename}` : null;

    // If we uploaded an ID image AND we have a customer, store it on the customer record too
    if (idImagePath && custId) {
      await pgQuery(`UPDATE customers SET id_image_path = $1, updated_at = NOW() WHERE id = $2`, [idImagePath, custId]);
    }


    let refurbId = null;

    // Auto-create refurb row if requested (or just always – tweak if you like)
    if (create_refurb === 'on' || create_refurb === 'true' || create_refurb === '1') {
      const refurbNotes = `Trade-in from ${customer_name}${agreedNum != null ? `, agreed £${agreedNum}` : ''}`;
      const refurbCost  = agreedNum != null ? agreedNum : (valuationNum || 0);

      const refurbRes = await pgQuery(
        `
        INSERT INTO refurb_items (
          sku, serial, description, status, parts_status,
          supplier, cost, retail, notes
        )
        VALUES (NULL, $1, $2, 'refurb', 'none', 'Trade-in', $3, NULL, $4)
        RETURNING id;
        `,
        [serial || null, device_desc, refurbCost, refurbNotes]
      );

      refurbId = refurbRes.rows[0]?.id || null;
    }

    const tradeRes = await pgQuery(
      `
      INSERT INTO trade_ins (
        customer_id,
        customer_name, customer_phone, customer_email,
        serial, device_desc, valuation, agreed_value,
        id_image_path, refurb_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *;
      `,
      [
        custId,
        customer_name,
        customer_phone || null,
        customer_email || null,
        serial || null,
        device_desc,
        valuationNum,
        agreedNum,
        idImagePath,
        refurbId,
      ]
    );

    res.status(201).json(tradeRes.rows[0]);
  } catch (err) {
    console.error('Error creating trade-in:', err);
    res.status(500).json({ error: 'Failed to create trade-in' });
  }
});


/* ---------- API: Stock ops ---------- */

// Stock IN by barcode / SKU  (Postgres)
app.post('/api/stock/in', async (req, res) => {
  try {
    const { sku, barcode, qty = 1 } = req.body || {};
    const code = String(sku || barcode || '').trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ error: 'sku or barcode is required' });
    }

    const product = await getProductByCodePG(code);
    if (!product) {
      return res.status(404).json({ error: 'product not found' });
    }

    const amount = Number(qty) || 1;

// remember old qty before change
const oldQty = Number(product.quantity) || 0;

// update quantity
const updated = await adjustQtyPG(product.id, amount);
const newQty = Number(updated.quantity) || 0;

// 🧠 if stock was 0 and now exists → needs RELIST
if (oldQty === 0 && newQty > 0) {
  const bumped = await setEbayStatus(product.id, "ready_to_list");
  return res.json(bumped);
}

res.json(updated);

  } catch (err) {
    console.error('PG stock/in error:', err);
    res.status(500).json({ error: err.message });
  }
});



// Stock OUT by barcode / SKU, log sale (Postgres)
app.post('/api/stock/out', async (req, res) => {
  try {
    const {
      sku,
      barcode,
      qty = 1,
      channel = 'manual',
      order_ref = null,
      note = null,
    } = req.body || {};

    const code = String(sku || barcode || '').trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ error: 'sku or barcode is required' });
    }

    const product = await getProductByCodePG(code);
    if (!product) {
      return res.status(404).json({ error: 'product not found' });
    }

    const amount = Number(qty) || 1;
    if (product.quantity - amount < 0) {
      return res.status(400).json({ error: 'insufficient stock' });
    }

    // 1) Update quantity
    const updated = await adjustQtyPG(product.id, -amount);

    const newQty = Number(updated.quantity) || 0;

if (newQty === 0) {
  await setEbayStatus(product.id, "sold_on_ebay");
}



    // 2) Insert sale record
    await insertSalePG({
      product_id: product.id,
      sku: product.sku,
      quantity: amount,
      unit_cost: product.cost || 0,
      unit_retail: product.retail || 0,
      fees: product.fees || 0,
      postage: product.postage || 0,
      channel,
      order_ref,
      note,
    });

    res.json(updated);
  } catch (err) {
    console.error('PG stock/out error:', err);
    res.status(500).json({ error: err.message });
  }
});


// Stock TAKE (set quantity exactly) – Postgres
app.post('/api/stock/take', async (req, res) => {
  try {
    const { sku, barcode, qty } = req.body || {};
    if (qty === undefined || qty === null) {
      return res.status(400).json({ error: 'qty is required' });
    }

    const code = String(sku || barcode || '').trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ error: 'sku or barcode is required' });
    }

    const product = await getProductByCodePG(code);
    if (!product) {
      return res.status(404).json({ error: 'product not found' });
    }

    const oldQty = Number(product.quantity) || 0;
const updated = await setQtyPG(product.id, Number(qty) || 0);
const newQty = Number(updated.quantity) || 0;

// if stock goes from 0 -> 1+, mark as RELIST
if (oldQty === 0 && newQty > 0) {
  const bumped = await setEbayStatus(product.id, "ready_to_list");
  return res.json(bumped);
}

res.json(updated);

  } catch (err) {
    console.error('PG stock/take error:', err);
    res.status(500).json({ error: err.message });
  }
});



/* ---------- API: Sales list (Postgres) ---------- */
app.get('/api/sales', async (req, res) => {
  try {
    const rows = await listSalesPG();
    res.json(rows);
  } catch (err) {
    console.error('PG listSales error:', err);
    res.status(500).json({ error: err.message });
  }
});


/* ========= Reports ========= */

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}
function esc(s='') {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function dateRangeFromQuery(q) {
  const tz = new Date().toLocaleString('en-GB', { timeZoneName: 'short' }).split(' ').pop();
  const today = new Date();
  const d = (x) => x.toISOString().slice(0,10);
  const from = q.from || d(today);
  const to   = q.to   || from;
  return {
    fromDate: from,
    toDate: to,
    fromTs: `${from} 00:00:00`,
    toTs:   `${to} 23:59:59`,
    label: from === to ? from : `${from} → ${to}`,
    tz
  };
}

/* API: stock report data */
/* API: stock report data (Postgres) */
app.get('/api/reports/stock', async (req, res) => {
  try {
    const { rows } = await pgQuery(`
      SELECT id, sku, name, on_ebay, cost, retail, fees, postage, quantity,
             quantity * cost   AS value_cost,
             quantity * retail AS value_retail,
             quantity * (retail - cost - fees - postage) AS potential_profit
      FROM products
      ORDER BY sku ASC
    `);

    const { rows: totalRows } = await pgQuery(`
      SELECT
        SUM(quantity)                       AS qty_total,
        SUM(quantity * cost)                AS total_cost_value,
        SUM(quantity * retail)              AS total_retail_value,
        SUM(quantity * (retail - cost - fees - postage)) AS total_potential_profit
      FROM products
    `);

    const totals = totalRows[0] || {
      qty_total: 0,
      total_cost_value: 0,
      total_retail_value: 0,
      total_potential_profit: 0,
    };

    res.json({ rows, totals });
  } catch (err) {
    console.error('PG stock report error:', err);
    res.status(500).json({ error: err.message });
  }
});


/* Printable cash reconciliation */
app.get('/report/cash', async (req, res) => {
  const dr = dateRangeFromQuery(req.query);

  try {
    const { rows } = await pgQuery(
      `
      SELECT channel, sku, quantity, unit_cost, unit_retail, fees, postage, created_at
      FROM sales
      WHERE created_at BETWEEN $1 AND $2
      ORDER BY created_at, channel, sku
      `,
      [dr.fromTs, dr.toTs]
    );

    const { rows: byChannel } = await pgQuery(
      `
      SELECT channel,
             SUM(quantity)                       AS qty,
             SUM(unit_retail * quantity)         AS revenue,
             SUM(unit_cost   * quantity)         AS cost,
             SUM(fees        * quantity)         AS fees,
             SUM(postage     * quantity)         AS postage
      FROM sales
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY channel
      ORDER BY channel
      `,
      [dr.fromTs, dr.toTs]
    );

    const { rows: totalsRows } = await pgQuery(
      `
      SELECT
        SUM(quantity)                   AS qty,
        SUM(unit_retail * quantity)     AS revenue,
        SUM(unit_cost   * quantity)     AS cost,
        SUM(fees        * quantity)     AS fees,
        SUM(postage     * quantity)     AS postage
      FROM sales
      WHERE created_at BETWEEN $1 AND $2
      `,
      [dr.fromTs, dr.toTs]
    );

    const totals = totalsRows[0] || {
      qty: 0,
      revenue: 0,
      cost: 0,
      fees: 0,
      postage: 0,
    };

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Cash Reconciliation</title>
  <style>
    body{font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:24px}
    h1{margin:0 0 4px}
    .meta{color:#555;margin:0 0 16px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ddd;padding:6px 8px}
    th{background:#f6f6f6;text-align:left}
    tfoot td{font-weight:600;background:#fafafa}
    .right{text-align:right}
    .mono{font-family:ui-monospace,Menlo,Consolas,monospace}
    @media print { .no-print{display:none} body{margin:0} }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:12px">
    <button onclick="window.print()">Print</button>
  </div>
  <h1>Cash Reconciliation</h1>
  <p class="meta">Range: ${esc(dr.label)} (${esc(dr.tz)}) — Generated ${esc(new Date().toLocaleString())}</p>

  <div class="grid">
    <table>
      <thead><tr><th>Channel</th><th class="right">Qty</th><th class="right">Revenue</th><th class="right">Fees</th><th class="right">Postage</th><th class="right">Cost</th><th class="right">Net</th></tr></thead>
      <tbody>
        ${byChannel.map(r=>{
          const net = (r.revenue||0)-(r.cost||0)-(r.fees||0)-(r.postage||0);
          return `<tr>
            <td>${esc(r.channel||'–')}</td>
            <td class="right">${r.qty||0}</td>
            <td class="right">${fmt(r.revenue)}</td>
            <td class="right">${fmt(r.fees)}</td>
            <td class="right">${fmt(r.postage)}</td>
            <td class="right">${fmt(r.cost)}</td>
            <td class="right">${fmt(net)}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td>Totals</td>
          <td class="right">${totals.qty||0}</td>
          <td class="right">${fmt(totals.revenue)}</td>
          <td class="right">${fmt(totals.fees)}</td>
          <td class="right">${fmt(totals.postage)}</td>
          <td class="right">${fmt(totals.cost)}</td>
          <td class="right">${fmt((totals.revenue||0)-(totals.cost||0)-(totals.fees||0)-(totals.postage||0))}</td>
        </tr>
      </tfoot>
    </table>

    <table>
      <thead><tr><th>Time</th><th>Channel</th><th>SKU</th><th class="right">Qty</th><th class="right">Retail</th><th class="right">Cost</th><th class="right">Fees</th><th class="right">Postage</th><th class="right">Line Net</th></tr></thead>
      <tbody>
        ${rows.map(r=>{
          const net = (r.unit_retail*r.quantity) -
                      (r.unit_cost*r.quantity) -
                      (r.fees*r.quantity) -
                      (r.postage*r.quantity);
          return `<tr>
            <td>${esc(r.created_at.toISOString().slice(0,16))}</td>
            <td>${esc(r.channel||'–')}</td>
            <td class="mono">${esc(r.sku||'')}</td>
            <td class="right">${r.quantity}</td>
            <td class="right">${fmt(r.unit_retail*r.quantity)}</td>
            <td class="right">${fmt(r.unit_cost*r.quantity)}</td>
            <td class="right">${fmt(r.fees*r.quantity)}</td>
            <td class="right">${fmt(r.postage*r.quantity)}</td>
            <td class="right">${fmt(net)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <p class="meta">Note: fees & postage are treated as per-unit in this report (multiplied by quantity).</p>
</body>
</html>`;
    res.type('html').send(html);
  } catch (err) {
    console.error('PG cash report error:', err);
    res.status(500).send('Error generating report');
  }
});

// Search customers (simple search)
app.get('/api/customers', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      const { rows } = await pgQuery(`SELECT * FROM customers ORDER BY id DESC LIMIT 50;`);
      return res.json(rows);
    }

    const like = `%${q}%`;
    const { rows } = await pgQuery(
      `
      SELECT *
      FROM customers
      WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1
      ORDER BY id DESC
      LIMIT 50;
      `,
      [like]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a customer
app.post('/api/customers', async (req, res) => {
  try {
    const { name, phone = null, email = null, notes = null, id_image_path = null } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await pgQuery(
      `
      INSERT INTO customers (name, phone, address, notes, id_image_path)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *;
      `,
      [String(name).trim(), phone, email, notes, id_image_path]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a customer
app.put('/api/customers/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const { name, phone, email, notes, id_image_path } = req.body || {};

    const { rows } = await pgQuery(
      `
      UPDATE customers
      SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        email = COALESCE($3, email),
        notes = COALESCE($4, notes),
        id_image_path = COALESCE($5, id_image_path),
        updated_at = NOW()
      WHERE id = $6
      RETURNING *;
      `,
      [name ?? null, phone ?? null, email ?? null, notes ?? null, id_image_path ?? null, id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// ---- START SERVER ----
const PORT = process.env.PORT || 4100;

// 1) Initialise Postgres tables
await initDb();   // ✅ this runs the CREATE TABLE IF NOT EXISTS in db.js

// 2) Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



