// Pure products-code-index catalogue helpers.
// Callers supply a queryable client. This module does not connect or log.
import {
  CANONICAL_CODE_SQL,
  CANONICAL_NOTES_SQL,
  MIXED_CODE_INDEX_INIT_ERROR,
  NON_S_CODE_INDEX_PREDICATE_SQL,
  OLD_CODE_INDEX_PREDICATE_SQL,
  PRODUCTS_CODE_NON_S_UQ,
  PRODUCTS_CODE_UQ,
  PRODUCTS_S_CODE_NOTES_UQ,
  RETIRED_CODE_INDEX_INIT_ERROR,
  S_CODE_NOTES_INDEX_PREDICATE_SQL,
} from './categorySIdentity.js';

const TABLE = 'products';
const TABLE_SCHEMA = 'public';

export const INDEX_STATE = {
  OLD: 'old',
  NEW: 'new',
  MIXED: 'mixed',
  EMPTY: 'empty',
};

export function catalogFlag(value) {
  return value === true || value === 't' || value === 'true';
}

export function oidEqual(left, right) {
  if (left == null || right == null || left === '' || right === '') return false;
  return String(left) === String(right);
}

function attnumEqual(left, right) {
  if (left == null || right == null || left === '' || right === '') return false;
  return Number(left) === Number(right);
}

export function normalizeCatalogExpr(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/"/g, '')
    .replace(/::[a-z_][a-z0-9_ ]*/g, '')
    .replace(/\s+/g, '')
    .replace(/[()]/g, '');
}

export function catalogExprsEqual(actual, expected) {
  if (actual == null || expected == null) return false;
  return normalizeCatalogExpr(actual) === normalizeCatalogExpr(expected);
}

function hasRequiredIndexFlags(index, pinnedOid) {
  if (!index || index.inconsistent) return false;
  if (!oidEqual(index.tableOid, pinnedOid)) return false;
  if (String(index.amname) !== 'btree') return false;
  if (!index.unique || !index.valid || !index.ready || !index.live) return false;
  if (!Number.isInteger(index.indnkeyatts) || !Number.isInteger(index.indnatts)) return false;
  if (index.indnkeyatts !== index.indnatts) return false;
  if (!Array.isArray(index.keys) || index.keys.length !== index.indnkeyatts) return false;
  for (let i = 0; i < index.keys.length; i += 1) {
    if (Number(index.keys[i].position) !== i + 1) return false;
  }
  return true;
}

function isOrdinaryCodeKey(key, codeAttnum) {
  if (!key) return false;
  if (!attnumEqual(key.attnum, codeAttnum)) return false;
  if (!(Number(key.attnum) > 0)) return false;
  if (String(key.columnName) !== 'code') return false;
  return catalogExprsEqual(key.definition, 'code');
}

function isExpressionKey(key, expectedSql) {
  if (!key) return false;
  if (Number(key.attnum) !== 0) return false;
  if (key.columnName != null && String(key.columnName) !== '') return false;
  return catalogExprsEqual(key.definition, expectedSql);
}

export function isExactOldCodeIndex(index, pinnedOid, codeAttnum) {
  if (!index || String(index.index_name) !== PRODUCTS_CODE_UQ) return false;
  if (!hasRequiredIndexFlags(index, pinnedOid)) return false;
  if (index.indnkeyatts !== 1 || index.indnatts !== 1) return false;
  if (!isOrdinaryCodeKey(index.keys[0], codeAttnum)) return false;
  return catalogExprsEqual(index.predicate, OLD_CODE_INDEX_PREDICATE_SQL);
}

export function isExactNonSCodeIndex(index, pinnedOid, codeAttnum) {
  if (!index || String(index.index_name) !== PRODUCTS_CODE_NON_S_UQ) return false;
  if (!hasRequiredIndexFlags(index, pinnedOid)) return false;
  if (index.indnkeyatts !== 1 || index.indnatts !== 1) return false;
  if (!isOrdinaryCodeKey(index.keys[0], codeAttnum)) return false;
  return catalogExprsEqual(index.predicate, NON_S_CODE_INDEX_PREDICATE_SQL);
}

