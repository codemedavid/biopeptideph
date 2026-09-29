import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { signedImageUrl } from '../api/_lib/media.js';
const dir = process.argv[2] || 'migration-backups/supabase-2026-09-16';
if (process.argv.includes('--purge-status')) {
  const cleanup = JSON.parse(await fs.readFile(`${dir}/imagekit-cleanup-result.json`, 'utf8'));
  const report = JSON.parse(await fs.readFile(`${dir}/imagekit-inventory-verification.json`, 'utf8'));
  report.purgeStatuses = [];
  for (const purge of cleanup.purges) {
    const r = await fetch(`https://api.imagekit.io/v1/files/purge/${encodeURIComponent(purge.requestId)}`, { headers: { Authorization: `Basic ${Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString('base64')}` } });
    assert.equal(r.status, 200); report.purgeStatuses.push(await r.json());
  }
  report.purgeCheckedAt = new Date().toISOString();
  await fs.writeFile(`${dir}/imagekit-inventory-verification.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(report.purgeStatuses);
  process.exit(0);
}
const map = JSON.parse(await fs.readFile(`${dir}/imagekit-url-map.json`, 'utf8'));
const asset = Object.values(map).find(v => v.private);
assert.ok(asset, 'No private upload is available');
const signed = signedImageUrl(asset.filePath, 640);
const bad = new URL(signed); bad.searchParams.set('ik-s', '0'.repeat(40));
const expired = signedImageUrl(asset.filePath, 640, { now: Date.now()-3600000 });
const results = {};
for (const [name, url] of Object.entries({ unsigned: asset.url, signed, tampered: bad.href, expired })) {
  const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
  results[name] = r.status;
}
assert.equal(results.signed, 200);
for (const name of ['unsigned', 'tampered', 'expired']) assert.ok([401, 403].includes(results[name]), `${name} should be rejected: ${results[name]}`);
await fs.writeFile(`${dir}/imagekit-delivery-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), ...results }, null, 2), { mode: 0o600 });
console.log(results);
if (process.argv.includes('--inventory')) {
  const headers = { Authorization: `Basic ${Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString('base64')}` };
  async function list(folder) {
    const all = [];
    for (let skip = 0; ; ) {
      const query = new URLSearchParams({ path: `/diamondglow-migration/${folder}/`, type: 'file', limit: '1000', skip: String(skip) });
      const response = await fetch(`https://api.imagekit.io/v1/files?${query}`, { headers });
      assert.equal(response.status, 200);
      const batch = await response.json(); all.push(...batch); skip += batch.length;
      if (batch.length < 1000) return all;
    }
  }
  const files = await list('private-v1');
  const expected = new Set(Object.values(map).map(f => f.fileId));
  assert.equal(files.length, expected.size);
  for (const file of files) { assert.ok(expected.has(file.fileId)); assert.equal(file.isPrivateFile, true); }
  assert.equal((await list('menu-images')).length, 0);
  assert.equal((await list('guide-files')).length, 0);
  const cleanup = JSON.parse(await fs.readFile(`${dir}/imagekit-cleanup-result.json`, 'utf8'));
  const purgeStatuses = [];
  for (const purge of cleanup.purges) {
    const response = await fetch(`https://api.imagekit.io/v1/files/purge/${encodeURIComponent(purge.requestId)}`, { headers });
    assert.equal(response.status, 200);
    purgeStatuses.push(await response.json());
  }
  const report = { checkedAt: new Date().toISOString(), privateFiles: files.length, bytes: files.reduce((n, f) => n+f.size, 0), obsoletePublicFiles: 0, purgeStatuses };
  await fs.writeFile(`${dir}/imagekit-inventory-verification.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(report);
}
