import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { referencedImages } from './migration-assets.mjs';

const dir = path.resolve(process.argv[2] || 'migration-backups/supabase-2026-09-16');
const schema = JSON.parse(await fs.readFile(path.join(dir, 'openapi.json'), 'utf8'));
const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
if (manifest.errors.length) throw new Error('Export contains errors; resolve these before building migration');
let map = {};
if (process.argv.includes('--imagekit')) {
  map = JSON.parse(await fs.readFile(path.join(dir, 'imagekit-url-map.json'), 'utf8'));
  const index = {};
  for (const file of await referencedImages(dir, manifest)) {
    const asset = map[file.sourceUrl];
    if (!asset?.websiteUrl || !asset.private || !asset.filePath || asset.sha256 !== file.sha256) throw new Error('Private ImageKit uploads are incomplete');
    const existing = index[file.sha256];
    index[file.sha256] = { filePath: asset.filePath, access: existing?.access === 'catalog' ? 'catalog' : file.access };
  }
  await fs.writeFile('api/_lib/image-assets.json', JSON.stringify(index));
}
const ident = s => `"${s.replaceAll('"', '""')}"`;
const literal = s => `'${s.replaceAll("'", "''")}'`;
const sql = ['-- PostgreSQL data recovery migration into NEW EMPTY public tables.', '-- Schema inferred from REST metadata; NOT a full database schema backup.', '-- Functions, triggers, RLS, grants, indexes and full constraints must be restored separately.', 'BEGIN;', 'SET LOCAL standard_conforming_strings = on;'];
const allowed = /^(uuid|text|character varying|character|boolean|smallint|integer|bigint|numeric|real|double precision|json|jsonb|date|time without time zone|time with time zone|timestamp without time zone|timestamp with time zone|bytea)(\[\])?$/;
for (const [table, meta] of Object.entries(manifest.tables)) {
  const def = schema.definitions[table];
  const cols = Object.entries(def.properties);
  sql.push(`CREATE TABLE public.${ident(table)} (\n${cols.map(([name, p]) => {
    if (!allowed.test(p.format)) throw new Error(`Unsupported type ${table}.${name}: ${p.format}`);
    return `  ${ident(name)} ${p.format}${def.required?.includes(name) ? ' NOT NULL' : ''}`;
  }).join(',\n')}\n);`);
  // Supabase exposes public tables through its API. Keep records private until
  // the source policies have been restored and reviewed on the destination.
  sql.push(`ALTER TABLE public.${ident(table)} ENABLE ROW LEVEL SECURITY;`);
  let raw = await fs.readFile(path.join(dir, 'tables', `${table}.json`), 'utf8');
  if (createHash('sha256').update(raw).digest('hex') !== meta.sha256) throw new Error(`Checksum mismatch: ${table}`);
  // Change string tokens only; keep original integer/numeric precision.
  raw = raw.replace(/"(?:[^"\\]|\\.)*"/g, token => {
    let value = JSON.parse(token);
    let changed = false;
    for (const [old, next] of Object.entries(map)) {
      if (value.includes(old)) { value = value.replaceAll(old, next.websiteUrl || next.url); changed = true; }
    }
    return changed ? JSON.stringify(value) : token;
  });
  const names = cols.map(([name]) => ident(name)).join(', ');
  sql.push(`INSERT INTO public.${ident(table)} (${names}) SELECT ${names} FROM json_populate_recordset(NULL::public.${ident(table)}, ${literal(raw)}::json);`);
  const primary = cols.filter(([, p]) => p.description?.includes('Primary Key')).map(([name]) => ident(name));
  if (primary.length) sql.push(`ALTER TABLE public.${ident(table)} ADD PRIMARY KEY (${primary.join(', ')});`);
  sql.push(`DO $$ BEGIN IF (SELECT count(*) FROM public.${ident(table)}) <> ${meta.rows} THEN RAISE EXCEPTION 'Row count mismatch'; END IF; END $$;`);
}
sql.push('COMMIT;');
const file = process.argv.includes('--imagekit') ? 'migration-imagekit.sql' : 'migration.sql';
await fs.writeFile(path.join(dir, file), sql.join('\n\n')+'\n', { mode: 0o600 });
console.log(`Created ${path.join(dir, file)}: ${Object.keys(manifest.tables).length} tables, ${Object.values(manifest.tables).reduce((n, t) => n+t.rows, 0)} rows`);
