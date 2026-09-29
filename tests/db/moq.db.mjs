import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './harness.mjs';
import * as H from './harness.mjs';

before(async () => {
  const r = await H.q(`select count(*)::int n from group_buys`);
  console.log('pre-existing group_buys:', r.rows[0].n);
  await H.reset();
});
after(async () => { await pool.end(); });

test('TEST 1 — product with NO MOQ, kit size set: any quantity allowed', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'NoMoq', gb, moq: null, kit: 10 });
  for (const qty of [1, 2, 7]) {
    const res = await H.placeOrder([{ product_id: p.id, quantity: qty }]);
    assert.equal(res.ok, true, `qty ${qty}: ${res.code} ${res.message}`);
  }
  const st = await H.kitState(gb, p);
  assert.equal(st.eligible_qty, 10);
  assert.equal(st.is_complete, true);
});

test('TEST 2 — MOQ 3 enforced by the BACKEND regardless of UI', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Moq3', gb, moq: 3, kit: 10 });
  for (const qty of [1, 2]) {
    const res = await H.placeOrder([{ product_id: p.id, quantity: qty }]);
    assert.equal(res.ok, false, `qty ${qty} should be blocked`);
    assert.equal(res.code, 'BELOW_MOQ');
    assert.equal(res.short_by, 3 - qty);
  }
  for (const qty of [3, 4]) {
    const res = await H.placeOrder([{ product_id: p.id, quantity: qty }]);
    assert.equal(res.ok, true, `qty ${qty}: ${res.code}`);
  }
});

test('TEST 3 — different MOQ per product, error names the failing product', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const a = await H.seedProduct({ name: 'A', gb, moq: 3, kit: 10 });
  const b = await H.seedProduct({ name: 'B', gb, moq: 5, kit: 10 });
  let res = await H.placeOrder([
    { product_id: a.id, quantity: 3 },
    { product_id: b.id, quantity: 4 },
  ]);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'BELOW_MOQ');
  assert.equal(res.product_id, b.id, 'must blame product B, not A');
  assert.match(res.message, /E2E B/);
  res = await H.placeOrder([
    { product_id: a.id, quantity: 3 },
    { product_id: b.id, quantity: 5 },
  ]);
  assert.equal(res.ok, true, res.message);
});

test('TEST 4 — custom MOQ 7 (not a preset)', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Moq7', gb, moq: 7, kit: 10 });
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 6 }])).code, 'BELOW_MOQ');
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 7 }])).ok, true);
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 8 }])).ok, true);
});

test('TEST 5 — admin changes MOQ mid-round; next checkout uses the new value', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Mid', gb, moq: 3, kit: 10 });
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 3 }])).ok, true);
  await H.q(`update products set min_order_quantity = 5 where id = $1`, [p.id]);
  const res = await H.placeOrder([{ product_id: p.id, quantity: 3 }]);
  assert.equal(res.ok, false);
  assert.equal(res.required, 5);
  // per-round override beats the product default
  await H.q(`insert into group_buy_product_kits (group_buy_id, product_id, moq_override) values ($1,$2,2)`, [gb.id, p.id]);
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 2 }])).ok, true);
});

test('TEST 6 — kit arithmetic for every total in the brief', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Kit10', gb, kit: 10 });
  const expect = { 8: [0, 8, 2], 10: [1, 0, 0], 17: [1, 7, 3], 20: [2, 0, 0], 27: [2, 7, 3], 29: [2, 9, 1], 30: [3, 0, 0] };
  let placed = 0;
  for (const total of [8, 10, 17, 20, 27, 29, 30]) {
    if (total > placed) {
      await H.legacyOrder({ gb, name: 'Bulk', email: 'bulk@e2e.test', phone: '09270000009',
        items: [{ product_id: p.id, quantity: total - placed }] });
      placed = total;
    }
    const st = await H.kitState(gb, p);
    const [ck, ip, need] = expect[total];
    assert.equal(st.eligible_qty, total);
    assert.equal(st.complete_kits, ck, `total ${total} complete_kits`);
    assert.equal(st.in_progress, ip, `total ${total} in_progress`);
    assert.equal(st.bunuan_needed, need, `total ${total} bunuan_needed`);
    const v = (await H.viewRows(gb))[0];
    assert.equal(v.bunuan_needed, need, `admin view disagrees at total ${total}`);
  }
});

