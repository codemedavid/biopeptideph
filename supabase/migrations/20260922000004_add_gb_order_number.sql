-- Per-round order numbers: GB14-001, GB14-002, ...
--
-- WHY THIS EXISTS
-- An order's only identifier was its UUID. The WhatsApp confirmation printed it
-- in full ("ORDER ID: 5f0c8a31-..."), which nobody can read out over chat or
-- quote in a follow-up, and the supplier report fell back to the first 8 hex
-- characters. A counter scoped to the round gives every order a short number
-- that a customer can say out loud and that sorts in arrival order.
--
--   orders.gb_order_seq          the number. Unique within a round.
--   orders.gb_order_code         the printable form. GENERATED, so it can never
--                                drift from the round the row is attributed to.
--   group_buys.order_seq_counter the allocator: how many numbers this round has
--                                ever handed out.
--
-- Orders with no round (no group_buy_id) get no number. That is the pre-
-- group_buys case only: checkout attributes every order to the current round,
-- or to the most recent one when none is open.
--
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1) Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gb_order_seq integer;

-- group_buy_number is the round snapshot already stored on the row (text since
-- 20260613000000_gb_number_to_text). Deriving the code from it rather than from
-- group_buys keeps the expression immutable, which a STORED generated column
-- requires, and keeps the printed code consistent with the badge the admin sees.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gb_order_code text
  GENERATED ALWAYS AS (
    CASE
      WHEN group_buy_number IS NULL OR gb_order_seq IS NULL THEN NULL
      ELSE 'GB' || group_buy_number || '-' || lpad(gb_order_seq::text, 3, '0')
    END
  ) STORED;

-- The allocator lives on the round, not in MAX(orders.gb_order_seq), because a
-- maximum walks BACKWARDS when the newest order is deleted and would hand the
-- next customer a number that is already on somebody else's receipt. A counter
-- only ever goes up.
ALTER TABLE public.group_buys
  ADD COLUMN IF NOT EXISTS order_seq_counter integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.gb_order_seq IS
  'Per-round order number, 1-based. Allocated by assign_gb_order_seq(); never reused.';
COMMENT ON COLUMN public.orders.gb_order_code IS
  'Printable per-round order number, e.g. GB14-007. Derived from group_buy_number + gb_order_seq.';
COMMENT ON COLUMN public.group_buys.order_seq_counter IS
  'Highest order number handed out in this round. Monotonic — deletes do not give it back.';

-- ---------------------------------------------------------------------------
-- 2) Backfill existing history, oldest first within each round
-- ---------------------------------------------------------------------------
-- Ordered by created_at so the numbers match the sequence the orders actually
-- arrived in; id breaks ties so a re-run cannot shuffle two same-timestamp rows.
-- Only unnumbered rows are touched, and each round continues from its own
-- current maximum, so running this twice adds nothing and renumbers nothing.
WITH base AS (
  SELECT group_buy_id, COALESCE(MAX(gb_order_seq), 0) AS max_seq
  FROM public.orders
  WHERE group_buy_id IS NOT NULL
  GROUP BY group_buy_id
), numbered AS (
  SELECT o.id,
         b.max_seq + row_number() OVER (PARTITION BY o.group_buy_id ORDER BY o.created_at, o.id) AS n
  FROM public.orders o
  JOIN base b ON b.group_buy_id = o.group_buy_id
  WHERE o.group_buy_id IS NOT NULL
    AND o.gb_order_seq IS NULL
)
UPDATE public.orders o
   SET gb_order_seq = numbered.n
  FROM numbered
 WHERE o.id = numbered.id;

-- Start each round's counter above everything it has already issued, so the
-- first order placed after this migration continues the history instead of
-- colliding with it. GREATEST keeps a re-run from winding a counter back.
UPDATE public.group_buys g
   SET order_seq_counter = GREATEST(g.order_seq_counter, s.max_seq)
  FROM (
    SELECT group_buy_id, MAX(gb_order_seq) AS max_seq
    FROM public.orders
    WHERE group_buy_id IS NOT NULL AND gb_order_seq IS NOT NULL
    GROUP BY group_buy_id
  ) s
 WHERE s.group_buy_id = g.id
   AND g.order_seq_counter < s.max_seq;

