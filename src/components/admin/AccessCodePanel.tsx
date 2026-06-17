/**
 * Admin panel to rotate the site-wide access code.
 *
 * Security model: the change-code endpoint is authorized by the ADMIN_API_KEY
 * secret (NOT the dashboard's client-side password, which the server can't
 * trust). The admin pastes that key here at call time — it is sent once over
 * HTTPS as a Bearer token and never persisted in the frontend.
 *
 * Rotating the code bumps code_version on the server, which immediately
 * invalidates every active session: all visitors must re-enter the new code.
 */
import { useState, type FormEvent } from 'react';
import { ArrowLeft, KeyRound, Loader2, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { changeAccessCode } from '../../lib/accessApi';

export default function AccessCodePanel({ onBack }: { onBack: () => void }) {
  const [adminKey, setAdminKey] = useState('');
  const [newCode, setNewCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newCode.length < 6) {
      setError('New code must be at least 6 characters.');
      return;
    }
    if (newCode !== confirmCode) {
      setError('The two codes do not match.');
      return;
    }
    if (!adminKey.trim()) {
      setError('Enter the admin API key to authorize this change.');
      return;
    }

    setSubmitting(true);
    const result = await changeAccessCode(adminKey.trim(), newCode);
    setSubmitting(false);

    if (result.ok) {
      setSuccess(
        `Access code updated. All active sessions have been logged out and must re-enter the new code.`
      );
      setAdminKey('');
      setNewCode('');
      setConfirmCode('');
      return;
    }

    switch (result.reason) {
      case 'forbidden':
        setError('Invalid admin API key. Change not authorized.');
        break;
      case 'code_too_short':
        setError('New code must be at least 6 characters.');
        break;
      case 'too_many_attempts':
        setError('Too many attempts. Please wait a few minutes and try again.');
        break;
      default:
        setError('Something went wrong. Please try again.');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </button>

        <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-rose-50 rounded-lg">
              <KeyRound className="w-6 h-6 text-rose-600" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">
              Site Access Code
            </h1>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Change the code visitors must enter to view the site.
          </p>

          {/* Warning */}
          <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Changing the code <strong>immediately logs out every visitor</strong>.
              Everyone must re-enter the new code.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Admin API key
              </label>
              <input
                type="password"
                autoComplete="off"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="ADMIN_API_KEY (authorizes the change)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-400"
                disabled={submitting}
              />
              <p className="mt-1 text-xs text-gray-400">
                The server-side secret. Not stored — sent once to authorize this change.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New access code
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-400"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm new access code
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="Re-enter the new code"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-400"
                disabled={submitting}
              />
            </div>

            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {success && (
              <p className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-rose-600 text-white font-medium px-4 py-2.5 transition hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Updating…' : 'Update access code'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
