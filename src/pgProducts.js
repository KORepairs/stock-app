// src/pgProducts.js
import { pgQuery } from './pg.js';


// List products (used by /api/products)
export async function listProductsPG({ ebay_status } = {}) {
  const params = [];
  let where = '';

  if (ebay_status) {
    params.push(String(ebay_status));
    where = `WHERE ebay_status = $${params.length}`;
  }

  const { rows } = await pgQuery(
    `SELECT id, sku, code, name, quantity, notes, on_ebay,
            ebay_status, ebay_notes, needs_pics,
            retail, cost, fees, postage, postage_group, battery_health,
server_cpu_1, server_cpu_2, server_ram, server_hdd
     FROM products
     ${where}
     ORDER BY sku ASC`,
    params
  );

  return rows;
}


// Get single product by id
export async function getProductByIdPG(id) {
  const { rows } = await pgQuery(
    `SELECT id, sku, code, name, quantity, notes, on_ebay,
            retail, cost, fees, postage, postage_group, battery_health,
server_cpu_1, server_cpu_2, server_ram, server_hdd
     FROM products
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Create a new product
export async function createProductPG(data) {
  const {
    sku,
    code = null,
    name,
    notes,
    on_ebay,
    ebay_status = 'not_listed',
    ebay_notes = null,
    needs_pics = 'Y',
    cost,
    retail,
    fees,
    postage,
    postage_group = null,
    quantity,
    battery_health = null,
    server_cpu_1 = null,
    server_cpu_2 = null,
    server_ram = null,
    server_hdd = null
  } = data;

  const { rows } = await pgQuery(
    `INSERT INTO products
     (sku, code, name, notes, on_ebay, ebay_status, ebay_notes, cost, retail, fees, postage, postage_group, needs_pics, battery_health, server_cpu_1, server_cpu_2, server_ram, server_hdd, quantity)
     VALUES
     ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id, sku, code, name, quantity, notes, on_ebay,
       ebay_status, ebay_notes, needs_pics,
       retail, cost, fees, postage, postage_group, battery_health,
       server_cpu_1, server_cpu_2, server_ram, server_hdd`,
    [
      sku,
      code,
      name,
      notes,
      on_ebay,
      ebay_status,
      ebay_notes,
      cost,
      retail,
      fees,
      postage,
      postage_group,
      needs_pics,
      battery_health,
      server_cpu_1,
      server_cpu_2,
      server_ram,
      server_hdd,
      quantity
    ]
  );

  return rows[0];
}

// Look up a product by scanned code OR SKU
export async function getProductByCodePG(code) {
  const codeNorm = String(code || '').trim().toUpperCase();
  if (!codeNorm) return null;

  const { rows } = await pgQuery(
    `
    SELECT *
    FROM products
    WHERE code = $1 OR sku = $1
    LIMIT 1
    `,
    [codeNorm]
  );

  return rows[0] || null;
}

// All products whose sku or code equals the identifier. Optional queryFn for transactions.
export async function findProductsBySkuOrCodePG(code, queryFn = pgQuery) {
  const codeNorm = String(code || '').trim().toUpperCase();
  if (!codeNorm) return [];

  const { rows } = await queryFn(
    `
    SELECT *
    FROM products
    WHERE code = $1 OR sku = $1
    ORDER BY id ASC
    `,
    [codeNorm]
  );

  const byId = new Map();
  for (const row of rows) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

// Increase/decrease quantity by a delta
export async function adjustQtyPG(productId, delta) {
  const { rows } = await pgQuery(
    `
    UPDATE products
    SET quantity = quantity + $1
    WHERE id = $2
    RETURNING *;
    `,
    [Number(delta) || 0, productId]
  );
  return rows[0] || null;
}

// Set quantity to an exact number
export async function setQtyPG(productId, qty) {
  const { rows } = await pgQuery(
    `
    UPDATE products
    SET quantity = $1
    WHERE id = $2
    RETURNING *;
    `,
    [Number(qty) || 0, productId]
  );
  return rows[0] || null;
}

// Insert a sale record
export async function insertSalePG(sale, queryFn = pgQuery) {
  const {
    product_id,
    sku,
    quantity,
    unit_cost,
    unit_retail,
    fees = 0,
    postage = 0,
    channel = 'manual',
    order_ref = null,
    note = null,
  } = sale;

  const { rows } = await queryFn(
    `
    INSERT INTO sales
      (product_id, sku, quantity, unit_cost, unit_retail,
       fees, postage, channel, order_ref, note)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *;
    `,
    [
      product_id,
      sku,
      quantity,
      unit_cost,
      unit_retail,
      fees,
      postage,
      channel,
      order_ref,
      note,
    ]
  );

  return rows[0] || null;
}


export async function getProductBySkuPG(code) {
  const { rows } = await pgQuery(
    'SELECT * FROM products WHERE sku = $1',
    [code]
  );
  return rows[0] || null;
}

export async function listSalesPG() {
  const { rows } = await pgQuery(`
    SELECT
      id,
      product_id,
      sku,
      quantity,
      unit_cost,
      unit_retail,
      fees,
      postage,
      channel,
      order_ref,
      note,
      created_at
    FROM sales
    ORDER BY created_at DESC
  `);

  return rows;
}


// 🔼 Stock IN helper – increase quantity for a SKU and return updated row
export async function stockInPG({ code, delta }) {
  const skuNorm = code.trim().toUpperCase();
  const qtyDelta = Number(delta) || 0;

  const { rows } = await pgQuery(
    `UPDATE products
       SET quantity = quantity + $2
     WHERE sku = $1
     RETURNING id, sku, name, quantity, notes, on_ebay,
          retail, cost, fees, postage, postage_group`,
    [skuNorm, qtyDelta]
  );

  // If no product matched that SKU, rows will be empty
  return rows[0] || null;
}

export async function getNextSkuForCategoryPG(prefix) {
  const p = String(prefix || '').trim().toUpperCase();
  if (!p) throw new Error('Category prefix required');

  const { rows } = await pgQuery(
    `
    SELECT sku
    FROM products
    WHERE sku ~ $1
    ORDER BY CAST(SUBSTRING(sku FROM 2) AS INT) DESC
    LIMIT 1
    `,
    [`^${p}[0-9]{4}$`]   // ONLY 4-digit SKUs like A0001
  );

  if (!rows.length) return `${p}0001`;

  const lastSku = rows[0].sku;        // e.g. A0001
  const lastNum = parseInt(lastSku.slice(1), 10) || 0;
  const nextNum = lastNum + 1;

  return `${p}${String(nextNum).padStart(4, '0')}`; // 4 digits
}

export async function logEbayUpdatePG({ sku, code = null, delta, oldQty, newQty, note = null }, queryFn = pgQuery) {
  const { rows } = await queryFn(
    `INSERT INTO ebay_updates (sku, code, delta, old_qty, new_qty, note)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [sku, code, Number(delta) || 0, Number(oldQty) || 0, Number(newQty) || 0, note]
  );
  return rows[0];
}

