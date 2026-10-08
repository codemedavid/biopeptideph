// Stored order_items shape — supabase/migrations/20261006000000_order_items_price_total.sql
//
// place_group_buy_order used to store validate_and_price_order's raw output,
// whose money fields are unit_price/line_total. Every reader of orders
// (admin order details, Sales Analytics, the Group Buy report) reads
// price/total, so 28 live orders opened to a blank admin page.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './harness.mjs';
import * as H from './harness.mjs';

after(async () => { await pool.end(); });

const storedItems = async (id) => {
  const r = await H.q('select order_items from orders where id = $1', [id]);
  return r.rows[0].order_items;
};

test('an RPC order stores price and total on every item', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Shape Plain', gb, price: 250 });
  const pv = await H.seedProduct({ name: 'Shape Var', gb, price: 999 });
  const v = await H.seedVariation({ p: pv, name: '15mg', price: 543.63 });

  const res = await H.placeOrder([
    { product_id: p.id, quantity: 3 },
    { product_id: pv.id, variation_id: v.id, quantity: 2 },
  ], { customer_email: 'shape@e2e.test' });
  assert.ok(res.ok, JSON.stringify(res));

  const items = await storedItems(res.order_id);
  assert.equal(items.length, 2);
  const plain = items.find((it) => it.product_id === p.id);
  const varied = items.find((it) => it.product_id === pv.id);

  assert.equal(plain.price, 250);
  assert.equal(plain.total, 750);
  assert.equal(varied.price, 543.63);
  assert.equal(varied.total, 1087.26);
});

test('stored item totals add up to the order total_price', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Shape Sum', gb, price: 120.5 });

  const res = await H.placeOrder([{ product_id: p.id, quantity: 4 }], { customer_email: 'sum@e2e.test' });
  assert.ok(res.ok, JSON.stringify(res));

  const r = await H.q('select order_items, total_price from orders where id = $1', [res.order_id]);
  const sum = r.rows[0].order_items.reduce((s, it) => s + Number(it.total), 0);
  assert.equal(sum, Number(r.rows[0].total_price));
});
