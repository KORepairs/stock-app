// Narrow PostgreSQL helpers for duplicate_review_decisions.
// Classification records only. Never reads or writes products.
import { pgQuery } from './pg.js';

export async function listDuplicateReviewDecisionsPG() {
  const { rows } = await pgQuery(
    `
    SELECT category, member_key, product_ids, decision, notes,
           match_key, group_id, reviewed_at, reviewed_by, updated_at
    FROM duplicate_review_decisions
    `
  );
  return rows;
}

export async function upsertDuplicateReviewDecisionPG({
  category,
  memberKey,
  productIds,
  decision,
  notes,
  matchKey,
  groupId,
  reviewedBy,
}) {
  const { rows } = await pgQuery(
    `
    INSERT INTO duplicate_review_decisions
      (category, member_key, product_ids, decision, notes,
       match_key, group_id, reviewed_at, reviewed_by, updated_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, NOW())
    ON CONFLICT (category, member_key) DO UPDATE SET
      product_ids = EXCLUDED.product_ids,
      decision = EXCLUDED.decision,
      notes = EXCLUDED.notes,
      match_key = EXCLUDED.match_key,
      group_id = EXCLUDED.group_id,
      reviewed_at = NOW(),
      reviewed_by = EXCLUDED.reviewed_by,
      updated_at = NOW()
    RETURNING category, member_key, product_ids, decision, notes,
              match_key, group_id, reviewed_at, reviewed_by, created_at, updated_at
    `,
    [
      category,
      memberKey,
      productIds,
      decision,
      notes,
      matchKey,
      groupId,
      reviewedBy,
    ]
  );
  return rows[0];
}
