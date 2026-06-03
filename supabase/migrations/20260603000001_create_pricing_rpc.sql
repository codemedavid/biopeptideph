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
