import React from 'react';
import { Clock, Flame } from 'lucide-react';

import { useCountdown } from '../hooks/useCountdown';
import { formatUnit } from '../utils/countdown';

type GroupBuyCountdownProps = {
  /** group_buys.end_date — renders nothing when the round has no deadline. */
  endDate: string | null;
  gbNumber?: string | number | null;
};

// Below these thresholds the card escalates from calm to urgent.
const URGENT_MS = 60 * 60 * 1000; // final hour
const SOON_MS = 24 * 60 * 60 * 1000; // final day

/**
 * Live "ordering closes in" card for the open Group Buy round.
 *
 * Owns its own 1s tick so the surrounding page (the whole product grid, on the
 * homepage) is not re-rendered every second.
 *
 * Past the deadline it switches to a "closing now" state rather than hiding:
 * the admin closes rounds by hand, so end_date passing does not mean ordering
 * has stopped — orders still count until the round's status flips.
 */
const GroupBuyCountdown: React.FC<GroupBuyCountdownProps> = ({ endDate, gbNumber }) => {
  const remaining = useCountdown(endDate);

  // No deadline set on this round: the banner stands on its own.
  if (!remaining || !endDate) return null;

  const roundLabel = gbNumber ? `Batch ${gbNumber}` : 'This round';
  // Screen readers get the absolute deadline once, instead of a per-second
  // live region reading four numbers aloud on every tick.
  const absoluteDeadline = new Date(endDate).toLocaleString(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  if (remaining.isExpired) {
    return (
      <div className="frost-soft rounded-[var(--r-md)] px-5 py-3 flex items-center justify-center gap-2.5 text-center">
        <Flame className="w-4 h-4 text-theme-secondary flex-shrink-0" aria-hidden="true" />
        <span className="font-display font-bold text-sm sm:text-[15px] text-theme-secondary">
          Closing now — final orders
        </span>
        <span className="sr-only">
          {roundLabel} ordering closed on {absoluteDeadline}. Final orders are still being collected.
        </span>
      </div>
    );
  }

  const isUrgent = remaining.totalMs < URGENT_MS;
  const isSoon = remaining.totalMs < SOON_MS;

  const cells = [
    { label: 'Days', value: remaining.days },
    { label: 'Hrs', value: remaining.hours },
    { label: 'Mins', value: remaining.minutes },
    { label: 'Secs', value: remaining.seconds },
  ];

  return (
    <div
      className={`frost-soft rounded-[var(--r-md)] px-6 sm:px-8 py-3.5 flex flex-col items-center ${
        isUrgent ? 'ring-1 ring-theme-secondary/40' : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Clock
          className={`w-3.5 h-3.5 flex-shrink-0 ${isSoon ? 'text-theme-secondary' : 'text-theme-accent'}`}
          aria-hidden="true"
        />
        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.12em] text-theme-text/60">
          {roundLabel} ordering closes in
        </span>
      </div>

      {/* Digits are decorative for assistive tech — the sr-only line below
          carries the same information without ticking. */}
      <div className="flex items-start gap-3 sm:gap-5 mt-1.5" aria-hidden="true">
        {cells.map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center">
            <span
              className={`font-display font-extrabold leading-none tabular-nums text-[clamp(26px,4.4vw,40px)] min-w-[2ch] text-center ${
                isUrgent ? 'text-theme-secondary' : 'text-theme-text'
              }`}
            >
              {formatUnit(value)}
            </span>
            <span className="mt-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.16em] text-theme-text/45">
              {label}
            </span>
          </div>
        ))}
      </div>

      <span className="sr-only">{roundLabel} ordering closes on {absoluteDeadline}.</span>
    </div>
  );
};

export default GroupBuyCountdown;
