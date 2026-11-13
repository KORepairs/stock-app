import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DASHBOARD_COUNT_FIELDS,
  DASHBOARD_DESTINATIONS,
  EXCLUDED_EBAY_PREFIX_SQL,
  EXCLUDED_EBAY_SKU_PREFIXES,
  LOSS_MAKING_SQL,
  MONEY_FIELDS_PRESENT_SQL,
  NEEDS_LISTING_QUANTITY_SQL,
  NEEDS_LISTING_STATUS,
  NEEDS_PICS_YES,
  QUANTITY_POSITIVE_SQL,
  READY_TO_LIST_STATUS,
  REFURB_ACTIVE_EXCLUDED_STATUSES,
  SKU_PREFIX_SQL,
  SOLD_ON_EBAY_STATUS,
  UNIT_PROFIT_SQL,
  countLossMaking,
  countNeedsListing,
  countNeedsPics,
  countReadyToList,
  dashboardCountsQuery,
  ebayQueueMemberSql,
  ebayStatusCountsQuery,
  listLossMaking,
  listNeedsListing,
  listNeedsPics,
  listReadyToList,
  lossMakingQuery,
  needsPicsMemberSql,
  partsNeededListWhereSql,
  productIsLossMaking,
  productIsNeedsListing,
  productIsNeedsPics,
  productIsReadyToList,
  productsListWhere,
  readDashboardCounts,
  refurbActiveStatusSql,
  refurbIsNeedsParts,
  requireArray,
  skuHasExcludedEbayPrefix,
  statsEbayBucketIncludes,
  totalProfit,
  unitProfit,
} from '../src/dashboardPredicates.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const dashboardHtml = read('public/dashboard.html');
const productsListHtml = read('public/products-list.html');
const indexSrc = read('src/index.js');
const pgProductsSrc = read('src/pgProducts.js');

