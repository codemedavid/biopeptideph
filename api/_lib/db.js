/**
 * Shared Postgres connection for the access-gate serverless function.
 *
 * Files under api/ that start with "_" are NOT treated as routes by Vercel,
 * so this module is import-only (never hit directly over HTTP).
 *
 * On Vercel each request can spin up a fresh serverless instance, so we cache
 * the pool on `globalThis` to reuse connections across warm invocations and
 * avoid exhausting Supabase's connection limit.
 */
import pg from 'pg';

const { Pool } = pg;

/**
 * Use the Supabase **connection pooler** string (Project → Settings → Database →
 * "Connection string" → "Transaction"/pooler, port 6543) for serverless.
 * Supabase requires SSL.
 */
function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL environment variable');
  }
  // The DIRECT Supabase host (db.<ref>.supabase.co:5432) is IPv6-only. Vercel
  // serverless functions are IPv4-only, so the direct host fails there with
  // ENOTFOUND / connection errors — which makes every DB query (the access gate
  // AND the admin session write on login) 500. Warn loudly: use the Transaction
  // POOLER string instead (aws-0-<region>.pooler.supabase.com:6543).
  try {
    const host = new URL(connectionString).hostname;
    if (/^db\..*\.supabase\.co$/.test(host)) {
      console.warn(
        `[db] DATABASE_URL uses the DIRECT host "${host}" (IPv6-only). This will fail on Vercel/IPv4. ` +
          'Use the Supabase "Transaction" pooler string (aws-0-<region>.pooler.supabase.com:6543).'
      );
    }
  } catch {
    /* ignore URL parse issues; the Pool will surface a real error */
  }
  return new Pool({
    connectionString,
    // Supabase serves a valid cert but the chain isn't in Node's default store
    // for the pooler host, so we don't reject unauthorized here.
    ssl: { rejectUnauthorized: false },
    // Keep this small: serverless fans out into many instances.
    max: 3,
    idleTimeoutMillis: 10_000,
  });
}

// Reuse one pool per warm instance.
export const pool = globalThis.__dgPgPool ?? (globalThis.__dgPgPool = createPool());

/**
 * Read the single settings row (id = 1) holding the bcrypt hash of the current
 * access code and the monotonically-increasing `code_version`.
 *
 * `code_version` is the mechanism for "invalidate ALL sessions instantly":
 * every session stores the version it was minted under. Changing the code bumps
 * the version, so every old session fails the equality check on its next request.
 */
export async function getSettings() {
  const { rows } = await pool.query(
    'SELECT access_code_hash, code_version FROM app_settings WHERE id = 1'
  );
  if (rows.length === 0) {
    throw new Error('app_settings not seeded — run: npm run set-access-code');
  }
  return rows[0];
}

/**
 * Atomically replace the access-code hash and bump the version.
 * The version bump is what kills every existing session.
 */
export async function updateAccessCode(newHash) {
  const { rows } = await pool.query(
    `UPDATE app_settings
        SET access_code_hash = $1,
            code_version = code_version + 1,
            updated_at = now()
      WHERE id = 1
      RETURNING code_version`,
    [newHash]
  );
  return rows[0].code_version;
}

// --- Admin data access (orders / assessment PII) ----------------------------
// Kept here (not inline in route handlers) so the Express app can be built with a
// swappable `db` object — the real one (pgDb) in production, a fake one in tests.

/** All orders, newest first; optionally scoped to one group buy. */
async function listOrders({ groupBuyId } = {}) {
  const { rows } = groupBuyId
    ? await pool.query(
        'SELECT * FROM orders WHERE group_buy_id = $1 ORDER BY created_at DESC',
        [groupBuyId]
      )
    : await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  return rows;
}

/** Update whitelisted fields on one order; returns the number of rows changed. */
async function updateOrder(id, patch) {
  const allowed = ['order_status', 'payment_status'];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (typeof patch?.[key] === 'string') {
      sets.push(`${key} = $${i++}`);
      vals.push(patch[key]);
    }
  }
  if (sets.length === 0) return 0; // nothing to update (route validates first)
  sets.push('updated_at = now()');
  vals.push(id);
  const { rowCount } = await pool.query(
    `UPDATE orders SET ${sets.join(', ')} WHERE id = $${i}`,
    vals
  );
  return rowCount;
}

async function deleteOrder(id) {
  await pool.query('DELETE FROM orders WHERE id = $1', [id]);
}

async function bulkDeleteOrders(ids) {
  await pool.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [ids]);
}

async function listAssessmentResponses() {
  const { rows } = await pool.query(
    'SELECT * FROM assessment_responses ORDER BY created_at DESC'
  );
  return rows;
}

/** Liveness probe used by GET /api/health. Throws if the DB is unreachable. */
async function ping() {
  await pool.query('SELECT 1');
}

/**
 * The production data layer (real Postgres). The Express app (api/_lib/app.js)
 * takes this as its `db` dependency; tests pass a fake implementing the same
 * shape, so the auth/session/route logic can be verified without a database.
 */
export const pgDb = {
  getSettings,
  updateAccessCode,
  listOrders,
  updateOrder,
  deleteOrder,
  bulkDeleteOrders,
  listAssessmentResponses,
  ping,
};
