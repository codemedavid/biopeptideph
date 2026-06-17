/**
 * Thin client for the access-gate API. Every call uses `credentials: 'include'`
 * so the httpOnly `dg.sid` session cookie is sent/received. The access code and
 * session id never live in JS — they're only ever in the httpOnly cookie.
 */

const BASE = '/api';

/** True if a valid, non-expired session exists. Refreshes the idle timer. */
export async function checkSession(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/session`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'cache-control': 'no-store' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_code' | 'too_many_attempts' | 'error' };

/** Exchange an access code for a session cookie. */
export async function verifyCode(code: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${BASE}/access/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 429) return { ok: false, reason: 'too_many_attempts' };
    if (res.status === 401) return { ok: false, reason: 'invalid_code' };
    return { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Destroy the current session. */
export async function logout(): Promise<void> {
  try {
    await fetch(`${BASE}/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    /* ignore network errors on logout */
  }
}
