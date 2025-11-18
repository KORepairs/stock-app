// src/pgProducts.js
import { pgQuery } from './pg.js';

// List products (used by /api/products)
export async function listProductsPG() {
  const { rows } = await pgQuery(
    `SELECT id, sku, name, quantity, notes, on_ebay,
            retail, cost, fees, postage
     FROM products
     ORDER BY sku ASC`
  );
  return rows;
}

// Get single product by id
export async function getProductByIdPG(id) {
  const { rows } = await pgQuery(
    `SELECT id, sku, name, quantity, notes, on_ebay,
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
       (sku, name, notes, on_ebay, cost, retail, fees, postage, quantity)
     VALUES
       ($1,  $2,   $3,   $4,      $5,   $6,     $7,   $8,      $9)
     RETURNING id, sku, name, quantity, notes, on_ebay,
               retail, cost, fees, postage`,
    [sku, name, notes, on_ebay, cost, retail, fees, postage, quantity]
  );

  return rows[0];
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
