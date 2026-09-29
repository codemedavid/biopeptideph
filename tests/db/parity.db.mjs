// SQL <-> TypeScript parity. The UI and the database must agree, or a customer
// sees "you may buy 2" and the server says no.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './harness.mjs';
import * as H from './harness.mjs';
import * as K from '../../src/lib/kitRules.ts';

after(async () => { await pool.end(); });

test('PARITY — normalisation agrees on every awkward input', async () => {
  const names = ['Ma. Teresa Cruz', '  MA TERESA  CRUZ ', 'José Ángel Peña', "O'Brien-Smith", 'Ñoño  Ü', '', '   ', '123 ABC'];
  const phones = ['0927 382 3893', '+639273823893', '639273823893', '9273823893', '(0927) 382-3893', '123', '', '+1 (555) 010-9999'];
  const emails = ['  A@B.COM ', 'x@y.z', ''];
  for (const n of names) {
    const sql = (await H.q('select gb_norm_name($1) v', [n])).rows[0].v;
    assert.equal(K.normalizeName(n), sql, `name ${JSON.stringify(n)}`);
  }
  for (const p of phones) {
    const sql = (await H.q('select gb_norm_phone($1) v', [p])).rows[0].v;
    assert.equal(K.normalizePhone(p), sql, `phone ${JSON.stringify(p)}`);
  }
  for (const e of emails) {
    const sql = (await H.q('select gb_norm_email($1) v', [e])).rows[0].v;
    assert.equal(K.normalizeEmail(e), sql, `email ${JSON.stringify(e)}`);
  }
});

test('PARITY — countsTowardKit agrees on every status pair', async () => {
  const os = ['new', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'canceled', 'refunded', 'expired', 'CANCELLED', '', null];
  const ps = ['pending', 'paid', 'failed', 'refunded', 'PAID', '', null];
  for (const a of os) for (const b of ps) {
    const sql = (await H.q('select gb_order_counts_toward_kit($1,$2) v', [a, b])).rows[0].v;
    assert.equal(K.countsTowardKit(a, b), sql, `${a} / ${b}`);
  }
});

test('PARITY — kit arithmetic agrees for a large matrix, via REAL orders', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const kitSizes = [null, 1, 3, 5, 10, 12, 20];
  for (const ks of kitSizes) {
    const p = await H.seedProduct({ name: `KS${ks}`, gb, kit: ks });
    for (const qty of [0, 1, 2, 7, 8, 9, 10, 11, 17, 19, 20, 24, 27, 29, 30, 31]) {
      await H.q(`delete from orders where customer_email = 'matrix@e2e.test'`);
      if (qty > 0) {
        await H.legacyOrder({ gb, name: 'M', email: 'matrix@e2e.test', phone: '09270000000',
          items: [{ product_id: p.id, quantity: qty }] });
      }
      for (const [enabled, done] of [[true, false], [false, false], [true, true]]) {
        await H.q(`insert into group_buy_product_kits (group_buy_id, product_id, bunuan_enabled, manually_completed)
                   values ($1,$2,$3,$4)
                   on conflict (group_buy_id, product_id) do update set bunuan_enabled=$3, manually_completed=$4`,
          [gb.id, p.id, enabled, done]);
        const sql = (await H.kitState(gb, p));
        const ts = K.computeKitState({ kitSize: ks, eligibleQty: qty, bunuanEnabled: enabled, manuallyCompleted: done });
        const label = `kit=${ks} qty=${qty} enabled=${enabled} done=${done}`;
        assert.equal(ts.eligibleQty, sql.eligible_qty, `${label} eligibleQty`);
        assert.equal(ts.completeKits, sql.complete_kits, `${label} completeKits`);
        assert.equal(ts.inProgress, sql.in_progress, `${label} inProgress`);
        assert.equal(ts.bunuanNeeded, sql.bunuan_needed, `${label} bunuanNeeded`);
        assert.equal(ts.bunuanAvailable, sql.bunuan_available, `${label} bunuanAvailable`);
        assert.equal(ts.isComplete, sql.is_complete, `${label} isComplete`);
        assert.equal(ts.kitSize, sql.kit_size, `${label} kitSize`);
      }
    }
  }
});

