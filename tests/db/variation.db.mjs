// Kits and MOQ per VARIATION (migration 20260930000000_kits_per_variation.sql).
//
// Each strength of a product fills its own kits and carries its own minimum:
// 48 × Tirzepatide 15mg must leave 2 for Bunuan whatever 5mg and 10mg sold.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './harness.mjs';
import * as H from './harness.mjs';

after(async () => { await pool.end(); });

const who = (n) => ({ customer_name: `V${n}`, customer_email: `v${n}@e2e.test`, customer_phone: `0927100${String(n).padStart(4, '0')}` });

async function tirzRound({ kit = 10, moq = null, status = 'active' } = {}) {
  await H.reset();
  const gb = await H.seedRound({ status });
  const p = await H.seedProduct({ name: 'Tirz', gb, kit, moq });
  const v5 = await H.seedVariation({ p, name: '5mg' });
  const v10 = await H.seedVariation({ p, name: '10mg' });
  const v15 = await H.seedVariation({ p, name: '15mg' });
  return { gb, p, v5, v10, v15 };
}

test('VAR (a) — each strength fills its own kit: 48×15mg needs 2, 7×5mg needs 3, 10mg untouched', async () => {
  const { gb, p, v5, v10, v15 } = await tirzRound({ kit: 10 });
  await H.legacyOrder({ gb, name: 'A', email: 'a@e2e.test', phone: '09270000011',
    items: [{ product_id: p.id, variation_id: v15.id, quantity: 48 }, { product_id: p.id, variation_id: v5.id, quantity: 7 }] });

  const s15 = await H.kitState(gb, p, v15);
  const s5 = await H.kitState(gb, p, v5);
  const s10 = await H.kitState(gb, p, v10);
  assert.equal(s15.eligible_qty, 48);
  assert.equal(s15.complete_kits, 4);
  assert.equal(s15.bunuan_available, 2);
  assert.equal(s5.bunuan_available, 3);
  assert.equal(s10.eligible_qty, 0, '10mg must not absorb the other strengths');

  const rows = await H.viewRows(gb);
  assert.equal(rows.length, 3, 'one view row per variation');
  const byName = Object.fromEntries(rows.map((r) => [r.variation_name, r]));
  assert.equal(byName['15mg'].bunuan_needed, 2);
  assert.equal(byName['5mg'].bunuan_needed, 3);
  assert.equal(byName['10mg'].eligible_qty, 0);
});

test('VAR (b) — a variation kit size beats the product default', async () => {
  const { gb, p, v10 } = await tirzRound({ kit: 10 });
  const v15 = await H.seedVariation({ p, name: '15mg-small-kit', kit: 5 });
  await H.legacyOrder({ gb, name: 'A', email: 'a@e2e.test', phone: '09270000011',
    items: [{ product_id: p.id, variation_id: v15.id, quantity: 7 }, { product_id: p.id, variation_id: v10.id, quantity: 7 }] });

  assert.equal((await H.kitState(gb, p, v15)).kit_size, 5);
  assert.equal((await H.kitState(gb, p, v15)).bunuan_needed, 3);
  assert.equal((await H.kitState(gb, p, v10)).kit_size, 10, 'others keep the product default');

  // A round override for one variation beats its own default too.
  await H.q(`insert into group_buy_product_kits (group_buy_id, product_id, variation_id, kit_size_override)
             values ($1,$2,$3,8)`, [gb.id, p.id, v15.id]);
  assert.equal((await H.kitState(gb, p, v15)).kit_size, 8);
  assert.equal((await H.kitState(gb, p, v10)).kit_size, 10);
});

test('VAR (c) — MOQ is per variation: 1×5mg + 2×15mg refused, 3×15mg accepted', async () => {
  const { p, v5, v15 } = await tirzRound({ kit: 10, moq: 3 });

  let res = await H.placeOrder([
    { product_id: p.id, variation_id: v5.id, quantity: 1 },
    { product_id: p.id, variation_id: v15.id, quantity: 2 },
  ]);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'BELOW_MOQ');
  assert.ok([v5.id, v15.id].includes(res.variation_id), 'the error names the failing strength');
  assert.match(res.message, /E2E Tirz (5mg|15mg)/);

  res = await H.placeOrder([{ product_id: p.id, variation_id: v15.id, quantity: 3 }]);
  assert.equal(res.ok, true, res.message);
});

test('VAR (c2) — a variation MOQ overrides the product MOQ', async () => {
  const { p } = await tirzRound({ kit: 10, moq: 3 });
  const v2 = await H.seedVariation({ p, name: '2mg', moq: 1 });
  const res = await H.placeOrder([{ product_id: p.id, variation_id: v2.id, quantity: 1 }]);
  assert.equal(res.ok, true, res.message);
});

