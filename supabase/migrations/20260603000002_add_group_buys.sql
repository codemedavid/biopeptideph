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
