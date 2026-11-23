// Category S motherboard identity for Inventory Add / add-smart.
// Comparison helpers only. No PostgreSQL access.
// Surrounding whitespace for Notes and SKU-prefix identity is exactly:
// space, tab, LF, CR, form feed, vertical tab. Not Unicode String#trim().

export const CATEGORY_S_PREFIX = 'S';

export const INVALID_NOTES_ERROR = 'Invalid notes';
export const AMBIGUOUS_S_IDENTITY_ERROR =
  'Multiple Category S products share this part number and notes';
export const S_IDENTITY_CONFLICT_ERROR =
  'A Category S product with this part number and notes already exists';
export const PART_NUMBER_IN_USE_ERROR =
  'Part Number is already used by another product';
export const PART_NUMBER_REQUIRED_ERROR = 'part number (code) is required';
export const RETIRED_CODE_INDEX_INIT_ERROR =
  'Retired products_code_uq is present. Run the manual products-code-index migration.';
export const MIXED_CODE_INDEX_INIT_ERROR =
  'products code indexes are in an unexpected state. No automatic repair was attempted.';
export const VERIFY_CODE_INDEX_INIT_ERROR =
  'products code indexes could not be verified. No automatic repair was attempted.';

export const PRODUCTS_CODE_UQ = 'products_code_uq';
export const PRODUCTS_CODE_NON_S_UQ = 'products_code_non_s_uq';
export const PRODUCTS_S_CODE_NOTES_UQ = 'products_s_code_notes_uq';

// Actual characters: space, tab, LF, CR, FF, VT.
export const IDENTITY_EDGE_CHARS = ' \t\n\r\f\v';
const IDENTITY_EDGE_SET = new Set([...IDENTITY_EDGE_CHARS]);

// CHR(9)=tab CHR(10)=LF CHR(13)=CR CHR(12)=FF CHR(11)=VT
export const IDENTITY_EDGE_WHITESPACE_SQL =
  "(' ' || CHR(9) || CHR(10) || CHR(13) || CHR(12) || CHR(11))";

export const CANONICAL_CODE_SQL =
  `regexp_replace(UPPER(BTRIM(code, ${IDENTITY_EDGE_WHITESPACE_SQL})), '[^A-Z0-9]', '', 'g')`;
export const CANONICAL_NOTES_SQL =
  `UPPER(BTRIM(COALESCE(notes, ''), ${IDENTITY_EDGE_WHITESPACE_SQL}))`;
export const SKU_PREFIX_SQL =
  `LEFT(UPPER(BTRIM(COALESCE(sku, ''), ${IDENTITY_EDGE_WHITESPACE_SQL})), 1)`;

export const OLD_CODE_INDEX_PREDICATE_SQL = 'code IS NOT NULL';
export const NON_S_CODE_INDEX_PREDICATE_SQL =
  `code IS NOT NULL AND ${SKU_PREFIX_SQL} <> 'S'`;
export const S_CODE_NOTES_INDEX_PREDICATE_SQL =
  `code IS NOT NULL AND ${SKU_PREFIX_SQL} = 'S'`;

export const CREATE_PRODUCTS_CODE_NON_S_UQ_SQL =
  `CREATE UNIQUE INDEX ${PRODUCTS_CODE_NON_S_UQ} ON products (code)` +
  ` WHERE ${NON_S_CODE_INDEX_PREDICATE_SQL}`;

export const CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL =
  `CREATE UNIQUE INDEX ${PRODUCTS_S_CODE_NOTES_UQ} ON products` +
  ` (${CANONICAL_CODE_SQL}, ${CANONICAL_NOTES_SQL})` +
  ` WHERE ${S_CODE_NOTES_INDEX_PREDICATE_SQL}`;

export const MIGRATE_CREATE_PRODUCTS_CODE_NON_S_UQ_SQL =
  `CREATE UNIQUE INDEX ${PRODUCTS_CODE_NON_S_UQ} ON public.products (code)` +
  ` WHERE ${NON_S_CODE_INDEX_PREDICATE_SQL}`;

export const MIGRATE_CREATE_PRODUCTS_S_CODE_NOTES_UQ_SQL =
  `CREATE UNIQUE INDEX ${PRODUCTS_S_CODE_NOTES_UQ} ON public.products` +
  ` (${CANONICAL_CODE_SQL}, ${CANONICAL_NOTES_SQL})` +
  ` WHERE ${S_CODE_NOTES_INDEX_PREDICATE_SQL}`;

export const MIGRATE_DROP_PRODUCTS_CODE_UQ_SQL =
  `DROP INDEX public.${PRODUCTS_CODE_UQ}`;

export const LOCK_PRODUCTS_SQL =
  'LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE';

