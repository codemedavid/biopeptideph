-- ============================================================================
-- FULL SCHEMA BASELINE — rebuilds the entire database structure in one file
-- ============================================================================
-- Source    Supabase project tpzkdhcowlvpjfvjiejx (live), PostgreSQL 17.6
-- Captured  2026-09-29 from live (migrations 20260922000000..000004), then
--           updated for 20260930000000_kits_per_variation (kits & MOQ per variation).
-- Method    Generated from the live catalog (pg_get_functiondef,
--           pg_get_constraintdef, pg_get_indexdef, pg_get_viewdef,
--           pg_get_triggerdef, pg_policies, ACLs) — i.e. what is REALLY in
--           production, including objects no repo migration creates
--           (validate_and_price_order, session, app_settings, ...).
--
-- CONTAINS  extensions · 23 tables · 39 PK/unique/check · 15 FKs ·
--           30 indexes · 16 functions · 1 view · 6 triggers · comments ·
--           RLS switches (11 tables) · 36 public policies · grants ·
--           realtime publication (5 tables) · 2 storage buckets +
--           10 storage policies · moq_presets seed · a self-check that
--           aborts the whole transaction if any count is off.
--
-- DOES NOT CONTAIN  row data (orders, products, settings, the app_settings
--           access-code row, ...), auth users, storage files, secrets.
--           Load data separately (docs/database-migration.md) as data-only
--           INSERTs — that script's migration.sql creates its own tables and
--           will error if these already exist.
--
-- RUN       On a Supabase project (needs roles anon/authenticated/service_role
--           and the storage schema). SQL editor, or:
--             psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/full_schema.sql
--           One transaction: all or nothing. Idempotent: every object is
--           created only if missing, so it can fill gaps in a partly-built DB.
--
-- SECURITY POSTURE IS COPIED AS-IS, NOT FIXED:
--   ! orders has RLS DISABLED and anon has full privileges — anyone with the
--     anon key can read every order (names, emails, phones, addresses).
--     Fix = db/orders_rls_moq.sql, only after the RPC checkout is deployed.
--   ! RLS is also off on add_ons, assessment_responses (health data!),
--     categories, journey_sections, menu_items, payment_methods,
--     product_variations, products, recommendation_rules, site_settings,
--     variations — their policies below are inert until RLS is enabled.
--   ! products / group_buys config is anon-writable (db/moq_config_lockdown.sql).
-- ============================================================================

BEGIN;

SET LOCAL check_function_bodies = off;   -- creation order never matters
SET LOCAL search_path = public, extensions;
SET LOCAL client_min_messages = warning;

-- ----------------------------------------------------------------------------
-- 0) Extensions
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Adds a constraint only if one of that name is not already on the table.
-- Lives in pg_temp, so it vanishes with the session.
CREATE OR REPLACE FUNCTION pg_temp.add_constraint(p_table text, p_name text, p_def text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = p_name AND conrelid = format('public.%I', p_table)::regclass
  ) THEN
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', p_table, p_name, p_def);
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1) Tables
-- ----------------------------------------------------------------------------
-- Legacy menu template tables: add_ons, menu_items, variations.

CREATE TABLE IF NOT EXISTS public.add_ons (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  menu_item_id uuid,
  name text NOT NULL,
  price numeric(10,2) DEFAULT 0 NOT NULL,
  category text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Site access gate: exactly one row (id = 1) with the hashed access code.
CREATE TABLE IF NOT EXISTS public.app_settings (
  id integer DEFAULT 1 NOT NULL,
  access_code_hash text NOT NULL,
  code_version integer DEFAULT 1 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Peptide assessment submissions (health data).
CREATE TABLE IF NOT EXISTS public.assessment_responses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  age_range text NOT NULL,
  location text NOT NULL,
  goals text[] NOT NULL,
  experience_level text NOT NULL,
  preferences jsonb DEFAULT '{}'::jsonb,
  consent_agreed boolean DEFAULT false,
  agreed_at timestamp with time zone DEFAULT now(),
  recommendation_generated jsonb,
  created_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'new'::text,
  date_of_birth date,
  sex_assigned text,
  height_cm numeric(5,2),
  weight_kg numeric(5,2),
  waist_inches numeric(4,1),
  hip_inches numeric(4,1),
  weight_goal_kg numeric(4,1),
  emotional_motivators text[],
  medical_conditions text[],
  family_history_conditions text[],
  current_medications text,
  previous_surgeries boolean DEFAULT false,
  drug_allergies boolean DEFAULT false,
  smoking_status text,
  pregnancy_status text[],
  peptide_experience_first_time boolean,
  current_prescription_glp1 boolean,
  phone text
);

-- id is TEXT (slugs); the uuid default only applies when none is supplied.
CREATE TABLE IF NOT EXISTS public.categories (
  id text DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  icon text DEFAULT '☕'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Admin whitelist: lets one customer into Bunuan for one round.
CREATE TABLE IF NOT EXISTS public.group_buy_bunuan_grants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_buy_id uuid NOT NULL,
  customer_email text NOT NULL,
  note text,
  granted_at timestamp with time zone DEFAULT now()
);

-- Per-round on/off switch for a product.
CREATE TABLE IF NOT EXISTS public.group_buy_product_availability (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_buy_id uuid NOT NULL,
  product_id uuid NOT NULL,
  is_available boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Per-round MOQ / kit-size overrides and Bunuan switches.
CREATE TABLE IF NOT EXISTS public.group_buy_product_kits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_buy_id uuid NOT NULL,
  product_id uuid NOT NULL,
  moq_override integer,
  kit_size_override integer,
  bunuan_enabled boolean DEFAULT true NOT NULL,
  manually_completed boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  variation_id uuid
);

-- Group Buy rounds. order_seq_counter allocates per-round order numbers.
CREATE TABLE IF NOT EXISTS public.group_buys (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  gb_number text NOT NULL,
  title text NOT NULL,
  description text,
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  status text DEFAULT 'upcoming'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  order_seq_counter integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.hero_carousel_slides (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  image_url text NOT NULL,
  title text,
  subtitle text,
  button_text text,
  button_link text,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journey_sections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  section_identifier text NOT NULL,
  title text,
  subtitle text,
  content text,
  image_url text,
  order_index integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  base_price numeric(10,2) NOT NULL,
  category text NOT NULL,
  popular boolean DEFAULT false,
  image_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  available boolean DEFAULT true,
  discount_price numeric(10,2),
  discount_start_date timestamp with time zone,
  discount_end_date timestamp with time zone,
  discount_active boolean DEFAULT false
);

-- Quick-fill MOQ buttons for the admin form (value is copied, not referenced).
CREATE TABLE IF NOT EXISTS public.moq_presets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  label text NOT NULL,
  value integer NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- order_items = server-priced lines (JSONB). gb_order_code (GB14-007) is derived.
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  shipping_address text NOT NULL,
  shipping_barangay text NOT NULL,
  shipping_city text NOT NULL,
  shipping_state text NOT NULL,
  shipping_zip_code text NOT NULL,
  shipping_country text,
  shipping_location text,
  shipping_fee numeric(10,2) DEFAULT 0,
  order_items jsonb NOT NULL,
  total_price numeric(10,2) NOT NULL,
  payment_method_id text,
  payment_method_name text,
  payment_proof_url text,
  payment_status text DEFAULT 'pending'::text,
  contact_method text,
  order_status text DEFAULT 'new'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pricing_mode text DEFAULT 'national'::text,
  currency text DEFAULT 'PHP'::text,
  terms_accepted boolean DEFAULT false,
  terms_accepted_at timestamp with time zone,
  group_buy_id uuid,
  group_buy_number text,
  gb_order_seq integer,
  gb_order_code text GENERATED ALWAYS AS (
CASE
    WHEN ((group_buy_number IS NULL) OR (gb_order_seq IS NULL)) THEN NULL::text
    ELSE ((('GB'::text || group_buy_number) || '-'::text) || lpad((gb_order_seq)::text, 3, '0'::text))
END) STORED
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id text NOT NULL,
  name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  qr_code_url text NOT NULL,
  active boolean DEFAULT true,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_variations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  name text NOT NULL,
  quantity_mg numeric(10,2) NOT NULL,
  price numeric(10,2) NOT NULL,
  stock_quantity integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  national_price numeric(10,2),
  international_price numeric(10,2),
  kit_size integer,
  min_order_quantity integer
);

-- min_order_quantity = per-customer floor; kit_size = per-round total per kit
-- (NULL = not kit-tracked, never in Bunuan).
CREATE TABLE IF NOT EXISTS public.products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  base_price numeric(10,2) NOT NULL,
  discount_price numeric(10,2),
  discount_start_date timestamp with time zone,
  discount_end_date timestamp with time zone,
  discount_active boolean DEFAULT false,
  purity_percentage numeric(5,2) DEFAULT 99.00,
  molecular_weight text,
  cas_number text,
  sequence text,
  storage_conditions text DEFAULT 'Store at -20°C'::text,
  stock_quantity integer DEFAULT 0,
  available boolean DEFAULT true,
  featured boolean DEFAULT false,
  image_url text,
  safety_sheet_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  national_price numeric(10,2),
  international_price numeric(10,2),
  inclusions text[],
  group_buy_id uuid,
  min_order_quantity integer,
  kit_size integer
);

