/**
 * Optional per-route guard, for when you'd rather protect individual
 * <Route>s instead of (or in addition to) the root <AccessGate>.
 *
 * Example (inside <Routes>):
 *   <Route path="/admin" element={
 *     <ProtectedRoute><AdminDashboard /></ProtectedRoute>
 *   } />
 *
 * If the root <AccessGate> already wraps the app, you typically don't need
 * this — it's provided because the spec asked for a ProtectedRoute component.
 */
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAccess } from '../../context/AccessContext';
import AccessCodePage from '../../pages/AccessCodePage';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAccess();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (status === 'unauthed') {
    // Render the access page in place of the protected content.
    return <AccessCodePage />;
  }

  return <>{children}</>;
}
