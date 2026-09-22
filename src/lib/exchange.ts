// Single source of truth for PHP <-> USD conversion.
//
// Every place that writes a price (the product form, the size/variation manager,
// and the bulk "PHP -> USD" / "USD -> PHP" admin tools) converts through these
// helpers using the admin-set rate stored in `site_settings.usd_php_rate`
// (₱ per $1). Because USD is always *derived* from PHP at save time, the two
// currencies can never drift out of sync — the admin only ever enters the PHP
// price plus the one exchange rate, never a per-product USD figure.

import { round2 } from './pricing.ts';

// Fallback used only when no rate has been saved yet.
export const DEFAULT_USD_PHP_RATE = 56;

/** Coerce the saved rate (string|number|null) into a positive number, or null. */
export function normalizeRate(rate: unknown): number | null {
  const r = typeof rate === 'string' ? parseFloat(rate) : Number(rate);
  return Number.isFinite(r) && r > 0 ? r : null;
}

/** USD price derived from a PHP price at the given rate (₱ per $1). */
export function phpToUsd(php: number | null | undefined, rate: number): number {
  const r = normalizeRate(rate);
  const value = Number(php);
  if (!r || !Number.isFinite(value) || value <= 0) return 0;
  return round2(value / r);
}

/** PHP price derived from a USD price at the given rate (₱ per $1). */
export function usdToPhp(usd: number | null | undefined, rate: number): number {
  const r = normalizeRate(rate);
  const value = Number(usd);
  if (!r || !Number.isFinite(value) || value <= 0) return 0;
  return round2(value * r);
}

/**
 * The PHP price a bulk "USD -> PHP" apply should write for one row, or `null`
 * when the row must be left alone.
 *
 * USD prices are stored rounded to two decimals, so multiplying one back by the
 * rate does not return the peso price it came from (₱1,499 -> $23.42 -> ₱1,498.88).
 * Writing that back unconditionally shaved centavos off every admin-entered
 * price on every apply. So a peso price that already round-trips to the stored
 * USD price at this rate is treated as consistent and skipped; only a USD price
 * that genuinely disagrees — because the admin edited it, or because the rate
 * changed — re-derives the peso price.
 *
 * Rows with no usable USD price or no usable rate are skipped rather than
 * written as ₱0, which would put the product on sale for free.
 */
export function phpPriceUpdateFromUsd(
  usd: number | null | undefined,
  currentPhp: number | null | undefined,
  rate: number
): number | null {
  const nextPhp = usdToPhp(usd, rate);
  if (nextPhp <= 0) return null;

  const current = Number(currentPhp);
  const isCurrentUsable = Number.isFinite(current) && current > 0;
  if (isCurrentUsable && phpToUsd(current, rate) === round2(Number(usd))) return null;

  return nextPhp;
}
