-- MOQ + Kit Size, step 4 of 4: the enforcement point.
--
-- WHY THIS EXISTS
-- Until now the browser created orders itself:
--   supabase.from('orders').insert([row])
-- validate_and_price_order only ever RE-PRICED a cart; it never created the
-- order, so a modified client could simply skip it and insert anything. That is
-- fine for prices (the server total is written back) but fatal for MOQ and
-- Bunuan, which are rules about whether the order may exist at all.
--
-- place_group_buy_order moves creation into the database, so validation and
-- insertion happen in ONE transaction that a client cannot step around or
-- interleave with. Once db/orders_rls_moq.sql removes the blanket anon INSERT
-- policy, this function becomes the only way to create an order.
--
-- RACE SAFETY
-- Bunuan sells an exact remainder — often a single vial — so two customers
-- checking out simultaneously is the expected case, not a rare one. Each
-- (round, product) is guarded by a transaction-scoped advisory lock, and the
-- remaining quantity is recomputed from real orders INSIDE that lock. The
-- second transaction therefore sees the first one's row and is rejected.
-- Locks are taken in sorted product order so two multi-product carts can never
-- deadlock by grabbing the same pair in opposite order.
--
-- Idempotent: safe to run more than once.

CREATE OR REPLACE FUNCTION public.place_group_buy_order(
  p_items        jsonb,   -- [{product_id, variation_id, quantity}, ...]
  p_pricing_mode text,    -- 'national' | 'international'
  p_order        jsonb    -- customer, shipping, payment fields
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gb            group_buys%ROWTYPE;
  v_phase         text;
  v_bunuan        boolean := false;
  v_priced        jsonb;
  v_item          jsonb;
  v_product_id    uuid;
  v_qty           integer;
  v_moq           integer;
  v_state         record;
  v_name          text;
  v_email         text;
  v_phone         text;
  v_order_id      uuid := gen_random_uuid();
  v_subtotal      numeric := 0;
  v_shipping_fee  numeric;
  v_product_name  text;
  v_uuid_re       text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_order_seq     integer;
  v_order_code    text;
BEGIN
  -- ---------------------------------------------------------------------
  -- 1) Which round are we in? Derived server-side, never taken from the client.
  -- ---------------------------------------------------------------------
  -- The app already enforces one open round at a time (useGroupBuys.setStatus).
  -- ORDER BY created_at DESC is a tiebreak, not a policy: if two rounds were
  -- somehow left open, the newest wins deterministically instead of at random.
  SELECT * INTO v_gb
  FROM group_buys
  WHERE status IN ('active', 'bunuan_open')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_phase  := v_gb.status;
    v_bunuan := (v_phase = 'bunuan_open');
  ELSE
    -- NO ROUND IS OPEN — and that must NOT close the store.
    --
    -- Checkout has always accepted orders in the gap between the admin closing
    -- one round and opening the next, stamping them with the most recent round
    -- (src/utils/groupBuyAttribution.ts). That fallback exists because the old
    -- "only stamp while a round is active" rule silently lost 59 of 741 live
    -- orders, all of them in exactly this gap. Refusing the order here would
    -- not just re-break attribution, it would turn a recoverable mistake into
    -- lost revenue — so the gap keeps behaving as it does today.
    --
    -- Normal-ordering rules still apply in the gap: MOQ is a per-product rule
    -- and stays enforced. Only the Bunuan ceiling is round-scoped, and it is
    -- deliberately NOT applied when no round is in Bunuan.
    --
    -- With no rounds at all, v_gb stays NULL and the order is saved unattributed,
    -- exactly as it was before group_buys existed.
    SELECT * INTO v_gb FROM group_buys ORDER BY created_at DESC LIMIT 1;
    v_phase  := COALESCE(v_gb.status, 'none');
    v_bunuan := false;
  END IF;

  -- ---------------------------------------------------------------------
  -- 2) Re-price on the server. Reuses the existing RPC rather than repeating
  --    the discount/variation/per-GB-availability rules a second time.
  -- ---------------------------------------------------------------------
  v_priced := validate_and_price_order(p_items, p_pricing_mode);

  IF v_priced IS NULL OR jsonb_typeof(v_priced->'items') <> 'array'
     OR jsonb_array_length(v_priced->'items') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EMPTY_CART', 'message', 'Your cart is empty.');
  END IF;

  -- Availability and stock, before any of the new rules: an unavailable or
  -- oversold line is rejected exactly as the old checkout rejected it.
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

  -- ---------------------------------------------------------------------
  -- 3) Lock every product in the cart, in a deterministic order.
  -- ---------------------------------------------------------------------
  -- Sorting by product_id means two carts containing the same two products
  -- always acquire the locks in the same sequence, so they queue instead of
  -- deadlocking. The locks are transaction-scoped: they release on COMMIT or
  -- ROLLBACK, with no unlock call to forget.
  FOR v_product_id IN
    SELECT DISTINCT (it->>'product_id')::uuid
    FROM jsonb_array_elements(v_priced->'items') it
    WHERE (it->>'product_id') ~ v_uuid_re
    ORDER BY 1
  LOOP
    -- COALESCE keeps the key non-NULL when no round exists at all; a NULL key
    -- would make pg_advisory_xact_lock a silent no-op rather than a lock.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(COALESCE(v_gb.id::text, '-') || ':' || v_product_id::text, 0)
    );
  END LOOP;

  -- ---------------------------------------------------------------------
  -- 4) Bunuan: is this customer allowed in at all?
  -- ---------------------------------------------------------------------
  -- Checked once for the whole order, before the per-product rules, so an
  -- ineligible customer gets the access message rather than a confusing
  -- quantity error about the first product in their cart.
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

  -- ---------------------------------------------------------------------
  -- 5) Per-product rules, on the cart's TOTAL quantity for each product.
  -- ---------------------------------------------------------------------
  -- Quantities are summed per product first. A cart can hold the same product
  -- twice (two variations), and both MOQ and the Bunuan remainder are about the
  -- product, not the line — checking lines separately would let someone split
  -- 1 + 1 past a "max 1" Bunuan cap, or fail a legitimate 2 + 2 against MOQ 3.
  FOR v_product_id, v_qty, v_product_name IN
    SELECT (it->>'product_id')::uuid,
           SUM((it->>'quantity')::numeric)::integer,
           MIN(it->>'product_name')
    FROM jsonb_array_elements(v_priced->'items') it
    WHERE (it->>'product_id') ~ v_uuid_re
    GROUP BY 1
  LOOP
    IF NOT v_bunuan THEN
      -- Normal ordering (and the between-rounds gap): the MOQ is a floor.
      v_moq := gb_effective_moq(v_gb.id, v_product_id);

      IF v_qty < v_moq THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'BELOW_MOQ',
          'product_id', v_product_id,
          'required', v_moq,
          'ordered', v_qty,
          'short_by', v_moq - v_qty,
          'message', 'Minimum order for ' || v_product_name || ' is ' || v_moq ||
                     ' vials. Please add ' || (v_moq - v_qty) || ' more to continue.'
        );
      END IF;

    ELSE
      -- Bunuan: the MOQ is suspended and the kit shortfall becomes a ceiling.
      -- gb_kit_state is evaluated HERE, inside the advisory lock, so it already
      -- reflects any order a competing transaction committed a moment ago.
      SELECT * INTO v_state FROM gb_kit_state(v_gb.id, v_product_id);

      IF v_state.kit_size IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'NOT_IN_BUNUAN',
          'product_id', v_product_id,
          'message', v_product_name || ' is not part of this Bunuan round.'
        );
      END IF;

      IF v_state.bunuan_available <= 0 THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'BUNUAN_UNAVAILABLE',
          'product_id', v_product_id,
          'message', v_product_name || ' is already complete and is no longer available.'
        );
      END IF;

      IF v_qty > v_state.bunuan_available THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'BUNUAN_EXCEEDS_REMAINING',
          'product_id', v_product_id,
          'available', v_state.bunuan_available,
          'ordered', v_qty,
          'message', 'Only ' || v_state.bunuan_available || ' left to complete the ' ||
                     v_product_name || ' kit. Someone may have just ordered before you.'
        );
      END IF;
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------
  -- 6) Create the order.
  -- ---------------------------------------------------------------------
  -- Reached only when every rule passed. Still inside the same transaction and
  -- still holding the advisory locks, so the row a competing checkout will read
  -- is committed before its lock is released.
  --
  -- total_price stores the SERVER subtotal, matching what the old client insert
  -- wrote (shipping and admin fees stay separate columns, unchanged).
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
    -- Persist the SERVER-priced lines, never the client's copy.
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
    -- Attribution is the round we validated against, so an order can never be
    -- checked against one round and recorded against another.
    v_gb.id,
    v_gb.gb_number
  )
  -- The per-round order number (GB14-007) is allocated by the
  -- orders_assign_gb_order_seq trigger, which runs BEFORE this INSERT lands.
  -- Reading it back here is the only way the customer can be told it: the anon
  -- role may INSERT orders but not SELECT them.
  RETURNING gb_order_seq, gb_order_code INTO v_order_seq, v_order_code;

  -- `items` is returned so the confirmation screen and the WhatsApp summary can
  -- show the SERVER's prices without a second round-trip to re-price the cart.
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

