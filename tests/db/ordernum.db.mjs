// Per-round order numbers (GB14-001) — supabase/migrations/20260922000004_add_gb_order_number.sql
//
// The number is allocated by a trigger, not by the checkout RPC, because four
// different writers create or move orders. Every one of them is exercised here.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './harness.mjs';
import * as H from './harness.mjs';

after(async () => { await pool.end(); });

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const MIGRATION = path.join(REPO, 'supabase', 'migrations', '20260922000004_add_gb_order_number.sql');

const who = (n) => ({
  customer_name: `N${n}`,
  customer_email: `n${n}@e2e.test`,
  customer_phone: `0927100${String(n).padStart(4, '0')}`,
});

const seqOf = async (id) => {
  const r = await H.q('select gb_order_seq, gb_order_code, group_buy_number from orders where id = $1', [id]);
  return r.rows[0];
};

/** A round with one freely orderable product (no MOQ, no kit). */
async function seedSimpleRound() {
  const gb = await H.seedRound({ status: 'active' });
  const p = await H.seedProduct({ name: `Num ${Math.random().toString(36).slice(2, 7)}`, gb });
  return { gb, p };
}

test('numbers a round 1, 2, 3 … in the order the orders arrive', async () => {
  await H.reset();
  const { gb, p } = await seedSimpleRound();

  const codes = [];
  for (let i = 0; i < 3; i++) {
    const res = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(i));
    assert.ok(res.ok, `order ${i} rejected: ${JSON.stringify(res)}`);
    codes.push(res.gb_order_code);
    assert.equal(res.gb_order_seq, i + 1);
  }

  assert.deepEqual(codes, [1, 2, 3].map((n) => `GB${gb.gb_number}-${String(n).padStart(3, '0')}`));
});

test('each round has its own counter — a new round restarts at 001', async () => {
  await H.reset();
  const a = await seedSimpleRound();
  await H.placeOrder([{ product_id: a.p.id, quantity: 1 }], who(0));
  await H.placeOrder([{ product_id: a.p.id, quantity: 1 }], who(1));

  // Close the first round and open a second one.
  await H.q(`update group_buys set status='closed' where id=$1`, [a.gb.id]);
  const b = await seedSimpleRound();

  const res = await H.placeOrder([{ product_id: b.p.id, quantity: 1 }], who(2));
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(res.gb_order_seq, 1);
  assert.equal(res.gb_order_code, `GB${b.gb.gb_number}-001`);
});

test('the legacy direct-insert path is numbered too', async () => {
  await H.reset();
  const { gb, p } = await seedSimpleRound();

  // How checkout still writes when place_group_buy_order is not deployed yet.
  const legacy = await H.legacyOrder({
    gb, name: 'Legacy', email: 'legacy@e2e.test', phone: '09271000099',
    items: [{ product_id: p.id, quantity: 1 }],
  });
  assert.equal(legacy.gb_order_seq, 1);
  assert.equal(legacy.gb_order_code, `GB${gb.gb_number}-001`);

  // …and the RPC continues the same counter rather than starting its own.
  const res = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(0));
  assert.equal(res.gb_order_seq, 2);
});

test('simultaneous checkouts in one round get distinct consecutive numbers', async () => {
  for (let round = 0; round < 5; round++) {
    await H.reset();
    const { gb, p } = await seedSimpleRound();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => H.placeOrder([{ product_id: p.id, quantity: 1 }], who(i))),
    );
    for (const r of results) assert.ok(r.ok, `rejected: ${JSON.stringify(r)}`);

    const seqs = results.map((r) => r.gb_order_seq).sort((x, y) => x - y);
    assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6, 7, 8], `round ${round}: ${JSON.stringify(seqs)}`);

    const stored = await H.q(
      'select count(*)::int as n, count(distinct gb_order_seq)::int as d from orders where group_buy_id = $1',
      [gb.id],
    );
    assert.equal(stored.rows[0].n, 8);
    assert.equal(stored.rows[0].d, 8, 'two orders shared a number');
  }
});

test('an ordinary edit does not renumber the order', async () => {
  await H.reset();
  const { p } = await seedSimpleRound();
  const res = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(0));

  await H.q(`update orders set order_status='confirmed', payment_status='paid' where id=$1`, [res.order_id]);

  const after = await seqOf(res.order_id);
  assert.equal(after.gb_order_seq, res.gb_order_seq);
  assert.equal(after.gb_order_code, res.gb_order_code);
});

