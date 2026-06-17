import React, { useEffect, useState } from 'react';
import { ArrowLeft, Save, Image as ImageIcon, Eye, Images, Type, AlertTriangle } from 'lucide-react';
import { useSiteSettings } from '../../hooks/useSiteSettings';
import { useHeroCarousel } from '../../hooks/useHeroCarousel';
import ImageUpload from '../ImageUpload';
import HeroCarouselManager from './HeroCarouselManager';

interface HeroManagerProps {
  onBack: () => void;
}

// Hero fields managed here -> all stored in site_settings (no hardcoded homepage).
const FIELDS: { key: string; label: string; placeholder: string; textarea?: boolean }[] = [
  { key: 'home_hero_badge', label: 'Badge (small label above title)', placeholder: 'Frost-Fresh Beauty Essentials' },
  { key: 'home_hero_title_prefix', label: 'Title — line 1', placeholder: 'Snow' },
  { key: 'home_hero_title_highlight', label: 'Title — highlighted line', placeholder: 'Snow' },
  { key: 'home_hero_title_suffix', label: 'Title — line 3 (optional)', placeholder: '' },
  { key: 'home_hero_subtext', label: 'Subtext', placeholder: 'Radiance, refined for your everyday ritual.', textarea: true },
  { key: 'home_hero_cta_text', label: 'CTA button text (blank = "Explore Products" / "Explore GB")', placeholder: 'Shop the Drop' },
  { key: 'home_hero_cta_link', label: 'CTA link (blank = scroll to products; or /path or https://…)', placeholder: '' },
];

const HeroManager: React.FC<HeroManagerProps> = ({ onBack }) => {
  const { siteSettings, upsertSiteSetting, loading } = useSiteSettings();
  const { activeSlides } = useHeroCarousel();
  const [form, setForm] = useState<Record<string, string>>({});
  const [heroImage, setHeroImage] = useState<string>('');
  // A set background image always wins over the carousel on the homepage.
  const imageOverridesCarousel = activeSlides.length > 0 && !!heroImage;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<'content' | 'carousel'>('content');

  useEffect(() => {
    if (!siteSettings) return;
    const initial: Record<string, string> = {};
    FIELDS.forEach((f) => { initial[f.key] = (siteSettings as any)[f.key] ?? ''; });
    setForm(initial);
    setHeroImage(siteSettings.home_hero_image_url ?? '');
  }, [siteSettings]);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const f of FIELDS) {
        await upsertSiteSetting(f.key, form[f.key] ?? '');
      }
      await upsertSiteSetting('home_hero_image_url', heroImage ?? '');
      flash('success', 'Hero section saved. Refresh the homepage to see changes.');
    } catch (e: any) {
      flash('error', e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-theme-bg">
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" /> <span className="font-medium">Back to Dashboard</span>
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-theme-accent" /> Hero Section
          </h1>
          <div className="w-24" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Tabs: static hero content vs admin-managed carousel slides */}
        <div className="flex gap-2 mb-5">
          <button onClick={() => setTab('content')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'content' ? 'bg-theme-accent text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            <Type className="w-4 h-4" /> Hero Content
          </button>
          <button onClick={() => setTab('carousel')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'carousel' ? 'bg-theme-accent text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            <Images className="w-4 h-4" /> Carousel Slides
          </button>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        {tab === 'carousel' && <HeroCarouselManager />}

        {tab === 'content' && (
        <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-6 space-y-5">
          {/* Hero image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hero Background Image</label>
            {imageOverridesCarousel ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold">This image is overriding the carousel.</p>
                  <p className="mt-1">
                    You have {activeSlides.length} active carousel slide{activeSlides.length === 1 ? '' : 's'}, but the
                    homepage hero shows this <strong>background image</strong> instead, because a set background image
                    always takes priority. To show the{' '}
                    <button
                      type="button"
                      onClick={() => setTab('carousel')}
                      className="underline font-semibold hover:text-amber-900"
                    >
                      Carousel Slides
                    </button>{' '}
                    instead, clear this background image below.
                  </p>
                </div>
              </div>
            ) : null}
            <div className={imageOverridesCarousel ? 'mt-3' : ''}>
              <ImageUpload
                currentImage={heroImage || null}
                onImageChange={(url) => setHeroImage(url || '')}
                folder="menu-images"
                skipBucketCheck
              />
              <p className="text-xs text-gray-400 mt-1">Optional. A brand tint is applied over the image for legibility.{imageOverridesCarousel ? ' When set, this image is shown instead of the carousel.' : ''}</p>
            </div>
          </div>

          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              {f.textarea ? (
                <textarea
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  rows={2}
                  className="input-field"
                  placeholder={f.placeholder}
                />
              ) : (
                <input
                  type="text"
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="input-field"
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}

          {/* Live preview */}
          <div>
            <p className="text-xs font-semibold text-gray-500 flex items-center gap-1 mb-2"><Eye className="w-3.5 h-3.5" /> Preview</p>
            <div className="relative rounded-xl overflow-hidden bg-theme-blue text-white p-8 text-center">
              {heroImage && (
                <>
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroImage})` }} />
                  <div className="absolute inset-0 bg-theme-blue/70" />
                </>
              )}
              <div className="relative z-10">
                <p className="text-[11px] uppercase tracking-[0.25em] text-white/80 mb-3">{form.home_hero_badge}</p>
                <h2 className="text-3xl font-bold leading-tight">
                  {form.home_hero_title_prefix} <span className="italic text-theme-navy">{form.home_hero_title_highlight}</span> {form.home_hero_title_suffix}
                </h2>
                <p className="text-white/85 mt-3">{form.home_hero_subtext}</p>
                <span className="inline-block mt-5 bg-theme-navy px-6 py-2.5 rounded-full text-sm font-semibold">
                  {form.home_hero_cta_text || 'Explore Products'}
                </span>
              </div>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving || loading}
            className="w-full flex items-center justify-center gap-2 bg-theme-accent hover:bg-theme-accent/90 text-white py-3 rounded-lg font-semibold disabled:opacity-60">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Hero Section'}
          </button>
        </div>
        )}
      </div>
    </div>
  );
};

export default HeroManager;
