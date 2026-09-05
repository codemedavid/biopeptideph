/**
 * Client for the admin data proxy (api/index.js). Orders and assessment
 * responses are PII, so the browser anon key is no longer allowed to read them
 * once RLS is enabled (db/orders_rls.sql) — these calls go through the admin
 * session instead. Every call uses `credentials: 'include'` so the httpOnly
 * admin session cookie is sent.
 *
 * On a 401/403 the admin session has expired; callers should treat a thrown
 * error as "reload / re-login required".
 */

const BASE = '/api';

/** Marker error so callers can detect an expired/forbidden admin session. */
export class AdminAuthError extends Error {
  constructor(public status: number) {
    super(`admin auth failed: ${status}`);
    this.name = 'AdminAuthError';
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'cache-control': 'no-store', ...(init?.headers || {}) },
  });
  if (res.status === 401 || res.status === 403) throw new AdminAuthError(res.status);
  if (!res.ok) throw new Error(`request to ${path} failed: ${res.status}`);
  // DELETE/PATCH may return a small JSON body; tolerate empty.
  return res.json().catch(() => ({}));
}

/** All orders (optionally for one group buy), newest first. */
export async function listOrders(opts?: { groupBuyId?: string }): Promise<any[]> {
  const qs = opts?.groupBuyId ? `?group_buy_id=${encodeURIComponent(opts.groupBuyId)}` : '';
  const data = (await request(`/admin/orders${qs}`)) as { orders?: any[] };
  return data.orders ?? [];
}

/** Update whitelisted fields (order_status / payment_status / group_buy_id). */
export async function updateOrder(
  id: string,
  patch: { order_status?: string; payment_status?: string; group_buy_id?: string | null }
): Promise<void> {
  await request(`/admin/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

/** Delete one order. */
export async function deleteOrder(id: string): Promise<void> {
  await request(`/admin/orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Delete many orders by id. */
export async function bulkDeleteOrders(ids: string[]): Promise<void> {
  await request('/admin/orders/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

/**
 * Re-attribute many orders to one group buy (pass null to unassign).
 * Resolves to the number of orders actually updated.
 */
export async function bulkAssignGroupBuy(ids: string[], groupBuyId: string | null): Promise<number> {
  const data = (await request('/admin/orders/bulk-assign-group-buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, group_buy_id: groupBuyId }),
  })) as { updated?: number };
  return data.updated ?? 0;
}

/** All assessment responses (PII), newest first. */
export async function listAssessmentResponses(): Promise<any[]> {
  const data = (await request('/admin/assessment-responses')) as { responses?: any[] };
  return data.responses ?? [];
}
