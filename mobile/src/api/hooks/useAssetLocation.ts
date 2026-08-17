import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAssetLocation,
  listAssetLocationSummary,
  reportAssetLocation,
  type AssetLocationSummaryPage,
  type LocationReportRequest,
} from '../asset-location';
import { ApiError } from '../errors';

export const LOCATION_SUMMARY_QUERY_KEY = ['assets', 'location-summary'] as const;

export function assetLocationQueryKey(assetId: string) {
  return ['assets', assetId, 'location'] as const;
}

const EMPTY_LOCATION_SUMMARY: AssetLocationSummaryPage = { data: [] };

export function useAssetLocationSummaryQuery() {
  return useQuery({
    queryKey: LOCATION_SUMMARY_QUERY_KEY,
    queryFn: async () => {
      try {
        return await listAssetLocationSummary();
      } catch (error) {
        // Older backends routed `/assets/location-summary` to `/assets/:assetId` and
        // returned NOT_FOUND — treat as "no locations yet", not a fatal map error.
        if (error instanceof ApiError && (error.status === 404 || error.code === 'NOT_FOUND')) {
          return EMPTY_LOCATION_SUMMARY;
        }
        throw error;
      }
    },
    retry: false,
  });
}

export function useAssetLocationQuery(assetId: string | undefined) {
  return useQuery({
    queryKey: assetLocationQueryKey(assetId ?? ''),
    queryFn: () => getAssetLocation(assetId!),
    enabled: Boolean(assetId),
  });
}

export function useReportAssetLocationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, body }: { assetId: string; body: LocationReportRequest }) =>
      reportAssetLocation(assetId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: LOCATION_SUMMARY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: assetLocationQueryKey(variables.assetId) });
    },
  });
}
