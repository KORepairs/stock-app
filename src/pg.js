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

/**
 * Run work on one dedicated pool client inside a transaction.
 * COMMIT only after the callback succeeds. ROLLBACK on throw.
 * The client is always released. If ROLLBACK fails, the original error is rethrown.
 */
export async function withTransaction(fn) {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Keep the original callback/COMMIT error; do not replace it with ROLLBACK's.
    }
    throw err;
  } finally {
    client.release();
  }
}
