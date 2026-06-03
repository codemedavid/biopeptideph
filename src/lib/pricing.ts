// Centralized pricing authority.
//
// This is the single source of truth for "what does a product/variation cost
// right now" on the client. Every display surface (product cards, modals), the
// cart, and the checkout total flow through computeEffectivePrice() so they can
// never disagree. The mirror of this logic lives in the Postgres function
// `validate_and_price_order` (see supabase/migrations/*_create_pricing_rpc.sql)
// which re-derives the same numbers server-side at checkout — that is what makes
// the final order total trustworthy even though the storefront is unauthenticated.
//
// Discount precedence (decision: "best price wins, no stacking"):
//   1. mode base price (national/international, falling back to base_price)
//   2. per-product discount (national, base product only — mirrors legacy behavior)
//   3. global sitewide discount, computed off the *base* price (not the already
//      discounted price) so it never stacks; we then take whichever is cheaper.

import type { Product, ProductVariation, PricingMode } from '../types';

export interface GlobalDiscount {
  active: boolean;
  type: 'percentage' | 'fixed';
  value: number;
  startDate?: string | null;
  endDate?: string | null;
}

export interface EffectivePriceOptions {
  pricingMode: PricingMode;
  globalDiscount?: GlobalDiscount | null;
  now?: number;
}

// Minimal shapes so these helpers can be called with partial product objects too.
type ProductPriceFields = {
  base_price: number;
  national_price?: number | null;
  international_price?: number | null;
  discount_active?: boolean;
  discount_price?: number | null;
  discount_start_date?: string | null;
  discount_end_date?: string | null;
};

type VariationPriceFields = {
  price: number;
  national_price?: number | null;
  international_price?: number | null;
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function withinWindow(start?: string | null, end?: string | null, now = Date.now()): boolean {
  if (start) {
    const s = new Date(start).getTime();
    if (!isNaN(s) && s > now) return false;
  }
  if (end) {
    const e = new Date(end).getTime();
    if (!isNaN(e) && e < now) return false;
  }
  return true;
}

export function isGlobalDiscountActive(gd: GlobalDiscount | null | undefined, now = Date.now()): boolean {
  if (!gd || !gd.active) return false;
  if (!gd.value || gd.value <= 0) return false;
  return withinWindow(gd.startDate, gd.endDate, now);
}

function isProductDiscountActive(p: ProductPriceFields, now: number): boolean {
  if (!p.discount_active || !p.discount_price || p.discount_price <= 0) return false;
  return withinWindow(p.discount_start_date, p.discount_end_date, now);
}

function productBaseByMode(p: ProductPriceFields, mode: PricingMode): number {
  if (mode === 'international') return p.international_price ?? p.base_price;
  return p.national_price ?? p.base_price;
}

function variationBaseByMode(v: VariationPriceFields, mode: PricingMode): number {
  if (mode === 'international') return v.international_price ?? v.price;
  return v.national_price ?? v.price;
}

function applyGlobal(price: number, gd: GlobalDiscount): number {
  const out = gd.type === 'percentage' ? price * (1 - gd.value / 100) : price - gd.value;
  // Round here so the best-price-wins Math.min() compares values at equal precision.
  return round2(out < 0 ? 0 : out);
}

/**
 * The authoritative unit price for a line (a product, optionally a variation),
 * given the current pricing mode and any active global discount.
 */
export function computeEffectivePrice(
  product: ProductPriceFields,
  variation: VariationPriceFields | undefined | null,
  opts: EffectivePriceOptions
): number {
  const mode = opts.pricingMode;
  const now = opts.now ?? Date.now();
  const gd = opts.globalDiscount;

  // 1) Base price for the selected line (no discounts).
  const base = variation ? variationBaseByMode(variation, mode) : productBaseByMode(product, mode);

  // 2) Per-product discount (national base product only — variations carry their own price).
  let perProduct = base;
  if (!variation && mode === 'national' && isProductDiscountActive(product, now)) {
    perProduct = Math.min(base, product.discount_price as number);
  }

  // 3) Global sitewide discount — computed off the base so it does not stack with (2).
  let best = perProduct;
  if (isGlobalDiscountActive(gd, now)) {
    best = Math.min(perProduct, applyGlobal(base, gd as GlobalDiscount));
  }

  return round2(best < 0 ? 0 : best);
}

/** The non-discounted "was" price for a line, used for strikethrough/"% OFF" display. */
export function getBasePriceByMode(
  product: ProductPriceFields,
  variation: VariationPriceFields | undefined | null,
  mode: PricingMode
): number {
  return round2(variation ? variationBaseByMode(variation, mode) : productBaseByMode(product, mode));
}

/** Convenience wrappers preserving the legacy call sites in usePricingMode. */
export function effectiveProductPrice(
  product: Product,
  mode: PricingMode,
  globalDiscount?: GlobalDiscount | null
): number {
  return computeEffectivePrice(product, undefined, { pricingMode: mode, globalDiscount });
}

export function effectiveVariationPrice(
  product: Product,
  variation: ProductVariation,
  mode: PricingMode,
  globalDiscount?: GlobalDiscount | null
): number {
  return computeEffectivePrice(product, variation, { pricingMode: mode, globalDiscount });
}
