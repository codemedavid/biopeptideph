/**
 * Staff accounts: owner-managed logins whose dashboard sections are limited to
 * the features the owner ticked. Runs the real Express app against an in-memory
 * admin_staff table — no database needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createApp } from '../api/_lib/app.js';
import { ADMIN_FEATURES, normalizePermissions } from '../api/_lib/adminFeatures.js';
import { ADMIN_FEATURE_INFO, canAccess } from '../src/lib/adminFeatures.ts';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-long-enough';
const OWNER_PASSWORD = 'owner password 123';

/** In-memory admin_staff with the same contract as supabaseDb's staff functions. */
function makeStaffDb() {
  const rows = new Map();
  const safe = ({ password_hash: _hash, ...row }) => ({ ...row });
  return {
    rows,
    async getSettings() {
      return { access_code_hash: 'x', code_version: 1 };
    },
    async listOrders() {
      return [{ id: 'o1' }];
    },
    async updateOrder() {
      return 1;
    },
    async listAssessmentResponses() {
      return [];
    },
    async findStaffByEmail(email) {
      const row = [...rows.values()].find((r) => r.email === email);
      return row ? { ...row } : null;
    },
    async getStaff(id) {
      return rows.has(id) ? safe(rows.get(id)) : null;
    },
    async listStaff() {
      return [...rows.values()].map(safe);
    },
    async createStaff({ email, passwordHash, permissions }) {
      if ([...rows.values()].some((r) => r.email === email)) return null;
      const row = { id: crypto.randomUUID(), email, password_hash: passwordHash, permissions, active: true };
      rows.set(row.id, row);
      return safe(row);
    },
    async updateStaff(id, patch) {
      const row = rows.get(id);
      if (!row) return null;
      const next = {
        ...row,
        ...(patch.permissions !== undefined && { permissions: patch.permissions }),
        ...(patch.active !== undefined && { active: patch.active }),
        ...(patch.passwordHash !== undefined && { password_hash: patch.passwordHash }),
      };
      rows.set(id, next);
      return safe(next);
    },
    async deleteStaff(id) {
      return rows.delete(id) ? 1 : 0;
    },
    async recordStaffLogin() {},
    async ping() {},
  };
}

async function start() {
  const saved = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = OWNER_PASSWORD;
  const db = makeStaffDb();
  const server = await new Promise((res) => {
    const s = createApp({ db }).listen(0, () => res(s));
  });
  return {
    db,
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((r) => server.close(r));
      if (saved === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = saved;
    },
  };
}

async function call(base, path, { method = 'GET', body, j } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (j?.cookie) headers.cookie = j.cookie;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc && j) j.cookie = sc.split(';')[0];
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function loginOwner(base) {
  const j = { cookie: '' };
  const r = await call(base, '/api/admin/login', { method: 'POST', body: { password: OWNER_PASSWORD }, j });
  assert.equal(r.status, 200);
  return j;
}

async function createStaff(base, owner, body) {
  const r = await call(base, '/api/admin/staff', { method: 'POST', body, j: owner });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.staff;
}

async function loginStaff(base, email, password) {
  const j = { cookie: '' };
  const r = await call(base, '/api/admin/login', { method: 'POST', body: { email, password }, j });
  return { j, ...r };
}

// --- feature list --------------------------------------------------------------
test('client and server feature lists are identical and in the same order', () => {
  assert.deepEqual(ADMIN_FEATURE_INFO.map((f) => f.key), [...ADMIN_FEATURES]);
});

test('normalizePermissions: dedupes into canonical order, rejects unknown or malformed input', () => {
  assert.deepEqual(normalizePermissions(['orders', 'products', 'orders']), ['products', 'orders']);
  assert.deepEqual(normalizePermissions([]), []);
  assert.equal(normalizePermissions(['orders', 'staff']), null);
  assert.equal(normalizePermissions('orders'), null);
  assert.equal(normalizePermissions([1]), null);
});

test('canAccess: owner sees everything, staff only what was granted, nobody without a session', () => {
  assert.equal(canAccess({ role: 'owner', email: null, permissions: [] }, 'fees'), true);
  const staff = { role: 'staff', email: 's@x.co', permissions: ['orders'] };
  assert.equal(canAccess(staff, 'orders'), true);
  assert.equal(canAccess(staff, 'products'), false);
  assert.equal(canAccess(null, 'orders'), false);
});

