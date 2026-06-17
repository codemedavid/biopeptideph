/**
 * Root-level gate. Wrap the entire app in this once (in main.tsx) and EVERY
 * route is protected automatically — there is no way to render the app without
 * a valid session, and expiry/invalidation drops straight back to the code page.
 *
 *   loading  -> spinner
 *   unauthed -> <AccessCodePage />
 *   authed   -> the real app (children)
 */
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAccess } from '../../context/AccessContext';
import AccessCodePage from '../../pages/AccessCodePage';

export default function AccessGate({ children }: { children: ReactNode }) {
  const { status } = useAccess();

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
