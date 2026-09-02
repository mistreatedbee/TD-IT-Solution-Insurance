import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../customer/api/errors';
import { listPublicPlans, type PlanCatalogItem } from '../customer/api/plans';
import { API_HOST } from '../customer/api/config';
import { MARKETING_PLAN_CATALOG_FALLBACK } from '../lib/marketing-plan-catalog-fallback';
import { mapUserFacingError } from '../lib/user-facing-errors';

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
      return { plans: MARKETING_PLAN_CATALOG_FALLBACK, usingFallback: true, error: null };
    }
    return { plans: live, usingFallback: false, error: null };
  } catch (err) {
    const isNetwork = err instanceof TypeError;
    const canUseFallback =
      isNetwork || (err instanceof ApiError && (err.status === 404 || err.status >= 500));

    if (canUseFallback) {
      let error: string | null = null;
      if (isNetwork) {
        error = `Could not reach ${API_HOST}. Showing plan guide — live pricing loads at sign-up.`;
      } else if (err instanceof ApiError && err.status !== 404) {
        error = 'Live plan pricing is temporarily unavailable. Showing plan guide.';
      }
      return { plans: MARKETING_PLAN_CATALOG_FALLBACK, usingFallback: true, error };
    }

    return { plans: [], usingFallback: false, error: mapUserFacingError(err, { context: 'policy' }) };
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

  const retry = useCallback(async () => {
    setLoading(true);
    setError(null);
    applyResult(await fetchPublicPlans());
  }, [applyResult]);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicPlans().then((result) => {
      if (!cancelled) applyResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyResult]);

  return { plans, loading, error, usingFallback, retry };
}
