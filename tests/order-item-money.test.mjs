/**
 * Unit tests for src/lib/orderItemMoney.ts — reading money off a stored order item.
 *
 * Orders placed through place_group_buy_order before 2026-10-06 stored the
 * pricing RPC's unit_price/line_total instead of price/total, and the admin
 * order details page crashed on them. Readers must accept both shapes and
 * never throw on a missing value.
 *
 *   node --experimental-strip-types --test tests/order-item-money.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemUnitPrice, itemLineTotal, formatMoney } from '../src/lib/orderItemMoney.ts';

test('reads price/total from the standard shape', () => {
  const item = { quantity: 2, price: 543.63, total: 1087.26 };
  assert.equal(itemUnitPrice(item), 543.63);
  assert.equal(itemLineTotal(item), 1087.26);
});

test('falls back to unit_price/line_total from the pricing RPC shape', () => {
  const item = { quantity: 2, unit_price: 543.63, line_total: 1087.26 };
  assert.equal(itemUnitPrice(item), 543.63);
  assert.equal(itemLineTotal(item), 1087.26);
});

test('accepts numeric strings', () => {
  assert.equal(itemUnitPrice({ quantity: 1, unit_price: '120.50' }), 120.5);
});

test('derives the line total from unit price × quantity when no total is stored', () => {
  assert.equal(itemLineTotal({ quantity: 3, price: 250 }), 750);
});

test('returns null when no price is stored at all', () => {
  const item = { quantity: 1 };
  assert.equal(itemUnitPrice(item), null);
  assert.equal(itemLineTotal(item), null);
});

test('a stored zero price is a real price, not a missing one', () => {
  const item = { quantity: 2, price: 0, total: 0 };
  assert.equal(itemUnitPrice(item), 0);
  assert.equal(itemLineTotal(item), 0);
});

test('formatMoney shows a dash for a missing value instead of throwing', () => {
  assert.equal(formatMoney(null), '—');
  assert.equal(formatMoney(undefined), '—');
  assert.equal(formatMoney(1087.26), '1,087.26');
  assert.equal(formatMoney(250), '250.00');
});
