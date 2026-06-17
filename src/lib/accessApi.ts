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

export type ChangeCodeResult =
  | { ok: true; codeVersion: number }
  | { ok: false; reason: 'forbidden' | 'code_too_short' | 'too_many_attempts' | 'error' };

/**
 * Admin: rotate the site access code. Authorized by the ADMIN_API_KEY secret,
 * which the admin supplies at call time (it is never stored in the frontend).
 * On success the backend bumps code_version, logging out every active session.
 */
export async function changeAccessCode(
  adminKey: string,
  newCode: string
): Promise<ChangeCodeResult> {
  try {
    const res = await fetch(`${BASE}/admin/access-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminKey}`,
      },
      body: JSON.stringify({ newCode }),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, codeVersion: data.codeVersion };
    }
    if (res.status === 403) return { ok: false, reason: 'forbidden' };
    if (res.status === 429) return { ok: false, reason: 'too_many_attempts' };
    if (res.status === 400) return { ok: false, reason: 'code_too_short' };
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
