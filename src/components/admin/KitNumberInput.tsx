import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

/**
 * A small inline number field that saves itself.
 *
 * Commits on blur or Enter, reverts on Escape, and shows its own saving /
 * saved / error state so an admin editing a long list always knows whether a
 * value actually stuck. Blank means "use the product default" (null).
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  label: string;
  value: number | null;
  /** The product's own value, shown as the placeholder and hint. */
  fallback: number | null;
  fallbackLabel: string;
  onSave: (next: number | null) => Promise<void>;
};

const SAVED_BADGE_MS = 1500;

function parse(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Math.floor(Number(trimmed));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export default function KitNumberInput({ label, value, fallback, fallbackLabel, onSave }: Props) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the server value when it changes elsewhere (refresh, realtime).
  useEffect(() => {
    setDraft(value === null ? '' : String(value));
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const commit = async () => {
    const next = parse(draft);
    if (next === value) {
      setDraft(value === null ? '' : String(value));
      return;
    }
    setState('saving');
    try {
      await onSave(next);
      setState('saved');
      timer.current = setTimeout(() => setState('idle'), SAVED_BADGE_MS);
    } catch {
      setState('error');
      setDraft(value === null ? '' : String(value));
    }
  };

  const isOverridden = value !== null;
  const hint = isOverridden
    ? `This round only · product default ${fallback ?? 'none'}`
    : `Using product default${fallback === null ? ' (none)' : ''}`;

  return (
    <div className="min-w-[7.5rem]">
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          aria-label={label}
          value={draft}
          placeholder={fallback === null ? fallbackLabel : String(fallback)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(value === null ? '' : String(value));
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={`w-full rounded-lg border px-2.5 py-1.5 pr-7 text-sm font-semibold tabular-nums transition-colors
            focus:outline-none focus:ring-2 focus:ring-purple-300
            ${isOverridden ? 'border-purple-300 bg-purple-50 text-purple-900' : 'border-gray-200 bg-white text-gray-900'}
            ${state === 'error' ? 'border-red-400 ring-2 ring-red-100' : ''}`}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
          {state === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          {state === 'saved' && <Check className="h-3.5 w-3.5 text-green-600" />}
        </span>
      </div>
      <p className={`mt-1 text-[11px] leading-tight ${state === 'error' ? 'text-red-600' : 'text-gray-400'}`}>
        {state === 'error' ? 'Not saved — try again' : hint}
      </p>
    </div>
  );
}
