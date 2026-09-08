import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURE_KYC_ENABLED } from '../../config/features';
import { useSessionStore } from '../../auth/session-store';
import {
  deleteProfilePicture,
  getCustomerProfile,
  submitProfileVerification,
  updateCustomerProfile,
  uploadProfilePicture,
  type UpdateCustomerProfileRequest,
  type UploadProfilePictureRequest,
} from '../customer-profile';

export const CUSTOMER_PROFILE_QUERY_KEY = ['account', 'profile'] as const;

export function useCustomerProfileQuery() {
  const sessionStatus = useSessionStore((state) => state.status);
  const signedIn = sessionStatus === 'signed-in';

  return useQuery({
    queryKey: CUSTOMER_PROFILE_QUERY_KEY,
    enabled: signedIn && FEATURE_KYC_ENABLED,
    queryFn: () => getCustomerProfile(),
    retry: false,
  });
}

export function useProfileSummaryQuery() {
  const sessionStatus = useSessionStore((state) => state.status);
  const signedIn = sessionStatus === 'signed-in';

  return useQuery({
    queryKey: CUSTOMER_PROFILE_QUERY_KEY,
    enabled: signedIn,
    queryFn: () => getCustomerProfile(),
    retry: false,
    staleTime: 60_000,
  });
}

export function useUpdateCustomerProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCustomerProfileRequest) => updateCustomerProfile(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMER_PROFILE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['account', 'me'] });
    },
  });
}

export function useSubmitVerificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => submitProfileVerification(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMER_PROFILE_QUERY_KEY });
    },
  });
}

export function useUploadProfilePictureMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UploadProfilePictureRequest) => uploadProfilePicture(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMER_PROFILE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['account', 'me'] });
    },
  });
}

export function useDeleteProfilePictureMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteProfilePicture(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMER_PROFILE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['account', 'me'] });
    },
  });
}
