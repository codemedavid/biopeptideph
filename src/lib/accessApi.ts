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

export type AdminLoginResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_password' | 'not_configured' | 'too_many_attempts' | 'error' };

/** Verify the admin dashboard password server-side and start an admin session. */
export async function adminLogin(password: string): Promise<AdminLoginResult> {
  try {
    const res = await fetch(`${BASE}/admin/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, reason: 'invalid_password' };
    if (res.status === 429) return { ok: false, reason: 'too_many_attempts' };
    if (res.status === 500) return { ok: false, reason: 'not_configured' };
    return { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** True if the current session already has admin privileges (e.g. after reload). */
export async function checkAdminSession(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/admin/session`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'cache-control': 'no-store' },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.admin;
  } catch {
    return false;
  }
}

/** Drop admin privileges for the current session. */
export async function adminLogout(): Promise<void> {
  try {
    await fetch(`${BASE}/admin/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    /* ignore */
  }
}

export type ChangeCodeResult =
  | { ok: true; codeVersion: number }
  | { ok: false; reason: 'forbidden' | 'code_too_short' | 'too_many_attempts' | 'error' };

/**
 * Admin: rotate the site access code. Authorized by the admin SESSION cookie
 * (set by adminLogin) — no secret is passed from the browser. On success the
 * backend bumps code_version, logging out every active visitor session.
 */
export async function changeAccessCode(newCode: string): Promise<ChangeCodeResult> {
  try {
    const res = await fetch(`${BASE}/admin/access-code`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
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
