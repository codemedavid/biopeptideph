/**
 * Vercel entry for the access-gate / admin API — one Express serverless function.
 * vercel.json rewrites every /api/* request here.
 *
 * The app lives in api/_lib/app.js (a testable factory). This file wires the
 * PRODUCTION data layer: `supabaseDb` talks to Supabase over HTTPS with the
 * SERVICE-ROLE key — NO direct Postgres connection, so there is no pooler / IPv6
 * concern. Sessions are stateless signed cookies (no session table).
 *
 * Required env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 * SESSION_SECRET, ADMIN_PASSWORD (and optional ADMIN_API_KEY).
 *
 * (To use a direct Postgres connection instead, import { pgDb } from
 * './_lib/db.js' and pass that as `db` — requires DATABASE_URL on the pooler.)
 */
import { createApp } from './_lib/app.js';
import { supabaseDb } from './_lib/supabaseDb.js';

export default createApp({ db: supabaseDb });
