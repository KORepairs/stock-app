// src/pg.js — simple Postgres helper

import pkg from 'pg';
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;

// We'll hold the pool here (or null if no DATABASE_URL)
let pool = null;

if (!connectionString) {
  console.warn('[PG] No DATABASE_URL found. Postgres disabled.');
} else {
  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  });
}

// Export the pool so other files can use it
export { pool };

// Optional helper
export async function pgQuery(text, params = []) {
  if (!pool) {
    throw new Error('DATABASE_URL missing: Postgres not configured');
  }
  return pool.query(text, params);
}

// Optional: clean shutdown (mainly useful on some hosts)
process.on('SIGTERM', async () => {
  try {
    if (pool) await pool.end();
  } catch (_) {
    // ignore
  }
});
