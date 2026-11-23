import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AMBIGUOUS_S_IDENTITY_ERROR,
  CANONICAL_CODE_SQL,
  CANONICAL_NOTES_SQL,
  CREATE_PRODUCTS_CODE_NON_S_UQ_SQL,
  CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL,
  IDENTITY_EDGE_CHARS,
  IDENTITY_EDGE_WHITESPACE_SQL,
  INVALID_NOTES_ERROR,
  LOCK_PRODUCTS_SQL,
  MIGRATE_CREATE_PRODUCTS_CODE_NON_S_UQ_SQL,
  MIGRATE_CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL,
  MIGRATE_DROP_PRODUCTS_CODE_UQ_SQL,
  MIXED_CODE_INDEX_INIT_ERROR,
  NON_S_CODE_INDEX_PREDICATE_SQL,
  OLD_CODE_INDEX_PREDICATE_SQL,
  PART_NUMBER_IN_USE_ERROR,
  PART_NUMBER_REQUIRED_ERROR,
  PRODUCTS_CODE_NON_S_UQ,
  PRODUCTS_CODE_UQ,
  PRODUCTS_S_CODE_NOTES_UQ,
  RETIRED_CODE_INDEX_INIT_ERROR,
  S_CODE_NOTES_INDEX_PREDICATE_SQL,
  S_IDENTITY_CONFLICT_ERROR,
  SKU_PREFIX_SQL,
  canonicalNotesIdentity,
  canonicalPartNumber,
  filterCategorySIdentityMatches,
  nonSStoredCodesConflict,
  notesForStorage,
  planCategorySAddSmart,
  sIdentityKeysConflict,
  skuHasCategorySPrefix,
  sqlCanonicalNotes,
  sqlCanonicalPartNumber,
  sqlSkuPrefix,
  stripIdentityEdges,
  uniqueViolationError,
} from '../src/categorySIdentity.js';
import {
  INDEX_STATE,
  catalogExprsEqual,
  classifyMigrationProductsCodeIndexState,
  classifyProductsCodeIndexState,
  groupCatalogIndexRows,
  isExactNonSCodeIndex,
  isExactOldCodeIndex,
  isExactSCodeNotesIndex,
  planInitDbProductsCodeIndexes,
} from '../src/productsCodeIndexState.js';
import {
  CONFIRMATIONS,
  migrationContainsForbiddenProductWrites,
} from './migrateProductsCodeIndexes.js';
import { retiredCAddSmartError } from '../src/retiredCategoryC.js';
import { CREATE_STATEMENTS } from '../src/schema.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const identitySrc = read('src/categorySIdentity.js');
const indexSrc = read('src/index.js');
const pgProductsSrc = read('src/pgProducts.js');
const schemaSrc = read('src/schema.js');
const dbSrc = read('src/db.js');
const catalogSrc = read('src/productsCodeIndexState.js');
const inventoryAddSrc = read('public/inventory-add.html');
const migrationSrc = read('scripts/migrateProductsCodeIndexes.js');
const envExampleSrc = read('.env.example');
const packageSrc = read('package.json');

const addSmartHandler = indexSrc
  .split("app.post('/api/products/add-smart'")[1]
  .split("app.get('/api/ebay-updates'")[0];
const assertSchemaFn = dbSrc
  .split('export async function assertSchema')[1]
  .split('export async function initDb')[0];
const initDbFn = dbSrc.split('export async function initDb')[1];
const findByCodeFn = pgProductsSrc
  .split('export async function findProductsByCodePG')[1]
  .split('export async function listDuplicateReviewProductsPG')[0];

const SPACE = ' ';
const TAB = '\t';
const LF = '\n';
const CR = '\r';
const FF = '\f';
const VT = '\v';
const PINNED_OID = '4242';
const OTHER_OID = '9999';
const CODE_ATTNUM = 3;

function catalogIndex({
  name,
  tableOid = PINNED_OID,
  amname = 'btree',
  unique = true,
  valid = true,
  ready = true,
  live = true,
  keys,
  predicate,
  indnkeyatts,
  indnatts,
}) {
  const keyList = keys.map((key, i) => ({
    position: key.position ?? i + 1,
    attnum: key.attnum,
    columnName: key.columnName ?? null,
    definition: key.definition,
  }));
  return {
    index_name: name,
    tableOid,
    amname,
    unique,
    valid,
    ready,
    live,
    indnkeyatts: indnkeyatts ?? keyList.length,
    indnatts: indnatts ?? keyList.length,
    predicate,
    keys: keyList,
  };
}

function rawRowsFromIndex(index) {
  return index.keys.map((key) => ({
    index_name: index.index_name,
    indrelid: index.tableOid,
    amname: index.amname,
    indisunique: index.unique,
    indisvalid: index.valid,
    indisready: index.ready,
    indislive: index.live,
    indnkeyatts: index.indnkeyatts,
    indnatts: index.indnatts,
    predicate: index.predicate,
    key_position: key.position,
    attnum: key.attnum,
    column_name: key.columnName,
    key_definition: key.definition,
  }));
}

const CODE_KEY = { attnum: 3, columnName: 'code', definition: 'code' };
const CANONICAL_CODE_KEY = {
  attnum: 0,
  columnName: null,
  definition: CANONICAL_CODE_SQL,
};
const CANONICAL_NOTES_KEY = {
  attnum: 0,
  columnName: null,
  definition: CANONICAL_NOTES_SQL,
};

const exactOld = catalogIndex({
  name: PRODUCTS_CODE_UQ,
  keys: [CODE_KEY],
  predicate: OLD_CODE_INDEX_PREDICATE_SQL,
});
const exactNonS = catalogIndex({
  name: PRODUCTS_CODE_NON_S_UQ,
  keys: [CODE_KEY],
  predicate: NON_S_CODE_INDEX_PREDICATE_SQL,
});
const exactS = catalogIndex({
  name: PRODUCTS_S_CODE_NOTES_UQ,
  keys: [CANONICAL_CODE_KEY, CANONICAL_NOTES_KEY],
  predicate: S_CODE_NOTES_INDEX_PREDICATE_SQL,
});

