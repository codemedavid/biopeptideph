import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { referencedImages } from './migration-assets.mjs';

const dir = path.resolve(process.argv[2] || 'migration-backups/supabase-2026-09-16');
const key = process.env.IMAGEKIT_PRIVATE_KEY;
if (!key) throw new Error('Set IMAGEKIT_PRIVATE_KEY in a local server-only env file');
const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
if (manifest.errors.length) throw new Error('Resolve export errors first');
const mapFile = path.join(dir, 'imagekit-url-map.json');
let map = {};
try { map = JSON.parse(await fs.readFile(mapFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
if (Object.values(map).some(v => !v.private)) {
  try { await fs.writeFile(path.join(dir, 'imagekit-public-map.backup.json'), JSON.stringify(map, null, 2), { flag: 'wx', mode: 0o600 }); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
}
map = Object.fromEntries(Object.entries(map).filter(([, v]) => v.private && v.url.includes('/private-v1/')));
const selected = await referencedImages(dir, manifest);
const groups = new Map();
for (const file of selected) { if (!groups.has(file.sha256)) groups.set(file.sha256, []); groups.get(file.sha256).push(file); }
async function upload(item) {
  const bytes = await fs.readFile(path.join(dir, item.localPath));
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error('Asset checksum mismatch');
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: item.contentType }), path.basename(item.name));
  // Hash avoids collisions and unsafe characters; preserve extension for delivery.
  const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[item.contentType];
  if (!extension) throw new Error(`Unsupported image format: ${item.contentType}`);
  form.set('fileName', `${item.sha256}${extension}`);
  form.set('folder', '/diamondglow-migration/private-v1');
  form.set('useUniqueFileName', 'false');
  form.set('overwriteFile', 'true');
  form.set('isPrivateFile', 'true');
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {
    r = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` }, body: form, signal: AbortSignal.timeout(60000),
    });
    if (r.status !== 429 && r.status < 500) break;
    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  if (!r.ok) throw new Error(`ImageKit upload failed: HTTP ${r.status}`);
  const data = await r.json();
  if (!data.url || !data.fileId) throw new Error('ImageKit response missing file ID or URL');
  if (!data.url.startsWith('https://ik.imagekit.io/jl17byaav/')) throw new Error('Unexpected ImageKit account');
  return [item.sha256, { url: data.url, fileId: data.fileId, sha256: item.sha256, private: true, websiteUrl: `/api/media/${item.sha256}`, filePath: data.filePath }];
}
const known = new Map(Object.values(map).map(value => [value.sha256, value]));
for (const [hash, files] of groups) if (known.has(hash)) for (const file of files) map[file.sourceUrl] = known.get(hash);
const pending = [...groups.entries()].filter(([hash]) => !known.has(hash)).map(([, files]) => files[0]);
console.log(`Referenced images: ${selected.length}; unique files: ${groups.size}; pending uploads: ${pending.length}`);
for (let offset = 0; offset < pending.length; offset += 15) {
  const results = await Promise.allSettled(pending.slice(offset, offset+15).map(upload));
  for (const result of results) if (result.status === 'fulfilled') for (const file of groups.get(result.value[0])) map[file.sourceUrl] = result.value[1];
  await fs.writeFile(`${mapFile}.tmp`, JSON.stringify(map, null, 2), { mode: 0o600 });
  await fs.rename(`${mapFile}.tmp`, mapFile);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  console.log(`Uploaded images: ${Object.keys(map).length}`);
}
// Ensure a map exists even if storage contains no images.
await fs.writeFile(mapFile, JSON.stringify(map, null, 2), { mode: 0o600 });
console.log('Image upload complete. Run build-migration.mjs with --imagekit to generate the rewritten SQL.');
