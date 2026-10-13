export const RETIRED_CATEGORY_C_ERROR = 'Category C is retired';
export const RETIRED_CATEGORY_C_CODE = 'RETIRED_CATEGORY_C';
export const INVALID_PRODUCT_SKU_ERROR = 'sku is required';
export const INVALID_PRODUCT_SKU_CODE = 'INVALID_PRODUCT_SKU';

export class RetiredCategoryCError extends Error {
  constructor() {
    super(RETIRED_CATEGORY_C_ERROR);
    this.name = 'RetiredCategoryCError';
    this.code = RETIRED_CATEGORY_C_CODE;
  }
}

export class InvalidProductSkuError extends Error {
  constructor() {
    super(INVALID_PRODUCT_SKU_ERROR);
    this.name = 'InvalidProductSkuError';
    this.code = INVALID_PRODUCT_SKU_CODE;
  }
}

export function isRetiredCategoryCError(err) {
  return Boolean(
    err &&
      (err instanceof RetiredCategoryCError ||
        err.code === RETIRED_CATEGORY_C_CODE)
  );
}

export function isInvalidProductSkuError(err) {
  return Boolean(
    err &&
      (err instanceof InvalidProductSkuError ||
        err.code === INVALID_PRODUCT_SKU_CODE)
  );
}

export function canonicalSku(value) {
  if (typeof value !== 'string') return null;
  const norm = value.trim().toUpperCase();
  return norm || null;
}

function coercedWrittenSku(value) {
  if (value == null) return '';
  return String(value).trim().toUpperCase();
}

export function skuHasRetiredCPrefix(value) {
  const canonical = canonicalSku(value);
  if (canonical) return canonical.charAt(0) === 'C';
  if (typeof value !== 'string' && value != null) {
    return coercedWrittenSku(value).charAt(0) === 'C';
  }
  return false;
}

export function inputWouldWriteRetiredC(value) {
  return skuHasRetiredCPrefix(value);
}

export function retiredCCreateError(value) {
  return skuHasRetiredCPrefix(value) ? RETIRED_CATEGORY_C_ERROR : null;
}

export function retiredCUpdateError(submittedCanonical, existingCanonical) {
  if (skuHasRetiredCPrefix(existingCanonical)) {
    if (submittedCanonical && submittedCanonical === existingCanonical) {
      return null;
    }
    return RETIRED_CATEGORY_C_ERROR;
  }
  return skuHasRetiredCPrefix(submittedCanonical)
    ? RETIRED_CATEGORY_C_ERROR
    : null;
}

export function retiredCAddSmartError(category) {
  if (typeof category === 'string') {
    return category.trim().toUpperCase().startsWith('C')
      ? RETIRED_CATEGORY_C_ERROR
      : null;
  }
  if (category == null) return null;
  return coercedWrittenSku(category).startsWith('C')
    ? RETIRED_CATEGORY_C_ERROR
    : null;
}

export function assertProductCreateSkuAllowed(sku) {
  if (skuHasRetiredCPrefix(sku)) {
    throw new RetiredCategoryCError();
  }
  if (!canonicalSku(sku)) {
    throw new InvalidProductSkuError();
  }
}

export function planRetiredCRefurbCompletion(sku, existingProduct) {
  if (!skuHasRetiredCPrefix(sku)) {
    return { action: 'not-retired-c' };
  }
  if (!existingProduct || existingProduct.id == null) {
    return { action: 'reject', error: RETIRED_CATEGORY_C_ERROR };
  }
  return { action: 'bump-existing', productId: existingProduct.id };
}
