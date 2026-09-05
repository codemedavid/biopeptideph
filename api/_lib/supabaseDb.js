/**
 * Data layer backed by the Supabase REST API using the SERVICE-ROLE key, over
 * HTTPS — NO direct Postgres connection, so no pooler and no IPv6 problem on
 * serverless. Implements the same shape as `pgDb` (api/_lib/db.js) so it drops
 * straight into createApp({ db }).
 *
 * Requires: SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
 * The service-role key bypasses RLS, which is exactly what the trusted admin API
 * needs (and why it must NEVER be exposed to the browser).
 *
 * Files under api/ starting with "_" are not treated as routes by Vercel.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error(
    'Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY (required for the service-role data layer).'
  );
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getSettings() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('access_code_hash, code_version')
    .eq('id', 1)
    .single();
  if (error) throw error;
  if (!data) throw new Error('app_settings not seeded — run: npm run set-access-code');
  return data;
}

async function updateAccessCode(newHash) {
  // No atomic `col = col + 1` over REST; admin-only + single-writer, so a
  // read-modify-write is fine here.
  const current = await getSettings();
  const next = (current.code_version || 0) + 1;
  const { error } = await supabase
    .from('app_settings')
    .update({ access_code_hash: newHash, code_version: next, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
  return next;
}

async function listOrders({ groupBuyId } = {}) {
  let q = supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (groupBuyId) q = q.eq('group_buy_id', groupBuyId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * orders.group_buy_number is a denormalised snapshot of group_buys.gb_number.
 * Whenever group_buy_id changes it must be rewritten from the source of truth,
 * otherwise the Orders tab labels the round with a stale name (this drifted once
 * already: 88 orders read "MiniGB4" after that round was renamed "GB4").
 */
async function gbNumberFor(groupBuyId) {
  if (!groupBuyId) return null;
  const { data, error } = await supabase
    .from('group_buys')
    .select('gb_number')
    .eq('id', groupBuyId)
    .single();
  if (error) throw error;
  return data?.gb_number ?? null;
}

/** Update already-whitelisted fields; returns the number of rows changed. */
async function updateOrder(id, patch) {
  const next = { ...patch, updated_at: new Date().toISOString() };
  if ('group_buy_id' in patch) next.group_buy_number = await gbNumberFor(patch.group_buy_id);
  const { data, error } = await supabase
    .from('orders')
    .update(next)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return data ? data.length : 0;
}

/** Re-attribute many orders to one group buy (or clear it with null). */
async function bulkAssignGroupBuy(ids, groupBuyId) {
  const { data, error } = await supabase
    .from('orders')
    .update({
      group_buy_id: groupBuyId,
      group_buy_number: await gbNumberFor(groupBuyId),
      updated_at: new Date().toISOString(),
    })
    .in('id', ids)
    .select('id');
  if (error) throw error;
  return data ? data.length : 0;
}

async function deleteOrder(id) {
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) throw error;
}

async function bulkDeleteOrders(ids) {
  const { error } = await supabase.from('orders').delete().in('id', ids);
  if (error) throw error;
}

async function listAssessmentResponses() {
  const { data, error } = await supabase
    .from('assessment_responses')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Liveness probe for GET /api/health — a trivial REST read. */
async function ping() {
  const { error } = await supabase.from('app_settings').select('id').limit(1);
  if (error) throw error;
}

export const supabaseDb = {
  getSettings,
  updateAccessCode,
  listOrders,
  updateOrder,
  bulkAssignGroupBuy,
  deleteOrder,
  bulkDeleteOrders,
  listAssessmentResponses,
  ping,
};