CREATE TABLE IF NOT EXISTS public.recommendation_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  rule_name text NOT NULL,
  target_goal text NOT NULL,
  target_experience text DEFAULT 'All'::text,
  primary_product_id uuid,
  secondary_product_ids uuid[],
  educational_note text,
  priority integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Express session store (connect-pg-simple) for the Vercel API.
CREATE TABLE IF NOT EXISTS public.session (
  sid character varying NOT NULL,
  sess json NOT NULL,
  expire timestamp(6) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.shipping_locations (
  id text NOT NULL,
  name text NOT NULL,
  fee numeric(10,2) DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  order_index integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  fee_usd numeric(10,2) DEFAULT 0 NOT NULL
);

-- Key/value site config (global discount, exchange rate, copy, ...).
CREATE TABLE IF NOT EXISTS public.site_settings (
  id text NOT NULL,
  value text NOT NULL,
  type text DEFAULT 'text'::text NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.smart_guide_files (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  guide_id uuid,
  display_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.smart_guides (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.variations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  menu_item_id uuid,
  name text NOT NULL,
  price numeric(10,2) DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Columns added after the first baseline (per-variation kits). ADD COLUMN IF
-- NOT EXISTS so a database built from an older copy of this file catches up.
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS kit_size integer;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS min_order_quantity integer;
ALTER TABLE public.group_buy_product_kits ADD COLUMN IF NOT EXISTS variation_id uuid;

-- ----------------------------------------------------------------------------
-- 2) Primary keys, unique and check constraints
-- ----------------------------------------------------------------------------
SELECT pg_temp.add_constraint('add_ons', 'add_ons_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('app_settings', 'app_settings_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('app_settings', 'app_settings_single_row', $c$CHECK ((id = 1))$c$);
SELECT pg_temp.add_constraint('assessment_responses', 'assessment_responses_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('assessment_responses', 'assessment_responses_sex_assigned_check', $c$CHECK ((sex_assigned = ANY (ARRAY['male'::text, 'female'::text, 'other'::text])))$c$);
SELECT pg_temp.add_constraint('assessment_responses', 'assessment_responses_smoking_status_check', $c$CHECK ((smoking_status = ANY (ARRAY['smoker'::text, 'non_smoker'::text, 'other'::text])))$c$);
SELECT pg_temp.add_constraint('categories', 'categories_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('group_buy_bunuan_grants', 'group_buy_bunuan_grants_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('group_buy_bunuan_grants', 'group_buy_bunuan_grants_group_buy_id_customer_email_key', $c$UNIQUE (group_buy_id, customer_email)$c$);
SELECT pg_temp.add_constraint('group_buy_product_availability', 'group_buy_product_availability_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('group_buy_product_availability', 'group_buy_product_availability_group_buy_id_product_id_key', $c$UNIQUE (group_buy_id, product_id)$c$);
SELECT pg_temp.add_constraint('group_buy_product_kits', 'group_buy_product_kits_pkey', $c$PRIMARY KEY (id)$c$);
-- One override row per (round, product, variation); NULLS NOT DISTINCT makes the
-- product-level row (variation_id NULL) unique too, and lets PostgREST upsert it.
ALTER TABLE public.group_buy_product_kits DROP CONSTRAINT IF EXISTS group_buy_product_kits_group_buy_id_product_id_key;
SELECT pg_temp.add_constraint('group_buy_product_kits', 'group_buy_product_kits_scope_key', $c$UNIQUE NULLS NOT DISTINCT (group_buy_id, product_id, variation_id)$c$);
SELECT pg_temp.add_constraint('group_buy_product_kits', 'group_buy_product_kits_kit_size_override_check', $c$CHECK (((kit_size_override IS NULL) OR (kit_size_override >= 1)))$c$);
SELECT pg_temp.add_constraint('group_buy_product_kits', 'group_buy_product_kits_moq_override_check', $c$CHECK (((moq_override IS NULL) OR (moq_override >= 1)))$c$);
SELECT pg_temp.add_constraint('group_buys', 'group_buys_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('group_buys', 'group_buys_status_check', $c$CHECK ((status = ANY (ARRAY['upcoming'::text, 'active'::text, 'closed'::text, 'bunuan_open'::text, 'bunuan_closed'::text, 'completed'::text])))$c$);
SELECT pg_temp.add_constraint('hero_carousel_slides', 'hero_carousel_slides_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('journey_sections', 'journey_sections_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('journey_sections', 'journey_sections_section_identifier_key', $c$UNIQUE (section_identifier)$c$);
SELECT pg_temp.add_constraint('menu_items', 'menu_items_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('moq_presets', 'moq_presets_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('moq_presets', 'moq_presets_value_check', $c$CHECK ((value >= 1))$c$);
SELECT pg_temp.add_constraint('orders', 'orders_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('payment_methods', 'payment_methods_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('product_variations', 'product_variations_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('product_variations', 'product_variations_kit_size_positive', $c$CHECK (((kit_size IS NULL) OR (kit_size >= 1)))$c$);
SELECT pg_temp.add_constraint('product_variations', 'product_variations_min_order_quantity_positive', $c$CHECK (((min_order_quantity IS NULL) OR (min_order_quantity >= 1)))$c$);
SELECT pg_temp.add_constraint('products', 'products_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('products', 'products_kit_size_positive', $c$CHECK (((kit_size IS NULL) OR (kit_size >= 1)))$c$);
SELECT pg_temp.add_constraint('products', 'products_min_order_quantity_positive', $c$CHECK (((min_order_quantity IS NULL) OR (min_order_quantity >= 1)))$c$);
SELECT pg_temp.add_constraint('recommendation_rules', 'recommendation_rules_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('session', 'session_pkey', $c$PRIMARY KEY (sid)$c$);
SELECT pg_temp.add_constraint('shipping_locations', 'shipping_locations_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('site_settings', 'site_settings_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('smart_guide_files', 'smart_guide_files_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('smart_guides', 'smart_guides_pkey', $c$PRIMARY KEY (id)$c$);
SELECT pg_temp.add_constraint('variations', 'variations_pkey', $c$PRIMARY KEY (id)$c$);

-- ----------------------------------------------------------------------------
-- 3) Foreign keys
-- ----------------------------------------------------------------------------
SELECT pg_temp.add_constraint('add_ons', 'add_ons_menu_item_id_fkey', $c$FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE$c$);
SELECT pg_temp.add_constraint('group_buy_bunuan_grants', 'group_buy_bunuan_grants_group_buy_id_fkey', $c$FOREIGN KEY (group_buy_id) REFERENCES public.group_buys(id) ON DELETE CASCADE$c$);
SELECT pg_temp.add_constraint('group_buy_product_availability', 'group_buy_product_availability_group_buy_id_fkey', $c$FOREIGN KEY (group_buy_id) REFERENCES public.group_buys(id) ON DELETE CASCADE$c$);
SELECT pg_temp.add_constraint('group_buy_product_availability', 'group_buy_product_availability_product_id_fkey', $c$FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE$c$);
SELECT pg_temp.add_constraint('group_buy_product_kits', 'group_buy_product_kits_group_buy_id_fkey', $c$FOREIGN KEY (group_buy_id) REFERENCES public.group_buys(id) ON DELETE CASCADE$c$);
SELECT pg_temp.add_constraint('group_buy_product_kits', 'group_buy_product_kits_product_id_fkey', $c$FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE$c$);
SELECT pg_temp.add_constraint('group_buy_product_kits', 'group_buy_product_kits_variation_id_fkey', $c$FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE CASCADE$c$);
SELECT pg_temp.add_constraint('menu_items', 'menu_items_category_fkey', $c$FOREIGN KEY (category) REFERENCES public.categories(id)$c$);
SELECT pg_temp.add_constraint('orders', 'orders_group_buy_id_fkey', $c$FOREIGN KEY (group_buy_id) REFERENCES public.group_buys(id) ON DELETE SET NULL$c$);
SELECT pg_temp.add_constraint('product_variations', 'product_variations_product_id_fkey', $c$FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE$c$);
SELECT pg_temp.add_constraint('products', 'products_category_fkey', $c$FOREIGN KEY (category) REFERENCES public.categories(id)$c$);
SELECT pg_temp.add_constraint('products', 'products_group_buy_id_fkey', $c$FOREIGN KEY (group_buy_id) REFERENCES public.group_buys(id) ON DELETE SET NULL$c$);
SELECT pg_temp.add_constraint('recommendation_rules', 'recommendation_rules_primary_product_id_fkey', $c$FOREIGN KEY (primary_product_id) REFERENCES public.products(id)$c$);
SELECT pg_temp.add_constraint('smart_guide_files', 'smart_guide_files_guide_id_fkey', $c$FOREIGN KEY (guide_id) REFERENCES public.smart_guides(id) ON DELETE CASCADE$c$);
SELECT pg_temp.add_constraint('variations', 'variations_menu_item_id_fkey', $c$FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE$c$);

-- ----------------------------------------------------------------------------
-- 4) Secondary indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_assessment_dob ON public.assessment_responses USING btree (date_of_birth);
CREATE INDEX IF NOT EXISTS idx_assessment_email ON public.assessment_responses USING btree (email);
CREATE INDEX IF NOT EXISTS idx_assessment_medical_conditions ON public.assessment_responses USING gin (medical_conditions);
CREATE INDEX IF NOT EXISTS idx_assessment_weight ON public.assessment_responses USING btree (weight_kg);
CREATE INDEX IF NOT EXISTS gb_bunuan_grants_gb_idx ON public.group_buy_bunuan_grants USING btree (group_buy_id);
CREATE INDEX IF NOT EXISTS gb_prod_avail_gb_idx ON public.group_buy_product_availability USING btree (group_buy_id);
CREATE INDEX IF NOT EXISTS gb_prod_avail_prod_idx ON public.group_buy_product_availability USING btree (product_id);
CREATE INDEX IF NOT EXISTS gb_prod_kits_gb_idx ON public.group_buy_product_kits USING btree (group_buy_id);
CREATE INDEX IF NOT EXISTS gb_prod_kits_prod_idx ON public.group_buy_product_kits USING btree (product_id);
CREATE INDEX IF NOT EXISTS gb_prod_kits_var_idx ON public.group_buy_product_kits USING btree (variation_id);
CREATE INDEX IF NOT EXISTS group_buys_gb_number_idx ON public.group_buys USING btree (gb_number);
CREATE INDEX IF NOT EXISTS group_buys_status_idx ON public.group_buys USING btree (status);
CREATE INDEX IF NOT EXISTS hero_carousel_active_idx ON public.hero_carousel_slides USING btree (is_active);
CREATE INDEX IF NOT EXISTS hero_carousel_sort_idx ON public.hero_carousel_slides USING btree (sort_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_discount_active ON public.menu_items USING btree (discount_active);
CREATE INDEX IF NOT EXISTS idx_menu_items_discount_dates ON public.menu_items USING btree (discount_start_date, discount_end_date);
CREATE INDEX IF NOT EXISTS moq_presets_sort_idx ON public.moq_presets USING btree (sort_order);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders USING btree (customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders USING btree (customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON public.orders USING btree (order_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders USING btree (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_pricing_mode ON public.orders USING btree (pricing_mode);
CREATE INDEX IF NOT EXISTS orders_group_buy_id_idx ON public.orders USING btree (group_buy_id);
-- Backstop for per-round order numbers: an allocator bug becomes a refused
-- write instead of two customers holding the same GB14-007.
CREATE UNIQUE INDEX IF NOT EXISTS orders_group_buy_seq_key ON public.orders USING btree (group_buy_id, gb_order_seq) WHERE ((group_buy_id IS NOT NULL) AND (gb_order_seq IS NOT NULL));
CREATE INDEX IF NOT EXISTS products_group_buy_id_idx ON public.products USING btree (group_buy_id);
CREATE INDEX IF NOT EXISTS products_kit_size_idx ON public.products USING btree (kit_size) WHERE (kit_size IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_rules_goal ON public.recommendation_rules USING btree (target_goal);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON public.session USING btree (expire);
CREATE INDEX IF NOT EXISTS shipping_locations_order_idx ON public.shipping_locations USING btree (order_index);

-- ----------------------------------------------------------------------------
-- 5) Functions (bodies copied byte-for-byte from production)
-- ----------------------------------------------------------------------------

-- Kits are counted per (product, VARIATION). Remove the older per-product
-- signatures first so re-running on a database built from an older copy of
-- this file cannot leave two overloads behind. The view depends on them and is
-- recreated in section 6.
DROP VIEW IF EXISTS public.group_buy_kit_status;
DROP FUNCTION IF EXISTS public.gb_kit_state(uuid, uuid);
DROP FUNCTION IF EXISTS public.gb_effective_kit_size(uuid, uuid);
DROP FUNCTION IF EXISTS public.gb_effective_moq(uuid, uuid);
DROP FUNCTION IF EXISTS public.gb_eligible_quantity(uuid, uuid);
DO $$
BEGIN
  -- gb_eligible_quantities keeps its argument list but gained a column, which
  -- CREATE OR REPLACE cannot do — drop only the old two-column shape.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'gb_eligible_quantities'
       AND pg_get_function_result(p.oid) NOT LIKE '%variation_id%'
  ) THEN
    DROP FUNCTION public.gb_eligible_quantities(uuid);
  END IF;
END $$;

-- 5a) Generic helpers --------------------------------------------------------

-- Stamps updated_at on UPDATE (five triggers below).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_discount_active(discount_active boolean, discount_start_date timestamp with time zone, discount_end_date timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- If discount is not active, return false
  IF NOT discount_active THEN
    RETURN false;
  END IF;
  
  -- If no dates are set, return the discount_active value
  IF discount_start_date IS NULL AND discount_end_date IS NULL THEN
    RETURN discount_active;
  END IF;
  
  -- Check if current time is within the discount period
  RETURN (
    (discount_start_date IS NULL OR now() >= discount_start_date) AND
    (discount_end_date IS NULL OR now() <= discount_end_date)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_effective_price(base_price numeric, discount_price numeric, discount_active boolean, discount_start_date timestamp with time zone, discount_end_date timestamp with time zone)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- If discount is active and within date range, return discount price
  IF is_discount_active(discount_active, discount_start_date, discount_end_date) AND discount_price IS NOT NULL THEN
    RETURN discount_price;
  END IF;
  
  -- Otherwise return base price
  RETURN base_price;
END;
$function$;

-- 5b) Identity normalisation (Bunuan compares typed name/email/phone) --------

CREATE OR REPLACE FUNCTION public.gb_norm_email(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT lower(btrim(COALESCE(p, '')));
$function$;

-- "0927 382 3893", "+639273823893", "639273823893" -> 9273823893
CREATE OR REPLACE FUNCTION public.gb_norm_phone(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
           WHEN length(d) >= 10 THEN right(d, 10)
           ELSE d
         END
  FROM (SELECT regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g') AS d) s;
$function$;

-- Lowercase, strip accents, drop punctuation, collapse whitespace.
CREATE OR REPLACE FUNCTION public.gb_norm_name(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT btrim(regexp_replace(
           regexp_replace(
             translate(
               lower(COALESCE(p, '')),
               'áàâäãåéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ',
               'aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC'
             ),
             '[^a-z0-9 ]', '', 'g'
           ),
           '\s+', ' ', 'g'
         ));
$function$;

-- 5c) Kit arithmetic — single source of truth for MOQ / kits / Bunuan -------

-- Unpaid 'pending' orders DO count (a Group Buy is a preorder).
CREATE OR REPLACE FUNCTION public.gb_order_counts_toward_kit(p_order_status text, p_payment_status text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT lower(COALESCE(p_order_status, ''))   NOT IN ('cancelled', 'canceled', 'refunded', 'expired')
     AND lower(COALESCE(p_payment_status, '')) NOT IN ('failed', 'refunded');
$function$;

-- Units ordered per product in a round, summed across variations.
CREATE OR REPLACE FUNCTION public.gb_eligible_quantities(p_group_buy_id uuid)
RETURNS TABLE (product_id uuid, variation_id uuid, quantity integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (li->>'product_id')::uuid AS product_id,
         CASE WHEN (li->>'variation_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              THEN (li->>'variation_id')::uuid END AS variation_id,
         SUM((li->>'quantity')::numeric)::integer AS quantity
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(o.order_items) = 'array' THEN o.order_items ELSE '[]'::jsonb END
  ) AS li
  WHERE o.group_buy_id = p_group_buy_id
    AND gb_order_counts_toward_kit(o.order_status, o.payment_status)
    AND (li->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND (li->>'quantity')   ~ '^[0-9]+(\.[0-9]+)?$'
  GROUP BY 1, 2;
$$;

CREATE OR REPLACE FUNCTION public.gb_eligible_quantity(p_group_buy_id uuid, p_product_id uuid, p_variation_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT q.quantity FROM gb_eligible_quantities(p_group_buy_id) q
      WHERE q.product_id = p_product_id AND q.variation_id IS NOT DISTINCT FROM p_variation_id),
    0
  );
$$;

-- Per-customer minimum: round override ?? product default ?? 1.
CREATE OR REPLACE FUNCTION public.gb_effective_moq(p_group_buy_id uuid, p_product_id uuid, p_variation_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(1, COALESCE(
    (SELECT k.moq_override FROM group_buy_product_kits k
      WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id
        AND k.variation_id IS NOT DISTINCT FROM p_variation_id),
    (SELECT k.moq_override FROM group_buy_product_kits k
      WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id AND k.variation_id IS NULL),
    (SELECT v.min_order_quantity FROM product_variations v WHERE v.id = p_variation_id),
    (SELECT p.min_order_quantity FROM products p WHERE p.id = p_product_id),
    1
  ));
$$;

-- Kit size: round override ?? product default. NULL = not kit-tracked.
CREATE OR REPLACE FUNCTION public.gb_effective_kit_size(p_group_buy_id uuid, p_product_id uuid, p_variation_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT k.kit_size_override FROM group_buy_product_kits k
      WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id
        AND k.variation_id IS NOT DISTINCT FROM p_variation_id),
    (SELECT k.kit_size_override FROM group_buy_product_kits k
      WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id AND k.variation_id IS NULL),
    (SELECT v.kit_size FROM product_variations v WHERE v.id = p_variation_id),
    (SELECT p.kit_size FROM products p WHERE p.id = p_product_id)
  );
$$;

-- complete_kits = qty / size; in_progress = qty % size;
-- bunuan_needed = size - in_progress (0 when the last kit closed exactly).
CREATE OR REPLACE FUNCTION public.gb_kit_state(p_group_buy_id uuid, p_product_id uuid, p_variation_id uuid DEFAULT NULL)
RETURNS TABLE (
  kit_size         integer,
  eligible_qty     integer,
  complete_kits    integer,
  in_progress      integer,
  bunuan_needed    integer,
  bunuan_available integer,
  is_complete      boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cfg AS (
    SELECT gb_effective_kit_size(p_group_buy_id, p_product_id, p_variation_id) AS ks,
           gb_eligible_quantity (p_group_buy_id, p_product_id, p_variation_id) AS qty,
           COALESCE(
             (SELECT k.bunuan_enabled FROM group_buy_product_kits k
               WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id
                 AND k.variation_id IS NOT DISTINCT FROM p_variation_id),
             (SELECT k.bunuan_enabled FROM group_buy_product_kits k
               WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id AND k.variation_id IS NULL),
             true) AS enabled,
           COALESCE(
             (SELECT k.manually_completed FROM group_buy_product_kits k
               WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id
                 AND k.variation_id IS NOT DISTINCT FROM p_variation_id),
             (SELECT k.manually_completed FROM group_buy_product_kits k
               WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id AND k.variation_id IS NULL),
             false) AS forced_complete
  ),
  calc AS (
    SELECT ks, qty, enabled, forced_complete,
           CASE WHEN ks IS NULL THEN 0 ELSE qty / ks END AS complete_kits,
           CASE WHEN ks IS NULL THEN 0 ELSE qty % ks END AS in_progress
    FROM cfg
  )
  SELECT
    ks,
    qty,
    complete_kits,
    in_progress,
    CASE WHEN ks IS NULL OR in_progress = 0 THEN 0 ELSE ks - in_progress END AS bunuan_needed,
    CASE WHEN ks IS NULL OR in_progress = 0 OR forced_complete OR NOT enabled
         THEN 0 ELSE ks - in_progress END                                    AS bunuan_available,
    (ks IS NULL OR in_progress = 0 OR forced_complete)                       AS is_complete
  FROM calc;
$$;

-- Bunuan eligibility: name AND email AND phone match a counting order in THIS
-- round, or an admin grant exists. NOT callable by anon (see grants) — it
-- would be a "did this person order?" oracle.
CREATE OR REPLACE FUNCTION public.gb_is_bunuan_eligible_customer(p_group_buy_id uuid, p_name text, p_email text, p_phone text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    gb_norm_email(p_email) <> ''
    AND gb_norm_phone(p_phone) <> ''
    AND gb_norm_name(p_name)  <> ''
    AND (
      EXISTS (
        SELECT 1 FROM orders o
        WHERE o.group_buy_id = p_group_buy_id
          AND gb_order_counts_toward_kit(o.order_status, o.payment_status)
          AND gb_norm_name (o.customer_name)  = gb_norm_name (p_name)
          AND gb_norm_email(o.customer_email) = gb_norm_email(p_email)
          AND gb_norm_phone(o.customer_phone) = gb_norm_phone(p_phone)
      )
      OR EXISTS (
        SELECT 1 FROM group_buy_bunuan_grants g
        WHERE g.group_buy_id = p_group_buy_id
          AND g.customer_email = gb_norm_email(p_email)
      )
    );
$function$;

-- 5d) Per-round order numbers ------------------------------------------------

-- Allocates orders.gb_order_seq from group_buys.order_seq_counter
-- (monotonic, never reused). Runs for every writer via trigger.
CREATE OR REPLACE FUNCTION public.assign_gb_order_seq()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.group_buy_id IS NOT DISTINCT FROM OLD.group_buy_id THEN
    RETURN NEW;
  END IF;

  IF NEW.group_buy_id IS NULL THEN
    NEW.gb_order_seq := NULL;
    RETURN NEW;
  END IF;

  UPDATE public.group_buys
     SET order_seq_counter = order_seq_counter + 1
   WHERE id = NEW.group_buy_id
  RETURNING order_seq_counter INTO NEW.gb_order_seq;

  IF NOT FOUND THEN
    SELECT COALESCE(MAX(gb_order_seq), 0) + 1
      INTO NEW.gb_order_seq
      FROM public.orders
     WHERE group_buy_id = NEW.group_buy_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- 5e) Checkout ------------------------------------------------------------------

-- Server-side re-pricing of a cart (variation / national / international
-- price, per-product discount, global site discount, per-round availability).
-- Never trusts client prices.
CREATE OR REPLACE FUNCTION public.validate_and_price_order(p_items jsonb, p_pricing_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item        jsonb;
  v_product_id  uuid;
  v_variation_id uuid;
  v_qty         numeric;
  v_product     products%ROWTYPE;
  v_variation   product_variations%ROWTYPE;
  v_has_product boolean;
  v_has_variation boolean;
  v_base        numeric;
  v_per_product numeric;
  v_unit        numeric;
  v_stock       numeric;
  v_available   boolean;
  v_gb_avail    boolean;
  v_line        numeric;
  v_subtotal    numeric := 0;
  v_items       jsonb := '[]'::jsonb;
  v_mode        text := lower(coalesce(p_pricing_mode, 'national'));
  v_uuid_re     text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  g_active   boolean;
  g_type     text;
  g_val_txt  text;
  g_start_txt text;
  g_end_txt  text;
  g_value    numeric;
  g_start    timestamptz;
  g_end      timestamptz;
  g_on       boolean := false;
BEGIN
  -- DoS guard: a real order has only a handful of lines. Reject absurd payloads.
  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) = 'array'
     AND jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) > 200 THEN
    RAISE EXCEPTION 'Order payload too large';
  END IF;

  SELECT (value = 'true') INTO g_active  FROM site_settings WHERE id = 'global_discount_active';
  SELECT value           INTO g_type    FROM site_settings WHERE id = 'global_discount_type';
  SELECT value           INTO g_val_txt  FROM site_settings WHERE id = 'global_discount_value';
  SELECT value           INTO g_start_txt FROM site_settings WHERE id = 'global_discount_start';
  SELECT value           INTO g_end_txt   FROM site_settings WHERE id = 'global_discount_end';

  g_value := CASE WHEN g_val_txt ~ '^[0-9]+(\.[0-9]+)?$' THEN g_val_txt::numeric ELSE NULL END;
  BEGIN g_start := NULLIF(g_start_txt, '')::timestamptz; EXCEPTION WHEN others THEN g_start := NULL; END;
  BEGIN g_end   := NULLIF(g_end_txt,   '')::timestamptz; EXCEPTION WHEN others THEN g_end   := NULL; END;

  g_on := COALESCE(g_active, false)
          AND COALESCE(g_value, 0) > 0
          AND (g_start IS NULL OR g_start <= now())
          AND (g_end   IS NULL OR g_end   >= now());

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_product     := NULL;
    v_variation   := NULL;
    v_has_product := false;
    v_has_variation := false;
    v_gb_avail    := NULL;

    v_product_id   := CASE WHEN (v_item->>'product_id')   ~ v_uuid_re THEN (v_item->>'product_id')::uuid   ELSE NULL END;
    v_variation_id := CASE WHEN (v_item->>'variation_id') ~ v_uuid_re THEN (v_item->>'variation_id')::uuid ELSE NULL END;
    v_qty          := CASE WHEN (v_item->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_item->>'quantity')::numeric ELSE 1 END;

    IF v_product_id IS NOT NULL THEN
      SELECT * INTO v_product FROM products WHERE id = v_product_id;
      IF FOUND THEN
        v_has_product := true;
      END IF;
    END IF;

    IF v_variation_id IS NOT NULL AND v_has_product THEN
      SELECT * INTO v_variation FROM product_variations
        WHERE id = v_variation_id AND product_id = v_product_id;
      IF FOUND THEN
        v_has_variation := true;
      END IF;
    END IF;

    IF NOT v_has_product OR (v_variation_id IS NOT NULL AND NOT v_has_variation) THEN
      v_items := v_items || jsonb_build_object(
        'product_id', v_item->>'product_id',
        'variation_id', v_item->>'variation_id',
        'quantity', v_qty,
        'unit_price', 0,
        'line_total', 0,
        'product_name', COALESCE(v_product.name, 'Unavailable'),
        'variation_name', NULL,
        'purity_percentage', NULL,
        'available', false,
        'stock', 0
      );
      CONTINUE;
    END IF;

    IF v_has_variation THEN
      v_base := CASE WHEN v_mode = 'international'
                     THEN COALESCE(v_variation.international_price, v_variation.price)
                     ELSE COALESCE(v_variation.national_price, v_variation.price) END;
    ELSE
      v_base := CASE WHEN v_mode = 'international'
                     THEN COALESCE(v_product.international_price, v_product.base_price)
                     ELSE COALESCE(v_product.national_price, v_product.base_price) END;
    END IF;

    v_per_product := v_base;
    IF NOT v_has_variation AND v_mode = 'national'
       AND v_product.discount_active IS TRUE
       AND COALESCE(v_product.discount_price, 0) > 0
       AND (v_product.discount_start_date IS NULL OR v_product.discount_start_date <= now())
       AND (v_product.discount_end_date   IS NULL OR v_product.discount_end_date   >= now())
    THEN
      v_per_product := LEAST(v_base, v_product.discount_price);
    END IF;

    v_unit := v_per_product;
    IF g_on THEN
      IF lower(COALESCE(g_type, 'percentage')) = 'percentage' THEN
        v_unit := LEAST(v_per_product, round(GREATEST(0, v_base * (1 - g_value / 100))::numeric, 2));
      ELSE
        v_unit := LEAST(v_per_product, round(GREATEST(0, v_base - g_value)::numeric, 2));
      END IF;
    END IF;

    v_unit      := round(GREATEST(0, v_unit)::numeric, 2);
    v_stock     := COALESCE(CASE WHEN v_has_variation THEN v_variation.stock_quantity
                                 ELSE v_product.stock_quantity END, 0);
    v_available := COALESCE(v_product.available, true);

    -- Per-GB availability gate (the new bit): if the product is marked OFF in
    -- its assigned Group Buy, it cannot be purchased — regardless of the UI.
    IF v_available AND v_product.group_buy_id IS NOT NULL THEN
      -- COALESCE defends against a NULL slipping in despite the NOT NULL column.
      SELECT COALESCE(is_available, true) INTO v_gb_avail FROM group_buy_product_availability
        WHERE group_buy_id = v_product.group_buy_id AND product_id = v_product.id;
      IF FOUND AND v_gb_avail IS FALSE THEN
        v_available := false;
      END IF;
    END IF;

    v_line      := round((v_unit * v_qty)::numeric, 2);

    IF v_available THEN
      v_subtotal := v_subtotal + v_line;
    END IF;

    v_items := v_items || jsonb_build_object(
      'product_id', v_product.id,
      'variation_id', v_variation_id,
      'quantity', v_qty,
      'unit_price', v_unit,
      'line_total', v_line,
      'product_name', v_product.name,
      'variation_name', CASE WHEN v_has_variation THEN v_variation.name ELSE NULL END,
      'purity_percentage', v_product.purity_percentage,
      'available', v_available,
      'stock', v_stock
    );
  END LOOP;

  RETURN jsonb_build_object(
    'items', v_items,
    'subtotal', round(v_subtotal::numeric, 2),
    'pricing_mode', v_mode
  );
END;
$function$;

-- The only enforcement point for creating an order: re-prices server-side,
-- enforces MOQ (normal phase) or the exact kit shortfall (Bunuan), serialises
-- competing checkouts per (round, product) with advisory locks, inserts, and
-- returns the per-round order number. Between rounds it still accepts orders
-- (attributed to the newest round) so the store never closes.
CREATE OR REPLACE FUNCTION public.place_group_buy_order(
  p_items        jsonb,
  p_pricing_mode text,
  p_order        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gb             group_buys%ROWTYPE;
  v_phase          text;
  v_bunuan         boolean := false;
  v_priced         jsonb;
  v_item           jsonb;
  v_product_id     uuid;
  v_variation_id   uuid;
  v_qty            integer;
  v_moq            integer;
  v_state          record;
  v_name           text;
  v_email          text;
  v_phone          text;
  v_order_id       uuid := gen_random_uuid();
  v_subtotal       numeric := 0;
  v_shipping_fee   numeric;
  v_product_name   text;
  v_variation_name text;
  v_label          text;
  v_uuid_re        text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_order_seq      integer;
  v_order_code     text;
BEGIN
  -- Which round: derived server-side, never taken from the client. With no
  -- round open the store still takes orders (attributed to the newest round)
  -- under normal MOQ rules — closing checkout in that gap once lost 59 orders.
  SELECT * INTO v_gb
  FROM group_buys
  WHERE status IN ('active', 'bunuan_open')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_phase  := v_gb.status;
    v_bunuan := (v_phase = 'bunuan_open');
  ELSE
    SELECT * INTO v_gb FROM group_buys ORDER BY created_at DESC LIMIT 1;
    v_phase  := COALESCE(v_gb.status, 'none');
    v_bunuan := false;
  END IF;

  v_priced := validate_and_price_order(p_items, p_pricing_mode);

  IF v_priced IS NULL OR jsonb_typeof(v_priced->'items') <> 'array'
     OR jsonb_array_length(v_priced->'items') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EMPTY_CART', 'message', 'Your cart is empty.');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_priced->'items')
  LOOP
    IF NOT COALESCE((v_item->>'available')::boolean, false) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'UNAVAILABLE',
        'product_id', v_item->>'product_id',
        'message', COALESCE(v_item->>'product_name', 'An item') || ' is no longer available.'
      );
    END IF;

    IF COALESCE((v_item->>'stock')::numeric, 0) < COALESCE((v_item->>'quantity')::numeric, 0) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'INSUFFICIENT_STOCK',
        'product_id', v_item->>'product_id',
        'message', 'Not enough stock left for ' || COALESCE(v_item->>'product_name', 'an item') || '.'
      );
    END IF;
  END LOOP;

  v_subtotal := COALESCE((v_priced->>'subtotal')::numeric, 0);

  -- Lock every (round, product, variation) in the cart, in a fixed order, so two
  -- checkouts for the same last vial queue instead of both succeeding, and two
  -- multi-line carts can never deadlock.
  FOR v_product_id, v_variation_id IN
    SELECT DISTINCT (it->>'product_id')::uuid,
           CASE WHEN (it->>'variation_id') ~ v_uuid_re THEN (it->>'variation_id')::uuid END
    FROM jsonb_array_elements(v_priced->'items') it
    WHERE (it->>'product_id') ~ v_uuid_re
    ORDER BY 1, 2
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        COALESCE(v_gb.id::text, '-') || ':' || v_product_id::text || ':' || COALESCE(v_variation_id::text, '-'),
        0)
    );
  END LOOP;

  IF v_bunuan THEN
    v_name  := p_order->>'customer_name';
    v_email := p_order->>'customer_email';
    v_phone := p_order->>'customer_phone';

    IF NOT gb_is_bunuan_eligible_customer(v_gb.id, v_name, v_email, v_phone) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'BUNUAN_NOT_ELIGIBLE',
        'message', 'Bunuan is currently available only to customers who already joined this Groupbuy.'
      );
    END IF;
  END IF;

  -- Rules apply to the cart's TOTAL per (product, variation): the same strength
  -- in two lines is summed, while different strengths are judged separately.
  FOR v_product_id, v_variation_id, v_qty, v_product_name, v_variation_name IN
    SELECT (it->>'product_id')::uuid,
           CASE WHEN (it->>'variation_id') ~ v_uuid_re THEN (it->>'variation_id')::uuid END,
           SUM((it->>'quantity')::numeric)::integer,
           MIN(it->>'product_name'),
           MIN(it->>'variation_name')
    FROM jsonb_array_elements(v_priced->'items') it
    WHERE (it->>'product_id') ~ v_uuid_re
    GROUP BY 1, 2
  LOOP
    v_label := v_product_name || COALESCE(' ' || NULLIF(v_variation_name, ''), '');

    IF NOT v_bunuan THEN
      v_moq := gb_effective_moq(v_gb.id, v_product_id, v_variation_id);

      IF v_qty < v_moq THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'BELOW_MOQ',
          'product_id', v_product_id,
          'variation_id', v_variation_id,
          'required', v_moq,
          'ordered', v_qty,
          'short_by', v_moq - v_qty,
          'message', 'Minimum order for ' || v_label || ' is ' || v_moq ||
                     ' vials. Please add ' || (v_moq - v_qty) || ' more to continue.'
        );
      END IF;

    ELSE
      -- Evaluated inside the lock, so it already reflects any order a competing
      -- checkout committed a moment ago.
      SELECT * INTO v_state FROM gb_kit_state(v_gb.id, v_product_id, v_variation_id);

      IF v_state.kit_size IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'NOT_IN_BUNUAN',
          'product_id', v_product_id,
          'variation_id', v_variation_id,
          'message', v_label || ' is not part of this Bunuan round.'
        );
      END IF;

      IF v_state.bunuan_available <= 0 THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'BUNUAN_UNAVAILABLE',
          'product_id', v_product_id,
          'variation_id', v_variation_id,
          'message', v_label || ' is already complete and is no longer available.'
        );
      END IF;

      IF v_qty > v_state.bunuan_available THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'BUNUAN_EXCEEDS_REMAINING',
          'product_id', v_product_id,
          'variation_id', v_variation_id,
          'available', v_state.bunuan_available,
          'ordered', v_qty,
          'message', 'Only ' || v_state.bunuan_available || ' left to complete the ' ||
                     v_label || ' kit. Someone may have just ordered before you.'
        );
      END IF;
    END IF;
  END LOOP;

  v_shipping_fee := COALESCE(NULLIF(p_order->>'shipping_fee', '')::numeric, 0);

  INSERT INTO orders (
    id, customer_name, customer_email, customer_phone,
    shipping_address, shipping_barangay, shipping_city, shipping_state, shipping_zip_code,
    shipping_location, shipping_fee,
    order_items, total_price,
    payment_method_id, payment_method_name, payment_proof_url,
    contact_method, notes,
    order_status, payment_status,
    pricing_mode, currency,
    terms_accepted, terms_accepted_at,
    group_buy_id, group_buy_number
  ) VALUES (
    v_order_id,
    p_order->>'customer_name',
    p_order->>'customer_email',
    p_order->>'customer_phone',
    p_order->>'shipping_address',
    COALESCE(p_order->>'shipping_barangay', ''),
    p_order->>'shipping_city',
    p_order->>'shipping_state',
    p_order->>'shipping_zip_code',
    p_order->>'shipping_location',
    v_shipping_fee,
    v_priced->'items',
    v_subtotal,
    p_order->>'payment_method_id',
    p_order->>'payment_method_name',
    p_order->>'payment_proof_url',
    p_order->>'contact_method',
    p_order->>'notes',
    'new',
    'pending',
    lower(COALESCE(p_pricing_mode, 'national')),
    COALESCE(p_order->>'currency', 'PHP'),
    true,
    now(),
    v_gb.id,
    v_gb.gb_number
  )
  RETURNING gb_order_seq, gb_order_code INTO v_order_seq, v_order_code;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'group_buy_id', v_gb.id,
    'group_buy_number', v_gb.gb_number,
    'gb_order_seq', v_order_seq,
    'gb_order_code', v_order_code,
    'phase', v_phase,
    'subtotal', v_subtotal,
    'items', v_priced->'items'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6) View — kit audit, one row per product VARIATION (aggregate quantities only, no customer PII)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.group_buy_kit_status AS
SELECT
  g.id          AS group_buy_id,
  g.gb_number,
  g.status      AS group_buy_status,
  p.id          AS product_id,
  p.name        AS product_name,
  p.image_url,
  gb_effective_moq(g.id, p.id, pv.variation_id) AS effective_moq,
  s.kit_size,
  s.eligible_qty,
  s.complete_kits,
  s.in_progress,
  s.bunuan_needed,
  s.bunuan_available,
  s.is_complete,
  pv.variation_id,
  pv.variation_name
FROM products p
JOIN group_buys g ON g.id = p.group_buy_id
CROSS JOIN LATERAL (
  SELECT v.id AS variation_id, v.name AS variation_name
    FROM product_variations v WHERE v.product_id = p.id
  UNION ALL
  SELECT NULL::uuid, NULL::text
   WHERE NOT EXISTS (SELECT 1 FROM product_variations v2 WHERE v2.product_id = p.id)
) pv
CROSS JOIN LATERAL gb_kit_state(g.id, p.id, pv.variation_id) s;

-- ----------------------------------------------------------------------------
-- 7) Triggers
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_categories_updated_at ON public.categories;
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_menu_items_updated_at ON public.menu_items;
CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS orders_assign_gb_order_seq ON public.orders;
CREATE TRIGGER orders_assign_gb_order_seq BEFORE INSERT OR UPDATE OF group_buy_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.assign_gb_order_seq();
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_site_settings_updated_at ON public.site_settings;
CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 8) Comments
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.assessment_responses IS 'Enhanced peptide assessment responses with comprehensive medical screening (V2)';
COMMENT ON COLUMN public.orders.gb_order_seq IS 'Per-round order number, 1-based. Allocated by assign_gb_order_seq(); never reused.';
COMMENT ON COLUMN public.orders.gb_order_code IS 'Printable per-round order number, e.g. GB14-007. Derived from group_buy_number + gb_order_seq.';
COMMENT ON COLUMN public.group_buys.order_seq_counter IS 'Highest order number handed out in this round. Monotonic — deletes do not give it back.';

-- ----------------------------------------------------------------------------
-- 9) Row Level Security — exactly the 11 tables that have it ON in production
-- ----------------------------------------------------------------------------
-- ON with no policies (locked to all but service_role): app_settings,
-- group_buy_bunuan_grants, session.
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_buy_bunuan_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_buy_product_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_buy_product_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_buys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hero_carousel_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moq_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_guide_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_guides ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 10) RLS policies — public schema (36)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read add-ons" ON public.add_ons;
CREATE POLICY "Anyone can read add-ons" ON public.add_ons FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage add-ons" ON public.add_ons;
CREATE POLICY "Authenticated users can manage add-ons" ON public.add_ons FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view assessments" ON public.assessment_responses;
CREATE POLICY "Admins can view assessments" ON public.assessment_responses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Public can submit assessments" ON public.assessment_responses;
CREATE POLICY "Public can submit assessments" ON public.assessment_responses FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read categories" ON public.categories;
CREATE POLICY "Anyone can read categories" ON public.categories FOR SELECT TO public USING ((active = true));
DROP POLICY IF EXISTS "Authenticated users can manage categories" ON public.categories;
CREATE POLICY "Authenticated users can manage categories" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gb_prod_avail open write" ON public.group_buy_product_availability;
CREATE POLICY "gb_prod_avail open write" ON public.group_buy_product_availability FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gb_prod_avail public read" ON public.group_buy_product_availability;
CREATE POLICY "gb_prod_avail public read" ON public.group_buy_product_availability FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "gb_prod_kits open write" ON public.group_buy_product_kits;
CREATE POLICY "gb_prod_kits open write" ON public.group_buy_product_kits FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gb_prod_kits public read" ON public.group_buy_product_kits;
CREATE POLICY "gb_prod_kits public read" ON public.group_buy_product_kits FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "group_buys open write" ON public.group_buys;
CREATE POLICY "group_buys open write" ON public.group_buys FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "group_buys public read" ON public.group_buys;
CREATE POLICY "group_buys public read" ON public.group_buys FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "hero_carousel open write" ON public.hero_carousel_slides;
CREATE POLICY "hero_carousel open write" ON public.hero_carousel_slides FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "hero_carousel public read" ON public.hero_carousel_slides;
CREATE POLICY "hero_carousel public read" ON public.hero_carousel_slides FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can update journey sections" ON public.journey_sections;
CREATE POLICY "Admins can update journey sections" ON public.journey_sections FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can view journey sections" ON public.journey_sections;
CREATE POLICY "Public can view journey sections" ON public.journey_sections FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read menu items" ON public.menu_items;
CREATE POLICY "Anyone can read menu items" ON public.menu_items FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage menu items" ON public.menu_items;
CREATE POLICY "Authenticated users can manage menu items" ON public.menu_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "moq_presets open write" ON public.moq_presets;
CREATE POLICY "moq_presets open write" ON public.moq_presets FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "moq_presets public read" ON public.moq_presets;
CREATE POLICY "moq_presets public read" ON public.moq_presets FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Anyone can read active payment methods" ON public.payment_methods;
CREATE POLICY "Anyone can read active payment methods" ON public.payment_methods FOR SELECT TO public USING ((active = true));
DROP POLICY IF EXISTS "Authenticated users can manage payment methods" ON public.payment_methods;
CREATE POLICY "Authenticated users can manage payment methods" ON public.payment_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage rules" ON public.recommendation_rules;
CREATE POLICY "Admins can manage rules" ON public.recommendation_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public can read active rules" ON public.recommendation_rules;
CREATE POLICY "Public can read active rules" ON public.recommendation_rules FOR SELECT TO anon, authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Allow authenticated delete" ON public.shipping_locations;
CREATE POLICY "Allow authenticated delete" ON public.shipping_locations FOR DELETE TO public USING (true);
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.shipping_locations;
CREATE POLICY "Allow authenticated insert" ON public.shipping_locations FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated update" ON public.shipping_locations;
CREATE POLICY "Allow authenticated update" ON public.shipping_locations FOR UPDATE TO public USING (true);
DROP POLICY IF EXISTS "Allow public read access" ON public.shipping_locations;
CREATE POLICY "Allow public read access" ON public.shipping_locations FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Anyone can read site settings" ON public.site_settings;
CREATE POLICY "Anyone can read site settings" ON public.site_settings FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage site settings" ON public.site_settings;
CREATE POLICY "Authenticated users can manage site settings" ON public.site_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Read Guide Files" ON public.smart_guide_files;
CREATE POLICY "Public Read Guide Files" ON public.smart_guide_files FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public Write Guide Files" ON public.smart_guide_files;
CREATE POLICY "Public Write Guide Files" ON public.smart_guide_files FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Public Read Guides" ON public.smart_guides;
CREATE POLICY "Public Read Guides" ON public.smart_guides FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public Write Guides" ON public.smart_guides;
CREATE POLICY "Public Write Guides" ON public.smart_guides FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Anyone can read variations" ON public.variations;
CREATE POLICY "Anyone can read variations" ON public.variations FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage variations" ON public.variations;
CREATE POLICY "Authenticated users can manage variations" ON public.variations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 11) Grants (production: ALL on every table/view for the three API roles;
--     RLS is what restricts)
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON TABLE
  public.add_ons, public.app_settings, public.assessment_responses,
  public.categories, public.group_buy_bunuan_grants,
  public.group_buy_product_availability, public.group_buy_product_kits,
  public.group_buys, public.hero_carousel_slides, public.journey_sections,
  public.menu_items, public.moq_presets, public.orders,
  public.payment_methods, public.product_variations, public.products,
  public.recommendation_rules, public.session, public.shipping_locations,
  public.site_settings, public.smart_guide_files, public.smart_guides,
  public.variations, public.group_buy_kit_status
TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.assign_gb_order_seq(),
  public.gb_effective_kit_size(uuid, uuid, uuid),
  public.gb_effective_moq(uuid, uuid, uuid),
  public.gb_eligible_quantities(uuid),
  public.gb_eligible_quantity(uuid, uuid, uuid),
  public.gb_kit_state(uuid, uuid, uuid),
  public.gb_norm_email(text),
  public.gb_norm_name(text),
  public.gb_norm_phone(text),
  public.gb_order_counts_toward_kit(text, text),
  public.get_effective_price(numeric, numeric, boolean, timestamp with time zone, timestamp with time zone),
  public.is_discount_active(boolean, timestamp with time zone, timestamp with time zone),
  public.place_group_buy_order(jsonb, text, jsonb),
  public.update_updated_at_column(),
  public.validate_and_price_order(jsonb, text)
TO anon, authenticated, service_role;

-- New functions are EXECUTE-able by PUBLIC (and so by anon) by default, so the
-- eligibility oracle must be revoked from PUBLIC explicitly.
REVOKE ALL ON FUNCTION public.gb_is_bunuan_eligible_customer(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gb_is_bunuan_eligible_customer(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gb_is_bunuan_eligible_customer(uuid, text, text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 12) Realtime publication (5 tables)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY ARRAY['group_buy_product_availability', 'group_buy_product_kits',
                           'hero_carousel_slides', 'smart_guide_files', 'smart_guides'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 13) Storage — 2 buckets + 10 storage.objects policies
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('menu-images', 'menu-images', true, 5242880,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('guide-files', 'guide-files', true, 52428800,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
         'application/pdf', 'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'text/plain', 'text/csv'])
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Anyone can delete guide files" ON storage.objects;
CREATE POLICY "Anyone can delete guide files" ON storage.objects FOR DELETE TO public USING ((bucket_id = 'guide-files'::text));
DROP POLICY IF EXISTS "Anyone can update guide files" ON storage.objects;
CREATE POLICY "Anyone can update guide files" ON storage.objects FOR UPDATE TO public USING ((bucket_id = 'guide-files'::text));
DROP POLICY IF EXISTS "Anyone can upload guide files" ON storage.objects;
CREATE POLICY "Anyone can upload guide files" ON storage.objects FOR INSERT TO public WITH CHECK ((bucket_id = 'guide-files'::text));
DROP POLICY IF EXISTS "Public read access for guide files" ON storage.objects;
CREATE POLICY "Public read access for guide files" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'guide-files'::text));
DROP POLICY IF EXISTS "Authenticated users can delete menu images" ON storage.objects;
CREATE POLICY "Authenticated users can delete menu images" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'menu-images'::text));
DROP POLICY IF EXISTS "Authenticated users can update menu images" ON storage.objects;
CREATE POLICY "Authenticated users can update menu images" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'menu-images'::text));
DROP POLICY IF EXISTS "Authenticated users can upload menu images" ON storage.objects;
CREATE POLICY "Authenticated users can upload menu images" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'menu-images'::text));
DROP POLICY IF EXISTS "Public read access for menu images" ON storage.objects;
CREATE POLICY "Public read access for menu images" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'menu-images'::text));
DROP POLICY IF EXISTS "public read menu-images" ON storage.objects;
CREATE POLICY "public read menu-images" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'menu-images'::text));
DROP POLICY IF EXISTS "public upload menu-images" ON storage.objects;
CREATE POLICY "public upload menu-images" ON storage.objects FOR INSERT TO public WITH CHECK ((bucket_id = 'menu-images'::text));

