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
            ebay_status, ebay_notes,
            retail, cost, fees, postage
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
            retail, cost, fees, postage
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
  cost,
  retail,
  fees,
  postage,
  quantity
} = data;


  const { rows } = await pgQuery(
  `INSERT INTO products
     (sku, code, name, notes, on_ebay, ebay_status, ebay_notes, cost, retail, fees, postage, quantity)
   VALUES
     ($1,  $2,   $3,   $4,   $5,      $6,          $7,         $8,   $9,     $10,  $11,     $12)
   RETURNING id, sku, code, name, quantity, notes, on_ebay,
             ebay_status, ebay_notes,
             retail, cost, fees, postage`,
  [sku, code, name, notes, on_ebay, ebay_status, ebay_notes, cost, retail, fees, postage, quantity]
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
export async function insertSalePG(sale) {
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

  const { rows } = await pgQuery(
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
               retail, cost, fees, postage`,
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

export async function logEbayUpdatePG({ sku, code = null, delta, oldQty, newQty, note = null }) {
  const { rows } = await pgQuery(
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
export async function getNextRefurbSkuPG(prefix) {
  const p = String(prefix || '').trim().toUpperCase();
  if (!p) throw new Error('Refurb prefix required');

  const { rows } = await pgQuery(
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
  const { rows } = await pgQuery(
    `
    UPDATE products
    SET ebay_status = COALESCE($2, ebay_status),
        ebay_notes  = COALESCE($3, ebay_notes)
    WHERE id = $1
    RETURNING id, sku, code, name, quantity, notes, on_ebay,
              ebay_status, ebay_notes,
              retail, cost, fees, postage;
    `,
    [Number(id), ebay_status ?? null, ebay_notes ?? null]
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

export async function findProductsByCodePG(code) {
  const codeNorm = String(code || '').trim().toUpperCase();
  if (!codeNorm) return [];

  const { rows } = await pgQuery(
    `
    SELECT id, sku, code, name, notes, quantity, on_ebay, ebay_status
    FROM products
    WHERE code = $1
       OR sku  = $1
    ORDER BY sku ASC
    `,
    [codeNorm]
  );

  return rows;
}







