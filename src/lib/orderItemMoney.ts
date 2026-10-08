/**
 * Money on a stored order item. The standard shape is { price, total }, but
 * orders placed through place_group_buy_order before 2026-10-06 stored the
 * pricing RPC's { unit_price, line_total } instead. Read both, and return null
 * rather than throwing when neither is there.
 */

export type StoredOrderItemMoney = {
  quantity?: number | string | null;
  price?: number | string | null;
  total?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function itemUnitPrice(item: StoredOrderItemMoney): number | null {
  return toNumber(item.price) ?? toNumber(item.unit_price);
}

export function itemLineTotal(item: StoredOrderItemMoney): number | null {
  const stored = toNumber(item.total) ?? toNumber(item.line_total);
  if (stored !== null) return stored;
  const unit = itemUnitPrice(item);
  const qty = toNumber(item.quantity);
  return unit !== null && qty !== null ? unit * qty : null;
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}
