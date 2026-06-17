/**
 * Site-wide access-code gate — single Express app deployed as ONE Vercel
 * serverless function. vercel.json rewrites every /api/* request to this file.
 *
 * Why one Express app instead of many api/*.js files?
 *   express-session, helmet and express-rate-limit are Express middleware; an
 *   Express app lets us use the exact stack requested while still deploying on
 *   Vercel. Sessions are persisted in Supabase Postgres (connect-pg-simple) so
 *   they survive across stateless serverless invocations.
 *
 * Endpoints (all under /api):
 *   POST /api/access/verify       — exchange the access code for a session cookie
 *   GET  /api/session             — validate + refresh the current session
 *   POST /api/logout              — destroy the current session
 *   POST /api/admin/access-code   — admin: change the code (invalidates all sessions)
 */
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs'; // pure-JS, API-compatible with bcrypt; reliable on serverless
import crypto from 'crypto';
import { pool, getSettings, updateAccessCode } from './_lib/db.js';

/** Constant-time string comparison (avoids leaking length/contents via timing). */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const app = express();

// Vercel sits behind a proxy. Trust it so `secure` cookies and the client IP
// (used by the rate limiter) are read correctly.
app.set('trust proxy', 1);

// --- Security headers -------------------------------------------------------
// helmet sets sensible defaults (HSTS, no-sniff, frameguard, etc.). The API
// returns only JSON so we don't need its CSP here (the SPA controls its own).
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json({ limit: '8kb' }));

const isProd = process.env.NODE_ENV === 'production';

// --- Session configuration --------------------------------------------------
const PgStore = connectPgSimple(session);
const FIFTEEN_MINUTES = 15 * 60 * 1000;

app.use(
  session({
    name: 'dg.sid',
    secret: process.env.SESSION_SECRET, // REQUIRED env var — see setup steps
    store: new PgStore({
      pool,
      tableName: 'session',
      createTableIfMissing: false, // table is created by the SQL migration
      // Sweep expired rows roughly every 15 min.
      pruneSessionInterval: 60 * 15,
    }),
    resave: false,
    saveUninitialized: false, // don't create sessions for anonymous visitors
    // rolling: re-set the cookie (and its expiry) on EVERY response, so any
    // activity that touches the API slides the 15-minute idle window forward.
    rolling: true,
    cookie: {
      httpOnly: true, // not readable from JS — satisfies "not stored in frontend"
      secure: isProd, // HTTPS-only in production
      sameSite: 'lax',
      maxAge: FIFTEEN_MINUTES, // 15 min of inactivity, refreshed by `rolling`
      path: '/',
    },
  })
);

// --- Rate limiting ----------------------------------------------------------
// NOTE: the default memory store is per-instance. On Vercel that means the
// limit is approximate across many cold instances. For hard guarantees back it
// with `rate-limit-postgresql` or Upstash Redis (see Security notes).
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 code attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Auth middleware --------------------------------------------------------
/**
 * Reject the request unless there is a logged-in session whose `codeVersion`
 * still matches the current code version in the DB. The version check is what
 * makes an admin code-change invalidate every session immediately.
 */
async function requireValidSession(req, res, next) {
  try {
    if (!req.session || !req.session.authed) {
      return res.status(401).json({ error: 'unauthenticated' });
    }
    const settings = await getSettings();
    if (req.session.codeVersion !== settings.code_version) {
      // Stale: the code changed since this session was created.
      return req.session.destroy(() =>
        res.status(401).json({ error: 'session_invalidated' })
      );
    }
    return next();
  } catch (err) {
    console.error('session validation error', err);
    return res.status(500).json({ error: 'server_error' });
  }
}