test('VAR (d) — Bunuan race on one strength still has exactly one winner', async () => {
  for (let round = 0; round < 10; round++) {
    const { gb, p, v15 } = await tirzRound({ kit: 10 });
    await H.legacyOrder({ gb, name: 'Seed', email: 'seed@e2e.test', phone: '09270000000',
      items: [{ product_id: p.id, variation_id: v15.id, quantity: 9 }] });
    for (let i = 0; i < 5; i++) {
      const w = who(i);
      await H.legacyOrder({ gb, name: w.customer_name, email: w.customer_email, phone: w.customer_phone, items: [] });
    }
    await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);

    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      H.placeOrder([{ product_id: p.id, variation_id: v15.id, quantity: 1 }], who(i))));
    const wins = results.filter((r) => r.ok).length;
    assert.equal(wins, 1, `round ${round}: ${wins} winners ${JSON.stringify(results.map((r) => r.code || 'ok'))}`);
    assert.equal((await H.kitState(gb, p, v15)).eligible_qty, 10);
  }
});

test('VAR (d2) — Bunuan on 15mg does not cap 5mg', async () => {
  const { gb, p, v5, v15 } = await tirzRound({ kit: 10 });
  await H.legacyOrder({ gb, name: 'Seed', email: 'seed@e2e.test', phone: '09270000000',
    items: [{ product_id: p.id, variation_id: v15.id, quantity: 9 }, { product_id: p.id, variation_id: v5.id, quantity: 6 }] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);
  const seed = { customer_name: 'Seed', customer_email: 'seed@e2e.test', customer_phone: '09270000000' };

  const tooMany = await H.placeOrder([{ product_id: p.id, variation_id: v15.id, quantity: 2 }], seed);
  assert.equal(tooMany.code, 'BUNUAN_EXCEEDS_REMAINING');
  assert.equal(tooMany.available, 1);

  const ok = await H.placeOrder([{ product_id: p.id, variation_id: v5.id, quantity: 4 }], seed);
  assert.equal(ok.ok, true, ok.message);
});

test('VAR (e) — an old product-level round override still applies to every variation', async () => {
  const { gb, p, v5, v15 } = await tirzRound({ kit: 10, moq: 5 });
  await H.q(`insert into group_buy_product_kits (group_buy_id, product_id, moq_override, kit_size_override, bunuan_enabled)
             values ($1,$2,2,4,false)`, [gb.id, p.id]);

  for (const v of [v5, v15]) {
    const st = await H.kitState(gb, p, v);
    assert.equal(st.kit_size, 4, `${v.name} inherits the product-level kit override`);
  }
  const moq = await H.q(`select gb_effective_moq($1,$2,$3) m`, [gb.id, p.id, v5.id]);
  assert.equal(moq.rows[0].m, 2);

  // The product-level Bunuan switch is inherited, and a variation row overrides it.
  await H.legacyOrder({ gb, name: 'A', email: 'a@e2e.test', phone: '09270000011',
    items: [{ product_id: p.id, variation_id: v5.id, quantity: 1 }, { product_id: p.id, variation_id: v15.id, quantity: 1 }] });
  assert.equal((await H.kitState(gb, p, v5)).bunuan_available, 0, 'product row switched Bunuan off');
  await H.q(`insert into group_buy_product_kits (group_buy_id, product_id, variation_id, bunuan_enabled)
             values ($1,$2,$3,true)`, [gb.id, p.id, v15.id]);
  assert.equal((await H.kitState(gb, p, v15)).bunuan_available, 3, 'variation row re-enables just 15mg');
  assert.equal((await H.kitState(gb, p, v5)).bunuan_available, 0);
});

test('VAR — product-level and variation-level override rows are each unique per round', async () => {
  const { gb, p, v5 } = await tirzRound({ kit: 10 });
  const upsert = (variationId, moq) => H.q(
    `insert into group_buy_product_kits (group_buy_id, product_id, variation_id, moq_override)
     values ($1,$2,$3,$4)
     on conflict (group_buy_id, product_id, variation_id) do update set moq_override = excluded.moq_override`,
    [gb.id, p.id, variationId, moq]);
  await upsert(null, 2);
  await upsert(null, 3);
  await upsert(v5.id, 4);
  await upsert(v5.id, 6);
  const r = await H.q(`select variation_id, moq_override from group_buy_product_kits where group_buy_id=$1 order by 2`, [gb.id]);
  assert.deepEqual(r.rows.map((x) => x.moq_override), [3, 6], 'NULL variation_id upserts instead of duplicating');
});

test('VAR — a product without variations behaves exactly as before', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Plain', gb, kit: 10, moq: 2 });
  await H.legacyOrder({ gb, name: 'A', email: 'a@e2e.test', phone: '09270000011', items: [{ product_id: p.id, quantity: 8 }] });
  const rows = await H.viewRows(gb);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].variation_id, null);
  assert.equal(rows[0].bunuan_needed, 2);
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }])).code, 'BELOW_MOQ');
});
