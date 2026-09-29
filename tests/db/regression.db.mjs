// Regression watch: behaviour that worked BEFORE the MOQ feature must still work.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './harness.mjs';
import * as H from './harness.mjs';

after(async () => { await pool.end(); });

test('REGRESSION — an order placed between rounds must still be accepted and attributed', async () => {
  await H.reset();
  // Two rounds exist; neither is open. This is the gap the admin creates while
  // closing GB #1 and preparing GB #2 — the exact window that silently lost
  // 59 of 741 live orders before groupBuyAttribution.ts was added.
  const older = await H.seedRound({ status: 'completed', title: 'E2E Older' });
  const newer = await H.seedRound({ status: 'closed', title: 'E2E Newer' });
  const p = await H.seedProduct({ name: 'Gap', gb: newer, moq: null, kit: null });

  const res = await H.placeOrder([{ product_id: p.id, quantity: 1 }]);
  assert.equal(res.ok, true, `order refused between rounds: ${res.code} — ${res.message}`);
  assert.equal(res.group_buy_id, newer.id, 'must attribute to the most recent round, never null');
});

test('REGRESSION — a draft-only round must not shut the store', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'upcoming', title: 'E2E Draft' });
  const p = await H.seedProduct({ name: 'Draft', gb, moq: null, kit: null });
  const res = await H.placeOrder([{ product_id: p.id, quantity: 2 }]);
  assert.equal(res.ok, true, `order refused while the next round is a draft: ${res.code}`);
});

test('REGRESSION — MOQ still applies between rounds (it is a per-product rule)', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'closed', title: 'E2E ClosedMoq' });
  const p = await H.seedProduct({ name: 'ClosedMoq', gb, moq: 3, kit: 10 });
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }])).code, 'BELOW_MOQ');
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 3 }])).ok, true);
});

test('REGRESSION — Bunuan caps do NOT leak into the between-rounds phase', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'closed', title: 'E2E NoCap' });
  const p = await H.seedProduct({ name: 'NoCap', gb, kit: 10 });
  await H.legacyOrder({ gb, name: 'S', email: 's@e2e.test', phone: '09270000000',
    items: [{ product_id: p.id, quantity: 8 }] });
  // 2 short of a kit, but the round is not in Bunuan: normal ordering rules apply,
  // so a customer may still order any quantity.
  const res = await H.placeOrder([{ product_id: p.id, quantity: 5 }]);
  assert.equal(res.ok, true, `${res.code}: ${res.message}`);
  assert.equal((await H.kitState(gb, p)).eligible_qty, 13);
});

test('REGRESSION — with NO rounds at all the store still takes orders', async () => {
  await H.reset();
  await H.q(`delete from group_buys`);
  const r = await H.q(
    `insert into products (name, description, category, base_price, national_price, stock_quantity, available)
     values ('E2E Orphan','E2E','research',100,100,100,true) returning *`);
  const p = r.rows[0];
  const res = await H.placeOrder([{ product_id: p.id, quantity: 1 }]);
  assert.equal(res.ok, true, `order refused with no rounds: ${res.code} — ${res.message}`);
  assert.equal(res.group_buy_id, null);
});
