import fs from 'node:fs/promises';
import path from 'node:path';
const dir = path.resolve(process.argv[2] || 'migration-backups/supabase-2026-09-16');
const out = path.join(dir, 'import-package');
await fs.mkdir(path.join(out, 'parts'), { recursive: true, mode: 0o700 });
const source = await fs.readFile(path.join(dir, 'migration-imagekit.sql'), 'utf8');
// The generator writes one SQL statement per block. JSON strings encode their
// newlines, so splitting these generated blocks never splits a string value.
const blocks = source.trim().split('\n\n');
const units = [];
function jsonRows(raw) {
  const rows = []; let depth = 0, quoted = false, escaped = false, start = 1;
  for (let i = 1; i < raw.length-1; i++) {
    const c = raw[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { rows.push(raw.slice(start, i).trim()); start = i+1; }
  }
  const last = raw.slice(start, -1).trim(); if (last) rows.push(last);
  return rows;
}
for (const block of blocks) {
  if (block === 'BEGIN;' || block === 'COMMIT;' || block === 'SET LOCAL standard_conforming_strings = on;') continue;
  if (!block.startsWith('INSERT INTO ')) { units.push(block); continue; }
  const match = block.match(/^(INSERT INTO [\s\S]*?json_populate_recordset\(NULL::public\."[^"]+", )'([\s\S]*)'::json\);$/);
  if (!match) throw new Error('Unrecognized generated INSERT; refusing unsafe split');
  const raw = match[2].replaceAll("''", "'");
  const rows = jsonRows(raw);
  const statement = batch => `${match[1]}'[${batch.join(',').replaceAll("'", "''")}]'::json);`;
  let batch = [];
  for (const row of rows) {
    if (batch.length && Buffer.byteLength(statement([...batch, row])) > 170000) { units.push(statement(batch)); batch = []; }
    batch.push(row);
  }
  if (batch.length || !rows.length) units.push(statement(batch));
}
const groups = []; let group = [], bytes = 0;
for (const unit of units) {
  const size = Buffer.byteLength(unit)+2;
  if (size > 195000) throw new Error('A single statement exceeds the selected chunk size');
  if (group.length && bytes+size > 195000) { groups.push(group); group = []; bytes = 0; }
  group.push(unit); bytes += size;
}
if (group.length) groups.push(group);
const inventory = [];
for (let i = 0; i < groups.length; i++) {
  const name = `${String(i+1).padStart(2, '0')}_of_${String(groups.length).padStart(2, '0')}.sql`;
  const text = `-- Run part ${i+1} of ${groups.length}, once, in order, in the NEW destination project.\n-- This is a data recovery import; full schema/security restoration remains separate.\nBEGIN;\nSET LOCAL standard_conforming_strings = on;\n\n${groups[i].join('\n\n')}\n\nCOMMIT;\n`;
  await fs.writeFile(path.join(out, 'parts', name), text, { mode: 0o600 });
  inventory.push({ name, bytes: Buffer.byteLength(text) });
}
await fs.writeFile(path.join(out, 'ALL_DATA.sql'), source, { mode: 0o600 });
await fs.writeFile(path.join(out, 'README.txt'), `DESTINATION: Supabase qjaldxpvjeyvaowwkmmw\n\nChoose ONE import method. Do not run both.\n\nA. ONE FILE: ALL_DATA.sql contains all 20 recovered tables and 1,185 records (about 1.6 MB). Run once against an empty destination.\n\nB. SQL EDITOR PARTS: Open the destination project's SQL Editor. Paste the ENTIRE contents of each parts/*.sql file, and click Run. Run in filename order from 01 through ${String(groups.length).padStart(2, '0')}. Wait for success before proceeding. Every part is below 200 KB and uses its own transaction. If a part fails, stop; do not rerun earlier successful parts. If a request times out, inspect destination state before retrying because the result may be uncertain.\n\nFILES:\n${inventory.map(f => `${f.name}: ${(f.bytes/1024).toFixed(1)} KiB`).join('\n')}\n\nIMPORTANT SCOPE:\nThis recovers the API-exposed table records and basic table structure, NOT a complete live schema dump. Defaults, functions, triggers, foreign keys, indexes, grants, and original RLS policies still need restoring from the source. All imported tables have RLS enabled without policies. The app is not production-ready immediately after this import.\n\nImages are already uploaded privately to ImageKit. The SQL stores website /api/media/ paths, not image binaries or expiring links. Deploy the prepared media route and api/_lib/image-assets.json, with IMAGEKIT_PRIVATE_KEY configured server-side, for images to display. The two PDFs and external links retain their original locations. Future uploads still use the existing Supabase upload controls until those are separately migrated.\n\nThe full local archive retains all original database JSON and 1,912 source storage files. This ZIP contains only the SQL import and these instructions. Keep it private: it contains customer records.\n`, { mode: 0o600 });
await fs.writeFile(path.join(out, 'parts-manifest.json'), JSON.stringify(inventory, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ out, parts: inventory }, null, 2));
