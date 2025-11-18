// src/pg.js
import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

let pool = null;

if (connectionString) {
  // Used on Railway (or anywhere you have DATABASE_URL set)
  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  });
  console.log('[PG] Pool created');
} else {
  // Local dev: no Postgres, we’ll just use SQLite
  console.warn('[PG] No DATABASE_URL found. Postgres disabled.');
}

export { pool };

/**
 * Safe wrapper: in environments without Postgres,
 * it just returns an empty result instead of crashing.
 */
export async function pgQuery(text, params = []) {
  if (!pool) {
    console.warn('[PG] pgQuery called but DATABASE_URL is missing – returning empty result.');
    return { rows: [], rowCount: 0 };
  }

  return pool.query(text, params);
}
