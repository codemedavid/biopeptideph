-- MOQ + Kit Size, step 1 of 4: additive schema only.
--
-- Adds the two numbers the whole feature is built on:
--   products.min_order_quantity — the smallest quantity ONE customer may order
--                                 of this product during normal ordering.
--   products.kit_size           — how many units make one complete kit. Kit size
--                                 is about the ROUND's combined total, not about
--                                 any single customer. NULL = this product is not
--                                 kit-tracked and never appears in Bunuan.
--
-- Also extends the group_buys lifecycle with the Bunuan phases.
--
-- Nothing here changes behaviour: every column is nullable, every existing row
-- stays valid, and no code reads these yet. Safe to apply on a live store.
-- Idempotent: safe to run more than once.

-- --------------------------------------------------------------------------
-- 1) Per-product MOQ and kit size
-- --------------------------------------------------------------------------
-- NULL or 1 means "no minimum" — the storefront treats both the same, so an
-- admin who clears the field gets the obvious result rather than a 0-quantity trap.
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_order_quantity integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS kit_size           integer;

-- Guard against nonsense values reaching the enforcement layer, where a 0 or a
-- negative would make the modulo arithmetic in gb_kit_state meaningless.
DO $$
BEGIN
  ALTER TABLE products ADD CONSTRAINT products_min_order_quantity_positive
    CHECK (min_order_quantity IS NULL OR min_order_quantity >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE products ADD CONSTRAINT products_kit_size_positive
    CHECK (kit_size IS NULL OR kit_size >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Bunuan only ever looks at kit-tracked products, so index just those rows.
CREATE INDEX IF NOT EXISTS products_kit_size_idx ON products(kit_size) WHERE kit_size IS NOT NULL;

-- --------------------------------------------------------------------------
-- 2) MOQ presets
-- --------------------------------------------------------------------------
-- These are QUICK-FILL BUTTONS for the admin product form, not a foreign key.
-- Picking "MOQ 3" copies the value 3 into products.min_order_quantity. That is
-- deliberate: if products pointed at a preset row instead, editing the "MOQ 3"
-- preset would silently re-price the minimum on every product using it, possibly
-- mid-round. Copying keeps each product's rule stable and auditable.
CREATE TABLE IF NOT EXISTS moq_presets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label      text    NOT NULL,
  value      integer NOT NULL CHECK (value >= 1),
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moq_presets_sort_idx ON moq_presets(sort_order);

-- This project operates the admin via the anon key (the dashboard is password
-- gated client-side), so reads AND writes must be permitted for anon — matching
-- group_buys and group_buy_product_availability.
ALTER TABLE moq_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moq_presets public read" ON moq_presets;
CREATE POLICY "moq_presets public read" ON moq_presets FOR SELECT USING (true);
DROP POLICY IF EXISTS "moq_presets open write" ON moq_presets;
CREATE POLICY "moq_presets open write" ON moq_presets FOR ALL USING (true) WITH CHECK (true);

-- Seed the common rules. Keyed on label so re-running never duplicates them,
-- and so an admin who edits a preset's value keeps that edit across re-runs.
INSERT INTO moq_presets (label, value, sort_order)
SELECT v.label, v.value, v.sort_order
FROM (VALUES
  ('No MOQ',  1, 0),
  ('MOQ 2',   2, 1),
  ('MOQ 3',   3, 2),
  ('MOQ 5',   5, 3),
  ('MOQ 10', 10, 4)
) AS v(label, value, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM moq_presets p WHERE p.label = v.label);

-- --------------------------------------------------------------------------
-- 3) Group Buy lifecycle: add the Bunuan phases
-- --------------------------------------------------------------------------
-- The round's phase drives which rules apply:
--   upcoming      Draft — not visible to customers
--   active        Normal Ordering Open  — MOQ enforced, kits accumulating
--   closed        Normal Ordering Closed — no new orders; kit shortfalls now known
--   bunuan_open   Bunuan Open  — MOQ suspended, only the exact shortfall sellable,
--                                and only to customers already in THIS round
--   bunuan_closed Bunuan Closed — no new orders
--   completed     Round finished and handed to the supplier
--
-- We EXTEND the existing CHECK rather than replacing the column, so every row
-- written under the old three-value constraint remains valid and no data moves.
DO $$
DECLARE c record;
BEGIN
  -- The original constraint was declared inline, so its name is whatever
  -- Postgres generated. Find any CHECK on this table mentioning `status`.
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class     rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'group_buys'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.group_buys DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE group_buys ADD CONSTRAINT group_buys_status_check
  CHECK (status IN ('upcoming', 'active', 'closed', 'bunuan_open', 'bunuan_closed', 'completed'));

-- ============================================================================
-- VERIFY (run after applying):
--   select column_name, data_type, is_nullable from information_schema.columns
--     where table_name = 'products' and column_name in ('min_order_quantity','kit_size');
--   select label, value from moq_presets order by sort_order;         -- 5 rows
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'group_buys_status_check';                      -- 6 values
--   select status, count(*) from group_buys group by status;          -- unchanged
--
-- ROLLBACK:
--   alter table group_buys drop constraint group_buys_status_check;
--   alter table group_buys add constraint group_buys_status_check
--     check (status in ('upcoming','active','closed'));   -- requires no round
--                                                         -- is in a Bunuan phase
--   alter table products drop column if exists min_order_quantity;
--   alter table products drop column if exists kit_size;
--   drop table if exists moq_presets;
-- ============================================================================
