/**
 * Integration tests for the access-gate / admin API (api/_lib/app.js).
 *
 * Runs the REAL Express app in-process with a FAKE data layer + in-memory
 * sessions, so login, session handling, the admin guards, code rotation, and the
 * order/assessment endpoints are all verified WITHOUT a database.
 *
 *   npm test          (sets SESSION_SECRET and runs `node --test`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createApp, safeEqual } from '../api/_lib/app.js';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-long-enough';

const CODE = 'secret-code';
const CODE_HASH = bcrypt.hashSync(CODE, 4); // low cost = fast tests

function makeDb(over = {}) {
  return {
    async getSettings() {
      return { access_code_hash: CODE_HASH, code_version: 1 };
    },
    async updateAccessCode() {
      return 2;
    },
    async listOrders({ groupBuyId } = {}) {
      return [{ id: 'o1', customer_name: 'Alice', group_buy_id: groupBuyId ?? null }];
    },
    async updateOrder() {
      return 1;
    },
    async deleteOrder() {},
    async bulkDeleteOrders() {},
    async listAssessmentResponses() {
      return [{ id: 'a1', full_name: 'Bob' }];
    },
    async ping() {},
    ...over,
  };
}

/** Start the app on a random port. Returns { base, close } and restores env. */
async function start({ db = {}, env = {} } = {}) {
  const saved = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  const app = createApp({ db: makeDb(db) });
  const server = await new Promise((res) => {
    const s = app.listen(0, () => res(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    async close() {
      await new Promise((r) => server.close(r));
      for (const k of Object.keys(env)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    },
  };
}

/** Tiny cookie jar so a sequence of requests share the session cookie. */
function jar() {
  return { cookie: '' };
}

async function call(base, path, { method = 'GET', body, j, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (j && j.cookie) h.cookie = j.cookie;
  const res = await fetch(base + path, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc && j) j.cookie = sc.split(';')[0];
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, data };
}

// --- safeEqual unit ---------------------------------------------------------
test('safeEqual: true for equal, false for unequal (incl. different lengths)', () => {
  assert.equal(safeEqual('hunter2', 'hunter2'), true);
  assert.equal(safeEqual('hunter2', 'hunter3'), false);
  assert.equal(safeEqual('short', 'a-much-longer-secret'), false);
});

// --- health -----------------------------------------------------------------
test('health: DB reachable → 200 healthy', async () => {
  const app = await start();
  try {
    const r = await call(app.base, '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'healthy');
  } finally {
    await app.close();
  }
});

test('health: DB unreachable → 500 unhealthy (no error details leaked)', async () => {
  const app = await start({ db: { async ping() { throw new Error('ENOTFOUND db.x'); } } });
  try {
    const r = await call(app.base, '/api/health');
    assert.equal(r.status, 500);
    assert.equal(r.data.status, 'unhealthy');
    assert.equal(r.data.error, undefined); // internal error not exposed
  } finally {
    await app.close();
  }
});

// --- admin login ------------------------------------------------------------
test('admin login: ADMIN_PASSWORD unset → 500 not_configured', async () => {
  const app = await start({ env: { ADMIN_PASSWORD: undefined } });
  try {
    const r = await call(app.base, '/api/admin/login', { method: 'POST', body: { password: 'x' } });
    assert.equal(r.status, 500);
    assert.equal(r.data.error, 'not_configured');
  } finally {
    await app.close();
  }
});

test('admin login: wrong password → 401 invalid_password (no session issued)', async () => {
  const app = await start({ env: { ADMIN_PASSWORD: 'correct horse battery' } });
  const j = jar();
  try {
    const r = await call(app.base, '/api/admin/login', { method: 'POST', body: { password: 'nope' }, j });
    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'invalid_password');
    const s = await call(app.base, '/api/admin/session', { j });
    assert.equal(s.data.admin, false);
  } finally {
    await app.close();
  }
});

test('admin login: correct password → 200 + session; admin/session true; logout drops it', async () => {
  const app = await start({ env: { ADMIN_PASSWORD: 'correct horse battery' } });
  const j = jar();
  try {
    const login = await call(app.base, '/api/admin/login', {
      method: 'POST',
      body: { password: 'correct horse battery' },
      j,
    });
    assert.equal(login.status, 200);
    assert.equal(login.data.ok, true);
    assert.ok(j.cookie.includes('dg.sid'), 'session cookie issued');

    const session = await call(app.base, '/api/admin/session', { j });
    assert.equal(session.status, 200);
    assert.equal(session.data.admin, true);

    const logout = await call(app.base, '/api/admin/logout', { method: 'POST', j });
    assert.equal(logout.status, 200);

    const after = await call(app.base, '/api/admin/session', { j });
    assert.equal(after.data.admin, false, 'session destroyed on logout');
  } finally {
    await app.close();
  }
});

// --- admin guard ------------------------------------------------------------
test('admin orders: 403 without session, 200 with admin session (PII proxied)', async () => {
  const app = await start({ env: { ADMIN_PASSWORD: 'pw12345' } });
  try {
    const anon = await call(app.base, '/api/admin/orders');
    assert.equal(anon.status, 403);
    assert.equal(anon.data.error, 'forbidden');

    const j = jar();
    await call(app.base, '/api/admin/login', { method: 'POST', body: { password: 'pw12345' }, j });
    const ok = await call(app.base, '/api/admin/orders', { j });
    assert.equal(ok.status, 200);
    assert.ok(Array.isArray(ok.data.orders));
    assert.equal(ok.data.orders[0].customer_name, 'Alice');
  } finally {
    await app.close();
  }
});

test('admin guard: Bearer ADMIN_API_KEY also authorizes (curl/automation path)', async () => {
  const app = await start({ env: { ADMIN_API_KEY: 'a-long-automation-token' } });
  try {
    const bad = await call(app.base, '/api/admin/orders', {
      headers: { authorization: 'Bearer wrong' },
    });
    assert.equal(bad.status, 403);
    const good = await call(app.base, '/api/admin/orders', {
      headers: { authorization: 'Bearer a-long-automation-token' },
    });
    assert.equal(good.status, 200);
  } finally {
    await app.close();
  }
});

// --- order endpoints --------------------------------------------------------
test('order endpoints: validation + success paths via admin session', async () => {
  const app = await start({
    env: { ADMIN_PASSWORD: 'pw12345' },
    db: { async updateOrder(id, patch) { return patch.order_status === 'ghost' ? 0 : 1; } },
  });
  const j = jar();
  try {
    await call(app.base, '/api/admin/login', { method: 'POST', body: { password: 'pw12345' }, j });

    const noFields = await call(app.base, '/api/admin/orders/o1', { method: 'PATCH', body: {}, j });
    assert.equal(noFields.status, 400);
    assert.equal(noFields.data.error, 'no_fields');

    const okPatch = await call(app.base, '/api/admin/orders/o1', {
      method: 'PATCH',
      body: { order_status: 'confirmed', payment_status: 'paid' },
      j,
    });
    assert.equal(okPatch.status, 200);

    const missing = await call(app.base, '/api/admin/orders/ghostid', {
      method: 'PATCH',
      body: { order_status: 'ghost' },
      j,
    });
    assert.equal(missing.status, 404);

    const noIds = await call(app.base, '/api/admin/orders/bulk-delete', { method: 'POST', body: { ids: [] }, j });
    assert.equal(noIds.status, 400);

    const bulk = await call(app.base, '/api/admin/orders/bulk-delete', {
      method: 'POST',
      body: { ids: ['o1', 'o2'] },
      j,
    });
    assert.equal(bulk.status, 200);

    const del = await call(app.base, '/api/admin/orders/o1', { method: 'DELETE', j });
    assert.equal(del.status, 200);

    const ar = await call(app.base, '/api/admin/assessment-responses', { j });
    assert.equal(ar.status, 200);
    assert.equal(ar.data.responses[0].full_name, 'Bob');
  } finally {
    await app.close();
  }
});

// --- access code gate -------------------------------------------------------
test('access/verify: empty → 400, wrong → 401, correct → 200 + valid session', async () => {
  const app = await start();
  const j = jar();
  try {
    const empty = await call(app.base, '/api/access/verify', { method: 'POST', body: {}, j });
    assert.equal(empty.status, 400);
    assert.equal(empty.data.error, 'code_required');

    const wrong = await call(app.base, '/api/access/verify', { method: 'POST', body: { code: 'nope' }, j });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.data.error, 'invalid_code');

    const right = await call(app.base, '/api/access/verify', { method: 'POST', body: { code: CODE }, j });
    assert.equal(right.status, 200);
    assert.equal(right.data.authenticated, true);

    const session = await call(app.base, '/api/session', { j });
    assert.equal(session.status, 200);
    assert.equal(session.data.authenticated, true);
  } finally {
    await app.close();
  }
});

test('access gate: rotating the code invalidates existing sessions (codeVersion bump)', async () => {
  let version = 1; // flips to 2 to simulate an admin code change
  const app = await start({ db: { async getSettings() { return { access_code_hash: CODE_HASH, code_version: version }; } } });
  const j = jar();
  try {
    const right = await call(app.base, '/api/access/verify', { method: 'POST', body: { code: CODE }, j });
    assert.equal(right.status, 200);
    let s = await call(app.base, '/api/session', { j });
    assert.equal(s.status, 200);

    version = 2; // admin rotated the code
    s = await call(app.base, '/api/session', { j });
    assert.equal(s.status, 401);
    assert.equal(s.data.error, 'session_invalidated');
  } finally {
    await app.close();
  }
});

// --- rate limiting ----------------------------------------------------------
test('access/verify rate limiter: 11th wrong attempt → 429 too_many_attempts', async () => {
  const app = await start();
  try {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await call(app.base, '/api/access/verify', { method: 'POST', body: { code: 'x' } });
    }
    assert.equal(last.status, 429);
    assert.equal(last.data.error, 'too_many_attempts');
  } finally {
    await app.close();
  }
});

// --- fallback ---------------------------------------------------------------
test('unknown /api route → 404 not_found', async () => {
  const app = await start();
  try {
    const r = await call(app.base, '/api/does-not-exist');
    assert.equal(r.status, 404);
    assert.equal(r.data.error, 'not_found');
  } finally {
    await app.close();
  }
});

// --- Bunuan access grants ---------------------------------------------------
const GB = '11111111-1111-4111-8111-111111111111';
const OTHER_GB = '22222222-2222-4222-8222-222222222222';

/** In-memory grants store implementing the db methods the routes use. */
function grantsDb() {
  const rows = [];
  let n = 0;
  return {
    rows,
    async groupBuyExists(id) { return id === GB || id === OTHER_GB; },
    async listBunuanGrants(gb) { return rows.filter((r) => r.group_buy_id === gb).slice().reverse(); },
    async upsertBunuanGrant(gb, email, note) {
      const existing = rows.find((r) => r.group_buy_id === gb && r.customer_email === email);
      if (existing) { existing.note = note; return existing; }
      n += 1;
      const row = { id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`, group_buy_id: gb, customer_email: email, note, granted_at: new Date().toISOString() };
      rows.push(row);
      return row;
    },
    async deleteBunuanGrant(gb, id) {
      const i = rows.findIndex((r) => r.id === id && r.group_buy_id === gb);
      if (i === -1) return 0;
      rows.splice(i, 1);
      return 1;
    },
  };
}

test('normalizeGrantEmail: trims + lowercases valid emails, rejects junk', async () => {
  const { normalizeGrantEmail } = await import('../api/_lib/app.js');
  assert.equal(normalizeGrantEmail('  Maria.Cruz@Example.COM '), 'maria.cruz@example.com');
  assert.equal(normalizeGrantEmail('not-an-email'), null);
  assert.equal(normalizeGrantEmail(''), null);
  assert.equal(normalizeGrantEmail(42), null);
  assert.equal(normalizeGrantEmail(`${'a'.repeat(250)}@x.co`), null);
});

test('bunuan grants: admin-only (403 without session, incl. write)', async () => {
  const db = grantsDb();
  const app = await start({ env: { ADMIN_PASSWORD: 'pw12345' }, db });
  try {
    const list = await call(app.base, `/api/admin/group-buys/${GB}/bunuan-grants`);
    assert.equal(list.status, 403);
    const add = await call(app.base, `/api/admin/group-buys/${GB}/bunuan-grants`, { method: 'POST', body: { email: 'a@b.co' } });
    assert.equal(add.status, 403);
    assert.equal(db.rows.length, 0);
  } finally {
    await app.close();
  }
});

test('bunuan grants: validation, normalisation, idempotent upsert, scoped delete', async () => {
  const db = grantsDb();
  const app = await start({ env: { ADMIN_PASSWORD: 'pw12345' }, db });
  const j = jar();
  const url = (gb) => `/api/admin/group-buys/${gb}/bunuan-grants`;
  try {
    await call(app.base, '/api/admin/login', { method: 'POST', body: { password: 'pw12345' }, j });

    assert.equal((await call(app.base, url('not-a-uuid'), { j })).status, 400);
    const badEmail = await call(app.base, url(GB), { method: 'POST', body: { email: 'nope' }, j });
    assert.equal(badEmail.status, 400);
    assert.equal(badEmail.data.error, 'invalid_email');
    const longNote = await call(app.base, url(GB), { method: 'POST', body: { email: 'a@b.co', note: 'x'.repeat(301) }, j });
    assert.equal(longNote.status, 400);
    assert.equal(longNote.data.error, 'note_too_long');
    const missingRound = await call(app.base, url('33333333-3333-4333-8333-333333333333'), { method: 'POST', body: { email: 'a@b.co' }, j });
    assert.equal(missingRound.status, 404);

    const add = await call(app.base, url(GB), { method: 'POST', body: { email: '  Maria@Example.com ', note: '  From order GB15-004 ' }, j });
    assert.equal(add.status, 200);
    assert.equal(add.data.grant.customer_email, 'maria@example.com');
    assert.equal(add.data.grant.note, 'From order GB15-004');

    // Same email again (different case) is an update, not a duplicate.
    const again = await call(app.base, url(GB), { method: 'POST', body: { email: 'MARIA@example.com' }, j });
    assert.equal(again.status, 200);
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0].note, null);

    const list = await call(app.base, url(GB), { j });
    assert.equal(list.status, 200);
    assert.equal(list.data.grants.length, 1);
    assert.equal((await call(app.base, url(OTHER_GB), { j })).data.grants.length, 0);

    const id = add.data.grant.id;
    // A grant id used under another round's URL is not found and not deleted.
    const wrongRound = await call(app.base, `${url(OTHER_GB)}/${id}`, { method: 'DELETE', j });
    assert.equal(wrongRound.status, 404);
    assert.equal(db.rows.length, 1);
    assert.equal((await call(app.base, `${url(GB)}/bad-id`, { method: 'DELETE', j })).status, 400);
    const del = await call(app.base, `${url(GB)}/${id}`, { method: 'DELETE', j });
    assert.equal(del.status, 200);
    assert.equal(db.rows.length, 0);
  } finally {
    await app.close();
  }
});
