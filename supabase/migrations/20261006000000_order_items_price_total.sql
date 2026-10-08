-- Orders placed through place_group_buy_order stored validate_and_price_order's
-- raw items, whose money fields are unit_price/line_total. Every reader of
-- orders (admin order details, Sales Analytics, Group Buy report) reads
-- price/total, so those orders crashed the admin order details page.
--
-- 1) The RPC now stores { ..., price, total } — the same shape the legacy
--    checkout insert always wrote. Its RETURN value is unchanged.
-- 2) Backfill orders already saved in the raw shape.

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
  v_items          jsonb;
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

  -- Store items in the shape every order reader uses (price/total), not the
  -- pricing RPC's unit_price/line_total; drop its pricing-time stock/available.
  SELECT jsonb_agg(
           (it - 'unit_price' - 'line_total' - 'stock' - 'available')
           || jsonb_build_object('price', it->'unit_price', 'total', it->'line_total')
           ORDER BY ord)
    INTO v_items
  FROM jsonb_array_elements(v_priced->'items') WITH ORDINALITY AS t(it, ord);

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
    v_items,
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

UPDATE public.orders o
SET order_items = (
  SELECT jsonb_agg(
           CASE WHEN it ? 'unit_price' AND NOT it ? 'price'
                THEN (it - 'unit_price' - 'line_total' - 'stock' - 'available')
                     || jsonb_build_object('price', it->'unit_price', 'total', it->'line_total')
                ELSE it
           END
           ORDER BY ord)
  FROM jsonb_array_elements(o.order_items) WITH ORDINALITY AS t(it, ord)
)
WHERE jsonb_typeof(o.order_items) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(o.order_items) it
    WHERE it ? 'unit_price' AND NOT it ? 'price'
  );
