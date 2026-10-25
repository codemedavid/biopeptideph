/**
 * Owner-only panel for staff logins. The owner creates an email + password for
 * each staff member and ticks the dashboard sections they may open; when that
 * staff member signs in at /admin with those details, the dashboard shows only
 * those sections. The server enforces the same list on its admin routes.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2, RefreshCw, UserPlus, Users } from 'lucide-react';
import type { AdminFeature } from '../../lib/adminFeatures';
import {
  createStaff,
  generateStaffPassword,
  listStaff,
  staffErrorMessage,
  type StaffAccount,
} from '../../lib/adminStaffApi';
import StaffFeatureChecklist from './StaffFeatureChecklist';
import StaffAccountRow from './StaffAccountRow';

type Props = { onBack: () => void };

export default function StaffManager({ onBack }: Props) {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => generateStaffPassword());
  const [isPasswordVisible, setIsPasswordVisible] = useState(true);
  const [permissions, setPermissions] = useState<AdminFeature[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const load = async () => {
    setIsLoading(true);
    setLoadError(null);
    const result = await listStaff();
    setIsLoading(false);
    if (result.ok) setAccounts(result.data);
    else setLoadError(staffErrorMessage(result.error));
  };

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (isCreating) return;
    setCreateError(null);
    setCreated(null);
    setIsCreating(true);
    const result = await createStaff({ email: email.trim(), password, permissions });
    setIsCreating(false);
    if (!result.ok) {
      setCreateError(staffErrorMessage(result.error));
      return;
    }
    setAccounts((prev) => [...prev, result.data]);
    setCreated({ email: result.data.email, password });
    setEmail('');
    setPassword(generateStaffPassword());
    setPermissions([]);
  }

  const replaceAccount = (updated: StaffAccount) =>
    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  const removeAccount = (id: string) => setAccounts((prev) => prev.filter((a) => a.id !== id));

  return (
    <div className="min-h-screen bg-theme-bg">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto flex h-16 items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
          </button>
          <div className="h-6 w-px bg-gray-200" />
          <h1 className="flex items-center gap-2 text-lg font-bold text-theme-text">
            <Users className="h-5 w-5 text-theme-accent" aria-hidden="true" /> Staff Accounts
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto space-y-8 px-4 py-6 sm:px-6 md:py-8">
        <section aria-labelledby="new-staff-heading" className="rounded-2xl border border-gray-100 bg-white p-5 md:p-7 shadow-soft">
          <h2 id="new-staff-heading" className="flex items-center gap-2 text-base font-bold text-gray-900">
            <UserPlus className="h-5 w-5 text-theme-accent" aria-hidden="true" /> New staff login
          </h2>
          <p className="mt-1 mb-5 text-sm text-gray-500">
            Give this email and password to your staff. When they sign in at the admin page, they only see the sections you tick here.
          </p>

          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="staff-email" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
                <input id="staff-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@gmail.com" required disabled={isCreating} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 focus:border-theme-accent focus:ring-2 focus:ring-theme-accent" />
              </div>
              <div>
                <label htmlFor="staff-password" className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input id="staff-password" type={isPasswordVisible ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={72} required disabled={isCreating} className="w-full rounded-lg border border-gray-200 py-2.5 pl-3 pr-10 font-mono text-sm focus:border-theme-accent focus:ring-2 focus:ring-theme-accent" />
                    <button type="button" onClick={() => setIsPasswordVisible((v) => !v)} aria-label={isPasswordVisible ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-700">
                      {isPasswordVisible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  <button type="button" onClick={() => setPassword(generateStaffPassword())} disabled={isCreating} title="Generate a new password" aria-label="Generate a new password" className="rounded-lg border border-gray-200 px-3 text-gray-600 hover:border-theme-accent hover:text-theme-accent">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">At least 8 characters.</p>
              </div>
            </div>

            <StaffFeatureChecklist idPrefix="new-staff" selected={permissions} onChange={setPermissions} isDisabled={isCreating} />

            {createError && <p role="alert" className="text-sm text-red-600">{createError}</p>}
            {created && (
              <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Staff login created. Send them: <strong>{created.email}</strong> / <code className="font-mono font-semibold">{created.password}</code>
              </div>
            )}

            <button type="submit" disabled={isCreating || !email.trim() || password.length < 8} className="inline-flex items-center gap-2 rounded-lg bg-theme-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-theme-accent/90 disabled:cursor-not-allowed disabled:opacity-50">
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
              {isCreating ? 'Creating…' : 'Create staff login'}
            </button>
          </form>
        </section>

        <section aria-labelledby="staff-list-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="staff-list-heading" className="text-base font-bold text-gray-900">
              Staff <span className="font-normal text-gray-500">({accounts.length})</span>
            </h2>
            <button type="button" onClick={load} disabled={isLoading} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-theme-accent">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
            </button>
          </div>

          {loadError && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
          {!loadError && !isLoading && accounts.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-8 text-center text-sm text-gray-500">
              No staff yet. Create the first login above.
            </p>
          )}
          <ul className="space-y-3">
            {accounts.map((account) => (
              <StaffAccountRow key={account.id} account={account} onChanged={replaceAccount} onDeleted={removeAccount} />
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
