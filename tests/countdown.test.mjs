/**
 * Unit tests for the Group Buy closing countdown (src/utils/countdown.ts).
 *
 * The storefront banner shows a live "ordering closes in DD HH MM SS" timer
 * driven by group_buys.end_date. Two behaviours matter more than the arithmetic:
 *
 *  1. The timer must NEVER render negative numbers. The admin flips a round's
 *     status by hand, so end_date routinely passes while the round is still
 *     'active' — that is the normal case, not an edge case. Past deadlines clamp
 *     to zero and report isExpired so the UI can switch to "closing now".
 *  2. `now` is a parameter, not Date.now(). The hook owns the clock; this module
 *     stays pure so every boundary below is deterministic.
 *
 * Runs under Node's built-in runner with native TS type-stripping:
 *   node --experimental-strip-types --test tests/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTimeRemaining, formatUnit } from '../src/utils/countdown.ts';

// A fixed reference point so every case reads as an offset from one clock.
const NOW = Date.parse('2026-08-20T10:00:00.000Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// end_date is stored as timestamptz and arrives as an ISO string from Supabase.
const isoIn = (ms) => new Date(NOW + ms).toISOString();

test('splits a multi-day remainder into days, hours, minutes and seconds', () => {
  // Arrange — 4 days, 4 hours, 26 minutes, 37 seconds out
  const endDate = isoIn(4 * DAY + 4 * HOUR + 26 * MINUTE + 37 * SECOND);

  // Act
  const remaining = getTimeRemaining(endDate, NOW);

  // Assert
  assert.deepEqual(
    { days: remaining.days, hours: remaining.hours, minutes: remaining.minutes, seconds: remaining.seconds },
    { days: 4, hours: 4, minutes: 26, seconds: 37 }
  );
  assert.equal(remaining.isExpired, false);
});

test('reports the last minute as seconds only, with zeroed larger units', () => {
  // Arrange
  const endDate = isoIn(45 * SECOND);

  // Act
  const remaining = getTimeRemaining(endDate, NOW);

  // Assert
  assert.deepEqual(
    { days: remaining.days, hours: remaining.hours, minutes: remaining.minutes, seconds: remaining.seconds },
    { days: 0, hours: 0, minutes: 0, seconds: 45 }
  );
});

test('rolls a whole day over without leaking hours', () => {
  // Arrange — exactly 24h must read 1 day 0 hours, not 0 days 24 hours
  const endDate = isoIn(DAY);

  // Act
  const remaining = getTimeRemaining(endDate, NOW);

  // Assert
  assert.deepEqual(
    { days: remaining.days, hours: remaining.hours, minutes: remaining.minutes, seconds: remaining.seconds },
    { days: 1, hours: 0, minutes: 0, seconds: 0 }
  );
});

test('clamps to zero instead of counting negative once the deadline has passed', () => {
  // Arrange — the admin has not closed the round yet, three hours after end_date
  const endDate = isoIn(-3 * HOUR);

  // Act
  const remaining = getTimeRemaining(endDate, NOW);

  // Assert — every unit floors at zero; nothing may render as "-3"
  assert.deepEqual(
    { days: remaining.days, hours: remaining.hours, minutes: remaining.minutes, seconds: remaining.seconds },
    { days: 0, hours: 0, minutes: 0, seconds: 0 }
  );
  assert.equal(remaining.totalMs, 0);
  assert.equal(remaining.isExpired, true);
});

test('treats the exact deadline instant as expired', () => {
  // Arrange
  const endDate = isoIn(0);

  // Act
  const remaining = getTimeRemaining(endDate, NOW);

  // Assert
  assert.equal(remaining.totalMs, 0);
  assert.equal(remaining.isExpired, true);
});

test('is not expired with one second left', () => {
  // Arrange — the boundary immediately before "closing now" takes over
  const endDate = isoIn(SECOND);

  // Act
  const remaining = getTimeRemaining(endDate, NOW);

  // Assert
  assert.equal(remaining.seconds, 1);
  assert.equal(remaining.isExpired, false);
});

test('returns null when the round has no end date set', () => {
  // Arrange — end_date is nullable; the admin may open a round without one

  // Act & Assert — the banner renders without a countdown rather than breaking
  assert.equal(getTimeRemaining(null, NOW), null);
  assert.equal(getTimeRemaining(undefined, NOW), null);
  assert.equal(getTimeRemaining('', NOW), null);
});

test('returns null for an unparseable end date instead of rendering NaN', () => {
  // Arrange
  const endDate = 'not a date';

  // Act
  const remaining = getTimeRemaining(endDate, NOW);

  // Assert
  assert.equal(remaining, null);
});

test('exposes the total remaining milliseconds for urgency styling', () => {
  // Arrange — under an hour is where the UI escalates its treatment
  const endDate = isoIn(30 * MINUTE);

  // Act
  const remaining = getTimeRemaining(endDate, NOW);

  // Assert
  assert.equal(remaining.totalMs, 30 * MINUTE);
});

test('pads single-digit units to two characters for a fixed-width display', () => {
  // Arrange & Act & Assert — keeps digit cells from reflowing every second
  assert.equal(formatUnit(0), '00');
  assert.equal(formatUnit(7), '07');
  assert.equal(formatUnit(37), '37');
});

test('does not truncate units that exceed two digits', () => {
  // Arrange — a long round can legitimately open more than 99 days out

  // Act & Assert
  assert.equal(formatUnit(128), '128');
});
