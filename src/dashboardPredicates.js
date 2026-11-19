// Shared dashboard / products-list membership contracts.
// Products List still hides H/L/M/V/T/K in the browser for every inventory view.
// Dashboard-linked filters (not_listed, ready_to_list, needs_pics=Y, loss=1)
// also exclude those prefixes in SQL, so the extra client hide does not change
// membership for those links. Unfiltered / listed / sold API results are
// unchanged. /api/stats/ebay keeps origin/main membership and must not use
// these dashboard prefix/quantity extras.

export const EXCLUDED_EBAY_SKU_PREFIXES = Object.freeze(['H', 'L', 'M', 'V', 'T', 'K']);

export const NEEDS_LISTING_STATUS = 'not_listed';
export const READY_TO_LIST_STATUS = 'ready_to_list';
export const LISTED_STATUS = 'listed';
export const SOLD_ON_EBAY_STATUS = 'sold_on_ebay';
export const NEEDS_PICS_YES = 'Y';

export const QUANTITY_POSITIVE_SQL = 'quantity > 0';
export const NEEDS_LISTING_QUANTITY_SQL = QUANTITY_POSITIVE_SQL;

export const UNIT_PROFIT_SQL = '(retail - cost - fees - postage)';
export const MONEY_FIELDS_PRESENT_SQL =
  'retail IS NOT NULL AND cost IS NOT NULL AND fees IS NOT NULL AND postage IS NOT NULL';

export const REFURB_ACTIVE_EXCLUDED_STATUSES = Object.freeze([
  'scrapped',
  'stripped',
  'complete',
  'sold',
  'josh',
]);

export const PARTS_NEEDED_STATUS = 'needs_parts';
export const AWAITING_PARTS_STATUS = 'awaiting_parts';
export const HAS_PARTS_STATUS = 'has_parts';
export const REFURB_STATUS = 'refurb';

export const DASHBOARD_COUNT_FIELDS = Object.freeze([
  'needsListing',
  'readyToList',
  'needsPics',
]);

export const DASHBOARD_DESTINATIONS = Object.freeze({
  needsListing: '/products/list?ebay_status=not_listed',
  readyToList: '/products/list?ebay_status=ready_to_list',
  needsPics: '/products/list?needs_pics=Y',
  lossMaking: '/products/list?loss=1',
  active: '/refurb',
  refurb: '/refurb?status=refurb',
  needsParts: '/refurb?parts=needs_parts',
  awaitingParts: '/refurb?parts=awaiting_parts',
  hasParts: '/refurb?parts=has_parts',
  complete: '/refurb/complete',
});

function sqlStringLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlStringList(values) {
  return values.map(sqlStringLiteral).join(', ');
}

// Matches skuHasExcludedEbayPrefix: trim, uppercase, first character.
export const SKU_PREFIX_SQL = `LEFT(UPPER(BTRIM(COALESCE(sku, ''))), 1)`;

export const EXCLUDED_EBAY_PREFIX_SQL = `${SKU_PREFIX_SQL} NOT IN (${sqlStringList(EXCLUDED_EBAY_SKU_PREFIXES)})`;

export const LOSS_MAKING_SQL = `${QUANTITY_POSITIVE_SQL} AND ${EXCLUDED_EBAY_PREFIX_SQL} AND ${MONEY_FIELDS_PRESENT_SQL} AND ${UNIT_PROFIT_SQL} < 0`;

export function ebayQueueMemberSql(statusParamIndex) {
  return `ebay_status = $${statusParamIndex} AND ${QUANTITY_POSITIVE_SQL} AND ${EXCLUDED_EBAY_PREFIX_SQL}`;
}

export function needsPicsMemberSql(picsParamIndex, soldParamIndex) {
  return `needs_pics = $${picsParamIndex} AND ${QUANTITY_POSITIVE_SQL} AND ebay_status IS DISTINCT FROM $${soldParamIndex} AND ${EXCLUDED_EBAY_PREFIX_SQL}`;
}