test('TEST 7 — Bunuan shows only incomplete kits', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const a = await H.seedProduct({ name: 'A 8of10', gb, kit: 10 });
  const b = await H.seedProduct({ name: 'B 10of10', gb, kit: 10 });
  const c = await H.seedProduct({ name: 'C 19of20', gb, kit: 20 });
  const d = await H.seedProduct({ name: 'D nokit', gb, kit: null });
  await H.legacyOrder({ gb, name: 'X', email: 'x@e2e.test', phone: '09270000010', items: [
    { product_id: a.id, quantity: 8 }, { product_id: b.id, quantity: 10 },
    { product_id: c.id, quantity: 19 }, { product_id: d.id, quantity: 4 }] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);
  const rows = await H.viewRows(gb);
  const sellable = rows.filter(r => r.kit_size !== null && r.bunuan_available > 0);
  assert.deepEqual(sellable.map(r => [r.product_name, r.bunuan_available]),
    [['E2E A 8of10', 2], ['E2E C 19of20', 1]]);
  assert.equal(rows.find(r => r.product_name === 'E2E B 10of10').is_complete, true);
  // and the no-kit product cannot be bought in Bunuan at all
  const res = await H.placeOrder([{ product_id: d.id, quantity: 1 }],
    { customer_name: 'X', customer_email: 'x@e2e.test', customer_phone: '09270000010' });
  assert.equal(res.code, 'NOT_IN_BUNUAN');
});

test('TEST 8 — Bunuan quantity ceiling enforced by the backend', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Cap', gb, moq: 3, kit: 10 });
  await H.legacyOrder({ gb, name: 'X', email: 'x@e2e.test', phone: '09270000010', items: [{ product_id: p.id, quantity: 8 }] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);
  const who = { customer_name: 'X', customer_email: 'x@e2e.test', customer_phone: '09270000010' };
  for (const qty of [3, 4, 99]) {
    const res = await H.placeOrder([{ product_id: p.id, quantity: qty }], who);
    assert.equal(res.ok, false, `qty ${qty} must be rejected`);
    assert.equal(res.code, 'BUNUAN_EXCEEDS_REMAINING');
    assert.equal(res.available, 2);
  }
  // MOQ 3 is suspended: 1 is allowed even though normal MOQ is 3
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], who)).ok, true);
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], who)).ok, true);
});

test('TEST 8b — cart-splitting cannot beat the cap', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Split', gb, kit: 10 });
  await H.legacyOrder({ gb, name: 'X', email: 'x@e2e.test', phone: '09270000010', items: [{ product_id: p.id, quantity: 9 }] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);
  const who = { customer_name: 'X', customer_email: 'x@e2e.test', customer_phone: '09270000010' };
  const res = await H.placeOrder([{ product_id: p.id, quantity: 1 }, { product_id: p.id, quantity: 1 }], who);
  assert.equal(res.ok, false, 'two lines of 1 must not slip past a cap of 1');
  assert.equal(res.code, 'BUNUAN_EXCEEDS_REMAINING');
});

