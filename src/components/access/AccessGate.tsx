/**
 * Root-level gate. Wrap the entire app in this once (in main.tsx) and EVERY
 * route is protected automatically — there is no way to render the app without
 * a valid session, and expiry/invalidation drops straight back to the code page.
 *
 *   loading  -> spinner
 *   unauthed -> <AccessCodePage />
 *   authed   -> the real app (children)
 *
 * EXEMPT routes (below) bypass the gate entirely. /admin is exempt because the
 * AdminDashboard has its OWN password login, so the site access code would be
 * redundant there.
 */
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAccess } from '../../context/AccessContext';
import AccessCodePage from '../../pages/AccessCodePage';

// Path prefixes that skip the site-wide access code (they self-authenticate).
const EXEMPT_PREFIXES = ['/admin'];

function isExemptPath(pathname: string): boolean {
  return EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export default function AccessGate({ children }: { children: ReactNode }) {
  const { status } = useAccess();

  // Exempt routes (e.g. /admin) render directly without the access code.
  // The gate sits above the router, so we read the path from the browser;
  // exempt pages are only ever reached by a direct URL load, which is exactly
  // when this check runs.
  if (isExemptPath(window.location.pathname)) {
    return <>{children}</>;
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (status === 'unauthed') {
    return <AccessCodePage />;
  }

  return <>{children}</>;
}
