/**
 * End-to-end smoke test for the access-gate / admin API against a live deployment.
 *
 * Usage (BASE_URL is REQUIRED — point it at YOUR deployment):
 *   BASE_URL=https://<your-app>.vercel.app node scripts/e2e-admin.mjs
 *   BASE_URL=https://<your-app>.vercel.app ADMIN_PASSWORD='your-real-pw' node scripts/e2e-admin.mjs
 *   BASE_URL=http://localhost:3001 node scripts/e2e-admin.mjs   # against `npm run dev:api`
 *
 * Without ADMIN_PASSWORD it runs the unauthenticated checks (proves the server
 * is up, the DB/session store connects, and ADMIN_PASSWORD is configured).
 * With ADMIN_PASSWORD it also exercises the full login -> session flow.
 */

const rawBase = process.env.BASE_URL;
if (!rawBase) {
  console.error(
    'BASE_URL is required. Example:\n' +
      "  BASE_URL=https://<your-app>.vercel.app node scripts/e2e-admin.mjs\n" +
      'Set it to your real deployment (or http://localhost:3001 for `npm run dev:api`).'
  );
  process.exit(1);
}
const BASE = rawBase.replace(/\/$/, '');
const PW = process.env.ADMIN_PASSWORD;

let pass = 0;
let fail = 0;

function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function call(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  let body = null;
  try { body = await res.json(); } catch { /* non-json */ }
  return { status: res.status, body, headers: res.headers };
}

console.log(`\nE2E against ${BASE}\n`);

// 1. Server reachable
console.log('1. Server reachable + DB/session store healthy');
{
  const r = await call('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: '___definitely_wrong___' }),
  });
  ok('endpoint responds (not a network error)', r.status > 0);
  ok('no 500 — session store / DB connects', r.status !== 500,
     r.body ? JSON.stringify(r.body) : `HTTP ${r.status}`);
  ok('ADMIN_PASSWORD is configured (got invalid_password, not not_configured)',
     r.status === 401 && r.body?.error === 'invalid_password',
     `HTTP ${r.status} ${JSON.stringify(r.body)}`);
}

// 1b. Real DB query path (access/verify runs getSettings() before checking the
// code). 500 here = the serverless function can't query Postgres (bad
// DATABASE_URL). 401 = DB reachable, code just wrong.
console.log('\n1b. Database query path (access/verify forces a real SQL query)');
{
  const r = await call('/api/access/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '___probe___' }),
  });
  ok('DB reachable from server (401 invalid_code, not 500 server_error)',
     r.status === 401 && r.body?.error === 'invalid_code',
     `HTTP ${r.status} ${JSON.stringify(r.body)} — if 500, DATABASE_URL is wrong/unreachable`);
}

// 2. Unauthenticated session endpoints behave
console.log('\n2. Unauthenticated session endpoints');
{
  const s = await call('/api/session', { headers: { 'cache-control': 'no-store' } });
  ok('/api/session returns 401 (not 500)', s.status === 401, `HTTP ${s.status} ${JSON.stringify(s.body)}`);
  const a = await call('/api/admin/session', { headers: { 'cache-control': 'no-store' } });
  ok('/api/admin/session returns 200 {admin:false}', a.status === 200 && a.body?.admin === false,
     `HTTP ${a.status} ${JSON.stringify(a.body)}`);
}

// 3. Full login flow (only if a real password is supplied)
console.log('\n3. Authenticated login flow');
if (!PW) {
  console.log('  ⏭  skipped — set ADMIN_PASSWORD env to run this');
} else {
  // fetch keeps no cookie jar by default; capture set-cookie manually
  const login = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  });
  const loginBody = await login.json().catch(() => null);
  ok('login with real password succeeds (200 ok)', login.status === 200 && loginBody?.ok === true,
     `HTTP ${login.status} ${JSON.stringify(loginBody)}`);

  const setCookie = login.headers.get('set-cookie');
  ok('session cookie issued', !!setCookie && /dg\.sid/.test(setCookie || ''), setCookie || 'no set-cookie');

  if (setCookie) {
    const cookie = setCookie.split(';')[0];
    const adminSession = await fetch(`${BASE}/api/admin/session`, {
      headers: { cookie, 'cache-control': 'no-store' },
    });
    const asBody = await adminSession.json().catch(() => null);
    ok('admin session restored from cookie (admin:true)',
       adminSession.status === 200 && asBody?.admin === true,
       `HTTP ${adminSession.status} ${JSON.stringify(asBody)}`);
  }
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ FAILURES'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
