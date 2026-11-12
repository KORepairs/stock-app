import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTO_POSTAGE_STATUSES,
  POSTAGE_AUTOFILL_SQL_PREDICATE,
  autoPostageGroup,
  combinePostageFromUpdate,
  getPostagePrice,
  isAutoPostageStatus,
  isDbPostageUnassigned,
  isPostageAssigned,
  planEbayStatusPostage,
  postageTriggerMatches,
  resolvePostageAssignment,
  shouldApplyAutoPostageOnRow,
} from '../src/postageAutoAssignment.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const indexSrc = read('src/index.js');
const pgProductsSrc = read('src/pgProducts.js');
const helperSrc = read('src/postageAutoAssignment.js');
const productsList = read('public/products-list.html');
const importSrc = read('public/import.html');

const putHandler = indexSrc
  .split("app.put('/api/products/:id'")[1]
  .split("app.patch('/api/products/:id/ebay'")[0];
const ebayPatchHandler = indexSrc
  .split("app.patch('/api/products/:id/ebay'")[1]
  .split("app.patch('/api/products/:id/needs-pics'")[0];
const createHandler = indexSrc
  .split("app.post('/api/products',")[1]
  .split("app.post('/api/products/add-smart'")[0];
const addSmartHandler = indexSrc
  .split("app.post('/api/products/add-smart'")[1]
  .split("app.get('/api/ebay-updates'")[0];
const stockInHandler = indexSrc
  .split("app.post('/api/stock/in'")[1]
  .split("app.post('/api/stock/out'")[0];
const stockOutHandler = indexSrc
  .split("app.post('/api/stock/out'")[1]
  .split("app.post('/api/stock/take'")[0];
const stockTakeHandler = indexSrc
  .split("app.post('/api/stock/take'")[1]
  .split("app.post('/api/customers'")[0];
const relistHandler = indexSrc
  .split("app.put('/api/ebay-updates/:id/relist'")[1]
  .split("app.post(\"/api/barcode-queue\"")[0];
const needsPicsHandler = indexSrc
  .split("app.patch('/api/products/:id/needs-pics'")[1]
  .split("app.get('/api/stats/ebay'")[0];
const setEbayStatusFn = indexSrc
  .split('async function setEbayStatus')[1]
  .split('async function findProductByLooseCodePG')[0];

function resolveCase(overrides = {}) {
  return resolvePostageAssignment({
    sku: 'A0001',
    retail: 25,
    ebay_status: 'listed',
    postage_group: null,
    postage: 0,
    ...overrides,
  });
}

console.log('--- executable helper tests ---');

assert.equal(typeof getPostagePrice('battery'), 'number');
assert.equal(getPostagePrice('battery'), 3);
assert.equal(getPostagePrice('server'), 15);
assert.equal(getPostagePrice('small_parcel'), 4.65);
assert.equal(getPostagePrice('large_letter'), 1.84);
assert.equal(getPostagePrice('large_letter_tracked'), 3.8);
assert.equal(getPostagePrice('courier'), 8);
assert.equal(getPostagePrice('unknown'), 0);
assert.equal(getPostagePrice(null), 0);
assert.notEqual(typeof getPostagePrice('battery'), 'object');

assert.deepEqual(AUTO_POSTAGE_STATUSES.slice().sort(), ['listed', 'ready_to_list']);
assert.equal(isAutoPostageStatus('listed'), true);
assert.equal(isAutoPostageStatus('ready_to_list'), true);
assert.equal(isAutoPostageStatus('not_listed'), false);
assert.equal(isAutoPostageStatus('sold_on_ebay'), false);

