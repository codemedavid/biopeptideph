/**
 * Unit tests for site-settings value parsing (src/lib/settings.ts).
 *
 * Every row in `site_settings` is stored as text, and useSiteSettings used to
 * turn the numeric ones into numbers with a bare parseFloat:
 *
 *   usd_php_rate: parseFloat(row?.value || '64')
 *
 * A malformed row ("₱64", "sixty four", "  ") makes that NaN, and NaN then
 * flows straight through every consumer, because the guard they all use —
 * `siteSettings?.usd_php_rate ?? DEFAULT` — only catches null and undefined.
 * `NaN ?? 64` is NaN. That is how a checkout total rendered as "$NaN".
 *
 * parseNumericSetting() is the boundary guard: a stored value only survives if
 * it is a finite, non-negative number, otherwise the caller's fallback is used.
 *
 *   node --experimental-strip-types --test tests/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumericSetting } from '../src/lib/settings.ts';

test('a well-formed stored value is used', () => {
  assert.equal(parseNumericSetting('64', 56), 64);
  assert.equal(parseNumericSetting('58.5', 56), 58.5);
  assert.equal(parseNumericSetting('150', 150), 150);
});

test('a stored zero is honoured rather than replaced by the fallback', () => {
  // A waived admin fee and a 0% global discount are both legitimate.
  assert.equal(parseNumericSetting('0', 150), 0);
  assert.equal(parseNumericSetting(0, 150), 0);
});

test('surrounding whitespace does not break a stored number', () => {
  assert.equal(parseNumericSetting(' 64 ', 56), 64);
  assert.equal(parseNumericSetting('\n64\n', 56), 64);
});

test('a malformed stored value falls back instead of yielding NaN', () => {
  // This is the regression: each of these used to become NaN and propagate.
  for (const bad of ['', '   ', 'abc', '₱64', 'sixty four', null, undefined, {}, []]) {
    const value = parseNumericSetting(bad, 64);
    assert.ok(Number.isFinite(value), `${JSON.stringify(bad)} produced ${value}`);
    assert.equal(value, 64, `value=${JSON.stringify(bad)}`);
  }
});

test('a partially numeric value is rejected rather than silently truncated', () => {
  // parseFloat('64abc') is 64 — a saved rate of "64 pesos" must not quietly
  // become 64; it is a corrupt row and the caller's fallback is safer.
  assert.equal(parseNumericSetting('64abc', 56), 56);
  assert.equal(parseNumericSetting('64 pesos', 56), 56);
});

test('a non-finite or negative value falls back', () => {
  assert.equal(parseNumericSetting(NaN, 64), 64);
  assert.equal(parseNumericSetting(Infinity, 64), 64);
  assert.equal(parseNumericSetting('-Infinity', 64), 64);
  assert.equal(parseNumericSetting('-150', 150), 150);
  assert.equal(parseNumericSetting(-1, 150), 150);
});

test('booleans are not treated as numbers', () => {
  // Number(true) is 1 — a rate of ₱1/$1 would be catastrophic.
  assert.equal(parseNumericSetting(true, 64), 64);
  assert.equal(parseNumericSetting(false, 64), 64);
});