/**
 * Guard for admin-only actions. Authorized by EITHER:
 *   1. an admin session (set by POST /api/admin/login) — used by the dashboard, OR
 *   2. a Bearer ADMIN_API_KEY header — kept for curl/automation/CI.
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();

  const expected = process.env.ADMIN_API_KEY;
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (expected && token && safeEqual(token, expected)) return next();

  return res.status(403).json({ error: 'forbidden' });
}

// --- Routes -----------------------------------------------------------------

/**
 * POST /api/access/verify  { code }
 * Compares the submitted code against the stored bcrypt hash. On success,
 * regenerates the session id (prevents session fixation) and marks it authed.
 */
app.post('/api/access/verify', verifyLimiter, async (req, res) => {
  try {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!code) return res.status(400).json({ error: 'code_required' });

    const settings = await getSettings();
    const ok = await bcrypt.compare(code, settings.access_code_hash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid_code' });
    }

    // New session id on privilege change.
    req.session.regenerate((err) => {
      if (err) {
        console.error('regenerate error', err);
        return res.status(500).json({ error: 'server_error' });
      }
      req.session.authed = true;
      req.session.codeVersion = settings.code_version;
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('session save error', saveErr);
          return res.status(500).json({ error: 'server_error' });
        }
        return res.json({ authenticated: true });
      });
    });
  } catch (err) {
    console.error('verify error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

/**
 * GET /api/session
 * Used by the frontend on load and as a heartbeat. Because `rolling` is on,
 * simply hitting this endpoint slides the idle timeout forward.
 */
app.get('/api/session', requireValidSession, (req, res) => {
  res.json({ authenticated: true });
});

/**
 * POST /api/logout
 * Destroys the server-side session and clears the cookie.
 */
app.post('/api/logout', (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy((err) => {
    if (err) console.error('logout error', err);
    res.clearCookie('dg.sid', { path: '/' });
    res.json({ ok: true });
  });
});

/**
 * POST /api/admin/login  { password }
 * Verifies the dashboard password (ADMIN_PASSWORD env) server-side and marks
 * the session as admin. This is what lets the dashboard rotate the code without
 * pasting any secret.
 */
app.post('/api/admin/login', adminLimiter, (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    console.error('ADMIN_PASSWORD env var is not set');
    return res.status(500).json({ error: 'not_configured' });
  }
  if (!password || !safeEqual(password, expected)) {
    return res.status(401).json({ error: 'invalid_password' });
  }
  // Regenerate on privilege change to prevent session fixation.
  req.session.regenerate((err) => {
    if (err) {
      console.error('admin regenerate error', err);
      return res.status(500).json({ error: 'server_error' });
    }
    req.session.isAdmin = true;
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('admin session save error', saveErr);
        return res.status(500).json({ error: 'server_error' });
      }
      return res.json({ ok: true });
    });
  });
});

/** GET /api/admin/session — lets the dashboard restore admin state after reload. */
app.get('/api/admin/session', (req, res) => {
  res.json({ admin: !!(req.session && req.session.isAdmin) });
});

/** POST /api/admin/logout — drop admin privileges for this session. */
app.post('/api/admin/logout', (req, res) => {
  if (req.session) req.session.isAdmin = false;
  res.json({ ok: true });
});

/**
 * POST /api/admin/access-code  { newCode }
 * Authorized by an admin session (dashboard) OR Bearer <ADMIN_API_KEY>
 * Hashes and stores the new code and bumps code_version, which instantly
 * invalidates every existing session (they fail requireValidSession next call).
 */
app.post('/api/admin/access-code', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const newCode = typeof req.body?.newCode === 'string' ? req.body.newCode : '';
    if (newCode.length < 6) {
      return res.status(400).json({ error: 'code_too_short' }); // min 6 chars
    }
    const hash = await bcrypt.hash(newCode, 12); // cost factor 12
    const codeVersion = await updateAccessCode(hash);
    return res.json({ ok: true, codeVersion });
  } catch (err) {
    console.error('change code error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Fallback for unknown API routes.
app.use((req, res) => res.status(404).json({ error: 'not_found' }));

export default app;
