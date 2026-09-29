-- MOQ + Kit Size, step 2 of 4: per-round overrides and the Bunuan access grant.
--
-- A product carries a DEFAULT MOQ and kit size (migration ...000000). This adds
-- a per-(round, product) override layer so an admin can change the rule for ONE
-- round without editing the product and disturbing every other round.
--
-- What this table is NOT: inventory. There is deliberately no "remaining" or
-- "bunuan_stock" column. How many units a kit still needs is DERIVED from real
-- orders every time it is asked for (see gb_kit_state in the next migration), so
-- it can never drift out of sync with reality the way a cached counter would.
-- The only stored numbers here are admin intent, never computed state.
--
-- Nothing reads these tables yet. Safe to apply on a live store.
-- Idempotent: safe to run more than once.

-- --------------------------------------------------------------------------
-- 1) Per-round MOQ / kit size overrides and Bunuan switches
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_buy_product_kits (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_buy_id       uuid NOT NULL REFERENCES group_buys(id) ON DELETE CASCADE,
  product_id         uuid NOT NULL REFERENCES products(id)   ON DELETE CASCADE,

  -- NULL = inherit the product's value. A row may exist to carry only a flag.
  moq_override       integer CHECK (moq_override      IS NULL OR moq_override      >= 1),
  kit_size_override  integer CHECK (kit_size_override IS NULL OR kit_size_override >= 1),

  -- Admin override: keep this product out of Bunuan for this round even though
  -- its kit is short (e.g. the supplier can no longer source it).
  bunuan_enabled     boolean NOT NULL DEFAULT true,

  -- Admin override: treat the kit as finished regardless of the arithmetic
  -- (e.g. the admin is absorbing the shortfall themselves). Forces
  -- bunuan_needed to 0 and removes the product from the Bunuan page.
  manually_completed boolean NOT NULL DEFAULT false,

  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  UNIQUE (group_buy_id, product_id)
);

CREATE INDEX IF NOT EXISTS gb_prod_kits_gb_idx   ON group_buy_product_kits(group_buy_id);
CREATE INDEX IF NOT EXISTS gb_prod_kits_prod_idx ON group_buy_product_kits(product_id);

ALTER TABLE group_buy_product_kits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gb_prod_kits public read" ON group_buy_product_kits;
CREATE POLICY "gb_prod_kits public read" ON group_buy_product_kits FOR SELECT USING (true);
DROP POLICY IF EXISTS "gb_prod_kits open write" ON group_buy_product_kits;
CREATE POLICY "gb_prod_kits open write" ON group_buy_product_kits FOR ALL USING (true) WITH CHECK (true);

-- Realtime so an admin override reflects on the storefront immediately, the same
-- way group_buy_product_availability already does.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE group_buy_product_kits;
EXCEPTION WHEN others THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- 2) Bunuan access grants (the safety valve)
-- --------------------------------------------------------------------------
-- Bunuan is restricted to customers who already ordered in the SAME round, and
-- the match requires name AND email AND phone (there are no customer accounts,
-- so typed details are the only identity available). Normalisation absorbs
-- casing, punctuation and phone formatting — but not a genuinely different name,
-- e.g. "Ma. Teresa Cruz" the first time and "Maria Teresa Cruz" the second.
--
-- Rather than loosen the rule for everyone, an admin can whitelist one customer
-- for one round from the Orders tab. Scoped to a round on purpose: a grant must
-- never silently carry over into the next Group Buy.
CREATE TABLE IF NOT EXISTS group_buy_bunuan_grants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_buy_id   uuid NOT NULL REFERENCES group_buys(id) ON DELETE CASCADE,
  -- Stored already-normalised (lowercased, trimmed) by the admin API so the
  -- eligibility check is a plain equality test.
  customer_email text NOT NULL,
  note           text,
  granted_at     timestamptz DEFAULT now(),
  UNIQUE (group_buy_id, customer_email)
);

CREATE INDEX IF NOT EXISTS gb_bunuan_grants_gb_idx ON group_buy_bunuan_grants(group_buy_id);

-- Grants decide who may buy, so unlike the tables above they are NOT writable by
-- the anon key — otherwise a customer could grant themselves access. Reads are
-- closed too; only the service-role admin API (which bypasses RLS) touches this.
ALTER TABLE group_buy_bunuan_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gb_bunuan_grants public read"  ON group_buy_bunuan_grants;
DROP POLICY IF EXISTS "gb_bunuan_grants open write"   ON group_buy_bunuan_grants;
-- (No policy = anon is denied everything. The eligibility function reads this
--  table as SECURITY DEFINER, which also bypasses RLS.)

-- ============================================================================
-- VERIFY (run after applying):
--   select table_name from information_schema.tables
--     where table_name in ('group_buy_product_kits','group_buy_bunuan_grants');
--   -- As the ANON key, this must return zero rows / be denied:
--   --   curl "$SUPABASE_URL/rest/v1/group_buy_bunuan_grants?select=id" \
--   --     -H "apikey: $ANON" -H "authorization: Bearer $ANON"
--
-- ROLLBACK:
--   drop table if exists group_buy_product_kits;
--   drop table if exists group_buy_bunuan_grants;
-- ============================================================================
