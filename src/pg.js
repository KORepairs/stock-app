// src/pg.js
import pg from 'pg';
import { resolvePgSsl } from './pgSsl.js';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

let pool = null;

if (connectionString) {
  const poolConfig = { connectionString };
  const ssl = resolvePgSsl(connectionString, process.env.PGSSLMODE);
  if (ssl !== undefined) poolConfig.ssl = ssl;

  pool = new Pool(poolConfig);
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
