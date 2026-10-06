export const NEEDS_LISTING_STATUS = 'not_listed';

/** SQL: NULL, 0 and negative INTEGER quantities all fail this comparison. */
export const NEEDS_LISTING_QUANTITY_SQL = 'quantity > 0';

export function productIsNeedsListing(row) {
  if (!row || row.ebay_status !== NEEDS_LISTING_STATUS) return false;
  if (row.quantity == null) return false;
  const qty = typeof row.quantity === 'number' ? row.quantity : Number(row.quantity);
  if (!Number.isFinite(qty)) return false;
  return qty > 0;
}

export function listNeedsListing(rows) {
  return (Array.isArray(rows) ? rows : []).filter(productIsNeedsListing);
}

export function countNeedsListing(rows) {
  return listNeedsListing(rows).length;
}

export function productsListWhere({ ebay_status } = {}) {
  const params = [];
  const conditions = [];

  if (ebay_status) {
    params.push(String(ebay_status));
    conditions.push(`ebay_status = $${params.length}`);
    if (String(ebay_status) === NEEDS_LISTING_STATUS) {
      conditions.push(NEEDS_LISTING_QUANTITY_SQL);
    }
  }

  return {
    params,
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
  };
}

export function ebayStatusCountsQuery() {
  return {
    text: `
      SELECT ebay_status, COUNT(*)::int AS count
      FROM products
      WHERE ebay_status IS DISTINCT FROM $1
         OR ${NEEDS_LISTING_QUANTITY_SQL}
      GROUP BY ebay_status
    `,
    params: [NEEDS_LISTING_STATUS],
  };
}