assert.equal(autoPostageGroup('C0001'), 'battery', '1. legacy C → battery');
assert.equal(autoPostageGroup('c0001'), 'battery');
assert.equal(autoPostageGroup('E0001'), 'server');
assert.equal(autoPostageGroup('A0001'), 'small_parcel');
assert.equal(autoPostageGroup('B0001'), 'small_parcel');
assert.equal(autoPostageGroup('D0001'), 'small_parcel');
assert.equal(autoPostageGroup('F0001', 19.99), 'large_letter', '2. F below £20');
assert.equal(autoPostageGroup('F0001', 20), 'large_letter_tracked', '3. F at £20');
assert.equal(autoPostageGroup('F0001', 50), 'large_letter_tracked');
assert.equal(autoPostageGroup('S0001'), 'small_parcel');
assert.equal(autoPostageGroup('P0001'), 'small_parcel');
assert.equal(autoPostageGroup('R0001'), 'large_letter');
assert.equal(autoPostageGroup('G0001'), 'large_letter', '1. G → large_letter');
assert.equal(autoPostageGroup('H0001'), null, '12. unknown/unmapped prefix');
assert.equal(autoPostageGroup('Q0001'), null);
assert.equal(autoPostageGroup(''), null);

assert.equal(postageTriggerMatches({ retail: 0, ebay_status: 'listed' }), false, '4. retail 0');
assert.equal(postageTriggerMatches({ retail: null, ebay_status: 'listed' }), false, '4. retail null');
assert.equal(postageTriggerMatches({ retail: 'x', ebay_status: 'listed' }), false, '4. retail invalid');
assert.equal(postageTriggerMatches({ retail: 10, ebay_status: 'not_listed' }), false, '5. not_listed');
assert.equal(postageTriggerMatches({ retail: 10, ebay_status: 'sold_on_ebay' }), false, '6. sold_on_ebay');
assert.equal(postageTriggerMatches({ retail: 10, ebay_status: 'ready_to_list' }), true, '7. ready_to_list');
assert.equal(postageTriggerMatches({ retail: 10, ebay_status: 'listed' }), true, '8. listed');

assert.deepEqual(
  resolveCase({ ebay_status: 'not_listed' }),
  { postage_group: null, postage: 0, assigned: false, autoFilled: false },
  '5. not_listed does not assign'
);
assert.deepEqual(
  resolveCase({ ebay_status: 'sold_on_ebay' }),
  { postage_group: null, postage: 0, assigned: false, autoFilled: false },
  '6. sold_on_ebay does not assign'
);
assert.deepEqual(
  resolveCase({ ebay_status: 'ready_to_list', sku: 'A0001' }),
  { postage_group: 'small_parcel', postage: 4.65, assigned: true, autoFilled: true },
  '7. ready_to_list assigns'
);
assert.deepEqual(
  resolveCase({ ebay_status: 'listed', sku: 'A0001' }),
  { postage_group: 'small_parcel', postage: 4.65, assigned: true, autoFilled: true },
  '8. listed assigns'
);
assert.deepEqual(
  resolveCase({ retail: 0, ebay_status: 'listed' }),
  { postage_group: null, postage: 0, assigned: false, autoFilled: false },
  '4. retail 0 does not assign'
);

assert.deepEqual(
  resolveCase({ postage_group: 'courier', postage: 8 }),
  { postage_group: 'courier', postage: 8, assigned: true, autoFilled: false },
  '9/13. existing courier group preserved'
);
assert.deepEqual(
  resolveCase({ postage_group: 'battery', postage: 3, sku: 'C0001' }),
  { postage_group: 'battery', postage: 3, assigned: true, autoFilled: false },
  '14. battery manual/legacy group preserved'
);
assert.deepEqual(
  resolveCase({ postage_group: 'small_parcel', postage: 4.65, sku: 'B0001', retail: 99 }),
  { postage_group: 'small_parcel', postage: 4.65, assigned: true, autoFilled: false },
  '18. changing retail does not overwrite assigned postage'
);
assert.deepEqual(
  resolveCase({
    sku: 'E0001',
    postage_group: 'courier',
    postage: 8,
  }),
  { postage_group: 'courier', postage: 8, assigned: true, autoFilled: false },
  '19. changing SKU does not overwrite assigned postage'
);
assert.deepEqual(
  resolveCase({ postage_group: null, postage: 5.5 }),
  { postage_group: null, postage: 5.5, assigned: true, autoFilled: false },
  '10. positive postage with null group preserved'
);
assert.deepEqual(
  resolveCase({ postage_group: null, postage: 0, sku: 'A0001' }),
  { postage_group: 'small_parcel', postage: 4.65, assigned: true, autoFilled: true },
  '11. null group + zero postage auto-fills'
);
assert.deepEqual(
  resolveCase({ sku: 'H0001', postage_group: null, postage: 0 }),
  { postage_group: null, postage: 0, assigned: false, autoFilled: false },
  '12. unknown prefix stays unassigned'
);
assert.deepEqual(
  resolveCase({ sku: 'C0001', postage_group: null, postage: 0 }),
  { postage_group: 'battery', postage: 3, assigned: true, autoFilled: true },
  '1. unassigned eligible C auto-fills battery'
);
assert.deepEqual(
  resolveCase({ sku: 'G0001', postage_group: null, postage: 0 }),
  { postage_group: 'large_letter', postage: 1.84, assigned: true, autoFilled: true },
  '1. unassigned eligible G auto-fills large_letter'
);
assert.deepEqual(
  resolveCase({ sku: 'F0001', retail: 10, postage_group: null, postage: 0 }),
  { postage_group: 'large_letter', postage: 1.84, assigned: true, autoFilled: true }
);
assert.deepEqual(
  resolveCase({ sku: 'F0001', retail: 20, postage_group: null, postage: 0 }),
  { postage_group: 'large_letter_tracked', postage: 3.8, assigned: true, autoFilled: true }
);

