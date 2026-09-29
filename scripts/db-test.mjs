#!/usr/bin/env node
/**
 * Database-level test runner for the MOQ + Bunuan rules.
 *
 * `npm test` covers the TypeScript half of the rules. That is not enough: the
 * authority is SQL — place_group_buy_order, gb_kit_state, the advisory locks and
 * the RLS policies — and none of it is exercised by a pure unit test. This
 * script stands up a REAL, throwaway PostgreSQL, applies every migration in the
 * repo to it, and runs tests/db/*.db.mjs against it.
 *
 * Nothing here ever touches Supabase. The cluster lives under .tmp/pgdata, runs
 * on its own port, and is thrown away afterwards, so the suite is safe to run
 * on any machine and can be run as often as you like.
 *
 * Usage:
 *   npm run test:db                 # boot, migrate, run everything, tear down
 *   npm run test:db -- --keep       # leave the server running for poking about
 *   npm run test:db -- race         # run only tests/db/race.db.mjs
 *
 * One-time setup (the binary is a devDependency, not a system install):
 *   npm i -D embedded-postgres
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = path.join(REPO, '.tmp', 'pgdata');
const PORT = 54999;
// The Unix socket path has a 103-byte limit and repo paths are often longer, so
// the socket lives in /tmp while the data directory stays inside the repo.
const SOCK_DIR = '/tmp/dg-pgtest-sock';

const require = createRequire(import.meta.url);

/** Locate the prebuilt server that embedded-postgres ships for this platform. */
function postgresBinDir() {
  const pkg = `@embedded-postgres/${process.platform}-${process.arch}`;
  const candidates = [
    path.join(REPO, 'node_modules', pkg, 'native', 'bin'),
    path.join(REPO, 'node_modules', 'embedded-postgres', 'node_modules', pkg, 'native', 'bin'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'postgres'))) return dir;
  }
  console.error(
    `\nNo PostgreSQL binary found for ${process.platform}-${process.arch}.\n` +
    `These tests need a real database. Install the devDependency first:\n\n` +
    `    npm i -D embedded-postgres\n`,
  );
  process.exit(1);
}

const BIN = postgresBinDir();
const run = (cmd, args, opts = {}) =>
  spawnSync(path.join(BIN, cmd), args, { stdio: 'inherit', ...opts });

// Supabase-isms the migrations expect. A bare PostgreSQL has none of them, and
// without these the group_buys and kit migrations fail on GRANT / ALTER PUBLICATION.
const PRELUDE = `
create extension if not exists pgcrypto;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if; end $$;
create schema if not exists auth;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`;

// Migrations that cannot apply to a bare PostgreSQL (Supabase Storage, an old
// seed with a malformed uuid, a duplicate trigger). None of them touch products,
// orders, group_buys or anything the MOQ feature reads — the suite asserts the
// schema it needs is present before running, so a silent gap cannot hide here.
const EXPECTED_SKIPS = new Set([
  '20250101000000_add_discount_pricing_and_site_settings.sql',
  '20250125000000_add_payment_proofs_bucket.sql',
  '20250126000000_add_promo_codes.sql',
  '20250830082821_peaceful_cliff.sql',
  '20250901005107_calm_pine.sql',
  '20250901015559_frosty_wildflower.sql',
  '20250901125510_floating_sky.sql',
]);

async function migrate() {
  const pg = require('pg');
  const c = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' });
  await c.connect();
  // Start from a clean slate every run. The cluster is reused between runs for
  // speed, but re-applying the migrations onto an already-migrated schema fails
  // on the handful of older ones that are not idempotent — and a half-applied
  // schema is far worse than a slow start.
  await c.query(`drop schema if exists public cascade; create schema public;`);
  await c.query(PRELUDE);

  const dir = path.join(REPO, 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && !f.startsWith('rollback')).sort();
  const unexpected = [];
  for (const f of files) {
    try {
      await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch (e) {
      if (!EXPECTED_SKIPS.has(f)) unexpected.push(`${f}: ${e.message}`);
    }
  }
  // The live posture the storefront runs under today: orders accept public
  // inserts. tests/db/rls.db.mjs is what tightens and re-checks that.
  await c.query(`alter table public.orders enable row level security`);
  await c.query(`drop policy if exists "orders public insert" on public.orders`);
  await c.query(`create policy "orders public insert" on public.orders for insert to anon, authenticated with check (true)`);

  // Fail loudly rather than test a half-built schema.
  const need = ['place_group_buy_order', 'gb_kit_state', 'gb_effective_moq', 'validate_and_price_order'];
  const { rows } = await c.query(
    `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname = any($1)`, [need]);
  const missing = need.filter((n) => !rows.some((r) => r.proname === n));

  await c.end();
  if (unexpected.length) {
    console.error('\nMigrations failed unexpectedly:\n  ' + unexpected.join('\n  '));
    process.exit(1);
  }
  if (missing.length) {
    console.error(`\nSchema is incomplete — missing: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function startServer() {
  fs.mkdirSync(SOCK_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const pwfile = path.join(REPO, '.tmp', 'pwfile');
    fs.writeFileSync(pwfile, 'postgres\n');
    const init = run('initdb', ['-D', DATA_DIR, '-U', 'postgres', '--auth=trust', `--pwfile=${pwfile}`, '-E', 'UTF8'], { stdio: 'ignore' });
    if (init.status !== 0) { console.error('initdb failed'); process.exit(1); }
  }
  run('pg_ctl', ['-D', DATA_DIR, '-o', `-p ${PORT} -k ${SOCK_DIR}`, '-l', path.join(REPO, '.tmp', 'pg.log'), '-w', 'start']);
}

const stopServer = () => run('pg_ctl', ['-D', DATA_DIR, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });

async function main() {
  const args = process.argv.slice(2);
  const keep = args.includes('--keep');
  const only = args.filter((a) => !a.startsWith('--'));

  // A cluster left behind by an interrupted run would silently serve stale data.
  stopServer();
  startServer();
  try {
    await migrate();
    const dir = path.join(REPO, 'tests', 'db');
    const suites = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.db.mjs'))
      .filter((f) => only.length === 0 || only.some((o) => f.includes(o)))
      .sort()
      .map((f) => path.join(dir, f));

    if (suites.length === 0) { console.error(`No suite matched ${only.join(', ')}`); process.exit(1); }

    // --experimental-strip-types lets parity.db.mjs import kitRules.ts directly,
    // so the TypeScript rules are compared against the SQL, not against a copy.
    const code = await new Promise((resolve) => {
      spawn(process.execPath,
        // --test-concurrency=1 is REQUIRED: every suite shares the one database and
        // resets rows between cases, so running two files at once corrupts both.
        ['--experimental-strip-types', '--test', '--test-concurrency=1', '--test-timeout=300000', ...suites],
        { stdio: 'inherit', cwd: REPO }).on('exit', resolve);
    });
    process.exitCode = code ?? 1;
  } finally {
    if (keep) console.log(`\nServer left running on port ${PORT}. Stop it with:\n  ${path.join(BIN, 'pg_ctl')} -D ${DATA_DIR} -m fast stop`);
    else stopServer();
  }
}

main();