const fixture = [
  {
    id: 1,
    sku: 'A1',
    ebay_status: 'not_listed',
    quantity: 3,
    needs_pics: 'Y',
    retail: 10,
    cost: 20,
    fees: 1,
    postage: 1,
  },
  {
    id: 2,
    sku: 'A2',
    ebay_status: 'not_listed',
    quantity: 0,
    needs_pics: 'Y',
    retail: 10,
    cost: 20,
    fees: 1,
    postage: 1,
  },
  {
    id: 3,
    sku: 'A3',
    ebay_status: 'not_listed',
    quantity: -2,
    needs_pics: 'Y',
    retail: 10,
    cost: 20,
    fees: 1,
    postage: 1,
  },
  {
    id: 4,
    sku: 'A4',
    ebay_status: 'not_listed',
    quantity: null,
    needs_pics: 'Y',
    retail: 10,
    cost: 20,
    fees: 1,
    postage: 1,
  },
  {
    id: 5,
    sku: 'H1',
    ebay_status: 'not_listed',
    quantity: 4,
    needs_pics: 'Y',
    retail: 10,
    cost: 20,
    fees: 1,
    postage: 1,
  },
  {
    id: 6,
    sku: 'B1',
    ebay_status: 'ready_to_list',
    quantity: 2,
    needs_pics: 'N',
    retail: 50,
    cost: 10,
    fees: 5,
    postage: 2,
  },
  {
    id: 7,
    sku: 'B2',
    ebay_status: 'ready_to_list',
    quantity: 0,
    needs_pics: 'Y',
    retail: 10,
    cost: 20,
    fees: 1,
    postage: 1,
  },
  {
    id: 8,
    sku: 'B3',
    ebay_status: 'ready_to_list',
    quantity: -1,
    needs_pics: 'Y',
    retail: 10,
    cost: 20,
    fees: 1,
    postage: 1,
  },
  {
    id: 9,
    sku: 'B4',
    ebay_status: 'ready_to_list',
    quantity: null,
    needs_pics: 'Y',
    retail: 10,
    cost: 20,
    fees: 1,
    postage: 1,
  },
  {
    id: 10,
    sku: 'L1',
    ebay_status: 'ready_to_list',
    quantity: 5,
    needs_pics: 'Y',
    retail: 10,
    cost: 20,
    fees: 1,
    postage: 1,
  },
  {
    id: 11,
    sku: 'C1',
    ebay_status: 'listed',
    quantity: 4,
    needs_pics: 'Y',
    retail: 8,
    cost: 8,
    fees: 0,
    postage: 0,
  },
  {
    id: 12,
    sku: 'C2',
    ebay_status: 'sold_on_ebay',
    quantity: 3,
    needs_pics: 'Y',
    retail: 5,
    cost: 9,
    fees: 1,
    postage: 1,
  },
  {
    id: 13,
    sku: 'D1',
    ebay_status: 'listed',
    quantity: 2,
    needs_pics: 'N',
    retail: 10,
    cost: 20,
    fees: 1,
    postage: 1,
  },
  {
    id: 14,
    sku: 'D2',
    ebay_status: 'listed',
    quantity: 2,
    needs_pics: 'Y',
    retail: null,
    cost: 5,
    fees: 1,
    postage: 1,
  },
  {
    id: 15,
    sku: 'D3',
    ebay_status: 'listed',
    quantity: 2,
    needs_pics: 'Y',
    retail: '12.50',
    cost: '20.00',
    fees: '1.00',
    postage: '1.00',
  },
  {
    id: 16,
    sku: 'D4',
    ebay_status: null,
    quantity: 1,
    needs_pics: 'Y',
    retail: 30,
    cost: 10,
    fees: 1,
    postage: 1,
  },
  {
    id: 17,
    sku: 'M1',
    ebay_status: 'listed',
    quantity: 9,
    needs_pics: 'Y',
    retail: 1,
    cost: 50,
    fees: 1,
    postage: 1,
  },
  {
    id: 18,
    sku: 'E1',
    ebay_status: 'listed',
    quantity: 3,
    needs_pics: 'Y',
    retail: 10,
    cost: 4,
    fees: 1,
    postage: 1,
  },
  {
    id: 19,
    sku: 'V1',
    ebay_status: 'not_listed',
    quantity: 6,
    needs_pics: 'Y',
    retail: 1,
    cost: 8,
    fees: 1,
    postage: 1,
  },
  {
    id: 20,
    sku: 'T1',
    ebay_status: 'ready_to_list',
    quantity: 6,
    needs_pics: 'Y',
    retail: 1,
    cost: 8,
    fees: 1,
    postage: 1,
  },
  {
    id: 21,
    sku: 'K1',
    ebay_status: 'listed',
    quantity: 6,
    needs_pics: 'Y',
    retail: 1,
    cost: 8,
    fees: 1,
    postage: 1,
  },
  {
    id: 22,
    sku: 'F1',
    ebay_status: 'listed',
    quantity: 2,
    needs_pics: 'Y',
    retail: 10,
    cost: 10,
    fees: 0,
    postage: 0,
  },
  {
    id: 23,
    sku: 'F2',
    ebay_status: 'listed',
    quantity: 2,
    needs_pics: 'Y',
    retail: 10,
    cost: 5,
    fees: 2,
    postage: 2,
  },
  {
    id: 24,
    sku: 'G1',
    ebay_status: 'listed',
    quantity: 2,
    needs_pics: 'Y',
    retail: 10,
    cost: 20,
    fees: 1,
    postage: null,
  },
];

console.log('--- needs listing ---');
assert.equal(productIsNeedsListing(fixture[0]), true);
assert.equal(productIsNeedsListing(fixture[1]), false, 'qty 0');
assert.equal(productIsNeedsListing(fixture[2]), false, 'qty negative');
assert.equal(productIsNeedsListing(fixture[3]), false, 'qty NULL');
for (const prefix of EXCLUDED_EBAY_SKU_PREFIXES) {
  assert.equal(
    productIsNeedsListing({
      sku: `${prefix}9`,
      ebay_status: 'not_listed',
      quantity: 4,
    }),
    false,
    `${prefix} prefix excluded`
  );
}
assert.equal(
  productIsNeedsListing({ sku: 'P1', ebay_status: 'not_listed', quantity: 1 }),
  true,
  'normal eBay prefix included'
);
assert.equal(
  productIsNeedsListing({ sku: 'h9', ebay_status: 'not_listed', quantity: 4 }),
  false,
  'lowercase excluded prefix'
);
assert.equal(
  productIsNeedsListing({ sku: '  H9', ebay_status: 'not_listed', quantity: 4 }),
  false,
  'leading whitespace excluded prefix'
);
assert.equal(
  productIsNeedsListing({ sku: 'H9  ', ebay_status: 'not_listed', quantity: 4 }),
  false,
  'trailing whitespace excluded prefix'
);
assert.equal(
  productIsNeedsListing({ sku: 'a1', ebay_status: 'not_listed', quantity: 2 }),
  true,
  'lowercase allowed prefix'
);
assert.equal(
  productIsNeedsListing({ sku: '  A1  ', ebay_status: 'not_listed', quantity: 2 }),
  true,
  'trimmed allowed prefix'
);
assert.equal(skuHasExcludedEbayPrefix('  k10'), true);
assert.equal(skuHasExcludedEbayPrefix('p1'), false);
const needsList = listNeedsListing(fixture);
assert.deepEqual(needsList.map((r) => r.id), [1]);
assert.equal(countNeedsListing(fixture), needsList.length);

