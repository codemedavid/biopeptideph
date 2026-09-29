import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Supply a temporary @electric-sql/pglite installation; no app dependency needed.
const modulePath = process.env.PGLITE_MODULE;
if (!modulePath) throw new Error('Set PGLITE_MODULE to the installed PGlite dist/index.js');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const dir = path.resolve(process.argv[2] || 'migration-backups/supabase-2026-09-16');
const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
const imagekit = process.argv.includes('--imagekit');
const parts = process.argv.includes('--parts');
const map = imagekit ? JSON.parse(await fs.readFile(path.join(dir, 'imagekit-url-map.json'), 'utf8')) : {};
const db = new PGlite();
try {
  if (parts) {
    const partDir = path.join(dir, 'import-package', 'parts');
    for (const file of (await fs.readdir(partDir)).filter(f => f.endsWith('.sql')).sort()) await db.exec(await fs.readFile(path.join(partDir, file), 'utf8'));
  } else await db.exec(await fs.readFile(path.join(dir, imagekit ? 'migration-imagekit.sql' : 'migration.sql'), 'utf8'));
  for (const [table, meta] of Object.entries(manifest.tables)) {
    let raw = await fs.readFile(path.join(dir, 'tables', `${table}.json`), 'utf8');
    for (const [old, next] of Object.entries(map)) raw = raw.split(JSON.stringify(old).slice(1, -1)).join(JSON.stringify(next.websiteUrl || next.url).slice(1, -1));
    const name = `public."${table.replaceAll('"', '""')}"`;
    const result = await db.query(`WITH expected AS (SELECT to_jsonb(t) AS row FROM json_populate_recordset(NULL::${name}, $1::json) t), actual AS (SELECT to_jsonb(t) AS row FROM ${name} t), differences AS ((SELECT * FROM expected EXCEPT ALL SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)) SELECT count(*)::integer AS mismatches FROM differences`, [raw]);
    if (result.rows[0].mismatches) throw new Error(`Restored values differ: ${table}`);
    console.log(`Verified ${table}: ${meta.rows} rows and all column values`);
  }
  for (const file of manifest.files) {
    const bytes = await fs.readFile(path.join(dir, file.localPath));
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`File integrity failure: ${file.localPath}`);
  }
  try {
    const inventory = JSON.parse(await fs.readFile(path.join(dir, 'storage-inventory.json'), 'utf8'));
    for (const bucket of inventory.buckets) {
      const files = manifest.files.filter(f => f.bucket === bucket.bucket);
      if (files.length !== bucket.count || files.reduce((n, f) => n+f.bytes, 0) !== bucket.bytes) throw new Error(`Storage inventory mismatch: ${bucket.bucket}`);
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const report = { verifiedAt: new Date().toISOString(), engine: 'PGlite', tables: Object.keys(manifest.tables).length, rows: Object.values(manifest.tables).reduce((n, t) => n+t.rows, 0), storageFiles: manifest.files.length, sqlRestore: 'passed', allRowValues: 'passed', storageChecksums: 'passed' };
  if (imagekit) report.imagekitImages = Object.keys(map).length;
  await fs.writeFile(path.join(dir, parts ? 'verification-parts.json' : imagekit ? 'verification-imagekit.json' : 'verification.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} finally { await db.close(); }
