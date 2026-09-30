import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, Package, Search, Info, Boxes, Layers, Target,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useKitStatus, type KitStatusRow } from '../../hooks/useKitStatus';
import { kitKey } from '../../lib/kitRules';
import type { GroupBuy } from '../../types';
import KitNumberInput from './KitNumberInput';

/**
 * Kits & MOQ for one Group Buy round.
 *
 * Every product assigned to the round is listed — one row per strength for
 * products with variations, since each strength fills its own kits — including
 * ones with no kit size yet, so the admin can switch kit tracking on right here
 * instead of hitting a dead end. Progress numbers come from the group_buy_kit_status view
 * (derived from real orders); the only things written are admin INTENT: the
 * per-round MOQ / kit-size overrides and the Bunuan / done switches.
 */

interface GroupBuyKitPanelProps {
  groupBuy: GroupBuy;
  onBack: () => void;
}

interface OverrideRow {
  product_id: string;
  variation_id: string | null;
  moq_override: number | null;
  kit_size_override: number | null;
  bunuan_enabled: boolean;
  manually_completed: boolean;
}

interface ProductDefaults {
  min_order_quantity: number | null;
  kit_size: number | null;
}

type Filter = 'all' | 'tracked' | 'needs' | 'untracked';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'tracked', label: 'Tracking kits' },
  { key: 'needs', label: 'Needs units' },
  { key: 'untracked', label: 'Not tracked' },
];

const rowKey = (r: KitStatusRow) => kitKey(r.product_id, r.variation_id);
const rowLabel = (r: KitStatusRow) => (r.variation_name ? `${r.product_name} · ${r.variation_name}` : r.product_name);
const isTracked = (r: KitStatusRow) => r.kit_size !== null;
const needsUnits = (r: KitStatusRow) => isTracked(r) && !r.is_complete && r.bunuan_needed > 0;

function matchesFilter(r: KitStatusRow, f: Filter): boolean {
  if (f === 'tracked') return isTracked(r);
  if (f === 'needs') return needsUnits(r);
  if (f === 'untracked') return !isTracked(r);
  return true;
}

