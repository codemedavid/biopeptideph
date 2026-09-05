// Time-remaining arithmetic for the Group Buy closing countdown.
//
// Kept pure and clock-free on purpose: `now` is a parameter so the boundaries
// that actually matter (the exact deadline instant, one second before it, a
// deadline hours in the past) are testable without faking timers. The 1s tick
// lives in useCountdown; this module never reads Date.now().
//
// The clamp is the important part. A round's status is flipped by hand in the
// admin, so end_date regularly passes while the round is still 'active'. That
// is the normal case, not an edge case — a raw subtraction would put "-3" on
// the homepage.

export interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Milliseconds left, floored at 0. Drives urgency styling. */
  totalMs: number;
  /** True once the deadline is reached or past. */
  isExpired: boolean;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Split the time between `nowMs` and a round's end_date into display units.
 *
 * @param endDate group_buys.end_date — an ISO timestamptz string, or null when
 *   the admin opened the round without a deadline
 * @param nowMs current time in epoch milliseconds
 * @returns the remaining time, or null when there is no usable deadline to
 *   count down to (caller renders no countdown rather than NaN)
 */
export function getTimeRemaining(
  endDate: string | null | undefined,
  nowMs: number
): TimeRemaining | null {
  if (!endDate) return null;

  const endMs = new Date(endDate).getTime();
  if (Number.isNaN(endMs)) return null;

  const totalMs = Math.max(0, endMs - nowMs);

  return {
    days: Math.floor(totalMs / MS_PER_DAY),
    hours: Math.floor((totalMs % MS_PER_DAY) / MS_PER_HOUR),
    minutes: Math.floor((totalMs % MS_PER_HOUR) / MS_PER_MINUTE),
    seconds: Math.floor((totalMs % MS_PER_MINUTE) / MS_PER_SECOND),
    totalMs,
    isExpired: totalMs === 0,
  };
}

/**
 * Zero-pad a unit to two characters so digit cells keep a constant width and
 * the row does not reflow on every tick. Values past 99 are left intact.
 */
export function formatUnit(value: number): string {
  return String(value).padStart(2, '0');
}