console.log('--- ready to list ---');
assert.equal(productIsReadyToList(fixture[5]), true);
assert.equal(productIsReadyToList(fixture[6]), false, 'qty 0');
assert.equal(productIsReadyToList(fixture[7]), false, 'qty negative');
assert.equal(productIsReadyToList(fixture[8]), false, 'qty NULL');
assert.equal(productIsReadyToList(fixture[9]), false, 'L prefix');
assert.equal(productIsReadyToList(fixture[0]), false, 'other status');
const readyList = listReadyToList(fixture);
assert.deepEqual(readyList.map((r) => r.id), [6]);
assert.equal(countReadyToList(fixture), readyList.length);

console.log('--- needs pictures ---');
assert.equal(productIsNeedsPics(fixture[0]), true, 'Y + qty + not sold');
assert.equal(productIsNeedsPics(fixture[5]), false, 'N excluded');
assert.equal(productIsNeedsPics(fixture[1]), false, 'qty 0');
assert.equal(productIsNeedsPics(fixture[2]), false, 'qty negative');
assert.equal(productIsNeedsPics(fixture[3]), false, 'qty NULL');
assert.equal(productIsNeedsPics(fixture[11]), false, 'sold_on_ebay');
assert.equal(productIsNeedsPics(fixture[4]), false, 'H prefix');
assert.equal(productIsNeedsPics(fixture[15]), true, 'NULL status included');
const picsList = listNeedsPics(fixture);
assert.equal(countNeedsPics(fixture), picsList.length);
assert.equal(picsList.some((r) => r.ebay_status === SOLD_ON_EBAY_STATUS), false);
assert.equal(picsList.some((r) => r.ebay_status == null), true);

console.log('--- loss ---');
assert.equal(productIsLossMaking(fixture[0]), true, 'negative unit profit');
assert.equal(productIsLossMaking(fixture[21]), false, 'zero profit excluded');
assert.equal(productIsLossMaking(fixture[22]), false, 'positive excluded');
assert.equal(productIsLossMaking(fixture[1]), false, 'qty 0');
assert.equal(productIsLossMaking(fixture[2]), false, 'qty negative');
assert.equal(
  productIsLossMaking({
    sku: 'A9',
    quantity: null,
    retail: 1,
    cost: 8,
    fees: 1,
    postage: 1,
  }),
  false,
  'qty NULL'
);
assert.equal(productIsLossMaking(fixture[13]), false, 'NULL retail');
assert.equal(
  productIsLossMaking({
    sku: 'A9',
    quantity: 1,
    retail: 1,
    cost: null,
    fees: 1,
    postage: 1,
  }),
  false,
  'NULL cost'
);
assert.equal(
  productIsLossMaking({
    sku: 'A9',
    quantity: 1,
    retail: 1,
    cost: 8,
    fees: null,
    postage: 1,
  }),
  false,
  'NULL fees'
);
assert.equal(productIsLossMaking(fixture[23]), false, 'NULL postage');
assert.equal(productIsLossMaking(fixture[4]), false, 'H prefix');
assert.equal(productIsLossMaking(fixture[16]), false, 'M prefix');
assert.equal(productIsLossMaking(fixture[14]), true, 'numeric strings');
assert.equal(unitProfit(fixture[14]), 12.5 - 20 - 1 - 1);
assert.equal(totalProfit(fixture[14]), (12.5 - 20 - 1 - 1) * 2);
const lossList = listLossMaking(fixture);
assert.equal(countLossMaking(fixture), lossList.length);
assert.equal(lossList.some((r) => unitProfit(r) >= 0), false);
assert.equal(lossList.some((r) => unitProfit(r) == null), false);

