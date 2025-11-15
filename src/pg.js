// src/pg.js — Postgres helper (keeps your existing src/db.js untouched)
import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[PG] No DATABASE_URL found. Postgres disabled.');
}

export const pool = connectionString
  ? new Pool({
      connectionString,
      // Railway Postgres generally requires SSL
      ssl: { rejectUnauthorized: false },
    })
  : null;

export async function pgQuery(text, params = []) {
  if (!pool) throw new Error('DATABASE_URL missing: Postgres not configured');
  return pool.query(text, params);
}

// Optional: clean shutdown
process.on('SIGTERM', async () => {
  try { await pool?.end(); } catch {}
});
