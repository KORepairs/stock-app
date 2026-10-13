import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INVALID_PRODUCT_SKU_CODE,
  INVALID_PRODUCT_SKU_ERROR,
  RETIRED_CATEGORY_C_CODE,
  RETIRED_CATEGORY_C_ERROR,
  InvalidProductSkuError,
  RetiredCategoryCError,
  assertProductCreateSkuAllowed,
  canonicalSku,
  inputWouldWriteRetiredC,
  isInvalidProductSkuError,
  isRetiredCategoryCError,
  planRetiredCRefurbCompletion,
  retiredCAddSmartError,
  retiredCCreateError,
  retiredCUpdateError,
  skuHasRetiredCPrefix,
} from '../src/retiredCategoryC.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const indexSrc = read('src/index.js');
const pgProductsSrc = read('src/pgProducts.js');
const addSmartHandler = indexSrc
  .split("app.post('/api/products/add-smart'")[1]
  .split("app.get('/api/ebay-updates'")[0];
const createHandler = indexSrc
  .split("app.post('/api/products',")[1]
  .split("app.post('/api/products/add-smart'")[0];
const updateHandler = indexSrc
  .split("app.put('/api/products/:id'")[1]
  .split("app.patch('/api/products/:id/ebay'")[0];
const refurbPostHandler = indexSrc
  .split("app.post('/api/refurb'")[1]
  .split("app.get('/api/refurb/parts-needed-list'")[0];
const refurbPutHandler = indexSrc
  .split("app.put('/api/refurb/:id'")[1]
  .split("app.delete('/api/refurb/:id'")[0];
const createProductFn = pgProductsSrc
  .split('export async function createProductPG')[1]
  .split('export async function getProductByCodePG')[0];

function throwsRetired(fn) {
  assert.throws(fn, (err) => {
    assert.equal(err instanceof RetiredCategoryCError, true);
    assert.equal(err.code, RETIRED_CATEGORY_C_CODE);
    assert.equal(err.message, RETIRED_CATEGORY_C_ERROR);
    assert.equal(isRetiredCategoryCError(err), true);
    assert.equal(String(err.message).includes('SELECT'), false);
    return true;
  });
}

function throwsInvalidSku(fn) {
  assert.throws(fn, (err) => {
    assert.equal(err instanceof InvalidProductSkuError, true);
    assert.equal(err.code, INVALID_PRODUCT_SKU_CODE);
    assert.equal(err.message, INVALID_PRODUCT_SKU_ERROR);
    assert.equal(isInvalidProductSkuError(err), true);
    assert.equal(isRetiredCategoryCError(err), false);
    assert.equal(String(err.message).includes('SELECT'), false);
    return true;
  });
}

console.log('--- executable helper tests ---');

assert.equal(canonicalSku('C0001'), 'C0001');
assert.equal(canonicalSku(' c0001 '), 'C0001');
assert.equal(canonicalSku('A0001'), 'A0001');
assert.equal(canonicalSku('  a0002  '), 'A0002');
assert.equal(canonicalSku(''), null);
assert.equal(canonicalSku('   '), null);
assert.equal(canonicalSku(null), null);
assert.equal(canonicalSku(undefined), null);
assert.equal(canonicalSku(['C0001']), null);
assert.equal(canonicalSku({}), null);
assert.equal(skuHasRetiredCPrefix('C0001'), true);
assert.equal(skuHasRetiredCPrefix(' c0001 '), true, 'whitespace-prefixed raw C is recognised');
assert.equal(skuHasRetiredCPrefix('CHARGER'), true);
assert.equal(skuHasRetiredCPrefix('A0001'), false);
assert.equal(skuHasRetiredCPrefix(' a0001 '), false);
assert.equal(skuHasRetiredCPrefix(null), false);
assert.equal(skuHasRetiredCPrefix(''), false);