console.log('--- shared identity-edge whitespace ---');
assert.equal(IDENTITY_EDGE_CHARS, ' \t\n\r\f\v');
assert.equal(IDENTITY_EDGE_CHARS.length, 6);
assert.equal(IDENTITY_EDGE_CHARS.includes(SPACE), true);
assert.equal(IDENTITY_EDGE_CHARS.includes(TAB), true);
assert.equal(IDENTITY_EDGE_CHARS.includes(LF), true);
assert.equal(IDENTITY_EDGE_CHARS.includes(CR), true);
assert.equal(IDENTITY_EDGE_CHARS.includes(FF), true);
assert.equal(IDENTITY_EDGE_CHARS.includes(VT), true);
assert.equal(
  IDENTITY_EDGE_WHITESPACE_SQL,
  "(' ' || CHR(9) || CHR(10) || CHR(13) || CHR(12) || CHR(11))"
);
assert.equal(identitySrc.includes('.trim()'), false);
assert.equal(identitySrc.includes('prototype.trim'), false);

assert.equal(stripIdentityEdges(`  i7-8700  `), 'i7-8700');
assert.equal(stripIdentityEdges(`${TAB}i7-8700${TAB}`), 'i7-8700');
assert.equal(stripIdentityEdges(`${LF}i7-8700${LF}`), 'i7-8700');
assert.equal(stripIdentityEdges(`${CR}i7-8700${CR}`), 'i7-8700');
assert.equal(stripIdentityEdges(`${CR}${LF}i7-8700${CR}${LF}`), 'i7-8700');
assert.equal(stripIdentityEdges(`${FF}i7-8700${FF}`), 'i7-8700');
assert.equal(stripIdentityEdges(`${VT}i7-8700${VT}`), 'i7-8700');
assert.equal(
  stripIdentityEdges(`${SPACE}${TAB}${LF}${CR}${FF}${VT}i7-8700${VT}${FF}${CR}${LF}${TAB}${SPACE}`),
  'i7-8700'
);
assert.equal(stripIdentityEdges(`${TAB}${LF}${CR}${FF}${VT}${SPACE}`), '');
assert.equal(stripIdentityEdges('I7  8700'), 'I7  8700');
assert.equal(stripIdentityEdges('\u00A0i7-8700\u00A0'), '\u00A0i7-8700\u00A0');

console.log('--- canonical part number ---');
assert.equal(canonicalPartNumber('la-b843p'), 'LAB843P');
assert.equal(canonicalPartNumber('  LA B843P  '), 'LAB843P');
assert.equal(canonicalPartNumber('LAB843P'), 'LAB843P');
assert.equal(canonicalPartNumber('am001ef590'), 'AM001EF590');
assert.equal(canonicalPartNumber(null), null);
assert.equal(canonicalPartNumber(''), null);
assert.equal(canonicalPartNumber('---'), null);
assert.equal(canonicalPartNumber('  '), null);
assert.equal(canonicalPartNumber(`${TAB}la-b843p${LF}`), 'LAB843P');
assert.equal(canonicalPartNumber(`${CR}${LF}am001ef590${FF}`), 'AM001EF590');
assert.equal(canonicalPartNumber(`${VT}---${VT}`), null);

console.log('--- canonical notes ---');
assert.deepEqual(canonicalNotesIdentity(null), { ok: true, identity: '' });
assert.deepEqual(canonicalNotesIdentity(''), { ok: true, identity: '' });
assert.deepEqual(canonicalNotesIdentity('   '), { ok: true, identity: '' });
assert.deepEqual(canonicalNotesIdentity('i7-8700'), { ok: true, identity: 'I7-8700' });
assert.deepEqual(canonicalNotesIdentity('  i7-8700  '), { ok: true, identity: 'I7-8700' });
assert.deepEqual(canonicalNotesIdentity(`${TAB}i7-8700${TAB}`), { ok: true, identity: 'I7-8700' });
assert.deepEqual(canonicalNotesIdentity(`${LF}i7-8700${LF}`), { ok: true, identity: 'I7-8700' });
assert.deepEqual(canonicalNotesIdentity(`${CR}i7-8700${CR}`), { ok: true, identity: 'I7-8700' });
assert.deepEqual(canonicalNotesIdentity(`${CR}${LF}i7-8700${CR}${LF}`), {
  ok: true,
  identity: 'I7-8700',
});
assert.deepEqual(canonicalNotesIdentity(`${FF}i7-8700${FF}`), { ok: true, identity: 'I7-8700' });
assert.deepEqual(canonicalNotesIdentity(`${VT}i7-8700${VT}`), { ok: true, identity: 'I7-8700' });
assert.deepEqual(
  canonicalNotesIdentity(`${SPACE}${TAB}${LF}${CR}${FF}${VT}i7-8700${VT}${FF}${CR}${LF}${TAB}`),
  { ok: true, identity: 'I7-8700' }
);
assert.deepEqual(canonicalNotesIdentity(`${TAB}${LF}${CR}${FF}${VT}`), { ok: true, identity: '' });
assert.deepEqual(canonicalNotesIdentity('I7  8700'), { ok: true, identity: 'I7  8700' });
assert.equal(canonicalNotesIdentity('I7  8700').identity === canonicalNotesIdentity('I7 8700').identity, false);
assert.equal(canonicalNotesIdentity('\u00A0i7-8700').identity, '\u00A0I7-8700');
assert.equal(canonicalNotesIdentity(['i7']).ok, false);
assert.equal(canonicalNotesIdentity(['i7']).error, INVALID_NOTES_ERROR);
assert.equal(canonicalNotesIdentity(12).ok, false);
assert.equal(notesForStorage(null), null);
assert.equal(notesForStorage('  '), null);
assert.equal(notesForStorage(`${TAB}${LF}`), null);
assert.equal(notesForStorage('  i7-8700  '), 'i7-8700');
assert.equal(notesForStorage(`${TAB}i7-8700${LF}`), 'i7-8700');
assert.equal(notesForStorage('I7  8700'), 'I7  8700');

