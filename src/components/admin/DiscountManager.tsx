import React, { useEffect, useState } from 'react';
import { ArrowLeft, Save, Percent, AlertTriangle } from 'lucide-react';
import { useSiteSettings } from '../../hooks/useSiteSettings';

interface DiscountManagerProps {
  onBack: () => void;
}

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(val: string): string {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

const DiscountManager: React.FC<DiscountManagerProps> = ({ onBack }) => {
  const { siteSettings, upsertSiteSetting, loading } = useSiteSettings();

  const [active, setActive] = useState(false);
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState('0');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!siteSettings) return;
    setActive(siteSettings.global_discount_active);
    setType(siteSettings.global_discount_type);
    setValue(String(siteSettings.global_discount_value ?? 0));
    setStart(siteSettings.global_discount_start || '');
    setEnd(siteSettings.global_discount_end || '');
  }, [siteSettings]);

  const flash = (t: 'success' | 'error', text: string) => {
    setMessage({ type: t, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSave = async () => {
    const numeric = parseFloat(value) || 0;
    if (active && numeric <= 0) { flash('error', 'Enter a discount value greater than 0.'); return; }
    if (type === 'percentage' && numeric > 100) { flash('error', 'Percentage cannot exceed 100.'); return; }
    setSaving(true);
    try {
      await upsertSiteSetting('global_discount_active', active ? 'true' : 'false');
      await upsertSiteSetting('global_discount_type', type);
      await upsertSiteSetting('global_discount_value', String(numeric));
      await upsertSiteSetting('global_discount_start', start);
      await upsertSiteSetting('global_discount_end', end);
      flash('success', 'Global discount saved. Customers see it after their next page load.');
    } catch (e: any) {
      flash('error', e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const sample = 1000;
  const numeric = parseFloat(value) || 0;
  const sampleDiscounted = Math.max(0, type === 'percentage' ? sample * (1 - numeric / 100) : sample - numeric);

  return (
    <div className="min-h-screen bg-theme-bg">
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" /> <span className="font-medium">Back to Dashboard</span>
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Percent className="w-5 h-5 text-theme-accent" /> Global Discount
          </h1>
          <div className="w-24" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-6 space-y-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-theme-accent focus:ring-theme-accent" />
            <span className="font-semibold text-gray-900">Enable sitewide discount</span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as 'percentage' | 'fixed')} className="input-field">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {type === 'percentage' ? 'Percent off' : 'Amount off'}
              </label>
              <input type="number" min={0} step="0.01" value={value}
                onChange={(e) => setValue(e.target.value)} className="input-field" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Starts (optional)</label>
              <input type="datetime-local" value={toLocalInput(start)}
                onChange={(e) => setStart(fromLocalInput(e.target.value))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ends (optional)</label>
              <input type="datetime-local" value={toLocalInput(end)}
                onChange={(e) => setEnd(fromLocalInput(e.target.value))} className="input-field" />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-800 mb-1">Example on a ₱1,000 item:</p>
            <p>
              <span className="line-through text-gray-400">₱1,000</span>{' → '}
              <span className="font-bold text-theme-accent">₱{sampleDiscounted.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              "Best price wins": for any product with its own sale price, customers get whichever is cheaper —
              the product's discount or this global one. Discounts never stack. Checkout totals are re-validated
              on the server, so the global discount is always applied accurately at payment.
            </span>
          </div>

          <button onClick={handleSave} disabled={saving || loading}
            className="w-full flex items-center justify-center gap-2 bg-theme-accent hover:bg-theme-accent/90 text-white py-3 rounded-lg font-semibold disabled:opacity-60">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Discount'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DiscountManager;
