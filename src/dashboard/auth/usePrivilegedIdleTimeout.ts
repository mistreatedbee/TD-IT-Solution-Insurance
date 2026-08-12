import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardAuth } from './DashboardAuthProvider';

/** Matches backend `DASHBOARD_IDLE_TIMEOUT_SECONDS` (FR-21 / SR-004-admin-10). */
export const DASHBOARD_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export function usePrivilegedIdleTimeout(loginPath: string) {
  const { status, signOut } = useDashboardAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status !== 'signed-in') return;

    let timer: ReturnType<typeof setTimeout>;

    function resetTimer() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void signOut().then(() => {
          navigate(`${loginPath}?reason=idle-timeout`, { replace: true });
        });
      }, DASHBOARD_IDLE_TIMEOUT_MS);
    }

    function onVisible() {
      if (document.visibilityState === 'visible') resetTimer();
    }

    resetTimer();
    window.addEventListener('pointerdown', resetTimer);
    window.addEventListener('keydown', resetTimer);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status, signOut, navigate, loginPath]);
}
