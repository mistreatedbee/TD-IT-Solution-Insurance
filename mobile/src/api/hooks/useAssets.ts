import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAsset,
  getAsset,
  listAssets,
  type CreateAssetRequest,
  type ListAssetsParams,
} from '../assets';

export const ASSETS_QUERY_KEY = ['assets'] as const;

export function assetsQueryKey(params?: ListAssetsParams) {
  return params ? ([...ASSETS_QUERY_KEY, params] as const) : ASSETS_QUERY_KEY;
}

export function assetQueryKey(assetId: string) {
  return ['assets', assetId] as const;
}

export function useAssetsQuery(params?: ListAssetsParams) {
  return useQuery({
    queryKey: assetsQueryKey(params),
    queryFn: () => listAssets(params),
  });
}

export function useAssetQuery(assetId: string | undefined) {
  return useQuery({
    queryKey: assetQueryKey(assetId ?? ''),
    queryFn: () => getAsset(assetId!),
    enabled: Boolean(assetId),
  });
}

export function useCreateAssetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAssetRequest) => createAsset(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSETS_QUERY_KEY });
    },
  });
}
