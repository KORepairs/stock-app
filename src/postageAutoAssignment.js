export const POSTAGE_GROUPS = {
  large_letter: { label: 'Large Letter', price: 1.84 },
  large_letter_tracked: { label: 'Large Letter Tracked', price: 3.8 },
  small_parcel: { label: 'Small Parcel', price: 4.65 },
  courier: { label: 'Courier', price: 8.0 },
  server: { label: 'Server', price: 15.0 },
  battery: { label: 'Battery', price: 3.0 },
};

export const AUTO_POSTAGE_STATUSES = ['ready_to_list', 'listed'];

const AUTO_POSTAGE_STATUS_SET = new Set(AUTO_POSTAGE_STATUSES);

export function isAutoPostageStatus(status) {
  return AUTO_POSTAGE_STATUS_SET.has(String(status || ''));
}

export function getPostagePrice(postageGroup) {
  const key = String(postageGroup || '').trim();
  const group = POSTAGE_GROUPS[key];
  if (!group) return 0;
  const price = Number(group.price);
  return Number.isFinite(price) ? price : 0;
}

export function normalizePostageGroup(value) {
  if (value == null) return null;
  const norm = String(value).trim();
  return norm === '' ? null : norm;
}

export function parsePostageAmount(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isPositivePostage(value) {
  const n = parsePostageAmount(value);
  return n != null && n > 0;
}

export function isPostageAssigned(postage_group, postage) {
  return Boolean(normalizePostageGroup(postage_group)) || isPositivePostage(postage);
}

export function postageTriggerMatches({ retail, ebay_status } = {}) {
  const retailN = Number(retail);
  if (!Number.isFinite(retailN) || retailN <= 0) return false;
  return isAutoPostageStatus(ebay_status);
}

export function autoPostageGroup(sku, price = 0) {
  if (!sku) return null;

  const prefix = String(sku).trim().toUpperCase()[0];
  const retailN = Number(price);

  if (prefix === 'C') return 'battery';
  if (prefix === 'E') return 'server';
  if (['A', 'B', 'D'].includes(prefix)) return 'small_parcel';
  if (prefix === 'F') {
    return Number.isFinite(retailN) && retailN >= 20
      ? 'large_letter_tracked'
      : 'large_letter';
  }
  if (prefix === 'S' || prefix === 'P') return 'small_parcel';
  if (prefix === 'R' || prefix === 'G') return 'large_letter';

  return null;
}

export function resolvePostageAssignment({
  sku,
  retail,
  ebay_status,
  postage_group,
  postage,
} = {}) {
  const group = normalizePostageGroup(postage_group);
  const amount = parsePostageAmount(postage);
  const postageOut = amount == null ? 0 : amount;

  if (isPostageAssigned(group, amount)) {
    return {
      postage_group: group,
      postage: postageOut,
      assigned: true,
      autoFilled: false,
    };
  }

  if (!postageTriggerMatches({ retail, ebay_status })) {
    return {
      postage_group: null,
      postage: postageOut,
      assigned: false,
      autoFilled: false,
    };
  }

  const autoGroup = autoPostageGroup(sku, retail);
  if (!autoGroup) {
    return {
      postage_group: null,
      postage: 0,
      assigned: false,
      autoFilled: false,
    };
  }

  return {
    postage_group: autoGroup,
    postage: getPostagePrice(autoGroup),
    assigned: true,
    autoFilled: true,
  };
}

export function combinePostageFromUpdate({ existing = {}, body = {} } = {}) {
  const groupProvided = Object.prototype.hasOwnProperty.call(body, 'postage_group');
  const postageProvided = Object.prototype.hasOwnProperty.call(body, 'postage');

  const existingGroup = normalizePostageGroup(existing.postage_group);
  const existingPostage = parsePostageAmount(existing.postage);
  const existingAssigned = isPostageAssigned(existingGroup, existingPostage);

  let postage_group = groupProvided
    ? normalizePostageGroup(body.postage_group)
    : existingGroup;

  let postage;
  if (postageProvided) {
    const parsed = parsePostageAmount(body.postage);
    postage = parsed == null ? 0 : parsed;
  } else {
    postage = existingPostage == null ? 0 : existingPostage;
  }

  // CSV-style: omitted group + postage 0/blank must not clear a stored assignment.
  if (!groupProvided && postageProvided && !isPositivePostage(body.postage) && existingAssigned) {
    postage_group = existingGroup;
    postage = existingPostage == null ? 0 : existingPostage;
  }

  return { postage_group, postage };
}

export function planEbayStatusPostage(existing, ebay_status) {
  const snapshotSku = existing == null ? null : existing.sku;
  const snapshotRetail = existing == null ? null : existing.retail;
  const emptyPlan = {
    applyPostage: false,
    postage: null,
    postage_group: null,
    snapshotSku,
    snapshotRetail,
  };

  if (!ebay_status || !isAutoPostageStatus(ebay_status)) {
    return emptyPlan;
  }

  const resolved = resolvePostageAssignment({
    sku: existing?.sku,
    retail: existing?.retail,
    ebay_status: String(ebay_status),
    postage_group: existing?.postage_group,
    postage: existing?.postage,
  });

  if (!resolved.autoFilled) {
    return emptyPlan;
  }

  return {
    applyPostage: true,
    postage: resolved.postage,
    postage_group: resolved.postage_group,
    snapshotSku,
    snapshotRetail,
  };
}

export function isNullSafeEqual(left, right) {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return Object.is(left, right) || left === right;
}

export function isDbPostageUnassigned(postage_group, postage) {
  const group = postage_group == null ? '' : String(postage_group).trim();
  if (group !== '') return false;
  if (postage == null || postage === '') return true;
  const n = Number(postage);
  if (!Number.isFinite(n)) return true;
  return n <= 0;
}

export function shouldApplyAutoPostageOnRow(row = {}, plan = {}) {
  if (!plan.applyPostage) return false;
  if (!isDbPostageUnassigned(row.postage_group, row.postage)) return false;
  if (!isNullSafeEqual(row.sku, plan.snapshotSku)) return false;
  if (!isNullSafeEqual(row.retail, plan.snapshotRetail)) return false;
  return true;
}

export const POSTAGE_AUTOFILL_SQL_PREDICATE = `(
  $6::boolean
  AND (postage_group IS NULL OR BTRIM(postage_group) = '')
  AND (postage IS NULL OR postage <= 0)
  AND sku IS NOT DISTINCT FROM $9
  AND retail IS NOT DISTINCT FROM $10
)`;

