/**
 * DISPLAY-ONLY account query — architecture.md §2.3/§4.1/§5.1.
 *
 * This hook is for showing account info on screen (email on the profile
 * page, a name/greeting on the home screen). It is backed by TanStack
 * Query's persisted cache, so it can render something while offline.
 *
 * It must NEVER be used to decide whether a gated action (policy purchase,
 * asset registration) is allowed. That decision always goes through
 * `fetchLiveAccountForGating()` below, which bypasses the cache entirely
 * and always hits the network — per api-design.md §2.3's explicit rule
 * that `GET /account/me` exists specifically to be a live BR-2 gate check,
 * never served from a cached/persisted value for that purpose.
 */
import { useQuery } from '@tanstack/react-query';
import { getCurrentAccount } from '../api/auth';

export const ACCOUNT_QUERY_KEY = ['account', 'me'] as const;

export function useAccountQuery() {
  return useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: getCurrentAccount,
  });
}

/**
 * Always a fresh network call — used at the exact points a BR-2 gating
 * decision is made (tapping into the policy/asset-registration entry
 * points, ui-design.md §4.8). Never reads the persisted query cache.
 */
export async function fetchLiveAccountForGating() {
  return getCurrentAccount();
}
