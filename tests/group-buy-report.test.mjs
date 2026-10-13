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

/** Read one named column from a Product Summary row. */
function cell(summaryRows, row, column) {
  const idx = summaryRows[0].indexOf(column);
  assert.ok(idx >= 0, `column "${column}" exists`);
  return row[idx];
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
  const qtyIdx = header.indexOf('Total Vials Needed');
  const committedIdx = header.indexOf('Committed Vials');
  assert.ok(qtyIdx >= 0, 'Total Vials Needed column exists');
  assert.ok(committedIdx >= 0, 'Committed Vials column exists');

  const row = summaryRow(summaryRows, 'Serum');
  assert.equal(row[qtyIdx], 5); // 2 committed + 3 pending (cancelled excluded)
  assert.equal(row[committedIdx], 2); // only the paid+confirmed order
});

test('countsForSupplier still gates paid/confirmed only', () => {
  assert.equal(countsForSupplier(paidConfirmed), true);
  assert.equal(countsForSupplier(newPending), false);
  assert.equal(countsForSupplier(cancelled), false);
});

// --- Order # column --------------------------------------------------------
// The Orders sheet is what the supplier thread and the customer both quote back,
// so it must carry the short per-round number once the order has one, and must
// still produce something usable for history that predates that column.

test('Orders sheet uses the per-round order number when the order has one', () => {
  // Arrange
  const orders = [order({ id: 'aabbccdd-1111-2222-3333-444455556666', gb_order_code: 'GB7-014' })];

  // Act
  const { orderRows } = prepareGroupBuyReport(GB, orders);

  // Assert
  assert.equal(orderRows[0][0], 'Order #');
  assert.equal(orderRows[1][0], 'GB7-014');
});

test('Orders sheet falls back to the id stub for an order with no number', () => {
  // Arrange
  const orders = [order({ id: 'aabbccdd-1111-2222-3333-444455556666' })];

  // Act
  const { orderRows } = prepareGroupBuyReport(GB, orders);

  // Assert
  assert.equal(orderRows[1][0], 'AABBCCDD');
});

// --- Product Summary identity ----------------------------------------------
// A product renamed mid-round ("Lily" -> "LILY") must stay ONE supplier line.
// Grouping by display name split GB15's Lily lines in two, so the supplier saw
// two half-quantities instead of the real total. The Kits & MOQ panel keys by
// product/variation id, and the report must agree with it.

test('Product Summary merges a product renamed mid-round into one row', () => {
  // Arrange
  const orders = [
    order({ id: 'o-new', order_items: [{ product_id: 'p1', variation_id: 'v1', product_name: 'LILY Blend', variation_name: 'Calm', quantity: 4, price: 1, total: 4 }] }),
    order({ id: 'o-old', order_items: [{ product_id: 'p1', variation_id: 'v1', product_name: 'Lily Blend', variation_name: 'Calm', quantity: 3, price: 1, total: 3 }] }),
  ];

  // Act
  const { summaryRows } = prepareGroupBuyReport(GB, orders);

  // Assert: one row, both orders, newest name shown.
  assert.equal(summaryRows.length, 2);
  assert.deepEqual(summaryRows[1].slice(0, 2), ['LILY Blend', 'Calm']);
  assert.equal(cell(summaryRows, summaryRows[1], 'Total Vials Needed'), 7);
  assert.equal(cell(summaryRows, summaryRows[1], 'No. of Customer Orders'), 2);
});

test('Product Summary keeps different variations of one product apart', () => {
  // Arrange
  const orders = [
    order({ order_items: [
      { product_id: 'p1', variation_id: 'v10', product_name: 'Tirz', variation_name: '10mg', quantity: 5, price: 1, total: 5 },
      { product_id: 'p1', variation_id: 'v15', product_name: 'Tirz', variation_name: '15mg', quantity: 2, price: 1, total: 2 },
    ] }),
  ];

  // Act
  const { summaryRows } = prepareGroupBuyReport(GB, orders);

  // Assert
  assert.equal(summaryRows.length, 3);
});

test('Product Summary falls back to names for lines without ids', () => {
  // Arrange: legacy lines carry no product_id.
  const orders = [
    order({ order_items: [{ product_name: 'Serum', variation_name: '30ml', quantity: 2, price: 1, total: 2 }] }),
    order({ order_items: [{ product_name: 'Serum', variation_name: '30ml', quantity: 1, price: 1, total: 1 }] }),
  ];

  // Act
  const { summaryRows } = prepareGroupBuyReport(GB, orders);

  // Assert
  assert.equal(cell(summaryRows, summaryRow(summaryRows, 'Serum'), 'Total Vials Needed'), 3);
});

