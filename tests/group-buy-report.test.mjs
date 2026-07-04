/**
 * Unit tests for the Group Buy report data prep (src/utils/groupBuyReport.ts).
 *
 * The report's headline counts (items / customers / orders) and the Product
 * Summary quantities must reflect EVERY placed order — including brand-new,
 * still-unpaid ones — because that is the demand the supplier order is built
 * from. Only cancelled/refunded orders are excluded from the totals. A separate
 * "committed" (paid or confirmed+) breakdown is reported alongside so finance
 * numbers stay visible. The Orders sheet always lists every order.
 *
 * Runs under Node's built-in runner with native TS type-stripping:
 *   node --experimental-strip-types --test tests/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareGroupBuyReport, countsForSupplier } from '../src/utils/groupBuyReport.ts';

const GB = {
  gb_number: '7',
  title: 'July Round',
  status: 'closed',
  start_date: null,
  end_date: null,
};

/** Find the first Totals row whose first cell equals `label`; return the row. */
function totalsRow(totalsRows, label) {
  return totalsRows.find((r) => r[0] === label);
}

/** Find a Product Summary row by product name (skips the header row). */
function summaryRow(summaryRows, product) {
  return summaryRows.slice(1).find((r) => r[0] === product);
}

function order(over = {}) {
  return {
    id: over.id || 'order-0000-0000',
    customer_name: 'Cust',
    customer_email: over.customer_email ?? 'cust@example.com',
    payment_status: 'pending',
    order_status: 'new',
    currency: 'PHP',
    total_price: 0,
    order_items: [],
    ...over,
  };
}

const paidConfirmed = order({
  id: 'aaaaaaaa-0001',
  customer_email: 'a@example.com',
  payment_status: 'paid',
  order_status: 'confirmed',
  total_price: 1000,
  order_items: [{ product_name: 'Serum', variation_name: '30ml', quantity: 2, price: 500, total: 1000 }],
});

const newPending = order({
  id: 'bbbbbbbb-0002',
  customer_email: 'b@example.com',
  payment_status: 'pending',
  order_status: 'new',
  total_price: 1500,
  order_items: [{ product_name: 'Serum', variation_name: '30ml', quantity: 3, price: 500, total: 1500 }],
});

const cancelled = order({
  id: 'cccccccc-0003',
  customer_email: 'c@example.com',
  payment_status: 'pending',
  order_status: 'cancelled',
  total_price: 5000,
  order_items: [{ product_name: 'Serum', variation_name: '30ml', quantity: 10, price: 500, total: 5000 }],
});

test('new/pending orders are counted in the headline totals', () => {
  const { totalsRows } = prepareGroupBuyReport(GB, [paidConfirmed, newPending]);

  // Demand = both orders: 2 + 3 items, 2 distinct customers.
  assert.equal(totalsRow(totalsRows, 'Total Items')[1], 5);
  assert.equal(totalsRow(totalsRows, 'Total Customers')[1], 2);
  assert.equal(totalsRow(totalsRows, 'Placed Orders')[1], 2);
});

test('a committed (paid/confirmed) breakdown is reported alongside demand', () => {
  const { totalsRows } = prepareGroupBuyReport(GB, [paidConfirmed, newPending]);

  // Only the paid+confirmed order is committed: 1 order, 2 items.
  assert.equal(totalsRow(totalsRows, 'Committed Orders')[1], 1);
  assert.equal(totalsRow(totalsRows, 'Committed Items')[1], 2);
});

test('cancelled orders are excluded from totals but still listed in Orders', () => {
  const { totalsRows, orderRows } = prepareGroupBuyReport(GB, [paidConfirmed, newPending, cancelled]);

  // Cancelled qty (10) must NOT inflate demand.
  assert.equal(totalsRow(totalsRows, 'Total Items')[1], 5);
  assert.equal(totalsRow(totalsRows, 'Placed Orders')[1], 2);
  assert.equal(totalsRow(totalsRows, 'Cancelled Orders')[1], 1);

  // Every order still appears on the Orders sheet (header + 3 lines).
  assert.equal(orderRows.length, 4);
});

test('Product Summary qty reflects placed orders with a committed sub-column', () => {
  const { summaryRows } = prepareGroupBuyReport(GB, [paidConfirmed, newPending, cancelled]);
  const header = summaryRows[0];
  const qtyIdx = header.indexOf('Total Qty Needed');
  const committedIdx = header.indexOf('Committed Qty');
  assert.ok(qtyIdx >= 0, 'Total Qty Needed column exists');
  assert.ok(committedIdx >= 0, 'Committed Qty column exists');

  const row = summaryRow(summaryRows, 'Serum');
  assert.equal(row[qtyIdx], 5); // 2 committed + 3 pending (cancelled excluded)
  assert.equal(row[committedIdx], 2); // only the paid+confirmed order
});

test('countsForSupplier still gates paid/confirmed only', () => {
  assert.equal(countsForSupplier(paidConfirmed), true);
  assert.equal(countsForSupplier(newPending), false);
  assert.equal(countsForSupplier(cancelled), false);
});
