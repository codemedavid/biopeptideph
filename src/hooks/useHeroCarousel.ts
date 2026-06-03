import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { HeroSlide } from '../types';

export interface HeroSlideInput {
  image_url: string;
  title?: string | null;
  subtitle?: string | null;
  button_text?: string | null;
  button_link?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42P01' || err.code === 'PGRST205') return true;
  const m = (err.message || '').toLowerCase();
  return m.includes('does not exist') || m.includes('could not find the table') || m.includes('schema cache');
}

/**
 * Hero carousel slides.
 * - Storefront reads `activeSlides`.
 * - Admin reads `slides` (all) + uses the CRUD/reorder helpers.
 * A realtime subscription + window-focus refetch make admin edits reflect on the
 * homepage near-instantly. Gracefully no-ops if the table isn't migrated yet.
 */
export function useHeroCarousel() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  const fetchSlides = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('hero_carousel_slides')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      setSlides((data as HeroSlide[]) || []);
      setAvailable(true);
    } catch (err: any) {
      if (isMissingTable(err)) {
        setAvailable(false);
        setSlides([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlides();

    const channel = supabase
      .channel(`hero-carousel-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hero_carousel_slides' }, () => fetchSlides())
      .subscribe();

    const onFocus = () => fetchSlides();
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchSlides]);

  const activeSlides = useMemo(() => slides.filter((s) => s.is_active), [slides]);
  const nextSortOrder = useMemo(
    () => (slides.length ? Math.max(...slides.map((s) => s.sort_order)) + 1 : 0),
    [slides]
  );

  const addSlide = useCallback(async (input: HeroSlideInput) => {
    try {
      const { data, error } = await supabase.from('hero_carousel_slides').insert([input]).select().single();
      if (error) throw error;
      await fetchSlides();
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to add slide' };
    }
  }, [fetchSlides]);

  const updateSlide = useCallback(async (id: string, updates: Partial<HeroSlideInput>) => {
    try {
      const { error } = await supabase
        .from('hero_carousel_slides')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await fetchSlides();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update slide' };
    }
  }, [fetchSlides]);

  const deleteSlide = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('hero_carousel_slides').delete().eq('id', id);
      if (error) throw error;
      await fetchSlides();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete slide' };
    }
  }, [fetchSlides]);

  const toggleActive = useCallback(async (id: string, is_active: boolean) => {
    return updateSlide(id, { is_active });
  }, [updateSlide]);

  // Persist a new order: sort_order = position in the given id list.
  const reorder = useCallback(async (orderedIds: string[]) => {
    // Optimistic local reorder for snappy UI.
    setSlides((cur) => {
      const byId = new Map(cur.map((s) => [s.id, s]));
      const next = orderedIds.map((id, i) => { const s = byId.get(id); return s ? { ...s, sort_order: i } : null; }).filter(Boolean) as HeroSlide[];
      // include any not in orderedIds (shouldn't happen) at the end
      const missing = cur.filter((s) => !orderedIds.includes(s.id));
      return [...next, ...missing];
    });
    try {
      await Promise.all(orderedIds.map((id, i) =>
        supabase.from('hero_carousel_slides').update({ sort_order: i, updated_at: new Date().toISOString() }).eq('id', id)
      ));
      await fetchSlides();
      return { success: true };
    } catch (err: any) {
      await fetchSlides();
      return { success: false, error: err?.message || 'Failed to reorder' };
    }
  }, [fetchSlides]);

  return {
    slides,
    activeSlides,
    available,
    loading,
    nextSortOrder,
    refresh: fetchSlides,
    addSlide,
    updateSlide,
    deleteSlide,
    toggleActive,
    reorder,
  };
}
