// src/index.js
import 'dotenv/config';


import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import auth from 'basic-auth';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { pgQuery } from './pg.js';
import { pool } from './pg.js';
import { initDb } from './db.js'
import { listProductsPG, createProductPG, getProductByIdPG } from './pgProducts.js';






/* ---------- Paths ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DB_FILE = process.env.DB_FILE || path.join(process.env.DB_DIR || '.', 'data.db');
const DB_DIR = path.dirname(DB_FILE);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

/* ---------- App ---------- */
const app = express();

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



/* ---------- Static / Pages ---------- */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

app.get('/',               (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/products',       (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'products.html')));
app.get('/products/list',  (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'products-list.html')));
app.get('/import',         (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'import.html')));
app.get('/scan',           (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'scan.html')));
app.get('/stocktake',      (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'stocktake.html')));
app.get('/report/sales',   (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'report-sales.html')));
app.get('/report/stock',   (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'report-stock.html')));
app.get('/quick-add',      (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'quick-add.html')));

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


/* ---------- DB ---------- */
const db = new Database(DB_FILE);
db.pragma('journal_mode = wal');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sku        TEXT UNIQUE,
  name       TEXT NOT NULL,
  notes      TEXT,
  on_ebay    INTEGER DEFAULT 0,
  cost       REAL DEFAULT 0,
  retail     REAL DEFAULT 0,
  fees       REAL DEFAULT 0,
  postage    REAL DEFAULT 0,
  quantity   INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   INTEGER,
  sku          TEXT,
    quantity     INTEGER,
  unit_cost    REAL,
  unit_retail  REAL,
  fees         REAL,
  postage      REAL,
  channel      TEXT,
  order_ref    TEXT,
  note         TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);
`);

/* ---------- Statements ---------- */
const getProductById       = db.prepare(`SELECT * FROM products WHERE id = ?`);
const getProductByBarcode  = db.prepare(`SELECT * FROM products WHERE sku = ?`);
const getProductBySku      = db.prepare(`SELECT * FROM products WHERE sku = ?`);
const listProductsStmt = db.prepare(`SELECT * FROM products ORDER BY sku COLLATE NOCASE ASC`);
const insertProductStmt    = db.prepare(`
  INSERT INTO products
    (sku, name, notes, on_ebay, cost, retail, fees, postage, quantity)
  VALUES
    (@sku, @name, @notes, @on_ebay, @cost, @retail, @fees, @postage, @quantity)
`);
const updateQtyById        = db.prepare(`UPDATE products SET quantity = quantity + @delta WHERE id = @id`);
const setQtyById           = db.prepare(`UPDATE products SET quantity = @qty WHERE id = @id`);
const listSalesStmt        = db.prepare(`SELECT * FROM sales ORDER BY created_at DESC`);
const insertSaleStmt       = db.prepare(`
  INSERT INTO sales
    (product_id, sku, quantity, unit_cost, unit_retail, fees, postage, channel, order_ref, note)
  VALUES
    (@product_id, @sku, @quantity, @unit_cost, @unit_retail, @fees, @postage, @channel, @order_ref, @note)
