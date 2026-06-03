import React, { useEffect, useRef, useState } from 'react';
import {
  Upload, Trash2, Save, GripVertical, Eye, ArrowUp, ArrowDown,
  Image as ImageIcon, Power, X, RefreshCw, AlertTriangle, RotateCcw,
} from 'lucide-react';
import { useHeroCarousel } from '../../hooks/useHeroCarousel';
import { useImageUpload } from '../../hooks/useImageUpload';
import { compressImage, validateImageFile } from '../../utils/imageCompression';
import type { HeroSlide } from '../../types';

interface Draft {
  title: string;
  subtitle: string;
  button_text: string;
  button_link: string;
}

const emptyDraft = (s: HeroSlide): Draft => ({
  title: s.title ?? '',
  subtitle: s.subtitle ?? '',
  button_text: s.button_text ?? '',
  button_link: s.button_link ?? '',
});

const HeroCarouselManager: React.FC = () => {
  const {
    slides, available, loading, nextSortOrder, refresh,
    addSlide, updateSlide, deleteSlide, toggleActive, reorder,
  } = useHeroCarousel();
  const { uploadImage } = useImageUpload('menu-images', true);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<HeroSlide | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // Keep a local editable draft per slide; pick up new slides, drop deleted ones,
  // never clobber an in-progress edit.
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, Draft> = {};
      for (const s of slides) next[s.id] = prev[s.id] ?? emptyDraft(s);
      return next;
    });
  }, [slides]);

  const orderedIds = slides.map((s) => s.id);

  const uploadOne = async (file: File, sortOrder: number) => {
    const v = validateImageFile(file);
    if (!v.ok) return false; // counted as failed; consolidated message shown after the batch
    const compressed = await compressImage(file);
    const url = await uploadImage(compressed);
    const res = await addSlide({ image_url: url, sort_order: sortOrder, is_active: true });
    return res.success;
  };

  const handleAddFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let order = nextSortOrder;
    let added = 0;
    let failed = 0;
    for (const file of Array.from(files)) {
      try {
        if (await uploadOne(file, order)) { order++; added++; }
        else failed++;
      } catch {
        failed++;
      }
    }
    setBusy(false);
    if (addInputRef.current) addInputRef.current.value = '';
    if (added && !failed) flash('success', `${added} image${added === 1 ? '' : 's'} added.`);
    else if (added && failed) flash('error', `Added ${added}; ${failed} failed (use JPG/PNG/WEBP under 10MB).`);
    else if (failed) flash('error', `Upload failed for ${failed} file${failed === 1 ? '' : 's'} (use JPG/PNG/WEBP under 10MB).`);
  };

  const startReplace = (id: string) => {
    replaceTargetId.current = id;
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (files: FileList | null) => {
    const id = replaceTargetId.current;
    if (!id || !files || !files[0]) return;
    setBusy(true);
    try {
      const v = validateImageFile(files[0]);
      if (!v.ok) { flash('error', v.error || 'Invalid image'); }
      else {
        const compressed = await compressImage(files[0]);
        const url = await uploadImage(compressed);
        const res = await updateSlide(id, { image_url: url });
        flash(res.success ? 'success' : 'error', res.success ? 'Image replaced.' : (res.error || 'Failed'));
      }
    } catch (e: any) {
      flash('error', e?.message || 'Replace failed');
    } finally {
      setBusy(false);
      replaceTargetId.current = null;
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const saveSlide = async (id: string) => {
    const d = drafts[id];
    if (!d) return;
    const res = await updateSlide(id, {
      title: d.title.trim() || null,
      subtitle: d.subtitle.trim() || null,
      button_text: d.button_text.trim() || null,
      button_link: d.button_link.trim() || null,
    });
    flash(res.success ? 'success' : 'error', res.success ? 'Slide saved.' : (res.error || 'Failed'));
  };

  const handleDelete = async (s: HeroSlide) => {
    if (!window.confirm('Delete this slide? This removes it from the homepage carousel.')) return;
    const res = await deleteSlide(s.id);
    flash(res.success ? 'success' : 'error', res.success ? 'Slide deleted.' : (res.error || 'Failed'));
  };

  const move = async (id: string, dir: -1 | 1) => {
    const ids = [...orderedIds];
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorder(ids);
  };

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const ids = orderedIds.filter((id) => id !== dragId);
    const idx = ids.indexOf(targetId);
    ids.splice(idx, 0, dragId);
    setDragId(null);
    await reorder(ids);
  };

  if (!available) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
        <div>
          <h2 className="font-bold text-amber-900 mb-1">Carousel table not found</h2>
          <p className="text-sm text-amber-800">
            Run <code className="bg-amber-100 px-1 rounded">supabase/migrations/20260603000004_add_hero_carousel.sql</code> in your
            Supabase SQL editor, then refresh. Until then the homepage shows the static hero.
          </p>
          <button onClick={refresh} className="mt-3 text-sm font-semibold text-amber-900 underline">Refresh</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* Upload zone */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{slides.length} slide{slides.length === 1 ? '' : 's'} · drag, or use ↑ ↓ to reorder</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="text-gray-500 hover:text-gray-800 p-2" title="Refresh">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => addInputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-2 bg-theme-accent hover:bg-theme-accent/90 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow disabled:opacity-60"
          >
            <Upload className="w-4 h-4" /> {busy ? 'Uploading…' : 'Upload Images'}
          </button>
        </div>
      </div>

      <input ref={addInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/*" multiple className="hidden"
        onChange={(e) => handleAddFiles(e.target.files)} />
      <input ref={replaceInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/*" className="hidden"
        onChange={(e) => handleReplaceFile(e.target.files)} />

      {slides.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-400">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
          No slides yet. Upload JPG/PNG/WEBP images — they appear on the homepage hero instantly.
          <br />
          <span className="text-xs">With no slides, the homepage shows the static hero (configured in the Content tab).</span>
        </div>
      ) : (
        <div className="space-y-3">
          {slides.map((s, i) => {
            const d = drafts[s.id] ?? emptyDraft(s);
            return (
              <div
                key={s.id}
                draggable
                onDragStart={() => setDragId(s.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(s.id)}
                className={`bg-white rounded-xl shadow-soft border p-4 flex flex-col md:flex-row gap-4 ${dragId === s.id ? 'border-theme-accent ring-2 ring-theme-accent/30' : 'border-gray-100'} ${!s.is_active ? 'opacity-60' : ''}`}
              >
                {/* Drag handle + reorder + thumbnail */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-center text-gray-300">
                    <GripVertical className="w-5 h-5 cursor-grab" />
                    <div className="flex md:flex-col">
                      <button onClick={() => move(s.id, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 p-0.5" title="Move up"><ArrowUp className="w-4 h-4" /></button>
                      <button onClick={() => move(s.id, 1)} disabled={i === slides.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 p-0.5" title="Move down"><ArrowDown className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="w-28 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    <img src={s.image_url} alt={s.title || 'slide'} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  </div>
                </div>

                {/* Editable content */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className="input-field !py-2 text-sm" placeholder="Title (optional)"
                    value={d.title} onChange={(e) => setDrafts((p) => ({ ...p, [s.id]: { ...d, title: e.target.value } }))} />
                  <input className="input-field !py-2 text-sm" placeholder="Subtitle (optional)"
                    value={d.subtitle} onChange={(e) => setDrafts((p) => ({ ...p, [s.id]: { ...d, subtitle: e.target.value } }))} />
                  <input className="input-field !py-2 text-sm" placeholder="Button text (optional)"
                    value={d.button_text} onChange={(e) => setDrafts((p) => ({ ...p, [s.id]: { ...d, button_text: e.target.value } }))} />
                  <input className="input-field !py-2 text-sm" placeholder="Button link e.g. /  or https://… (optional)"
                    value={d.button_link} onChange={(e) => setDrafts((p) => ({ ...p, [s.id]: { ...d, button_link: e.target.value } }))} />
                </div>

                {/* Actions */}
                <div className="flex md:flex-col flex-wrap gap-2 justify-end">
                  <button onClick={() => saveSlide(s.id)} className="flex items-center gap-1.5 bg-theme-accent text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-theme-accent/90"><Save className="w-3.5 h-3.5" /> Save</button>
                  <button onClick={() => toggleActive(s.id, !s.is_active)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${s.is_active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}><Power className="w-3.5 h-3.5" /> {s.is_active ? 'Visible' : 'Hidden'}</button>
                  <button onClick={() => startReplace(s.id)} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-200"><RotateCcw className="w-3.5 h-3.5" /> Replace</button>
                  <button onClick={() => setPreview(s)} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-200"><Eye className="w-3.5 h-3.5" /> Preview</button>
                  <button onClick={() => handleDelete(s)} className="flex items-center gap-1.5 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreview(null)} className="absolute -top-3 -right-3 z-10 bg-white rounded-full p-1.5 shadow"><X className="w-5 h-5" /></button>
            <div className="relative w-full h-[60vh] max-h-[520px] rounded-xl overflow-hidden bg-theme-blue">
              <img src={preview.image_url} alt={preview.title || 'preview'} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-black/30" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                {preview.title && <h2 className="font-display text-3xl sm:text-5xl font-semibold text-white drop-shadow">{preview.title}</h2>}
                {preview.subtitle && <p className="mt-3 text-white/90 text-lg drop-shadow">{preview.subtitle}</p>}
                <span className="mt-6 inline-block bg-theme-navy text-white px-7 py-3 rounded-full text-sm font-semibold">
                  {preview.button_text || 'Explore Products'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HeroCarouselManager;
