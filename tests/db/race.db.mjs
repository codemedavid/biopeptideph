import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { pool, CONN } from './harness.mjs';
import * as H from './harness.mjs';

after(async () => { await pool.end(); });

const who = (n) => ({ customer_name: `R${n}`, customer_email: `r${n}@e2e.test`, customer_phone: `0927000${String(n).padStart(4,'0')}` });

async function setupBunuan({ kit = 10, already = 9, buyers = 6 }) {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: 'Race', gb, kit });
  await H.legacyOrder({ gb, name: 'Seed', email: 'seed@e2e.test', phone: '09270000000',
    items: [{ product_id: p.id, quantity: already }] });
  // every racer must be eligible: give each one a counting order in this round
  for (let i = 0; i < buyers; i++) {
    const w = who(i);
    await H.legacyOrder({ gb, name: w.customer_name, email: w.customer_email, phone: w.customer_phone,
      items: [], order_status: 'new' });
  }
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);
  return { gb, p };
}

test('TEST 14 — N simultaneous buyers, 1 slot: exactly one wins (autocommit, x20 rounds)', async () => {
  for (let round = 0; round < 20; round++) {
    const { gb, p } = await setupBunuan({ kit: 10, already: 9, buyers: 6 });
    const racers = Array.from({ length: 6 }, (_, i) =>
      H.placeOrder([{ product_id: p.id, quantity: 1 }], who(i)));
    const results = await Promise.all(racers);
    const wins = results.filter(r => r.ok).length;
    const st = await H.kitState(gb, p);
    assert.equal(wins, 1, `round ${round}: ${wins} winners — ${JSON.stringify(results.map(r=>r.code||'ok'))}`);
    assert.equal(st.eligible_qty, 10, `round ${round}: total became ${st.eligible_qty}/10`);
    assert.equal(st.bunuan_available, 0);
    for (const r of results.filter(x => !x.ok)) {
      assert.ok(['BUNUAN_EXCEEDS_REMAINING', 'BUNUAN_UNAVAILABLE'].includes(r.code), `bad loser code ${r.code}`);
    }
  }
});

test('TEST 14b — 3 slots, 5 buyers asking for 2 each: never oversells', async () => {
  for (let round = 0; round < 10; round++) {
    const { gb, p } = await setupBunuan({ kit: 10, already: 7, buyers: 5 });
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      H.placeOrder([{ product_id: p.id, quantity: 2 }], who(i))));
    const st = await H.kitState(gb, p);
    assert.ok(st.eligible_qty <= 10, `round ${round}: oversold to ${st.eligible_qty}`);
    const wins = results.filter(r => r.ok).length;
    assert.equal(st.eligible_qty, 7 + wins * 2);
  }
});

test('TEST 14c — explicit open transactions serialise correctly', async () => {
  const { gb, p } = await setupBunuan({ kit: 10, already: 9, buyers: 2 });
  const a = new pg.Client(CONN); const b = new pg.Client(CONN);
  await a.connect(); await b.connect();
  try {
    await a.query('begin'); await b.query('begin');
    const ra = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(0), 'national', a);
    assert.equal(ra.ok, true, 'A should win');
    // B must BLOCK on the advisory lock until A commits, then be refused.
    const pendingB = H.placeOrder([{ product_id: p.id, quantity: 1 }], who(1), 'national', b);
    let settled = false; pendingB.then(() => { settled = true; });
    await new Promise(r => setTimeout(r, 400));
    assert.equal(settled, false, 'B must block while A holds the lock');
    await a.query('commit');
    const rb = await pendingB;
    await b.query('commit');
    assert.equal(rb.ok, false, 'B must lose');
    // Either refusal is correct: A's commit took the last slot, so by the time B
    // recomputes, the kit is complete (BUNUAN_UNAVAILABLE) rather than merely short.
    assert.ok(['BUNUAN_EXCEEDS_REMAINING', 'BUNUAN_UNAVAILABLE'].includes(rb.code), `unexpected ${rb.code}`);
    assert.equal((await H.kitState(gb, p)).eligible_qty, 10);
  } finally { await a.end(); await b.end(); }
});

test('TEST 14d — multi-product carts in opposite order do not deadlock', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active' });
  const p1 = await H.seedProduct({ name: 'M1', gb, kit: 10 });
  const p2 = await H.seedProduct({ name: 'M2', gb, kit: 10 });
  for (let i = 0; i < 8; i++) {
    const w = who(i);
    await H.legacyOrder({ gb, name: w.customer_name, email: w.customer_email, phone: w.customer_phone, items: [] });
  }
  await H.legacyOrder({ gb, name: 'Seed', email: 'seed@e2e.test', phone: '09270000000',
    items: [{ product_id: p1.id, quantity: 5 }, { product_id: p2.id, quantity: 5 }] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    H.placeOrder(i % 2 === 0
      ? [{ product_id: p1.id, quantity: 1 }, { product_id: p2.id, quantity: 1 }]
      : [{ product_id: p2.id, quantity: 1 }, { product_id: p1.id, quantity: 1 }], who(i))));
  for (const r of results) {
    if (!r.ok) assert.ok(['BUNUAN_EXCEEDS_REMAINING','BUNUAN_UNAVAILABLE'].includes(r.code), `unexpected ${r.code}: ${r.message}`);
  }
  for (const p of [p1, p2]) {
    assert.ok((await H.kitState(gb, p)).eligible_qty <= 10, 'oversold');
  }
});
