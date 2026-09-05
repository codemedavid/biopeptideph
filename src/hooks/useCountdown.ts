import { useEffect, useState } from 'react';
import { getTimeRemaining, type TimeRemaining } from '../utils/countdown';

const TICK_MS = 1000;

/**
 * Live countdown to an ISO deadline, re-rendering once per second.
 *
 * Keep this in a leaf component. The tick sets state every second, so hoisting
 * it into a screen-level component would re-render that whole subtree — on the
 * homepage that is the entire product grid, once per second.
 *
 * @param endDate group_buys.end_date (ISO string), or null for no deadline
 * @returns the remaining time, or null when there is nothing to count down to
 */
export function useCountdown(endDate: string | null | undefined): TimeRemaining | null {
  const [remaining, setRemaining] = useState<TimeRemaining | null>(() =>
    getTimeRemaining(endDate, Date.now())
  );

  useEffect(() => {
    let intervalId = 0;

    // Recompute from the wall clock every tick rather than decrementing a
    // counter. Background tabs throttle setInterval to roughly once a minute,
    // so a counter would drift by however long the tab was hidden; reading the
    // clock means a throttled tick is late, never wrong.
    const sync = () => {
      const next = getTimeRemaining(endDate, Date.now());
      setRemaining(next);
      // Nothing left to count: stop waking the tab up every second.
      if (!next || next.isExpired) window.clearInterval(intervalId);
    };

    sync();
    intervalId = window.setInterval(sync, TICK_MS);
    // Returning to a throttled tab can leave the display seconds stale.
    document.addEventListener('visibilitychange', sync);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [endDate]);

  return remaining;
}
