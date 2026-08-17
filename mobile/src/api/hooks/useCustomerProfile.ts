import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCustomerProfile,
  submitProfileVerification,
  updateCustomerProfile,
  type UpdateCustomerProfileRequest,
} from '../customer-profile';

export const CUSTOMER_PROFILE_QUERY_KEY = ['account', 'profile'] as const;

export function useCustomerProfileQuery() {
  return useQuery({
    queryKey: CUSTOMER_PROFILE_QUERY_KEY,
    queryFn: () => getCustomerProfile(),
    retry: false,
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
