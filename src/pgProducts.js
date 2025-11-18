// src/pgProducts.js
import { pgQuery } from './pg.js';

// List all products
export async function listProductsPG() {
  const { rows } = await pgQuery(`
    SELECT
      id,
      sku,
      name,
      notes,
      on_ebay AS "onEbay",
      cost,
      retail,
      fees,
      postage,
      quantity
    FROM products
    ORDER BY sku ASC
  `);

  return rows;
}

// Get one product by id
export async function getProductByIdPG(id) {
  const { rows } = await pgQuery(
    `
    SELECT
      id,
      sku,
      name,
      notes,
      on_ebay AS "onEbay",
      cost,
      retail,
      fees,
      postage,
      quantity
    FROM products
    WHERE id = $1
    `,
    [id]
  );

  return rows[0] || null;
}

// Create a product
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
    quantity,
  } = data;

  const { rows } = await pgQuery(
    `
    INSERT INTO products
      (sku, name, notes, on_ebay, cost, retail, fees, postage, quantity)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING
      id,
      sku,
      name,
      notes,
      on_ebay AS "onEbay",
      cost,
      retail,
      fees,
      postage,
      quantity
    `,
    [sku, name, notes, on_ebay, cost, retail, fees, postage, quantity]
  );

  return rows[0];
}
