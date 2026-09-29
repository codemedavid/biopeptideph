// Cutover sync: make the NEW Supabase project's rows match a fresh export of
// the OLD project, without recreating any tables.
//
//   node --env-file=.env.newproject.local scripts/cutover-sync.mjs <exportDir> [--final] [--dry-run]
//
// Why not build-migration.mjs: its SQL CREATEs the tables and aborts if they
// exist. The new project already has the full schema (db/full_schema.sql), so
// this script upserts data only.
//
// Guarantees
//   * One transaction — everything applies or nothing does.
//   * orders.gb_order_seq is COPIED from the old project, never recomputed, so
//     every receipt a customer already holds keeps its number. User triggers are
//     disabled for the copy (they would renumber orders and reset updated_at).
//   * Supabase storage URLs are rewritten to /api/media/<sha256> using the
//     export's imagekit-url-map.json, exactly as build-migration.mjs does.
//   * Deletes: the first run removes rows that no longer exist in the export.
//     A --final run (after the site points at the new project) deletes ONLY
//     rows recorded by the first run, so it can never remove an order placed on
//     the new site after the switch.
//   * Before COMMIT, row counts and every order number are verified against the
//     export; any mismatch rolls the whole sync back.
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const dir = path.resolve(process.argv[2] || '');
const isFinal = process.argv.includes('--final');
const isDryRun = process.argv.includes('--dry-run');
const dbUrl = process.env.NEW_DATABASE_POOLER_URL;
if (!process.argv[2]) throw new Error('Usage: cutover-sync.mjs <exportDir> [--final] [--dry-run]');
if (!dbUrl) throw new Error('Set NEW_DATABASE_POOLER_URL (see .env.newproject.local)');
if (!dbUrl.includes('qjaldxpvjeyvaowwkmmw')) throw new Error('Refusing: NEW_DATABASE_POOLER_URL is not the new project');

const OLD_STORAGE = 'https://tpzkdhcowlvpjfvjiejx.supabase.co/storage/v1/object/';
const NEW_STORAGE = 'https://qjaldxpvjeyvaowwkmmw.supabase.co/storage/v1/object/';
// Parents before children, so foreign keys hold at every step.
const ORDER = [
  'categories', 'group_buys', 'products', 'product_variations', 'group_buy_product_availability',
  'group_buy_product_kits', 'group_buy_bunuan_grants', 'menu_items', 'variations', 'add_ons',
  'orders', 'payment_methods', 'shipping_locations', 'site_settings', 'app_settings',
  'hero_carousel_slides', 'smart_guides', 'smart_guide_files', 'journey_sections',
  'recommendation_rules', 'assessment_responses',
];
// session: login sessions, meaningless across projects. moq_presets: the new
// project already has the same five seeded presets (ids differ by design).
const SKIP = new Set(['session', 'moq_presets']);
const PK = { session: 'sid' };
const LEDGER = path.join(dir, 'cutover-synced-ids.json');

const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
if (manifest.errors?.length) throw new Error(`Export has errors: ${JSON.stringify(manifest.errors).slice(0, 300)}`);
const urlMap = JSON.parse(await fs.readFile(path.join(dir, 'imagekit-url-map.json'), 'utf8'));

