-- Kits and MOQ per VARIATION.
--
-- Until now a kit was counted per product: Tirzepatide 5mg, 10mg and 15mg all
-- filled ONE kit, and one MOQ covered every strength. The supplier ships per
-- strength, so each variation must fill its own kits and carry its own minimum.
--
-- The counting identity becomes (product_id, variation_id), where a NULL
-- variation_id means "a product that has no variations" — those behave exactly
-- as before.
--
-- Rule precedence, most specific first:
--   kit size : round override for the variation  -> round override for the product
--              -> product_variations.kit_size     -> products.kit_size
--   MOQ      : round override for the variation  -> round override for the product
--              -> product_variations.min_order_quantity -> products.min_order_quantity -> 1
-- So a kit size set once on the product still applies to every strength, and a
-- single strength can differ (e.g. 15mg ships in kits of 5).
--
-- Order lines already record variation_id (validate_and_price_order has always
-- written it), so every existing order is counted correctly without a backfill.
--
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1) Variation-level defaults
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS kit_size integer;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS min_order_quantity integer;

DO $$
BEGIN
  ALTER TABLE public.product_variations ADD CONSTRAINT product_variations_kit_size_positive
    CHECK (kit_size IS NULL OR kit_size >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.product_variations ADD CONSTRAINT product_variations_min_order_quantity_positive
    CHECK (min_order_quantity IS NULL OR min_order_quantity >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Per-round overrides can target one variation
-- ---------------------------------------------------------------------------
-- A row with variation_id NULL keeps its old meaning — "this product, this
-- round" — and is the fallback for every variation of the product. A row with a
-- variation_id overrides just that strength.
ALTER TABLE public.group_buy_product_kits
  ADD COLUMN IF NOT EXISTS variation_id uuid REFERENCES public.product_variations(id) ON DELETE CASCADE;

-- One row per (round, product, variation). NULLS NOT DISTINCT so the
-- product-level row (variation_id NULL) is unique too, and so PostgREST's
-- on_conflict=group_buy_id,product_id,variation_id can upsert it.
ALTER TABLE public.group_buy_product_kits
  DROP CONSTRAINT IF EXISTS group_buy_product_kits_group_buy_id_product_id_key;

DO $$
BEGIN
  ALTER TABLE public.group_buy_product_kits ADD CONSTRAINT group_buy_product_kits_scope_key
    UNIQUE NULLS NOT DISTINCT (group_buy_id, product_id, variation_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS gb_prod_kits_var_idx ON public.group_buy_product_kits(variation_id);

-- ---------------------------------------------------------------------------
-- 3) The computed layer, re-keyed by variation
-- ---------------------------------------------------------------------------
-- The view depends on the functions whose signatures change, so it goes first.
DROP VIEW IF EXISTS public.group_buy_kit_status;
DROP FUNCTION IF EXISTS public.gb_kit_state(uuid, uuid);
DROP FUNCTION IF EXISTS public.gb_effective_kit_size(uuid, uuid);
DROP FUNCTION IF EXISTS public.gb_effective_moq(uuid, uuid);
DROP FUNCTION IF EXISTS public.gb_eligible_quantity(uuid, uuid);
DROP FUNCTION IF EXISTS public.gb_eligible_quantities(uuid);

-- Units ordered per (product, variation) in a round. A line whose variation_id
-- is missing or malformed counts toward the product itself (variation NULL).
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

-- Per customer per order, per variation. Returns 1 when unset (no minimum).
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

-- Kit size per ROUND TOTAL of one variation. NULL = not kit-tracked; it
-- propagates so the variation never enters Bunuan — do NOT default this to 1.
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

-- complete_kits = qty / size, in_progress = qty % size,
-- bunuan_needed = size - in_progress (0 when the last kit closed exactly).
-- The admin switches resolve variation row -> product row -> default.
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

-- One row per variation for products that have variations, and one row per
-- product (variation_id NULL) for products that do not. Aggregate quantities
-- only — no customer PII — so the storefront may read it.
CREATE VIEW public.group_buy_kit_status AS
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

GRANT SELECT ON public.group_buy_kit_status TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gb_eligible_quantities(uuid)                  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gb_eligible_quantity(uuid, uuid, uuid)        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gb_effective_moq(uuid, uuid, uuid)            TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gb_effective_kit_size(uuid, uuid, uuid)       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gb_kit_state(uuid, uuid, uuid)                TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Enforcement — place_group_buy_order checks each (product, variation)
-- ---------------------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION public.place_group_buy_order(jsonb, text, jsonb) TO anon, authenticated, service_role;

-- ============================================================================
-- VERIFY (run after applying):
--   -- One row per variation; 10mg is independent of 15mg:
--   select product_name, variation_name, kit_size, eligible_qty, in_progress, bunuan_needed
--     from group_buy_kit_status where group_buy_id = '<round>' order by 1, 2;
--   -- The eligibility oracle is still unreachable from the browser:
--   select has_function_privilege('anon',
--     'public.gb_is_bunuan_eligible_customer(uuid,text,text,text)', 'execute');  -- false
--
-- ROLLBACK: re-apply 20260922000002_kit_functions.sql and 20260922000003_place_order_rpc.sql
--   after `drop view group_buy_kit_status` and dropping the 3-arg functions; the
--   new columns are nullable and can stay.
-- ============================================================================
