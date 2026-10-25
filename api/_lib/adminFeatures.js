/**
 * The admin dashboard sections a staff account can be granted. The owner
 * (ADMIN_PASSWORD login) always has all of them plus staff management, which is
 * never grantable. src/lib/adminFeatures.ts carries the same keys with labels
 * for the UI; tests/admin-staff.test.mjs keeps the two lists in sync.
 */
export const ADMIN_FEATURES = Object.freeze([
  'products',
  'categories',
  'inventory',
  'orders',
  'group-buys',
  'analytics',
  'hero',
  'discounts',
  'terms',
  'access-code',
  'payments',
  'shipping',
  'journey',
  'assessment',
  'guides',
  'fees',
]);

const FEATURE_SET = new Set(ADMIN_FEATURES);

/**
 * Validate a permissions payload: an array of known feature keys. Returns a
 * de-duplicated array in canonical order, or null when the input is malformed
 * or names an unknown feature.
 */
export function normalizePermissions(value) {
  if (!Array.isArray(value)) return null;
  if (!value.every((p) => typeof p === 'string' && FEATURE_SET.has(p))) return null;
  const granted = new Set(value);
  return ADMIN_FEATURES.filter((f) => granted.has(f));
}
