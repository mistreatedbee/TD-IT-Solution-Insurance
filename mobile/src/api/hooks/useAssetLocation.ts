import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../../config/features';
import {
  getAssetLocation,
  grantAssetLocationConsent,
  listAssetLocationSummary,
  reportAssetLocation,
  withdrawAssetLocation,
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
    enabled: FEATURE_LOCATION_TRACKING_ENABLED,
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
    enabled: FEATURE_LOCATION_TRACKING_ENABLED && Boolean(assetId),
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

// INC-002 §12/§13 SR-INC002-W1 — records consent GRANT server-side. Must be
// called at the same point in the flow device-local consent is recorded
// (before the OS permission prompt) — see AssetDetailScreen.handleConsentAccept.
export function useGrantAssetLocationConsentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => grantAssetLocationConsent(assetId),
    onSuccess: (_data, assetId) => {
      queryClient.invalidateQueries({ queryKey: LOCATION_SUMMARY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: assetLocationQueryKey(assetId) });
    },
  });
}

// INC-002 §11.3 SR-INC002-M1 — withdraws consent server-side (clears stored
// location, purges history). Screens using this must also clear the
// device-local consent/linked-asset SecureStore keys themselves.
export function useWithdrawAssetLocationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => withdrawAssetLocation(assetId),
    onSuccess: (_data, assetId) => {
      queryClient.invalidateQueries({ queryKey: LOCATION_SUMMARY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: assetLocationQueryKey(assetId) });
    },
  });
}
