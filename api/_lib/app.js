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
import { imageAssets, mediaHandler } from './media.js';
import { ADMIN_FEATURES, normalizePermissions } from './adminFeatures.js';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_GRANT_NOTE = 300;

/**
 * How long app_settings (access-code hash + code_version) is cached in memory.
 * Every gated request — including each /api/media image — checks the session's
 * code_version, which was ~8k Supabase reads/day uncached. A rotation made on
 * this instance clears the cache immediately; other warm instances pick it up
 * within this window.
 */
const DEFAULT_SETTINGS_TTL_MS = 60 * 1000;

/**
 * How long a staff account (active flag + permissions) is cached per instance.
 * Every admin request from a staff session re-checks the account so a disabled
 * or narrowed account loses access without waiting for its cookie to expire.
 * Edits made on this instance apply immediately; other warm instances pick them
 * up within this window.
 */
const DEFAULT_STAFF_TTL_MS = 30 * 1000;

const MIN_STAFF_PASSWORD = 8;
const MAX_STAFF_PASSWORD_BYTES = 72; // bcrypt ignores everything past 72 bytes

/**
 * Compared against when a staff login names an unknown email, so a miss costs
 * the same bcrypt time as a hit and does not reveal which emails have accounts.
 */
const TIMING_DUMMY_HASH = '$2b$12$4Dovxt79ttUkin/V7yBkeuI4UkFLCZtO8FERTcq4qbXTzLuYEa09W';

/** The owner logs in with ADMIN_PASSWORD (or ADMIN_API_KEY) and can open everything. */
const OWNER = Object.freeze({ role: 'owner', email: null, permissions: ADMIN_FEATURES });

function cachedSettingsReader(load, ttlMs) {
  let cached = null;
  let expiresAt = 0;
  let generation = 0; // bumped by clear() so an in-flight read can't re-cache pre-rotation settings
  return {
    async get() {
      if (cached && Date.now() < expiresAt) return cached;
      const startedAt = generation;
      const fresh = await load();
      if (startedAt === generation) {
        cached = fresh;
        expiresAt = Date.now() + ttlMs;
      }
      return fresh;
    },
    clear() {
      generation += 1;
      cached = null;
      expiresAt = 0;
    },
  };
}

function cachedStaffReader(load, ttlMs) {
  const entries = new Map();
  let generation = 0; // bumped by clear() so an in-flight read can't re-cache a pre-edit account
  return {
    async get(id) {
      const hit = entries.get(id);
      if (hit && Date.now() < hit.expiresAt) return hit.staff;
      const startedAt = generation;
      const staff = await load(id);
      if (startedAt === generation) entries.set(id, { staff, expiresAt: Date.now() + ttlMs });
      return staff;
    },
    clear(id) {
      generation += 1;
      entries.delete(id);
    },
  };
}

/** Returns an error code for an unusable staff password, or null when it is fine. */
function staffPasswordError(password) {
  if (typeof password !== 'string' || password.length < MIN_STAFF_PASSWORD) return 'password_too_short';
  if (Buffer.byteLength(password, 'utf8') > MAX_STAFF_PASSWORD_BYTES) return 'password_too_long';
  return null;
}

/**
 * Normalise an email exactly as gb_norm_email does in SQL (trim + lowercase),
 * because the eligibility check compares grants by plain equality. Returns null
 * for anything that is not a plausible address.
 */
export function normalizeGrantEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return null;
  return email;
}

