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
        site_name: data.find(s => s.id === 'site_name')?.value || 'Beracah Cafe',
        site_logo: data.find(s => s.id === 'site_logo')?.value || '/logo.png',
        site_description: data.find(s => s.id === 'site_description')?.value || '',
        currency: data.find(s => s.id === 'currency')?.value || 'PHP',
        currency_code: data.find(s => s.id === 'currency_code')?.value || 'PHP',

        // Courier Delay settings
        jnt_delay_active: data.find(s => s.id === 'jnt_delay_active')?.value === 'true',
        lalamove_delay_active: data.find(s => s.id === 'lalamove_delay_active')?.value === 'true',
        jnt_delay_message: data.find(s => s.id === 'jnt_delay_message')?.value || 'J&T orders may take a while due to high volume.',
        lalamove_delay_message: data.find(s => s.id === 'lalamove_delay_message')?.value || 'Lalamove pickup is scheduled. Please wait for confirmation.',

        // Homepage Settings
        home_hero_badge: data.find(s => s.id === 'home_hero_badge')?.value || 'Peptides & Essentials',
        home_hero_title_prefix: data.find(s => s.id === 'home_hero_title_prefix')?.value || 'Premium',
        home_hero_title_highlight: data.find(s => s.id === 'home_hero_title_highlight')?.value || 'Peptides',
        home_hero_title_suffix: data.find(s => s.id === 'home_hero_title_suffix')?.value || '& Essentials',
        home_hero_subtext: data.find(s => s.id === 'home_hero_subtext')?.value || '— Trusted Quality for Your Journey.',
        home_hero_tagline: data.find(s => s.id === 'home_hero_tagline')?.value || 'Quality-tested products. Reliable performance. Trusted by our community.',
        home_hero_description: data.find(s => s.id === 'home_hero_description')?.value || 'Explore our carefully curated selection of high-quality peptides, peptide pens, cartridges, pen needles, and insulin syringes. Each product is personally tested and trusted for purity, safety, and performance — so you can pin with confidence.'
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
    updateSiteSettings,
    refetch: fetchSiteSettings
  };
};
