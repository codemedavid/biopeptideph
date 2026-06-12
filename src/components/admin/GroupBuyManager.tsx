import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Plus, Edit, Trash2, Save, X, Package, Play, Square,
  Calendar, ShoppingBag, RefreshCw, AlertTriangle, Tag, FileSpreadsheet,
  ToggleRight, Eye, EyeOff, CheckCircle2, XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useGroupBuys, type GroupBuyInput } from '../../hooks/useGroupBuys';
import { useGroupBuyAvailability } from '../../hooks/useGroupBuyAvailability';
import { downloadGroupBuyReport } from '../../utils/groupBuyReport';
import type { GroupBuy, GroupBuyStatus } from '../../types';

interface GroupBuyManagerProps {
  onBack: () => void;
}

interface AssignProduct {
  id: string;
  name: string;
  image_url: string | null;
  group_buy_id: string | null;
}

// datetime-local <-> ISO helpers
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(val: string): string | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const STATUS_STYLES: Record<GroupBuyStatus, string> = {
  active: 'bg-green-100 text-green-700',
  upcoming: 'bg-amber-100 text-amber-700',
  closed: 'bg-gray-200 text-gray-600',
};

const GroupBuyManager: React.FC<GroupBuyManagerProps> = ({ onBack }) => {
  const {
    groupBuys, available, loading, nextGbNumber, refresh,
    createGroupBuy, updateGroupBuy, setStatus, deleteGroupBuy, setProductGroupBuy,
  } = useGroupBuys();

  const [view, setView] = useState<'list' | 'form' | 'assign' | 'availability'>('list');
  const [editing, setEditing] = useState<GroupBuy | null>(null);
  const [assignTarget, setAssignTarget] = useState<GroupBuy | null>(null);
  const [availabilityTarget, setAvailabilityTarget] = useState<GroupBuy | null>(null);

  // Per-GB availability for the GB currently open in the availability view.
  const {
    availabilityMap, behavior, available: availTableExists,
    setAvailability, setBehavior,
  } = useGroupBuyAvailability(availabilityTarget?.id);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // order counts per group buy
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  // products (for assignment + per-GB product counts)
  const [allProducts, setAllProducts] = useState<AssignProduct[]>([]);

  const [form, setForm] = useState<GroupBuyInput>({
    gb_number: '1', title: '', description: '', start_date: null, end_date: null, status: 'upcoming',
  });

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const loadAux = async () => {
    // Product assignments (all products, not just available ones)
    const { data: prods } = await supabase
      .from('products')
      .select('id, name, image_url, group_buy_id')
      .order('name', { ascending: true });
    if (prods) setAllProducts(prods as AssignProduct[]);

    // Order counts per GB (column may not exist before migration)
    const { data: ords, error } = await supabase.from('orders').select('group_buy_id');
    if (!error && ords) {
      const counts: Record<string, number> = {};
      for (const o of ords as { group_buy_id: string | null }[]) {
        if (o.group_buy_id) counts[o.group_buy_id] = (counts[o.group_buy_id] || 0) + 1;
      }
      setOrderCounts(counts);
    }
  };

  useEffect(() => {
    if (available) loadAux();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, groupBuys.length]);

  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allProducts) {
      if (p.group_buy_id) counts[p.group_buy_id] = (counts[p.group_buy_id] || 0) + 1;
    }
    return counts;
  }, [allProducts]);

  const openCreate = () => {
    setEditing(null);
    setForm({ gb_number: nextGbNumber, title: '', description: '', start_date: null, end_date: null, status: 'upcoming' });
    setView('form');
  };

  const openEdit = (gb: GroupBuy) => {
    setEditing(gb);
    setForm({
      gb_number: gb.gb_number, title: gb.title, description: gb.description ?? '',
      start_date: gb.start_date, end_date: gb.end_date, status: gb.status,
    });
    setView('form');
  };

  const handleSave = async () => {
    if (!form.title.trim()) { flash('error', 'Title is required.'); return; }
    if (!form.gb_number.trim()) { flash('error', 'GB number is required.'); return; }
    setSaving(true);
    const payload: GroupBuyInput = {
      gb_number: form.gb_number.trim(),
      title: form.title.trim(),
      description: form.description?.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date,
      status: form.status,
    };
    const res = editing ? await updateGroupBuy(editing.id, payload) : await createGroupBuy(payload);
    setSaving(false);
    if (res.success) {
      flash('success', editing ? 'Group buy updated.' : 'Group buy created.');
      setView('list');
    } else {
      flash('error', res.error || 'Save failed.');
    }
  };

  const handleDownloadReport = async (gb: GroupBuy) => {
    const { data, error } = await supabase.from('orders').select('*').eq('group_buy_id', gb.id);
    if (error) { flash('error', 'Could not load orders for the report.'); return; }
    if (!data || data.length === 0) { flash('error', 'No orders for this group buy yet.'); return; }
    try {
      await downloadGroupBuyReport(gb, data as any);
      flash('success', `Report generated (${data.length} order${data.length === 1 ? '' : 's'}).`);
    } catch (e: any) {
      flash('error', e?.message || 'Failed to generate report.');
    }
  };

  const handleStatus = async (gb: GroupBuy, status: GroupBuyStatus) => {
    const res = await setStatus(gb.id, status);
    if (res.success) {
      flash('success', status === 'active' ? `GB #${gb.gb_number} is now active.` : `GB #${gb.gb_number} ${status}.`);
      // Auto-offer the supplier/inventory report when a round closes.
      if (status === 'closed' && window.confirm(`Group Buy #${gb.gb_number} closed. Download the supplier & inventory report now?`)) {
        handleDownloadReport(gb);
      }
    } else {
      flash('error', res.error || 'Failed.');
    }
  };

  const handleDelete = async (gb: GroupBuy) => {
    if (!window.confirm(`Delete Group Buy #${gb.gb_number} "${gb.title}"? Assigned products and past orders are kept but unlinked.`)) return;
    const res = await deleteGroupBuy(gb.id);
    if (res.success) flash('success', 'Group buy deleted.');
    else flash('error', res.error || 'Delete failed.');
  };

  const toggleAssign = async (product: AssignProduct) => {
    if (!assignTarget) return;
    const next = product.group_buy_id === assignTarget.id ? null : assignTarget.id;
    // optimistic
    setAllProducts((cur) => cur.map((p) => (p.id === product.id ? { ...p, group_buy_id: next } : p)));
    const res = await setProductGroupBuy(product.id, next);
    if (!res.success) {
      flash('error', res.error || 'Failed to assign');
      loadAux(); // revert from source of truth
    }
  };

  const Header = (
    <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-5 h-5" /> <span className="font-medium">Back to Dashboard</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-theme-accent" /> Group Buys
        </h1>
        <button onClick={refresh} className="text-gray-500 hover:text-gray-800" title="Refresh">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );

  if (!available) {
    return (
      <div className="min-h-screen bg-theme-bg">
        {Header}
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div>
              <h2 className="font-bold text-amber-900 mb-1">Group Buy tables not found</h2>
              <p className="text-sm text-amber-800">
                Run <code className="bg-amber-100 px-1 rounded">supabase/migrations/20260603000002_add_group_buys.sql</code> in
                your Supabase SQL editor, then click refresh. The rest of the store keeps working without it.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-bg">
      {Header}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        {/* ---- LIST ---- */}
        {view === 'list' && (
          <>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-500">{groupBuys.length} group buy{groupBuys.length === 1 ? '' : 's'}</p>
              <button onClick={openCreate} className="flex items-center gap-2 bg-theme-accent hover:bg-theme-accent/90 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow">
                <Plus className="w-4 h-4" /> New Group Buy
              </button>
            </div>

            {groupBuys.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" />
                No group buys yet. Create your first round.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groupBuys.map((gb) => (
                  <div key={gb.id} className="bg-white rounded-xl shadow-soft border border-gray-100 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg font-bold text-gray-900">GB #{gb.gb_number}</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${STATUS_STYLES[gb.status]}`}>
                            {gb.status}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-700">{gb.title}</p>
                      </div>
                    </div>

                    {gb.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{gb.description}</p>}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {gb.start_date ? new Date(gb.start_date).toLocaleDateString() : '—'} → {gb.end_date ? new Date(gb.end_date).toLocaleDateString() : '—'}
                      </span>
                      <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> {productCounts[gb.id] || 0} products</span>
                      <span className="flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5" /> {orderCounts[gb.id] || 0} orders</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {gb.status !== 'active' ? (
                        <button onClick={() => handleStatus(gb, 'active')} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
                          <Play className="w-3.5 h-3.5" /> Open
                        </button>
                      ) : (
                        <button onClick={() => handleStatus(gb, 'closed')} className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
                          <Square className="w-3.5 h-3.5" /> Close
                        </button>
                      )}
                      <button onClick={() => { setAssignTarget(gb); setView('assign'); }} className="flex items-center gap-1.5 bg-theme-accent/10 hover:bg-theme-accent/20 text-theme-accent px-3 py-1.5 rounded-lg text-xs font-semibold">
                        <Package className="w-3.5 h-3.5" /> Assign Products
                      </button>
                      <button onClick={() => { setAvailabilityTarget(gb); setView('availability'); }} className="flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
                        <ToggleRight className="w-3.5 h-3.5" /> Availability
                      </button>
                      <button onClick={() => handleDownloadReport(gb)} className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Report
                      </button>
                      <button onClick={() => openEdit(gb)} className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
                        <Edit className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => handleDelete(gb)} className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-semibold">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ---- CREATE / EDIT FORM ---- */}
        {view === 'form' && (
          <div className="max-w-xl mx-auto bg-white rounded-xl shadow-soft border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">{editing ? `Edit GB #${editing.gb_number}` : 'New Group Buy'}</h2>
              <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GB Number *</label>
                  <input type="text" value={form.gb_number}
                    onChange={(e) => setForm((f) => ({ ...f, gb_number: e.target.value }))}
                    className="input-field" placeholder="e.g. 5 or Mini GB" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as GroupBuyStatus }))}
                    className="input-field">
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input type="text" value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="input-field" placeholder="e.g. June Peptide Round" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description ?? ''} rows={3}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="input-field" placeholder="Optional notes shown to customers" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input type="datetime-local" value={toLocalInput(form.start_date ?? null)}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: fromLocalInput(e.target.value) }))}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input type="datetime-local" value={toLocalInput(form.end_date ?? null)}
                    onChange={(e) => setForm((f) => ({ ...f, end_date: fromLocalInput(e.target.value) }))}
                    className="input-field" />
                </div>
              </div>

              {form.status === 'active' && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Setting this active will close any other active round.
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-theme-accent hover:bg-theme-accent/90 text-white py-2.5 rounded-lg font-semibold disabled:opacity-60">
                  <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setView('list')} className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---- ASSIGN PRODUCTS ---- */}
        {view === 'assign' && assignTarget && (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <button onClick={() => setView('list')} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-1">
                  <ArrowLeft className="w-4 h-4" /> Back to list
                </button>
                <h2 className="text-lg font-bold text-gray-900">Assign products to GB #{assignTarget.gb_number}</h2>
                <p className="text-xs text-gray-500">Tap a product to add/remove it from this round. A product belongs to one round at a time.</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-soft border border-gray-100 divide-y divide-gray-100">
              {allProducts.length === 0 && <p className="p-6 text-sm text-gray-400 text-center">No products found.</p>}
              {allProducts.map((p) => {
                const assignedHere = p.group_buy_id === assignTarget.id;
                const assignedElsewhere = !!p.group_buy_id && !assignedHere;
                return (
                  <button key={p.id} onClick={() => toggleAssign(p)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      {assignedElsewhere && <p className="text-[11px] text-amber-600">Currently in another round — tap to move here</p>}
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${assignedHere ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {assignedHere ? 'Assigned' : 'Add'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- PRODUCT AVAILABILITY (per GB) ---- */}
        {view === 'availability' && availabilityTarget && (
          <div className="max-w-3xl mx-auto">
            <div className="mb-4">
              <button onClick={() => setView('list')} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-1">
                <ArrowLeft className="w-4 h-4" /> Back to list
              </button>
              <h2 className="text-lg font-bold text-gray-900">Product availability — GB #{availabilityTarget.gb_number}</h2>
              <p className="text-xs text-gray-500">Turn products ON/OFF for this Group Buy only. This never changes a product's global availability.</p>
            </div>

            {!availTableExists ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  Run <code className="bg-amber-100 px-1 rounded">supabase/migrations/20260603000005_add_gb_product_availability.sql</code> to enable this feature.
                </p>
              </div>
            ) : (
              <>
                {/* Behavior selector */}
                <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-4 mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">When a product is turned OFF, on the storefront:</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => { await setBehavior('hide'); flash('success', 'Unavailable products will be hidden.'); }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold ${behavior === 'hide' ? 'bg-theme-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      <EyeOff className="w-3.5 h-3.5" /> Hide from store
                    </button>
                    <button
                      onClick={async () => { await setBehavior('disable'); flash('success', 'Unavailable products will show as "Currently Unavailable".'); }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold ${behavior === 'disable' ? 'bg-theme-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      <Eye className="w-3.5 h-3.5" /> Show as unavailable
                    </button>
                  </div>
                </div>

                {/* Assigned products list with toggles */}
                <div className="bg-white rounded-xl shadow-soft border border-gray-100 divide-y divide-gray-100">
                  {allProducts.filter((p) => p.group_buy_id === availabilityTarget.id).length === 0 && (
                    <p className="p-6 text-sm text-gray-400 text-center">
                      No products assigned to this Group Buy yet. Use “Assign Products” first.
                    </p>
                  )}
                  {allProducts.filter((p) => p.group_buy_id === availabilityTarget.id).map((p) => {
                    const isAvail = availabilityMap.get(p.id) ?? true;
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                          {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-gray-400" />}
                        </div>
                        <p className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">{p.name}</p>
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${isAvail ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                          {isAvail ? <><CheckCircle2 className="w-3.5 h-3.5" /> Available</> : <><XCircle className="w-3.5 h-3.5" /> Unavailable</>}
                        </span>
                        <button
                          onClick={async () => {
                            const res = await setAvailability(p.id, !isAvail);
                            if (!res.success) flash('error', res.error || 'Failed');
                          }}
                          aria-label={isAvail ? 'Turn off' : 'Turn on'}
                          className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${isAvail ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isAvail ? 'translate-x-6' : ''}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GroupBuyManager;