export async function listEbayUpdatesPG({ done = false } = {}) {
  const { rows } = await pgQuery(
    `SELECT * FROM ebay_updates
     WHERE done = $1
     ORDER BY created_at DESC`,
    [done]
  );
  return rows;
}

export async function setEbayUpdateDonePG(id, done) {
  const { rows } = await pgQuery(
    `UPDATE ebay_updates
     SET done = $2
     WHERE id = $1
     RETURNING *`,
    [Number(id), !!done]
  );
  return rows[0] || null;
}

// Next SKU for refurb_items table (V/M/L/H)
// Optional queryFn lets a transaction pass client.query without this helper starting a tx.
export async function getNextRefurbSkuPG(prefix, queryFn = pgQuery) {
  const p = String(prefix || '').trim().toUpperCase();
  if (!p) throw new Error('Refurb prefix required');

  const query = queryFn;
  const { rows } = await query(
    `
    SELECT sku
    FROM refurb_items
    WHERE sku ~ $1
    ORDER BY CAST(SUBSTRING(sku FROM 2) AS INT) DESC
    LIMIT 1
    `,
    [`^${p}[0-9]+$`]
  );

  if (!rows.length) return `${p}0001`;

  const lastSku = rows[0].sku;           // e.g. V0001
  const lastNum = parseInt(lastSku.slice(1), 10) || 0;
  const nextNum = lastNum + 1;

  return `${p}${String(nextNum).padStart(4, '0')}`; // 4 digits
}

