/**
 * Unit tests for PHP <-> USD conversion (src/lib/exchange.ts).
 *
 * The peso price is the source of truth: the admin types a PHP price and one
 * exchange rate, and the USD price is derived from those. The bulk "USD -> PHP"
 * admin tool runs that derivation backwards, and because international_price is
 * stored rounded to two decimals, multiplying it back by the rate does NOT
 * return the original peso price:
 *
 *   ₱1,499 / 64 = 23.421875 -> stored as $23.42 -> 23.42 * 64 = ₱1,498.88
 *
 * Applying the tool therefore used to silently shave centavos off every
 * admin-entered peso price, every single time it ran. phpPriceUpdateFromUsd()
 * is the guard: it only reports a new peso price when the stored USD price
 * genuinely disagrees with the peso price at this rate, so a rate apply is
 * idempotent for prices that are already consistent.
 *
 *   node --experimental-strip-types --test tests/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_USD_PHP_RATE,
  normalizeRate,
  phpPriceUpdateFromUsd,
  phpToUsd,
  usdToPhp,
} from '../src/lib/exchange.ts';

const RATE = 64;

// --- The regression this suite exists for -----------------------------------

test('a peso price that already matches its USD price is left untouched by a USD->PHP apply', () => {
  // Arrange: ₱1,499 derived to $23.42 at ₱64/$1 — exactly what the PHP->USD
  // tool (or the product form) would have written.
  const php = 1499;
  const usd = phpToUsd(php, RATE);
  assert.equal(usd, 23.42);

  // Act
  const update = phpPriceUpdateFromUsd(usd, php, RATE);

  // Assert: no write at all. Naively converting back would give ₱1,498.88.
  assert.equal(update, null);
  assert.equal(usdToPhp(usd, RATE), 1498.88, 'the raw round-trip really does drift');
});

test('repeated USD->PHP applies never drift a consistent peso price', () => {
  // Arrange: prices whose round-trip drifts in both directions.
  for (const php of [1000, 1499, 2500, 349, 12999]) {
    const usd = phpToUsd(php, RATE);

    // Act: run the apply three times over, feeding each result back in.
    let current = php;
    for (let i = 0; i < 3; i++) {
      const update = phpPriceUpdateFromUsd(usd, current, RATE);
      if (update !== null) current = update;
    }

    // Assert
    assert.equal(current, php, `₱${php} drifted to ₱${current}`);
  }
});

// --- The tool still has to do its job ---------------------------------------

test('a USD price the admin actually changed rewrites the peso price', () => {
  // Arrange: stored ₱1,499 / $23.42, admin edits the USD price up to $25.00.
  // Act
  const update = phpPriceUpdateFromUsd(25, 1499, RATE);

  // Assert
  assert.equal(update, 1600);
});

test('a product with no peso price yet gets one from its USD price', () => {
  assert.equal(phpPriceUpdateFromUsd(23.42, null, RATE), 1498.88);
  assert.equal(phpPriceUpdateFromUsd(23.42, 0, RATE), 1498.88);
  assert.equal(phpPriceUpdateFromUsd(23.42, undefined, RATE), 1498.88);
});

test('a peso price that disagrees by more than rounding is corrected', () => {
  // ₱1,000 at ₱64/$1 is $15.63; a stored $15.60 is a real disagreement.
  assert.equal(phpToUsd(1000, RATE), 15.63);
  assert.equal(phpPriceUpdateFromUsd(15.6, 1000, RATE), 998.4);
});

test('a changed rate re-derives every peso price', () => {
  // Arrange: ₱1,499 / $23.42 was consistent at 64, but the admin now applies 58.
  // Act
  const update = phpPriceUpdateFromUsd(23.42, 1499, 58);

  // Assert: 23.42 * 58 — the old peso price is no longer consistent.
  assert.equal(update, 1358.36);
});

// --- Rows the apply must skip rather than zero out --------------------------

test('a product with no usable USD price is skipped, never written as free', () => {
  for (const usd of [null, undefined, 0, -5, NaN, 'abc']) {
    assert.equal(phpPriceUpdateFromUsd(usd, 1499, RATE), null, `usd=${String(usd)}`);
  }
});

test('an unusable rate is skipped rather than zeroing the peso price', () => {
  for (const rate of [0, -64, NaN, null, undefined]) {
    assert.equal(phpPriceUpdateFromUsd(23.42, 1499, rate), null, `rate=${String(rate)}`);
  }
});

// --- The primitives ---------------------------------------------------------

test('phpToUsd divides by the rate and rounds to centavos', () => {
  assert.equal(phpToUsd(1280, RATE), 20);
  assert.equal(phpToUsd(1000, RATE), 15.63);
  assert.equal(phpToUsd(1499, RATE), 23.42);
});

test('usdToPhp multiplies by the rate and rounds to centavos', () => {
  assert.equal(usdToPhp(20, RATE), 1280);
  assert.equal(usdToPhp(23.42, RATE), 1498.88);
});

test('conversions return 0 for prices or rates that cannot be converted', () => {
  assert.equal(phpToUsd(null, RATE), 0);
  assert.equal(phpToUsd(0, RATE), 0);
  assert.equal(phpToUsd(1499, 0), 0);
  assert.equal(usdToPhp(null, RATE), 0);
  assert.equal(usdToPhp(23.42, NaN), 0);
});

test('normalizeRate accepts saved string rates and rejects unusable ones', () => {
  assert.equal(normalizeRate('64'), 64);
  assert.equal(normalizeRate('58.5'), 58.5);
  assert.equal(normalizeRate(64), 64);
  assert.equal(normalizeRate(0), null);
  assert.equal(normalizeRate(-64), null);
  assert.equal(normalizeRate('abc'), null);
  assert.equal(normalizeRate(''), null);
  assert.equal(normalizeRate(null), null);
  assert.equal(normalizeRate(undefined), null);
});

test('the fallback rate is a usable positive rate', () => {
  assert.equal(normalizeRate(DEFAULT_USD_PHP_RATE), DEFAULT_USD_PHP_RATE);
});
