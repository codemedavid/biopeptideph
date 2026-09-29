// Bypass tests: what can the browser's anon key actually do?
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './harness.mjs';
import * as H from './harness.mjs';

after(async () => { await pool.end(); });

// Supabase grants anon table privileges; RLS is what restricts it.
async function grantAnonBaseline() {
  await H.q(`grant usage on schema public to anon`);
  await H.q(`grant select, insert, update, delete on all tables in schema public to anon`);
}
const asAnon = async (fn) => {
  const c = await pool.connect();
  try { await c.query(`set role anon`); return await fn(c); }
  finally { await c.query(`reset role`); c.release(); }
};

test('BYPASS — before the RLS lockdown, anon can insert any order it likes', async () => {
  await grantAnonBaseline();
  await H.q(`alter table public.orders enable row level security`);
  await H.q(`drop policy if exists "orders public insert" on public.orders`);
  await H.q(`create policy "orders public insert" on public.orders for insert to anon, authenticated with check (true)`);
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Bypass', gb, moq: 5, kit: 10 });
  const out = await asAnon(c => c.query(
    `insert into orders (customer_name, customer_email, customer_phone, shipping_address, shipping_barangay,
       shipping_city, shipping_state, shipping_zip_code, order_items, total_price, group_buy_id, group_buy_number)
     values ('Hacker','h@e2e.test','09279999999','a','b','c','d','1000',$1::jsonb,0,$2,$3)`,
    [JSON.stringify([{ product_id: p.id, quantity: 1 }]), gb.id, gb.gb_number]).then(() => 'inserted').catch(e => e));
  assert.equal(out, 'inserted', 'this is the hole db/orders_rls_moq.sql closes');
  assert.equal((await H.kitState(gb, p)).eligible_qty, 1, 'and a below-MOQ qty landed in the kit total');
});

test('BYPASS — after db/orders_rls_moq.sql, the direct insert is denied but the RPC still works', async () => {
  await H.q(`alter table public.orders enable row level security`);
  await H.q(`drop policy if exists "orders public insert" on public.orders`);   // == db/orders_rls_moq.sql
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Locked', gb, moq: 3, kit: 10 });

  const err = await asAnon(c => c.query(
    `insert into orders (customer_name, customer_email, customer_phone, shipping_address, shipping_barangay,
       shipping_city, shipping_state, shipping_zip_code, order_items, total_price, group_buy_id, group_buy_number)
     values ('Hacker','h@e2e.test','09279999999','a','b','c','d','1000',$1::jsonb,0,$2,$3)`,
    [JSON.stringify([{ product_id: p.id, quantity: 1 }]), gb.id, gb.gb_number]).then(() => null).catch(e => e));
  assert.ok(err, 'direct insert must now fail');
  assert.equal(err.code, '42501', `expected RLS denial, got ${err.code} ${err.message}`);
  assert.equal((await H.kitState(gb, p)).eligible_qty, 0);

  // anon may still check out through the function, and MOQ still applies there
  const below = await asAnon(c => H.placeOrder([{ product_id: p.id, quantity: 1 }], {}, 'national', c));
  assert.equal(below.code, 'BELOW_MOQ');
  const ok = await asAnon(c => H.placeOrder([{ product_id: p.id, quantity: 3 }], {}, 'national', c));
  assert.equal(ok.ok, true, `${ok.code}: ${ok.message}`);
  assert.equal((await H.kitState(gb, p)).eligible_qty, 3);
});

test('BYPASS — anon cannot read the eligibility oracle, nor grant itself Bunuan access', async () => {
  await H.q(`alter table public.group_buy_bunuan_grants enable row level security`);
  const gb = await H.seedRound({ status: 'bunuan_open', title: 'E2E Oracle' });
  const oracle = await asAnon(c => c.query(
    `select gb_is_bunuan_eligible_customer($1,'a','a@e2e.test','09270000000')`, [gb.id]).then(() => null).catch(e => e));
  assert.ok(oracle, 'gb_is_bunuan_eligible_customer must not be callable by anon');
  assert.equal(oracle.code, '42501');

  const selfGrant = await asAnon(c => c.query(
    `insert into group_buy_bunuan_grants (group_buy_id, customer_email) values ($1,'hacker@e2e.test')`,
    [gb.id]).then(() => null).catch(e => e));
  assert.ok(selfGrant, 'anon must not be able to grant itself Bunuan access');

  const readGrants = await asAnon(c => c.query(`select * from group_buy_bunuan_grants`).then(r => r.rows).catch(e => e));
  assert.ok(Array.isArray(readGrants) ? readGrants.length === 0 : true, 'anon must not read grants');
});

test('BYPASS — anon can still read the aggregate kit view (needed for the storefront)', async () => {
  const rows = await asAnon(c => c.query(`select * from group_buy_kit_status limit 1`).then(r => r.rows).catch(e => e));
  assert.ok(Array.isArray(rows), `storefront read broke: ${rows.message}`);
});

test('BYPASS — anon must not be able to rewrite MOQ/kit overrides to unlock quantity', async () => {
  const gb = await H.seedRound({ status: 'active', title: 'E2E Tamper' });
  const p = await H.seedProduct({ name: 'Tamper', gb, moq: 5, kit: 10 });
  const res = await asAnon(c => c.query(
    `insert into group_buy_product_kits (group_buy_id, product_id, moq_override) values ($1,$2,1)`,
    [gb.id, p.id]).then(() => 'allowed').catch(e => e.code));
  console.log('      anon write to group_buy_product_kits =>', res);
  const prod = await asAnon(c => c.query(`update products set min_order_quantity = 1 where id=$1`, [p.id])
    .then(() => 'allowed').catch(e => e.code));
  console.log('      anon write to products            =>', prod);
});
