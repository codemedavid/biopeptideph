-- MOQ + Kit Size, step 3 of 4: the computed layer. READ-ONLY.
--
-- This migration adds no columns and changes no behaviour. It defines, once,
-- every number the feature depends on, so no rule is ever reimplemented
-- somewhere else and allowed to drift:
--
--   gb_order_counts_toward_kit()      which orders count at all
--   gb_eligible_quantities()          qty per product in a round  (one pass)
--   gb_eligible_quantity()            the same, for one product
--   gb_effective_moq()                per-round override ?? product default
--   gb_effective_kit_size()           per-round override ?? product default
--   gb_kit_state()                    complete kits / in-progress / shortfall
--   gb_is_bunuan_eligible_customer()  may this person buy in Bunuan?
--   group_buy_kit_status (view)       the admin audit table
--
-- Apply this and read from it BEFORE turning on enforcement — the numbers can be
-- checked against a real round while checkout still behaves exactly as today.
-- Idempotent: safe to run more than once.

-- --------------------------------------------------------------------------
-- 0) Identity normalisation
-- --------------------------------------------------------------------------
-- There are no customer accounts, so Bunuan eligibility compares the name,
-- email and phone typed at checkout against those on an earlier order. All
-- three must match, which puts the entire burden on normalising both sides the
-- same way. These are IMMUTABLE and used on both sides of every comparison.

-- Lowercase + trim. Nothing exotic: an email is already a single token.
CREATE OR REPLACE FUNCTION public.gb_norm_email(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(btrim(COALESCE(p, '')));
$$;

-- Digits only, then reduce to the national subscriber number so that
-- "0927 382 3893", "+639273823893" and "639273823893" all compare equal.
-- Keeping the last 10 digits is what makes those three forms converge.
CREATE OR REPLACE FUNCTION public.gb_norm_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
           WHEN length(d) >= 10 THEN right(d, 10)
           ELSE d
         END
  FROM (SELECT regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g') AS d) s;
$$;

-- Lowercase, strip accents, drop punctuation, collapse whitespace.
-- translate() is used instead of the `unaccent` extension so this migration has
-- no extension prerequisite (unaccent is not enabled on this project).
CREATE OR REPLACE FUNCTION public.gb_norm_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(
           regexp_replace(
             translate(
               lower(COALESCE(p, '')),
               'áàâäãåéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ',
               'aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC'
             ),
             '[^a-z0-9 ]', '', 'g'          -- drop punctuation: "Ma." -> "ma"
           ),
           '\s+', ' ', 'g'                   -- collapse runs of whitespace
         ));
$$;

-- --------------------------------------------------------------------------
-- 1) Which orders count toward a kit — THE single rule
-- --------------------------------------------------------------------------
-- This project has TWO independent free-text status columns, not one enum:
--   order_status    new | confirmed | processing | shipped | delivered | cancelled
--   payment_status  pending | paid | failed
--
-- An unpaid `pending` order DOES count. A Group Buy is a preorder: people commit
-- first and pay after, and the supplier quantity is sized against commitments.
-- This matches countsAsPlaced() in src/utils/groupBuyReport.ts, which already
-- sizes the supplier report this way — so kit totals and the report agree.
--
-- Only genuinely dead orders are excluded. 'canceled' (one l) is included
-- because the existing report helper already tolerates both spellings, and
-- neither column has a CHECK constraint to prevent either from being written.
CREATE OR REPLACE FUNCTION public.gb_order_counts_toward_kit(
  p_order_status text,
  p_payment_status text
)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(COALESCE(p_order_status, ''))   NOT IN ('cancelled', 'canceled', 'refunded', 'expired')
     AND lower(COALESCE(p_payment_status, '')) NOT IN ('failed', 'refunded');
$$;

