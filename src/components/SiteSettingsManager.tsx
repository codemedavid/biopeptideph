import React, { useState, useEffect } from 'react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { SiteSettings } from '../types';

interface SiteSettingsManagerProps {
  onBack: () => void;
}

const SiteSettingsManager: React.FC<SiteSettingsManagerProps> = ({ onBack }) => {
  const { siteSettings, updateSiteSettings, loading } = useSiteSettings();

  // Local state for form management
  const [localSettings, setLocalSettings] = useState<SiteSettings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');

  // Initialize local settings when data is fetched
  useEffect(() => {
    if (siteSettings && !localSettings) {
      setLocalSettings(siteSettings);
    }
  }, [siteSettings, localSettings]);

  // Handle local updates
  const handleLocalChange = (updates: Partial<SiteSettings>) => {
    if (!localSettings) return;
    setLocalSettings({ ...localSettings, ...updates });
    setHasChanges(true);
    setSaveStatus('idle');
  };

  // Handle save action
  const handleSaveChanges = async () => {
    if (!localSettings) return;
    setSaveStatus('saving');
    try {
      await updateSiteSettings(localSettings);
      setSaveStatus('success');
      setHasChanges(false);

      // Reset success message after 3 seconds
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('idle');
      alert('Failed to save settings. Please try again.');
    }
  };

  if (loading && !localSettings) {
    return (
      <div className="min-h-screen bg-theme-bg p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-theme-accent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-bg p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-theme-text">Site Settings</h1>
          <div className="flex items-center gap-3">
            {saveStatus === 'success' && (
              <span className="text-green-600 font-medium flex items-center gap-1 animate-fadeIn">
                <span className="text-xl">✓</span> Saved
              </span>
            )}
            <button
              onClick={onBack}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Courier Delay Notices */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 h-fit">
            <div className="p-6 border-b border-gray-100 bg-gray-50">
              <h2 className="text-xl font-bold text-theme-text flex items-center gap-2">
                <span className="text-2xl">🚚</span>
                Courier Notices
              </h2>
              <p className="text-sm text-gray-500 mt-1">Manage checkout delay warnings.</p>
            </div>
            <div className="p-6 space-y-6">
              {/* J&T Express Settings */}
              <div className="bg-white border rounded-lg p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-red-600">J&T Express</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={localSettings?.jnt_delay_active || false}
                      onChange={(e) => handleLocalChange({ jnt_delay_active: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>

                <div className={localSettings?.jnt_delay_active ? 'opacity-100' : 'opacity-50 pointer-events-none'}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notice Message</label>
                  <textarea
                    value={localSettings?.jnt_delay_message || ''}
                    onChange={(e) => handleLocalChange({ jnt_delay_message: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-theme-accent focus:border-transparent outline-none text-sm"
                    rows={2}
                  />
                </div>
              </div>

              {/* Lalamove Settings */}
              <div className="bg-white border rounded-lg p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-orange-500">Lalamove</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={localSettings?.lalamove_delay_active || false}
                      onChange={(e) => handleLocalChange({ lalamove_delay_active: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                  </label>
                </div>

                <div className={localSettings?.lalamove_delay_active ? 'opacity-100' : 'opacity-50 pointer-events-none'}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notice Message</label>
                  <textarea
                    value={localSettings?.lalamove_delay_message || ''}
                    onChange={(e) => handleLocalChange({ lalamove_delay_message: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-theme-accent focus:border-transparent outline-none text-sm"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Homepage Content Settings */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 h-fit">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-theme-text flex items-center gap-2">
                  <span className="text-2xl">🏠</span>
                  Homepage Content
                </h2>
                <p className="text-sm text-gray-500 mt-1">Customize the landing page text.</p>
              </div>
              <button
                onClick={handleSaveChanges}
                disabled={!hasChanges || saveStatus === 'saving'}
                className={`px-4 py-2 rounded-lg font-bold transition-all shadow-sm flex items-center gap-2 ${hasChanges
                  ? 'bg-theme-accent text-white hover:bg-theme-accent/90 transform hover:-translate-y-0.5'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
              >
                {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Badge Text</label>
                <input
                  type="text"
                  value={localSettings?.home_hero_badge || ''}
                  onChange={(e) => handleLocalChange({ home_hero_badge: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-theme-accent outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="md:col-span-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Title Prefix</label>
                  <input
                    type="text"
                    value={localSettings?.home_hero_title_prefix || ''}
                    onChange={(e) => handleLocalChange({ home_hero_title_prefix: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-theme-accent outline-none"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Highlight (Color)</label>
                  <input
                    type="text"
                    value={localSettings?.home_hero_title_highlight || ''}
                    onChange={(e) => handleLocalChange({ home_hero_title_highlight: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-theme-accent outline-none"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Title Suffix</label>
                  <input
                    type="text"
                    value={localSettings?.home_hero_title_suffix || ''}
                    onChange={(e) => handleLocalChange({ home_hero_title_suffix: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-theme-accent outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Subtext (Next to Title)</label>
                <input
                  type="text"
                  value={localSettings?.home_hero_subtext || ''}
                  onChange={(e) => handleLocalChange({ home_hero_subtext: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-theme-accent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Hero Tagline</label>
                <textarea
                  value={localSettings?.home_hero_tagline || ''}
                  onChange={(e) => handleLocalChange({ home_hero_tagline: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-theme-accent outline-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Main Description</label>
                <textarea
                  value={localSettings?.home_hero_description || ''}
                  onChange={(e) => handleLocalChange({ home_hero_description: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-theme-accent outline-none"
                  rows={4}
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => {
                    if (confirm('Reset all homepage text to default?')) {
                      handleLocalChange({
                        home_hero_badge: 'Peptides & Essentials',
                        home_hero_title_prefix: 'Premium',
                        home_hero_title_highlight: 'Peptides',
                        home_hero_title_suffix: '& Essentials',
                        home_hero_subtext: '— Trusted Quality for Your Journey.',
                        home_hero_tagline: 'Quality-tested products. Reliable performance. Trusted by our community.',
                        home_hero_description: 'Explore our carefully curated selection of high-quality peptides, peptide pens, cartridges, pen needles, and insulin syringes. Each product is personally tested and trusted for purity, safety, and performance — so you can pin with confidence.'
                      });
                    }
                  }}
                  className="text-xs text-red-500 hover:text-red-700 underline"
                >
                  Reset Homepage Defaults
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteSettingsManager;
