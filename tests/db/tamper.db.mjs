// Proves the config-tampering bypass is real, and that db/moq_config_lockdown.sql
// actually closes it without breaking the storefront or checkout.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pool } from './harness.mjs';
import * as H from './harness.mjs';

import { fileURLToPath } from 'node:url';
const REPO = fileURLToPath(new URL('../..', import.meta.url));
after(async () => { await pool.end(); });

const asAnon = async (fn) => {
  const c = await pool.connect();
  try { await c.query('set role anon'); return await fn(c); }
  finally { await c.query('reset role'); c.release(); }
};
const tryAnon = (sql, params) => asAnon(c => c.query(sql, params).then(() => 'allowed').catch(e => e.code));

async function scenario() {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Config', gb, moq: 5, kit: 10 });
  return { gb, p };
}

test('TAMPER — before the lockdown, anon rewrites the rules and walks past MOQ', async () => {
  await H.q(`grant usage on schema public to anon`);
  await H.q(`grant select, insert, update, delete on all tables in schema public to anon`);
  // Restore today's live posture (the ROLLBACK block of db/moq_config_lockdown.sql),
  // so this test measures the CURRENT deployment, not a previous test's lockdown.
  await H.q(`alter table public.products disable row level security`);
  await H.q(`alter table public.product_variations disable row level security`);
  await H.q(`drop policy if exists "group_buys open write" on public.group_buys`);
  await H.q(`create policy "group_buys open write" on public.group_buys for all using (true) with check (true)`);
  await H.q(`drop policy if exists "gb_prod_kits open write" on public.group_buy_product_kits`);
  await H.q(`create policy "gb_prod_kits open write" on public.group_buy_product_kits for all using (true) with check (true)`);
  const { gb, p } = await scenario();

  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }])).code, 'BELOW_MOQ',
    'baseline: MOQ 5 blocks a single vial');

  // …so lower the MOQ first, with the same public key the storefront uses.
  assert.equal(await tryAnon(`update products set min_order_quantity = 1 where id = $1`, [p.id]), 'allowed');
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }])).ok, true,
    'MOQ enforcement is only as trustworthy as the table it reads');

  // The same trick defeats the Bunuan ceiling: flip the round out of Bunuan.
  await H.q(`update products set min_order_quantity = 5 where id = $1`, [p.id]);
  await H.legacyOrder({ gb, name: 'X', email: 'x@e2e.test', phone: '09270000010', items: [{ product_id: p.id, quantity: 8 }] });
  await H.q(`update group_buys set status = 'bunuan_open' where id = $1`, [gb.id]);
  const who = { customer_name: 'X', customer_email: 'x@e2e.test', customer_phone: '09270000010' };
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 50 }], who)).code, 'BUNUAN_EXCEEDS_REMAINING');
  assert.equal(await tryAnon(`update group_buys set status = 'active' where id = $1`, [gb.id]), 'allowed');
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 50 }], who)).ok, true,
    'the Bunuan ceiling disappears with the phase, and the phase is public-writable');

  // …and the per-round override is a third way in.
  await H.q(`update group_buys set status = 'active' where id = $1`, [gb.id]);
  assert.equal(await tryAnon(
    `insert into group_buy_product_kits (group_buy_id, product_id, moq_override) values ($1,$2,1)`,
    [gb.id, p.id]), 'allowed');
});

test('LOCKDOWN — db/moq_config_lockdown.sql closes all three doors', async () => {
  const c = await pool.connect();
  try { await c.query(fs.readFileSync(`${REPO}db/moq_config_lockdown.sql`, 'utf8')); }
  finally { c.release(); }
  const { gb, p } = await scenario();

  // Under RLS an UPDATE with no matching policy is not an error — it simply
  // matches no rows. So "denied" is proved by the value being UNCHANGED, not by
  // an exception. (INSERT does raise 42501, because WITH CHECK rejects the row.)
  const changed = (sql, params) => asAnon(c2 => c2.query(sql, params).then(r => r.rowCount).catch(() => -1));

  assert.equal(await changed(`update products set min_order_quantity = 1 where id = $1`, [p.id]), 0);
  assert.equal(await changed(`update products set base_price = 0 where id = $1`, [p.id]), 0);
  assert.equal(await changed(`update group_buys set status = 'active' where id = $1`, [gb.id]), 0);
  assert.equal(await changed(`delete from group_buys where id = $1`, [gb.id]), 0);
  assert.equal(await changed(`delete from group_buy_product_kits where product_id = $1`, [p.id]), 0);

  // …and nothing actually moved.
  const after = (await H.q(`select min_order_quantity, base_price from products where id = $1`, [p.id])).rows[0];
  assert.equal(after.min_order_quantity, 5, 'MOQ must survive the tamper attempt');
  assert.equal(Number(after.base_price), 100, 'price must survive the tamper attempt');
  assert.equal((await H.q(`select status from group_buys where id = $1`, [gb.id])).rows[0].status, 'active');

  // Inserts are refused outright.
  assert.equal(await tryAnon(
    `insert into group_buy_product_kits (group_buy_id, product_id, moq_override) values ($1,$2,1)`,
    [gb.id, p.id]), '42501');
  assert.equal(await tryAnon(
    `insert into products (name, description, category, base_price) values ('x','x','research',1)`), '42501');

  // The rule the RPC reads is therefore the rule the admin set.
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }])).code, 'BELOW_MOQ');
});

test('LOCKDOWN — the storefront and checkout still work afterwards', async () => {
  const { gb, p } = await scenario();

  // Reads the storefront actually performs:
  const products = await asAnon(c => c.query(
    `select id, name, min_order_quantity, kit_size from products where id = $1`, [p.id]).then(r => r.rows));
  assert.equal(products.length, 1, 'catalogue must stay readable');
  const rounds = await asAnon(c => c.query(`select id, status from group_buys where id = $1`, [gb.id]).then(r => r.rows));
  assert.equal(rounds.length, 1, 'the round banner must stay readable');
  const kit = await asAnon(c => c.query(
    `select * from group_buy_kit_status where group_buy_id = $1`, [gb.id]).then(r => r.rows));
  assert.equal(kit.length, 1, '"8 / 10 filled" must stay readable');

  // And MOQ is now enforced against a key that can no longer edit the rules.
  const anonBelow = await asAnon(c => H.placeOrder([{ product_id: p.id, quantity: 1 }], {}, 'national', c));
  assert.equal(anonBelow.code, 'BELOW_MOQ');
  const anonOk = await asAnon(c => H.placeOrder([{ product_id: p.id, quantity: 5 }], {}, 'national', c));
  assert.equal(anonOk.ok, true, `${anonOk.code}: ${anonOk.message}`);
});