// --- owner session ---------------------------------------------------------------
test('owner session reports role owner with every feature', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    const s = await call(app.base, '/api/admin/session', { j: owner });
    assert.deepEqual(s.data, { admin: true, role: 'owner', email: null, permissions: [...ADMIN_FEATURES] });
  } finally {
    await app.close();
  }
});

// --- staff login -----------------------------------------------------------------
test('staff login: email + password starts a session limited to the granted features', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    await createStaff(app.base, owner, { email: ' Helper@Gmail.com ', password: 'staffpass1', permissions: ['orders'] });

    const { j, status } = await loginStaff(app.base, 'helper@gmail.com', 'staffpass1');
    assert.equal(status, 200);
    const s = await call(app.base, '/api/admin/session', { j });
    assert.deepEqual(s.data, { admin: true, role: 'staff', email: 'helper@gmail.com', permissions: ['orders'] });
  } finally {
    await app.close();
  }
});

test('staff login: wrong password and unknown email both → 401 invalid_credentials, no session', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    await createStaff(app.base, owner, { email: 'a@b.co', password: 'staffpass1', permissions: [] });

    const wrong = await loginStaff(app.base, 'a@b.co', 'not-it-at-all');
    assert.equal(wrong.status, 401);
    assert.equal(wrong.data.error, 'invalid_credentials');
    const unknown = await loginStaff(app.base, 'nobody@b.co', 'staffpass1');
    assert.equal(unknown.status, 401);
    assert.equal(unknown.data.error, 'invalid_credentials');
    const s = await call(app.base, '/api/admin/session', { j: unknown.j });
    assert.equal(s.data.admin, false);
  } finally {
    await app.close();
  }
});

test('staff login: the owner password does not work with a staff email', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    await createStaff(app.base, owner, { email: 'a@b.co', password: 'staffpass1', permissions: [] });
    const r = await loginStaff(app.base, 'a@b.co', OWNER_PASSWORD);
    assert.equal(r.status, 401);
  } finally {
    await app.close();
  }
});

test('staff login: a disabled account → 403 account_disabled', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    const staff = await createStaff(app.base, owner, { email: 'a@b.co', password: 'staffpass1', permissions: [] });
    await call(app.base, `/api/admin/staff/${staff.id}`, { method: 'PATCH', body: { active: false }, j: owner });
    const r = await loginStaff(app.base, 'a@b.co', 'staffpass1');
    assert.equal(r.status, 403);
    assert.equal(r.data.error, 'account_disabled');
  } finally {
    await app.close();
  }
});

// --- server-side enforcement -------------------------------------------------------
test('staff with only Inventory can read orders but not change them', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    await createStaff(app.base, owner, { email: 'inv@b.co', password: 'staffpass1', permissions: ['inventory'] });
    const { j } = await loginStaff(app.base, 'inv@b.co', 'staffpass1');

    assert.equal((await call(app.base, '/api/admin/orders', { j })).status, 200);
    const patch = await call(app.base, '/api/admin/orders/o1', { method: 'PATCH', body: { order_status: 'x' }, j });
    assert.equal(patch.status, 403);
    assert.equal((await call(app.base, '/api/admin/assessment-responses', { j })).status, 403);
    const code = await call(app.base, '/api/admin/access-code', { method: 'POST', body: { newCode: 'abcdefgh' }, j });
    assert.equal(code.status, 403);
  } finally {
    await app.close();
  }
});

test('staff with no matching feature cannot read orders at all', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    await createStaff(app.base, owner, { email: 'hero@b.co', password: 'staffpass1', permissions: ['hero'] });
    const { j } = await loginStaff(app.base, 'hero@b.co', 'staffpass1');
    assert.equal((await call(app.base, '/api/admin/orders', { j })).status, 403);
  } finally {
    await app.close();
  }
});

test('staff can never manage staff accounts, even with every feature', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    await createStaff(app.base, owner, { email: 'all@b.co', password: 'staffpass1', permissions: [...ADMIN_FEATURES] });
    const { j } = await loginStaff(app.base, 'all@b.co', 'staffpass1');
    assert.equal((await call(app.base, '/api/admin/staff', { j })).status, 403);
    const create = await call(app.base, '/api/admin/staff', {
      method: 'POST',
      body: { email: 'x@b.co', password: 'staffpass1', permissions: [] },
      j,
    });
    assert.equal(create.status, 403);
  } finally {
    await app.close();
  }
});

