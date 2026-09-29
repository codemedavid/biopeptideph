import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createApp } from '../api/_lib/app.js';
import { signedImageUrl } from '../api/_lib/media.js';

test('media: authenticated catalog delivery, admin-only proofs, bounded variants and cross-site rejection', async () => {
  process.env.SESSION_SECRET = 'media-test-session-secret';
  process.env.IMAGEKIT_PRIVATE_KEY = 'media-test-key';
  process.env.ADMIN_PASSWORD = 'media-test-admin';
  const id = 'a'.repeat(64), proof = 'b'.repeat(64);
  const assets = { [id]: { filePath: `/diamondglow-migration/private-v1/${id}.jpg`, access: 'catalog' }, [proof]: { filePath: `/diamondglow-migration/private-v1/${proof}.png`, access: 'admin' } };
  let version = 1;
  const db = { getSettings: async () => ({ access_code_hash: bcrypt.hashSync('test-code', 4), code_version: version }) };
  const app = createApp({ db, mediaAssets: assets });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (target, cookie = '', headers = {}) => fetch(base+target, { redirect: 'manual', headers: { cookie, ...headers } });
  const login = async (target, body) => {
    const r = await fetch(base+target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0];
  };
  try {
    assert.equal((await get(`/api/media/${id}`)).status, 401);
    const shopper = await login('/api/access/verify', { code: 'test-code' });
    const r = await get(`/api/media/${id}?w=640`, shopper);
    assert.equal(r.status, 302);
    const location = new URL(r.headers.get('location'));
    assert.equal(location.hostname, 'ik.imagekit.io');
    assert.match(location.pathname, /w-640,q-75,f-auto,c-at_max/);
    assert.ok(Number(location.searchParams.get('ik-t')) > Date.now()/1000);
    assert.match(location.searchParams.get('ik-s'), /^[a-f0-9]{40}$/);
    assert.equal(r.headers.get('cache-control'), 'private, max-age=240');
    assert.equal((await get(`/api/media/${proof}`, shopper)).status, 403);
    assert.equal((await get(`/api/media/${id}?w=9999`, shopper)).status, 400);
    assert.equal((await get(`/api/media/${id}`, shopper, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await get(`/api/media/${id}`, shopper, { 'sec-fetch-dest': 'document' })).status, 403);
    assert.equal((await get('/api/media/unknown', shopper)).status, 404);
    version = 2;
    assert.equal((await get(`/api/media/${id}`, shopper)).status, 401);
    const admin = await login('/api/admin/login', { password: 'media-test-admin' });
    const receipt = await get(`/api/media/${proof}`, admin);
    assert.equal(receipt.status, 302);
    assert.equal(receipt.headers.get('cache-control'), 'no-store');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('signer rejects arbitrary paths and unsupported image widths', () => {
  assert.throws(() => signedImageUrl('/other-account/file.jpg', 640, { key: 'test' }));
  assert.throws(() => signedImageUrl(`/diamondglow-migration/private-v1/${'a'.repeat(64)}.jpg`, 10000, { key: 'test' }));
});