test('TEST 9 — Bunuan eligibility is scoped to THIS round', async () => {
  await H.reset();
  const old = await H.seedRound({ status: 'closed', title: 'E2E Old' });
  const gb = await H.seedRound({ status: 'active', title: 'E2E New' });
  const pOld = await H.seedProduct({ name: 'OldP', gb: old, kit: 10 });
  const p = await H.seedProduct({ name: 'NewP', gb, kit: 10 });
  // A joined this round
  await H.legacyOrder({ gb, name: 'Alice Cruz', email: 'alice@e2e.test', phone: '0927 111 1111',
    items: [{ product_id: p.id, quantity: 8 }] });
  // C joined only the previous round
  await H.legacyOrder({ gb: old, name: 'Carol Reyes', email: 'carol@e2e.test', phone: '09273333333',
    items: [{ product_id: pOld.id, quantity: 5 }] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);

  const A = { customer_name: 'alice  cruz', customer_email: 'ALICE@e2e.test', customer_phone: '+639271111111' };
  const B = { customer_name: 'Bob New', customer_email: 'bob@e2e.test', customer_phone: '09272222222' };
  const C = { customer_name: 'Carol Reyes', customer_email: 'carol@e2e.test', customer_phone: '09273333333' };

  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], A)).ok, true, 'A must be allowed');
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], B)).code, 'BUNUAN_NOT_ELIGIBLE');
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], C)).code, 'BUNUAN_NOT_ELIGIBLE');
  // admin grant lets a named customer in
  await H.q(`insert into group_buy_bunuan_grants (group_buy_id, customer_email) values ($1,'bob@e2e.test')`, [gb.id]);
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], B)).ok, true, 'grant must work');
});

test('TEST 10/11 — dead orders never count and never grant access', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Dead', gb, kit: 10 });
  const dead = [
    ['cancelled', 'pending'], ['canceled', 'pending'], ['refunded', 'pending'],
    ['expired', 'pending'], ['new', 'failed'], ['new', 'refunded'],
  ];
  for (const [os, ps] of dead) {
    await H.legacyOrder({ gb, name: `Zed ${os}${ps}`, email: `zed.${os}.${ps}@e2e.test`, phone: '09279999999',
      items: [{ product_id: p.id, quantity: 4 }], order_status: os, payment_status: ps });
  }
  assert.equal((await H.kitState(gb, p)).eligible_qty, 0, 'dead orders must not count');
  await H.legacyOrder({ gb, name: 'Live One', email: 'live@e2e.test', phone: '09278888888',
    items: [{ product_id: p.id, quantity: 8 }], order_status: 'delivered', payment_status: 'paid' });
  assert.equal((await H.kitState(gb, p)).eligible_qty, 8);
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);
  const cancelledGuy = { customer_name: 'Zed cancelledpending', customer_email: 'zed.cancelled.pending@e2e.test', customer_phone: '09279999999' };
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], cancelledGuy)).code, 'BUNUAN_NOT_ELIGIBLE',
    'a cancelled order must not buy Bunuan access');
});

test('TEST 12 — payment pending counts (documented rule) and cancelling releases the slot', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Pend', gb, kit: 10 });
  const o = await H.legacyOrder({ gb, name: 'P', email: 'p@e2e.test', phone: '09271111112',
    items: [{ product_id: p.id, quantity: 10 }], payment_status: 'pending' });
  assert.equal((await H.kitState(gb, p)).is_complete, true);
  await H.q(`update orders set order_status='cancelled' where id=$1`, [o.id]);
  const st = await H.kitState(gb, p);
  assert.equal(st.eligible_qty, 0);
  assert.equal(st.bunuan_needed, 0, 'an empty kit is not "short" — nothing was started');
});

test('TEST 13 — Bunuan completes and then closes itself', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Fill', gb, kit: 10 });
  await H.legacyOrder({ gb, name: 'X', email: 'x@e2e.test', phone: '09270000010', items: [{ product_id: p.id, quantity: 8 }] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);
  const who = { customer_name: 'X', customer_email: 'x@e2e.test', customer_phone: '09270000010' };
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], who)).ok, true);
  assert.equal((await H.kitState(gb, p)).bunuan_available, 1);
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], who)).ok, true);
  const st = await H.kitState(gb, p);
  assert.equal(st.eligible_qty, 10);
  assert.equal(st.bunuan_available, 0);
  assert.equal(st.is_complete, true);
  const res = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who);
  assert.equal(res.code, 'BUNUAN_UNAVAILABLE', 'must not sell an 11th vial');
  assert.equal((await H.viewRows(gb)).filter(r => r.bunuan_available > 0).length, 0);
});