assert.equal(retiredCAddSmartError('C'), RETIRED_CATEGORY_C_ERROR, '1. add-smart C');
assert.equal(retiredCAddSmartError(' c '), RETIRED_CATEGORY_C_ERROR, '2. add-smart c with whitespace');
assert.equal(retiredCAddSmartError('CX'), RETIRED_CATEGORY_C_ERROR, '3. add-smart CX');
assert.equal(retiredCAddSmartError('C1'), RETIRED_CATEGORY_C_ERROR, '4. add-smart C1');
assert.equal(retiredCAddSmartError('CHARGER'), RETIRED_CATEGORY_C_ERROR, '5. add-smart CHARGER');
assert.equal(retiredCAddSmartError(['C']), RETIRED_CATEGORY_C_ERROR, '6. add-smart array C');
assert.equal(retiredCAddSmartError(['CX']), RETIRED_CATEGORY_C_ERROR, '6b. add-smart array CX');
assert.equal(retiredCAddSmartError(['CHARGER']), RETIRED_CATEGORY_C_ERROR, '6c. add-smart array CHARGER');
assert.equal(inputWouldWriteRetiredC(['C0001']), true, '6d. array stringifies to C');
assert.equal(retiredCAddSmartError('A'), null);
assert.equal(retiredCAddSmartError('E'), null);
assert.equal(retiredCAddSmartError('B'), null);

assert.equal(retiredCCreateError(canonicalSku('C0001')), RETIRED_CATEGORY_C_ERROR, '7. POST raw C');
assert.equal(retiredCCreateError(canonicalSku('c0001')), RETIRED_CATEGORY_C_ERROR);
assert.equal(retiredCCreateError(canonicalSku(' C0001 ')), RETIRED_CATEGORY_C_ERROR);
assert.equal(canonicalSku(['C0001']), null, '8. POST array is not a canonical SKU');
assert.equal(inputWouldWriteRetiredC(['C0001']), true, '8b. array would write C0001 if String() used');
throwsRetired(() => assertProductCreateSkuAllowed(['C0001']));
throwsRetired(() => assertProductCreateSkuAllowed('C0001'));
throwsRetired(() => assertProductCreateSkuAllowed(' c0001 '));
throwsRetired(() => assertProductCreateSkuAllowed('CHARGER'));
assert.doesNotThrow(() => assertProductCreateSkuAllowed('A0001'), '9. central guard allows non-C');
assert.doesNotThrow(() => assertProductCreateSkuAllowed('E0001'));
throwsInvalidSku(() => assertProductCreateSkuAllowed(''));
throwsInvalidSku(() => assertProductCreateSkuAllowed('   '));
throwsInvalidSku(() => assertProductCreateSkuAllowed(null));
throwsInvalidSku(() => assertProductCreateSkuAllowed(12));
throwsInvalidSku(() => assertProductCreateSkuAllowed({}));
throwsInvalidSku(() => assertProductCreateSkuAllowed(['A0001']));

assert.deepEqual(
  planRetiredCRefurbCompletion('C0001', null),
  { action: 'reject', error: RETIRED_CATEGORY_C_ERROR },
  'C complete with no matching product rejects'
);
assert.deepEqual(
  planRetiredCRefurbCompletion(' c0001 ', { id: 44, sku: 'C0001' }),
  { action: 'bump-existing', productId: 44 },
  'C complete with matching product retains id'
);
assert.deepEqual(planRetiredCRefurbCompletion('A0001', { id: 8 }), {
  action: 'not-retired-c',
});

assert.equal(
  retiredCUpdateError(canonicalSku('C0001'), canonicalSku('C0001')),
  null,
  '13. existing C unchanged allowed'
);
assert.equal(
  retiredCUpdateError(canonicalSku(' c0001 '), canonicalSku('C0001')),
  null,
  '13b. existing C lowercase/whitespace allowed'
);
assert.equal(
  retiredCUpdateError(canonicalSku('C0002'), canonicalSku('C0001')),
  RETIRED_CATEGORY_C_ERROR,
  '14. existing C → different C rejected'
);
assert.equal(
  retiredCUpdateError(canonicalSku('A0001'), canonicalSku('C0001')),
  RETIRED_CATEGORY_C_ERROR,
  '15. existing C → non-C rejected'
);
assert.equal(
  retiredCUpdateError(null, canonicalSku('C0001')),
  RETIRED_CATEGORY_C_ERROR,
  '16. existing C omitted/null rejected'
);
assert.equal(
  retiredCUpdateError(canonicalSku(''), canonicalSku('C0001')),
  RETIRED_CATEGORY_C_ERROR,
  '16b. existing C blank rejected'
);
assert.equal(
  retiredCUpdateError(canonicalSku('C0001'), canonicalSku('A0001')),
  RETIRED_CATEGORY_C_ERROR,
  '17. non-C → C rejected'
);
assert.equal(
  retiredCUpdateError(canonicalSku('A0002'), canonicalSku('A0001')),
  null,
  '18. non-C → non-C allowed'
);
assert.equal(
  retiredCUpdateError(canonicalSku('B0001'), canonicalSku('A0001')),
  null
);
assert.equal(
  retiredCCreateError(canonicalSku('CHARGER')),
  RETIRED_CATEGORY_C_ERROR,
  '21. CHARGER treated as C-prefixed'
);
assert.equal(skuHasRetiredCPrefix(canonicalSku('CHARGER')), true);

