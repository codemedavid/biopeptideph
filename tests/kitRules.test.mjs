/**
 * Unit tests for the MOQ + Bunuan rules (src/lib/kitRules.ts).
 *
 * These rules decide whether a real customer may spend real money, so the cases
 * below are written as behaviour, not as coverage: every worked example from the
 * spec appears verbatim, and every "customer must not be able to…" is asserted
 * explicitly rather than implied.
 *
 * The same rules also exist in SQL (the gb_* functions in
 * supabase/migrations/20260922000002_kit_functions.sql) because the database is
 * the real authority — this module only lets the UI explain the rule early. The
 * SQL PARITY block at the bottom lists the exact queries that must return the
 * same answers as the cases here, so drift between the two copies is detectable
 * by hand until there is a live test database to run them against.
 *
 *   node --experimental-strip-types --test tests/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_MOQ,
  computeKitState,
  countsTowardKit,
  effectiveKitSize,
  effectiveMoq,
  isOrderingPhase,
  maxQuantityFor,
  minQuantityFor,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  validateCart,
  validateCartLine,
} from '../src/lib/kitRules.ts';

// ---------------------------------------------------------------------------
// Kit arithmetic
// ---------------------------------------------------------------------------

test('kit size 10 with 8 ordered needs 2 more to complete the kit', () => {
  // Arrange — the headline example from the spec
  const input = { kitSize: 10, eligibleQty: 8 };

  // Act
  const state = computeKitState(input);

  // Assert
  assert.equal(state.completeKits, 0);
  assert.equal(state.inProgress, 8);
  assert.equal(state.bunuanNeeded, 2);
  assert.equal(state.bunuanAvailable, 2);
  assert.equal(state.isComplete, false);
});

test('kit size 10 with 17 ordered needs 3 more', () => {
  const state = computeKitState({ kitSize: 10, eligibleQty: 17 });

  assert.equal(state.completeKits, 1);
  assert.equal(state.inProgress, 7);
  assert.equal(state.bunuanNeeded, 3);
});

test('kit size 10 with 27 ordered is 2 full kits plus a kit needing 3', () => {
  // The multi-kit example: 2 complete kits (20), 7 in progress, 3 required.
  const state = computeKitState({ kitSize: 10, eligibleQty: 27 });

  assert.equal(state.completeKits, 2);
  assert.equal(state.inProgress, 7);
  assert.equal(state.bunuanNeeded, 3);
  assert.equal(state.isComplete, false);
});

test('an exact multiple of the kit size is complete and needs nothing', () => {
  const state = computeKitState({ kitSize: 10, eligibleQty: 20 });

  assert.equal(state.completeKits, 2);
  assert.equal(state.inProgress, 0);
  assert.equal(state.bunuanNeeded, 0);
  assert.equal(state.bunuanAvailable, 0);
  assert.equal(state.isComplete, true);
});

test('zero ordered is complete, so an untouched product never appears in Bunuan', () => {
  // 0 % 10 === 0. Without this the Bunuan page would advertise a full kit's
  // worth of "remaining" units for every product nobody ordered.
  const state = computeKitState({ kitSize: 10, eligibleQty: 0 });

  assert.equal(state.bunuanNeeded, 0);
  assert.equal(state.isComplete, true);
});

test('a product with no kit size is never kit-tracked', () => {
  const state = computeKitState({ kitSize: null, eligibleQty: 7 });

  assert.equal(state.kitSize, null);
  assert.equal(state.bunuanNeeded, 0);
  assert.equal(state.bunuanAvailable, 0);
  assert.equal(state.isComplete, true);
});

test('admin "mark completed" forces the kit closed despite a real shortfall', () => {
  const state = computeKitState({ kitSize: 10, eligibleQty: 8, manuallyCompleted: true });

  assert.equal(state.isComplete, true);
  assert.equal(state.bunuanAvailable, 0);
});

test('disabling Bunuan zeroes what is sellable but still reports the shortfall', () => {
  // bunuanNeeded and bunuanAvailable are separate so the admin audit table can
  // show "short by 2, but Bunuan is off" instead of a bare 0.
  const state = computeKitState({ kitSize: 10, eligibleQty: 8, bunuanEnabled: false });

  assert.equal(state.bunuanNeeded, 2);
  assert.equal(state.bunuanAvailable, 0);
  assert.equal(state.isComplete, false);
});

// ---------------------------------------------------------------------------
// Effective rules
// ---------------------------------------------------------------------------

test('a per-round override beats the product default', () => {
  assert.equal(effectiveMoq(3, 5), 5);
  assert.equal(effectiveKitSize(10, 20), 20);
});

test('an unset MOQ means no minimum', () => {
  assert.equal(effectiveMoq(null), NO_MOQ);
  assert.equal(effectiveMoq(undefined), NO_MOQ);
  assert.equal(effectiveMoq(0), NO_MOQ);
});

test('an unset kit size stays null rather than defaulting to 1', () => {
  // Defaulting to 1 would make every untracked product permanently "complete
  // but kit-tracked", which is a different and much noisier bug.
  assert.equal(effectiveKitSize(null), null);
  assert.equal(effectiveKitSize(0), null);
});

// ---------------------------------------------------------------------------
// Which orders count
// ---------------------------------------------------------------------------

test('an unpaid pending order still counts toward the kit', () => {
  // A Group Buy is a preorder: people commit first and pay later, so the kit is
  // sized against commitments. Matches countsAsPlaced() in groupBuyReport.ts.
  assert.equal(countsTowardKit('new', 'pending'), true);
});

test('cancelled, refunded, failed and expired orders never count', () => {
  assert.equal(countsTowardKit('cancelled', 'paid'), false);
  assert.equal(countsTowardKit('canceled', 'paid'), false); // one-l spelling too
  assert.equal(countsTowardKit('refunded', 'paid'), false);
  assert.equal(countsTowardKit('expired', 'pending'), false);
  assert.equal(countsTowardKit('new', 'failed'), false);
  assert.equal(countsTowardKit('new', 'refunded'), false);
});

test('status matching ignores casing', () => {
  assert.equal(countsTowardKit('CANCELLED', 'paid'), false);
});

// ---------------------------------------------------------------------------
// MOQ enforcement during normal ordering
// ---------------------------------------------------------------------------

const KIT_8_OF_10 = computeKitState({ kitSize: 10, eligibleQty: 8 });

function line(over = {}) {
  return {
    productId: 'p1',
    productName: 'Tirzepatide',
    quantity: 1,
    moq: 1,
    kitState: computeKitState({ kitSize: null, eligibleQty: 0 }),
    ...over,
  };
}

test('quantity below the MOQ is rejected and says how many more are needed', () => {
  const verdict = validateCartLine(line({ quantity: 1, moq: 3 }), 'active');

  assert.equal(verdict.ok, false);
  assert.equal(verdict.issue, 'BELOW_MOQ');
  assert.equal(verdict.shortBy, 2);
  assert.match(verdict.message, /Minimum order for Tirzepatide is 3 vials/);
});

test('quantity exactly at the MOQ is allowed', () => {
  assert.equal(validateCartLine(line({ quantity: 3, moq: 3 }), 'active').ok, true);
});

test('quantity above the MOQ is allowed', () => {
  assert.equal(validateCartLine(line({ quantity: 7, moq: 3 }), 'active').ok, true);
});

test('a single vial is fine when the product has no MOQ', () => {
  assert.equal(validateCartLine(line({ quantity: 1, moq: 1 }), 'active').ok, true);
});

test('the shortfall message is singular when only one vial is missing', () => {
  const verdict = validateCartLine(line({ quantity: 2, moq: 3 }), 'active');

  assert.match(verdict.message, /add 1 more vial to continue/);
});

// ---------------------------------------------------------------------------
// Bunuan
// ---------------------------------------------------------------------------

test('Bunuan suspends the MOQ so one vial is purchasable', () => {
  // The whole point of Bunuan: a product with MOQ 5 must still allow a single
  // vial when the kit only needs one more.
  const verdict = validateCartLine(
    line({ quantity: 1, moq: 5, kitState: KIT_8_OF_10 }),
    'bunuan_open',
  );

  assert.equal(verdict.ok, true);
});

test('Bunuan caps the quantity at exactly what the kit still needs', () => {
  const verdict = validateCartLine(
    line({ quantity: 3, moq: 1, kitState: KIT_8_OF_10 }),
    'bunuan_open',
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.issue, 'BUNUAN_EXCEEDS_REMAINING');
  assert.equal(verdict.maxAllowed, 2);
  assert.match(verdict.message, /Only 2 vials left/);
});

test('buying exactly the remaining quantity is allowed', () => {
  assert.equal(
    validateCartLine(line({ quantity: 2, moq: 1, kitState: KIT_8_OF_10 }), 'bunuan_open').ok,
    true,
  );
});

test('a completed kit is unavailable in Bunuan', () => {
  const complete = computeKitState({ kitSize: 10, eligibleQty: 20 });
  const verdict = validateCartLine(
    line({ quantity: 1, moq: 1, kitState: complete }),
    'bunuan_open',
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.issue, 'BUNUAN_KIT_COMPLETE');
  assert.equal(verdict.maxAllowed, 0);
});

test('a product with Bunuan disabled cannot be bought even though it is short', () => {
  const disabled = computeKitState({ kitSize: 10, eligibleQty: 8, bunuanEnabled: false });
  const verdict = validateCartLine(
    line({ quantity: 1, moq: 1, kitState: disabled }),
    'bunuan_open',
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.issue, 'BUNUAN_DISABLED');
});

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

test('orders are only possible while normal ordering or Bunuan is open', () => {
  assert.equal(isOrderingPhase('active'), true);
  assert.equal(isOrderingPhase('bunuan_open'), true);
  assert.equal(isOrderingPhase('upcoming'), false);
  assert.equal(isOrderingPhase('closed'), false);
  assert.equal(isOrderingPhase('bunuan_closed'), false);
  assert.equal(isOrderingPhase('completed'), false);
});

// A phase that is not Bunuan is NOT a gate. The store keeps taking orders in
// the gap between rounds (utils/groupBuyAttribution.ts exists because 59 orders
// were lost there), so those phases fall back to plain normal-ordering rules.
// place_group_buy_order does the same, which is what keeps the two in step.
test('a non-Bunuan phase applies the MOQ floor instead of blocking outright', () => {
  for (const phase of ['upcoming', 'closed', 'bunuan_closed', 'completed']) {
    assert.equal(validateCartLine(line({ quantity: 5, moq: 1 }), phase).ok, true,
      `phase ${phase} must still allow an ordinary order`);

    const below = validateCartLine(line({ quantity: 2, moq: 3 }), phase);
    assert.equal(below.ok, false, `phase ${phase} must still enforce MOQ`);
    assert.equal(below.issue, 'BELOW_MOQ');
  }
});

// The Bunuan ceiling is round-scoped: once the round leaves bunuan_open it stops
// applying, and the product goes back to ordinary MOQ rules.
test('the Bunuan ceiling does not survive the round leaving bunuan_open', () => {
  const overCeiling = { quantity: 5, moq: 1, kitState: KIT_8_OF_10 };

  assert.equal(validateCartLine(line(overCeiling), 'bunuan_open').issue, 'BUNUAN_EXCEEDS_REMAINING');
  assert.equal(validateCartLine(line(overCeiling), 'bunuan_closed').ok, true);
});

// ---------------------------------------------------------------------------
// Multi-product cart
// ---------------------------------------------------------------------------

test('one failing product blocks checkout but the passing one is not flagged', () => {
  // The spec's cart example: Product A has MOQ 3 with only 2 in the cart,
  // Product B has MOQ 5 with 5. Checkout is blocked, and the error must sit
  // beside A only.
  const lines = [
    { productId: 'a', productName: 'Product A', quantity: 2, moq: 3, kitState: KIT_8_OF_10 },
    { productId: 'b', productName: 'Product B', quantity: 5, moq: 5, kitState: KIT_8_OF_10 },
  ];

  const verdict = validateCart(lines, 'active');

  assert.equal(verdict.canCheckout, false);
  assert.equal(verdict.byProduct.a.issue, 'BELOW_MOQ');
  assert.equal(verdict.byProduct.a.shortBy, 1);
  assert.equal(verdict.byProduct.b.ok, true);
});

test('every failing line is reported, not just the first', () => {
  const lines = [
    { productId: 'a', productName: 'A', quantity: 1, moq: 3, kitState: KIT_8_OF_10 },
    { productId: 'b', productName: 'B', quantity: 1, moq: 5, kitState: KIT_8_OF_10 },
  ];

  const verdict = validateCart(lines, 'active');

  assert.equal(verdict.byProduct.a.ok, false);
  assert.equal(verdict.byProduct.b.ok, false);
});

test('an empty cart cannot check out', () => {
  assert.equal(validateCart([], 'active').canCheckout, false);
});

// ---------------------------------------------------------------------------
// Quantity selector bounds
// ---------------------------------------------------------------------------

test('the quantity selector is capped at the Bunuan remainder', () => {
  // "2 remaining" must allow 1 and 2, never 3.
  assert.equal(maxQuantityFor(KIT_8_OF_10, 'bunuan_open'), 2);
});

test('normal ordering leaves the ceiling to the stock rules', () => {
  assert.equal(maxQuantityFor(KIT_8_OF_10, 'active'), null);
});

test('the quantity floor is the MOQ normally and 1 during Bunuan', () => {
  assert.equal(minQuantityFor(3, 'active'), 3);
  assert.equal(minQuantityFor(3, 'bunuan_open'), 1);
});

// ---------------------------------------------------------------------------
// Identity normalisation (Bunuan eligibility)
// ---------------------------------------------------------------------------

test('phone numbers written in any common format compare equal', () => {
  const expected = '9273823893';

  assert.equal(normalizePhone('0927 382 3893'), expected);
  assert.equal(normalizePhone('+639273823893'), expected);
  assert.equal(normalizePhone('63 927 382 3893'), expected);
  assert.equal(normalizePhone('(0927) 382-3893'), expected);
});

test('a too-short phone is kept as-is rather than silently truncated', () => {
  assert.equal(normalizePhone('123'), '123');
});

test('names compare equal across casing, punctuation and spacing', () => {
  assert.equal(normalizeName('Ma. Teresa Cruz'), 'ma teresa cruz');
  assert.equal(normalizeName('  MA TERESA  CRUZ '), 'ma teresa cruz');
});

test('accented names are folded to plain letters', () => {
  assert.equal(normalizeName('José Niño'), 'jose nino');
});

test('emails compare equal across casing and surrounding space', () => {
  assert.equal(normalizeEmail('  Buyer@Example.COM '), 'buyer@example.com');
});

test('blank identity input normalises to empty, never to a wildcard', () => {
  // gb_is_bunuan_eligible_customer refuses empty values; this guarantees the
  // client agrees, so a blank form can never look like a match.
  assert.equal(normalizeEmail(null), '');
  assert.equal(normalizePhone(undefined), '');
  assert.equal(normalizeName('   '), '');
});

// ===========================================================================
// SQL PARITY
// ===========================================================================
// The database is the authority; the cases above only mirror it. Run these in
// the Supabase SQL editor after applying migration 20260922000002 — each must
// agree with the matching test above.
//
//   -- kit arithmetic (8/10, 17/10, 27/10, 20/10, 0/10)
//   select * from gb_kit_state('<gb-uuid>', '<product-uuid>');
//
//   -- which orders count
//   select gb_order_counts_toward_kit('new','pending')       as should_be_true,
//          gb_order_counts_toward_kit('cancelled','paid')    as should_be_false,
//          gb_order_counts_toward_kit('new','failed')        as should_be_false;
//
//   -- identity normalisation
//   select gb_norm_phone('0927 382 3893') = gb_norm_phone('+639273823893') as should_be_true,
//          gb_norm_name('Ma. Teresa Cruz')                                 as should_be_ma_teresa_cruz,
//          gb_norm_name('José Niño')                                       as should_be_jose_nino,
//          gb_norm_email('  Buyer@Example.COM ')                           as should_be_lowercased;
// ===========================================================================
