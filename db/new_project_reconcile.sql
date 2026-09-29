-- ============================================================================
-- NEW PROJECT RECONCILE — run ONCE on qjaldxpvjeyvaowwkmmw, BEFORE full_schema.sql
-- ============================================================================
--
-- WHY THIS EXISTS
-- The new project was loaded with migration-backups/.../migration-imagekit.sql,
-- which builds tables from REST metadata only. Compared with production
-- (db/full_schema.sql) its 20 tables have the right columns but:
--   * NO column defaults at all — not even id / created_at — so every insert
--     the app makes would fail with a NOT NULL violation;
--   * bare `numeric` instead of numeric(10,2) / (5,2) / (4,1);
--   * none of the columns added after the 2026-09-16 export: products
--     min_order_quantity + kit_size, group_buys.order_seq_counter,
--     orders.gb_order_seq + gb_order_code;
--   * RLS switched ON for every table with no policies.
-- full_schema.sql only creates what is MISSING, so it cannot fix columns on a
-- table that already exists. This file does; full_schema.sql then adds the rest
-- (3 tables, constraints, FKs, indexes, functions, view, triggers, policies,
-- grants, realtime, storage).
--
-- ORDER
--   1. db/new_project_reconcile.sql   (this file)
--   2. db/full_schema.sql
--
-- RLS POSTURE (decided 2026-09-29): same as production EXCEPT orders and
-- assessment_responses stay RLS-ON, so customer and health data are not
-- readable with the public anon key. Checkout writes through
-- place_group_buy_order (SECURITY DEFINER), the admin reads through the
-- service-role API, and assessments are insert-only via their policy — so
-- nothing legitimate needs anon table access to either. REQUIRES the
-- place_group_buy_order checkout code to be the deployed version before the
-- site points at this project (the legacy direct-insert fallback is refused).
--
-- One transaction; idempotent (safe to re-run).
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 1) Column types and defaults, table by table (matches production exactly)
-- ----------------------------------------------------------------------------
ALTER TABLE public.add_ons
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN price TYPE numeric(10,2),
  ALTER COLUMN price SET DEFAULT 0,
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.app_settings
  ALTER COLUMN id SET DEFAULT 1,
  ALTER COLUMN code_version SET DEFAULT 1,
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.assessment_responses
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN preferences SET DEFAULT '{}'::jsonb,
  ALTER COLUMN consent_agreed SET DEFAULT false,
  ALTER COLUMN agreed_at SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN status SET DEFAULT 'new'::text,
  ALTER COLUMN height_cm TYPE numeric(5,2),
  ALTER COLUMN weight_kg TYPE numeric(5,2),
  ALTER COLUMN waist_inches TYPE numeric(4,1),
  ALTER COLUMN hip_inches TYPE numeric(4,1),
  ALTER COLUMN weight_goal_kg TYPE numeric(4,1),
  ALTER COLUMN previous_surgeries SET DEFAULT false,
  ALTER COLUMN drug_allergies SET DEFAULT false;

ALTER TABLE public.categories
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN icon SET DEFAULT '☕'::text,
  ALTER COLUMN sort_order SET DEFAULT 0,
  ALTER COLUMN active SET DEFAULT true,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.group_buy_product_availability
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN is_available SET DEFAULT true,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.group_buys
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN status SET DEFAULT 'upcoming'::text,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ADD COLUMN IF NOT EXISTS order_seq_counter integer DEFAULT 0 NOT NULL;

ALTER TABLE public.hero_carousel_slides
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN sort_order SET DEFAULT 0,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.journey_sections
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN order_index SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.menu_items
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN base_price TYPE numeric(10,2),
  ALTER COLUMN popular SET DEFAULT false,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN available SET DEFAULT true,
  ALTER COLUMN discount_price TYPE numeric(10,2),
  ALTER COLUMN discount_active SET DEFAULT false;

ALTER TABLE public.orders
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN shipping_fee TYPE numeric(10,2),
  ALTER COLUMN shipping_fee SET DEFAULT 0,
  ALTER COLUMN total_price TYPE numeric(10,2),
  ALTER COLUMN payment_status SET DEFAULT 'pending'::text,
  ALTER COLUMN order_status SET DEFAULT 'new'::text,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN pricing_mode SET DEFAULT 'national'::text,
  ALTER COLUMN currency SET DEFAULT 'PHP'::text,
  ALTER COLUMN terms_accepted SET DEFAULT false,
  ADD COLUMN IF NOT EXISTS gb_order_seq integer;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gb_order_code text GENERATED ALWAYS AS (
    CASE
      WHEN group_buy_number IS NULL OR gb_order_seq IS NULL THEN NULL
      ELSE 'GB' || group_buy_number || '-' || lpad(gb_order_seq::text, 3, '0')
    END
  ) STORED;

