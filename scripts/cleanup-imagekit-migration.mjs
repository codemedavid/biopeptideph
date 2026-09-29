import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { referencedImages } from './migration-assets.mjs';
const dir = process.argv[2] || 'migration-backups/supabase-2026-09-16';
const key = process.env.IMAGEKIT_PRIVATE_KEY;
if (!key) throw new Error('Missing ImageKit key');
const manifest = JSON.parse(await fs.readFile(`${dir}/manifest.json`, 'utf8'));
const map = JSON.parse(await fs.readFile(`${dir}/imagekit-url-map.json`, 'utf8'));
for (const file of await referencedImages(dir, manifest)) if (!map[file.sourceUrl]?.private || map[file.sourceUrl].sha256 !== file.sha256) throw new Error('Private migration must finish before cleanup');
const local = new Map(manifest.files.map(f => [f.sha256, f]));
const headers = { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` };
async function request(url, options = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`https://api.imagekit.io${url}`, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(30000) });
    if (r.status === 429 || r.status >= 500) { await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt)); continue; }
    if (!r.ok && !(options.method === 'DELETE' && r.status === 404)) throw new Error(`ImageKit cleanup HTTP ${r.status}`);
    return r;
  }
  throw new Error('ImageKit cleanup retry limit');
}
const plan = [];
for (const bucket of ['menu-images', 'guide-files']) {
  for (let skip = 0; ; ) {
    const q = new URLSearchParams({ path: `/diamondglow-migration/${bucket}/`, limit: '100', skip: String(skip), type: 'file' });
    const files = await (await request(`/v1/files?${q}`)).json();
    for (const file of files) {
      const match = file.filePath?.match(/^\/diamondglow-migration\/(menu-images|guide-files)\/([a-f0-9]{64})\.[a-zA-Z0-9]+$/);
      if (!match || !local.has(match[2])) throw new Error('Cleanup found an unexpected file; refusing deletion');
      const source = local.get(match[2]);
      const bytes = await fs.readFile(`${dir}/${source.localPath}`);
      if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error('Local archive integrity check failed');
      if (Object.values(map).some(v => v.fileId === file.fileId)) throw new Error('Refusing to delete a current private image');
      plan.push({ fileId: file.fileId, filePath: file.filePath, bucket, bytes: file.size });
    }
    skip += files.length;
    if (files.length < 100) break;
  }
}
await fs.writeFile(`${dir}/imagekit-cleanup-plan.json`, JSON.stringify(plan, null, 2), { mode: 0o600 });
console.log(`Obsolete public migration files: ${plan.length}`);
if (process.argv.includes('--apply')) {
  for (let offset = 0; offset < plan.length; offset += 4) {
    const results = await Promise.allSettled(plan.slice(offset, offset+4).map(file => request(`/v1/files/${encodeURIComponent(file.fileId)}`, { method: 'DELETE' })));
    const failed = results.find(r => r.status === 'rejected');
    if (failed) throw failed.reason;
    console.log(`Removed ${Math.min(offset+4, plan.length)}/${plan.length}`);
  }
  const purges = [];
  for (const bucket of new Set(plan.map(f => f.bucket))) {
    const r = await request('/v1/files/purge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: `https://ik.imagekit.io/jl17byaav/diamondglow-migration/${bucket}/*` }) });
    purges.push(await r.json());
  }
  await fs.writeFile(`${dir}/imagekit-cleanup-result.json`, JSON.stringify({ completedAt: new Date().toISOString(), removedFiles: plan.length, purges }, null, 2), { mode: 0o600 });
  console.log('Obsolete public uploads removed; CDN purge requested.');
}