assert.equal(isPostageAssigned(null, 0), false);
assert.equal(isPostageAssigned('', 0), false);
assert.equal(isPostageAssigned('courier', 0), true);
assert.equal(isPostageAssigned(null, 1), true);

const existingBattery = {
  postage_group: 'battery',
  postage: 3,
  ebay_status: 'listed',
  sku: 'C0001',
  retail: 12,
};

assert.deepEqual(
  combinePostageFromUpdate({
    existing: existingBattery,
    body: { postage: 0 },
  }),
  { postage_group: 'battery', postage: 3 },
  '15/17. omitted group + postage 0 preserves stored assignment'
);
assert.deepEqual(
  combinePostageFromUpdate({
    existing: existingBattery,
    body: { sku: 'C0001' },
  }),
  { postage_group: 'battery', postage: 3 },
  '16. omitted postage preserves stored value'
);
assert.deepEqual(
  combinePostageFromUpdate({
    existing: { postage_group: 'courier', postage: 8 },
    body: { postage: 0 },
  }),
  { postage_group: 'courier', postage: 8 },
  '17. CSV-style postage 0 with omitted group does not clear courier'
);
assert.deepEqual(
  combinePostageFromUpdate({
    existing: { postage_group: 'small_parcel', postage: 4.65 },
    body: { postage: 0 },
  }),
  { postage_group: 'small_parcel', postage: 4.65 },
  '17. CSV-style postage 0 does not clear an auto group'
);
assert.deepEqual(
  combinePostageFromUpdate({
    existing: existingBattery,
    body: { postage: 7.5 },
  }),
  { postage_group: 'battery', postage: 7.5 },
  'CSV positive postage remains manual and omitted group is kept'
);
assert.deepEqual(
  combinePostageFromUpdate({
    existing: { postage_group: null, postage: 0 },
    body: { postage_group: null, postage: 0 },
  }),
  { postage_group: null, postage: 0 },
  'frontend null group + 0 is unassigned, not a preserved override'
);

const csvUnassignedListed = resolvePostageAssignment({
  sku: 'A0001',
  retail: 30,
  ebay_status: 'listed',
  ...combinePostageFromUpdate({
    existing: { postage_group: null, postage: 0, ebay_status: 'listed' },
    body: { postage: 0, retail: 30 },
  }),
});
assert.deepEqual(
  csvUnassignedListed,
  { postage_group: 'small_parcel', postage: 4.65, assigned: true, autoFilled: true },
  'CSV unassigned eligible row can auto-fill'
);

const retailChangeAssigned = resolvePostageAssignment({
  sku: 'A0001',
  retail: 80,
  ebay_status: 'listed',
  ...combinePostageFromUpdate({
    existing: { postage_group: 'courier', postage: 8 },
    body: { postage_group: 'courier', postage: 8, retail: 80 },
  }),
});
assert.deepEqual(
  retailChangeAssigned,
  { postage_group: 'courier', postage: 8, assigned: true, autoFilled: false },
  '18. PUT retail change keeps assigned postage'
);

