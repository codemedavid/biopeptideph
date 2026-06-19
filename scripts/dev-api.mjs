/**
 * Local dev host for the access-gate / admin Express app.
 *
 * In production the app in api/index.js runs as a Vercel serverless function and
 * vercel.json rewrites /api/* to it. Locally there is no such rewrite, so this
 * tiny host mounts the SAME Express app on a plain port and the Vite dev server
 * proxies /api to it (see vite.config.ts `server.proxy`).
 *
 * Run it with the env loaded from .env (Node >= 20.6):
 *   node --env-file=.env scripts/dev-api.mjs
 * or just `npm run dev:api`. It needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SESSION_SECRET and ADMIN_PASSWORD set (same vars the deployed function uses) —
 * NO DATABASE_URL needed (the API talks to Supabase over HTTPS, not Postgres).
 */
import app from '../api/index.js';

const PORT = Number(process.env.API_PORT) || 3001;

app.listen(PORT, () => {
  console.log(`\n  access-gate API listening on http://localhost:${PORT}`);
  console.log('  Vite proxies /api here — open the app with `npm run dev`.\n');
});
