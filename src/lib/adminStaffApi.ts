/**
 * Owner-only client for staff accounts (api/_lib/app.js `/api/admin/staff*`).
 * Authorized by the owner's httpOnly admin session cookie. Failures resolve to
 * the server's error code so the panel can show a specific message.
 */
import type { AdminFeature } from './adminFeatures';

const BASE = '/api/admin/staff';

export interface StaffAccount {
  id: string;
  email: string;
  permissions: AdminFeature[];
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export type StaffResult<T> = { ok: true; data: T } | { ok: false; error: string };

interface ResponseBody {
  staff?: unknown;
  error?: unknown;
}

async function send<T>(path: string, init: RequestInit, pick: (body: ResponseBody) => T): Promise<StaffResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      ...init,
      headers: { 'cache-control': 'no-store', 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    const body: ResponseBody = (await res.json().catch(() => null)) ?? {};
    if (res.status === 403) return { ok: false, error: 'forbidden' };
    if (res.status === 429) return { ok: false, error: 'too_many_attempts' };
    if (!res.ok) return { ok: false, error: typeof body.error === 'string' ? body.error : 'error' };
    return { ok: true, data: pick(body) };
  } catch {
    return { ok: false, error: 'error' };
  }
}

export function listStaff(): Promise<StaffResult<StaffAccount[]>> {
  return send('', { method: 'GET' }, (b) => (Array.isArray(b.staff) ? (b.staff as StaffAccount[]) : []));
}

export function createStaff(input: {
  email: string;
  password: string;
  permissions: AdminFeature[];
}): Promise<StaffResult<StaffAccount>> {
  return send('', { method: 'POST', body: JSON.stringify(input) }, (b) => b.staff as StaffAccount);
}

export function updateStaff(
  id: string,
  patch: { permissions?: AdminFeature[]; active?: boolean; password?: string }
): Promise<StaffResult<StaffAccount>> {
  return send(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }, (b) => b.staff as StaffAccount);
}

export function deleteStaff(id: string): Promise<StaffResult<null>> {
  return send(`/${encodeURIComponent(id)}`, { method: 'DELETE' }, () => null);
}

const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GENERATED_PASSWORD_LENGTH = 12;

/** A random 12-character password without look-alike characters (0/O, 1/l/I). */
export function generateStaffPassword(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(GENERATED_PASSWORD_LENGTH));
  return Array.from(bytes, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join('');
}

const MESSAGES: Record<string, string> = {
  invalid_email: 'Enter a valid email address.',
  password_too_short: 'Password must be at least 8 characters.',
  password_too_long: 'Password is too long (max 72 characters).',
  invalid_permissions: 'One of the selected sections is not recognised. Reload and try again.',
  email_taken: 'A staff account with that email already exists.',
  not_found: 'That staff account no longer exists. Reload the list.',
  forbidden: 'Only the owner can manage staff. Your session may have expired — log in again.',
  too_many_attempts: 'Too many changes in a short time. Wait a few minutes and try again.',
};

export function staffErrorMessage(code: string): string {
  return MESSAGES[code] ?? 'Something went wrong. Please try again.';
}
