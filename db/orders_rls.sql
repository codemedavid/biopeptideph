-- ============================================================================
-- PII lockdown: enable RLS on `orders` and `assessment_responses` so the public
-- anon key can only INSERT (checkout / assessment submit) and can NO LONGER read,
-- update, or delete. Every admin READ/UPDATE/DELETE goes through the trusted
-- Express API (api/index.js), which uses the service-role DB connection and
-- bypasses RLS.
--
-- ⚠️ SEQUENCING — apply this ONLY AFTER:
--   1. DATABASE_URL is the Supabase *pooler* string (so the admin API can reach PG)
--   2. the new app code is DEPLOYED (admin order/assessment reads now go through
--      /api/admin/*, and Checkout inserts without reading the row back)
--   Applying it before the deploy will break the admin order views AND checkout.
--
-- Idempotent: safe to re-run. Run in the Supabase SQL editor or via psql.
-- ============================================================================

-- 1) orders -------------------------------------------------------------------
alter table public.orders enable row level security;

-- Public (anon + signed-in) may create an order at checkout...
drop policy if exists "orders public insert" on public.orders;
create policy "orders public insert"
  on public.orders
  for insert
  to anon, authenticated
  with check (true);

-- ...and NOTHING else. No SELECT/UPDATE/DELETE policy => anon is denied those.
-- (The service-role connection used by the Express admin API bypasses RLS.)
drop policy if exists "orders anon read"  on public.orders;  -- belt & suspenders
drop policy if exists "Anyone can read orders" on public.orders;

-- 2) assessment_responses -----------------------------------------------------
alter table public.assessment_responses enable row level security;

-- The pre-existing "Admins can view assessments" policy was actually
-- `USING (true)` — i.e. it let ANYONE read every submission. Remove it.
drop policy if exists "Admins can view assessments" on public.assessment_responses;

-- Public may submit an assessment, nothing else. Admin reads go through the API.
drop policy if exists "Public can submit assessments" on public.assessment_responses;
drop policy if exists "assessment public insert" on public.assessment_responses;
create policy "assessment public insert"
  on public.assessment_responses
  for insert
  to anon, authenticated
  with check (true);

-- ============================================================================
-- VERIFY (run after applying):
--   -- Both should now show rowsecurity = true:
--   select relname, relrowsecurity from pg_class
--     where relname in ('orders','assessment_responses');
--   -- As the anon key (e.g. curl the REST API) a GET on orders must return []:
--   --   curl "$SUPABASE_URL/rest/v1/orders?select=id" -H "apikey: $ANON" -H "authorization: Bearer $ANON"
--   -- The admin dashboard (via /api/admin/orders) must still list every order.
--   -- A real checkout must still create an order.
--
-- ROLLBACK (only if something breaks and you must restore the old open behavior):
--   alter table public.orders disable row level security;
--   alter table public.assessment_responses disable row level security;
-- ============================================================================