export function isExactSCodeNotesIndex(index, pinnedOid) {
  if (!index || String(index.index_name) !== PRODUCTS_S_CODE_NOTES_UQ) return false;
  if (!hasRequiredIndexFlags(index, pinnedOid)) return false;
  if (index.indnkeyatts !== 2 || index.indnatts !== 2) return false;
  if (!isExpressionKey(index.keys[0], CANONICAL_CODE_SQL)) return false;
  if (!isExpressionKey(index.keys[1], CANONICAL_NOTES_SQL)) return false;
  return catalogExprsEqual(index.predicate, S_CODE_NOTES_INDEX_PREDICATE_SQL);
}

export function classifyProductsCodeIndexState(indexes, pinnedOid, codeAttnum) {
  if (pinnedOid == null || pinnedOid === '') return INDEX_STATE.MIXED;
  if (codeAttnum == null || codeAttnum === '') return INDEX_STATE.MIXED;
  const list = Array.isArray(indexes) ? indexes : [];
  const byName = new Map();
  for (const index of list) {
    const name = String(index?.index_name || '');
    if (!name) return INDEX_STATE.MIXED;
    if (index?.inconsistent) return INDEX_STATE.MIXED;
    if (byName.has(name)) return INDEX_STATE.MIXED;
    if (!oidEqual(index.tableOid, pinnedOid)) return INDEX_STATE.MIXED;
    byName.set(name, index);
  }

  const oldIdx = byName.get(PRODUCTS_CODE_UQ);
  const nonS = byName.get(PRODUCTS_CODE_NON_S_UQ);
  const sIdx = byName.get(PRODUCTS_S_CODE_NOTES_UQ);

  const oldExact = isExactOldCodeIndex(oldIdx, pinnedOid, codeAttnum);
  const nonSExact = isExactNonSCodeIndex(nonS, pinnedOid, codeAttnum);
  const sExact = isExactSCodeNotesIndex(sIdx, pinnedOid);

  if (!oldIdx && !nonS && !sIdx) return INDEX_STATE.EMPTY;
  if (oldExact && !nonS && !sIdx) return INDEX_STATE.OLD;
  if (!oldIdx && nonSExact && sExact) return INDEX_STATE.NEW;
  return INDEX_STATE.MIXED;
}

export function classifyMigrationProductsCodeIndexState(indexes, pinnedOid, codeAttnum) {
  const state = classifyProductsCodeIndexState(indexes, pinnedOid, codeAttnum);
  if (state === INDEX_STATE.EMPTY) return INDEX_STATE.MIXED;
  return state;
}

export function planInitDbProductsCodeIndexes(state) {
  if (state === INDEX_STATE.EMPTY) return { action: 'create' };
  if (state === INDEX_STATE.NEW) return { action: 'noop' };
  if (state === INDEX_STATE.OLD) {
    return { action: 'reject', error: RETIRED_CODE_INDEX_INIT_ERROR };
  }
  return { action: 'reject', error: MIXED_CODE_INDEX_INIT_ERROR };
}

function catalogIndexMetaEqual(entry, row) {
  return (
    oidEqual(entry.tableOid, row.indrelid) &&
    entry.amname === String(row.amname || '') &&
    entry.unique === catalogFlag(row.indisunique) &&
    entry.valid === catalogFlag(row.indisvalid) &&
    entry.ready === catalogFlag(row.indisready) &&
    entry.live === catalogFlag(row.indislive) &&
    Number(entry.indnkeyatts) === Number(row.indnkeyatts) &&
    Number(entry.indnatts) === Number(row.indnatts) &&
    ((entry.predicate == null && row.predicate == null) ||
      (entry.predicate != null &&
        row.predicate != null &&
        String(entry.predicate) === String(row.predicate)))
  );
}

