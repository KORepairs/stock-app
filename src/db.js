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

  // Make sure created_at exists on both tables
  await pgQuery(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  `);

  await pgQuery(`
    ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  `);
}
