import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { SiteSettings, SiteSetting } from '../types';

export const useSiteSettings = () => {
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSiteSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .order('id');

      if (error) throw error;

      // Transform the data into a more usable format
      const settings: SiteSettings = {
        site_name: data.find(s => s.id === 'site_name')?.value || 'Sakura Bloom',
        site_logo: data.find(s => s.id === 'site_logo')?.value || '/sakura-logo.jpg',
        site_description: data.find(s => s.id === 'site_description')?.value || '',
        currency: data.find(s => s.id === 'currency')?.value || 'PHP',
        currency_code: data.find(s => s.id === 'currency_code')?.value || 'PHP',
        usd_php_rate: parseFloat(data.find(s => s.id === 'usd_php_rate')?.value || '56'),
        admin_fee_php: parseFloat(data.find(s => s.id === 'admin_fee_php')?.value || '150'),
        admin_fee_usd: parseFloat(data.find(s => s.id === 'admin_fee_usd')?.value || '3'),

        // Courier Delay settings
        jnt_delay_active: data.find(s => s.id === 'jnt_delay_active')?.value === 'true',
        lalamove_delay_active: data.find(s => s.id === 'lalamove_delay_active')?.value === 'true',
        jnt_delay_message: data.find(s => s.id === 'jnt_delay_message')?.value || 'J&T orders may take a while due to high volume.',
        lalamove_delay_message: data.find(s => s.id === 'lalamove_delay_message')?.value || 'Lalamove pickup is scheduled. Please wait for confirmation.',

        // Homepage Settings
        home_hero_badge: data.find(s => s.id === 'home_hero_badge')?.value || 'Frost-Fresh Beauty Essentials',
        home_hero_title_prefix: data.find(s => s.id === 'home_hero_title_prefix')?.value || 'Snow',
        home_hero_title_highlight: data.find(s => s.id === 'home_hero_title_highlight')?.value || 'Snow',
        home_hero_title_suffix: data.find(s => s.id === 'home_hero_title_suffix')?.value || '',
        home_hero_subtext: data.find(s => s.id === 'home_hero_subtext')?.value || 'A cooler kind of glow, refined for your everyday ritual.',
        home_hero_tagline: data.find(s => s.id === 'home_hero_tagline')?.value || 'Curated essentials. Gentle formulas. A glow you can feel.',
        home_hero_description: data.find(s => s.id === 'home_hero_description')?.value || 'Discover thoughtfully selected beauty and wellness essentials designed to elevate your natural glow with a cool, frost-fresh touch.',
        home_hero_image_url: data.find(s => s.id === 'home_hero_image_url')?.value || '',
        home_hero_cta_text: data.find(s => s.id === 'home_hero_cta_text')?.value || '',
        home_hero_cta_link: data.find(s => s.id === 'home_hero_cta_link')?.value || '',

        // Global Discount
        global_discount_active: data.find(s => s.id === 'global_discount_active')?.value === 'true',
        global_discount_type: (data.find(s => s.id === 'global_discount_type')?.value === 'fixed' ? 'fixed' : 'percentage'),
        global_discount_value: parseFloat(data.find(s => s.id === 'global_discount_value')?.value || '0'),
        global_discount_start: data.find(s => s.id === 'global_discount_start')?.value || '',
        global_discount_end: data.find(s => s.id === 'global_discount_end')?.value || '',

        // Terms & Conditions
        terms_and_conditions_content: data.find(s => s.id === 'terms_and_conditions_content')?.value || '',
      };

      setSiteSettings(settings);
    } catch (err) {
      console.error('Error fetching site settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch site settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSiteSetting = async (id: string, value: string) => {
    try {
      setError(null);

      const { error } = await supabase
        .from('site_settings')
        .update({ value })
        .eq('id', id);

      if (error) throw error;

      // Refresh the settings
      await fetchSiteSettings();
    } catch (err) {
      console.error('Error updating site setting:', err);
      setError(err instanceof Error ? err.message : 'Failed to update site setting');
      throw err;
    }
  };

  const upsertSiteSetting = async (id: string, value: string, description?: string) => {
    try {
      setError(null);

      const { error } = await supabase
        .from('site_settings')
        .upsert({ id, value, type: 'string', description: description || null }, { onConflict: 'id' });

      if (error) throw error;

      await fetchSiteSettings();
    } catch (err) {
      console.error('Error upserting site setting:', err);
      setError(err instanceof Error ? err.message : 'Failed to upsert site setting');
      throw err;
    }
  };

  const updateSiteSettings = async (updates: Partial<SiteSettings>) => {
    try {
      setError(null);

      const updatePromises = Object.entries(updates).map(([key, value]) =>
        supabase
          .from('site_settings')
          .update({ value })
          .eq('id', key)
      );

      const results = await Promise.all(updatePromises);

      // Check for errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        throw new Error('Some updates failed');
      }

      // Refresh the settings
      await fetchSiteSettings();
    } catch (err) {
      console.error('Error updating site settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update site settings');
      throw err;
    }
  };

  useEffect(() => {
    fetchSiteSettings();
  }, []);

  return {
    siteSettings,
    loading,
    error,
    updateSiteSetting,
    upsertSiteSetting,
    updateSiteSettings,
    refetch: fetchSiteSettings
  };
};
