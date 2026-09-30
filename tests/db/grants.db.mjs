// Bunuan access grants — the admin "Allow in Bunuan" escape hatch.
//
// A returning customer who types their name differently fails the name + email
// + phone match. The admin grants their email for one round (through the
// service-role API), and place_group_buy_order must then let them in. The
// grants table itself must stay invisible to the browser's anon key.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './harness.mjs';
import * as H from './harness.mjs';

after(async () => { await pool.end(); });

const asAnon = async (fn) => {
  const c = await pool.connect();
  try { await c.query('set role anon'); return await fn(c); }
  finally { await c.query('reset role'); c.release(); }
};

test('GRANT — a renamed returning customer is refused, then admitted after an admin grant', async () => {
  await H.reset();
  const gb = await H.seedRound({ status: 'active', title: 'E2E Grant Round' });
  const p = await H.seedProduct({ name: 'GrantP', gb, kit: 10 });
  await H.legacyOrder({ gb, name: 'Ma. Teresa Cruz', email: 'teresa@e2e.test', phone: '09274444444',
    items: [{ product_id: p.id, quantity: 7 }] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);

  // Same email + phone, genuinely different name → the strict match refuses her.
  const renamed = { customer_name: 'Maria Teresa Cruz', customer_email: 'Teresa@E2E.test', customer_phone: '09274444444' };
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], renamed)).code, 'BUNUAN_NOT_ELIGIBLE');

  // The API stores the email normalised (trim + lowercase) — mirror that here.
  await H.q(`insert into group_buy_bunuan_grants (group_buy_id, customer_email, note) values ($1, $2, 'From order E2E')`,
    [gb.id, 'teresa@e2e.test']);
  const out = await H.placeOrder([{ product_id: p.id, quantity: 1 }], renamed);
  assert.equal(out.ok, true, `${out.code}: ${out.message}`);
  assert.equal((await H.kitState(gb, p)).bunuan_available, 2, 'her unit counts toward the kit (7 + 1 of 10)');
});

test('GRANT — access is for that round only', async () => {
  await H.reset();
  const other = await H.seedRound({ status: 'closed', title: 'E2E Other Round' });
  const gb = await H.seedRound({ status: 'active', title: 'E2E Current Round' });
  const p = await H.seedProduct({ name: 'ScopeP', gb, kit: 10 });
  await H.legacyOrder({ gb, name: 'Someone', email: 'someone@e2e.test', phone: '09275555555',
    items: [{ product_id: p.id, quantity: 3 }] });
  await H.q(`update group_buys set status='bunuan_open' where id=$1`, [gb.id]);

  // Granted on a DIFFERENT round — must not open this one.
  await H.q(`insert into group_buy_bunuan_grants (group_buy_id, customer_email) values ($1, 'stranger@e2e.test')`, [other.id]);
  const stranger = { customer_name: 'Stranger', customer_email: 'stranger@e2e.test', customer_phone: '09276666666' };
  assert.equal((await H.placeOrder([{ product_id: p.id, quantity: 1 }], stranger)).code, 'BUNUAN_NOT_ELIGIBLE');
});

test('GRANT — anon can neither read nor write the grants table', async () => {
  // Supabase grants anon full table privileges; RLS (on, no policies) is the wall.
  await H.q('grant usage on schema public to anon');
  await H.q('grant select, insert, update, delete on all tables in schema public to anon');
  await H.reset();
  const gb = await H.seedRound({ status: 'active', title: 'E2E Anon Round' });
  await H.q(`insert into group_buy_bunuan_grants (group_buy_id, customer_email) values ($1, 'secret@e2e.test')`, [gb.id]);

  const seen = await asAnon((c) => c.query('select count(*)::int n from group_buy_bunuan_grants'));
  assert.equal(seen.rows[0].n, 0, 'anon must not see any grant');

  const selfGrant = await asAnon((c) => c.query(
    `insert into group_buy_bunuan_grants (group_buy_id, customer_email) values ($1, 'me@e2e.test')`, [gb.id],
  ).then(() => 'inserted').catch((e) => e.message));
  assert.match(String(selfGrant), /row-level security/i, 'anon must not be able to grant itself access');

  const { rows } = await H.q(`select count(*)::int n from group_buy_bunuan_grants where group_buy_id = $1`, [gb.id]);
  assert.equal(rows[0].n, 1, 'only the admin-created grant exists');
});
