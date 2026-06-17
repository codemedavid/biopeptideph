/**
 * The access-code screen. Shown whenever there is no valid session. On success
 * it calls `refresh()` so the gate re-checks the (now-set) cookie and reveals
 * the app.
 */
import { useState, type FormEvent } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { verifyCode } from '../lib/accessApi';
import { useAccess } from '../context/AccessContext';

export default function AccessCodePage() {
  const { refresh } = useAccess();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    const result = await verifyCode(code.trim());

    if (result.ok) {
      setCode('');
      await refresh(); // gate flips to the app
      return;
    }

    if (result.reason === 'too_many_attempts') {
      setError('Too many attempts. Please wait a few minutes and try again.');
    } else if (result.reason === 'invalid_code') {
      setError('Incorrect access code. Please try again.');
    } else {
      setError('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8">
          {/* Brand / icon */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center mb-4">
              <Lock className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-white">Enter Access Code</h1>
            <p className="mt-2 text-sm text-slate-300">
              This site is private. Please enter the access code to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="access-code" className="sr-only">
                Access code
              </label>
              <input
                id="access-code"
                type="password"
                autoComplete="off"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Access code"
                className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/40"
                disabled={submitting}
              />
            </div>

            {error && (
              <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !code.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-white text-slate-900 font-medium px-4 py-3 transition hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Verifying…' : 'Unlock'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Sessions expire after 15 minutes of inactivity.
        </p>
      </div>
    </div>
  );
}
