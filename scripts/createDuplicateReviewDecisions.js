// Manual one-shot migration. Never imported by application startup.
// Creates duplicate_review_decisions if missing, then verifies the table
// inside the same transaction before COMMIT.
// Does not insert, update, delete, alter or drop existing business data.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolvePgConfig } from '../src/pgConfig.js';

const { Client } = pg;

export const TABLE = 'duplicate_review_decisions';
const TABLE_SCHEMA = 'public';

const CONFIRMATIONS = {
  development: 'YES_CREATE_DUPLICATE_REVIEW_DECISIONS_IN_DEVELOPMENT',
  production: 'YES_CREATE_DUPLICATE_REVIEW_DECISIONS_IN_PRODUCTION',
};

export const EXPECTED_CATEGORY_VALUES = [
  'exact_sku',
  'exact_part_number',
  'possible_variant',
  'cross_collision',
  'likely_part_number',
  'exact_name',
  'suspicious',
];

export const EXPECTED_DECISION_VALUES = [
  'needs_physical_check',
  'confirmed_duplicate',
  'valid_variant',
  'keep_separate',
];

const EXPECTED_COLUMN_NAMES = [
  'id',
  'category',
  'member_key',
  'product_ids',
  'decision',
  'notes',
  'match_key',
  'group_id',
  'reviewed_at',
  'reviewed_by',
  'created_at',
  'updated_at',
];

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS duplicate_review_decisions (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL
    CHECK (category IN (
      'exact_sku',
      'exact_part_number',
      'possible_variant',
      'cross_collision',
      'likely_part_number',
      'exact_name',
      'suspicious'
    )),
  member_key TEXT NOT NULL,
  product_ids INTEGER[] NOT NULL,
  decision TEXT NOT NULL
    CHECK (decision IN (
      'needs_physical_check',
      'confirmed_duplicate',
      'valid_variant',
      'keep_separate'
    )),
  notes TEXT,
  match_key TEXT,
  group_id TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT duplicate_review_decisions_member_uniq
    UNIQUE (category, member_key),
  CONSTRAINT duplicate_review_decisions_ids_nonempty
    CHECK (cardinality(product_ids) >= 1)
)
`;

const CREATE_DECISION_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS duplicate_review_decisions_decision_idx
  ON duplicate_review_decisions (decision)
`;

const CREATE_REVIEWED_AT_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS duplicate_review_decisions_reviewed_at_idx
  ON duplicate_review_decisions (reviewed_at DESC)