GRANT EXECUTE ON FUNCTION public.place_group_buy_order(jsonb, text, jsonb) TO anon, authenticated;

-- ============================================================================
-- VERIFY (run after applying):
--   -- 1. Below MOQ must be refused even though this bypasses the UI entirely:
--   select place_group_buy_order(
--     '[{"product_id":"<uuid-with-moq-3>","quantity":1}]'::jsonb, 'national',
--     '{"customer_name":"Test","customer_email":"t@example.com","customer_phone":"09270000000"}'::jsonb
--   );   -- expect ok:false, code:BELOW_MOQ, short_by:2
--
--   -- 2. Race: in TWO psql sessions, against a product with 1 Bunuan slot left,
--   --    BEGIN both, call the function in both, then COMMIT both.
--   --    Exactly one returns ok:true; the other returns BUNUAN_EXCEEDS_REMAINING.
--
--   -- 3. A normal in-MOQ order still succeeds and lands with the round stamped
--   --    and numbered (gb_order_code looks like GB14-007):
--   select group_buy_id, group_buy_number, gb_order_code, total_price
--     from orders order by created_at desc limit 1;
--
-- ROLLBACK:
--   drop function if exists public.place_group_buy_order(jsonb, text, jsonb);
--   -- (Checkout falls back to the direct insert path, which still works until
--   --  db/orders_rls_moq.sql is applied.)
-- ============================================================================
