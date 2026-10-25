-- ============================================================================
-- Staff accounts for the admin dashboard.
--
-- The owner logs in with ADMIN_PASSWORD and creates staff accounts from the
-- dashboard's "Staff Accounts" panel. Each staff row holds a bcrypt hash and
-- the list of dashboard sections (api/_lib/adminFeatures.js keys) it may open.
--
-- Read/written ONLY by the serverless API with the service-role key. RLS is on
-- with no policies, so the browser anon key can neither list staff nor read a
-- password hash. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_staff (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  password_hash text        NOT NULL,
  permissions   text[]      NOT NULL DEFAULT '{}',
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT admin_staff_email_normalized CHECK (email = lower(btrim(email)))
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_staff_email_key ON admin_staff (email);

ALTER TABLE admin_staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_staff FROM anon, authenticated;