export function groupCatalogIndexRows(rows) {
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = String(row.index_name || '');
    if (!name) continue;
    if (!grouped.has(name)) {
      grouped.set(name, {
        index_name: name,
        tableOid: row.indrelid,
        amname: String(row.amname || ''),
        unique: catalogFlag(row.indisunique),
        valid: catalogFlag(row.indisvalid),
        ready: catalogFlag(row.indisready),
        live: catalogFlag(row.indislive),
        indnkeyatts: Number(row.indnkeyatts),
        indnatts: Number(row.indnatts),
        predicate: row.predicate == null ? null : String(row.predicate),
        keys: [],
        inconsistent: false,
      });
    }
    const entry = grouped.get(name);
    if (!catalogIndexMetaEqual(entry, row)) {
      entry.inconsistent = true;
    }
    const position = Number(row.key_position);
    if (Number.isFinite(position) && position >= 1) {
      entry.keys.push({
        position,
        attnum: Number(row.attnum),
        columnName: row.column_name == null || row.column_name === '' ? null : String(row.column_name),
        definition: row.key_definition == null ? null : String(row.key_definition),
      });
    }
  }
  for (const entry of grouped.values()) {
    entry.keys.sort((a, b) => a.position - b.position);
  }
  return [...grouped.values()];
}

export async function resolvePublicProductsTable(client) {
  const { rows } = await client.query(
    `
    SELECT c.oid, c.relkind
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relname = $2
    `,
    [TABLE_SCHEMA, TABLE]
  );
  if (rows.length !== 1) return null;
  return { oid: rows[0].oid, relkind: String(rows[0].relkind) };
}

export async function resolveProductsCodeAttnum(client, tableOid) {
  const { rows } = await client.query(
    `
    SELECT a.attnum
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = $1
      AND a.attname = 'code'
      AND a.attnum > 0
      AND NOT a.attisdropped
    `,
    [tableOid]
  );
  if (rows.length !== 1 || rows[0].attnum == null) return null;
  const attnum = Number(rows[0].attnum);
  if (!Number.isInteger(attnum) || attnum <= 0) return null;
  return attnum;
}

export async function loadProductsCodeIndexes(client, tableOid) {
  const { rows } = await client.query(
    `
    SELECT
      ic.relname AS index_name,
      x.indrelid,
      am.amname,
      x.indisunique,
      x.indisvalid,
      x.indisready,
      x.indislive,
      x.indnkeyatts,
      x.indnatts,
      pg_get_expr(x.indpred, x.indrelid, true) AS predicate,
      k.ord AS key_position,
      k.attnum,
      a.attname AS column_name,
      pg_get_indexdef(x.indexrelid, k.ord::integer, true) AS key_definition
    FROM pg_catalog.pg_index x
    JOIN pg_catalog.pg_class ic ON ic.oid = x.indexrelid
    JOIN pg_catalog.pg_namespace ns ON ns.oid = ic.relnamespace
    JOIN pg_catalog.pg_am am ON am.oid = ic.relam
    LEFT JOIN LATERAL unnest(x.indkey::int2[])
      WITH ORDINALITY AS k(attnum, ord) ON true
    LEFT JOIN pg_catalog.pg_attribute a
      ON a.attrelid = x.indrelid
     AND a.attnum = k.attnum
     AND k.attnum > 0
    WHERE x.indrelid = $1
      AND ns.nspname = $2
      AND (
        ic.relname = $3
        OR ic.relname = $4
        OR ic.relname = $5
      )
    ORDER BY ic.relname, k.ord
    `,
    [tableOid, TABLE_SCHEMA, PRODUCTS_CODE_UQ, PRODUCTS_CODE_NON_S_UQ, PRODUCTS_S_CODE_NOTES_UQ]
  );
  return groupCatalogIndexRows(rows);
}

export async function inspectProductsCodeIndexes(client, expectedOid) {
  const table = await resolvePublicProductsTable(client);
  if (!table || String(table.relkind) !== 'r' || table.oid == null) {
    return { ok: false, state: INDEX_STATE.MIXED, table: null };
  }
  if (expectedOid != null && !oidEqual(table.oid, expectedOid)) {
    return { ok: false, state: INDEX_STATE.MIXED, table };
  }
  const codeAttnum = await resolveProductsCodeAttnum(client, table.oid);
  if (codeAttnum == null) {
    return { ok: false, state: INDEX_STATE.MIXED, table };
  }
  const indexes = await loadProductsCodeIndexes(client, table.oid);
  const state = classifyProductsCodeIndexState(indexes, table.oid, codeAttnum);
  return { ok: true, state, table, indexes, codeAttnum };
}
