import { useState } from 'react';
import { CheckCircle2, Loader2, UserCheck } from 'lucide-react';
import { allowInBunuan, grantErrorMessage } from '../../lib/bunuanGrantsApi';

/**
 * One-click Bunuan access from an order: lets this order's customer email into
 * Bunuan for the order's round, even if they later type their name or phone
 * differently. Idempotent on the server, so clicking twice is harmless.
 */

type Props = {
  groupBuyId: string;
  email: string;
  orderLabel: string;
};

type State = 'idle' | 'saving' | 'done' | 'error';

export default function AllowInBunuanButton({ groupBuyId, email, orderLabel }: Props) {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setState('saving');
    setError(null);
    try {
      await allowInBunuan(groupBuyId, email, `From order ${orderLabel}`);
      setState('done');
    } catch (err) {
      setError(grantErrorMessage(err));
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <span role="status" className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Allowed in Bunuan
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'saving'}
        title="Let this customer order in Bunuan for this round, even if their name or phone doesn't match"
        className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-50"
      >
        {state === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
        Allow in Bunuan
      </button>
      {error && <span role="alert" className="text-[11px] font-medium text-red-600">{error}</span>}
    </span>
  );
}
