import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { GroupBuy, GroupBuyStatus } from '../types';

export interface GroupBuyInput {
  gb_number: string;
  title: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: GroupBuyStatus;
}

// Returns true when the error is "the group_buys table doesn't exist yet" so the
// storefront/admin keep working before the Phase 2 migration is applied.
function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42P01' || err.code === 'PGRST205') return true;
  const m = (err.message || '').toLowerCase();
  return m.includes('does not exist') || m.includes('could not find the table') || m.includes('schema cache');
}

export function useGroupBuys() {
  const [groupBuys, setGroupBuys] = useState<GroupBuy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true); // false if table not migrated yet

  const fetchGroupBuys = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('group_buys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGroupBuys((data as GroupBuy[]) || []);
      setError(null);
      setAvailable(true);
    } catch (err: any) {
      if (isMissingTable(err)) {
        setAvailable(false);
        setGroupBuys([]);
        setError(null);
      } else {
        setError(err?.message || 'Failed to load group buys');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroupBuys();

    // Reflect edits (e.g. a title change on a live round) everywhere immediately:
    // the storefront banner reads from its own useGroupBuys() instance, so without
    // this it would keep showing the old name until a manual reload.
    const channel = supabase
      .channel(`group-buys-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_buys' }, () => fetchGroupBuys())
      .subscribe();

    const onFocus = () => fetchGroupBuys();
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchGroupBuys]);

  const activeGroupBuy = useMemo(
    () => groupBuys.find((g) => g.status === 'active') || null,
    [groupBuys]
  );

  // gb_number is free text, but suggest the next sequential number for the common
  // case where rounds are still labelled "1", "2", "3"… (ignores non-numeric labels).
  const nextGbNumber = useMemo(() => {
    const numeric = groupBuys
      .map((g) => parseInt(g.gb_number, 10))
      .filter((n) => !Number.isNaN(n));
    return numeric.length ? String(Math.max(...numeric) + 1) : '1';
  }, [groupBuys]);

  const createGroupBuy = useCallback(async (input: GroupBuyInput) => {
    try {
      const { data, error } = await supabase.from('group_buys').insert([input]).select().single();
      if (error) throw error;
      await fetchGroupBuys();
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to create group buy' };
    }
  }, [fetchGroupBuys]);

  const updateGroupBuy = useCallback(async (id: string, updates: Partial<GroupBuyInput>) => {
    try {
      const { error } = await supabase
        .from('group_buys')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await fetchGroupBuys();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update group buy' };
    }
  }, [fetchGroupBuys]);

  // Enforce "one active round at a time": activating one closes any other active.
  const setStatus = useCallback(async (id: string, status: GroupBuyStatus) => {
    try {
      if (status === 'active') {
        const others = groupBuys.filter((g) => g.id !== id && g.status === 'active');
        for (const g of others) {
          await supabase.from('group_buys').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', g.id);
        }
      }
      const { error } = await supabase
        .from('group_buys')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await fetchGroupBuys();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to change status' };
    }
  }, [groupBuys, fetchGroupBuys]);

  const deleteGroupBuy = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('group_buys').delete().eq('id', id);
      if (error) throw error;
      await fetchGroupBuys();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete group buy' };
    }
  }, [fetchGroupBuys]);

  // Assign / unassign a product to a round.
  const setProductGroupBuy = useCallback(async (productId: string, groupBuyId: string | null) => {
    try {
      const { error } = await supabase.from('products').update({ group_buy_id: groupBuyId }).eq('id', productId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to assign product' };
    }
  }, []);

  return {
    groupBuys,
    activeGroupBuy,
    nextGbNumber,
    available,
    loading,
    error,
    refresh: fetchGroupBuys,
    createGroupBuy,
    updateGroupBuy,
    setStatus,
    deleteGroupBuy,
    setProductGroupBuy,
  };
}
