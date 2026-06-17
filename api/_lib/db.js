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
