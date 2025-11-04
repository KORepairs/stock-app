import Database from 'better-sqlite3';

const db = new Database('data.sqlite');

// --- Products table ---
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    notes TEXT,
    on_ebay INTEGER DEFAULT 0,
    cost REAL DEFAULT 0,
    retail REAL DEFAULT 0,
    fees REAL DEFAULT 0,
    postage REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Check existing columns
const cols = db.prepare(`PRAGMA table_info(products)`).all();

// Add quantity column if missing
if (!cols.some(c => c.name === 'quantity')) {
  db.exec(`ALTER TABLE products ADD COLUMN quantity INTEGER DEFAULT 0;`);
  db.exec(`UPDATE products SET quantity = 0 WHERE quantity IS NULL;`);
}

// Add barcode column if missing
if (!cols.some(c => c.name === 'barcode')) {
  db.exec(`ALTER TABLE products ADD COLUMN barcode TEXT;`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);`);
}

// --- Sales table (for reporting) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    sku TEXT NOT NULL,
    barcode TEXT,
    quantity INTEGER NOT NULL,          -- positive number
    unit_cost REAL,
    unit_retail REAL,
    fees REAL DEFAULT 0,
    postage REAL DEFAULT 0,
    channel TEXT,
    order_ref TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`);

export default db;

