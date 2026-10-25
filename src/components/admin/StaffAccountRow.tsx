/**
 * One staff account in the owner's Staff Accounts panel: shows what the account
 * can open and lets the owner change its sections, reset its password, disable
 * it, or delete it. Every change is saved on the server immediately.
 */
import { useState, type FormEvent } from 'react';
import { KeyRound, Loader2, Pencil, Power, Trash2, UserRound } from 'lucide-react';
import { ADMIN_FEATURE_INFO, type AdminFeature } from '../../lib/adminFeatures';
import {
  deleteStaff,
  generateStaffPassword,
  staffErrorMessage,
  updateStaff,
  type StaffAccount,
  type StaffResult,
} from '../../lib/adminStaffApi';
import StaffFeatureChecklist from './StaffFeatureChecklist';

type Mode = 'view' | 'edit' | 'password' | 'confirm-delete';

type Props = {
  account: StaffAccount;
  onChanged: (account: StaffAccount) => void;
  onDeleted: (id: string) => void;
};

const LABELS = new Map(ADMIN_FEATURE_INFO.map((f) => [f.key, f.label]));

function formatLastLogin(value: string | null): string {
  if (!value) return 'Never logged in';
  return `Last login ${new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
}

export default function StaffAccountRow({ account, onChanged, onDeleted }: Props) {
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState<AdminFeature[]>(account.permissions);
  const [newPassword, setNewPassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setDraft(account.permissions);
    setNewPassword(next === 'password' ? generateStaffPassword() : '');
  };

  async function run<T>(action: () => Promise<StaffResult<T>>, onOk: (data: T) => void) {
    setIsBusy(true);
    setError(null);
    const result = await action();
    setIsBusy(false);
    if (!result.ok) {
      setError(staffErrorMessage(result.error));
      return;
    }
    onOk(result.data);
  }

  const saveSections = () =>
    run(
      () => updateStaff(account.id, { permissions: draft }),
      (updated) => {
        onChanged(updated);
        setMode('view');
        setNotice('Sections updated — applies on their next click.');
      }
    );

  const savePassword = (e: FormEvent) => {
    e.preventDefault();
    run(
      () => updateStaff(account.id, { password: newPassword }),
      (updated) => {
        onChanged(updated);
        setMode('view');
        setNotice(`New password saved: ${newPassword} — give it to ${account.email}.`);
      }
    );
  };

  const toggleActive = () =>
    run(
      () => updateStaff(account.id, { active: !account.active }),
      (updated) => {
        onChanged(updated);
        setNotice(updated.active ? 'Account enabled.' : 'Account disabled — they are signed out.');
      }
    );

  const remove = () => run(() => deleteStaff(account.id), () => onDeleted(account.id));

  const statusBadge = account.active ? (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Active</span>
  ) : (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">Disabled</span>
  );

  return (
    <li className={`rounded-xl border bg-white p-4 md:p-5 shadow-soft ${account.active ? 'border-gray-100' : 'border-dashed border-gray-300'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg bg-theme-accent/10 p-2">
            <UserRound className="h-5 w-5 text-theme-accent" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold text-gray-900">{account.email}</p>
              {statusBadge}
            </div>
            <p className="text-xs text-gray-500">{formatLastLogin(account.last_login_at)}</p>
          </div>
        </div>

        {mode === 'view' && (
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" onClick={() => switchMode('edit')} disabled={isBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-700 hover:border-theme-accent hover:text-theme-accent">
              <Pencil className="h-4 w-4" aria-hidden="true" /> Sections
            </button>
            <button type="button" onClick={() => switchMode('password')} disabled={isBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-700 hover:border-theme-accent hover:text-theme-accent">
              <KeyRound className="h-4 w-4" aria-hidden="true" /> Reset password
            </button>
            <button type="button" onClick={toggleActive} disabled={isBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-700 hover:border-amber-500 hover:text-amber-700">
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Power className="h-4 w-4" aria-hidden="true" />}
              {account.active ? 'Disable' : 'Enable'}
            </button>
            <button type="button" onClick={() => switchMode('confirm-delete')} disabled={isBusy} aria-label={`Delete ${account.email}`} className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1.5 text-red-600 hover:border-red-400 hover:bg-red-50">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {mode === 'view' && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {account.permissions.length === 0 ? (
            <span className="text-xs italic text-gray-500">No sections yet — they will see an empty dashboard.</span>
          ) : (
            account.permissions.map((p) => (
              <span key={p} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                {LABELS.get(p) ?? p}
              </span>
            ))
          )}
        </div>
      )}

      {mode === 'edit' && (
        <div className="mt-4 space-y-3">
          <StaffFeatureChecklist idPrefix={`staff-${account.id}`} selected={draft} onChange={setDraft} isDisabled={isBusy} />
          <div className="flex gap-2">
            <button type="button" onClick={saveSections} disabled={isBusy} className="inline-flex items-center gap-2 rounded-lg bg-theme-accent px-4 py-2 text-sm font-semibold text-white hover:bg-theme-accent/90 disabled:opacity-50">
              {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save sections
            </button>
            <button type="button" onClick={() => switchMode('view')} disabled={isBusy} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'password' && (
        <form onSubmit={savePassword} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <label htmlFor={`pw-${account.id}`} className="mb-1 block text-xs font-semibold text-gray-700">New password</label>
            <input id={`pw-${account.id}`} type="text" autoComplete="off" spellCheck={false} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} maxLength={72} required className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:border-theme-accent focus:ring-2 focus:ring-theme-accent" />
          </div>
          <button type="submit" disabled={isBusy || newPassword.length < 8} className="inline-flex items-center gap-2 rounded-lg bg-theme-accent px-4 py-2 text-sm font-semibold text-white hover:bg-theme-accent/90 disabled:opacity-50">
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save password
          </button>
          <button type="button" onClick={() => switchMode('view')} disabled={isBusy} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
        </form>
      )}

      {mode === 'confirm-delete' && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="flex-1 text-sm text-red-800">Delete {account.email}? They will be signed out and cannot log in again.</p>
          <button type="button" onClick={remove} disabled={isBusy} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Delete
          </button>
          <button type="button" onClick={() => switchMode('view')} disabled={isBusy} className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100">
            Keep
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
    </li>
  );
}
