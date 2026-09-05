/**
 * Regression tests for order -> Group Buy attribution
 * (src/utils/groupBuyAttribution.ts).
 *
 * The bug these lock down: checkout only stamped group_buy_id while a round was
 * 'active', so orders placed between rounds were saved unattributed and then
 * silently missing from the per-GB supplier report. The invariant that matters
 * is the last test — while ANY round exists, an order is never unattributed.
 *
 *   node --experimental-strip-types --test tests/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAttributionGroupBuy } from '../src/utils/groupBuyAttribution.ts';

// Ordered newest-created first, matching how useGroupBuys loads them.
const round = (gb_number, status) => ({
  id: `id-${gb_number}`,
  gb_number,
  title: `GB${gb_number}`,
  status,
  start_date: null,
  end_date: null,
});

test('prefers the open round when one is active', () => {
  // Arrange
  const rounds = [round('12', 'upcoming'), round('11', 'active'), round('10', 'closed')];

  // Act
  const picked = pickAttributionGroupBuy(rounds);

  // Assert
  assert.equal(picked.gb_number, '11');
});

test('falls back to the newest round when the admin has closed one and not opened the next', () => {
  // Arrange — the exact gap that orphaned 59 live orders
  const rounds = [round('12', 'upcoming'), round('11', 'closed'), round('10', 'closed')];

  // Act
  const picked = pickAttributionGroupBuy(rounds);

  // Assert
  assert.equal(picked.gb_number, '12');
});

test('falls back to the newest round when every round is closed', () => {
  // Arrange
  const rounds = [round('11', 'closed'), round('10', 'closed')];

  // Act
  const picked = pickAttributionGroupBuy(rounds);

  // Assert
  assert.equal(picked.gb_number, '11');
});

test('returns null only when no round exists at all', () => {
  // Arrange / Act / Assert
  assert.equal(pickAttributionGroupBuy([]), null);
});

test('never returns null while any round exists, whatever the status mix', () => {
  // Arrange — the invariant that prevents orders going missing from the report
  const statuses = ['upcoming', 'active', 'closed'];
  for (const a of statuses) {
    for (const b of statuses) {
      // Act
      const picked = pickAttributionGroupBuy([round('2', a), round('1', b)]);

      // Assert
      assert.ok(picked, `expected an attribution round for statuses ${a}/${b}`);
    }
  }
});
