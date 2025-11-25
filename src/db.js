// src/db.js
import { pgQuery } from './pg.js';

export async function initDb() {
  // Products table
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS products (
      id        SERIAL PRIMARY KEY,
      sku       TEXT UNIQUE NOT NULL,
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

}