function importRowDecision(skuRaw, existingProducts) {
  const trimmed = String(skuRaw ?? '').trim();
  const found = existingProducts.find(
    (p) => String(p.sku).toUpperCase() === trimmed.toUpperCase()
  );
  if (!found) {
    const skuNorm = canonicalSku(trimmed);
    return {
      method: 'POST',
      skuNorm,
      error: retiredCCreateError(skuNorm),
    };
  }
  const skuNorm = canonicalSku(trimmed);
  return {
    method: 'PUT',
    skuNorm,
    error: retiredCUpdateError(skuNorm, canonicalSku(found.sku)),
  };
}

const csvStock = [{ id: 9, sku: 'C0001' }];
assert.deepEqual(
  importRowDecision('C0099', csvStock),
  { method: 'POST', skuNorm: 'C0099', error: RETIRED_CATEGORY_C_ERROR },
  '19. CSV new C uses POST and is rejected by the create gate'
);
assert.deepEqual(
  importRowDecision('c0001', csvStock),
  { method: 'PUT', skuNorm: 'C0001', error: null },
  '20. CSV existing C case-normalized uses PUT and is allowed'
);
assert.deepEqual(
  importRowDecision(' C0001 ', csvStock),
  { method: 'PUT', skuNorm: 'C0001', error: null },
  '20b. CSV existing C with whitespace uses PUT'
);
assert.equal(importRowDecision('A0001', csvStock).method, 'POST');
assert.equal(importRowDecision('A0001', csvStock).error, null);

console.log('--- static route/source assertions ---');

assert.ok(
  addSmartHandler.indexOf('retiredCAddSmartError') <
    addSmartHandler.indexOf('findProductsByCodePG'),
  'add-smart C gate text appears before match lookup'
);
assert.ok(
  addSmartHandler.indexOf('retiredCAddSmartError') <
    addSmartHandler.indexOf('getNextSkuForCategoryPG'),
  'add-smart C gate text appears before allocator'
);
assert.ok(
  addSmartHandler.indexOf('retiredCAddSmartError') <
    addSmartHandler.indexOf('createProductPG'),
  'add-smart C gate text appears before createProductPG'
);
assert.ok(
  addSmartHandler.indexOf('retiredCAddSmartError') <
    addSmartHandler.indexOf('adjustQtyPG'),
  'add-smart C gate text appears before quantity writes'
);
assert.match(addSmartHandler, /prefix\.startsWith\('C'\)/);
assert.match(addSmartHandler, /isRetiredCategoryCError/);
assert.match(createHandler, /typeof sku !== 'string'/);
assert.match(createHandler, /retiredCCreateError\(skuNorm\)/);
assert.ok(
  createHandler.indexOf('retiredCCreateError(skuNorm)') <
    createHandler.indexOf('createProductPG'),
  'POST validates canonical skuNorm before createProductPG'
);
assert.match(createHandler, /isRetiredCategoryCError/);
assert.match(updateHandler, /getProductByIdPG/);
assert.match(updateHandler, /retiredCUpdateError\(skuNorm, existingSkuNorm\)/);
assert.ok(
  updateHandler.indexOf('retiredCUpdateError') <
    updateHandler.indexOf('UPDATE products'),
  'PUT C decision text appears before UPDATE'
);
assert.match(updateHandler, /typeof sku !== 'string'/);
assert.match(updateHandler, /error: 'sku is required'/);

assert.ok(
  createProductFn.indexOf('assertProductCreateSkuAllowed') <
    createProductFn.indexOf('pgQuery'),
  '9. createProductPG guard text appears before pgQuery'
);
assert.match(createProductFn, /const skuInsert = canonicalSku\(sku\)/);
assert.equal(createProductFn.includes('?? sku'), false);

