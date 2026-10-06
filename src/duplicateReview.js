// Pure duplicate-review decision helpers. No PostgreSQL access.

export const DUPLICATE_REVIEW_CATEGORIES = [
  'exact_sku',
  'exact_part_number',
  'possible_variant',
  'cross_collision',
  'likely_part_number',
  'exact_name',
  'suspicious',
];

export const DUPLICATE_REVIEW_DECISIONS = [
  'needs_physical_check',
  'confirmed_duplicate',
  'valid_variant',
  'keep_separate',
];

export const MAX_DECISION_PRODUCT_IDS = 5000;
export const MAX_DECISION_NOTES_LENGTH = 2000;

export const STALE_REVIEW_GROUP_ERROR =
  'This review group has changed. Reload and review it again.';

const CATEGORY_SET = new Set(DUPLICATE_REVIEW_CATEGORIES);
const DECISION_SET = new Set(DUPLICATE_REVIEW_DECISIONS);
const BODY_KEYS = new Set(['category', 'productIds', 'decision', 'notes']);

export function isPositiveSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

export function canonicalProductIds(ids) {
  const seen = new Set();
  const unique = [];
  for (const value of Array.isArray(ids) ? ids : []) {
    const id = Number(value);
    if (!Number.isSafeInteger(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  unique.sort((a, b) => a - b);
  return unique;
}

export function productIdsFromGroupMembers(products) {
  return canonicalProductIds((Array.isArray(products) ? products : []).map((row) => row?.id));
}

export function memberKeyFromProductIds(productIds) {
  return (Array.isArray(productIds) ? productIds : []).join(',');
}

export function decisionLookupKey(category, memberKey) {
  return `${category}\0${memberKey}`;
}

function toIso(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function formatPublicDecision(row) {
  if (!row) return null;
  return {
    decision: row.decision,
    notes: row.notes == null || row.notes === '' ? null : String(row.notes),
    reviewedAt: toIso(row.reviewed_at ?? row.reviewedAt),
    reviewedBy: row.reviewed_by == null ? null : String(row.reviewed_by),
    updatedAt: toIso(row.updated_at ?? row.updatedAt),
  };
}

export function decisionSummaryCounts(groups) {
  const counts = {
    unreviewed: 0,
    needs_physical_check: 0,
    confirmed_duplicate: 0,
    valid_variant: 0,
    keep_separate: 0,
  };
  for (const group of Array.isArray(groups) ? groups : []) {
    const decision = group?.decision?.decision;
    if (decision && Object.prototype.hasOwnProperty.call(counts, decision)) {
      counts[decision] += 1;
    } else {
      counts.unreviewed += 1;
    }
  }
  return counts;
}

export function attachDecisionsToReview(review, decisionRows) {
  const groups = Array.isArray(review?.groups) ? review.groups : [];
  const byKey = new Map();
  for (const row of Array.isArray(decisionRows) ? decisionRows : []) {
    if (!row || !CATEGORY_SET.has(row.category) || typeof row.member_key !== 'string') continue;
    byKey.set(decisionLookupKey(row.category, row.member_key), row);
  }

  const attached = groups.map((group) => {
    const row = byKey.get(decisionLookupKey(group.category, group.memberKey));
    return {
      ...group,
      decision: row ? formatPublicDecision(row) : null,
    };
  });

  const summary = review?.summary && typeof review.summary === 'object' ? { ...review.summary } : {};
  summary.groupCount = attached.length;
  summary.byDecision = decisionSummaryCounts(attached);

  return {
    ...review,
    summary,
    groups: attached,
  };
}

export function deriveReviewedBy(username) {
  const name = typeof username === 'string' ? username.trim() : '';
  return name || 'unknown';
}

export function reviewedByFromRequest(req) {
  return deriveReviewedBy(req && req.authenticatedBasicUser);
}

export function establishBasicAuthIdentity(configuredUser, configuredPass, creds) {
  const user = typeof configuredUser === 'string' ? configuredUser : '';
  const pass = typeof configuredPass === 'string' ? configuredPass : '';
  if (!user || !pass) {
    return { allow: true, authenticatedBasicUser: undefined };
  }
  if (creds && creds.name === user && creds.pass === pass) {
    return { allow: true, authenticatedBasicUser: user };
  }
  return { allow: false, authenticatedBasicUser: undefined };
}

export function validateDecisionBody(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body' };
  }

  for (const key of Object.keys(body)) {
    if (!BODY_KEYS.has(key)) {
      return { ok: false, error: 'Invalid request body' };
    }
  }

  if (
    !Object.prototype.hasOwnProperty.call(body, 'category') ||
    !Object.prototype.hasOwnProperty.call(body, 'productIds') ||
    !Object.prototype.hasOwnProperty.call(body, 'decision') ||
    !Object.prototype.hasOwnProperty.call(body, 'notes')
  ) {
    return { ok: false, error: 'Invalid request body' };
  }

  if (typeof body.category !== 'string' || !CATEGORY_SET.has(body.category)) {
    return { ok: false, error: 'Invalid category' };
  }

  if (typeof body.decision !== 'string' || !DECISION_SET.has(body.decision)) {
    return { ok: false, error: 'Invalid decision' };
  }

  const notesResult = normaliseNotes(body.notes);
  if (!notesResult.ok) return notesResult;

  const idsResult = validateProductIds(body.productIds);
  if (!idsResult.ok) return idsResult;

  const productIds = idsResult.productIds;
  return {
    ok: true,
    value: {
      category: body.category,
      productIds,
      memberKey: memberKeyFromProductIds(productIds),
      decision: body.decision,
      notes: notesResult.notes,
    },
  };
}

export function validateProductIds(productIds) {
  if (!Array.isArray(productIds)) {
    return { ok: false, error: 'Invalid productIds' };
  }
  if (productIds.length < 1 || productIds.length > MAX_DECISION_PRODUCT_IDS) {
    return { ok: false, error: 'Invalid productIds' };
  }

  const seen = new Set();
  const ids = [];
  for (const value of productIds) {
    if (!isPositiveSafeInteger(value)) {
      return { ok: false, error: 'Invalid productIds' };
    }
    if (seen.has(value)) {
      return { ok: false, error: 'Invalid productIds' };
    }
    seen.add(value);
    ids.push(value);
  }

  ids.sort((a, b) => a - b);
  return { ok: true, productIds: ids };
}

export function normaliseNotes(notes) {
  if (notes == null) {
    return { ok: true, notes: null };
  }
  if (typeof notes !== 'string') {
    return { ok: false, error: 'Invalid notes' };
  }
  if (notes.length > MAX_DECISION_NOTES_LENGTH) {
    return { ok: false, error: 'Invalid notes' };
  }
  const trimmed = notes.trim();
  return { ok: true, notes: trimmed === '' ? null : trimmed };
}

export function findCurrentReviewGroup(groups, category, memberKey) {
  if (!Array.isArray(groups)) return null;
  for (const group of groups) {
    if (group && group.category === category && group.memberKey === memberKey) {
      return group;
    }
  }
  return null;
}

export function prepareDecisionSave(groups, validated) {
  const group = findCurrentReviewGroup(groups, validated.category, validated.memberKey);
  if (!group) {
    return { ok: false, status: 409, error: STALE_REVIEW_GROUP_ERROR };
  }

  const productIds = canonicalProductIds(
    Array.isArray(group.productIds) && group.productIds.length
      ? group.productIds
      : productIdsFromGroupMembers(group.products)
  );

  return {
    ok: true,
    record: {
      category: group.category,
      memberKey: group.memberKey,
      productIds,
      decision: validated.decision,
      notes: validated.notes,
      matchKey: group.matchKey ?? null,
      groupId: group.id ?? null,
    },
  };
}

export function resolveDecisionSave(groups, body) {
  const validated = validateDecisionBody(body);
  if (!validated.ok) {
    return { ok: false, status: 400, error: validated.error };
  }
  const prepared = prepareDecisionSave(groups, validated.value);
  if (!prepared.ok) {
    return { ok: false, status: prepared.status, error: prepared.error };
  }
  return { ok: true, record: prepared.record };
}

export function formatDecisionSaveResponse(row) {
  const productIds = canonicalProductIds(row?.product_ids);
  return {
    category: row.category,
    memberKey: row.member_key,
    productIds,
    decision: formatPublicDecision(row),
  };
}