const skuChangeAssigned = resolvePostageAssignment({
  sku: 'E0001',
  retail: 40,
  ebay_status: 'listed',
  ...combinePostageFromUpdate({
    existing: { postage_group: 'courier', postage: 8, sku: 'A0001' },
    body: { sku: 'E0001', postage_group: 'courier', postage: 8 },
  }),
});
assert.deepEqual(
  skuChangeAssigned,
  { postage_group: 'courier', postage: 8, assigned: true, autoFilled: false },
  '19. PUT SKU change keeps assigned postage'
);

console.log('--- executable status-plan and SQL-guard tests ---');

const unassignedA = {
  sku: 'A0001',
  retail: 25,
  postage_group: null,
  postage: 0,
};
const listedPlan = planEbayStatusPostage(unassignedA, 'listed');
assert.deepEqual(listedPlan, {
  applyPostage: true,
  postage: 4.65,
  postage_group: 'small_parcel',
  snapshotSku: 'A0001',
  snapshotRetail: 25,
});
const readyPlan = planEbayStatusPostage(unassignedA, 'ready_to_list');
assert.equal(readyPlan.applyPostage, true);
assert.equal(readyPlan.postage_group, 'small_parcel');
assert.equal(
  planEbayStatusPostage(unassignedA, 'not_listed').applyPostage,
  false,
  'not_listed never writes postage'
);
assert.equal(
  planEbayStatusPostage(unassignedA, 'sold_on_ebay').applyPostage,
  false,
  'sold_on_ebay never writes postage'
);
assert.equal(
  planEbayStatusPostage(
    { ...unassignedA, postage_group: 'courier', postage: 8 },
    'listed'
  ).applyPostage,
  false,
  'manual courier preserved at plan time'
);
assert.equal(
  planEbayStatusPostage(
    { ...unassignedA, postage_group: null, postage: 7 },
    'ready_to_list'
  ).applyPostage,
  false,
  'positive manual number with null group preserved at plan time'
);

assert.equal(isDbPostageUnassigned(null, 0), true);
assert.equal(isDbPostageUnassigned('   ', 0), true, 'whitespace-only group counts as unassigned');
assert.equal(isDbPostageUnassigned(null, null), true);
assert.equal(isDbPostageUnassigned(null, -1), true, 'negative postage with blank group permits auto');
assert.equal(isDbPostageUnassigned('courier', 0), false, 'nonblank group blocks auto');
assert.equal(isDbPostageUnassigned(null, 8), false, 'positive postage blocks auto');

assert.equal(
  shouldApplyAutoPostageOnRow(unassignedA, listedPlan),
  true,
  'no concurrent change → candidate is applied'
);
assert.equal(
  shouldApplyAutoPostageOnRow(
    { ...unassignedA, postage_group: 'courier', postage: 8 },
    listedPlan
  ),
  false,
  'concurrent manual courier/£8 blocks auto'
);
assert.equal(
  shouldApplyAutoPostageOnRow(
    { ...unassignedA, postage_group: null, postage: 8 },
    listedPlan
  ),
  false,
  'concurrent positive numeric postage/no group blocks auto'
);
assert.equal(
  shouldApplyAutoPostageOnRow({ ...unassignedA, sku: 'B0001' }, listedPlan),
  false,
  'snapshot SKU mismatch blocks auto'
);
assert.equal(
  shouldApplyAutoPostageOnRow({ ...unassignedA, retail: 40 }, listedPlan),
  false,
  'snapshot retail mismatch blocks auto'
);
assert.equal(
  planEbayStatusPostage({ ...unassignedA, sku: 'B0001' }, 'listed').applyPostage,
  true
);
assert.equal(
  shouldApplyAutoPostageOnRow(unassignedA, {
    applyPostage: false,
    snapshotSku: 'A0001',
    snapshotRetail: 25,
  }),
  false,
  'status can still update when candidate is blocked (applyPostage false)'
);

