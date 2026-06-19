/**
 * Unit tests for the stateless signed-cookie session (api/_lib/cookieSession.js).
 * Verifies round-trip, signature tampering rejection, and expiry — the
 * properties that make a cookie-only session safe to trust.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { cookieSession } from '../api/_lib/cookieSession.js';

function buildApp(maxAgeMs = 15 * 60 * 1000) {
  const app = express();
  app.use(cookieSession({ name: 'dg.sid', secret: 'unit-test-secret', maxAgeMs }));
  app.get('/set', (req, res) => {
    req.session = { isAdmin: true };
    req.saveSession();
    res.json({ ok: true });
  });
  app.get('/get', (req, res) => res.json({ isAdmin: !!req.session.isAdmin }));
  app.get('/clear', (req, res) => {
    req.clearSession();
    res.json({ ok: true });
  });
  return app;
}

async function listen(app) {
  const server = await new Promise((r) => {
    const s = app.listen(0, () => r(s));
  });
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

async function get(base, path, cookie) {
  const res = await fetch(base + path, { headers: cookie ? { cookie } : {} });
  const sc = res.headers.get('set-cookie');
  const setCookie = sc ? sc.split(';')[0] : null;
  const data = await res.json();
  return { data, setCookie };
}

test('cookie session: round-trips a signed session', async () => {
  const app = await listen(buildApp());
  try {
    const set = await get(app.base, '/set');
    assert.ok(set.setCookie && set.setCookie.startsWith('dg.sid='));
    const got = await get(app.base, '/get', set.setCookie);
    assert.equal(got.data.isAdmin, true);
  } finally {
    await app.close();
  }
});

test('cookie session: a tampered signature is rejected', async () => {
  const app = await listen(buildApp());
  try {
    const set = await get(app.base, '/set');
    // Flip the last character (part of the HMAC signature).
    const tampered = set.setCookie.slice(0, -1) + (set.setCookie.slice(-1) === 'A' ? 'B' : 'A');
    const got = await get(app.base, '/get', tampered);
    assert.equal(got.data.isAdmin, false, 'tampered cookie must not authenticate');
  } finally {
    await app.close();
  }
});

test('cookie session: garbage cookie is rejected (no crash)', async () => {
  const app = await listen(buildApp());
  try {
    const got = await get(app.base, '/get', 'dg.sid=not-a-real-token');
    assert.equal(got.data.isAdmin, false);
  } finally {
    await app.close();
  }
});

test('cookie session: an expired session is rejected', async () => {
  const app = await listen(buildApp(40)); // 40ms lifetime
  try {
    const set = await get(app.base, '/set');
    await new Promise((r) => setTimeout(r, 80)); // let it expire
    const got = await get(app.base, '/get', set.setCookie);
    assert.equal(got.data.isAdmin, false, 'expired cookie must not authenticate');
  } finally {
    await app.close();
  }
});

test('cookie session: clearSession drops it', async () => {
  const app = await listen(buildApp());
  try {
    const set = await get(app.base, '/set');
    const cleared = await get(app.base, '/clear', set.setCookie);
    // A fresh request with no cookie is unauthenticated...
    const got = await get(app.base, '/get');
    assert.equal(got.data.isAdmin, false);
    // ...and the cleared cookie value (dg.sid=) must not authenticate either.
    const reuse = await get(app.base, '/get', cleared.setCookie || 'dg.sid=');
    assert.equal(reuse.data.isAdmin, false);
  } finally {
    await app.close();
  }
});