`);
const deleteProductStmt    = db.prepare(`DELETE FROM products WHERE id = ?`);

/* ---------- API: Products ---------- */

app.get('/api/products', async (req, res) => {
  try {
    const rows = await listProductsPG();
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


// Update (normalized, clears notes when blank)
app.put('/api/products/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const {
      sku,
      name,
      quantity = 0,
      onEbay = false,
      retail = 0,
      cost = 0,
      fees = 0,
      postage = 0,
      notes = null
    } = req.body || {};

    const skuNorm  = String(sku || '').trim().toUpperCase();
    const notesNorm = (notes == null || String(notes).trim() === '')
      ? null
      : String(notes).trim();

    const data = {
      id,
      sku: skuNorm,
      name: String(name || '').trim(),
      notes: notesNorm,
      on_ebay: (onEbay === true || onEbay === 'yes' || onEbay === 1) ? 1 : 0,
      cost: Number(cost) || 0,
      retail: Number(retail) || 0,
      fees: Number(fees) || 0,
      postage: Number(postage) || 0,
      quantity: Number(quantity) || 0,
    };

    const info = db.prepare(`
      UPDATE products
      SET
        sku=@sku,
        name=@name,
        notes=@notes,
        on_ebay=@on_ebay,
        cost=@cost,
        retail=@retail,
        fees=@fees,
        postage=@postage,
        quantity=@quantity
      WHERE id=@id
    `).run(data);


    if (info.changes === 0) return res.status(404).json({ error: 'not found' });

    const row = getProductById.get(id);
    res.json(row);
  } catch (err) {
    // e.g. UNIQUE constraint failed: products.sku / products.barcode
    res.status(400).json({ error: err.message });
  }
});

// Lookup a product by code (SKU)
app.get('/api/products/lookup/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const row = getProductBySku.get(code);   // uses your existing prepared statement
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});


// Delete
app.delete('/api/products/:id', (req, res) => {
  const info = deleteProductStmt.run(Number(req.params.id));
  res.json({ deleted: info.changes > 0 });
});

app.post('/api/products', async (req, res) => {
  try {
    const {
      sku,
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
    const notesNorm = (notes == null || String(notes).trim() === '')
      ? null
      : String(notes).trim();

    const data = {
      sku: skuNorm,
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


/* ---------- API: Stock ops ---------- */

// Stock IN by barcode
app.post('/api/stock/in', (req, res) => {
  const { sku, barcode, qty = 1 } = req.body || {};
  const code = String(sku || barcode || '').trim();
  const product = getProductByBarcode.get(code);
  if (!product) return res.status(404).json({ error: 'product not found' });

  updateQtyById.run({ id: product.id, delta: Number(qty) || 1 });
  const updated = getProductBySku.get(product.sku);
  res.json(updated);
});

// Stock OUT by barcode, log sale
app.post('/api/stock/out', (req, res) => {
  const { sku, barcode, qty = 1, channel = 'manual', order_ref = null, note = null } = req.body || {};
  const code = String(sku || barcode || '').trim();
  const product = getProductByBarcode.get(code);
  if (!product) return res.status(404).json({ error: 'product not found' });

  const amount = Number(qty) || 1;
  if (product.quantity - amount < 0) {
    return res.status(400).json({ error: 'insufficient stock' });
  }

  const tx = db.transaction(() => {
    updateQtyById.run({ id: product.id, delta: -amount });
    insertSaleStmt.run({
      product_id: product.id,
      sku: product.sku,
      quantity: amount,
      unit_cost: product.cost || 0,
      unit_retail: product.retail || 0,
      fees: product.fees || 0,
      postage: product.postage || 0,
      channel,
      order_ref,
      note
    });
  });
  tx();

  const updated = getProductBySku.get(product.sku);
  res.json(updated);
});

// Stock TAKE (set quantity)
app.post('/api/stock/take', (req, res) => {
  const { sku, barcode, qty } = req.body || {};
  if (qty === undefined || qty === null) {
    return res.status(400).json({ error: 'qty is required' });
  }
  const code = String(sku || barcode || '').trim();
  const product = getProductByBarcode.get(code);
  if (!product) return res.status(404).json({ error: 'product not found' });

  setQtyById.run({ id: product.id, qty: Number(qty) || 0 });
  const updated = getProductBySku.get(product.sku);
  res.json(updated);
});


/* ---------- API: Sales list ---------- */
app.get('/api/sales', (req, res) => {
  const rows = listSalesStmt.all();
  res.json(rows);
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
app.get('/api/reports/stock', (req, res) => {
  const rows = db.prepare(`
    SELECT id, sku, name, on_ebay, cost, retail, fees, postage, quantity,
           (quantity*cost)   AS value_cost,
           (quantity*retail) AS value_retail,
           (quantity*(retail - cost - fees - postage)) AS potential_profit
    FROM products
    ORDER BY sku COLLATE NOCASE
  `).all();

  const totals = db.prepare(`
    SELECT SUM(quantity) AS qty_total,
           SUM(quantity*cost) AS total_cost_value,
           SUM(quantity*retail) AS total_retail_value,
           SUM(quantity*(retail - cost - fees - postage)) AS total_potential_profit
    FROM products
  `).get();

  res.json({ rows, totals });
});

/* Printable cash reconciliation */
app.get('/report/cash', (req, res) => {
  const dr = dateRangeFromQuery(req.query);

  const rows = db.prepare(`
    SELECT channel, sku, quantity, unit_cost, unit_retail, fees, postage, created_at
    FROM sales
    WHERE created_at BETWEEN ? AND ?
    ORDER BY created_at, channel, sku
  `).all(dr.fromTs, dr.toTs);

  const byChannel = db.prepare(`
    SELECT channel,
           SUM(quantity)                               AS qty,
           SUM(unit_retail * quantity)                 AS revenue,
           SUM(unit_cost   * quantity)                 AS cost,
           SUM(fees        * quantity)                 AS fees,
           SUM(postage     * quantity)                 AS postage
    FROM sales
    WHERE created_at BETWEEN ? AND ?
    GROUP BY channel
    ORDER BY channel
  `).all(dr.fromTs, dr.toTs);

  const totals = db.prepare(`
    SELECT
      SUM(quantity)                           AS qty,
      SUM(unit_retail * quantity)             AS revenue,
      SUM(unit_cost   * quantity)             AS cost,
      SUM(fees        * quantity)             AS fees,
      SUM(postage     * quantity)             AS postage
    FROM sales
    WHERE created_at BETWEEN ? AND ?
  `).get(dr.fromTs, dr.toTs);

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
          const net = (r.unit_retail*r.quantity) - (r.unit_cost*r.quantity) - (r.fees*r.quantity) - (r.postage*r.quantity);
          return `<tr>
            <td>${esc(r.created_at.slice(0,16))}</td>
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
});

// ---- START SERVER ----
const PORT = process.env.PORT || 4100;

// 1) Initialise Postgres tables
await initDb();   // ✅ this runs the CREATE TABLE IF NOT EXISTS in db.js

// 2) Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