console.log('--- SKU prefix surrounding whitespace ---');
assert.equal(skuHasCategorySPrefix('S5035'), true);
assert.equal(skuHasCategorySPrefix(` ${TAB}s5035`), true);
assert.equal(skuHasCategorySPrefix(`${LF}s5035`), true);
assert.equal(skuHasCategorySPrefix(`${CR}s5035`), true);
assert.equal(skuHasCategorySPrefix(`${CR}${LF}s5035`), true);
assert.equal(skuHasCategorySPrefix(`${FF}s5035`), true);
assert.equal(skuHasCategorySPrefix(`${VT}s5035`), true);
assert.equal(skuHasCategorySPrefix(`${TAB}B0100`), false);
assert.equal(skuHasCategorySPrefix(`${VT}b0100`), false);
assert.equal(sqlSkuPrefix(`${TAB}s5035${LF}`), 'S');
assert.equal(sqlSkuPrefix(`${FF}b0100`), 'B');
assert.equal(sqlSkuPrefix(`${CR}${LF}${VT}`), '');

console.log('--- JS canonicalisation matches intended SQL expression semantics ---');
assert.equal(sqlCanonicalNotes(`${TAB}i7-8700${LF}`), canonicalNotesIdentity(`${TAB}i7-8700${LF}`).identity);
assert.equal(sqlCanonicalNotes('I7  8700'), 'I7  8700');
assert.equal(sqlCanonicalNotes(null), '');
assert.equal(sqlCanonicalPartNumber('  la-b843p  '), 'LAB843P');
assert.equal(sqlCanonicalPartNumber(`${VT}la b843p${FF}`), canonicalPartNumber(`${VT}la b843p${FF}`));
assert.equal(CANONICAL_CODE_SQL.includes(IDENTITY_EDGE_WHITESPACE_SQL), true);
assert.equal(CANONICAL_NOTES_SQL.includes(IDENTITY_EDGE_WHITESPACE_SQL), true);
assert.equal(SKU_PREFIX_SQL.includes(IDENTITY_EDGE_WHITESPACE_SQL), true);
assert.equal(
  CANONICAL_CODE_SQL,
  `regexp_replace(UPPER(BTRIM(code, ${IDENTITY_EDGE_WHITESPACE_SQL})), '[^A-Z0-9]', '', 'g')`
);
assert.equal(
  CANONICAL_NOTES_SQL,
  `UPPER(BTRIM(COALESCE(notes, ''), ${IDENTITY_EDGE_WHITESPACE_SQL}))`
);
assert.equal(
  SKU_PREFIX_SQL,
  `LEFT(UPPER(BTRIM(COALESCE(sku, ''), ${IDENTITY_EDGE_WHITESPACE_SQL})), 1)`
);
assert.equal(CREATE_PRODUCTS_CODE_NON_S_UQ_SQL.includes(NON_S_CODE_INDEX_PREDICATE_SQL), true);
assert.equal(CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL.includes(CANONICAL_CODE_SQL), true);
assert.equal(CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL.includes(CANONICAL_NOTES_SQL), true);
assert.equal(CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL.includes(S_CODE_NOTES_INDEX_PREDICATE_SQL), true);
assert.equal(MIGRATE_CREATE_PRODUCTS_CODE_NON_S_UQ_SQL.includes(NON_S_CODE_INDEX_PREDICATE_SQL), true);
assert.equal(MIGRATE_CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL.includes(CANONICAL_CODE_SQL), true);
assert.equal(MIGRATE_CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL.includes(CANONICAL_NOTES_SQL), true);
assert.equal(MIGRATE_CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL.includes(S_CODE_NOTES_INDEX_PREDICATE_SQL), true);
assert.equal(schemaSrc.includes(CANONICAL_NOTES_SQL) || CREATE_STATEMENTS.includes(CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL), true);
assert.equal(CREATE_STATEMENTS.includes(CREATE_PRODUCTS_CODE_NON_S_UQ_SQL), true);
assert.equal(CREATE_STATEMENTS.includes(CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL), true);
assert.equal(dbSrc.includes('CREATE_PRODUCTS_CODE_NON_S_UQ_SQL'), true);
assert.equal(dbSrc.includes('CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL'), true);
assert.equal(migrationSrc.includes('MIGRATE_CREATE_PRODUCTS_CODE_NON_S_UQ_SQL'), true);
assert.equal(migrationSrc.includes('MIGRATE_CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL'), true);

console.log('--- S identity planning ---');
const s5035 = {
  id: 10,
  sku: 'S5035',
  code: 'AM001EF590',
  name: 'Motherboard',
  notes: 'i7-8700',
  quantity: 2,
  on_ebay: 0,
};
const sNameOnly = {
  id: 11,
  sku: 'S1000',
  code: 'OTHER',
  name: 'AM001EF590',
  notes: 'i7-8700',
  quantity: 1,
};
const bSameCode = {
  id: 12,
  sku: 'B0100',
  code: 'AM001EF590',
  notes: 'i7-8700',
  quantity: 4,
};
const sBlank = {
  id: 13,
  sku: 'S2000',
  code: 'AM001EF590',
  notes: null,
  quantity: 1,
};
const sDup = { ...s5035, id: 14, sku: 'S5036' };

const sameNotes = planCategorySAddSmart({
  prefix: 'S',
  code: 'am001ef590',
  notes: '  I7-8700  ',
  matches: [s5035, sNameOnly, bSameCode],
});
assert.equal(sameNotes.kind, 'increment');
assert.equal(sameNotes.product.id, 10);

const tabNotes = planCategorySAddSmart({
  prefix: 'S',
  code: `${TAB}am001ef590`,
  notes: `${TAB}I7-8700${LF}`,
  matches: [s5035],
});
assert.equal(tabNotes.kind, 'increment');
assert.equal(tabNotes.product.id, 10);

const differentCpu = planCategorySAddSmart({
  prefix: 'S',
  code: 'AM001EF590',
  notes: 'i5-8500',
  matches: [s5035, bSameCode],
});
assert.equal(differentCpu.kind, 'create');
assert.equal(differentCpu.notes, 'i5-8500');