function applyPlannedPostage(loadedRow, requestedStatus, rowAtUpdate = loadedRow) {
  const plan = planEbayStatusPostage(loadedRow, requestedStatus);
  const applied = shouldApplyAutoPostageOnRow(rowAtUpdate, plan);
  return {
    ebay_status: requestedStatus,
    postage: applied ? plan.postage : rowAtUpdate.postage,
    postage_group: applied ? plan.postage_group : rowAtUpdate.postage_group,
    applyPostage: plan.applyPostage,
    applied,
  };
}

const readyFill = applyPlannedPostage(unassignedA, 'ready_to_list');
assert.deepEqual(
  { ebay_status: readyFill.ebay_status, postage: readyFill.postage, postage_group: readyFill.postage_group, applied: readyFill.applied },
  { ebay_status: 'ready_to_list', postage: 4.65, postage_group: 'small_parcel', applied: true },
  'unassigned retail>0 ready_to_list auto-fills (stock-in/add-smart/stock-take/relist/PATCH)'
);
const listedFill = applyPlannedPostage(unassignedA, 'listed');
assert.deepEqual(
  { ebay_status: listedFill.ebay_status, postage: listedFill.postage, postage_group: listedFill.postage_group, applied: listedFill.applied },
  { ebay_status: 'listed', postage: 4.65, postage_group: 'small_parcel', applied: true },
  'unassigned retail>0 PATCH listed auto-fills'
);

const assignedCourier = { ...unassignedA, postage_group: 'courier', postage: 8 };
for (const status of ['ready_to_list', 'listed', 'not_listed', 'sold_on_ebay']) {
  const out = applyPlannedPostage(assignedCourier, status);
  assert.equal(out.applied, false, `${status} does not overwrite courier`);
  assert.equal(out.postage_group, 'courier');
  assert.equal(out.postage, 8);
  assert.equal(out.ebay_status, status);
}

const assignedAmount = { ...unassignedA, postage_group: null, postage: 7 };
for (const status of ['ready_to_list', 'listed']) {
  const out = applyPlannedPostage(assignedAmount, status);
  assert.equal(out.applied, false);
  assert.equal(out.postage, 7);
  assert.equal(out.postage_group, null);
}

const notListedOut = applyPlannedPostage(unassignedA, 'not_listed');
assert.equal(notListedOut.applyPostage, false);
assert.equal(notListedOut.applied, false);
assert.equal(notListedOut.postage, 0);
assert.equal(notListedOut.postage_group, null);
assert.equal(notListedOut.ebay_status, 'not_listed');

const soldOut = applyPlannedPostage(unassignedA, 'sold_on_ebay');
assert.equal(soldOut.applyPostage, false);
assert.equal(soldOut.applied, false);
assert.equal(soldOut.postage, 0);
assert.equal(soldOut.postage_group, null);

assert.equal(
  applyPlannedPostage({ ...unassignedA, postage: null }, 'listed').applied,
  true,
  'null postage with blank group permits auto'
);
assert.equal(
  applyPlannedPostage({ ...unassignedA, postage: -1 }, 'ready_to_list').applied,
  true,
  'negative postage with blank group permits auto'
);
assert.equal(
  applyPlannedPostage({ ...unassignedA, postage_group: '   ', postage: 0 }, 'listed').applied,
  true,
  'whitespace-only group counts as unassigned and permits auto'
);

const concurrentCourier = applyPlannedPostage(
  unassignedA,
  'ready_to_list',
  { ...unassignedA, postage_group: 'courier', postage: 8 }
);
assert.equal(concurrentCourier.ebay_status, 'ready_to_list', 'status still updates when auto-fill is blocked');
assert.equal(concurrentCourier.applied, false);
assert.equal(concurrentCourier.postage_group, 'courier');
assert.equal(concurrentCourier.postage, 8);

const concurrentAmount = applyPlannedPostage(
  unassignedA,
  'listed',
  { ...unassignedA, postage_group: null, postage: 8 }
);
assert.equal(concurrentAmount.ebay_status, 'listed');
assert.equal(concurrentAmount.applied, false);
assert.equal(concurrentAmount.postage, 8);
assert.equal(concurrentAmount.postage_group, null);