/** Rewrite every Supabase storage URL inside a JSON string token. */
function rewrite(raw) {
  const unmapped = new Set();
  const out = raw.replace(/"(?:[^"\\]|\\.)*"/g, (token) => {
    if (!token.includes('supabase.co/storage')) return token;
    let value = JSON.parse(token);
    for (const [src, dst] of Object.entries(urlMap)) {
      if (value.includes(src)) value = value.replaceAll(src, dst.websiteUrl);
    }
    // Non-image files (guide PDFs) are copied into the new project's storage
    // under the same bucket/path, so only the host changes.
    value = value.replaceAll(OLD_STORAGE, NEW_STORAGE);
    for (const m of value.match(/https:\/\/tpzkdhcowlvpjfvjiejx\.supabase\.co\/storage[^\s"']*/g) || []) unmapped.add(m);
    return JSON.stringify(value);
  });
  return { out, unmapped };
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = (sql, params) => client.query(sql, params);

const { rows: baseTables } = await q(
  `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`);
const existing = new Set(baseTables.map((r) => r.relname));
const exported = new Set(Object.keys(manifest.tables));
const tables = ORDER.filter((t) => exported.has(t) && existing.has(t) && !SKIP.has(t));
const unknown = [...exported].filter((t) => existing.has(t) && !SKIP.has(t) && !ORDER.includes(t));
if (unknown.length) throw new Error(`Tables not in the sync order (add them): ${unknown.join(', ')}`);

const ledger = isFinal ? JSON.parse(await fs.readFile(LEDGER, 'utf8')) : {};
const report = [];
const allUnmapped = new Set();

try {
  await q('BEGIN');
  for (const t of tables) await q(`ALTER TABLE public.${t} DISABLE TRIGGER USER`);
  // Clear order numbers first: rows are renumbered to production's values below,
  // and a stale number on another row must not trip the unique (round, seq) index.
  await q('UPDATE public.orders SET gb_order_seq = NULL WHERE gb_order_seq IS NOT NULL');

  const payloads = {};
  for (const t of tables) {
    const raw = await fs.readFile(path.join(dir, 'tables', `${t}.json`), 'utf8');
    const { out, unmapped } = rewrite(raw);
    unmapped.forEach((u) => allUnmapped.add(`${t}: ${u}`));
    payloads[t] = { json: out, rows: JSON.parse(out) };
  }

  for (const t of tables) {
    const pk = PK[t] || 'id';
    const { rows: cols } = await q(
      `SELECT a.attname FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0
         AND NOT a.attisdropped AND a.attgenerated = '' ORDER BY a.attnum`, [`public.${t}`]);
    const live = payloads[t].rows;
    const liveKeys = new Set(live.flatMap((r) => Object.keys(r)));
    const names = cols.map((c) => c.attname).filter((c) => live.length === 0 || liveKeys.has(c));
    const list = names.map((c) => `"${c}"`).join(', ');
    const updates = names.filter((c) => c !== pk).map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
    let upserted = 0;
    if (live.length) {
      const res = await q(
        `INSERT INTO public.${t} (${list})
         SELECT ${list} FROM json_populate_recordset(NULL::public.${t}, $1::json)
         ON CONFLICT ("${pk}") DO UPDATE SET ${updates}`, [payloads[t].json]);
      upserted = res.rowCount;
    }
    report.push({ table: t, export: live.length, upserted });
  }

  // Deletes run children-first so no foreign key is ever left dangling.
  for (const t of [...tables].reverse()) {
    const pk = PK[t] || 'id';
    const liveIds = payloads[t].rows.map((r) => String(r[pk]));
    const scope = isFinal ? (ledger[t] || []) : null; // final: only ids known at the first sync
    const res = await q(
      `DELETE FROM public.${t} WHERE NOT ("${pk}"::text = ANY($1::text[]))
         ${scope ? `AND "${pk}"::text = ANY($2::text[])` : ''}`,
      scope ? [liveIds, scope] : [liveIds]);
    report.find((r) => r.table === t).deleted = res.rowCount;
  }

  // Each round's allocator must sit at or above everything it has issued.
  await q(`UPDATE public.group_buys g SET order_seq_counter = GREATEST(g.order_seq_counter, s.max_seq)
             FROM (SELECT group_buy_id, MAX(gb_order_seq) AS max_seq FROM public.orders
                    WHERE group_buy_id IS NOT NULL GROUP BY group_buy_id) s
            WHERE s.group_buy_id = g.id`);

  for (const t of tables) await q(`ALTER TABLE public.${t} ENABLE TRIGGER USER`);

  // ---- Verify before committing -------------------------------------------
  const problems = [];
  for (const r of report) {
    const { rows } = await q(`SELECT count(*)::int n FROM public.${r.table}`);
    r.now = rows[0].n;
    // A first sync must match exactly; a final sync may also hold orders placed
    // on the new site after the switch, so only "at least" can be required.
    if (isFinal ? r.now < r.export : r.now !== r.export) problems.push(`${r.table}: ${r.now} rows vs export ${r.export}`);
  }
  const want = new Map(payloads.orders.rows.map((o) => [o.id, o.gb_order_seq ?? null]));
  const { rows: got } = await q('SELECT id, gb_order_seq FROM public.orders');
  let seqMismatch = 0;
  for (const o of got) if (want.has(o.id) && want.get(o.id) !== o.gb_order_seq) seqMismatch++;
  if (seqMismatch) problems.push(`${seqMismatch} orders have a different gb_order_seq than production`);
  const { rows: dup } = await q(`SELECT count(*)::int n FROM (SELECT 1 FROM public.orders WHERE group_buy_id IS NOT NULL
                                   GROUP BY group_buy_id, gb_order_seq HAVING count(*) > 1) d`);
  if (dup[0].n) problems.push(`${dup[0].n} duplicate order numbers`);
  const { rows: stale } = await q(`SELECT count(*)::int n FROM public.orders WHERE payment_proof_url LIKE '%tpzkdhcowlvpjfvjiejx%'`);
  if (stale[0].n) problems.push(`${stale[0].n} orders still point at the old project's storage`);

  console.table(report);
  if (allUnmapped.size) console.log('Old-storage URLs left unmapped:', [...allUnmapped]);
  if (problems.length) throw new Error(`Verification failed — rolled back:\n  ${problems.join('\n  ')}`);

  if (isDryRun) {
    await q('ROLLBACK');
    console.log('DRY RUN OK — verified, then rolled back. Nothing was changed.');
  } else {
    await q('COMMIT');
    if (!isFinal) {
      const ids = Object.fromEntries(tables.map((t) => [t, payloads[t].rows.map((r) => String(r[PK[t] || 'id']))]));
      await fs.writeFile(LEDGER, JSON.stringify(ids), { mode: 0o600 });
    }
    console.log(`COMMITTED ${isFinal ? 'final' : 'initial'} sync. Order numbers identical to production.`);
  }
} catch (e) {
  await q('ROLLBACK').catch(() => {});
  throw e;
} finally {
  await client.end();
}