const blankVsPopulated = planCategorySAddSmart({
  prefix: 'S',
  code: 'AM001EF590',
  notes: 'i7-8700',
  matches: [sBlank],
});
assert.equal(blankVsPopulated.kind, 'create');

const populatedVsBlank = planCategorySAddSmart({
  prefix: 'S',
  code: 'AM001EF590',
  notes: null,
  matches: [s5035],
});
assert.equal(populatedVsBlank.kind, 'create');

const bothBlank = planCategorySAddSmart({
  prefix: 'S',
  code: 'AM001EF590',
  notes: '   ',
  matches: [sBlank],
});
assert.equal(bothBlank.kind, 'increment');
assert.equal(bothBlank.product.id, 13);

const nameOnly = planCategorySAddSmart({
  prefix: 'S',
  code: 'AM001EF590',
  notes: 'i7-8700',
  matches: [sNameOnly],
});
assert.equal(nameOnly.kind, 'create', 'name-only lookup match is not an S identity');

const nonSIgnored = planCategorySAddSmart({
  prefix: 'S',
  code: 'AM001EF590',
  notes: 'i7-8700',
  matches: [bSameCode],
});
assert.equal(nonSIgnored.kind, 'create', 'non-S same-code row ignored for S selection');

const ambiguous = planCategorySAddSmart({
  prefix: 'S',
  code: 'AM001EF590',
  notes: 'i7-8700',
  matches: [s5035, sDup],
});
assert.equal(ambiguous.kind, 'ambiguous');
assert.equal(ambiguous.error, AMBIGUOUS_S_IDENTITY_ERROR);

const invalidNotes = planCategorySAddSmart({
  prefix: 'S',
  code: 'AM001EF590',
  notes: { cpu: 'i7' },
  matches: [s5035],
});
assert.equal(invalidNotes.kind, 'invalid_notes');
assert.equal(invalidNotes.error, INVALID_NOTES_ERROR);

const invalidCode = planCategorySAddSmart({
  prefix: 'S',
  code: '---',
  notes: 'i7',
  matches: [],
});
assert.equal(invalidCode.kind, 'invalid_code');
assert.equal(invalidCode.error, PART_NUMBER_REQUIRED_ERROR);

assert.equal(
  planCategorySAddSmart({ prefix: 'A', code: 'AM001EF590', notes: 'i7', matches: [s5035] }).kind,
  'not_s'
);
assert.equal(
  planCategorySAddSmart({ prefix: 'E', code: 'AM001EF590', notes: null, matches: [] }).kind,
  'not_s'
);

const selected = filterCategorySIdentityMatches(
  [s5035, sNameOnly, bSameCode],
  canonicalPartNumber('AM-001-EF590'),
  'I7-8700'
);
assert.deepEqual(selected.map((row) => row.id), [10]);

assert.equal(skuHasCategorySPrefix(' s5035 '), true);
assert.equal(skuHasCategorySPrefix('B0100'), false);

console.log('--- index identity coexistence ---');
assert.equal(
  sIdentityKeysConflict(
    { sku: 'S0001', code: 'LA-B843P', notes: 'i7' },
    { sku: 'S0002', code: 'LAB843P', notes: ' I7 ' }
  ),
  true,
  'identical canonical S identity is forbidden'
);
assert.equal(
  sIdentityKeysConflict(
    { sku: 'S0001', code: 'AM001EF590', notes: 'i7-8700' },
    { sku: 'S0002', code: 'AM001EF590', notes: 'i5-8500' }
  ),
  false,
  'different-note S variants can coexist'
);
assert.equal(
  sIdentityKeysConflict(
    { sku: 'S0001', code: 'AM001EF590', notes: null },
    { sku: 'S0002', code: 'AM001EF590', notes: '' }
  ),
  true
);
assert.equal(
  nonSStoredCodesConflict(
    { sku: 'B0001', code: 'AM001EF590' },
    { sku: 'P0001', code: 'AM001EF590' }
  ),
  true,
  'non-S stored code uniqueness remains'
);
assert.equal(
  nonSStoredCodesConflict(
    { sku: 'S0001', code: 'AM001EF590' },
    { sku: 'B0001', code: 'AM001EF590' }
  ),
  false
);
assert.equal(uniqueViolationError(PRODUCTS_CODE_UQ), PART_NUMBER_IN_USE_ERROR);
assert.equal(uniqueViolationError(PRODUCTS_CODE_NON_S_UQ), PART_NUMBER_IN_USE_ERROR);
assert.equal(uniqueViolationError(PRODUCTS_S_CODE_NOTES_UQ), S_IDENTITY_CONFLICT_ERROR);
assert.equal(uniqueViolationError('products_sku_key'), null);

