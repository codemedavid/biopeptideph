-- ============================================================================
-- OPTIONAL HARDENING — makes the MOQ / Bunuan CONFIGURATION unwritable from the
-- browser. Read the "WHAT THIS BREAKS" section before applying: on its own this
-- file WILL break parts of the admin dashboard.
--
-- ─── THE PROBLEM ───────────────────────────────────────────────────────────
-- place_group_buy_order enforces MOQ and the Bunuan remainder correctly, and
-- db/orders_rls_moq.sql stops anyone inserting an order around it. But every
-- rule it enforces is READ FROM TABLES THE PUBLIC ANON KEY CAN STILL WRITE:
--
--   products.min_order_quantity   -> set it to 1 and the MOQ is gone
--   products.kit_size             -> change it and the Bunuan maths changes
--   group_buys.status             -> flip 'bunuan_open' to 'active' and the
--                                    Bunuan ceiling stops applying entirely
--   group_buy_product_kits.*      -> moq_override 1 / kit_size_override / the
--                                    bunuan_enabled and manually_completed flags
--
-- `products` has no RLS at all, and `group_buys` and `group_buy_product_kits`
-- carry deliberate "open write" policies, because THIS PROJECT RUNS ITS ADMIN
-- DASHBOARD ON THE ANON KEY (the dashboard is password-gated in the browser,
-- not in the database). Anything the dashboard can write, a visitor can write
-- with the same key straight against /rest/v1.
--
-- So: the rules cannot currently be bypassed by ordering cleverly, but they can
-- be bypassed by rewriting the rules first. That is a pre-existing property of
-- the admin architecture, not something the MOQ feature introduced — the same
-- key can already edit products.base_price, which validate_and_price_order then
-- treats as authoritative.
--
-- ─── WHAT THIS BREAKS ──────────────────────────────────────────────────────
-- Applying this file alone makes these admin actions fail:
--   * AdminDashboard product save        (min_order_quantity / kit_size fields)
--   * GroupBuyKitPanel overrides         (all four controls)
--   * GroupBuyManager phase picker       (group_buys.status)
--   * useGroupBuys create/update/delete round
-- Each one must first be moved behind the existing trusted admin API — the same
-- requireAdmin + service-role pattern already used by /api/admin/orders in
-- api/_lib/app.js, which bypasses RLS. Do that first, deploy, THEN apply this.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1) products: readable by everyone, writable by nobody holding the anon key ---
-- Enabling RLS with a read policy and no write policy is the least invasive
-- option: SELECT keeps working exactly as today (the storefront needs it), and
-- INSERT/UPDATE/DELETE stop. The service-role connection bypasses RLS, so the
-- admin API can still write.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products public read" ON public.products;
CREATE POLICY "products public read" ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "products open write" ON public.products;   -- if one was added by hand

-- Variations carry prices and stock, which validate_and_price_order also trusts.
ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_variations public read" ON public.product_variations;
CREATE POLICY "product_variations public read" ON public.product_variations FOR SELECT USING (true);
DROP POLICY IF EXISTS "product_variations open write" ON public.product_variations;

-- 2) group_buys: the PHASE is a rule, so it must not be client-writable --------
DROP POLICY IF EXISTS "group_buys open write" ON public.group_buys;
-- "group_buys public read" from 20260603000002 stays: the storefront banner,
-- the countdown and useGroupBuys all read it.

-- 3) group_buy_product_kits: per-round MOQ / kit overrides ---------------------
DROP POLICY IF EXISTS "gb_prod_kits open write" ON public.group_buy_product_kits;
-- "gb_prod_kits public read" stays: useKitStatus reads overrides to render
-- "8 / 10 filled" and to clamp the quantity picker.

-- 4) moq_presets: admin vocabulary, not per-order data ------------------------
DROP POLICY IF EXISTS "moq_presets open write" ON public.moq_presets;

-- ============================================================================
-- VERIFY (run after applying):
--
--   -- Every one of these must now FAIL for the anon key:
--   --   PATCH /rest/v1/products?id=eq.<id>   {"min_order_quantity": 1}
--   --   PATCH /rest/v1/group_buys?id=eq.<id> {"status": "active"}
--   --   POST  /rest/v1/group_buy_product_kits {"moq_override": 1, ...}
--   -- and these must still SUCCEED:
--   --   GET   /rest/v1/products?select=id,name,min_order_quantity,kit_size
--   --   GET   /rest/v1/group_buy_kit_status?group_buy_id=eq.<id>
--   --   a real checkout (place_group_buy_order is SECURITY DEFINER)
--
--   select c.relname, c.relrowsecurity,
--          (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public'
--      and c.relname in ('products','product_variations','group_buys',
--                        'group_buy_product_kits','moq_presets');
--
-- ROLLBACK (restores today's behaviour — admin dashboard works, config is
-- publicly writable again):
--   alter table public.products disable row level security;
--   alter table public.product_variations disable row level security;
--   create policy "group_buys open write" on public.group_buys
--     for all using (true) with check (true);
--   create policy "gb_prod_kits open write" on public.group_buy_product_kits
--     for all using (true) with check (true);
--   create policy "moq_presets open write" on public.moq_presets
--     for all using (true) with check (true);
-- ============================================================================
