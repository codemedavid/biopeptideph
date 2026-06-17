/**
 * Seed or change the access code from the command line.
 *
 *   ACCESS_CODE='your-secret-code' DATABASE_URL='postgres://...' \
 *     node scripts/set-access-code.js
 *
 * (Both vars also load from a local .env via your shell if you export them.)
 *
 * Use this for the FIRST seed. After deploy, the admin can change the code at
 * runtime via POST /api/admin/access-code without touching the DB directly.
 *
 * Bumping code_version here also invalidates all existing sessions.
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

async function main() {
  const code = process.env.ACCESS_CODE;
  const connectionString = process.env.DATABASE_URL;

  if (!code || code.length < 6) {
    console.error('Set ACCESS_CODE (min 6 chars). Example:');
    console.error("  ACCESS_CODE='glow-2026!' node scripts/set-access-code.js");
    process.exit(1);
  }
  if (!connectionString) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const hash = await bcrypt.hash(code, 12);

  // Upsert the single settings row; on conflict, replace the hash and bump the
  // version so any active sessions are immediately invalidated.
  await pool.query(
    `INSERT INTO app_settings (id, access_code_hash, code_version)
     VALUES (1, $1, 1)
     ON CONFLICT (id) DO UPDATE
       SET access_code_hash = EXCLUDED.access_code_hash,
           code_version     = app_settings.code_version + 1,
           updated_at       = now()`,
    [hash]
  );

  const { rows } = await pool.query('SELECT code_version FROM app_settings WHERE id = 1');
  console.log(`✅ Access code set. code_version is now ${rows[0].code_version}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