const GroupBuyKitPanel: React.FC<GroupBuyKitPanelProps> = ({ groupBuy, onBack }) => {
  const { rows, loading, available, refresh } = useKitStatus(groupBuy.id);
  const [overrides, setOverrides] = useState<Map<string, OverrideRow>>(new Map());
  // kitKey -> the value this row falls back to when its own box is blank.
  const [defaults, setDefaults] = useState<Map<string, ProductDefaults>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busyToggle, setBusyToggle] = useState<string | null>(null);

  const fetchOverrides = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('group_buy_product_kits')
      .select('product_id, variation_id, moq_override, kit_size_override, bunuan_enabled, manually_completed')
      .eq('group_buy_id', groupBuy.id);
    if (err) return; // table not migrated yet — the panel still renders read-only
    setOverrides(new Map((data as OverrideRow[]).map((r) => [kitKey(r.product_id, r.variation_id), r])));
  }, [groupBuy.id]);

  /**
   * What a blank box falls back to: the strength's own default, else the
   * product's. (A legacy product-level round override sits in between —
   * resolved in KitRow from the overrides map.)
   */
  const fetchDefaults = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('products')
      .select('id, min_order_quantity, kit_size, product_variations(id, min_order_quantity, kit_size)')
      .eq('group_buy_id', groupBuy.id);
    if (err) return;
    type Row = ProductDefaults & { id: string; product_variations?: (ProductDefaults & { id: string })[] };
    const map = new Map<string, ProductDefaults>();
    for (const p of (data || []) as Row[]) {
      map.set(p.id, { min_order_quantity: p.min_order_quantity, kit_size: p.kit_size });
      for (const v of p.product_variations || []) {
        map.set(kitKey(p.id, v.id), {
          min_order_quantity: v.min_order_quantity ?? p.min_order_quantity,
          kit_size: v.kit_size ?? p.kit_size,
        });
      }
    }
    setDefaults(map);
  }, [groupBuy.id]);

  useEffect(() => {
    fetchOverrides();
    fetchDefaults();
  }, [fetchOverrides, fetchDefaults]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), fetchOverrides(), fetchDefaults()]);
  }, [refresh, fetchOverrides, fetchDefaults]);

  /**
   * Upsert one override field. Writes only admin intent — never a computed
   * quantity — so there is nothing here that can disagree with the orders.
   * Throws so the calling field can show its own error state.
   */
  const saveOverride = useCallback(async (row: KitStatusRow, patch: Partial<OverrideRow>) => {
    setError(null);
    const key = rowKey(row);
    const { error: err } = await supabase
      .from('group_buy_product_kits')
      .upsert(
        {
          group_buy_id: groupBuy.id,
          product_id: row.product_id,
          variation_id: row.variation_id,
          ...patch,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'group_buy_id,product_id,variation_id' },
      );
    if (err) {
      setError(err.message || 'Could not save that change.');
      throw err;
    }
    setOverrides((prev) => {
      const next = new Map(prev);
      const base = prev.get(key) ?? {
        product_id: row.product_id, variation_id: row.variation_id, moq_override: null, kit_size_override: null,
        bunuan_enabled: true, manually_completed: false,
      };
      next.set(key, { ...base, ...patch });
      return next;
    });
    await refresh();
  }, [groupBuy.id, refresh]);

  const toggle = async (row: KitStatusRow, patch: Partial<OverrideRow>) => {
    setBusyToggle(rowKey(row));
    try {
      await saveOverride(row, patch);
    } catch {
      // error banner already set by saveOverride
    } finally {
      setBusyToggle(null);
    }
  };

  const sorted = useMemo(
    () => [...rows].sort((a, b) => rowLabel(a).localeCompare(rowLabel(b), undefined, { numeric: true })),
    [rows],
  );
  const counts = useMemo(() => ({
    all: rows.length,
    tracked: rows.filter(isTracked).length,
    needs: rows.filter(needsUnits).length,
    untracked: rows.filter((r) => !isTracked(r)).length,
  }), [rows]);
  const totals = useMemo(() => ({
    completeKits: rows.reduce((s, r) => s + (isTracked(r) ? r.complete_kits : 0), 0),
    unitsNeeded: rows.reduce((s, r) => s + (needsUnits(r) ? r.bunuan_needed : 0), 0),
  }), [rows]);

  const q = query.trim().toLowerCase();
  const visible = sorted.filter((r) => matchesFilter(r, filter) && (!q || rowLabel(r).toLowerCase().includes(q)));

  if (!available) {
    return (
      <div className="bg-white rounded-xl border border-amber-200 p-6">
        <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
          <div>
            <h3 className="font-bold text-gray-900">Kit tracking is not set up yet</h3>
            <p className="mt-1 text-sm text-gray-600">
              The database is missing the MOQ &amp; kit tables. Contact your developer to apply them.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    { icon: Package, label: 'Products & sizes', value: counts.all, tone: 'text-gray-900' },
    { icon: Layers, label: 'Tracking kits', value: counts.tracked, tone: 'text-purple-700' },
    { icon: Boxes, label: 'Complete kits', value: totals.completeKits, tone: 'text-green-700' },
    { icon: Target, label: 'Units needed to finish kits', value: totals.unitsNeeded, tone: 'text-amber-700' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <button onClick={onBack} className="mb-1 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft className="h-4 w-4" /> Back to rounds
          </button>
          <h3 className="text-lg md:text-xl font-bold text-gray-900">Kits &amp; MOQ — GB #{groupBuy.gb_number}</h3>
          <p className="text-sm text-gray-500">Set the minimum order and kit size for this round, and watch each kit fill up.</p>
        </div>
        <button
          onClick={refreshAll}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {stats.map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
              <Icon className="h-3.5 w-3.5" /> {label}
            </div>
            <div className={`mt-0.5 text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="mb-4 flex gap-2.5 rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-2.5 text-[13px] text-purple-900">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-500" />
        <div className="space-y-0.5">
          <p><b>Min order</b> — the smallest quantity of one size a customer can buy. <b>Kit size</b> — units in one full kit of that size, counting all customers together. Each size (5mg, 10mg…) fills its own kits.</p>
          <p className="text-purple-800/80">
            Values typed here apply to this round only; leave a box blank to use the product's own setting.
            Products without a kit size are never shown in Bunuan. Cancelled, refunded and failed orders are not counted.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {/* Toolbar */}
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter products">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filter === key ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label} <span className="opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>
        <label className="relative md:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </label>
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center">
          <Package className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="font-semibold text-gray-700">No products in this round yet</p>
          <p className="mt-1 text-sm text-gray-500">Go back and use <b>Assign Products</b> to add products to GB #{groupBuy.gb_number}.</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">No products match this filter.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          <li className="hidden grid-cols-[minmax(0,2.2fr)_1fr_1fr_minmax(0,1.6fr)_auto] gap-4 bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 md:grid">
            <span>Product</span><span>Min order</span><span>Kit size</span><span>Kit progress</span><span className="w-40">Bunuan</span>
          </li>
          {visible.map((row) => (
            <KitRow
              key={rowKey(row)}
              row={row}
              override={overrides.get(rowKey(row))}
              productOverride={row.variation_id ? overrides.get(row.product_id) : undefined}
              productDefaults={defaults.get(rowKey(row)) ?? defaults.get(row.product_id)}
              isBusy={busyToggle === rowKey(row)}
              onSave={saveOverride}
              onToggle={toggle}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

type KitRowProps = {
  row: KitStatusRow;
  override?: OverrideRow;
  /** A legacy product-level round override, inherited by every size. */
  productOverride?: OverrideRow;
  productDefaults?: ProductDefaults;
  isBusy: boolean;
  onSave: (row: KitStatusRow, patch: Partial<OverrideRow>) => Promise<void>;
  onToggle: (row: KitStatusRow, patch: Partial<OverrideRow>) => void;
};

function KitRow({ row, override, productOverride, productDefaults, isBusy, onSave, onToggle }: KitRowProps) {
  const tracked = isTracked(row);
  const kitSize = row.kit_size ?? 0;
  // Switches resolve size row -> product row -> default, like the database.
  const bunuanOn = (override?.bunuan_enabled ?? productOverride?.bunuan_enabled) !== false;
  const done = (override?.manually_completed ?? productOverride?.manually_completed) === true;
  // The view reports an empty round as "complete" (nothing is missing), which
  // reads as "kit full" to a person — so no-orders is its own state here.
  const hasOrders = row.eligible_qty > 0;
  const isFull = hasOrders && row.is_complete && !done;
  const pct = tracked && kitSize > 0 ? Math.round(((isFull ? kitSize : row.in_progress) / kitSize) * 100) : 0;
  const progressLabel = !hasOrders
    ? `0 / ${kitSize} · No orders yet`
    : isFull ? 'All kits full' : `${row.in_progress} / ${kitSize} in current kit`;
  const label = rowLabel(row);
  const moqFallback = productOverride?.moq_override ?? productDefaults?.min_order_quantity ?? null;
  const kitFallback = productOverride?.kit_size_override ?? productDefaults?.kit_size ?? null;

  return (
    <li className="grid grid-cols-1 gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_minmax(0,1.6fr)_auto] md:items-start md:gap-4">
      {/* Product */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {row.image_url
            ? <img src={row.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <Package className="m-2.5 h-5 w-5 text-gray-300" />}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900" title={label}>
            {row.product_name}
            {row.variation_name && (
              <span className="ml-1.5 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-700">{row.variation_name}</span>
            )}
          </p>
          <p className="text-xs text-gray-500">{row.eligible_qty} ordered this round</p>
        </div>
      </div>

      {/* Min order */}
      <div className="flex items-start gap-2 md:block">
        <span className="w-20 pt-2 text-xs font-medium text-gray-500 md:hidden">Min order</span>
        <KitNumberInput
          label={`Minimum order for ${label}`}
          value={override?.moq_override ?? null}
          fallback={moqFallback}
          fallbackLabel="No min"
          onSave={(next) => onSave(row, { moq_override: next })}
        />
      </div>

      {/* Kit size */}
      <div className="flex items-start gap-2 md:block">
        <span className="w-20 pt-2 text-xs font-medium text-gray-500 md:hidden">Kit size</span>
        <KitNumberInput
          label={`Kit size for ${label}`}
          value={override?.kit_size_override ?? null}
          fallback={kitFallback}
          fallbackLabel="Not tracked"
          onSave={(next) => onSave(row, { kit_size_override: next })}
        />
      </div>

      {/* Progress */}
      <div className="md:pt-1">
        {!tracked ? (
          <p className="text-xs text-gray-400">Not tracked — enter a kit size to start.</p>
        ) : (
          <>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className={`font-semibold ${hasOrders ? 'text-gray-800' : 'text-gray-400'}`}>{progressLabel}</span>
              <span className="text-gray-500">{row.complete_kits} full</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className={`h-full rounded-full transition-all ${isFull ? 'bg-green-500' : 'bg-purple-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Bunuan */}
      <div className="flex flex-wrap items-center gap-2 md:w-40 md:flex-col md:items-stretch">
        {tracked && (
          done ? (
            <span className="inline-flex items-center justify-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Marked done
            </span>
          ) : !hasOrders ? (
            <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">
              Waiting for orders
            </span>
          ) : isFull ? (
            <span className="inline-flex items-center justify-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Complete
            </span>
          ) : (
            <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold ${
              bunuanOn ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'
            }`}>
              Needs {row.bunuan_needed}{bunuanOn ? '' : ' · Bunuan off'}
            </span>
          )
        )}
        <label className={`flex items-center gap-1.5 text-xs ${tracked ? 'text-gray-700' : 'text-gray-300'}`}
          title={tracked ? undefined : 'Set a kit size first'}>
          <input type="checkbox" className="h-4 w-4 accent-purple-600" checked={bunuanOn}
            disabled={!tracked || isBusy} onChange={(e) => onToggle(row, { bunuan_enabled: e.target.checked })} />
          Show in Bunuan
        </label>
        <label className={`flex items-center gap-1.5 text-xs ${tracked ? 'text-gray-700' : 'text-gray-300'}`}
          title={tracked ? 'Treat this kit as complete even if short' : 'Set a kit size first'}>
          <input type="checkbox" className="h-4 w-4 accent-purple-600" checked={done}
            disabled={!tracked || isBusy} onChange={(e) => onToggle(row, { manually_completed: e.target.checked })} />
          Mark as done
        </label>
      </div>
    </li>
  );
}

export default GroupBuyKitPanel;
