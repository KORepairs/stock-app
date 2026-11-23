// Manual one-shot migration. Never imported by application startup.
// Replaces products_code_uq with Category S identity indexes.
// Does not insert, update, delete, truncate or rewrite product rows.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolvePgConfig } from '../src/pgConfig.js';
import {
  LOCK_PRODUCTS_SQL,
  MIGRATE_CREATE_PRODUCTS_CODE_NON_S_UQ_SQL,
  MIGRATE_CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL,
  MIGRATE_DROP_PRODUCTS_CODE_UQ_SQL,
} from '../src/categorySIdentity.js';
import {
  INDEX_STATE,
  classifyMigrationProductsCodeIndexState,
  inspectProductsCodeIndexes,
  oidEqual,
  resolvePublicProductsTable,
} from '../src/productsCodeIndexState.js';

const { Client } = pg;

const CONFIRMATIONS = {
  development: 'YES_MIGRATE_PRODUCTS_CODE_INDEXES_IN_DEVELOPMENT',
  production: 'YES_MIGRATE_PRODUCTS_CODE_INDEXES_IN_PRODUCTION',
};

export { CONFIRMATIONS, INDEX_STATE };

const INCOMPATIBLE_DATA_ERROR =
  'Existing product data is incompatible with the Category S identity indexes.';
const MIXED_STATE_ERROR =
  'products code indexes are in an unexpected state. No automatic repair was attempted.';
const VERIFY_FAILED_ERROR =
  'products code indexes could not be verified. No automatic repair was attempted.';

function fail(message, err) {
  console.error(message);
  if (err && typeof err === 'object') {
    const name = err.name ? String(err.name) : '';
    const code = err.code ? String(err.code) : '';
    if (name || code) {
      console.error(`Diagnostic: ${[name, code].filter(Boolean).join(' ')}`);
    }
  }
  process.exitCode = 1;
}

export function migrationContainsForbiddenProductWrites(source) {
  const text = String(source || '');
  return (
    /\bINSERT\s+INTO\s+products\b/i.test(text) ||
    /\bUPDATE\s+products\b/i.test(text) ||
    /\bDELETE\s+FROM\s+products\b/i.test(text) ||
    /\bTRUNCATE\s+(?:TABLE\s+)?(?:public\.)?products\b/i.test(text)
  );
}

function verifyFailedError() {
  const err = new Error('VERIFY_FAILED');
  err.name = 'VerifyFailed';
  err.code = 'VERIFY_FAILED';
  return err;
}

async function inspectState(client, expectedOid) {
  const result = await inspectProductsCodeIndexes(client, expectedOid);
  if (!result.ok) {
    return { ...result, state: INDEX_STATE.MIXED };
  }
  return {
    ...result,
    state: classifyMigrationProductsCodeIndexState(
      result.indexes,
      result.table?.oid,
      result.codeAttnum
    ),
  };
}

async function main() {
  await import('dotenv/config');

  const nodeEnv = String(process.env.NODE_ENV || '').trim();
  if (nodeEnv !== 'development' && nodeEnv !== 'production') {
    fail('Refusing to migrate: NODE_ENV must be exactly "development" or "production".');
    return;
  }

  const confirmation = CONFIRMATIONS[nodeEnv];
  if (process.env.ALLOW_PRODUCTS_CODE_INDEX_MIGRATION !== confirmation) {
    fail(
      `Refusing to migrate: ALLOW_PRODUCTS_CODE_INDEX_MIGRATION must be exactly the ${nodeEnv} confirmation value.`
    );
    return;
  }

  console.log(`Target environment: ${nodeEnv}`);
  console.log('This script is manual and must never run at application startup.');

  const resolved = resolvePgConfig(process.env);
  if (!resolved.ok) {
    fail(
      'Refusing to migrate: a valid DATABASE_URL or the complete PGHOST, PGPORT, PGDATABASE, PGUSER and PGPASSWORD set is required.'
    );
    return;
  }

  let client = null;
  let began = false;

  try {
    client = new Client(resolved.config);
    await client.connect();

    await client.query('BEGIN');
    began = true;

    const resolvedTable = await resolvePublicProductsTable(client);
    if (!resolvedTable || String(resolvedTable.relkind) !== 'r' || resolvedTable.oid == null) {
      fail(MIXED_STATE_ERROR);
      throw verifyFailedError();
    }
    const pinnedOid = resolvedTable.oid;

    await client.query(LOCK_PRODUCTS_SQL);

    const lockedTable = await resolvePublicProductsTable(client);
    if (
      !lockedTable ||
      String(lockedTable.relkind) !== 'r' ||
      !oidEqual(lockedTable.oid, pinnedOid)
    ) {
      fail(MIXED_STATE_ERROR);
      throw verifyFailedError();
    }

    const first = await inspectState(client, pinnedOid);
    if (!first.ok || !first.table) {
      fail(MIXED_STATE_ERROR);
      throw verifyFailedError();
    }

    if (first.state === INDEX_STATE.NEW) {
      await client.query('COMMIT');
      began = false;
      console.log(
        'products code indexes already migrated and verified. No data was changed.'
      );
      return;
    }

    if (first.state !== INDEX_STATE.OLD) {
      fail(MIXED_STATE_ERROR);
      throw verifyFailedError();
    }

    await client.query(MIGRATE_CREATE_PRODUCTS_CODE_NON_S_UQ_SQL);
    await client.query(MIGRATE_CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL);
    await client.query(MIGRATE_DROP_PRODUCTS_CODE_UQ_SQL);

    const verified = await inspectState(client, pinnedOid);
    if (!verified.ok || verified.state !== INDEX_STATE.NEW) {
      fail(VERIFY_FAILED_ERROR);
      throw verifyFailedError();
    }

    await client.query('COMMIT');
    began = false;
    console.log(
      'products code indexes migrated and verified. No business data was changed.'
    );
  } catch (err) {
    if (began && client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Keep the original error; do not replace it with ROLLBACK's.
      }
    }
    if (process.exitCode !== 1) {
      if (err && err.code === '23505') {
        fail(INCOMPATIBLE_DATA_ERROR, err);
      } else {
        fail('products code index migration failed. No connection details are logged.', err);
      }
    }
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        // Ignore disconnect errors.
      }
    }
  }
}

function isExecutedDirectly() {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return fileURLToPath(import.meta.url) === path.resolve(argv1);
  } catch {
    return false;
  }
}

if (isExecutedDirectly()) {
  await main();
}
