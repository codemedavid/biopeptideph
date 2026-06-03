-- ============================================================
-- Peptology.ph — new migrations bundle (run top-to-bottom once)
-- Paste this whole file into the Supabase SQL editor and Run.
-- Safe to re-run: every statement is idempotent.
-- ============================================================



-- ----------------------------------------------------------------
-- 20260603000000_add_order_terms_and_consent.sql
-- ----------------------------------------------------------------
-- Phase 1 (#8): Terms & Conditions before checkout
-- Adds consent columns to orders and seeds editable T&C content in site_settings.
-- Idempotent: safe to run more than once.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Editable Terms & Conditions content (admin edits this via the dashboard).
INSERT INTO site_settings (id, value, type, description)
VALUES (
  'terms_and_conditions_content',
  E'By placing a preorder you agree to the following:\n\n'
  || E'1. Group Buy / Preorder — Items are ordered in batches. Delivery timelines depend on the group buy schedule and supplier lead times.\n'
  || E'2. Payment — Orders are confirmed only after full payment and a valid proof of payment are received.\n'
  || E'3. No Cancellations — Once a group buy closes and the bulk order is placed with the supplier, orders cannot be cancelled or refunded.\n'
  || E'4. Shipping — Shipping fees are shouldered by the customer. We are not liable for courier delays.\n'
  || E'5. Products — All products are research-use peptides. The customer is responsible for lawful and safe handling.\n',
  'text',
  'Terms & Conditions shown and required before checkout'
)
ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------
-- 20260603000001_create_pricing_rpc.sql
-- ----------------------------------------------------------------
-- Phase 1 (#11): Server-side price validation
--
-- validate_and_price_order() re-derives every line price and the subtotal from
-- the LIVE database, mirroring src/lib/pricing.ts (computeEffectivePrice). The
-- checkout calls this before saving an order, so a stale or tampered client
-- price can never become the charged price. SECURITY DEFINER lets the (otherwise
-- unauthenticated) storefront read authoritative prices regardless of RLS.
--
-- Input:  p_items = [{ "product_id": uuid, "variation_id": uuid|null, "quantity": n }, ...]
--         p_pricing_mode = 'national' | 'international'
-- Output: { items: [{ product_id, variation_id, quantity, unit_price, line_total,
--           product_name, variation_name, purity_percentage, available, stock }],
--           subtotal, pricing_mode }
--
-- Discount precedence matches the client ("best price wins, no stacking"):
--   per-product discount (national base product only) vs global sitewide
--   discount computed off the base price — whichever is cheaper.
--
-- All casts of caller-supplied or admin-supplied text are guarded (regex for
-- uuid/numeric, EXCEPTION blocks for timestamptz) so malformed input degrades
-- to a safe default instead of raising and aborting the whole call.

CREATE OR REPLACE FUNCTION public.validate_and_price_order(p_items jsonb, p_pricing_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_line        numeric;
  v_subtotal    numeric := 0;
  v_items       jsonb := '[]'::jsonb;
  v_mode        text := lower(coalesce(p_pricing_mode, 'national'));
  v_uuid_re     text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  -- global discount settings (read as text, then safely converted)
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
  -- Load global discount (rows may not exist yet -> treated as inactive).
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

    -- Guarded casts: malformed ids/quantities become NULL/1 instead of raising.
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

    -- Unavailable: product missing/invalid, or a requested variation no longer exists.
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

    -- 1) base price by pricing mode
    IF v_has_variation THEN
      v_base := CASE WHEN v_mode = 'international'
                     THEN COALESCE(v_variation.international_price, v_variation.price)
                     ELSE COALESCE(v_variation.national_price, v_variation.price) END;
    ELSE
      v_base := CASE WHEN v_mode = 'international'
                     THEN COALESCE(v_product.international_price, v_product.base_price)
                     ELSE COALESCE(v_product.national_price, v_product.base_price) END;
    END IF;

    -- 2) per-product discount (national, base product only, within date window)
    v_per_product := v_base;
    IF NOT v_has_variation AND v_mode = 'national'
       AND v_product.discount_active IS TRUE
       AND COALESCE(v_product.discount_price, 0) > 0
       AND (v_product.discount_start_date IS NULL OR v_product.discount_start_date <= now())
       AND (v_product.discount_end_date   IS NULL OR v_product.discount_end_date   >= now())
    THEN
      v_per_product := LEAST(v_base, v_product.discount_price);
    END IF;

    -- 3) global discount off the base price -> best price wins (no stacking)
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
$$;

-- Storefront uses the anon key; admins are authenticated.
GRANT EXECUTE ON FUNCTION public.validate_and_price_order(jsonb, text) TO anon, authenticated;