export async function updateEbayStatusPG(id, { ebay_status, ebay_notes } = {}) {

  const statusText = ebay_status != null ? String(ebay_status) : null;
  const onEbay = statusText != null ? (statusText === 'listed' ? 1 : 0) : null;

  const needsPics = statusText === 'listed' ? 'N' : null;

  const { rows } = await pgQuery(
    `
    UPDATE products
    SET ebay_status = COALESCE($2, ebay_status),
        ebay_notes  = COALESCE($3, ebay_notes),
        on_ebay     = COALESCE($4, on_ebay),
        needs_pics  = COALESCE($5, needs_pics)
    WHERE id = $1
    RETURNING *
    `,
    [Number(id), statusText, ebay_notes ?? null, onEbay, needsPics]
  );

  return rows[0] || null;
}

export async function ebayStatusCountsPG() {
  const { rows } = await pgQuery(`
    SELECT ebay_status, COUNT(*)::int AS count
    FROM products
    GROUP BY ebay_status
  `);

  return rows;
}


export async function findProductsByCodePG(part) {
  const raw = String(part || "").trim().toUpperCase();
  const norm = raw.replace(/[^A-Z0-9]/g, ""); // LA-B843P -> LAB843P
  if (!norm) return [];

  const { rows } = await pgQuery(
    `
    SELECT id, sku, code, name, notes, quantity, on_ebay
    FROM products
    WHERE
      regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g') = $1
      OR regexp_replace(upper(coalesce(name,'')), '[^A-Z0-9]', '', 'g') = $1
    ORDER BY sku ASC
    `,
    [norm]
  );

  return rows;
}

export async function listDuplicateReviewProductsPG() {
  const { rows } = await pgQuery(
    `
    SELECT id, sku, code, name, notes, quantity, created_at,
           retail, cost, ebay_status
    FROM products
    ORDER BY id ASC
    `
  );
  return rows;
}

export function skuKey(value) {
  if (value == null) return null;
  const key = String(value).trim().toUpperCase();
  return key === '' ? null : key;
}

export function codeKey(value) {
  return skuKey(value);
}

export function codeCompact(value) {
  const key = codeKey(value);
  if (!key) return null;
  const compact = key.replace(/[^A-Z0-9]/g, '');
  return compact === '' ? null : compact;
}

export function nameKey(value) {
  if (value == null) return null;
  const key = String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return key === '' ? null : key;
}

export function notesKey(value) {
  if (value == null) return '';
  return String(value).trim().replace(/\s+/g, ' ').toUpperCase();
}

const DUPLICATE_CATEGORY_ORDER = [
  'exact_sku',
  'exact_part_number',
  'possible_variant',
  'cross_collision',
  'likely_part_number',
  'exact_name',
  'suspicious',
];

function displayProduct(row) {
  return {
    id: row.id,
    sku: row.sku,
    code: row.code,
    name: row.name,
    notes: row.notes,
    quantity: row.quantity,
    created_at: row.created_at,
    retail: row.retail,
    cost: row.cost,
    ebay_status: row.ebay_status,
  };
}

