import { pgQuery } from './pg.js';

// --- Products CRUD for Postgres ---

export async function listProductsPG() {
  const result = await pgQuery(`SELECT * FROM products ORDER BY sku ASC`);
  return result.rows;
}

export async function getProductByIdPG(id) {
  const result = await pgQuery(`SELECT * FROM products WHERE id = $1`, [id]);
  return result.rows[0];
}

export async function createProductPG(product) {
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
  } = product;

  const result = await pgQuery(
    `INSERT INTO products
       (sku, name, notes, on_ebay, cost, retail, fees, postage, quantity)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [sku, name, notes, on_ebay, cost, retail, fees, postage, quantity]
  );

  return result.rows[0];
}


export async function createProductPG(product) {
  const {
    sku, name, notes, on_ebay, cost, retail, fees, postage, quantity
  } = product;

  const result = await pgQuery(
    `INSERT INTO products (sku, name, notes, on_ebay, cost, retail, fees, postage, quantity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [sku, name, notes, on_ebay, cost, retail, fees, postage, quantity]
  );

  return result.rows[0];
}
