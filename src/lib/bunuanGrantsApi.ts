/**
 * Client for the admin Bunuan-access endpoints (api/_lib/app.js).
 *
 * A grant lets one customer email into Bunuan for one round even when the name
 * or phone they typed does not match their earlier order. Grants decide who may
 * buy, so the table is closed to the anon key; every call goes through the admin
 * session cookie (`credentials: 'include'`).
 */
import { AdminAuthError } from './adminOrdersApi';

export interface BunuanGrant {
  id: string;
  group_buy_id: string;
  customer_email: string;
  note: string | null;
  granted_at: string;
}

/** A rejected request, carrying the server's error code (e.g. `invalid_email`). */
export class BunuanGrantError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
    this.name = 'BunuanGrantError';
  }
}

const MESSAGES: Record<string, string> = {
  invalid_email: 'Enter a valid email address.',
  note_too_long: 'The note is too long (300 characters max).',
  group_buy_not_found: 'This round no longer exists.',
  not_found: 'That access was already removed.',
};

/** A sentence an admin can act on, for any error thrown by this module. */
export function grantErrorMessage(err: unknown): string {
  if (err instanceof AdminAuthError) return 'Your admin session expired. Log in again.';
  if (err instanceof BunuanGrantError) {
    // The admin rate limiter answers 429 with its own body, so match the status.
    if (err.status === 429) return 'Too many changes in a short time. Wait a few minutes, then try again.';
    return MESSAGES[err.code] ?? 'Something went wrong. Please try again.';
  }
  return 'Could not reach the server. Check your connection and try again.';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'cache-control': 'no-store', ...(init?.headers || {}) },
  });
  if (res.status === 401 || res.status === 403) throw new AdminAuthError(res.status);
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new BunuanGrantError(body.error || 'server_error', res.status);
  return body;
}

const grantsPath = (groupBuyId: string) =>
  `/admin/group-buys/${encodeURIComponent(groupBuyId)}/bunuan-grants`;

export async function listBunuanGrants(groupBuyId: string): Promise<BunuanGrant[]> {
  const data = await request<{ grants?: BunuanGrant[] }>(grantsPath(groupBuyId));
  return data.grants ?? [];
}

/** Idempotent: allowing an email that is already allowed just refreshes its note. */
export async function allowInBunuan(groupBuyId: string, email: string, note?: string): Promise<BunuanGrant> {
  const data = await request<{ grant: BunuanGrant }>(grantsPath(groupBuyId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, note: note ?? null }),
  });
  return data.grant;
}

export async function removeBunuanGrant(groupBuyId: string, grantId: string): Promise<void> {
  await request(`${grantsPath(groupBuyId)}/${encodeURIComponent(grantId)}`, { method: 'DELETE' });
}
