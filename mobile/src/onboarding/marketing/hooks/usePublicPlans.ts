import { useCallback, useEffect, useState } from 'react';
import { MARKETING_PLAN_CATALOG_FALLBACK } from '../../../api/plan-catalog-fallback';
import { listPublicPlans, type PlanCatalogItem } from '../../../api/plans';
import { ApiError, NetworkUnavailableError } from '../../../api/errors';
import { API_HOST } from '../../../api/config';

export function usePublicPlans() {
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUsingFallback(false);
    try {
      const res = await listPublicPlans();
      const live = res.data ?? [];
      if (live.length === 0) {
        setPlans(MARKETING_PLAN_CATALOG_FALLBACK);
        setUsingFallback(true);
      } else {
        setPlans(live);
      }
    } catch (err) {
      const canUseFallback =
        err instanceof NetworkUnavailableError ||
        (err instanceof ApiError && (err.status === 404 || err.status >= 500));

      if (canUseFallback) {
        setPlans(MARKETING_PLAN_CATALOG_FALLBACK);
        setUsingFallback(true);
        if (err instanceof NetworkUnavailableError) {
          setError(`Could not reach ${API_HOST}. Showing standard plan guide — live pricing loads after sign-in.`);
        } else if (err instanceof ApiError && err.status === 404) {
          setError(null);
        } else {
          setError('Live plan pricing is temporarily unavailable. Showing standard plan guide.');
        }
      } else if (err instanceof ApiError) {
        setError('Could not load plans right now. Please try again.');
        setPlans([]);
      } else {
        setError('Could not load plans right now. Please try again.');
        setPlans([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { plans, loading, error, usingFallback, retry: load };
}