`;

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

function compactSql(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function stripOuterParens(value) {
  let compact = String(value || '');
  while (compact.startsWith('(') && compact.endsWith(')')) {
    let depth = 0;
    let wrapsWhole = true;
    for (let i = 0; i < compact.length; i += 1) {
      if (compact[i] === '(') depth += 1;
      if (compact[i] === ')') {
        depth -= 1;
        if (depth === 0 && i !== compact.length - 1) {
          wrapsWhole = false;
          break;
        }
      }
    }
    if (!wrapsWhole) break;
    compact = compact.slice(1, -1);
  }
  return compact;
}

export function isNextvalDefault(value) {
  return /nextval\s*\(/i.test(String(value || ''));
}

export function isNowDefault(value) {
  if (value == null || String(value).trim() === '') return false;
  let compact = stripOuterParens(compactSql(value).replace(/"/g, ''));
  for (let i = 0; i < 3; i += 1) {
    const uncast = compact.replace(/::(?:timestampwithtimezone|timestamptz)$/, '');
    if (uncast === compact) break;
    compact = stripOuterParens(uncast);
  }
  return (
    compact === 'now()' ||
    compact === 'current_timestamp' ||
    compact === 'current_timestamp()' ||
    compact === 'transaction_timestamp()'
  );
}

export function hasNoDefault(value) {
  return value == null || String(value).trim() === '';
}

function isNotNull(row) {
  return String(row.is_nullable || '').toUpperCase() === 'NO';
}

function isNullable(row) {
  return String(row.is_nullable || '').toUpperCase() === 'YES';
}

function isTextType(row) {
  const dataType = String(row.data_type || '').toLowerCase();
  const udt = String(row.udt_name || '').toLowerCase();
  return dataType === 'text' || udt === 'text';
}

function isBigintType(row) {
  const dataType = String(row.data_type || '').toLowerCase();
  const udt = String(row.udt_name || '').toLowerCase();
  return dataType === 'bigint' || udt === 'int8';
}

function isInt4ArrayType(row) {
  const dataType = String(row.data_type || '').toLowerCase();
  const udt = String(row.udt_name || '').toLowerCase();
  return udt === '_int4' || dataType === 'integer[]' || (dataType === 'array' && udt === '_int4');
}

function isTimestamptzType(row) {
  const dataType = String(row.data_type || '').toLowerCase();
  const udt = String(row.udt_name || '').toLowerCase();
  return dataType === 'timestamp with time zone' || udt === 'timestamptz';
}

function catalogFlag(value) {
  return value === true || value === 't' || value === 'true';
}

function oidEqual(left, right) {
  if (left == null || right == null || left === '' || right === '') return false;
  return String(left) === String(right);
}

function setsEqual(actual, expected) {
  if (actual.size !== expected.size) return false;
  for (const value of expected) {
    if (!actual.has(value)) return false;
  }
  return true;
}

export function extractSqlStringLiterals(sql) {
  const text = String(sql || '');
  const values = [];
  const pattern = /'((?:[^']|'')*)'/g;
  let match;
  while ((match = pattern.exec(text))) {
    values.push(match[1].replace(/''/g, "'"));
  }
  return values;
}

export function arraysEqual(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  return actual.every((value, index) => value === expected[index]);
}

export function indexDescFromOption(indoption) {
  if (indoption == null || indoption === '') return null;
  const numeric = Number(indoption);
  if (!Number.isFinite(numeric)) return null;
  return (numeric & 1) === 1;
}

export function verifyColumnRows(columnRows) {
  const rows = Array.isArray(columnRows) ? columnRows : [];
  const byName = new Map();
  for (const row of rows) {
    const name = String(row.column_name || '');
    if (!name) return false;
    if (byName.has(name)) return false;
    byName.set(name, row);
  }
  if (byName.size !== EXPECTED_COLUMN_NAMES.length) return false;
  for (const name of EXPECTED_COLUMN_NAMES) {
    if (!byName.has(name)) return false;
  }
  for (const name of byName.keys()) {
    if (!EXPECTED_COLUMN_NAMES.includes(name)) return false;
  }

  const id = byName.get('id');
  if (
    !isBigintType(id) ||
    !isNotNull(id) ||
    !isNextvalDefault(id.column_default) ||
    !catalogFlag(id.owned_sequence)
  ) {
    return false;
  }

  const category = byName.get('category');
  if (!isTextType(category) || !isNotNull(category) || !hasNoDefault(category.column_default)) {
    return false;
  }

  const memberKey = byName.get('member_key');
  if (!isTextType(memberKey) || !isNotNull(memberKey) || !hasNoDefault(memberKey.column_default)) {
    return false;
  }

  const productIds = byName.get('product_ids');
  if (
    !isInt4ArrayType(productIds) ||
    !isNotNull(productIds) ||
    !hasNoDefault(productIds.column_default)
  ) {
    return false;
  }

  const decision = byName.get('decision');
  if (!isTextType(decision) || !isNotNull(decision) || !hasNoDefault(decision.column_default)) {
    return false;
  }

  for (const name of ['notes', 'match_key', 'group_id', 'reviewed_by']) {
    const row = byName.get(name);
    if (!isTextType(row) || !isNullable(row) || !hasNoDefault(row.column_default)) return false;
  }

  for (const name of ['reviewed_at', 'created_at', 'updated_at']) {
    const row = byName.get(name);
    if (!isTimestamptzType(row) || !isNotNull(row) || !isNowDefault(row.column_default)) return false;
  }

  return true;
}

export function verifyPrimaryKeyColumns(columnNames) {
  return arraysEqual(columnNames, ['id']);
}

export function verifyUniqueConstraint(conname, contype, columnNames) {
  return (
    String(conname) === 'duplicate_review_decisions_member_uniq' &&
    String(contype) === 'u' &&
    arraysEqual(columnNames, ['category', 'member_key'])
  );
}

function enumCheckSkeleton(def, columnName) {
  const skeleton = compactSql(String(def || '').replace(/'((?:[^']|'')*)'/g, '#'))
    .replace(/"/g, '');
  const anyArray = new RegExp(
    `^check\\(+${columnName}=any\\(array\\[(?:#(?:::text)?,)*#(?:::text)?\\]\\)+$`
  );
  const inList = new RegExp(`^check\\(+${columnName}in\\((?:#,)*#\\)+$`);
  return anyArray.test(skeleton) || inList.test(skeleton);
}

function verifyExactEnumCheck(def, columnNames, columnName, expectedValues) {
  if (!arraysEqual(columnNames, [columnName])) return false;
  const literals = extractSqlStringLiterals(def);
  const actual = new Set(literals);
  const expected = new Set(expectedValues);
  if (literals.length !== expectedValues.length || !setsEqual(actual, expected)) {
    return false;
  }
  return enumCheckSkeleton(def, columnName);
}

export function verifyCategoryCheck(def, columnNames) {
  return verifyExactEnumCheck(def, columnNames, 'category', EXPECTED_CATEGORY_VALUES);
}

export function verifyDecisionCheck(def, columnNames) {
  return verifyExactEnumCheck(def, columnNames, 'decision', EXPECTED_DECISION_VALUES);
}

export function verifyIdsNonemptyCheck(conname, def, columnNames) {
  if (String(conname) !== 'duplicate_review_decisions_ids_nonempty') return false;
  if (!arraysEqual(columnNames, ['product_ids'])) return false;
  const compact = compactSql(def).replace(/"/g, '');
  return /^check\(+cardinality\(product_ids\)>=1\)+$/.test(compact);
}

function isUsableBtreeIndex(idx, tableOid, columnName, expectDesc) {
  if (!idx) return false;
  if (!oidEqual(idx.tableOid, tableOid)) return false;
  if (String(idx.amname) !== 'btree') return false;
  if (!catalogFlag(idx.valid) || !catalogFlag(idx.ready) || !catalogFlag(idx.live)) return false;
  if (Number(idx.indnkeyatts) !== 1 || Number(idx.indnatts) !== 1) return false;
  if (idx.partial || idx.hasExpression) return false;
  if (!Array.isArray(idx.columns) || idx.columns.length !== 1) return false;
  if (idx.columns[0].name !== columnName) return false;
  if (idx.columns[0].desc !== expectDesc) return false;
  return true;
}

export function verifyRequiredIndexes(indexRows, tableOid) {
  const byName = new Map();
  for (const row of Array.isArray(indexRows) ? indexRows : []) {
    const name = String(row.name || '');
    if (!name) return false;
    byName.set(name, row);
  }

  const decisionIdx = byName.get('duplicate_review_decisions_decision_idx');
  const reviewedIdx = byName.get('duplicate_review_decisions_reviewed_at_idx');
  return (
    isUsableBtreeIndex(decisionIdx, tableOid, 'decision', false) &&
    isUsableBtreeIndex(reviewedIdx, tableOid, 'reviewed_at', true)
  );
}

export function verifyCatalog({ table, columns, constraints, indexes }) {
  if (!table || String(table.relkind) !== 'r' || table.oid == null || table.oid === '') {
    return false;
  }
  if (!verifyColumnRows(columns)) return false;

  const pk = (constraints || []).find((row) => String(row.contype) === 'p');
  if (!pk || !verifyPrimaryKeyColumns(pk.columns)) return false;

  const unique = (constraints || []).find(
    (row) => String(row.conname) === 'duplicate_review_decisions_member_uniq'
  );
  if (!unique || !verifyUniqueConstraint(unique.conname, unique.contype, unique.columns)) {
    return false;
  }

  const checks = (constraints || []).filter((row) => String(row.contype) === 'c');
  const categoryOk = checks.some((row) => verifyCategoryCheck(row.def, row.columns));
  const decisionOk = checks.some((row) => verifyDecisionCheck(row.def, row.columns));
  const idsOk = checks.some((row) =>
    verifyIdsNonemptyCheck(row.conname, row.def, row.columns)
  );
  if (!categoryOk || !decisionOk || !idsOk) return false;

  return verifyRequiredIndexes(indexes, table.oid);
}

function groupConstraintColumns(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const name = String(row.conname);
    if (!grouped.has(name)) {
      grouped.set(name, {
        conname: name,
        contype: String(row.contype),
        def: String(row.def || ''),
        columns: [],
      });
    }
    if (row.attname != null && String(row.attname) !== '') {
      grouped.get(name).columns.push(String(row.attname));
    }
  }
  return [...grouped.values()];
}

function groupIndexRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const name = String(row.index_name);
    if (!grouped.has(name)) {
      grouped.set(name, {
        name,
        tableOid: row.indrelid,
        amname: String(row.amname || ''),
        valid: catalogFlag(row.indisvalid),
        ready: catalogFlag(row.indisready),
        live: catalogFlag(row.indislive),
        indnkeyatts: Number(row.indnkeyatts),
        indnatts: Number(row.indnatts),
        partial: catalogFlag(row.is_partial),
        hasExpression: catalogFlag(row.has_expression),
        columns: [],
      });
    }
    const entry = grouped.get(name);
    if (catalogFlag(row.has_expression) || Number(row.attnum) === 0 || row.column_name == null) {
      entry.hasExpression = true;
    }
    if (row.column_name != null && Number(row.attnum) !== 0) {
      entry.columns.push({
        name: String(row.column_name),
        desc: indexDescFromOption(row.indoption),
      });
    }
  }
  return [...grouped.values()];
}