test('reassigning to another round moves the order to the end of that round', async () => {
  await H.reset();
  // One round at a time: place_group_buy_order derives the round server-side
  // (newest open one), so two rounds left open would both collect every order.
  const a = await seedSimpleRound();
  await H.placeOrder([{ product_id: a.p.id, quantity: 1 }], who(0));
  const moving = await H.placeOrder([{ product_id: a.p.id, quantity: 1 }], who(1));
  assert.equal(moving.gb_order_seq, 2);

  await H.q(`update group_buys set status='closed' where id=$1`, [a.gb.id]);

  // Two orders already sitting in the destination round.
  const b = await seedSimpleRound();
  await H.placeOrder([{ product_id: b.p.id, quantity: 1 }], who(2));
  await H.placeOrder([{ product_id: b.p.id, quantity: 1 }], who(3));

  // Exactly what api/_lib/db.js bulkAssignGroupBuy runs.
  await H.q(
    `update orders
        set group_buy_id = $1::uuid,
            group_buy_number = (select gb_number from group_buys where id = $1::uuid)
      where id = any($2::uuid[])`,
    [b.gb.id, [moving.order_id]],
  );

  const moved = await seqOf(moving.order_id);
  assert.equal(moved.gb_order_seq, 3, 'should continue the destination round');
  assert.equal(moved.gb_order_code, `GB${b.gb.gb_number}-003`);

  // The hole it left behind is NOT backfilled: 001 keeps its number.
  const left = await H.q('select gb_order_seq from orders where group_buy_id = $1 order by 1', [a.gb.id]);
  assert.deepEqual(left.rows.map((r) => r.gb_order_seq), [1]);
});

test('clearing the round clears the number', async () => {
  await H.reset();
  const { p } = await seedSimpleRound();
  const res = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(0));

  await H.q('update orders set group_buy_id = null, group_buy_number = null where id = $1', [res.order_id]);

  const cleared = await seqOf(res.order_id);
  assert.equal(cleared.gb_order_seq, null);
  assert.equal(cleared.gb_order_code, null);
});

test('a deleted order never hands its number to the next customer', async () => {
  await H.reset();
  const { gb, p } = await seedSimpleRound();
  const first = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(0));
  const second = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(1));
  assert.equal(second.gb_order_seq, 2);

  await H.q('delete from orders where id = $1', [second.order_id]);

  const third = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(2));
  assert.equal(third.gb_order_seq, 3, 'reused a number that may already be on a receipt');
  assert.notEqual(third.order_id, first.order_id);
  assert.equal(third.gb_order_code, `GB${gb.gb_number}-003`);
});

test('two orders in a round can never share a number', async () => {
  await H.reset();
  const { gb, p } = await seedSimpleRound();
  const a = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(0));
  const b = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(1));

  await assert.rejects(
    () => H.q('update orders set gb_order_seq = $1 where id = $2', [a.gb_order_seq, b.order_id]),
    /orders_group_buy_seq_key|duplicate key/,
    'the unique index is the backstop and must reject this',
  );
  assert.ok(gb.id);
});

test('the migration is idempotent and backfills unnumbered history', async () => {
  await H.reset();
  const { gb, p } = await seedSimpleRound();

  // Three orders whose numbers are then wiped, standing in for the rows that
  // already exist in production before this migration is applied.
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const r = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(i));
    ids.push(r.order_id);
  }
  await H.q('update orders set gb_order_seq = null where group_buy_id = $1', [gb.id]);

  const sql = fs.readFileSync(MIGRATION, 'utf8');
  await H.q(sql);

  const rows = await H.q(
    'select id, gb_order_seq, gb_order_code from orders where group_buy_id = $1 order by created_at, id',
    [gb.id],
  );
  assert.deepEqual(rows.rows.map((r) => r.gb_order_seq), [1, 2, 3], 'backfill left gaps');
  assert.deepEqual(rows.rows.map((r) => r.id), ids, 'backfill did not follow arrival order');

  // Running it a second time must not renumber anything.
  await H.q(sql);
  const again = await H.q('select gb_order_seq from orders where group_buy_id = $1 order by created_at, id', [gb.id]);
  assert.deepEqual(again.rows.map((r) => r.gb_order_seq), [1, 2, 3]);

  // And the trigger it just recreated still works.
  const next = await H.placeOrder([{ product_id: p.id, quantity: 1 }], who(9));
  assert.equal(next.gb_order_seq, 4);
});