console.log('--- Category E and C unchanged ---');
assert.equal(retiredCAddSmartError('C'), 'Category C is retired');
assert.equal(retiredCAddSmartError('E'), null);
assert.match(addSmartHandler, /const isUniqueItem = prefix === 'C' \|\| prefix === 'E'/);
assert.match(addSmartHandler, /if \(!isUniqueItem\) \{/);
assert.ok(
  addSmartHandler.indexOf('retiredCAddSmartError') < addSmartHandler.indexOf('findProductsByCodePG')
);
assert.ok(addSmartHandler.indexOf("prefix.startsWith('C')") < addSmartHandler.indexOf('findProductsByCodePG'));
assert.match(addSmartHandler, /prefix === 'S'/);
assert.match(addSmartHandler, /planCategorySAddSmart/);

console.log('--- add-smart source contracts ---');
assert.ok(
  addSmartHandler.indexOf('canonicalNotesIdentity') < addSmartHandler.indexOf('findProductsByCodePG'),
  'Category S Notes validation occurs before the lookup'
);
assert.ok(
  addSmartHandler.indexOf("prefix === 'S'") < addSmartHandler.indexOf('findProductsByCodePG')
);
assert.ok(
  addSmartHandler.indexOf('canonicalNotesIdentity') < addSmartHandler.indexOf('planCategorySAddSmart')
);
assert.ok(
  addSmartHandler.indexOf('planCategorySAddSmart') < addSmartHandler.indexOf('adjustQtyPG'),
  'no product write occurs before S identity resolution'
);
assert.ok(
  addSmartHandler.indexOf('planCategorySAddSmart') < addSmartHandler.indexOf('createProductPG')
);
assert.ok(
  addSmartHandler.indexOf('planCategorySAddSmart') < addSmartHandler.indexOf('getNextSkuForCategoryPG')
);
assert.match(addSmartHandler, /kind === 'ambiguous'/);
assert.equal(addSmartHandler.includes('candidates:'), true);
assert.ok(
  addSmartHandler.indexOf("prefix === 'S'") < addSmartHandler.indexOf('candidates:'),
  'S ambiguity returns before the non-S candidate picker'
);
assert.match(addSmartHandler, /kind === 'increment'/);
assert.match(addSmartHandler, /createNotes = plan\.notes/);
assert.match(addSmartHandler, /notes: createNotes/);
assert.match(addSmartHandler, /setEbayStatus\(existing\.id, 'ready_to_list'\)/);
assert.match(addSmartHandler, /logEbayUpdatePG/);
assert.match(addSmartHandler, /uniqueViolationError\(err\.constraint\)/);
assert.match(addSmartHandler, /Failed to add product/);
assert.equal(addSmartHandler.includes('error: err.message'), false);
assert.match(findByCodeFn, /regexp_replace\(upper\(coalesce\(name,''\)\)/);
assert.match(findByCodeFn, /regexp_replace\(upper\(coalesce\(code,''\)\)/);

console.log('--- schema and bootstrap ---');
assert.equal(schemaSrc.includes("'products_code_uq'"), false);
assert.equal(schemaSrc.includes('CREATE_PRODUCTS_CODE_NON_S_UQ_SQL'), true);
assert.equal(schemaSrc.includes('CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL'), true);
assert.equal(CREATE_STATEMENTS.includes(CREATE_PRODUCTS_CODE_NON_S_UQ_SQL), true);
assert.equal(CREATE_STATEMENTS.includes(CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL), true);
assert.equal(
  CREATE_STATEMENTS.some(
    (sql) => String(sql).includes(PRODUCTS_CODE_UQ) && !String(sql).includes(PRODUCTS_CODE_NON_S_UQ)
  ),
  false
);
assert.equal(CREATE_PRODUCTS_CODE_NON_S_UQ_SQL.includes(SKU_PREFIX_SQL), true);
assert.equal(CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL.includes(CANONICAL_CODE_SQL), true);
assert.equal(CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL.includes(CANONICAL_NOTES_SQL), true);
assert.equal(assertSchemaFn.includes(PRODUCTS_CODE_NON_S_UQ), false);
assert.equal(assertSchemaFn.includes(PRODUCTS_S_CODE_NOTES_UQ), false);
assert.equal(assertSchemaFn.includes('pg_index'), false);
assert.equal(initDbFn.includes('withTransaction'), true);
assert.equal(initDbFn.includes('inspectProductsCodeIndexes'), true);
assert.equal(initDbFn.includes('planInitDbProductsCodeIndexes'), true);
assert.equal(initDbFn.includes('CREATE_PRODUCTS_CODE_NON_S_UQ_SQL'), true);
assert.equal(initDbFn.includes('CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL'), true);
assert.ok(
  initDbFn.indexOf('planInitDbProductsCodeIndexes') <
    initDbFn.indexOf('CREATE_PRODUCTS_CODE_NON_S_UQ_SQL'),
  'initDb classifies index state before creating indexes'
);
assert.ok(
  initDbFn.indexOf("plan.action === 'noop'") < initDbFn.indexOf('CREATE_PRODUCTS_CODE_NON_S_UQ_SQL'),
  'exact NEW is a no-op before any index DDL'
);
assert.ok(
  initDbFn.indexOf('CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL') <
    initDbFn.indexOf('verified.state !== INDEX_STATE.NEW'),
  'EMPTY create verifies exact NEW afterwards'
);
assert.ok(
  initDbFn.indexOf('LOCK_PRODUCTS_SQL') < initDbFn.indexOf('inspectProductsCodeIndexes'),
  'initDb inspects while the table lock is held'
);
assert.equal(initDbFn.includes('DROP INDEX'), false);
assert.equal(initDbFn.includes('MIGRATE_'), false);
assert.equal(initDbFn.includes('CREATE UNIQUE INDEX IF NOT EXISTS'), false);
assert.equal(RETIRED_CODE_INDEX_INIT_ERROR, 'Retired products_code_uq is present. Run the manual products-code-index migration.');
assert.equal(
  MIXED_CODE_INDEX_INIT_ERROR,
  'products code indexes are in an unexpected state. No automatic repair was attempted.'
);
assert.equal(indexSrc.includes('assertSchema()'), true);
assert.equal(indexSrc.includes('migrateProductsCodeIndexes'), false);
assert.equal(indexSrc.includes('initDb('), false);

console.log('--- structural catalogue verification ---');
assert.equal(
  catalogExprsEqual(
    "(UPPER(BTRIM(COALESCE(notes, ''::text), (' '::text || chr(9) || chr(10) || chr(13) || chr(12) || chr(11)))))",
    CANONICAL_NOTES_SQL
  ),
  true
);
assert.equal(
  catalogExprsEqual(S_CODE_NOTES_INDEX_PREDICATE_SQL, `${S_CODE_NOTES_INDEX_PREDICATE_SQL} AND true`),
  false
);

assert.equal(isExactOldCodeIndex(exactOld, PINNED_OID, CODE_ATTNUM), true);
assert.equal(isExactNonSCodeIndex(exactNonS, PINNED_OID, CODE_ATTNUM), true);
assert.equal(isExactSCodeNotesIndex(exactS, PINNED_OID, CODE_ATTNUM), true);
assert.equal(classifyProductsCodeIndexState([exactOld], PINNED_OID, CODE_ATTNUM), INDEX_STATE.OLD);
assert.equal(classifyProductsCodeIndexState([exactNonS, exactS], PINNED_OID, CODE_ATTNUM), INDEX_STATE.NEW);

const groupedOld = groupCatalogIndexRows(rawRowsFromIndex(exactOld));
const groupedNew = groupCatalogIndexRows([
  ...rawRowsFromIndex(exactNonS),
  ...rawRowsFromIndex(exactS),
]);
assert.equal(classifyProductsCodeIndexState(groupedOld, PINNED_OID, CODE_ATTNUM), INDEX_STATE.OLD);
assert.equal(classifyProductsCodeIndexState(groupedNew, PINNED_OID, CODE_ATTNUM), INDEX_STATE.NEW);

const extraKeyOld = catalogIndex({
  name: PRODUCTS_CODE_UQ,
  keys: [CODE_KEY, { attnum: 4, columnName: 'sku', definition: 'sku' }],
  predicate: OLD_CODE_INDEX_PREDICATE_SQL,
});
assert.equal(isExactOldCodeIndex(extraKeyOld, PINNED_OID, CODE_ATTNUM), false);
assert.equal(classifyProductsCodeIndexState([extraKeyOld], PINNED_OID, CODE_ATTNUM), INDEX_STATE.MIXED);

const includeOld = catalogIndex({
  name: PRODUCTS_CODE_UQ,
  keys: [CODE_KEY],
  predicate: OLD_CODE_INDEX_PREDICATE_SQL,
  indnkeyatts: 1,
  indnatts: 2,
});
assert.equal(isExactOldCodeIndex(includeOld, PINNED_OID, CODE_ATTNUM), false);
assert.equal(classifyProductsCodeIndexState([includeOld], PINNED_OID, CODE_ATTNUM), INDEX_STATE.MIXED);

const reversedS = catalogIndex({
  name: PRODUCTS_S_CODE_NOTES_UQ,
  keys: [CANONICAL_NOTES_KEY, CANONICAL_CODE_KEY],
  predicate: S_CODE_NOTES_INDEX_PREDICATE_SQL,
});
assert.equal(isExactSCodeNotesIndex(reversedS, PINNED_OID, CODE_ATTNUM), false);
assert.equal(
  classifyProductsCodeIndexState([exactNonS, reversedS], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED
);

const alteredNotes = catalogIndex({
  name: PRODUCTS_S_CODE_NOTES_UQ,
  keys: [
    CANONICAL_CODE_KEY,
    { attnum: 0, columnName: null, definition: "UPPER(BTRIM(COALESCE(notes, '')))" },
  ],
  predicate: S_CODE_NOTES_INDEX_PREDICATE_SQL,
});
assert.equal(isExactSCodeNotesIndex(alteredNotes, PINNED_OID, CODE_ATTNUM), false);
assert.equal(
  classifyProductsCodeIndexState([exactNonS, alteredNotes], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED
);

const alteredCharsetSql =
  "(' ' || CHR(9) || CHR(10) || CHR(13) || CHR(12) || CHR(160))";
const alteredCharset = catalogIndex({
  name: PRODUCTS_S_CODE_NOTES_UQ,
  keys: [
    CANONICAL_CODE_KEY,
    {
      attnum: 0,
      columnName: null,
      definition: `UPPER(BTRIM(COALESCE(notes, ''), ${alteredCharsetSql}))`,
    },
  ],
  predicate: S_CODE_NOTES_INDEX_PREDICATE_SQL,
});
assert.equal(isExactSCodeNotesIndex(alteredCharset, PINNED_OID, CODE_ATTNUM), false);
assert.equal(
  classifyProductsCodeIndexState([exactNonS, alteredCharset], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED
);

const alteredPrefix = catalogIndex({
  name: PRODUCTS_CODE_NON_S_UQ,
  keys: [CODE_KEY],
  predicate: "code IS NOT NULL AND LEFT(UPPER(BTRIM(COALESCE(sku, ''))), 1) <> 'S'",
});
assert.equal(isExactNonSCodeIndex(alteredPrefix, PINNED_OID, CODE_ATTNUM), false);
assert.equal(
  classifyProductsCodeIndexState([alteredPrefix, exactS], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED
);

const extraPredicate = catalogIndex({
  name: PRODUCTS_S_CODE_NOTES_UQ,
  keys: [CANONICAL_CODE_KEY, CANONICAL_NOTES_KEY],
  predicate: `${S_CODE_NOTES_INDEX_PREDICATE_SQL} AND quantity IS NOT NULL`,
});
assert.equal(isExactSCodeNotesIndex(extraPredicate, PINNED_OID, CODE_ATTNUM), false);
assert.equal(
  classifyProductsCodeIndexState([exactNonS, extraPredicate], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED
);

const wrongTable = catalogIndex({
  name: PRODUCTS_CODE_UQ,
  tableOid: OTHER_OID,
  keys: [CODE_KEY],
  predicate: OLD_CODE_INDEX_PREDICATE_SQL,
});
assert.equal(isExactOldCodeIndex(wrongTable, PINNED_OID, CODE_ATTNUM), false);
assert.equal(classifyProductsCodeIndexState([wrongTable], PINNED_OID, CODE_ATTNUM), INDEX_STATE.MIXED);

const hashOld = catalogIndex({
  name: PRODUCTS_CODE_UQ,
  amname: 'hash',
  keys: [CODE_KEY],
  predicate: OLD_CODE_INDEX_PREDICATE_SQL,
});
assert.equal(isExactOldCodeIndex(hashOld, PINNED_OID, CODE_ATTNUM), false);
assert.equal(classifyProductsCodeIndexState([hashOld], PINNED_OID, CODE_ATTNUM), INDEX_STATE.MIXED);

const notUniqueOld = catalogIndex({
  name: PRODUCTS_CODE_UQ,
  unique: false,
  keys: [CODE_KEY],
  predicate: OLD_CODE_INDEX_PREDICATE_SQL,
});
assert.equal(isExactOldCodeIndex(notUniqueOld, PINNED_OID, CODE_ATTNUM), false);
assert.equal(classifyProductsCodeIndexState([notUniqueOld], PINNED_OID, CODE_ATTNUM), INDEX_STATE.MIXED);

assert.equal(
  classifyProductsCodeIndexState(
    [catalogIndex({ ...exactOld, valid: false, name: PRODUCTS_CODE_UQ, keys: [CODE_KEY], predicate: OLD_CODE_INDEX_PREDICATE_SQL })],
    PINNED_OID,
    CODE_ATTNUM
  ),
  INDEX_STATE.MIXED
);
assert.equal(
  isExactOldCodeIndex(
    catalogIndex({
      name: PRODUCTS_CODE_UQ,
      valid: false,
      keys: [CODE_KEY],
      predicate: OLD_CODE_INDEX_PREDICATE_SQL,
    }),
    PINNED_OID,
    CODE_ATTNUM
  ),
  false
);
assert.equal(
  isExactOldCodeIndex(
    catalogIndex({
      name: PRODUCTS_CODE_UQ,
      ready: false,
      keys: [CODE_KEY],
      predicate: OLD_CODE_INDEX_PREDICATE_SQL,
    }),
    PINNED_OID,
    CODE_ATTNUM
  ),
  false
);
assert.equal(
  isExactOldCodeIndex(
    catalogIndex({
      name: PRODUCTS_CODE_UQ,
      live: false,
      keys: [CODE_KEY],
      predicate: OLD_CODE_INDEX_PREDICATE_SQL,
    }),
    PINNED_OID,
    CODE_ATTNUM
  ),
  false
);
assert.equal(
  classifyProductsCodeIndexState(
    [
      catalogIndex({
        name: PRODUCTS_CODE_UQ,
        ready: false,
        keys: [CODE_KEY],
        predicate: OLD_CODE_INDEX_PREDICATE_SQL,
      }),
    ],
    PINNED_OID,
    CODE_ATTNUM
  ),
  INDEX_STATE.MIXED
);
assert.equal(
  classifyProductsCodeIndexState(
    [
      catalogIndex({
        name: PRODUCTS_CODE_UQ,
        live: false,
        keys: [CODE_KEY],
        predicate: OLD_CODE_INDEX_PREDICATE_SQL,
      }),
    ],
    PINNED_OID,
    CODE_ATTNUM
  ),
  INDEX_STATE.MIXED
);

const sameNameIncompatible = catalogIndex({
  name: PRODUCTS_CODE_UQ,
  keys: [{ attnum: 0, columnName: null, definition: CANONICAL_CODE_SQL }],
  predicate: OLD_CODE_INDEX_PREDICATE_SQL,
});
assert.equal(isExactOldCodeIndex(sameNameIncompatible, PINNED_OID, CODE_ATTNUM), false);
assert.equal(
  classifyProductsCodeIndexState([sameNameIncompatible], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED
);

assert.equal(classifyProductsCodeIndexState([exactNonS], PINNED_OID, CODE_ATTNUM), INDEX_STATE.MIXED);
assert.equal(classifyProductsCodeIndexState([exactS], PINNED_OID, CODE_ATTNUM), INDEX_STATE.MIXED);
assert.equal(classifyProductsCodeIndexState([], PINNED_OID, CODE_ATTNUM), INDEX_STATE.EMPTY);
assert.equal(classifyProductsCodeIndexState([exactOld, exactNonS], PINNED_OID, CODE_ATTNUM), INDEX_STATE.MIXED);
assert.equal(classifyProductsCodeIndexState([exactOld, exactS], PINNED_OID, CODE_ATTNUM), INDEX_STATE.MIXED);
assert.equal(
  classifyProductsCodeIndexState([exactOld, exactNonS, exactS], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED,
  'OLD with new indexes present is MIXED'
);
assert.equal(
  classifyProductsCodeIndexState([exactNonS, exactS, exactOld], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED,
  'NEW with old index present is MIXED'
);
assert.equal(classifyProductsCodeIndexState([exactOld], null), INDEX_STATE.MIXED);
assert.equal(classifyProductsCodeIndexState([exactOld], PINNED_OID), INDEX_STATE.MIXED);
assert.equal(isExactOldCodeIndex(exactOld, PINNED_OID), false);

const wrongCodeAttnum = catalogIndex({
  name: PRODUCTS_CODE_UQ,
  keys: [{ attnum: 99, columnName: 'code', definition: 'code' }],
  predicate: OLD_CODE_INDEX_PREDICATE_SQL,
});
assert.equal(isExactOldCodeIndex(wrongCodeAttnum, PINNED_OID, CODE_ATTNUM), false);
assert.equal(
  classifyProductsCodeIndexState([wrongCodeAttnum], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED
);

console.log('--- initDb and migration classifiers ---');
assert.deepEqual(planInitDbProductsCodeIndexes(INDEX_STATE.EMPTY), { action: 'create' });
assert.deepEqual(planInitDbProductsCodeIndexes(INDEX_STATE.NEW), { action: 'noop' });
assert.deepEqual(planInitDbProductsCodeIndexes(INDEX_STATE.OLD), {
  action: 'reject',
  error: RETIRED_CODE_INDEX_INIT_ERROR,
});
assert.deepEqual(planInitDbProductsCodeIndexes(INDEX_STATE.MIXED), {
  action: 'reject',
  error: MIXED_CODE_INDEX_INIT_ERROR,
});
assert.equal(
  planInitDbProductsCodeIndexes(
    classifyProductsCodeIndexState([], PINNED_OID, CODE_ATTNUM)
  ).action,
  'create'
);
assert.equal(
  planInitDbProductsCodeIndexes(
    classifyProductsCodeIndexState([exactNonS, exactS], PINNED_OID, CODE_ATTNUM)
  ).action,
  'noop'
);
assert.equal(
  planInitDbProductsCodeIndexes(
    classifyProductsCodeIndexState([exactOld], PINNED_OID, CODE_ATTNUM)
  ).action,
  'reject'
);
assert.equal(
  planInitDbProductsCodeIndexes(
    classifyProductsCodeIndexState([exactNonS], PINNED_OID, CODE_ATTNUM)
  ).action,
  'reject'
);
assert.equal(
  planInitDbProductsCodeIndexes(
    classifyProductsCodeIndexState([exactS], PINNED_OID, CODE_ATTNUM)
  ).action,
  'reject'
);
assert.equal(
  planInitDbProductsCodeIndexes(
    classifyProductsCodeIndexState([exactOld, exactNonS, exactS], PINNED_OID, CODE_ATTNUM)
  ).action,
  'reject'
);
assert.equal(
  planInitDbProductsCodeIndexes(
    classifyProductsCodeIndexState([sameNameIncompatible], PINNED_OID, CODE_ATTNUM)
  ).action,
  'reject'
);
assert.equal(
  classifyMigrationProductsCodeIndexState([], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED,
  'migration classifier still rejects EMPTY'
);
assert.equal(
  classifyMigrationProductsCodeIndexState([exactOld], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.OLD
);
assert.equal(
  classifyMigrationProductsCodeIndexState([exactNonS, exactS], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.NEW
);
assert.equal(
  classifyMigrationProductsCodeIndexState([exactNonS], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED
);
assert.equal(
  classifyMigrationProductsCodeIndexState([exactOld, exactNonS, exactS], PINNED_OID, CODE_ATTNUM),
  INDEX_STATE.MIXED
);

console.log('--- migration source contracts ---');
assert.equal(CONFIRMATIONS.development !== CONFIRMATIONS.production, true);
assert.equal(
  CONFIRMATIONS.development,
  'YES_MIGRATE_PRODUCTS_CODE_INDEXES_IN_DEVELOPMENT'
);
assert.equal(
  CONFIRMATIONS.production,
  'YES_MIGRATE_PRODUCTS_CODE_INDEXES_IN_PRODUCTION'
);
assert.equal(migrationContainsForbiddenProductWrites(migrationSrc), false);
assert.equal(migrationContainsForbiddenProductWrites(identitySrc), false);
assert.equal(
  LOCK_PRODUCTS_SQL,
  'LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE'
);
assert.equal(MIGRATE_DROP_PRODUCTS_CODE_UQ_SQL, 'DROP INDEX public.products_code_uq');
assert.equal(migrationSrc.includes('compactIndexDef'), false);
assert.match(migrationSrc, /inspectProductsCodeIndexes/);
assert.match(migrationSrc, /classifyMigrationProductsCodeIndexState/);
assert.match(migrationSrc, /client\.query\(LOCK_PRODUCTS_SQL\)/);
assert.match(migrationSrc, /client\.query\(MIGRATE_DROP_PRODUCTS_CODE_UQ_SQL\)/);
assert.match(migrationSrc, /client\.query\(MIGRATE_CREATE_PRODUCTS_CODE_NON_S_UQ_SQL\)/);
assert.match(migrationSrc, /client\.query\(MIGRATE_CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL\)/);
assert.ok(
  migrationSrc.indexOf('verified.state !== INDEX_STATE.NEW') <
    migrationSrc.lastIndexOf("await client.query('COMMIT')"),
  'verification occurs before COMMIT'
);
const mainSrc = migrationSrc.split('async function main')[1];
assert.ok(
  mainSrc.indexOf("await client.query('BEGIN')") < mainSrc.indexOf('resolvePublicProducts')
);
assert.ok(
  mainSrc.indexOf('resolvePublicProducts') < mainSrc.indexOf('LOCK_PRODUCTS_SQL'),
  'products is resolved before the table lock'
);
assert.ok(
  mainSrc.indexOf('LOCK_PRODUCTS_SQL') < mainSrc.lastIndexOf('resolvePublicProducts'),
  'products is resolved again after the table lock'
);
assert.ok(
  mainSrc.indexOf('LOCK_PRODUCTS_SQL') < mainSrc.indexOf('inspectState'),
  'authoritative catalogue inspection happens after the lock'
);
assert.ok(
  mainSrc.indexOf('inspectState') < mainSrc.indexOf('INDEX_STATE.NEW'),
  'NEW-state classification happens after locked inspection'
);
const inspectSrc = migrationSrc.split('async function inspectState')[1].split('async function main')[0];
assert.match(inspectSrc, /inspectProductsCodeIndexes/);
assert.match(inspectSrc, /classifyMigrationProductsCodeIndexState/);
assert.match(catalogSrc, /a\.attname = 'code'/);
assert.match(catalogSrc, /pg_get_indexdef\(x\.indexrelid, k\.ord::integer, true\)/);
assert.match(catalogSrc, /pg_get_expr\(x\.indpred, x\.indrelid, true\)/);
assert.equal(catalogSrc.includes("dotenv/config"), false);
assert.equal(catalogSrc.includes('new Client'), false);
assert.equal(catalogSrc.includes('new Pool'), false);
assert.equal(catalogSrc.includes('process.env'), false);
assert.equal(catalogSrc.includes('async function main'), false);
assert.match(migrationSrc, /Existing product data is incompatible/);
assert.equal(migrationSrc.includes('err.message'), false);
assert.match(packageSrc, /db:migrate:products-code-indexes/);
assert.match(envExampleSrc, /ALLOW_PRODUCTS_CODE_INDEX_MIGRATION=YES_MIGRATE_PRODUCTS_CODE_INDEXES_IN_DEVELOPMENT/);
assert.match(envExampleSrc, /ALLOW_PRODUCTS_CODE_INDEX_MIGRATION=YES_MIGRATE_PRODUCTS_CODE_INDEXES_IN_PRODUCTION/);

console.log('--- frontend ---');
assert.match(
  inventoryAddSrc,
  /Motherboards with different processors must use different Notes and will receive separate SKUs\./
);
assert.match(inventoryAddSrc, /notesSHint/);
assert.match(inventoryAddSrc, /cat === 'S'/);
assert.match(inventoryAddSrc, /"\/api\/products\/add-smart"/);

console.log('category S identity tests passed');
