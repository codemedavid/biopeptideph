/**
 * Pure helpers for the storefront menu (used by src/hooks/useMenu.ts).
 *
 * The menu is fetched in ONE embedded request (`products` + `product_variations`)
 * rather than one request per product — the old N+1 load was ~85% of all
 * Supabase API traffic. Ordering variations happens here instead of in PostgREST.
 */

/**
 * Realtime keeps the menu live; a tab-focus refetch is only a safety net for a
 * socket that dropped while the tab was in the background.
 */
export const MENU_STALE_AFTER_MS = 5 * 60 * 1000;

type WithQuantity = { id: string; quantity_mg: number; created_at?: string | null };
type RowWithVariations<V> = { variations?: V[] | null };

export function withSortedVariations<V extends WithQuantity, P extends RowWithVariations<V>>(
  rows: readonly P[]
): (P & { variations: V[] })[] {
  return rows.map((row) => ({
    ...row,
    variations: [...(row.variations ?? [])].sort(compareVariations),
  }));
}

/** quantity_mg ascending; ties (e.g. several 1mg variants) in creation order, then id. */
function compareVariations(a: WithQuantity, b: WithQuantity): number {
  return (
    a.quantity_mg - b.quantity_mg ||
    (a.created_at ?? '').localeCompare(b.created_at ?? '') ||
    a.id.localeCompare(b.id)
  );
}

export function isMenuStale(lastFetchedAt: number, now: number = Date.now()): boolean {
  return now - lastFetchedAt > MENU_STALE_AFTER_MS;
}
