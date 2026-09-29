import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const out = path.resolve(process.argv[2] || `migration-backups/${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(out, { recursive: true, mode: 0o700 });
const save = async (name, data) => {
  const dest = path.join(out, name);
  await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
  await fs.writeFile(dest, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2), { mode: 0o600 });
};
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const client = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
const manifest = { startedAt: new Date().toISOString(), source: base, tables: {}, files: [], errors: [], limitations: ['REST export is not a transactionally consistent snapshot. Freeze writes before final cutover.', 'Only API-exposed public tables are discoverable. SQL functions, triggers, indexes, constraints, RLS, sequences, roles, and hidden schemas require a pg_dump with a working database connection.', 'Auth API exports user profiles but not password hashes or complete auth schema.'] };
const response = await fetch(`${base}/rest/v1/`, { headers });
if (!response.ok) throw new Error(`Schema discovery failed: ${response.status}`);
const schema = await response.json();
await save('openapi.json', schema);
for (const [table, definition] of Object.entries(schema.definitions || {})) {
  try {
    const columns = Object.keys(definition.properties || {});
    const primary = columns.filter(c => definition.properties[c].description?.includes('Primary Key'));
    const order = (primary.length ? primary : columns).map(c => `${c}.asc.nullsfirst`).join(',');
    let offset = 0, expected;
    const chunks = [];
    while (true) {
      const params = new URLSearchParams({ select: '*', order, offset: String(offset), limit: '500' });
      const r = await fetch(`${base}/rest/v1/${encodeURIComponent(table)}?${params}`, { headers: { ...headers, Prefer: 'count=exact' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const count = Number(r.headers.get('content-range')?.split('/')[1]);
      if (!Number.isFinite(count)) throw new Error('Missing exact row count');
      if (expected === undefined) expected = count;
      if (expected !== count) throw new Error('Row count changed during export; freeze writes and retry');
      const raw = await r.text();
      const rows = JSON.parse(raw);
      if (!rows.length) break;
      chunks.push(raw.trim().slice(1, -1));
      offset += rows.length;
      if (offset >= expected) break;
    }
    if (offset !== expected) throw new Error(`Count mismatch: ${offset}/${expected}`);
    // Preserve numeric lexemes from the API rather than reserializing large integers.
    const raw = `[${chunks.filter(Boolean).join(',')}]`;
    await save(`tables/${table}.json`, raw);
    manifest.tables[table] = { rows: offset, sha256: createHash('sha256').update(raw).digest('hex') };
    console.log(`${table}: ${offset} rows`);
  } catch (e) { manifest.errors.push({ table, error: e.message }); }
}
try {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 500) break;
  }
  await save('auth-users.json', users);
  manifest.authUsers = users.length;
} catch (e) { manifest.errors.push({ scope: 'auth', error: e.message }); }
const { data: buckets, error } = await client.storage.listBuckets();
if (error) manifest.errors.push({ scope: 'storage', error: error.message });
else {
  await save('storage-buckets.json', buckets);
  for (const bucket of buckets) {
    async function walk(prefix = '') {
      for (let offset = 0; ; ) {
        const { data, error } = await client.storage.from(bucket.id).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw error;
        for (const item of data) {
          const name = prefix ? `${prefix}/${item.name}` : item.name;
          if (!item.id) { await walk(name); continue; }
          const { data: blob, error } = await client.storage.from(bucket.id).download(name);
          if (error) throw error;
          const bytes = Buffer.from(await blob.arrayBuffer());
          const relative = `storage/${createHash('sha256').update(`${bucket.id}/${name}`).digest('hex')}`;
          await save(relative, bytes);
          manifest.files.push({ bucket: bucket.id, name, public: bucket.public, localPath: relative, contentType: blob.type, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sourceUrl: client.storage.from(bucket.id).getPublicUrl(name).data.publicUrl });
        }
        offset += data.length;
        if (data.length < 100) break;
      }
    }
    try { await walk(); console.log(`Storage ${bucket.id}: downloaded`); }
    catch (e) { manifest.errors.push({ bucket: bucket.id, error: e.message }); }
  }
}
await fs.cp('supabase/migrations', path.join(out, 'historical-migrations'), { recursive: true });
manifest.finishedAt = new Date().toISOString();
await save('manifest.json', manifest);
console.log(`Export: ${out}; files: ${manifest.files.length}; errors: ${manifest.errors.length}`);
if (manifest.errors.length) process.exitCode = 1;
