/**
 * TanStack Query setup — architecture.md §4.
 *
 * On-device cache persistence via @tanstack/query-async-storage-persister
 * (AsyncStorage-backed — the query cache is non-sensitive, cacheable
 * *display* data, unlike the refresh token which lives in SecureStore
 * only; see auth/secure-storage.ts). This is deliberately being wired up
 * now, in the auth-only shell, so it is not a Phase 2 retrofit once real
 * policy/asset queries exist to persist (architecture.md §4.1).
 *
 * IMPORTANT per architecture.md §2.3/§5.1: `GET /account/me` (the one
 * query this Phase 1 app actually has) must NEVER be read from this
 * persisted cache for an authorization/gating decision — only for
 * display. Callers doing gating logic call src/api/auth.ts's
 * `getCurrentAccount()` directly (or use the query with
 * `staleTime: 0` and await a fresh fetch), not trust a persisted/stale
 * query result. See src/screens/ hooks for how this is applied.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { ApiError } from '../api/errors';
import { shouldPersistQuery } from './persistPolicy';

export { shouldPersistQuery } from './persistPolicy';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A future-defensive default for when real policy/asset queries
      // land (architecture.md §5.1) — display data can be a little stale
      // without it mattering; /account/me overrides this per-call.
      staleTime: 60 * 1000,
      retry: (failureCount, error) => {
        // Don't burn retries on a definitive 4xx (auth/validation errors)
        // — only retry on network failures / 5xx, and only a couple of
        // times, consistent with a mobile battery/network budget.
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'td_insurance.query_cache',
});