test('narrowing permissions or disabling an account takes effect on the next request', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    const staff = await createStaff(app.base, owner, { email: 'a@b.co', password: 'staffpass1', permissions: ['orders'] });
    const { j } = await loginStaff(app.base, 'a@b.co', 'staffpass1');
    assert.equal((await call(app.base, '/api/admin/orders', { j })).status, 200);

    await call(app.base, `/api/admin/staff/${staff.id}`, { method: 'PATCH', body: { permissions: ['hero'] }, j: owner });
    assert.equal((await call(app.base, '/api/admin/orders', { j })).status, 403);

    await call(app.base, `/api/admin/staff/${staff.id}`, { method: 'PATCH', body: { active: false }, j: owner });
    const s = await call(app.base, '/api/admin/session', { j });
    assert.equal(s.data.admin, false);
  } finally {
    await app.close();
  }
});

test('deleting a staff account ends its session', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    const staff = await createStaff(app.base, owner, { email: 'a@b.co', password: 'staffpass1', permissions: ['orders'] });
    const { j } = await loginStaff(app.base, 'a@b.co', 'staffpass1');
    const del = await call(app.base, `/api/admin/staff/${staff.id}`, { method: 'DELETE', j: owner });
    assert.equal(del.status, 200);
    assert.equal((await call(app.base, '/api/admin/orders', { j })).status, 403);
  } finally {
    await app.close();
  }
});

// --- owner management validation --------------------------------------------------
test('create staff: validates email, password length, permissions and duplicates', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    const post = (body) => call(app.base, '/api/admin/staff', { method: 'POST', body, j: owner });

    assert.equal((await post({ email: 'nope', password: 'staffpass1' })).data.error, 'invalid_email');
    assert.equal((await post({ email: 'a@b.co', password: 'short' })).data.error, 'password_too_short');
    assert.equal((await post({ email: 'a@b.co', password: 'x'.repeat(73) })).data.error, 'password_too_long');
    const badPerm = await post({ email: 'a@b.co', password: 'staffpass1', permissions: ['staff'] });
    assert.equal(badPerm.data.error, 'invalid_permissions');

    assert.equal((await post({ email: 'a@b.co', password: 'staffpass1', permissions: [] })).status, 201);
    const dup = await post({ email: 'A@B.co', password: 'staffpass1', permissions: [] });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.error, 'email_taken');
  } finally {
    await app.close();
  }
});

test('staff list never exposes password hashes', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    await createStaff(app.base, owner, { email: 'a@b.co', password: 'staffpass1', permissions: ['orders'] });
    const r = await call(app.base, '/api/admin/staff', { j: owner });
    assert.equal(r.status, 200);
    assert.equal(r.data.staff.length, 1);
    assert.equal('password_hash' in r.data.staff[0], false);
    assert.deepEqual(r.data.features, [...ADMIN_FEATURES]);
  } finally {
    await app.close();
  }
});

test('owner can reset a staff password; the old one stops working', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    const staff = await createStaff(app.base, owner, { email: 'a@b.co', password: 'staffpass1', permissions: [] });
    const reset = await call(app.base, `/api/admin/staff/${staff.id}`, {
      method: 'PATCH',
      body: { password: 'brand-new-pass' },
      j: owner,
    });
    assert.equal(reset.status, 200);
    assert.equal((await loginStaff(app.base, 'a@b.co', 'staffpass1')).status, 401);
    assert.equal((await loginStaff(app.base, 'a@b.co', 'brand-new-pass')).status, 200);
    assert.ok(await bcrypt.compare('brand-new-pass', app.db.rows.get(staff.id).password_hash));
  } finally {
    await app.close();
  }
});

test('update staff: bad id → 400, unknown id → 404, empty patch → 400', async () => {
  const app = await start();
  try {
    const owner = await loginOwner(app.base);
    const patch = (id, body) => call(app.base, `/api/admin/staff/${id}`, { method: 'PATCH', body, j: owner });
    assert.equal((await patch('not-a-uuid', { active: true })).status, 400);
    assert.equal((await patch(crypto.randomUUID(), { active: true })).status, 404);
    assert.equal((await patch(crypto.randomUUID(), {})).data.error, 'no_fields');
    assert.equal((await patch(crypto.randomUUID(), { active: 'yes' })).data.error, 'invalid_active');
  } finally {
    await app.close();
  }
});