console.log('--- contracts ---');
assert.equal(countNeedsListing(fixture), listNeedsListing(fixture).length);
assert.equal(countReadyToList(fixture), listReadyToList(fixture).length);
assert.equal(countNeedsPics(fixture), listNeedsPics(fixture).length);
assert.equal(countLossMaking(fixture), listLossMaking(fixture).length);

const needsWhere = productsListWhere({ ebay_status: NEEDS_LISTING_STATUS });
assert.deepEqual(needsWhere.params, [NEEDS_LISTING_STATUS]);
assert.equal(needsWhere.where, `WHERE ${ebayQueueMemberSql(1)}`);

const readyWhere = productsListWhere({ ebay_status: READY_TO_LIST_STATUS });
assert.deepEqual(readyWhere.params, [READY_TO_LIST_STATUS]);
assert.equal(readyWhere.where, `WHERE ${ebayQueueMemberSql(1)}`);

const picsWhere = productsListWhere({ needs_pics: NEEDS_PICS_YES });
assert.deepEqual(picsWhere.params, [NEEDS_PICS_YES, SOLD_ON_EBAY_STATUS]);
assert.equal(picsWhere.where, `WHERE ${needsPicsMemberSql(1, 2)}`);

const lossWhere = productsListWhere({ loss: '1' });
assert.deepEqual(lossWhere.params, []);
assert.equal(lossWhere.where, `WHERE ${LOSS_MAKING_SQL}`);
assert.match(LOSS_MAKING_SQL, /< 0/);
assert.match(LOSS_MAKING_SQL, new RegExp(MONEY_FIELDS_PRESENT_SQL.replace(/ /g, '\\s+')));
assert.match(LOSS_MAKING_SQL, new RegExp(UNIT_PROFIT_SQL.replace(/[()]/g, '\\$&')));

const listedWhere = productsListWhere({ ebay_status: 'listed' });
assert.equal(listedWhere.where, 'WHERE ebay_status = $1');
assert.equal(listedWhere.where.includes(QUANTITY_POSITIVE_SQL), false);
assert.equal(listedWhere.where.includes(EXCLUDED_EBAY_PREFIX_SQL), false);

const soldWhere = productsListWhere({ ebay_status: 'sold_on_ebay' });
assert.equal(soldWhere.where, 'WHERE ebay_status = $1');

const unfiltered = productsListWhere({});
assert.equal(unfiltered.where, '');
assert.deepEqual(unfiltered.params, []);

function assertParamsMatchSql(query) {
  const sql = query.text || query.where || '';
  const tokens = [...new Set(sql.match(/\$(\d+)/g) || [])];
  const numbers = tokens.map((t) => Number(t.slice(1))).sort((a, b) => a - b);
  assert.deepEqual(
    numbers,
    query.params.map((_, i) => i + 1),
    'parameter numbering is sequential'
  );
}

assertParamsMatchSql(needsWhere);
assertParamsMatchSql(readyWhere);
assertParamsMatchSql(picsWhere);
assertParamsMatchSql(lossWhere);
assertParamsMatchSql(listedWhere);
assertParamsMatchSql(unfiltered);
assertParamsMatchSql(ebayStatusCountsQuery());
assertParamsMatchSql(dashboardCountsQuery());
assertParamsMatchSql(lossMakingQuery());

const countsQuery = dashboardCountsQuery();
assert.deepEqual(countsQuery.params, [
  NEEDS_LISTING_STATUS,
  READY_TO_LIST_STATUS,
  NEEDS_PICS_YES,
  SOLD_ON_EBAY_STATUS,
]);
assert.match(countsQuery.text, /needs_listing/);
assert.match(countsQuery.text, /ready_to_list/);
assert.match(countsQuery.text, /needs_pics/);
assert.equal(countsQuery.text.includes('AS listed'), false);
assert.equal(countsQuery.text.includes(ebayQueueMemberSql(1)), true);
assert.equal(countsQuery.text.includes(ebayQueueMemberSql(2)), true);
assert.equal(countsQuery.text.includes(needsPicsMemberSql(3, 4)), true);
assert.match(EXCLUDED_EBAY_PREFIX_SQL, /BTRIM/);
assert.match(EXCLUDED_EBAY_PREFIX_SQL, /UPPER/);
assert.equal(SKU_PREFIX_SQL.includes('BTRIM(COALESCE(sku, \'\'))'), true);
assert.equal(countsQuery.text.includes(EXCLUDED_EBAY_PREFIX_SQL), true);
assert.equal(lossMakingQuery().text.includes(LOSS_MAKING_SQL), true);
assert.deepEqual([...DASHBOARD_COUNT_FIELDS], [
  'needsListing',
  'readyToList',
  'needsPics',
]);