const createCallSites = indexSrc.split('createProductPG(').slice(1);
assert.equal(createCallSites.length, 3, '10. three createProductPG callers');
assert.match(createHandler, /isRetiredCategoryCError/);
assert.match(createHandler, /isInvalidProductSkuError/);
assert.match(addSmartHandler, /isRetiredCategoryCError/);
assert.match(addSmartHandler, /isInvalidProductSkuError/);
assert.match(refurbPutHandler, /isRetiredCategoryCError/, '10. refurb complete maps typed error');

const refurbUpdateAt = refurbPutHandler.indexOf('UPDATE refurb_items');
const beforeRefurbUpdate = refurbPutHandler.slice(0, refurbUpdateAt);
const afterRefurbUpdate = refurbPutHandler.slice(refurbUpdateAt);
assert.ok(refurbUpdateAt > 0);
assert.equal(
  (beforeRefurbUpdate.match(/getProductByCodePG/g) || []).length,
  1,
  'C completion does one product lookup before refurb UPDATE'
);
assert.match(beforeRefurbUpdate, /planRetiredCRefurbCompletion/);
assert.match(beforeRefurbUpdate, /action === 'reject'/);
assert.ok(
  beforeRefurbUpdate.indexOf('planRetiredCRefurbCompletion') < refurbUpdateAt,
  'no matching C product rejects before refurb UPDATE'
);

const retainedCStock = afterRefurbUpdate.split('if (retainedCProduct)')[1];
assert.ok(retainedCStock, 'post-update C path uses retained product');
const retainedCBranch = retainedCStock.split('} else {')[0];
assert.equal(
  retainedCBranch.includes('createProductPG'),
  false,
  'post-update C path cannot fall through to createProductPG'
);
assert.equal(retainedCBranch.includes('getProductByCodePG'), false);
assert.match(
  retainedCBranch,
  /adjustQtyPG\(retainedCProduct\.id/,
  'matching legacy C product uses retained id for quantity update'
);
assert.match(afterRefurbUpdate, /!retainedCProduct && isRetiredCategoryCError/);
assert.match(
  refurbPostHandler,
  /skuHasRetiredCPrefix\(skuNorm\) \|\| prefix\.startsWith\('C'\)/,
  '12. new refurb C SKU/prefix rejected'
);

const importSrc = read('public/import.html');
assert.match(importSrc, /String\(p\.sku\)\.toUpperCase\(\) === skuRaw\.toUpperCase\(\)/);
assert.match(importSrc, /method:'POST'/);
assert.match(importSrc, /\/api\/products\/' \+ found\.id/);
assert.equal(importSrc.includes('csvImportRetiredCError'), false);
assert.equal(importSrc.includes('BEGIN'), false);
assert.equal(indexSrc.includes('csvImportRetiredCError'), false);
assert.equal(read('src/retiredCategoryC.js').includes('csvImportRetiredCError'), false);

const inventoryAdd = read('public/inventory-add.html');
assert.equal(
  /<option\b[^>]*\bvalue\s*=\s*["']C["']/i.test(inventoryAdd),
  false,
  '22. Inventory Add markup contains no selectable value C'
);

const productsList = read('public/products-list.html');
assert.match(productsList, /data-letter="C"/, '23. products-list legacy C filter remains');
assert.match(productsList, /id="batteryHeader"/, '23b. battery column remains');

assert.match(
  indexSrc,
  /if \(prefix === "C"\) return "battery";/,
  '24. C → battery postage mapping remains'
);
assert.match(indexSrc, /battery:\s*\{\s*label:\s*"Battery"/);

assert.doesNotMatch(
  indexSrc,
  /UPDATE\s+products\s+SET\s+sku\s*=\s*'[^']*'\s*WHERE\s+sku/i
);
assert.doesNotMatch(indexSrc, /DELETE\s+FROM\s+products\s+WHERE\s+sku\s+LIKE/i);
assert.equal(/migrat/i.test(read('src/retiredCategoryC.js')), false, '25. helper has no migration');

assert.match(indexSrc, /allowedPrefixes = new Set\(\['V', 'L', 'M', 'T', 'H', 'K'\]\)/);

console.log('--- behaviour not live-tested ---');
console.log(
  'HTTP handlers were not invoked. No app listen, no pg Pool, no env file, no SQL. Route tests are source-order assertions only.'
);

console.log('retire-category-c tests passed');
