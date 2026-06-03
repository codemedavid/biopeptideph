import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type GbUnavailableBehavior = 'hide' | 'disable';

interface AvailabilityRow {
  group_buy_id: string;
  product_id: string;
  is_available: boolean;
}

function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42P01' || err.code === 'PGRST205') return true;
  const m = (err.message || '').toLowerCase();
  return m.includes('does not exist') || m.includes('could not find the table') || m.includes('schema cache');
}

/**
 * Per-GB product availability.
 * - Storefront: pass the active GB id to get `unavailableIds` + `behavior`.
 * - Admin: also use `availabilityMap` + `setAvailability` to toggle, and
 *   `setBehavior` to choose hide vs disable.
 * No row for a (gb, product) pair means available (default). Realtime + focus
 * refetch keep the storefront in sync with admin toggles.
 */
export function useGroupBuyAvailability(groupBuyId?: string | null) {
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [behavior, setBehaviorState] = useState<GbUnavailableBehavior>('hide');
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true); // false if table not migrated

  const fetchBehavior = useCallback(async () => {
    const { data } = await supabase.from('site_settings').select('value').eq('id', 'gb_unavailable_behavior').maybeSingle();
    setBehaviorState(data?.value === 'disable' ? 'disable' : 'hide');
  }, []);

  const fetchRows = useCallback(async () => {
    if (!groupBuyId) { setRows([]); setLoading(false); return; }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('group_buy_product_availability')
        .select('group_buy_id, product_id, is_available')
        .eq('group_buy_id', groupBuyId);
      if (error) throw error;
      setRows((data as AvailabilityRow[]) || []);
      setAvailable(true);
    } catch (err: any) {
      if (isMissingTable(err)) { setAvailable(false); setRows([]); }
    } finally {
      setLoading(false);
    }
  }, [groupBuyId]);

  useEffect(() => {
    fetchBehavior();
    fetchRows();

    const channel = supabase
      .channel(`gb-availability-${groupBuyId || 'none'}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_buy_product_availability' }, () => fetchRows())
      .subscribe();

    const onFocus = () => { fetchRows(); fetchBehavior(); };
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
    };
  }, [groupBuyId, fetchRows, fetchBehavior]);

  // product_id -> is_available (explicit rows only). Absent = available (default true).
  const availabilityMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of rows) m.set(r.product_id, r.is_available);
    return m;
  }, [rows]);

  const unavailableIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.is_available === false) s.add(r.product_id);
    return s;
  }, [rows]);

  const setAvailability = useCallback(async (productId: string, isAvailable: boolean) => {
    if (!groupBuyId) return { success: false, error: 'No group buy selected' };
    try {
      const { error } = await supabase
        .from('group_buy_product_availability')
        .upsert(
          { group_buy_id: groupBuyId, product_id: productId, is_available: isAvailable, updated_at: new Date().toISOString() },
          { onConflict: 'group_buy_id,product_id' }
        );
      if (error) throw error;
      await fetchRows();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update availability' };
    }
  }, [groupBuyId, fetchRows]);

  const setBehavior = useCallback(async (value: GbUnavailableBehavior) => {
    setBehaviorState(value);
    try {
      const { error } = await supabase
        .from('site_settings')
        .upsert({ id: 'gb_unavailable_behavior', value, type: 'string' }, { onConflict: 'id' });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save behavior' };
    }
  }, []);

  return {
    availabilityMap,
    unavailableIds,
    behavior,
    available,
    loading,
    refresh: fetchRows,
    setAvailability,
    setBehavior,
  };
}
