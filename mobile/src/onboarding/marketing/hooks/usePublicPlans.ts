import { useCallback, useEffect, useState } from 'react';
import { MARKETING_PLAN_CATALOG_FALLBACK } from '../../../api/plan-catalog-fallback';
import { listPublicPlans, type PlanCatalogItem } from '../../../api/plans';
import { ApiError, NetworkUnavailableError } from '../../../api/errors';
import { mapUserFacingError } from '../../../lib/user-facing-errors';
import { API_HOST } from '../../../api/config';

type PublicPlansResult = {
  plans: PlanCatalogItem[];
  usingFallback: boolean;
  error: string | null;
};

async function fetchPublicPlans(): Promise<PublicPlansResult> {
  try {
    const res = await listPublicPlans();
    const live = res.data ?? [];
    if (live.length === 0) {
      return {
        plans: MARKETING_PLAN_CATALOG_FALLBACK,
        usingFallback: true,
        error: null,
      };
    }
    return { plans: live, usingFallback: false, error: null };
  } catch (err) {
    const canUseFallback =
      err instanceof NetworkUnavailableError ||
      (err instanceof ApiError && (err.status === 404 || err.status >= 500));

    if (canUseFallback) {
      let error: string | null = null;
      if (err instanceof NetworkUnavailableError) {
        error = `Could not reach ${API_HOST}. Showing standard plan guide — live pricing loads after sign-in.`;
      } else if (err instanceof ApiError && err.status === 404) {
        error = null;
      } else {
        error = 'Live plan pricing is temporarily unavailable. Showing standard plan guide.';
      }
      return {
        plans: MARKETING_PLAN_CATALOG_FALLBACK,
        usingFallback: true,
        error,
      };
    }

    return {
      plans: [],
      usingFallback: false,
      error: mapUserFacingError(err, { context: 'onboarding' }),
    };
  }
}

export function usePublicPlans() {
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const applyResult = useCallback((result: PublicPlansResult) => {
    setPlans(result.plans);
    setUsingFallback(result.usingFallback);
    setError(result.error);
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUsingFallback(false);
    applyResult(await fetchPublicPlans());
  }, [applyResult]);

  useEffect(() => {
    let cancelled = false;

    void fetchPublicPlans().then((result) => {
      if (!cancelled) {
        applyResult(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [applyResult]);

  return { plans, loading, error, usingFallback, retry: load };
}
