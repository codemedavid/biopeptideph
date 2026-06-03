import React, { useEffect, useState } from 'react';
import { ArrowLeft, Save, ScrollText } from 'lucide-react';
import { useSiteSettings } from '../../hooks/useSiteSettings';

interface TermsManagerProps {
  onBack: () => void;
}

// Edits the terms_and_conditions_content site setting shown (and required) at
// checkout and on the /terms page.
const TermsManager: React.FC<TermsManagerProps> = ({ onBack }) => {
  const { siteSettings, upsertSiteSetting, loading } = useSiteSettings();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (siteSettings) setContent(siteSettings.terms_and_conditions_content ?? '');
  }, [siteSettings]);

  const flash = (t: 'success' | 'error', text: string) => {
    setMessage({ type: t, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertSiteSetting('terms_and_conditions_content', content);
      flash('success', 'Terms & Conditions saved.');
    } catch (e: any) {
      flash('error', e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-theme-bg">
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" /> <span className="font-medium">Back to Dashboard</span>
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-theme-accent" /> Terms &amp; Conditions
          </h1>
          <div className="w-24" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-6 space-y-4">
          <p className="text-sm text-gray-500">
            Customers must agree to this before checking out. Plain text — line breaks are preserved.
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={18}
            className="input-field font-mono text-sm leading-relaxed"
            placeholder="Enter your store's Terms & Conditions…"
          />
          <button onClick={handleSave} disabled={saving || loading}
            className="w-full flex items-center justify-center gap-2 bg-theme-accent hover:bg-theme-accent/90 text-white py-3 rounded-lg font-semibold disabled:opacity-60">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Terms & Conditions'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsManager;
