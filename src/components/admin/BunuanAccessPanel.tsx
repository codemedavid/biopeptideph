import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Info, Loader2, Mail, RefreshCw, Trash2, UserCheck, CheckCircle2 } from 'lucide-react';
import type { GroupBuy } from '../../types';
import {
  allowInBunuan, grantErrorMessage, listBunuanGrants, removeBunuanGrant, type BunuanGrant,
} from '../../lib/bunuanGrantsApi';

/**
 * Bunuan Access for one Group Buy round.
 *
 * Bunuan is normally open only to customers whose name + email + phone match an
 * earlier order in the same round. When a returning customer typed their details
 * differently, the admin adds their email here and they are let in — for this
 * round only. Grants are admin-only data, so everything goes through the admin
 * API rather than the browser's anon key.
 */

interface BunuanAccessPanelProps {
  groupBuy: GroupBuy;
  onBack: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NOTE = 300;
const NOTICE_MS = 3000;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const BunuanAccessPanel: React.FC<BunuanAccessPanelProps> = ({ groupBuy, onBack }) => {
  const [grants, setGrants] = useState<BunuanGrant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setGrants(await listBunuanGrants(groupBuy.id));
    } catch (err) {
      setLoadError(grantErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [groupBuy.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setFormError('Enter a valid email address.');
      return;
    }
    setFormError(null);
    setIsSaving(true);
    try {
      const grant = await allowInBunuan(groupBuy.id, clean, note.trim() || undefined);
      setGrants((prev) => [grant, ...prev.filter((g) => g.id !== grant.id)]);
      setEmail('');
      setNote('');
      setNotice(`${grant.customer_email} can now order in Bunuan for GB #${groupBuy.gb_number}.`);
    } catch (err) {
      setFormError(grantErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (grant: BunuanGrant) => {
    if (!window.confirm(`Remove Bunuan access for ${grant.customer_email}?`)) return;
    setRemovingId(grant.id);
    try {
      await removeBunuanGrant(groupBuy.id, grant.id);
      setGrants((prev) => prev.filter((g) => g.id !== grant.id));
      setNotice(`Removed access for ${grant.customer_email}.`);
    } catch (err) {
      setLoadError(grantErrorMessage(err));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <button onClick={onBack} className="mb-1 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft className="h-4 w-4" /> Back to rounds
          </button>
          <h3 className="text-lg md:text-xl font-bold text-gray-900">Bunuan Access — GB #{groupBuy.gb_number}</h3>
          <p className="text-sm text-gray-500">Let a specific customer order in Bunuan for this round.</p>
        </div>
        <button
          onClick={load}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* How it works */}
      <div className="mb-5 flex gap-2.5 rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-2.5 text-[13px] text-purple-900">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-500" />
        <p>
          Customers normally must match the <b>name + email + phone</b> of an earlier order in this round.
          Add an email here to let that customer into Bunuan even if their name or phone was typed differently.
          <span className="text-purple-800/80"> Access is for this round only.</span>
        </p>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} noValidate className="mb-5 rounded-xl border border-gray-200 p-3 md:p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-start">
          <div>
            <label htmlFor="bunuan-email" className="mb-1 block text-xs font-semibold text-gray-700">Customer email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="bunuan-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (formError) setFormError(null); }}
                placeholder="customer@example.com"
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? 'bunuan-email-error' : undefined}
                className={`w-full rounded-lg border py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                  formError ? 'border-red-400' : 'border-gray-200'
                }`}
              />
            </div>
          </div>
          <div>
            <label htmlFor="bunuan-note" className="mb-1 block text-xs font-semibold text-gray-700">
              Note <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id="bunuan-note"
              type="text"
              maxLength={MAX_NOTE}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. used her full name this time"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
          <button
            type="submit"
            disabled={isSaving || !email.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50 md:mt-5"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            Allow in Bunuan
          </button>
        </div>
        {formError && <p id="bunuan-email-error" role="alert" className="mt-2 text-xs font-medium text-red-600">{formError}</p>}
        {notice && (
          <p role="status" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> {notice}
          </p>
        )}
      </form>

      {/* List */}
      {loadError && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{loadError}</p>
      )}
      {isLoading && grants.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : grants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
          <UserCheck className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="font-semibold text-gray-700">No one added yet</p>
          <p className="mt-1 text-sm text-gray-500">Customers who match an earlier order get in automatically — add an email only for exceptions.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          <li className="bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {grants.length} {grants.length === 1 ? 'customer' : 'customers'} allowed
          </li>
          {grants.map((g) => (
            <li key={g.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{g.customer_email}</p>
                <p className="text-xs text-gray-500">
                  {g.note ? <>{g.note} · </> : null}Added {formatDate(g.granted_at)}
                </p>
              </div>
              <button
                onClick={() => handleRemove(g)}
                disabled={removingId === g.id}
                aria-label={`Remove Bunuan access for ${g.customer_email}`}
                className="flex items-center gap-1.5 self-start rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 sm:self-auto"
              >
                {removingId === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BunuanAccessPanel;