function sortProductsById(products) {
  return [...products].sort((a, b) => Number(a.id) - Number(b.id));
}

function uniqueById(products) {
  const byId = new Map();
  for (const product of products) {
    byId.set(product.id, product);
  }
  return sortProductsById([...byId.values()]);
}

function pushGroup(groups, category, confidence, label, matchKey, reason, products, groupId) {
  const members = uniqueById(products.map(displayProduct));
  if (category !== 'suspicious' && members.length < 2) return;
  if (category === 'suspicious' && members.length === 0) return;

  groups.push({
    id: groupId || `${category}:${matchKey}`,
    category,
    confidence,
    label,
    matchKey,
    reason,
    products: members,
  });
}

function compareMatchKeys(a, b) {
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function canonicalPairKey(idA, idB) {
  const a = Number(idA);
  const b = Number(idB);
  return a <= b ? `${a}:${b}` : `${b}:${a}`;
}

function crossCollisionReason(keys) {
  const listed = keys.join(', ');
  if (keys.length === 1) {
    return `One product’s internal SKU matches a different product’s manufacturer Part Number (${listed}). A product whose own SKU equals its own Part Number is valid and is not flagged by itself.`;
  }
  return `These products’ internal SKU and Part Number values collide on more than one identifier (${listed}). A product whose own SKU equals its own Part Number is valid and is not flagged by itself.`;
}

export function buildDuplicateReview(products) {
  const rows = Array.isArray(products) ? products : [];
  const annotated = rows.map((row) => ({
    row,
    skuKey: skuKey(row.sku),
    codeKey: codeKey(row.code),
    codeCompact: codeCompact(row.code),
    nameKey: nameKey(row.name),
    notesKey: notesKey(row.notes),
  }));

  const groups = [];

  const bySkuKey = new Map();
  const byCodeKey = new Map();
  const byCodeCompact = new Map();
  const byNameKey = new Map();

  for (const item of annotated) {
    if (item.skuKey) {
      if (!bySkuKey.has(item.skuKey)) bySkuKey.set(item.skuKey, []);
      bySkuKey.get(item.skuKey).push(item.row);
    }
    if (item.codeKey) {
      if (!byCodeKey.has(item.codeKey)) byCodeKey.set(item.codeKey, []);
      byCodeKey.get(item.codeKey).push(item.row);
    }
    if (item.codeCompact) {
      if (!byCodeCompact.has(item.codeCompact)) byCodeCompact.set(item.codeCompact, []);
      byCodeCompact.get(item.codeCompact).push(item);
    }
    if (item.nameKey) {
      if (!byNameKey.has(item.nameKey)) byNameKey.set(item.nameKey, []);
      byNameKey.get(item.nameKey).push(item.row);
    }
  }

  for (const [key, members] of bySkuKey) {
    pushGroup(
      groups,
      'exact_sku',
      'high',
      'Exact duplicate SKU',
      key,
      'These records share the same internal SKU after trimming and case normalisation. This should not normally happen.',
      members
    );
  }

  for (const [key, members] of byCodeKey) {
    if (members.length < 2) continue;
    const noteSet = new Set(
      members.map((row) => notesKey(row.notes))
    );
    if (noteSet.size === 1) {
      pushGroup(
        groups,
        'exact_part_number',
        'high',
        'Same Part Number and notes',
        key,
        'These records share the same manufacturer Part Number and the same notes. They may be duplicates, but this page does not merge them automatically.',
        members
      );
    } else {
      pushGroup(
        groups,
        'possible_variant',
        'review',
        'Same Part Number, different notes',
        key,
        'These records share the same manufacturer Part Number but have different notes. They may be intentional variants, such as the same board with a different CPU. Inspect the physical stock before treating them as duplicates.',
        members
      );
    }
  }

  const pairCollisions = new Map();
  for (const item of annotated) {
    if (!item.skuKey) continue;
    const codeHolders = byCodeKey.get(item.skuKey) || [];
    for (const other of codeHolders) {
      if (other.id === item.row.id) continue;
      const pairKey = canonicalPairKey(item.row.id, other.id);
      if (!pairCollisions.has(pairKey)) {
        pairCollisions.set(pairKey, { keys: new Set(), products: [] });
      }
      const pair = pairCollisions.get(pairKey);
      pair.keys.add(item.skuKey);
      pair.products.push(item.row, other);
    }
  }
  for (const [pairKey, pair] of pairCollisions) {
    const keys = [...pair.keys].sort(compareMatchKeys);
    pushGroup(
      groups,
      'cross_collision',
      'high',
      'SKU / Part Number collision',
      keys.join(' / '),
      crossCollisionReason(keys),
      pair.products,
      `cross_collision:${pairKey}`
    );
  }

  for (const [compact, items] of byCodeCompact) {
    const codeKeys = new Set(items.map((item) => item.codeKey).filter(Boolean));
    if (codeKeys.size < 2) continue;
    pushGroup(
      groups,
      'likely_part_number',
      'medium',
      'Part Numbers differ only by formatting',
      compact,
      'These Part Numbers become the same value after removing spaces, hyphens and punctuation, but they are stored differently. Example: LA-B843P and LAB843P.',
      items.map((item) => item.row)
    );
  }

  for (const [key, members] of byNameKey) {
    pushGroup(
      groups,
      'exact_name',
      'review',
      'Same product name',
      key,
      'These records have the same normalised product name. Generic names can create false positives, so treat this as a review list only.',
      members
    );
  }

  const blankSku = rows.filter((row) => skuKey(row.sku) == null);
  const blankCode = rows.filter((row) => codeKey(row.code) == null);
  const blankName = rows.filter((row) => row.name == null || String(row.name).trim() === '');
  const nullQty = rows.filter((row) => row.quantity == null);
  const negativeQty = rows.filter((row) => row.quantity != null && Number(row.quantity) < 0);

  pushGroup(
    groups,
    'suspicious',
    'review',
    'Missing SKU',
    'blank_sku',
    'These records have a blank or missing internal SKU.',
    blankSku
  );
  pushGroup(
    groups,
    'suspicious',
    'review',
    'Missing Part Number',
    'blank_part_number',
    'These records have a blank or missing manufacturer Part Number. Some products may legitimately have none.',
    blankCode
  );
  pushGroup(
    groups,
    'suspicious',
    'review',
    'Missing name',
    'blank_name',
    'These records have a blank or missing product name.',
    blankName
  );
  pushGroup(
    groups,
    'suspicious',
    'review',
    'NULL quantity',
    'null_quantity',
    'These records have a NULL quantity.',
    nullQty
  );
  pushGroup(
    groups,
    'suspicious',
    'review',
    'Negative quantity',
    'negative_quantity',
    'These records have a negative quantity.',
    negativeQty
  );

  const categoryRank = new Map(DUPLICATE_CATEGORY_ORDER.map((name, index) => [name, index]));
  groups.sort((a, b) => {
    const rank = (categoryRank.get(a.category) ?? 99) - (categoryRank.get(b.category) ?? 99);
    if (rank !== 0) return rank;
    const keyCmp = compareMatchKeys(a.matchKey, b.matchKey);
    if (keyCmp !== 0) return keyCmp;
    return String(a.id).localeCompare(String(b.id), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });

  const byCategory = {
    exact_sku: 0,
    exact_part_number: 0,
    cross_collision: 0,
    likely_part_number: 0,
    possible_variant: 0,
    exact_name: 0,
    suspicious: 0,
  };
  for (const group of groups) {
    if (Object.prototype.hasOwnProperty.call(byCategory, group.category)) {
      byCategory[group.category] += 1;
    }
  }

  return {
    summary: {
      productCount: rows.length,
      groupCount: groups.length,
      byCategory,
    },
    groups,
  };
}