-- --------------------------------------------------------------------------
-- 2) Eligible quantity per product in a round
-- --------------------------------------------------------------------------
-- order_items is denormalised JSONB, so the total is derived by expanding it.
-- Quantities are summed across ALL VARIATIONS of a product: a kit is counted in
-- vials of (say) Tirzepatide, not per mg variant. If a round ever needs kits
-- tracked per variation, this is the one function that would change.
--
-- Defensive throughout, because order_items is unconstrained JSONB written by
-- the client: non-array payloads, missing product_id, non-uuid product_id and
-- non-numeric quantity are all skipped rather than raising.
CREATE OR REPLACE FUNCTION public.gb_eligible_quantities(p_group_buy_id uuid)
RETURNS TABLE (product_id uuid, quantity integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (li->>'product_id')::uuid AS product_id,
         SUM((li->>'quantity')::numeric)::integer AS quantity
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(o.order_items) = 'array' THEN o.order_items ELSE '[]'::jsonb END
  ) AS li
  WHERE o.group_buy_id = p_group_buy_id
    AND gb_order_counts_toward_kit(o.order_status, o.payment_status)
    AND (li->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND (li->>'quantity')   ~ '^[0-9]+(\.[0-9]+)?$'
  GROUP BY 1;
$$;

-- One product's total. Delegates to the set-returning version above so the
-- summing rule exists in exactly one place.
CREATE OR REPLACE FUNCTION public.gb_eligible_quantity(p_group_buy_id uuid, p_product_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT q.quantity FROM gb_eligible_quantities(p_group_buy_id) q WHERE q.product_id = p_product_id),
    0
  );
$$;

-- --------------------------------------------------------------------------
-- 3) Effective rules: per-round override wins, else the product default
-- --------------------------------------------------------------------------
-- MOQ is per CUSTOMER per order. Returns 1 when unset, so callers can always
-- compare `quantity >= moq` without a null branch (1 means "no minimum").
CREATE OR REPLACE FUNCTION public.gb_effective_moq(p_group_buy_id uuid, p_product_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(1, COALESCE(
    (SELECT k.moq_override FROM group_buy_product_kits k
      WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id),
    (SELECT p.min_order_quantity FROM products p WHERE p.id = p_product_id),
    1
  ));
$$;

-- Kit size is per ROUND TOTAL. NULL means the product is not kit-tracked, and a
-- null propagates so it never enters Bunuan — do NOT default this to 1.
CREATE OR REPLACE FUNCTION public.gb_effective_kit_size(p_group_buy_id uuid, p_product_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT k.kit_size_override FROM group_buy_product_kits k
      WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id),
    (SELECT p.kit_size FROM products p WHERE p.id = p_product_id)
  );
$$;

-- --------------------------------------------------------------------------
-- 4) Kit state — the arithmetic, in one place
-- --------------------------------------------------------------------------
--   complete_kits    = qty / kit_size          (whole kits already filled)
--   in_progress      = qty % kit_size          (units in the unfinished kit)
--   bunuan_needed    = kit_size - in_progress  (0 when in_progress is 0)
--   bunuan_available = bunuan_needed, unless an admin switched it off
--
-- Worked example from the brief: kit_size 10, qty 27
--   complete_kits 2, in_progress 7, bunuan_needed 3.
--
-- bunuan_needed and bunuan_available are reported separately on purpose: the
-- admin audit view can then show "short by 3, but Bunuan is disabled", which a
-- single collapsed number would hide.
CREATE OR REPLACE FUNCTION public.gb_kit_state(p_group_buy_id uuid, p_product_id uuid)
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
    SELECT gb_effective_kit_size(p_group_buy_id, p_product_id) AS ks,
           gb_eligible_quantity (p_group_buy_id, p_product_id) AS qty,
           COALESCE((SELECT k.bunuan_enabled     FROM group_buy_product_kits k
                      WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id), true)  AS enabled,
           COALESCE((SELECT k.manually_completed FROM group_buy_product_kits k
                      WHERE k.group_buy_id = p_group_buy_id AND k.product_id = p_product_id), false) AS forced_complete
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
    -- Remainder 0 means the last kit closed exactly: nothing is needed.
    CASE WHEN ks IS NULL OR in_progress = 0 THEN 0 ELSE ks - in_progress END AS bunuan_needed,
    CASE WHEN ks IS NULL OR in_progress = 0 OR forced_complete OR NOT enabled
         THEN 0 ELSE ks - in_progress END                                    AS bunuan_available,
    -- Not kit-tracked counts as complete: it is never owed anything.
    (ks IS NULL OR in_progress = 0 OR forced_complete)                       AS is_complete
  FROM calc;
$$;

