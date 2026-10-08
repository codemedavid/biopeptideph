-- ===========================================================================
-- group_buy_kit_status: count each round's orders ONCE, not once per row
-- ===========================================================================
-- The previous view called gb_kit_state() per (product, variation), and each
-- call re-aggregated every order in the round via gb_eligible_quantities().
-- GB15 (201 rows) took ~4s, past anon's 3s statement_timeout, so the storefront
-- got an error, kept an empty list and showed "All kits are complete" during
-- Bunuan.
--
-- Same columns, same arithmetic as gb_kit_state (which checkout still uses for
-- its single-row, in-lock check). Only the evaluation strategy changes: the
-- order quantities are aggregated once per round and joined in.
-- ===========================================================================

CREATE OR REPLACE VIEW public.group_buy_kit_status AS
WITH kit_rows AS (
  SELECT
    g.id        AS group_buy_id,
    g.gb_number,
    g.status    AS group_buy_status,
    p.id        AS product_id,
    p.name      AS product_name,
    p.image_url,
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
),
-- MATERIALIZED so the aggregation runs once per round rather than being
-- re-evaluated for every kit row it is joined against.
round_qty AS MATERIALIZED (
  SELECT g.id AS group_buy_id, q.product_id, q.variation_id, q.quantity
  FROM group_buys g
  CROSS JOIN LATERAL gb_eligible_quantities(g.id) q
  WHERE EXISTS (SELECT 1 FROM products p WHERE p.group_buy_id = g.id)
),
cfg AS (
  SELECT
    r.*,
    gb_effective_kit_size(r.group_buy_id, r.product_id, r.variation_id) AS ks,
    COALESCE(q.quantity, 0)                                            AS qty,
    COALESCE(kv.bunuan_enabled,     kp.bunuan_enabled,     true)       AS enabled,
    COALESCE(kv.manually_completed, kp.manually_completed, false)      AS forced_complete
  FROM kit_rows r
  LEFT JOIN round_qty q
         ON q.group_buy_id = r.group_buy_id
        AND q.product_id   = r.product_id
        AND q.variation_id IS NOT DISTINCT FROM r.variation_id
  LEFT JOIN group_buy_product_kits kv
         ON kv.group_buy_id = r.group_buy_id
        AND kv.product_id   = r.product_id
        AND kv.variation_id IS NOT DISTINCT FROM r.variation_id
  LEFT JOIN group_buy_product_kits kp
         ON kp.group_buy_id = r.group_buy_id
        AND kp.product_id   = r.product_id
        AND kp.variation_id IS NULL
),
calc AS (
  SELECT
    c.*,
    CASE WHEN c.ks IS NULL THEN 0 ELSE c.qty / c.ks END AS complete_kits,
    CASE WHEN c.ks IS NULL THEN 0 ELSE c.qty % c.ks END AS in_progress
  FROM cfg c
)
SELECT
  group_buy_id,
  gb_number,
  group_buy_status,
  product_id,
  product_name,
  image_url,
  gb_effective_moq(group_buy_id, product_id, variation_id) AS effective_moq,
  ks  AS kit_size,
  qty AS eligible_qty,
  complete_kits,
  in_progress,
  CASE WHEN ks IS NULL OR in_progress = 0 THEN 0 ELSE ks - in_progress END AS bunuan_needed,
  CASE WHEN ks IS NULL OR in_progress = 0 OR forced_complete OR NOT enabled
       THEN 0 ELSE ks - in_progress END                                    AS bunuan_available,
  (ks IS NULL OR in_progress = 0 OR forced_complete)                       AS is_complete,
  variation_id,
  variation_name
FROM calc;