-- ---------------------------------------------------------------------------
-- 3) Uniqueness
-- ---------------------------------------------------------------------------
-- The backstop, not the mechanism: the counter below serialises allocation, and
-- this index is what turns any future bug in it into a refused write instead of
-- two customers quoting the same order number.
CREATE UNIQUE INDEX IF NOT EXISTS orders_group_buy_seq_key
  ON public.orders (group_buy_id, gb_order_seq)
  WHERE group_buy_id IS NOT NULL AND gb_order_seq IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Allocation
-- ---------------------------------------------------------------------------
-- A trigger rather than logic inside place_group_buy_order, because that RPC is
-- not the only writer: the admin reassigns orders between rounds (api/_lib/db.js
-- bulkAssignGroupBuy / updateOrder), and checkout still has a legacy direct
-- insert path for the window before the MOQ migrations are applied. Every one
-- of those paths has to produce a correct number, so the rule lives on the table.
--
-- SECURITY DEFINER because the public anon role may INSERT into orders but may
-- neither SELECT them nor UPDATE group_buys (db/orders_rls_moq.sql,
-- db/moq_config_lockdown.sql). The allocation has to run with the owner's rights
-- or every customer would be handed number 1.
CREATE OR REPLACE FUNCTION public.assign_gb_order_seq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- An ordinary edit (status, payment, notes) must not renumber anything.
  IF TG_OP = 'UPDATE' AND NEW.group_buy_id IS NOT DISTINCT FROM OLD.group_buy_id THEN
    RETURN NEW;
  END IF;

  -- Unattributed: no round, no number. gb_order_code follows automatically.
  IF NEW.group_buy_id IS NULL THEN
    NEW.gb_order_seq := NULL;
    RETURN NEW;
  END IF;

  -- Bump and take, in one statement. The UPDATE holds a row lock on the round
  -- until this transaction ends, so two checkouts landing in the same round at
  -- the same moment queue here and read different numbers; without that the
  -- unique index above would turn the slower one into a failed order.
  UPDATE public.group_buys
     SET order_seq_counter = order_seq_counter + 1
   WHERE id = NEW.group_buy_id
  RETURNING order_seq_counter INTO NEW.gb_order_seq;

  -- The round row is gone (a delete racing this insert, or an order pointing at
  -- a round that never existed). Fall back to the highest number the round's
  -- surviving orders show, so the write still succeeds with a plausible number
  -- rather than failing checkout over a bookkeeping column.
  IF NOT FOUND THEN
    SELECT COALESCE(MAX(gb_order_seq), 0) + 1
      INTO NEW.gb_order_seq
      FROM public.orders
     WHERE group_buy_id = NEW.group_buy_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_assign_gb_order_seq ON public.orders;
CREATE TRIGGER orders_assign_gb_order_seq
  BEFORE INSERT OR UPDATE OF group_buy_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_gb_order_seq();

-- ============================================================================
-- VERIFY (run after applying):
--   -- 1. Every attributed order has a code, and no round has issued fewer
--   --    numbers than it has orders:
--   select g.gb_number, count(o.*) as orders, g.order_seq_counter
--     from group_buys g left join orders o on o.group_buy_id = g.id
--    group by g.id, g.gb_number, g.order_seq_counter order by 1;
--
--   -- 2. No duplicates (the index makes this impossible; check anyway):
--   select group_buy_id, gb_order_seq, count(*) from orders
--    where group_buy_id is not null group by 1,2 having count(*) > 1;
--
--   -- 3. A new order continues the round rather than restarting it:
--   select gb_order_code from orders order by created_at desc limit 1;
--
-- NOTE ON GAPS
--   Numbers are never reused. Deleting an order, or reassigning it to another
--   round (where it is given a NEW number at the end of the destination), leaves
--   a hole that is not backfilled. That is deliberate: a number already quoted
--   to a customer must never turn up on somebody else's order.
--
-- ROLLBACK:
--   drop trigger if exists orders_assign_gb_order_seq on public.orders;
--   drop function if exists public.assign_gb_order_seq();
--   drop index if exists public.orders_group_buy_seq_key;
--   alter table public.orders drop column if exists gb_order_code;
--   alter table public.orders drop column if exists gb_order_seq;
--   alter table public.group_buys drop column if exists order_seq_counter;
-- ============================================================================