export function refurbActiveStatusSql(column = 'status') {
  return `${column} NOT IN (${sqlStringList(REFURB_ACTIVE_EXCLUDED_STATUSES)})`;
}

export function partsNeededListWhereSql(alias = 'r') {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}parts_status = ${sqlStringLiteral(PARTS_NEEDED_STATUS)} AND ${refurbActiveStatusSql(`${prefix}status`)}`;
}

export function skuHasExcludedEbayPrefix(sku) {
  const first = String(sku ?? '').trim().toUpperCase().charAt(0);
  return EXCLUDED_EBAY_SKU_PREFIXES.includes(first);
}

export function positiveQuantity(value) {
  if (value == null || value === '') return false;
  const qty = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(qty) && qty > 0;
}

export function moneyAmount(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function unitProfit(row) {
  if (!row) return null;
  const retail = moneyAmount(row.retail);
  const cost = moneyAmount(row.cost);
  const fees = moneyAmount(row.fees);
  const postage = moneyAmount(row.postage);
  if (retail == null || cost == null || fees == null || postage == null) return null;
  return retail - cost - fees - postage;
}

export function totalProfit(row) {
  const profit = unitProfit(row);
  if (profit == null) return null;
  if (row.quantity == null || row.quantity === '') return null;
  const qty = typeof row.quantity === 'number' ? row.quantity : Number(row.quantity);
  if (!Number.isFinite(qty)) return null;
  return profit * qty;
}

export function productIsEbayStockQueueEligible(row) {
  if (!row) return false;
  if (skuHasExcludedEbayPrefix(row.sku)) return false;
  return positiveQuantity(row.quantity);
}

export function productIsNeedsListing(row) {
  return !!row && row.ebay_status === NEEDS_LISTING_STATUS && productIsEbayStockQueueEligible(row);
}

export function productIsReadyToList(row) {
  return !!row && row.ebay_status === READY_TO_LIST_STATUS && productIsEbayStockQueueEligible(row);
}

export function productIsNeedsPics(row) {
  if (!row) return false;
  if (String(row.needs_pics ?? '') !== NEEDS_PICS_YES) return false;
  // NULL / missing ebay_status is not sold_on_ebay, so it is included.
  if (row.ebay_status === SOLD_ON_EBAY_STATUS) return false;
  return productIsEbayStockQueueEligible(row);
}

export function productIsLossMaking(row) {
  if (!productIsEbayStockQueueEligible(row)) return false;
  const profit = unitProfit(row);
  if (profit == null) return false;
  return profit < 0;
}

function listBy(rows, predicate) {
  return (Array.isArray(rows) ? rows : []).filter(predicate);
}

export function listNeedsListing(rows) {
  return listBy(rows, productIsNeedsListing);
}

export function countNeedsListing(rows) {
  return listNeedsListing(rows).length;
}

export function listReadyToList(rows) {
  return listBy(rows, productIsReadyToList);
}

export function countReadyToList(rows) {
  return listReadyToList(rows).length;
}

export function listNeedsPics(rows) {
  return listBy(rows, productIsNeedsPics);
}

export function countNeedsPics(rows) {
  return listNeedsPics(rows).length;
}

export function listLossMaking(rows) {
  return listBy(rows, productIsLossMaking);
}

export function countLossMaking(rows) {
  return listLossMaking(rows).length;
}

export function refurbIsActive(item) {
  const status = String(item?.status || '');
  return !REFURB_ACTIVE_EXCLUDED_STATUSES.includes(status);
}

export function refurbIsNeedsParts(item) {
  return refurbIsActive(item) && String(item?.parts_status || '') === PARTS_NEEDED_STATUS;
}

export function isEbayQueueStatus(status) {
  return status === NEEDS_LISTING_STATUS || status === READY_TO_LIST_STATUS;
}

export function normalizeNeedsPicsQuery(value) {
  if (value == null || value === '') return undefined;
  return String(value).trim().toUpperCase() === NEEDS_PICS_YES ? NEEDS_PICS_YES : undefined;
}

export function normalizeLossQuery(value) {
  return String(value ?? '') === '1';
}

function assertSequentialParams(params, sql) {
  for (let i = 1; i <= params.length; i += 1) {
    if (!sql.includes(`$${i}`)) {
      throw new Error(`SQL is missing parameter $${i}`);
    }
  }
  const extras = sql.match(/\$(\d+)/g) || [];
  for (const token of extras) {
    const n = Number(token.slice(1));
    if (n > params.length) {
      throw new Error(`SQL uses ${token} but only ${params.length} params were provided`);
    }
  }
}

export function productsListWhere({ ebay_status, needs_pics, loss } = {}) {
  const params = [];
  const conditions = [];

  if (ebay_status) {
    params.push(String(ebay_status));
    if (isEbayQueueStatus(String(ebay_status))) {
      conditions.push(ebayQueueMemberSql(params.length));
    } else {
      conditions.push(`ebay_status = $${params.length}`);
    }
  }

  const pics = normalizeNeedsPicsQuery(needs_pics);
  if (pics) {
    params.push(pics);
    const picsIndex = params.length;
    params.push(SOLD_ON_EBAY_STATUS);
    conditions.push(needsPicsMemberSql(picsIndex, params.length));
  }

  if (normalizeLossQuery(loss)) {
    conditions.push(LOSS_MAKING_SQL);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  assertSequentialParams(params, where);
  return { params, where };
}

export function ebayStatusCountsQuery() {
  // origin/main membership: not_listed only when quantity > 0;
  // every other ebay_status bucket is unfiltered. No SKU-prefix exclusion.
  const params = [NEEDS_LISTING_STATUS];
  const text = `
      SELECT ebay_status, COUNT(*)::int AS count
      FROM products
      WHERE ebay_status IS DISTINCT FROM $1
         OR ${NEEDS_LISTING_QUANTITY_SQL}
      GROUP BY ebay_status
    `;
  assertSequentialParams(params, text);
  return { text, params };
}

export function dashboardCountsQuery() {
  const params = [
    NEEDS_LISTING_STATUS,
    READY_TO_LIST_STATUS,
    NEEDS_PICS_YES,
    SOLD_ON_EBAY_STATUS,
  ];
  const text = `
      SELECT
        COUNT(*) FILTER (WHERE ${ebayQueueMemberSql(1)})::int AS needs_listing,
        COUNT(*) FILTER (WHERE ${ebayQueueMemberSql(2)})::int AS ready_to_list,
        COUNT(*) FILTER (WHERE ${needsPicsMemberSql(3, 4)})::int AS needs_pics
      FROM products
    `;
  assertSequentialParams(params, text);
  return { text, params };
}

export function requireArray(data) {
  if (!Array.isArray(data)) {
    throw new Error('request failed');
  }
  return data;
}

export function readDashboardCounts(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('request failed');
  }
  const out = {};
  for (const key of DASHBOARD_COUNT_FIELDS) {
    const value = data[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('request failed');
    }
    out[key] = value;
  }
  return out;
}

export function statsEbayBucketIncludes(row, status) {
  if (!row || row.ebay_status !== status) return false;
  if (status !== NEEDS_LISTING_STATUS) return true;
  return positiveQuantity(row.quantity);
}

export function lossMakingQuery() {
  const params = [];
  const text = `
      SELECT
        id,
        sku,
        name,
        quantity,
        retail,
        cost,
        fees,
        postage,
        ${UNIT_PROFIT_SQL} AS profit,
        (${UNIT_PROFIT_SQL} * quantity) AS total_profit
      FROM products
      WHERE ${LOSS_MAKING_SQL}
      ORDER BY ${UNIT_PROFIT_SQL} ASC, sku ASC
    `;
  assertSequentialParams(params, text);
  return { text, params };
}
