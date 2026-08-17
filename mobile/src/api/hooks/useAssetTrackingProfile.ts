import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAssetTrackingProfile,
  getInstallationGuide,
  linkTrackingDevice,
  registerTrackingDevice,
} from '../tracking-devices';

export function trackingProfileQueryKey(assetId: string) {
  return ['assets', assetId, 'tracking-profile'] as const;
}

export function useInstallationGuideQuery() {
  return useQuery({
    queryKey: ['tracking', 'installation-guide'],
    queryFn: () => getInstallationGuide(),
    staleTime: 60 * 60 * 1000,
  });
}

export function useAssetTrackingProfileQuery(assetId: string | undefined) {
  return useQuery({
    queryKey: trackingProfileQueryKey(assetId ?? ''),
    queryFn: () => getAssetTrackingProfile(assetId!),
    enabled: Boolean(assetId),
    retry: false,
  });
}

export function useRegisterTrackingDeviceMutation() {
  return useMutation({
    mutationFn: registerTrackingDevice,
  });
}

export function useLinkTrackingDeviceMutation(assetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trackingDeviceId: string) => linkTrackingDevice(assetId, trackingDeviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trackingProfileQueryKey(assetId) });
      queryClient.invalidateQueries({ queryKey: ['assets', assetId] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}
