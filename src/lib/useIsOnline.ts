import { useEffect, useState } from 'react';

function currentlyOnline(): boolean {
  // SSR/non-browser guard: this app is a client-only Vite/SPA, so `navigator`
  // should always exist at runtime — default to `true` defensively if not.
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Connectivity signal only — not a guarantee the API itself is reachable.
 * Mirrors the scope of the mobile `useIsOnline()` hook (`mobile/src/network/NetworkProvider.tsx`,
 * backed by `@react-native-community/netinfo`): seeds from the current online/offline state,
 * then tracks the browser's `online`/`offline` window events. No polling, no backend
 * reachability probe.
 *
 * `navigator.onLine` is a known-imperfect signal (it reflects network-adapter state, not
 * actual internet/API reachability) — callers still need to handle ambiguous failures that
 * happen despite this hook reporting `true`; see `isNetworkError` in `network-error.ts`.
 */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(currentlyOnline);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    if (typeof window === 'undefined') return;
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