export function stripIdentityEdges(value) {
  let text = String(value);
  while (text.length > 0 && IDENTITY_EDGE_SET.has(text[0])) {
    text = text.slice(1);
  }
  while (text.length > 0 && IDENTITY_EDGE_SET.has(text[text.length - 1])) {
    text = text.slice(0, -1);
  }
  return text;
}

export function canonicalPartNumber(value) {
  if (value == null) return null;
  const raw = stripIdentityEdges(String(value)).toUpperCase();
  const norm = raw.replace(/[^A-Z0-9]/g, '');
  return norm === '' ? null : norm;
}

export function canonicalNotesIdentity(notes) {
  if (notes == null) return { ok: true, identity: '' };
  if (typeof notes !== 'string') {
    return { ok: false, error: INVALID_NOTES_ERROR };
  }
  return { ok: true, identity: stripIdentityEdges(notes).toUpperCase() };
}

export function notesForStorage(notes) {
  if (notes == null) return null;
  if (typeof notes !== 'string') return null;
  const stripped = stripIdentityEdges(notes);
  return stripped === '' ? null : stripped;
}

export function skuHasCategorySPrefix(sku) {
  return stripIdentityEdges(String(sku ?? '')).toUpperCase().charAt(0) === CATEGORY_S_PREFIX;
}

export function sqlCanonicalPartNumber(value) {
  if (value == null) return '';
  return stripIdentityEdges(String(value)).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function sqlCanonicalNotes(value) {
  if (value == null) return '';
  return stripIdentityEdges(String(value)).toUpperCase();
}

export function sqlSkuPrefix(value) {
  return stripIdentityEdges(String(value ?? '')).toUpperCase().charAt(0);
}

export function filterCategorySIdentityMatches(matches, canonicalCode, notesIdentity) {
  if (!canonicalCode) return [];
  const rows = Array.isArray(matches) ? matches : [];
  return rows.filter((row) => {
    if (!skuHasCategorySPrefix(row?.sku)) return false;
    if (canonicalPartNumber(row?.code) !== canonicalCode) return false;
    const storedNotes = row?.notes == null ? null : row.notes;
    const stored = canonicalNotesIdentity(storedNotes);
    if (!stored.ok) return false;
    return stored.identity === notesIdentity;
  });
}

export function planCategorySAddSmart({ prefix, code, notes, matches } = {}) {
  if (prefix !== CATEGORY_S_PREFIX) return { kind: 'not_s' };

  const notesResult = canonicalNotesIdentity(notes);
  if (!notesResult.ok) {
    return { kind: 'invalid_notes', error: INVALID_NOTES_ERROR };
  }

  const canonicalCode = canonicalPartNumber(code);
  if (!canonicalCode) {
    return { kind: 'invalid_code', error: PART_NUMBER_REQUIRED_ERROR };
  }

  const selected = filterCategorySIdentityMatches(
    matches,
    canonicalCode,
    notesResult.identity
  );

  if (selected.length > 1) {
    return { kind: 'ambiguous', error: AMBIGUOUS_S_IDENTITY_ERROR };
  }
  if (selected.length === 1) {
    return { kind: 'increment', product: selected[0] };
  }
  return { kind: 'create', notes: notesForStorage(notes) };
}

export function sIdentityKeysConflict(left, right) {
  if (!skuHasCategorySPrefix(left?.sku) || !skuHasCategorySPrefix(right?.sku)) {
    return false;
  }
  const leftCode = canonicalPartNumber(left?.code);
  const rightCode = canonicalPartNumber(right?.code);
  if (!leftCode || leftCode !== rightCode) return false;
  const leftNotes = canonicalNotesIdentity(left?.notes == null ? null : left.notes);
  const rightNotes = canonicalNotesIdentity(right?.notes == null ? null : right.notes);
  if (!leftNotes.ok || !rightNotes.ok) return false;
  return leftNotes.identity === rightNotes.identity;
}

export function nonSStoredCodesConflict(left, right) {
  if (skuHasCategorySPrefix(left?.sku) || skuHasCategorySPrefix(right?.sku)) {
    return false;
  }
  const leftCode = left?.code;
  const rightCode = right?.code;
  if (leftCode == null || rightCode == null) return false;
  return String(leftCode) === String(rightCode);
}

export function uniqueViolationError(constraint) {
  const name = String(constraint || '');
  if (name === PRODUCTS_S_CODE_NOTES_UQ) return S_IDENTITY_CONFLICT_ERROR;
  if (name === PRODUCTS_CODE_UQ || name === PRODUCTS_CODE_NON_S_UQ) {
    return PART_NUMBER_IN_USE_ERROR;
  }
  return null;
}