ALTER TABLE public.payment_methods
  ALTER COLUMN active SET DEFAULT true,
  ALTER COLUMN sort_order SET DEFAULT 0,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.product_variations
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN quantity_mg TYPE numeric(10,2),
  ALTER COLUMN price TYPE numeric(10,2),
  ALTER COLUMN stock_quantity SET DEFAULT 0,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN national_price TYPE numeric(10,2),
  ALTER COLUMN international_price TYPE numeric(10,2);

ALTER TABLE public.products
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN base_price TYPE numeric(10,2),
  ALTER COLUMN discount_price TYPE numeric(10,2),
  ALTER COLUMN discount_active SET DEFAULT false,
  ALTER COLUMN purity_percentage TYPE numeric(5,2),
  ALTER COLUMN purity_percentage SET DEFAULT 99.00,
  ALTER COLUMN storage_conditions SET DEFAULT 'Store at -20°C'::text,
  ALTER COLUMN stock_quantity SET DEFAULT 0,
  ALTER COLUMN available SET DEFAULT true,
  ALTER COLUMN featured SET DEFAULT false,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN national_price TYPE numeric(10,2),
  ALTER COLUMN international_price TYPE numeric(10,2),
  ADD COLUMN IF NOT EXISTS min_order_quantity integer,
  ADD COLUMN IF NOT EXISTS kit_size integer;

ALTER TABLE public.recommendation_rules
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN target_experience SET DEFAULT 'All'::text,
  ALTER COLUMN priority SET DEFAULT 0,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.session
  ALTER COLUMN expire TYPE timestamp(6) without time zone;

ALTER TABLE public.shipping_locations
  ALTER COLUMN fee TYPE numeric(10,2),
  ALTER COLUMN fee SET DEFAULT 0,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN order_index SET DEFAULT 1,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN fee_usd TYPE numeric(10,2),
  ALTER COLUMN fee_usd SET DEFAULT 0;

ALTER TABLE public.site_settings
  ALTER COLUMN type SET DEFAULT 'text'::text,
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.smart_guide_files
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN sort_order SET DEFAULT 0,
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.smart_guides
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN sort_order SET DEFAULT 0,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.variations
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN price TYPE numeric(10,2),
  ALTER COLUMN price SET DEFAULT 0,
  ALTER COLUMN created_at SET DEFAULT now();

-- ----------------------------------------------------------------------------
-- 2) Number the imported orders per round (same rule as migration
--    20260922000004: oldest first within each round, id breaks ties), and
--    start each round's counter above what it has issued.
--    NOTE: at cutover, rows topped up from production must carry production's
--    gb_order_seq (copy the column, don't renumber), so receipts already sent
--    to customers keep their numbers.
-- ----------------------------------------------------------------------------
WITH base AS (
  SELECT group_buy_id, COALESCE(MAX(gb_order_seq), 0) AS max_seq
  FROM public.orders WHERE group_buy_id IS NOT NULL GROUP BY group_buy_id
), numbered AS (
  SELECT o.id,
         b.max_seq + row_number() OVER (PARTITION BY o.group_buy_id ORDER BY o.created_at, o.id) AS n
  FROM public.orders o JOIN base b ON b.group_buy_id = o.group_buy_id
  WHERE o.group_buy_id IS NOT NULL AND o.gb_order_seq IS NULL
)
UPDATE public.orders o SET gb_order_seq = numbered.n FROM numbered WHERE o.id = numbered.id;

UPDATE public.group_buys g
   SET order_seq_counter = GREATEST(g.order_seq_counter, s.max_seq)
  FROM (SELECT group_buy_id, MAX(gb_order_seq) AS max_seq FROM public.orders
         WHERE group_buy_id IS NOT NULL AND gb_order_seq IS NOT NULL GROUP BY group_buy_id) s
 WHERE s.group_buy_id = g.id AND g.order_seq_counter < s.max_seq;

-- ----------------------------------------------------------------------------
-- 3) RLS posture: production's, minus the two data leaks
-- ----------------------------------------------------------------------------
-- The import switched RLS on everywhere with no policies, which would hide the
-- catalogue from the storefront. Production runs these RLS-OFF:
ALTER TABLE public.add_ons              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_sections     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variations   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.variations           DISABLE ROW LEVEL SECURITY;
-- Deliberately stays ON (production has it OFF — that is the leak):
ALTER TABLE public.orders               ENABLE ROW LEVEL SECURITY;  -- no policies: RPC + service role only
ALTER TABLE public.assessment_responses ENABLE ROW LEVEL SECURITY;  -- insert-only policy comes from full_schema.sql

COMMIT;
