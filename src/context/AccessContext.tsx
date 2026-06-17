/**
 * Global access-gate state. Holds whether the visitor has a valid session,
 * runs the initial check, and keeps the session alive by pinging the server on
 * real user activity (throttled). When the server says the session is gone
 * (expired or invalidated by an admin code change), state flips to 'unauthed'
 * and the <AccessGate> swaps the whole app for the access-code page.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { checkSession, logout as apiLogout } from '../lib/accessApi';

type Status = 'loading' | 'authed' | 'unauthed';

interface AccessContextValue {
  status: Status;
  /** Re-check the session against the server (e.g. right after a successful code entry). */
  refresh: () => Promise<void>;
  /** Log out and drop to the access-code page. */
  logout: () => Promise<void>;
}

const AccessContext = createContext<AccessContextValue | null>(null);

// Don't ping more than once per this interval, however much the user moves.
const HEARTBEAT_THROTTLE_MS = 60_000; // 60s

export function AccessProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const lastPing = useRef(0);

  const refresh = useCallback(async () => {
    const ok = await checkSession();
    setStatus(ok ? 'authed' : 'unauthed');
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setStatus('unauthed');
  }, []);

  // Initial gate check on first load.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Activity-driven heartbeat: every interaction (throttled) refreshes the
  // rolling 15-minute server session and detects expiry/invalidation.
  useEffect(() => {
    if (status !== 'authed') return;

    const onActivity = async () => {
      const now = Date.now();
      if (now - lastPing.current < HEARTBEAT_THROTTLE_MS) return;
      lastPing.current = now;
      const ok = await checkSession();
      if (!ok) setStatus('unauthed');
    };

    const events: (keyof DocumentEventMap)[] = [
      'click',
      'keydown',
      'mousemove',
      'scroll',
      'touchstart',
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    // Also re-check when the tab regains focus (it may have idled past 15 min).
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        lastPing.current = 0; // force the next activity to ping
        onActivity();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status]);

  return (
    <AccessContext.Provider value={{ status, refresh, logout }}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess(): AccessContextValue {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error('useAccess must be used within <AccessProvider>');
  return ctx;
}
