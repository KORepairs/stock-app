// src/db.js
import { pgQuery } from './pg.js';

export async function initDb() {
  // Products table
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS products (
      id        SERIAL PRIMARY KEY,
      sku       TEXT UNIQUE NOT NULL,
      code      TEXT,
      name      TEXT NOT NULL,
      notes     TEXT,
      on_ebay   INTEGER DEFAULT 0,
      cost      NUMERIC DEFAULT 0,
      retail    NUMERIC DEFAULT 0,
      fees      NUMERIC DEFAULT 0,
      postage   NUMERIC DEFAULT 0,
      quantity  INTEGER DEFAULT 0
    );
  `);

  // eBay listing workflow fields (safe migrations)
await pgQuery(`
  ALTER TABLE products
    ADD COLUMN IF NOT EXISTS ebay_status TEXT NOT NULL DEFAULT 'not_listed',
    ADD COLUMN IF NOT EXISTS ebay_notes  TEXT;
`);


  await pgQuery(`ALTER TABLE products ADD COLUMN IF NOT EXISTS code TEXT;`);
  await pgQuery(`CREATE UNIQUE INDEX IF NOT EXISTS products_code_uq ON products(code) WHERE code IS NOT NULL;`);


// One-time backfill: map legacy on_ebay to new ebay_status
await pgQuery(`
  UPDATE products
  SET ebay_status = 'listed'
  WHERE on_ebay IS TRUE
    AND (ebay_status IS NULL OR ebay_status = 'not_listed');
`);



  // Sales table
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS sales (
      id          SERIAL PRIMARY KEY,
      product_id  INTEGER REFERENCES products(id),
      sku         TEXT NOT NULL,
      quantity    INTEGER NOT NULL,
      unit_cost   NUMERIC,
      unit_retail NUMERIC,
      fees        NUMERIC DEFAULT 0,
      postage     NUMERIC DEFAULT 0,
      channel     TEXT,
      order_ref   TEXT,
      note        TEXT
    );
  `);

  // Refurb items table
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS refurb_items (
      id           SERIAL PRIMARY KEY,
      sku          TEXT,                    -- optional: link to a stock SKU if you want
      serial       TEXT,                    -- device serial / IMEI
      description  TEXT NOT NULL,           -- e.g. "iPhone 11 128GB Black"
      status       TEXT NOT NULL DEFAULT 'refurb',         -- strip / refurb / scrap / complete
      parts_status TEXT NOT NULL DEFAULT 'none',           -- none / needs_parts / awaiting_parts / has_parts
      supplier     TEXT,                    -- where it came from
      cost         NUMERIC DEFAULT 0,       -- what you paid
      retail       NUMERIC DEFAULT 0,       -- target resale price
      notes        TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pgQuery(`ALTER TABLE refurb_items ADD COLUMN IF NOT EXISTS cpu TEXT;`);
  // --- Extra fields for different refurb categories (phones/tablets/consoles) ---
  await pgQuery(`ALTER TABLE refurb_items ADD COLUMN IF NOT EXISTS category TEXT;`);
  await pgQuery(`ALTER TABLE refurb_items ADD COLUMN IF NOT EXISTS colour TEXT;`);
  await pgQuery(`ALTER TABLE refurb_items ADD COLUMN IF NOT EXISTS storage TEXT;`);
  await pgQuery(`ALTER TABLE refurb_items ADD COLUMN IF NOT EXISTS controller TEXT;`);

  // Default existing refurb items to 'laptop' so they appear in laptop/pc view
await pgQuery(`
  UPDATE refurb_items
  SET category = 'laptop'
  WHERE category IS NULL;
`);




    // Refurb details (extra info + checklist per refurb item)
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS refurb_details (
      refurb_id     INTEGER PRIMARY KEY REFERENCES refurb_items(id) ON DELETE CASCADE,

      specs_cpu     TEXT,
      specs_ram     TEXT,
      specs_storage TEXT,
      specs_gpu     TEXT,
      specs_screen  TEXT,
      os_version    TEXT,

      parts_needed  TEXT,
      parts_cost    NUMERIC(10,2) DEFAULT 0,

      checklist     JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes         TEXT,

      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // --- Extra specs for non-laptop devices (safe migrations) ---
await pgQuery(`
  ALTER TABLE refurb_details
    ADD COLUMN IF NOT EXISTS specs_colour    TEXT,
    ADD COLUMN IF NOT EXISTS specs_network   TEXT,
    ADD COLUMN IF NOT EXISTS specs_condition TEXT,
    ADD COLUMN IF NOT EXISTS specs_firmware  TEXT,
    ADD COLUMN IF NOT EXISTS specs_region    TEXT,
    ADD COLUMN IF NOT EXISTS specs_bundle    TEXT;
`);


    await pgQuery(`CREATE INDEX IF NOT EXISTS refurb_details_updated_idx ON refurb_details(updated_at);`);


  // eBay quantity update queue (what you need to go change on eBay later)
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS ebay_updates (
      id         SERIAL PRIMARY KEY,
      sku        TEXT NOT NULL,
      code       TEXT,
      delta      INTEGER NOT NULL,         -- how much stock changed (+/-)
      old_qty    INTEGER NOT NULL,
      new_qty    INTEGER NOT NULL,
      note       TEXT,
      done       BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Customers table (for repeat trade-ins)
await pgQuery(`
  CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    id_image_path TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
`);

// Add missing columns safely (schema migrations)
await pgQuery(`
  ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS address TEXT;
`);

await pgQuery(`
  ALTER TABLE trade_ins
  ADD COLUMN IF NOT EXISTS customer_address TEXT;
`);


// Export log table (tracks last CSV export time)
await pgQuery(`
  CREATE TABLE IF NOT EXISTS export_logs (
    key TEXT PRIMARY KEY,
    last_exported TIMESTAMPTZ NOT NULL
  );
`);



  // Make sure created_at exists on both tables
  await pgQuery(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  `);

  await pgQuery(`
    ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  `);

  // Make sure created_at exists on refurb_items too (safe even if already there)
  await pgQuery(`
    ALTER TABLE refurb_items
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  `);

  // Trade-in records
await pgQuery(`
  CREATE TABLE IF NOT EXISTS trade_ins (
    id SERIAL PRIMARY KEY,
    customer_name   TEXT NOT NULL,
    customer_phone  TEXT,
    customer_email  TEXT,
    serial          TEXT,
    device_desc     TEXT NOT NULL,
    valuation       NUMERIC(10,2),
    agreed_value    NUMERIC(10,2),
    id_image_path   TEXT,
    refurb_id       INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  );
`);

await pgQuery(`CREATE INDEX IF NOT EXISTS customers_name_idx  ON customers (name);`);
await pgQuery(`CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone);`);
await pgQuery(`CREATE INDEX IF NOT EXISTS customers_email_idx ON customers (email);`);

await pgQuery(`
  ALTER TABLE trade_ins
  ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
`);




}

