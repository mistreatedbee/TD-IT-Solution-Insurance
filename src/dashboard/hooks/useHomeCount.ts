import { useCallback, useEffect, useState } from 'react';

export interface UseHomeCountResult {
  status: 'loading' | 'loaded' | 'error';
  count: number | null;
  retry: () => void;
}

/**
 * Feature 012 FR-4 — fetches one operational count.
 *
 * SR-012-3.3 (`security-review.md` §7 item 3): fetches **once per mount**. No polling
 * interval, no auto-refresh, no focus/visibility-triggered refetch, no automatic
 * retry-with-backoff. `retry()` is exposed for a single-shot, user-initiated retry only
 * (the "Retry" affordance in `HomeScreen`'s error state) — it is never called by this hook
 * itself.
 *
 * This hook takes a `fetcher` supplied by the caller (each role's own Home wrapper page),
 * never an API client of its own — it lives under `src/dashboard/` but does not violate
 * C-012-A1, since it has no knowledge of which endpoint it is calling.
 */
export function useHomeCount(fetcher: () => Promise<number>): UseHomeCountResult {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [count, setCount] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetcher()
      .then((n) => {
        if (cancelled) return;
        setCount(n);
        setStatus('loaded');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher is intentionally
    // re-invoked only on mount or an explicit retry() call (`attempt`), never on identity
    // change of `fetcher` itself, per SR-012-3.3's "once per mount, no auto-refetch" rule.
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { status, count, retry };
}
