// Explicit development-only schema bootstrap.
// Never imported by application startup. Inserts no rows.
import 'dotenv/config';
import pg from 'pg';
import { CREATE_STATEMENTS, EXPECTED_TABLES } from '../src/schema.js';
import { resolvePgSsl } from '../src/pgSsl.js';

const { Client } = pg;

const REQUIRED_BOOTSTRAP_CONFIRMATION = 'YES_EMPTY_DEVELOPMENT_DATABASE';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function main() {
  if (process.env.NODE_ENV !== 'development') {
    fail('Refusing to bootstrap: NODE_ENV must be exactly "development".');
    return;
  }

  if (process.env.ALLOW_DEV_DB_BOOTSTRAP !== REQUIRED_BOOTSTRAP_CONFIRMATION) {
    fail(
      'Refusing to bootstrap: ALLOW_DEV_DB_BOOTSTRAP must be exactly YES_EMPTY_DEVELOPMENT_DATABASE.'
    );
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    fail('Refusing to bootstrap: DATABASE_URL is not set.');
    return;
  }

  const clientConfig = { connectionString };
  const ssl = resolvePgSsl(connectionString, process.env.PGSSLMODE);
  if (ssl !== undefined) clientConfig.ssl = ssl;

  const client = new Client(clientConfig);
  let began = false;

  try {
    await client.connect();

    const existing = await client.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1)
      ORDER BY table_name
      `,
      [EXPECTED_TABLES]
    );

    if (existing.rows.length > 0) {
      const names = existing.rows.map((row) => row.table_name).join(', ');
      fail(
        `Refusing to bootstrap: application table(s) already exist (${names}). This script only runs against an empty database.`
      );
      return;
    }

    await client.query('BEGIN');
    began = true;

    for (const sql of CREATE_STATEMENTS) {
      await client.query(sql);
    }

    await client.query('COMMIT');
    began = false;
    console.log('Development database schema created. No rows were inserted.');
  } catch (err) {
    if (began) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors; original failure is reported below.
      }
    }
    fail('Development database bootstrap failed. No connection details are logged.');
  } finally {
    try {
      await client.end();
    } catch {
      // Ignore disconnect errors.
    }
  }
}

await main();
