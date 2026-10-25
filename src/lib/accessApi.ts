/**
 * Thin client for the access-gate API. Every call uses `credentials: 'include'`
 * so the httpOnly `dg.sid` session cookie is sent/received. The access code and
 * session id never live in JS — they're only ever in the httpOnly cookie.
 */

import { ADMIN_FEATURE_INFO, type AdminFeature, type AdminRole, type AdminSession } from './adminFeatures';

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
    if (res.ok) {
      // Only accept the API's genuine JSON success. A 2xx that isn't
      // { authenticated: true } (e.g. an HTML SPA-fallback page from a misrouted
      // /api) must NOT be treated as a valid session.
      const data = await res.json().catch(() => null);
      return data?.authenticated === true ? { ok: true } : { ok: false, reason: 'error' };
    }
    if (res.status === 429) return { ok: false, reason: 'too_many_attempts' };
    if (res.status === 401) return { ok: false, reason: 'invalid_code' };
    return { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export type AdminLoginResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'invalid_password' | 'account_disabled' | 'not_configured' | 'too_many_attempts' | 'error';
    };

/**
 * Verify admin credentials server-side and start an admin session. The owner
 * signs in with the admin password alone; staff add the email the owner gave them.
 */
export async function adminLogin(password: string, email = ''): Promise<AdminLoginResult> {
  try {
    const res = await fetch(`${BASE}/admin/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email ? { email, password } : { password }),
    });
    if (res.ok) {
      // Defense in depth: a 2xx is only a real login if the body is the API's
      // JSON { ok: true }. An HTML SPA-fallback page (misrouted /api, a bad
      // rewrite, or local dev with no backend) returns 2xx too — never let that
      // grant admin access without a verified password.
      const data = await res.json().catch(() => null);
      return data?.ok === true ? { ok: true } : { ok: false, reason: 'error' };
    }
    if (res.status === 401) return { ok: false, reason: 'invalid_password' };
    if (res.status === 403) return { ok: false, reason: 'account_disabled' };
    if (res.status === 429) return { ok: false, reason: 'too_many_attempts' };
    if (res.status === 500) {
      // Distinguish "env var truly missing" from a generic server/DB error so
      // the UI doesn't tell the user to set ADMIN_PASSWORD when it's already set.
      const reason = await res
        .json()
        .then((b) => (b?.error === 'not_configured' ? 'not_configured' : 'error'))
        .catch(() => 'error');
      return { ok: false, reason } as AdminLoginResult;
    }
    return { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/**
 * The signed-in admin (owner or staff, with the sections they may open), or
 * null when there is no admin session (e.g. after reload or expiry).
 */
export async function checkAdminSession(): Promise<AdminSession | null> {
  try {
    const res = await fetch(`${BASE}/admin/session`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'cache-control': 'no-store' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.admin !== true) return null;
    const role: AdminRole = data.role === 'staff' ? 'staff' : 'owner';
    const known = new Set<string>(ADMIN_FEATURE_INFO.map((f) => f.key));
    const permissions = Array.isArray(data.permissions)
      ? (data.permissions.filter((p: unknown) => typeof p === 'string' && known.has(p)) as AdminFeature[])
      : [];
    return { role, email: typeof data.email === 'string' ? data.email : null, permissions };
  } catch {
    return null;
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
