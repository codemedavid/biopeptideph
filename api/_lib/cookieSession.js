/**
 * Minimal STATELESS signed-cookie session — the whole session lives in the
 * cookie (HMAC-SHA256 signed with SESSION_SECRET), so there is no server-side
 * store. This is the right fit for serverless (every invocation can be a fresh
 * instance) and removes the Postgres session table / pooler dependency entirely.
 *
 * The cookie is httpOnly + signed + has an absolute expiry baked into the
 * payload; tampering invalidates the signature and an expired payload is
 * rejected. Re-issuing on activity (req.saveSession) gives a rolling timeout.
 *
 * Trade-off vs a server-side store: individual sessions can't be revoked
 * server-side. The access gate still gets global invalidation via `codeVersion`
 * (rotating the code bumps the DB version; old cookies no longer match). Admin
 * logout simply clears the cookie.
 */
import crypto from 'crypto';

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function parseCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const s = part.trim();
    if (s.startsWith(name + '=')) return decodeURIComponent(s.slice(name.length + 1));
  }
  return null;
}

function decode(raw, secret) {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!timingSafeEqualStr(sig, hmac(body, secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Express middleware. Sets:
 *   req.session       — the decoded session object (or {} if none/invalid/expired)
 *   req.saveSession() — sign the CURRENT req.session into the cookie (rolling exp)
 *   req.clearSession()— drop the session and clear the cookie
 */
export function cookieSession({ name = 'dg.sid', secret, maxAgeMs = 15 * 60 * 1000 } = {}) {
  if (!secret) throw new Error('cookieSession requires a secret');
  return function (req, res, next) {
    req.session = decode(parseCookie(req.headers.cookie, name), secret) || {};

    req.saveSession = () => {
      const payload = { ...req.session };
      delete payload.exp;
      payload.exp = Date.now() + maxAgeMs;
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const value = `${body}.${hmac(body, secret)}`;
      res.cookie(name, value, {
        httpOnly: true,
        secure: req.secure, // true when HTTPS (Express derives this from trust proxy)
        sameSite: 'lax',
        maxAge: maxAgeMs,
        path: '/',
      });
      req.session = payload;
    };

    req.clearSession = () => {
      req.session = {};
      res.clearCookie(name, { path: '/' });
    };

    next();
  };
}