test('TEST 16 — admin closes Bunuan mid-checkout', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  // MOQ 3 with 8 of a 10-kit already committed: 2 left in Bunuan.
  const p = await H.seedProduct({ name: 'Closing', gb, moq: 3, kit: 10 });
  await H.legacyOrder({ gb, name: 'X', email: 'x@e2e.test', phone: '09270000010', items: [{ product_id: p.id, quantity: 8 }] });
  const who = { customer_name: 'X', customer_email: 'x@e2e.test', customer_phone: '09270000010' };
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);
  // The customer put 1 vial in the cart while Bunuan was open...
  // ...and the admin closes Bunuan before they finish.
  await H.q(`update group_buys set status='bunuan_closed' where id=$1`, [gb.id]);
  const res = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who);
  // The Bunuan quantity of 1 is no longer a Bunuan quantity: normal MOQ applies
  // again, so the stale cart is refused. The store itself stays open.
  assert.equal(res.ok, false, 'a stale Bunuan cart must not go through');
  assert.equal(res.code, 'BELOW_MOQ');
  assert.equal(res.required, 3);
  // ...and the Bunuan CEILING is gone with the phase: a normal order is fine.
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 5 }], who)).ok, true);
});

test('TEST 16b — a no-MOQ product after Bunuan closes behaves exactly as it did before the feature', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'bunuan_closed' });
  const p = await H.seedProduct({ name: 'FreeAfterClose', gb, moq: null, kit: 10 });
  const res = await H.placeOrder([{ product_id: p.id, quantity: 1 }]);
  assert.equal(res.ok, true, 'closing a round must not close the shop');
  assert.equal(res.group_buy_id, gb.id, 'and the order is still attributed');
});

test('TEST 17 — admin changes kit size after orders exist', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Resize', gb, kit: 10 });
  await H.legacyOrder({ gb, name: 'X', email: 'x@e2e.test', phone: '09270000010', items: [{ product_id: p.id, quantity: 8 }] });
  assert.equal((await H.kitState(gb, p)).bunuan_needed, 2);
  await H.q(`update products set kit_size = 12 where id=$1`, [p.id]);
  assert.equal((await H.kitState(gb, p)).bunuan_needed, 4, 'must recompute, not keep a stale 2');
  await H.q(`update products set kit_size = 8 where id=$1`, [p.id]);
  const st = await H.kitState(gb, p);
  assert.equal(st.complete_kits, 1);
  assert.equal(st.bunuan_needed, 0);
});

test('TEST 18 — MOQ greater than kit size', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'MoqBig', gb, moq: 10, kit: 5 });
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 5 }])).code, 'BELOW_MOQ');
  const res = await H.placeOrder([{ product_id: p.id, quantity: 10 }]);
  assert.equal(res.ok, true, res.message);
  const st = await H.kitState(gb, p);
  assert.equal(st.complete_kits, 2);
  assert.equal(st.bunuan_needed, 0, 'MOQ 10 into kit 5 always lands exactly on a kit boundary');
});

test('EXTRA — admin overrides: disable Bunuan, mark done, reopen', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Ovr', gb, kit: 10 });
  await H.legacyOrder({ gb, name: 'X', email: 'x@e2e.test', phone: '09270000010', items: [{ product_id: p.id, quantity: 8 }] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);
  const who = { customer_name: 'X', customer_email: 'x@e2e.test', customer_phone: '09270000010' };
  await H.q(`insert into group_buy_product_kits (group_buy_id, product_id, bunuan_enabled) values ($1,$2,false)`, [gb.id, p.id]);
  let st = await H.kitState(gb, p);
  assert.equal(st.bunuan_needed, 2, 'still short by 2');
  assert.equal(st.bunuan_available, 0, 'but not sellable');
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], who)).code, 'BUNUAN_UNAVAILABLE');
  await H.q(`update group_buy_product_kits set bunuan_enabled=true, manually_completed=true where product_id=$1`, [p.id]);
  assert.equal((await H.kitState(gb, p)).is_complete, true);
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], who)).code, 'BUNUAN_UNAVAILABLE');
  await H.q(`update group_buy_product_kits set manually_completed=false where product_id=$1`, [p.id]);
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], who)).ok, true, 'reopen must work');
});
