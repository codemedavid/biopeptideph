import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { computeKitState, effectiveMoq, type KitState } from '../lib/kitRules';

/**
 * Live MOQ + kit state for one Group Buy round.
 *
 * Reads the `group_buy_kit_status` view, which derives every number from real
 * orders — there is no stored "remaining" counter to go stale. Realtime on
 * `orders` plus a refetch on window focus mean a customer staring at the Bunuan
 * page sees "2 vials needed" drop to 1 as soon as someone else orders, instead
 * of only discovering it at checkout.
 *
 * This is display state. The authority is place_group_buy_order, which
 * recomputes the same numbers inside a lock at checkout time.
 */

export interface KitStatusRow {
  group_buy_id: string;
  product_id: string;
  product_name: string;
  image_url: string | null;
  effective_moq: number;
  kit_size: number | null;
  eligible_qty: number;
  complete_kits: number;
  in_progress: number;
  bunuan_needed: number;
  bunuan_available: number;
  is_complete: boolean;
}

// Matches the guard used by useGroupBuys / useGroupBuyAvailability so the app
// keeps working before the migrations are applied.
function isMissingRelation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42P01' || err.code === 'PGRST205') return true;
  const m = (err.message || '').toLowerCase();
  return m.includes('does not exist') || m.includes('could not find the table') || m.includes('schema cache');
}

/** A product with nothing configured behaves as "no MOQ, not kit-tracked". */
const UNTRACKED: KitState = computeKitState({ kitSize: null, eligibleQty: 0 });

export function useKitStatus(groupBuyId?: string | null) {
  const [rows, setRows] = useState<KitStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  // false when the migrations are not applied yet — callers then fall back to
  // "no MOQ, no Bunuan", i.e. exactly today's behaviour.
  const [available, setAvailable] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!groupBuyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('group_buy_kit_status')
        .select('*')
        .eq('group_buy_id', groupBuyId);
      if (error) throw error;
      setRows((data as KitStatusRow[]) || []);
      setAvailable(true);
    } catch (err: any) {
      if (isMissingRelation(err)) {
        setAvailable(false);
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [groupBuyId]);

  useEffect(() => {
    fetchRows();

    // Every kit number is derived from `orders`, so an order placed anywhere
    // changes what this page should show. Also watch the override table so an
    // admin switching Bunuan off for a product takes effect immediately.
    const channel = supabase
      .channel(`kit-status-${groupBuyId || 'none'}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchRows())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_buy_product_kits' }, () => fetchRows())
      .subscribe();

    const onFocus = () => fetchRows();
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
    };
  }, [groupBuyId, fetchRows]);

  /** product_id -> KitState, in the shape kitRules works with. */
  const kitStates = useMemo(() => {
    const map = new Map<string, KitState>();
    for (const row of rows) {
      map.set(row.product_id, {
        kitSize: row.kit_size,
        eligibleQty: row.eligible_qty,
        completeKits: row.complete_kits,
        inProgress: row.in_progress,
        bunuanNeeded: row.bunuan_needed,
        bunuanAvailable: row.bunuan_available,
        isComplete: row.is_complete,
      });
    }
    return map;
  }, [rows]);

  /** product_id -> effective MOQ for this round. */
  const moqs = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.product_id, effectiveMoq(row.effective_moq));
    return map;
  }, [rows]);

  /**
   * Products that still need units, for the Bunuan page. A complete kit is
   * absent by construction, so the page can never advertise a finished product.
   */
  const incompleteRows = useMemo(
    () => rows.filter((r) => r.kit_size !== null && r.bunuan_available > 0),
    [rows],
  );

  const getKitState = useCallback(
    (productId: string): KitState => kitStates.get(productId) ?? UNTRACKED,
    [kitStates],
  );

  const getMoq = useCallback((productId: string): number => moqs.get(productId) ?? 1, [moqs]);

  return {
    rows,
    incompleteRows,
    kitStates,
    moqs,
    getKitState,
    getMoq,
    available,
    loading,
    refresh: fetchRows,
  };
}
