// src/pg.js

// 1) Load .env here so DATABASE_URL is ready
import dotenv from 'dotenv';
dotenv.config();

// 2) Postgres setup
import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[PG] No DATABASE_URL found. Postgres disabled.');
}

// Only create a pool if we actually have a URL
export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

export async function pgQuery(text, params = []) {
  if (!pool) throw new Error('DATABASE_URL missing: Postgres not configured');
  return pool.query(text, params);
}

// Optional: clean shutdown
process.on('SIGTERM', async () => {
  try {
    await pool?.end();
  } catch {
    // ignore
  }
});