-- --------------------------------------------------------------------------
-- 5) Bunuan customer eligibility
-- --------------------------------------------------------------------------
-- Bunuan is only for customers who already joined THIS round. Eligibility is
-- scoped to p_group_buy_id, so an order in a previous round never qualifies.
--
-- Name AND email AND phone must all match an earlier counting order in the same
-- round (all three normalised on both sides). The admin grant table is the
-- escape hatch for a customer whose name genuinely differs between orders.
--
-- SECURITY DEFINER so it can read `orders`, which anon cannot select. It returns
-- only a boolean, so it leaks nothing about who else ordered — and it is
-- deliberately not callable with a wildcard: all three fields are required.
CREATE OR REPLACE FUNCTION public.gb_is_bunuan_eligible_customer(
  p_group_buy_id uuid,
  p_name  text,
  p_email text,
  p_phone text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    -- Blank identity never qualifies, regardless of what is in the tables.
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
$$;

-- --------------------------------------------------------------------------
-- 6) Admin audit view (Feature 14)
-- --------------------------------------------------------------------------
-- One row per (round, product) so an admin can see exactly WHY a product is
-- asking for N more units, instead of being handed a bare number to trust.
CREATE OR REPLACE VIEW public.group_buy_kit_status AS
SELECT
  g.id          AS group_buy_id,
  g.gb_number,
  g.status      AS group_buy_status,
  p.id          AS product_id,
  p.name        AS product_name,
  p.image_url,
  gb_effective_moq(g.id, p.id) AS effective_moq,
  s.kit_size,
  s.eligible_qty,
  s.complete_kits,
  s.in_progress,
  s.bunuan_needed,
  s.bunuan_available,
  s.is_complete
FROM products p
JOIN group_buys g ON g.id = p.group_buy_id
CROSS JOIN LATERAL gb_kit_state(g.id, p.id) s;

-- The view exposes only aggregate quantities — no customer PII — so the
-- storefront may read it to render "8 / 10 filled".
GRANT SELECT ON public.group_buy_kit_status TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gb_norm_email(text)                            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gb_norm_phone(text)                            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gb_norm_name(text)                             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gb_order_counts_toward_kit(text, text)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gb_eligible_quantities(uuid)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gb_eligible_quantity(uuid, uuid)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gb_effective_moq(uuid, uuid)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gb_effective_kit_size(uuid, uuid)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gb_kit_state(uuid, uuid)                       TO anon, authenticated;

-- gb_is_bunuan_eligible_customer must NOT be reachable from the browser: it
-- would be a free "did this exact person join this round?" oracle, letting
-- anyone confirm a name + email + phone combination one guess at a time.
--
-- Simply omitting it from the GRANTs above is NOT enough. PostgreSQL grants
-- EXECUTE on every new function to PUBLIC by default, and anon is a member of
-- PUBLIC — so "not granted" still means "callable". It has to be revoked, and
-- revoked from PUBLIC specifically; revoking from anon alone leaves the
-- inherited PUBLIC grant in place. Verified by test: before this REVOKE, anon
-- could call it directly through PostgREST.
--
-- place_group_buy_order is SECURITY DEFINER and runs as its owner, so it keeps
-- calling this function normally.
REVOKE ALL ON FUNCTION public.gb_is_bunuan_eligible_customer(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gb_is_bunuan_eligible_customer(uuid, text, text, text) FROM anon, authenticated;

-- ============================================================================
-- VERIFY (run after applying — all read-only):
--   -- Does the audit table agree with what you know about the current round?
--   select product_name, kit_size, eligible_qty, complete_kits,
--          in_progress, bunuan_needed
--     from group_buy_kit_status
--    where group_buy_id = (select id from group_buys where status = 'active')
--    order by product_name;
--
--   -- Arithmetic spot-check from the brief: 27 ordered, kit size 10
--   --   -> complete_kits 2, in_progress 7, bunuan_needed 3
--
--   -- Phone normalisation: all three must return the same 10 digits
--   select gb_norm_phone('0927 382 3893'), gb_norm_phone('+639273823893'),
--          gb_norm_phone('639273823893');
--
--   -- Name normalisation: both must return 'ma teresa cruz'
--   select gb_norm_name('Ma. Teresa Cruz'), gb_norm_name('  MA TERESA  CRUZ ');
--
-- ROLLBACK:
--   drop view if exists public.group_buy_kit_status;
--   drop function if exists public.gb_is_bunuan_eligible_customer(uuid,text,text,text);
--   drop function if exists public.gb_kit_state(uuid,uuid);
--   drop function if exists public.gb_effective_kit_size(uuid,uuid);
--   drop function if exists public.gb_effective_moq(uuid,uuid);
--   drop function if exists public.gb_eligible_quantity(uuid,uuid);
--   drop function if exists public.gb_eligible_quantities(uuid);
--   drop function if exists public.gb_order_counts_toward_kit(text,text);
--   drop function if exists public.gb_norm_name(text);
--   drop function if exists public.gb_norm_phone(text);
--   drop function if exists public.gb_norm_email(text);
-- ============================================================================
