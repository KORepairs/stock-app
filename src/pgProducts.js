// src/pgProducts.js
import { pgQuery } from './pg.js';

// List products (used by /api/products)
export async function listProductsPG() {
  const { rows } = await pgQuery(
    `SELECT id, sku, code, name, quantity, notes, on_ebay,
            retail, cost, fees, postage
     FROM products
     ORDER BY sku ASC`
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
    cost,
    retail,
    fees,
    postage,
    quantity
  } = data;

  const { rows } = await pgQuery(
  `INSERT INTO products
     (sku, code, name, notes, on_ebay, cost, retail, fees, postage, quantity)
   VALUES
     ($1,  $2,   $3,   $4,   $5,      $6,   $7,     $8,   $9,      $10)
   RETURNING id, sku, code, name, quantity, notes, on_ebay,
             retail, cost, fees, postage`,
  [sku, code, name, notes, on_ebay, cost, retail, fees, postage, quantity]
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