export function createApp({
  db,
  mediaAssets = imageAssets,
  settingsTtlMs = DEFAULT_SETTINGS_TTL_MS,
  staffTtlMs = DEFAULT_STAFF_TTL_MS,
} = {}) {
  if (!db) throw new Error('createApp requires a `db` data layer');
  const settingsCache = cachedSettingsReader(() => db.getSettings(), settingsTtlMs);
  const staffCache = cachedStaffReader((id) => db.getStaff(id), staffTtlMs);
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
      const settings = await settingsCache.get();
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

  /**
   * The admin behind the session cookie: the owner, an active staff account, or
   * null. A staff session whose account was disabled or deleted is cleared.
   */
  async function sessionAdmin(req) {
    if (req.session && req.session.isAdmin) return OWNER;
    const staffId = req.session?.staffId;
    if (typeof staffId !== 'string') return null;
    const staff = await staffCache.get(staffId);
    if (!staff || !staff.active) {
      req.clearSession();
      return null;
    }
    return { role: 'staff', email: staff.email, permissions: staff.permissions || [] };
  }

  function apiKeyAdmin(req) {
    const expected = process.env.ADMIN_API_KEY;
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return expected && token && safeEqual(token, expected) ? OWNER : null;
  }

  /** Middleware factory: 403 unless the caller is an admin for whom isAllowed(admin) holds. */
  function authorize(isAllowed) {
    return async (req, res, next) => {
      try {
        const admin = (await sessionAdmin(req)) || apiKeyAdmin(req);
        if (!admin || !isAllowed(admin)) return res.status(403).json({ error: 'forbidden' });
        return next();
      } catch (err) {
        console.error('admin authorization error', err?.message || err);
        return res.status(500).json({ error: 'server_error' });
      }
    };
  }

  const requireAdmin = authorize(() => true);
  const requireOwner = authorize((admin) => admin.role === 'owner');
  /** Passes when the admin holds ANY of the listed dashboard features. */
  const requireFeature = (...features) =>
    authorize((admin) => features.some((f) => admin.permissions.includes(f)));

  // --- Routes ---------------------------------------------------------------

  app.get('/api/media/:id', rateLimit({ windowMs: 60000, max: 300, standardHeaders: true, legacyHeaders: false }), mediaHandler({ assets: mediaAssets, requireValidSession, requireAdmin }));

  app.post('/api/access/verify', verifyLimiter, async (req, res) => {
    try {
      const code = typeof req.body?.code === 'string' ? req.body.code : '';
      if (!code) return res.status(400).json({ error: 'code_required' });
      const settings = await settingsCache.get();
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

  /** Staff sign-in: email + password checked against admin_staff. */
  async function staffLogin(req, res, rawEmail, password) {
    const email = normalizeGrantEmail(rawEmail);
    const staff = email ? await db.findStaffByEmail(email) : null;
    // Always run one bcrypt compare so an unknown email takes as long as a wrong password.
    const matches = await bcrypt.compare(password, staff?.password_hash || TIMING_DUMMY_HASH);
    if (!staff || !matches) return res.status(401).json({ error: 'invalid_credentials' });
    if (!staff.active) return res.status(403).json({ error: 'account_disabled' });
    try {
      await db.recordStaffLogin(staff.id);
    } catch (err) {
      console.error('record staff login error', err?.message || err); // never blocks sign-in
    }
    staffCache.clear(staff.id);
    req.session = { staffId: staff.id };
    req.saveSession();
    return res.json({ ok: true });
  }

  app.post('/api/admin/login', adminLimiter, async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (rawEmail) {
      if (!password) return res.status(401).json({ error: 'invalid_credentials' });
      try {
        return await staffLogin(req, res, rawEmail, password);
      } catch (err) {
        console.error('staff login error', err?.message || err);
        return res.status(500).json({ error: 'server_error' });
      }
    }
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

  app.get('/api/admin/session', sessionLimiter, async (req, res) => {
    try {
      const admin = await sessionAdmin(req);
      if (!admin) return res.json({ admin: false });
      req.saveSession(); // rolling refresh on dashboard activity
      return res.json({ admin: true, role: admin.role, email: admin.email, permissions: admin.permissions });
    } catch (err) {
      console.error('admin session error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/admin/logout', adminLimiter, (req, res) => {
    req.clearSession();
    res.json({ ok: true });
  });

  app.post('/api/admin/access-code', adminLimiter, requireFeature('access-code'), async (req, res) => {
    try {
      const newCode = typeof req.body?.newCode === 'string' ? req.body.newCode : '';
      if (newCode.length < 6) return res.status(400).json({ error: 'code_too_short' });
      const hash = await bcrypt.hash(newCode, 12);
      const codeVersion = await db.updateAccessCode(hash);
      settingsCache.clear();
      return res.json({ ok: true, codeVersion });
    } catch (err) {
      console.error('change code error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // --- Admin data proxy (keeps orders / assessment PII off the anon key) -----
  // Orders are read by the Orders, Inventory, Sales Analytics and Group Buys
  // screens; only the Orders screen may change them.
  app.get('/api/admin/orders', sessionLimiter, requireFeature('orders', 'inventory', 'analytics', 'group-buys'), async (req, res) => {
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

  app.patch('/api/admin/orders/:id', adminLimiter, requireFeature('orders'), async (req, res) => {
    try {
      // group_buy_id is included so the admin can re-attribute an order to the
      // right round (the checkout fallback attributes to the newest round when
      // none is active, which is occasionally the wrong one). null clears it.
      const ALLOWED = ['order_status', 'payment_status', 'group_buy_id'];
      const patch = {};
      for (const key of ALLOWED) {
        if (typeof req.body?.[key] === 'string') patch[key] = req.body[key];
      }
      if (req.body?.group_buy_id === null) patch.group_buy_id = null;
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'no_fields' });
      const changed = await db.updateOrder(req.params.id, patch);
      if (changed === 0) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('update order error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.delete('/api/admin/orders/:id', adminLimiter, requireFeature('orders'), async (req, res) => {
    try {
      await db.deleteOrder(req.params.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('delete order error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/admin/orders/bulk-delete', adminLimiter, requireFeature('orders'), async (req, res) => {
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

  // Re-attribute many orders to one group buy at once. Used by the Orders tab to
  // fix rounds in bulk (e.g. orders taken in the gap between two rounds).
  app.post('/api/admin/orders/bulk-assign-group-buy', adminLimiter, requireFeature('orders'), async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.filter((x) => typeof x === 'string')
        : [];
      if (ids.length === 0) return res.status(400).json({ error: 'no_ids' });
      const groupBuyId =
        typeof req.body?.group_buy_id === 'string' ? req.body.group_buy_id : null;
      const updated = await db.bulkAssignGroupBuy(ids, groupBuyId);
      return res.json({ ok: true, updated });
    } catch (err) {
      console.error('bulk assign group buy error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // --- Bunuan access grants ---------------------------------------------------
  // Bunuan is limited to customers whose name + email + phone match an earlier
  // order in the same round. A grant lets one email in anyway, for one round,
  // when a returning customer typed their details differently. Grants decide who
  // may buy, so they are admin-only: the table has RLS on with no policies and is
  // reached only through these service-role routes.
  app.get('/api/admin/group-buys/:id/bunuan-grants', sessionLimiter, requireFeature('group-buys'), async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'invalid_group_buy_id' });
      const grants = await db.listBunuanGrants(req.params.id);
      return res.json({ grants });
    } catch (err) {
      console.error('list bunuan grants error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/admin/group-buys/:id/bunuan-grants', adminLimiter, requireFeature('group-buys'), async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'invalid_group_buy_id' });
      const email = normalizeGrantEmail(req.body?.email);
      if (!email) return res.status(400).json({ error: 'invalid_email' });
      const rawNote = req.body?.note;
      if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') {
        return res.status(400).json({ error: 'invalid_note' });
      }
      const note = typeof rawNote === 'string' && rawNote.trim() ? rawNote.trim() : null;
      if (note && note.length > MAX_GRANT_NOTE) return res.status(400).json({ error: 'note_too_long' });
      if (!(await db.groupBuyExists(req.params.id))) return res.status(404).json({ error: 'group_buy_not_found' });
      const grant = await db.upsertBunuanGrant(req.params.id, email, note);
      return res.json({ ok: true, grant });
    } catch (err) {
      console.error('upsert bunuan grant error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.delete('/api/admin/group-buys/:id/bunuan-grants/:grantId', adminLimiter, requireFeature('group-buys'), async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id) || !UUID_RE.test(req.params.grantId)) {
        return res.status(400).json({ error: 'invalid_id' });
      }
      // Scoped to the round in the URL, so a grant id from another round is a 404.
      const removed = await db.deleteBunuanGrant(req.params.id, req.params.grantId);
      if (removed === 0) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('delete bunuan grant error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/admin/assessment-responses', sessionLimiter, requireFeature('assessment'), async (req, res) => {
    try {
      const responses = await db.listAssessmentResponses();
      return res.json({ responses });
    } catch (err) {
      console.error('list assessment responses error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // --- Staff accounts (owner only) -------------------------------------------
  // The owner creates staff logins and ticks which dashboard sections each one
  // may open. Hashes never leave the server; responses carry the safe columns.
  const staffLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get('/api/admin/staff', sessionLimiter, requireOwner, async (req, res) => {
    try {
      const staff = await db.listStaff();
      return res.json({ staff, features: ADMIN_FEATURES });
    } catch (err) {
      console.error('list staff error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/admin/staff', staffLimiter, requireOwner, async (req, res) => {
    try {
      const email = normalizeGrantEmail(req.body?.email);
      if (!email) return res.status(400).json({ error: 'invalid_email' });
      const passwordError = staffPasswordError(req.body?.password);
      if (passwordError) return res.status(400).json({ error: passwordError });
      const permissions = normalizePermissions(req.body?.permissions ?? []);
      if (!permissions) return res.status(400).json({ error: 'invalid_permissions' });
      const passwordHash = await bcrypt.hash(req.body.password, 12);
      const staff = await db.createStaff({ email, passwordHash, permissions });
      if (!staff) return res.status(409).json({ error: 'email_taken' });
      return res.status(201).json({ ok: true, staff });
    } catch (err) {
      console.error('create staff error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.patch('/api/admin/staff/:id', staffLimiter, requireOwner, async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'invalid_id' });
      const body = req.body || {};
      const patch = {};
      if (body.permissions !== undefined) {
        const permissions = normalizePermissions(body.permissions);
        if (!permissions) return res.status(400).json({ error: 'invalid_permissions' });
        patch.permissions = permissions;
      }
      if (body.active !== undefined) {
        if (typeof body.active !== 'boolean') return res.status(400).json({ error: 'invalid_active' });
        patch.active = body.active;
      }
      if (body.password !== undefined) {
        const passwordError = staffPasswordError(body.password);
        if (passwordError) return res.status(400).json({ error: passwordError });
        patch.passwordHash = await bcrypt.hash(body.password, 12);
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'no_fields' });
      const staff = await db.updateStaff(req.params.id, patch);
      staffCache.clear(req.params.id);
      if (!staff) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true, staff });
    } catch (err) {
      console.error('update staff error', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.delete('/api/admin/staff/:id', staffLimiter, requireOwner, async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'invalid_id' });
      const removed = await db.deleteStaff(req.params.id);
      staffCache.clear(req.params.id);
      if (removed === 0) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('delete staff error', err?.message || err);
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
