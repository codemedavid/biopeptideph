/**
 * The access-gate / admin Express app, as a FACTORY so it can be unit-tested
 * without a live database.
 *
 *   createApp({ db })
 *     db — data layer: supabaseDb (service-role over HTTPS, the default — no
 *          pooler) or pgDb (direct Postgres) in prod; a fake in tests.
 *
 * Sessions are STATELESS signed cookies (api/_lib/cookieSession.js): nothing is
 * stored server-side, so there is no Postgres session table and no pooler/DB
 * dependency for auth. Files under api/ starting with "_" are import-only.
 */
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { cookieSession } from './cookieSession.js';

/**
 * Constant-time string comparison. Both sides are SHA-256'd to a fixed 32-byte
 * digest FIRST, so the comparison is constant-time and never short-circuits on a
 * length mismatch — which would otherwise leak the secret's length via timing.
 */
export function safeEqual(a, b) {
  const ah = crypto.createHash('sha256').update(String(a)).digest();
  const bh = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ah, bh);
}

export function createApp({ db } = {}) {
  if (!db) throw new Error('createApp requires a `db` data layer');
  // SESSION_SECRET signs the session cookie. Fail fast with a clear message if
  // it's missing instead of letting requests fail opaquely.
  if (!process.env.SESSION_SECRET) {
    throw new Error(
      'SESSION_SECRET is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))" and set it in the environment (Vercel → Settings → Environment Variables).'
    );
  }

  const app = express();

  // Vercel sits behind a proxy. Trust it so `req.secure` (Secure cookie) and the
  // client IP (rate limiter) are read correctly.
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '8kb' }));

  const FIFTEEN_MINUTES = 15 * 60 * 1000;
  app.use(
    cookieSession({ name: 'dg.sid', secret: process.env.SESSION_SECRET, maxAgeMs: FIFTEEN_MINUTES })
  );

  // --- Rate limiting --------------------------------------------------------
  const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
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
  const sessionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // --- Auth middleware ------------------------------------------------------
  async function requireValidSession(req, res, next) {
    try {
      if (!req.session || !req.session.authed) {
        return res.status(401).json({ error: 'unauthenticated' });
      }
      const settings = await db.getSettings();
      if (req.session.codeVersion !== settings.code_version) {
        req.clearSession();
        return res.status(401).json({ error: 'session_invalidated' });
      }
      return next();
    } catch (err) {
      console.error('session validation error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  }

  function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    const expected = process.env.ADMIN_API_KEY;
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (expected && token && safeEqual(token, expected)) return next();
    return res.status(403).json({ error: 'forbidden' });
  }

  // --- Routes ---------------------------------------------------------------

  app.post('/api/access/verify', verifyLimiter, async (req, res) => {
    try {
      const code = typeof req.body?.code === 'string' ? req.body.code : '';
      if (!code) return res.status(400).json({ error: 'code_required' });
      const settings = await db.getSettings();
      const ok = await bcrypt.compare(code, settings.access_code_hash);
      if (!ok) return res.status(401).json({ error: 'invalid_code' });
      req.session = { authed: true, codeVersion: settings.code_version };
      req.saveSession();
      return res.json({ authenticated: true });
    } catch (err) {
      console.error('verify error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/session', sessionLimiter, requireValidSession, (req, res) => {
    req.saveSession(); // rolling: slide the idle window forward
    res.json({ authenticated: true });
  });

  app.post('/api/logout', (req, res) => {
    req.clearSession();
    res.json({ ok: true });
  });

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
    req.session = { isAdmin: true };
    req.saveSession();
    return res.json({ ok: true });
  });

  app.get('/api/admin/session', sessionLimiter, (req, res) => {
    const admin = !!(req.session && req.session.isAdmin);
    if (admin) req.saveSession(); // rolling refresh on dashboard activity
    res.json({ admin });
  });

  app.post('/api/admin/logout', adminLimiter, (req, res) => {
    req.clearSession();
    res.json({ ok: true });
  });

  app.post('/api/admin/access-code', adminLimiter, requireAdmin, async (req, res) => {
    try {
      const newCode = typeof req.body?.newCode === 'string' ? req.body.newCode : '';
      if (newCode.length < 6) return res.status(400).json({ error: 'code_too_short' });
      const hash = await bcrypt.hash(newCode, 12);
      const codeVersion = await db.updateAccessCode(hash);
      return res.json({ ok: true, codeVersion });
    } catch (err) {
      console.error('change code error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // --- Admin data proxy (keeps orders / assessment PII off the anon key) -----
  app.get('/api/admin/orders', sessionLimiter, requireAdmin, async (req, res) => {
    try {
      const groupBuyId =
        typeof req.query.group_buy_id === 'string' ? req.query.group_buy_id : undefined;
      const orders = await db.listOrders({ groupBuyId });
      return res.json({ orders });
    } catch (err) {
      console.error('list orders error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.patch('/api/admin/orders/:id', adminLimiter, requireAdmin, async (req, res) => {
    try {
      const ALLOWED = ['order_status', 'payment_status'];
      const patch = {};
      for (const key of ALLOWED) {
        if (typeof req.body?.[key] === 'string') patch[key] = req.body[key];
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'no_fields' });
      const changed = await db.updateOrder(req.params.id, patch);
      if (changed === 0) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('update order error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.delete('/api/admin/orders/:id', adminLimiter, requireAdmin, async (req, res) => {
    try {
      await db.deleteOrder(req.params.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('delete order error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/admin/orders/bulk-delete', adminLimiter, requireAdmin, async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.filter((x) => typeof x === 'string')
        : [];
      if (ids.length === 0) return res.status(400).json({ error: 'no_ids' });
      await db.bulkDeleteOrders(ids);
      return res.json({ ok: true });
    } catch (err) {
      console.error('bulk delete orders error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/admin/assessment-responses', sessionLimiter, requireAdmin, async (req, res) => {
    try {
      const responses = await db.listAssessmentResponses();
      return res.json({ responses });
    } catch (err) {
      console.error('list assessment responses error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/health', async (req, res) => {
    try {
      await db.ping();
      return res.json({ status: 'healthy' });
    } catch (err) {
      console.error('health check failed', err?.message || err);
      return res.status(500).json({ status: 'unhealthy' });
    }
  });

  app.use((req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}