const concurrentSku = applyPlannedPostage(
  unassignedA,
  'ready_to_list',
  { ...unassignedA, sku: 'B0001' }
);
assert.equal(concurrentSku.ebay_status, 'ready_to_list');
assert.equal(concurrentSku.applied, false);
assert.equal(concurrentSku.postage, 0);
assert.equal(concurrentSku.postage_group, null);

const concurrentRetail = applyPlannedPostage(
  unassignedA,
  'listed',
  { ...unassignedA, retail: 40 }
);
assert.equal(concurrentRetail.ebay_status, 'listed');
assert.equal(concurrentRetail.applied, false);
assert.equal(concurrentRetail.postage, 0);

const noConcurrent = applyPlannedPostage(unassignedA, 'ready_to_list', { ...unassignedA });
assert.equal(noConcurrent.applied, true);
assert.equal(noConcurrent.postage_group, 'small_parcel');
assert.equal(noConcurrent.postage, 4.65);

console.log('--- static route/source assertions ---');

assert.match(putHandler, /combinePostageFromUpdate/);
assert.match(putHandler, /resolvePostageAssignment/);
assert.ok(
  putHandler.indexOf('combinePostageFromUpdate') < putHandler.indexOf('UPDATE products'),
  'PUT resolves postage before UPDATE'
);
assert.match(putHandler, /existing\.ebay_status/);
assert.match(ebayPatchHandler, /applyProductEbayStatusPG/);
assert.equal(
  ebayPatchHandler.includes('updateEbayStatusPG'),
  false,
  'public PATCH uses the shared status helper, not a private UPDATE'
);
assert.match(setEbayStatusFn, /applyProductEbayStatusPG/);
assert.match(addSmartHandler, /setEbayStatus\((?:chosen|existing)\.id, 'ready_to_list'\)/);
assert.equal(
  (addSmartHandler.match(/setEbayStatus\([^,]+, 'ready_to_list'\)/g) || []).length,
  2,
  'add-smart qty bump 0→positive uses postage-aware ready_to_list'
);
assert.match(stockInHandler, /setEbayStatus\(product\.id, 'ready_to_list'/);
assert.match(stockTakeHandler, /setEbayStatus\(product\.id, 'ready_to_list'/);
assert.match(relistHandler, /setEbayStatus\(existingProduct\.id, 'ready_to_list'\)/);
assert.equal(
  relistHandler.includes("SET ebay_status = 'ready_to_list'"),
  false,
  'ebay-updates relist no longer uses a raw status-only UPDATE'
);
assert.match(stockOutHandler, /setEbayStatus\(product\.id, 'not_listed'/);
assert.match(needsPicsHandler, /Intentionally outside postage auto-assignment/);
assert.match(needsPicsHandler, /SET ebay_status = 'not_listed'/);
assert.doesNotMatch(
  needsPicsHandler.split('UPDATE products')[1].split('RETURNING')[0],
  /postage/,
  'needs-pics UPDATE does not assign or clear postage'
);
assert.match(pgProductsSrc, /POSTAGE_AUTOFILL_SQL_PREDICATE/);
assert.match(pgProductsSrc, /planEbayStatusPostage/);
assert.match(pgProductsSrc, /export async function applyProductEbayStatusPG/);
const applyStatusFn = pgProductsSrc
  .split('export async function applyProductEbayStatusPG')[1]
  .split('export async function ebayStatusCountsPG')[0];
assert.ok(
  applyStatusFn.indexOf('getProductByIdPG') < applyStatusFn.indexOf('planEbayStatusPostage') &&
    applyStatusFn.indexOf('planEbayStatusPostage') < applyStatusFn.indexOf('updateEbayStatusPG'),
  'shared helper loads the row, plans postage, then performs one UPDATE'
);
const updateStatusFn = pgProductsSrc
  .split('export async function updateEbayStatusPG')[1]
  .split('export async function applyProductEbayStatusPG')[0];
assert.match(updateStatusFn, /ebay_status = COALESCE\(\$2, ebay_status\)/);
assert.match(updateStatusFn, /on_ebay\s+= COALESCE\(\$4, on_ebay\)/);
assert.match(updateStatusFn, /needs_pics\s+= COALESCE\(\$5, needs_pics\)/);
assert.match(
  updateStatusFn,
  /postage = CASE WHEN \$\{POSTAGE_AUTOFILL_SQL_PREDICATE\} THEN \$7 ELSE postage END/
);
assert.match(
  updateStatusFn,
  /postage_group = CASE WHEN \$\{POSTAGE_AUTOFILL_SQL_PREDICATE\} THEN \$8 ELSE postage_group END/
);
assert.match(stockTakeHandler, /setEbayStatus\(product\.id, 'not_listed'/);
assert.match(indexSrc, /async function setEbayStatus\(productId, status, queryFn = pgQuery\)/);
const dbBackfill = read('src/db.js')
  .split('One-time backfill')[1]
  .split('Sales table')[0];
assert.match(dbBackfill, /SET ebay_status = 'listed'/);
assert.equal(
  /postage/i.test(dbBackfill),
  false,
  'db.js listed backfill is outside product postage workflow and does not write postage'
);
assert.equal(
  POSTAGE_AUTOFILL_SQL_PREDICATE.includes('BTRIM(postage_group)'),
  true
);
assert.equal(
  POSTAGE_AUTOFILL_SQL_PREDICATE.includes('sku IS NOT DISTINCT FROM $9'),
  true
);
assert.equal(
  POSTAGE_AUTOFILL_SQL_PREDICATE.includes('retail IS NOT DISTINCT FROM $10'),
  true
);
assert.match(helperSrc, /if \(prefix === 'G'\) return 'large_letter'|prefix === 'R' \|\| prefix === 'G'/);
assert.match(helperSrc, /group\.price/);
assert.equal(helperSrc.includes('?? 0'), false);

assert.match(createHandler, /getPostagePrice/);
assert.equal(
  createHandler.includes('resolvePostageAssignment'),
  false,
  'POST /api/products does not auto-assign; new rows default to not_listed'
);
assert.equal(
  addSmartHandler.includes('createProductPG') &&
    addSmartHandler.includes('resolvePostageAssignment'),
  false,
  'add-smart create of new not_listed products does not auto-assign postage'
);

assert.match(
  productsList,
  /<option value="battery">Battery \(£3\.00\)<\/option>/
);
assert.match(productsList, /battery:\s*\{\s*label:\s*"Battery",\s*price:\s*3(?:\.0)?\s*\}/);
assert.match(importSrc, /postage: postage \|\| found\.postage \|\| 0/);
assert.equal(importSrc.includes('postage_group'), false);

assert.doesNotMatch(helperSrc, /CREATE TABLE|ALTER TABLE|migrat/i);
assert.doesNotMatch(putHandler, /quantity\s*=\s*quantity\s*\+/);

console.log('--- sibling suite (executable, no DB/env) ---');
function runSibling(rel, label) {
  const result = spawnSync(process.execPath, [path.join(root, rel)], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${label} failed\n${result.stdout}\n${result.stderr}`);
}
runSibling('scripts/testRetireCategoryC.js', '20. Category C retirement tests');
runSibling('scripts/testNeedsListing.js', '21. needs-listing tests');

console.log('--- behaviour not live-tested ---');
console.log(
  'EXECUTABLE: helper mapping, PUT/CSV merge, planEbayStatusPostage, isDbPostageUnassigned, shouldApplyAutoPostageOnRow, applyPlannedPostage concurrency matrix, sibling retire/needs-listing suites.'
);
console.log(
  'STATIC (source wiring only; handlers not invoked): add-smart/stock-in/stock-take/relist/PATCH/setEbayStatus share applyProductEbayStatusPG; needs-pics and db.js listed backfill are documented outside postage fill; SQL CASE uses POSTAGE_AUTOFILL_SQL_PREDICATE. No app listen, no pg Pool, no env file, no SQL execution.'
);
console.log(
  'Creation remains unassigned until a ready_to_list/listed transition because POST /api/products and add-smart create default ebay_status to not_listed.'
);

console.log('postage auto-assignment tests passed');