// --- Same dead-order rule as the Kits & MOQ panel ---------------------------

test('expired orders and failed/refunded payments do not count as demand', () => {
  // Arrange
  const line = [{ product_id: 'p1', product_name: 'Serum', quantity: 5, price: 1, total: 5 }];
  const orders = [
    order({ id: 'live', order_items: line }),
    order({ id: 'expired', order_status: 'expired', order_items: line }),
    order({ id: 'failed', payment_status: 'failed', order_items: line }),
    order({ id: 'refunded', payment_status: 'refunded', order_items: line }),
  ];

  // Act
  const { summaryRows, totalsRows } = prepareGroupBuyReport(GB, orders);

  // Assert
  assert.equal(cell(summaryRows, summaryRow(summaryRows, 'Serum'), 'Total Vials Needed'), 5);
  assert.equal(totalsRow(totalsRows, 'Placed Orders')[1], 1);
  assert.equal(totalsRow(totalsRows, 'Cancelled Orders')[1], 3);
});

// --- Kits to order -----------------------------------------------------------
// The supplier sells whole kits. The client orders from this sheet, so it must
// say how many kits to buy: vials / kit size, rounded UP — a part-filled kit is
// still a whole kit from the supplier (GB15: BA5 156 vials = 16 kits, not 15).

function bacOrders() {
  return [
    order({ id: 'o1', order_items: [
      { product_id: 'bac', variation_id: 'ba3', product_name: 'BACWATER', variation_name: 'BA3', quantity: 100, price: 1, total: 100 },
      { product_id: 'bac', variation_id: 'ba5', product_name: 'BACWATER', variation_name: 'BA5', quantity: 150, price: 1, total: 150 },
    ] }),
    order({ id: 'o2', order_items: [
      { product_id: 'bac', variation_id: 'ba3', product_name: 'BACWATER', variation_name: 'BA3', quantity: 60, price: 1, total: 60 },
      { product_id: 'bac', variation_id: 'ba5', product_name: 'BACWATER', variation_name: 'BA5', quantity: 6, price: 1, total: 6 },
    ] }),
  ];
}
const BAC_KITS = new Map([['bac:ba3', 10], ['bac:ba5', 10]]);

function variationRow(summaryRows, variation) {
  return summaryRows.slice(1).find((r) => r[1] === variation);
}

test('kits to order is vials / kit size when the last kit is exactly full', () => {
  // Act
  const { summaryRows } = prepareGroupBuyReport(GB, bacOrders(), BAC_KITS);

  // Assert: 160 vials of BA3 = 16 kits, nothing spare.
  const row = variationRow(summaryRows, 'BA3');
  assert.equal(cell(summaryRows, row, 'Total Vials Needed'), 160);
  assert.equal(cell(summaryRows, row, 'Kit Size'), 10);
  assert.equal(cell(summaryRows, row, 'Kits to Order'), 16);
  assert.equal(cell(summaryRows, row, 'Spare Vials (last kit)'), 0);
});

test('kits to order rounds a part-filled kit up', () => {
  // Act
  const { summaryRows } = prepareGroupBuyReport(GB, bacOrders(), BAC_KITS);

  // Assert: 156 vials of BA5 = 15 full kits + 6 -> 16 kits, 4 spare.
  const row = variationRow(summaryRows, 'BA5');
  assert.equal(cell(summaryRows, row, 'Kits to Order'), 16);
  assert.equal(cell(summaryRows, row, 'Spare Vials (last kit)'), 4);
});

test('kits columns stay blank for a line with no kit size', () => {
  // Act: no kit sizes supplied at all.
  const { summaryRows } = prepareGroupBuyReport(GB, bacOrders());

  // Assert
  const row = variationRow(summaryRows, 'BA3');
  assert.equal(cell(summaryRows, row, 'Kits to Order'), '');
  assert.equal(cell(summaryRows, row, 'Kit Size'), '');
});

test('Totals report the total kits to order', () => {
  // Act
  const { totalsRows } = prepareGroupBuyReport(GB, bacOrders(), BAC_KITS);

  // Assert: 16 + 16
  assert.equal(totalsRow(totalsRows, 'Total Kits to Order')[1], 32);
});
