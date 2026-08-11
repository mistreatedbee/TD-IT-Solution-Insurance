/**
 * BR-2 write-path gating — architecture.md §2.3 / api-design.md §4.3.
 *
 * Every commerce-gated mutation (POST /policies, POST /assets) must be
 * preceded by a live GET /account/me check — never a cached query result.
 */
import type { useRouter } from 'expo-router';
import { fetchLiveAccountForGating } from './useAccountQuery';

export type GateWriteResult = 'verified' | 'verification_required' | 'error';

type AppRouter = ReturnType<typeof useRouter>;

export async function gateWriteAction(router: AppRouter): Promise<GateWriteResult> {
  try {
    const account = await fetchLiveAccountForGating();
    if (account.accountState === 'pending_verification') {
      router.push({
        pathname: '/verification-gate',
        params: { email: account.email },
      });
      return 'verification_required';
    }
    return 'verified';
  } catch {
    return 'error';
  }
}