test('PARITY — effective MOQ agrees, including overrides', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  for (const moq of [null, 1, 2, 3, 5, 7, 10]) {
    const p = await H.seedProduct({ name: `MOQ${moq}`, gb, moq });
    for (const ovr of [null, 1, 2, 4]) {
      await H.q(`insert into group_buy_product_kits (group_buy_id, product_id, moq_override) values ($1,$2,$3)
                 on conflict (group_buy_id, product_id) do update set moq_override=$3`, [gb.id, p.id, ovr]);
      const sql = (await H.q('select gb_effective_moq($1,$2) v', [gb.id, p.id])).rows[0].v;
      assert.equal(K.effectiveMoq(moq, ovr), sql, `moq=${moq} override=${ovr}`);
    }
  }
});

test('PARITY — the UI verdict matches the RPC verdict for the same cart', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Verdict', gb, moq: 3, kit: 10 });
  for (const qty of [1, 2, 3, 4]) {
    const ui = K.validateCartLine({ productId: p.id, productName: 'E2E Verdict', quantity: qty, moq: 3,
      kitState: K.computeKitState({ kitSize: 10, eligibleQty: 0 }) }, 'active');
    const api = await H.placeOrder([{ product_id: p.id, quantity: qty }]);
    assert.equal(ui.ok, api.ok === true, `qty ${qty}: UI ${ui.ok} vs API ${api.ok}`);
    if (!ui.ok) assert.equal(ui.issue, api.code, `qty ${qty} code`);
    if (api.ok) await H.q(`delete from orders where id = $1`, [api.order_id]);
  }
  await H.legacyOrder({ gb, name: 'X', email: 'x@e2e.test', phone: '09270000010', items: [{ product_id: p.id, quantity: 8 }] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);
  const who = { customer_name: 'X', customer_email: 'x@e2e.test', customer_phone: '09270000010' };
  const state = K.computeKitState({ kitSize: 10, eligibleQty: 8 });
  assert.equal(K.maxQuantityFor(state, 'bunuan_open'), 2);
  assert.equal(K.minQuantityFor(3, 'bunuan_open'), 1, 'MOQ must not floor the picker in Bunuan');
  for (const qty of [1, 2, 3]) {
    const ui = K.validateCartLine({ productId: p.id, productName: 'E2E Verdict', quantity: qty, moq: 3, kitState: state }, 'bunuan_open');
    const api = await H.placeOrder([{ product_id: p.id, quantity: qty }], who);
    assert.equal(ui.ok, api.ok === true, `bunuan qty ${qty}: UI ${ui.ok} vs API ${api.ok}`);
    if (!ui.ok) assert.equal(ui.issue, api.code, `bunuan qty ${qty} code: UI ${ui.issue} vs API ${api.code}`);
    if (api.ok) await H.q(`delete from orders where id = $1`, [api.order_id]);
  }
});

test('TEST 15 — stale cart: the ceiling is re-read, not remembered', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Stale', gb, kit: 10 });
  await H.legacyOrder({ gb, name: 'A', email: 'a@e2e.test', phone: '09271111111', items: [{ product_id: p.id, quantity: 8 }] });
  await H.legacyOrder({ gb, name: 'B', email: 'b@e2e.test', phone: '09272222222', items: [] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);

  const snapshotA = K.computeKitState({ kitSize: 10, eligibleQty: 8 });
  assert.equal(K.maxQuantityFor(snapshotA, 'bunuan_open'), 2);

  const b = await H.placeOrder([{ product_id: p.id, quantity: 1 }],
    { customer_name: 'B', customer_email: 'b@e2e.test', customer_phone: '09272222222' });
  assert.equal(b.ok, true, b.message);

  const res = await H.placeOrder([{ product_id: p.id, quantity: 2 }],
    { customer_name: 'A', customer_email: 'a@e2e.test', customer_phone: '09271111111' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'BUNUAN_EXCEEDS_REMAINING');
  assert.equal(res.available, 1);
  assert.match(res.message, /Only 1 left/);

  const fresh = (await H.kitState(gb, p));
  assert.equal(K.computeKitState({ kitSize: fresh.kit_size, eligibleQty: fresh.eligible_qty }).bunuanAvailable, 1);
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }],
    { customer_name: 'A', customer_email: 'a@e2e.test', customer_phone: '09271111111' })).ok, true);
});