-- ----------------------------------------------------------------------------
-- 14) Seed config — MOQ quick-fill buttons (keyed on label, never duplicated)
-- ----------------------------------------------------------------------------
INSERT INTO public.moq_presets (label, value, sort_order)
SELECT v.label, v.value, v.sort_order
FROM (VALUES ('No MOQ', 1, 0), ('MOQ 2', 2, 1), ('MOQ 3', 3, 2),
             ('MOQ 5', 5, 3), ('MOQ 10', 10, 4)) AS v(label, value, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.moq_presets p WHERE p.label = v.label);

-- ----------------------------------------------------------------------------
-- 15) Self-check — any shortfall raises, rolling back the whole file
-- ----------------------------------------------------------------------------
SET LOCAL client_min_messages = notice;
DO $$
DECLARE
  r record;
BEGIN
  SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r')                         AS tables,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'v')                         AS views,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public')                                             AS funcs,
    (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal)                      AS triggers,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public')            AS policies,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity)    AS rls,
    (SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace
      WHERE n.nspname = 'public' AND k.contype = 'f')                         AS fks,
    (SELECT count(*) FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public')          AS realtime,
    (SELECT count(*) FROM storage.buckets WHERE id IN ('menu-images','guide-files')) AS buckets,
    has_function_privilege('anon',
      'public.gb_is_bunuan_eligible_customer(uuid,text,text,text)', 'execute') AS anon_oracle
  INTO r;

  IF r.tables < 23 OR r.views < 1 OR r.funcs < 16 OR r.triggers < 6 OR r.policies < 36
     OR r.rls < 11 OR r.fks < 15 OR r.realtime < 5 OR r.buckets <> 2 OR r.anon_oracle THEN
    RAISE EXCEPTION 'Schema baseline self-check FAILED: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'Schema baseline OK: %', row_to_json(r);
END $$;

COMMIT;
