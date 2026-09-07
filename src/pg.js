// src/pg.js
import pg from 'pg';
import { resolvePgConfig } from './pgConfig.js';

const { Pool } = pg;

let pool = null;

const resolved = resolvePgConfig(process.env);
if (resolved.ok) {
  pool = new Pool(resolved.config);
  console.log('[PG] Pool created');
} else {
  console.warn('[PG] Postgres disabled.');
}

export { pool };

/**
 * Safe wrapper: in environments without Postgres,
 * it just returns an empty result instead of crashing.
 */
export async function pgQuery(text, params = []) {
  if (!pool) {
    console.warn('[PG] pgQuery called but Postgres is not configured – returning empty result.');
    return { rows: [], rowCount: 0 };
  }

  return pool.query(text, params);
}
