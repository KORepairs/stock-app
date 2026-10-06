import assert from 'node:assert/strict';
import {
  NEEDS_LISTING_QUANTITY_SQL,
  NEEDS_LISTING_STATUS,
  countNeedsListing,
  ebayStatusCountsQuery,
  listNeedsListing,
  productIsNeedsListing,
  productsListWhere,
} from '../src/needsListing.js';

const rows = [
  { id: 1, sku: 'A1', ebay_status: 'not_listed', quantity: 3 },
  { id: 2, sku: 'A2', ebay_status: 'not_listed', quantity: 0 },
  { id: 3, sku: 'A3', ebay_status: 'not_listed', quantity: -2 },
  { id: 4, sku: 'A4', ebay_status: 'not_listed', quantity: null },
  { id: 5, sku: 'A5', ebay_status: 'listed', quantity: 8 },
  { id: 6, sku: 'A6', ebay_status: 'ready_to_list', quantity: 4 },
  { id: 7, sku: 'A7', ebay_status: 'sold_on_ebay', quantity: 1 },
  { id: 8, sku: 'A8', ebay_status: 'not_listed', quantity: 'x' },
];

assert.equal(productIsNeedsListing(rows[0]), true, '1 qty>0 not_listed included');
assert.equal(productIsNeedsListing(rows[1]), false, '2 qty 0 excluded');
assert.equal(productIsNeedsListing(rows[2]), false, '3 negative qty excluded');
assert.equal(productIsNeedsListing(rows[3]), false, '4 NULL qty excluded');
assert.equal(productIsNeedsListing(rows[4]), false, '5 listed excluded');
assert.equal(productIsNeedsListing(rows[5]), false, '6 ready_to_list excluded');
assert.equal(productIsNeedsListing(rows[6]), false, '7 sold_on_ebay excluded');
assert.equal(productIsNeedsListing(rows[7]), false, 'invalid qty excluded');

const listed = listNeedsListing(rows);
const counted = countNeedsListing(rows);
assert.deepEqual(listed.map((r) => r.id), [1]);
assert.equal(counted, listed.length, '7 count and list use identical membership');
assert.equal(counted, 1);

const needsListWhere = productsListWhere({ ebay_status: 'not_listed' });
assert.deepEqual(needsListWhere.params, [NEEDS_LISTING_STATUS]);
assert.equal(
  needsListWhere.where,
  `WHERE ebay_status = $1 AND ${NEEDS_LISTING_QUANTITY_SQL}`
);

const listedWhere = productsListWhere({ ebay_status: 'listed' });
assert.deepEqual(listedWhere.params, ['listed']);
assert.equal(listedWhere.where, 'WHERE ebay_status = $1');
assert.equal(listedWhere.where.includes(NEEDS_LISTING_QUANTITY_SQL), false);

const readyWhere = productsListWhere({ ebay_status: 'ready_to_list' });
assert.equal(readyWhere.where, 'WHERE ebay_status = $1');

const unfiltered = productsListWhere({});
assert.equal(unfiltered.where, '');
assert.deepEqual(unfiltered.params, []);

const counts = ebayStatusCountsQuery();
assert.deepEqual(counts.params, [NEEDS_LISTING_STATUS]);
assert.match(counts.text, /IS DISTINCT FROM \$1/);
assert.match(counts.text, new RegExp(NEEDS_LISTING_QUANTITY_SQL.replace(' ', '\\s+')));
assert.match(counts.text, /GROUP BY ebay_status/);

function countFromSqlRule(status) {
  return rows.filter((row) => {
    if (row.ebay_status !== status) return false;
    if (status !== NEEDS_LISTING_STATUS) return true;
    return productIsNeedsListing(row);
  }).length;
}

assert.equal(countFromSqlRule('not_listed'), counted);
assert.equal(countFromSqlRule('listed'), 1);
assert.equal(countFromSqlRule('ready_to_list'), 1);

console.log('needs-listing membership tests passed');