async function resolvePublicTable(client) {
  const { rows } = await client.query(
    `
    SELECT c.oid, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relname = $2
    `,
    [TABLE_SCHEMA, TABLE]
  );
  if (rows.length !== 1) return null;
  return { oid: rows[0].oid, relkind: String(rows[0].relkind) };
}

async function loadCatalog(client, table) {
  const { rows: columns } = await client.query(
    `
    SELECT
      a.attname AS column_name,
      CASE t.typname
        WHEN 'int8' THEN 'bigint'
        WHEN '_int4' THEN 'ARRAY'
        WHEN 'timestamptz' THEN 'timestamp with time zone'
        WHEN 'text' THEN 'text'
        ELSE pg_catalog.format_type(a.atttypid, a.atttypmod)
      END AS data_type,
      t.typname AS udt_name,
      CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
      pg_get_expr(ad.adbin, ad.adrelid) AS column_default
    FROM pg_attribute a
    JOIN pg_type t ON t.oid = a.atttypid
    LEFT JOIN pg_attrdef ad
      ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE a.attrelid = $1
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
    `,
    [table.oid]
  );

  const { rows: ownedRows } = await client.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_attrdef ad
        ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      JOIN pg_depend d
        ON d.refobjid = a.attrelid
       AND d.refobjsubid = a.attnum
       AND d.classid = 'pg_class'::regclass
       AND d.refclassid = 'pg_class'::regclass
       AND d.deptype IN ('a', 'i')
      JOIN pg_class seq
        ON seq.oid = d.objid AND seq.relkind = 'S'
      WHERE a.attrelid = $1
        AND a.attname = 'id'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND a.atttypid = 'int8'::regtype
        AND pg_get_expr(ad.adbin, ad.adrelid) ~* 'nextval\\s*\\('
        AND to_regclass(pg_get_serial_sequence($2, 'id')) = seq.oid
        AND to_regclass(
          (regexp_match(
            pg_get_expr(ad.adbin, ad.adrelid),
            $re$nextval\\s*\\(\\s*'([^']+)'$re$
          ))[1]
        ) = seq.oid
    ) AS owned_sequence_ok
    `,
    [table.oid, `${TABLE_SCHEMA}.${TABLE}`]
  );

  const ownedSequence = catalogFlag(ownedRows[0] && ownedRows[0].owned_sequence_ok);
  const columnsWithOwnership = columns.map((row) =>
    String(row.column_name) === 'id' ? { ...row, owned_sequence: ownedSequence } : row
  );

  const { rows: constraintRows } = await client.query(
    `
    SELECT
      c.conname,
      c.contype,
      pg_get_constraintdef(c.oid) AS def,
      a.attname
    FROM pg_constraint c
    LEFT JOIN LATERAL unnest(c.conkey)
      WITH ORDINALITY AS k(attnum, ord) ON true
    LEFT JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.conrelid = $1
    ORDER BY c.conname, k.ord
    `,
    [table.oid]
  );

  const { rows: indexRows } = await client.query(
    `
    SELECT
      ic.relname AS index_name,
      x.indrelid,
      am.amname,
      x.indisvalid,
      x.indisready,
      x.indislive,
      x.indnkeyatts,
      x.indnatts,
      x.indpred IS NOT NULL AS is_partial,
      x.indexprs IS NOT NULL AS has_expression,
      k.attnum,
      k.indoption,
      a.attname AS column_name
    FROM pg_index x
    JOIN pg_class ic ON ic.oid = x.indexrelid
    JOIN pg_am am ON am.oid = ic.relam
    LEFT JOIN LATERAL unnest(x.indkey::int2[], x.indoption::int2[])
      WITH ORDINALITY AS k(attnum, indoption, ord) ON true
    LEFT JOIN pg_attribute a
      ON a.attrelid = x.indrelid AND a.attnum = k.attnum
    WHERE x.indrelid = $1
    ORDER BY ic.relname, k.ord
    `,
    [table.oid]
  );

  return {
    table,
    columns: columnsWithOwnership,
    constraints: groupConstraintColumns(constraintRows),
    indexes: groupIndexRows(indexRows),
  };
}

async function verifyTable(client, table) {
  const catalog = await loadCatalog(client, table);
  return verifyCatalog(catalog);
}

async function main() {
  await import('dotenv/config');

  const nodeEnv = String(process.env.NODE_ENV || '').trim();
  if (nodeEnv !== 'development' && nodeEnv !== 'production') {
    fail('Refusing to migrate: NODE_ENV must be exactly "development" or "production".');
    return;
  }

  const confirmation = CONFIRMATIONS[nodeEnv];
  if (process.env.ALLOW_DUPLICATE_REVIEW_MIGRATION !== confirmation) {
    fail(
      `Refusing to migrate: ALLOW_DUPLICATE_REVIEW_MIGRATION must be exactly the ${nodeEnv} confirmation value.`
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

    let table = await resolvePublicTable(client);
    const tableExists = Boolean(table);

    if (!table) {
      await client.query(CREATE_TABLE_SQL);
      await client.query(CREATE_DECISION_INDEX_SQL);
      await client.query(CREATE_REVIEWED_AT_INDEX_SQL);
      table = await resolvePublicTable(client);
    }

    if (!table || String(table.relkind) !== 'r' || table.oid == null) {
      fail(
        'Duplicate review decisions table exists but is incomplete or incompatible. No automatic repair was attempted.'
      );
      const kindErr = new Error('VERIFY_FAILED');
      kindErr.name = 'VerifyFailed';
      kindErr.code = 'VERIFY_FAILED';
      throw kindErr;
    }

    const verified = await verifyTable(client, table);
    if (!verified) {
      fail(
        'Duplicate review decisions table exists but is incomplete or incompatible. No automatic repair was attempted.'
      );
      const verifyErr = new Error('VERIFY_FAILED');
      verifyErr.name = 'VerifyFailed';
      verifyErr.code = 'VERIFY_FAILED';
      throw verifyErr;
    }

    await client.query('COMMIT');
    began = false;

    console.log(
      tableExists
        ? 'duplicate_review_decisions already present and verified. No data was changed.'
        : 'duplicate_review_decisions created and verified. No business data was changed.'
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
      fail('Duplicate review decisions migration failed. No connection details are logged.', err);
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
