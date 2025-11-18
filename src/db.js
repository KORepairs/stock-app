// src/db.js — Postgres version of your old SQLite db.js

import { pgQuery } from './pg.js';

/**
 * Called once when the app starts.
 * Creates the products + sales tables in Postgres if they don't exist.
 * (Safe to run multiple times.)
 */
export async function initDb() {
  // Products table
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS products (
      id          SERIAL PRIMARY KEY,
      sku         TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      notes       TEXT,
      on_ebay     BOOLEAN DEFAULT FALSE,
      cost        NUMERIC DEFAULT 0,
      retail      NUMERIC DEFAULT 0,
      fees        NUMERIC DEFAULT 0,
      postage     NUMERIC DEFAULT 0,
      quantity    INTEGER DEFAULT 0,
      barcode     TEXT UNIQUE,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Sales table
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS sales (
      id          SERIAL PRIMARY KEY,
      product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku         TEXT NOT NULL,
      barcode     TEXT,
      quantity    INTEGER NOT NULL,
      unit_cost   NUMERIC,
      unit_retail NUMERIC,
      fees        NUMERIC DEFAULT 0,
      postage     NUMERIC DEFAULT 0,
      channel     TEXT,
      order_ref   TEXT,
      note        TEXT,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
  `);
}

// Re-export pgQuery so the rest of your app can use it
export { pgQuery };

// Optional default export so existing `import db from './db.js'` keeps working
const db = { initDb, pgQuery };
export default db;