console.log('--- dashboard destinations and isolation ---');
assert.match(dashboardHtml, /Ready to list/);
assert.equal(dashboardHtml.includes('Stock returned from 0'), false);
assert.equal(dashboardHtml.includes('Relist needed'), false);
assert.equal(dashboardHtml.includes('Listed on eBay'), false);
assert.equal(dashboardHtml.includes('kpiEbayListed'), false);
assert.equal(dashboardHtml.includes('kpi_ebay_listed'), false);
assert.equal(/ebay_status=listed(?![_a-z])/.test(dashboardHtml), false);
assert.equal(dashboardHtml.includes('/api/refurb?view=retired'), false);
assert.equal(dashboardHtml.includes('kpi_scrapped'), false);
assert.equal(dashboardHtml.includes('completeNoRetail'), false);
assert.equal(dashboardHtml.includes('#kpis_refurb'), false);
assert.match(dashboardHtml, /\/api\/refurb\?view=complete/);
assert.match(dashboardHtml, /\/refurb\/complete/);
assert.equal(dashboardHtml.includes('/refurb?status=complete'), false);
assert.match(dashboardHtml, new RegExp(DASHBOARD_DESTINATIONS.needsListing.replace('?', '\\?')));
assert.match(dashboardHtml, new RegExp(DASHBOARD_DESTINATIONS.readyToList.replace('?', '\\?')));
assert.match(dashboardHtml, new RegExp(DASHBOARD_DESTINATIONS.needsPics.replace('?', '\\?')));
assert.match(dashboardHtml, new RegExp(DASHBOARD_DESTINATIONS.lossMaking.replace('?', '\\?')));
assert.match(dashboardHtml, /\/refurb\?parts=needs_parts/);
assert.match(dashboardHtml, /\/refurb\?parts=awaiting_parts/);
assert.match(dashboardHtml, /data-go="parts:has_parts"/);
assert.match(dashboardHtml, /data-go="parts:needs_parts"/);
assert.match(dashboardHtml, /data-go="parts:awaiting_parts"/);
assert.match(dashboardHtml, /data-go="status:refurb"/);
assert.match(dashboardHtml, /\/api\/dashboard\/counts/);
assert.equal(/fetch\(\s*["']\/api\/products["']/.test(dashboardHtml), false);
assert.match(dashboardHtml, /Promise\.all/);
assert.match(dashboardHtml, /async function isolated/);
assert.match(dashboardHtml, /setFailed/);
assert.match(dashboardHtml, /textContent/);
assert.equal(dashboardHtml.includes('createElement'), true);
assert.match(dashboardHtml, /function requireArray/);
assert.match(dashboardHtml, /function readDashboardCounts/);
assert.equal(dashboardHtml.includes('Array.isArray(data) ? data : []'), false);
assert.match(dashboardHtml, /requireArray\(await fetchJson\("\/api\/refurb\?view=active"\)\)/);
assert.match(pgProductsSrc, /needsListing: Number\(row\.needs_listing\)/);
assert.equal(pgProductsSrc.includes('listed: Number(row.listed)'), false);

console.log('--- products list contracts ---');
assert.match(productsListHtml, /needs_pics/);
assert.match(productsListHtml, /loss=== "1"|loss === "1"/);
assert.equal(
  productsListHtml.includes('if (lossOnly && profit >= 0)'),
  false,
  'browser no longer applies a contradictory loss profit rule'
);

console.log('--- backend wiring ---');
assert.match(indexSrc, /\/api\/dashboard\/counts/);
assert.match(indexSrc, /listProductsPG\(\{ ebay_status, needs_pics, loss \}\)/);
assert.match(indexSrc, /listLossMakingPG\(\)/);
assert.match(indexSrc, /refurbActiveStatusSql\(\)/);
assert.match(indexSrc, /partsNeededListWhereSql\('r'\)/);
assert.match(indexSrc, /Failed to load dashboard counts/);
assert.match(indexSrc, /Failed to load loss-making stock/);
assert.match(indexSrc, /Failed to load products/);
assert.equal(
  /app\.get\('\/api\/dashboard\/counts'[\s\S]{0,400}err\.message/.test(indexSrc),
  false
);
assert.equal(
  /app\.get\('\/api\/dashboard\/loss-making'[\s\S]{0,500}err\.message/.test(indexSrc),
  false
);
assert.match(pgProductsSrc, /listProductsPG\(\{ ebay_status, needs_pics, loss \}/);
assert.match(pgProductsSrc, /dashboardCountsQuery/);
assert.match(pgProductsSrc, /lossMakingQuery/);

const partsSql = partsNeededListWhereSql('r');
assert.match(partsSql, /needs_parts/);
for (const status of REFURB_ACTIVE_EXCLUDED_STATUSES) {
  assert.match(partsSql, new RegExp(status));
}
assert.equal(refurbIsNeedsParts({ status: 'refurb', parts_status: 'needs_parts' }), true);
assert.equal(refurbIsNeedsParts({ status: 'complete', parts_status: 'needs_parts' }), false);
assert.equal(refurbIsNeedsParts({ status: 'josh', parts_status: 'needs_parts' }), false);
assert.match(refurbActiveStatusSql(), /complete/);
assert.match(refurbActiveStatusSql(), /josh/);

assert.equal(indexSrc.includes("view === 'complete'"), true);

console.log('--- stats/ebay origin/main membership ---');
const statsQuery = ebayStatusCountsQuery();
assert.deepEqual(statsQuery.params, [NEEDS_LISTING_STATUS]);
assert.match(statsQuery.text, /IS DISTINCT FROM \$1/);
assert.match(statsQuery.text, new RegExp(NEEDS_LISTING_QUANTITY_SQL.replace(' ', '\\s+')));
assert.equal(statsQuery.text.includes(EXCLUDED_EBAY_PREFIX_SQL), false);
assert.equal(statsQuery.text.includes('ready_to_list'), false);
assert.equal(
  statsEbayBucketIncludes(
    { sku: 'A1', ebay_status: 'not_listed', quantity: 3 },
    'not_listed'
  ),
  true
);
assert.equal(
  statsEbayBucketIncludes(
    { sku: 'H1', ebay_status: 'not_listed', quantity: 5 },
    'not_listed'
  ),
  true,
  'legacy stats/ebay does not exclude refurb prefixes'
);
assert.equal(
  statsEbayBucketIncludes(
    { sku: 'A2', ebay_status: 'not_listed', quantity: 0 },
    'not_listed'
  ),
  false
);
assert.equal(
  statsEbayBucketIncludes(
    { sku: 'B0', ebay_status: 'ready_to_list', quantity: 0 },
    'ready_to_list'
  ),
  true,
  'legacy stats/ebay ready_to_list keeps qty 0'
);
assert.equal(
  statsEbayBucketIncludes(
    { sku: 'H9', ebay_status: 'listed', quantity: 0 },
    'listed'
  ),
  true
);
assert.equal(
  statsEbayBucketIncludes(
    { sku: 'A7', ebay_status: 'sold_on_ebay', quantity: 0 },
    'sold_on_ebay'
  ),
  true
);

console.log('--- malformed dashboard responses ---');
assert.deepEqual(requireArray([1]), [1]);
assert.throws(() => requireArray({}), /request failed/);
assert.throws(() => requireArray(null), /request failed/);
assert.throws(() => requireArray('[]'), /request failed/);
assert.deepEqual(
  readDashboardCounts({ needsListing: 1, readyToList: 0, needsPics: 2 }),
  { needsListing: 1, readyToList: 0, needsPics: 2 }
);
assert.throws(
  () => readDashboardCounts({ needsListing: 1, readyToList: 0 }),
  /request failed/,
  'missing field'
);
assert.throws(
  () => readDashboardCounts({ needsListing: '1', readyToList: 0, needsPics: 2 }),
  /request failed/,
  'string count'
);
assert.throws(
  () => readDashboardCounts({ needsListing: NaN, readyToList: 0, needsPics: 2 }),
  /request failed/
);
assert.deepEqual(
  readDashboardCounts({
    needsListing: 1,
    readyToList: 0,
    needsPics: 2,
    listed: 9,
  }),
  { needsListing: 1, readyToList: 0, needsPics: 2 },
  'unexpected listed field is ignored rather than displayed'
);
assert.throws(
  () =>
    readDashboardCounts({
      needsListing: Infinity,
      readyToList: 0,
      needsPics: 2,
    }),
  /request failed/
);
assert.throws(() => readDashboardCounts(null), /request failed/);
assert.throws(() => readDashboardCounts([1, 2, 3]), /request failed/);

console.log('dashboard predicate tests passed');
