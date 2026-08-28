import { useQuery } from '@tanstack/react-query';
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../../config/features';
import { ApiError } from '../errors';
import {
  getAssetLocationHistory,
  type LocationHistoryPage,
} from '../asset-location';

export function assetLocationHistoryQueryKey(assetId: string) {
  return ['assets', assetId, 'location-history'] as const;
}

const EMPTY_HISTORY: LocationHistoryPage = {
  data: [],
  pagination: { nextCursor: null, hasMore: false },
};

export function useAssetLocationHistoryQuery(assetId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: [...assetLocationHistoryQueryKey(assetId ?? ''), limit],
    queryFn: async () => {
      try {
        return await getAssetLocationHistory(assetId!, { limit });
      } catch (error) {
        if (error instanceof ApiError && (error.status === 404 || error.code === 'NOT_FOUND')) {
          return EMPTY_HISTORY;
        }
        throw error;
      }
    },
    enabled: FEATURE_LOCATION_TRACKING_ENABLED && Boolean(assetId),
    staleTime: 30_000,
    retry: false,
  });
}

export type { LocationHistoryPage };
