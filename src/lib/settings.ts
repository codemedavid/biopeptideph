// Boundary parsing for `site_settings` values.
//
// Every row in that table stores its value as text, so each numeric setting has
// to be parsed on the way in. Doing that with a bare parseFloat lets a single
// malformed row poison arithmetic far away from here: parseFloat('₱64') is NaN,
// and NaN survives the `?? DEFAULT` guard every consumer uses, because `??`
// only catches null and undefined. A checkout total rendered as "$NaN" is the
// symptom; this module is the fix, applied once at the boundary.

// Fallbacks used when the corresponding row is missing or unreadable. They live
// here rather than as repeated literals at each call site so the storefront,
// the checkout and the admin order list cannot disagree about the default.
export const DEFAULT_ADMIN_FEE_PHP = 150;
export const DEFAULT_ADMIN_FEE_USD = 3;

/**
 * A numeric `site_settings` value, or `fallback` when the stored value is not a
 * usable number.
 *
 * Stricter than parseFloat on purpose: a partially numeric value like '64abc'
 * is a corrupt row, not a rate of 64, so it falls back rather than silently
 * truncating. Zero is a legitimate value (a waived fee, a 0% discount) and is
 * kept; negative and non-finite values are not.
 */
export function parseNumericSetting(raw: unknown, fallback: number): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') return fallback;

  // Number('') is 0 and Number(' ') is 0, so blank rows must be rejected first.
  if (typeof raw === 'string' && raw.trim() === '') return fallback;

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
