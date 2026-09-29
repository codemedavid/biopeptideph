import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, Ban } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useKitStatus } from '../../hooks/useKitStatus';
import type { GroupBuy } from '../../types';

/**
 * Kits & MOQ for one Group Buy round.
 *
 * Shows the WORKING, not just the answer. An admin seeing "needs 2" should be
 * able to see the kit size, the eligible quantity, how many kits are already
 * complete and where the current one stands — otherwise the number is something
 * to trust rather than something to check. Every figure is derived from real
 * orders by the group_buy_kit_status view; nothing here is a stored counter.
 *
 * The only editable values are admin INTENT (per-round overrides and switches).
 */

interface GroupBuyKitPanelProps {
  groupBuy: GroupBuy;
  onBack: () => void;
}

interface OverrideRow {
  product_id: string;
  moq_override: number | null;
  kit_size_override: number | null;
  bunuan_enabled: boolean;
  manually_completed: boolean;
}

const GroupBuyKitPanel: React.FC<GroupBuyKitPanelProps> = ({ groupBuy, onBack }) => {
  const { rows, loading, available, refresh } = useKitStatus(groupBuy.id);
  const [overrides, setOverrides] = useState<Map<string, OverrideRow>>(new Map());
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOverrides = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('group_buy_product_kits')
      .select('product_id, moq_override, kit_size_override, bunuan_enabled, manually_completed')
      .eq('group_buy_id', groupBuy.id);
    if (err) return; // table not migrated yet — the panel still renders read-only
    setOverrides(new Map((data as OverrideRow[]).map((r) => [r.product_id, r])));
  }, [groupBuy.id]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  /**
   * Upsert one override field. Writes only admin intent — never a computed
   * quantity — so there is nothing here that can disagree with the orders.
   */
  const saveOverride = async (productId: string, patch: Partial<OverrideRow>) => {
    setSaving(productId);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('group_buy_product_kits')
        .upsert(
          {
            group_buy_id: groupBuy.id,
            product_id: productId,
            ...patch,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'group_buy_id,product_id' },
        );
      if (err) throw err;
      await fetchOverrides();
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Could not save that change.');
    } finally {
      setSaving(null);
    }
  };

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
              Apply the MOQ migrations (<code>supabase/migrations/20260922*</code>)
              in the Supabase SQL editor, then reload this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const tracked = rows.filter((r) => r.kit_size !== null);
  const untracked = rows.filter((r) => r.kit_size === null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <button onClick={onBack} className="mb-1 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft className="h-4 w-4" /> Back to rounds
          </button>
          <h3 className="text-lg font-bold text-gray-900">
            Kits &amp; MOQ — GB #{groupBuy.gb_number}
          </h3>
          <p className="text-sm text-gray-500">
            Every number below is calculated from live orders. Cancelled, refunded
            and failed orders are excluded automatically.
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {tracked.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          No products in this round have a kit size yet. Set one on a product to
          start tracking its kits.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3 font-semibold">Product</th>
                <th className="py-2 px-3 font-semibold">MOQ</th>
                <th className="py-2 px-3 font-semibold">Kit size</th>
                <th className="py-2 px-3 font-semibold">Ordered</th>
                <th className="py-2 px-3 font-semibold">Complete kits</th>
                <th className="py-2 px-3 font-semibold">Current kit</th>
                <th className="py-2 px-3 font-semibold">Bunuan needed</th>
                <th className="py-2 pl-3 font-semibold">Overrides</th>
              </tr>
            </thead>
            <tbody>
              {tracked.map((row) => {
                const o = overrides.get(row.product_id);
                const isSaving = saving === row.product_id;
                return (
                  <tr key={row.product_id} className="border-b border-gray-100 align-middle">
                    <td className="py-3 pr-3">
                      <span className="font-semibold text-gray-900">{row.product_name}</span>
                    </td>
                    <td className="px-3 text-gray-700">{row.effective_moq}</td>
                    <td className="px-3 text-gray-700">{row.kit_size}</td>
                    <td className="px-3 text-gray-700">{row.eligible_qty}</td>
                    <td className="px-3 text-gray-700">{row.complete_kits}</td>
                    <td className="px-3">
                      <span className="font-medium text-gray-900">
                        {row.in_progress} / {row.kit_size}
                      </span>
                    </td>
                    <td className="px-3">
                      {row.is_complete ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                          <CheckCircle2 className="h-3 w-3" /> Complete
                        </span>
                      ) : row.bunuan_available === 0 ? (
                        // Needed but not sellable — shown explicitly rather than
                        // collapsed to "0", which would read as "complete".
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">
                          <Ban className="h-3 w-3" /> {row.bunuan_needed} (off)
                        </span>
                      ) : (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
                          {row.bunuan_available}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pl-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          MOQ
                          <input
                            type="number"
                            min={1}
                            placeholder="—"
                            defaultValue={o?.moq_override ?? ''}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const next = raw === '' ? null : Math.max(1, Number(raw));
                              if (next !== (o?.moq_override ?? null)) {
                                saveOverride(row.product_id, { moq_override: next });
                              }
                            }}
                            className="w-14 rounded border border-gray-300 px-1.5 py-1 text-xs"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          Kit
                          <input
                            type="number"
                            min={1}
                            placeholder="—"
                            defaultValue={o?.kit_size_override ?? ''}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const next = raw === '' ? null : Math.max(1, Number(raw));
                              if (next !== (o?.kit_size_override ?? null)) {
                                saveOverride(row.product_id, { kit_size_override: next });
                              }
                            }}
                            className="w-14 rounded border border-gray-300 px-1.5 py-1 text-xs"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={o?.bunuan_enabled !== false}
                            onChange={(e) => saveOverride(row.product_id, { bunuan_enabled: e.target.checked })}
                            disabled={isSaving}
                          />
                          Bunuan
                        </label>
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={o?.manually_completed === true}
                            onChange={(e) => saveOverride(row.product_id, { manually_completed: e.target.checked })}
                            disabled={isSaving}
                          />
                          Mark done
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {untracked.length > 0 && (
        <p className="mt-4 text-xs text-gray-500">
          {untracked.length} product{untracked.length === 1 ? '' : 's'} in this round
          {untracked.length === 1 ? ' has' : ' have'} no kit size, so {untracked.length === 1 ? 'it is' : 'they are'}{' '}
          never included in Bunuan: {untracked.map((r) => r.product_name).join(', ')}
        </p>
      )}
    </div>
  );
};

export default GroupBuyKitPanel;
