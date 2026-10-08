// Bunuan access grants table.
//
// Since Bunuan opened to everyone (20261008000000) place_group_buy_order no
// longer reads grants, but the table still holds admin-entered emails and must
// stay invisible to the browser's anon key.
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
