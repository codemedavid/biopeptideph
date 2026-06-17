-- ============================================================================
-- Access-gate schema. Run this once in the Supabase SQL editor (or psql).
-- Creates:
--   1. app_settings — one row holding the bcrypt'd access code + code_version
--   2. session      — the connect-pg-simple session store
-- ============================================================================

-- 1) Single-row settings table -------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  id               integer     PRIMARY KEY DEFAULT 1,
  access_code_hash text        NOT NULL,
  code_version     integer     NOT NULL DEFAULT 1,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_single_row CHECK (id = 1)
);

-- This table is read/written ONLY by the trusted serverless function using the
-- service-role connection string (DATABASE_URL), never by the browser anon key.
-- Lock it down so the public anon/auth roles can't read the hash via the API.
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
-- (No policies = no access for anon/authenticated. The Postgres role in
--  DATABASE_URL bypasses RLS, which is what the backend uses.)

-- 2) Session store (exact DDL expected by connect-pg-simple) -------------------
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar      NOT NULL COLLATE "default",
  "sess"   json         NOT NULL,
  "expire" timestamp(6) NOT NULL
) WITH (OIDS = FALSE);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
    ALTER TABLE "session"
      ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

ALTER TABLE "session" ENABLE ROW LEVEL SECURITY; -- backend role bypasses RLS