-- ----------------------------------------------------------------
-- 20260603000002_add_group_buys.sql
-- ----------------------------------------------------------------
-- Phase 2 (#1, #2, #6): Group Buy operating model
--
-- A Group Buy is a preorder "round". Products are assigned to a round
-- (products.group_buy_id) and each order is stamped with the round it was placed
-- under (orders.group_buy_id / group_buy_number). One round is "active" at a time;
-- the storefront's "Explore GB #N" button and banner read that active round.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS group_buys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gb_number   integer NOT NULL,
  title       text NOT NULL,
  description text,
  start_date  timestamptz,
  end_date    timestamptz,
  status      text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'closed')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS group_buys_gb_number_idx ON group_buys(gb_number);
CREATE INDEX IF NOT EXISTS group_buys_status_idx ON group_buys(status);

-- This project operates the admin via the anon key (the dashboard is password
-- gated client-side), so reads AND writes must be permitted for anon — matching
-- the rest of the schema, which runs unrestricted.
ALTER TABLE group_buys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "group_buys public read" ON group_buys;
CREATE POLICY "group_buys public read" ON group_buys FOR SELECT USING (true);
DROP POLICY IF EXISTS "group_buys open write" ON group_buys;
CREATE POLICY "group_buys open write" ON group_buys FOR ALL USING (true) WITH CHECK (true);

-- Assign a product to a round (nullable: unassigned products still sell normally).
ALTER TABLE products ADD COLUMN IF NOT EXISTS group_buy_id uuid REFERENCES group_buys(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS products_group_buy_id_idx ON products(group_buy_id);

-- Stamp orders with the round they belong to (set at checkout from the active GB).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS group_buy_id uuid REFERENCES group_buys(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS group_buy_number integer;
CREATE INDEX IF NOT EXISTS orders_group_buy_id_idx ON orders(group_buy_id);


-- ----------------------------------------------------------------
-- 20260603000003_add_hero_and_discount_settings.sql
-- ----------------------------------------------------------------
-- Phase 4 (#5, #7): Hero CMS + Global Discount settings
-- Seeds editable site_settings keys (admin manages them from the dashboard).
-- Idempotent: ON CONFLICT DO NOTHING preserves any existing values.

INSERT INTO site_settings (id, value, type, description) VALUES
  -- Hero section (#5)
  ('home_hero_image_url', '', 'image',  'Homepage hero background image URL'),
  ('home_hero_cta_text',  '', 'string', 'Homepage hero primary CTA button text (falls back to Explore GB / Explore Products)'),
  ('home_hero_cta_link',  '', 'string', 'Homepage hero primary CTA link (optional; blank scrolls to products)'),

  -- Global discount (#7)
  ('global_discount_active', 'false',      'boolean', 'Sitewide discount on/off'),
  ('global_discount_type',   'percentage', 'string',  'Sitewide discount type: percentage | fixed'),
  ('global_discount_value',  '0',          'number',  'Sitewide discount amount (percent or fixed currency units)'),
  ('global_discount_start',  '',           'string',  'Sitewide discount start (ISO datetime, optional)'),
  ('global_discount_end',    '',           'string',  'Sitewide discount end (ISO datetime, optional)')
ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------
-- 20260603000004_add_hero_carousel.sql
-- ----------------------------------------------------------------
-- Hero Carousel (admin-managed homepage slides)
-- Each slide is an image with OPTIONAL title/subtitle/CTA. The storefront shows
-- active slides ordered by sort_order; if none exist the homepage falls back to
-- the existing static hero. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS hero_carousel_slides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url   text NOT NULL,
  title       text,
  subtitle    text,
  button_text text,
  button_link text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hero_carousel_sort_idx ON hero_carousel_slides(sort_order ASC);
CREATE INDEX IF NOT EXISTS hero_carousel_active_idx ON hero_carousel_slides(is_active);

-- Admin operates via the anon key (dashboard is password-gated client-side), so
-- both read and write must be permitted — consistent with the rest of the schema.
ALTER TABLE hero_carousel_slides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hero_carousel public read" ON hero_carousel_slides;
CREATE POLICY "hero_carousel public read" ON hero_carousel_slides FOR SELECT USING (true);
DROP POLICY IF EXISTS "hero_carousel open write" ON hero_carousel_slides;
CREATE POLICY "hero_carousel open write" ON hero_carousel_slides FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime so admin changes reflect on the homepage instantly.
-- Wrapped so the migration never fails if the publication is absent/already set.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE hero_carousel_slides;
EXCEPTION WHEN others THEN NULL;
END $$;
