import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createClaim,
  getClaim,
  listClaims,
  respondToClaim,
  withdrawClaim,
  type CreateClaimRequest,
  type RespondToClaimRequest,
} from '../claims';

export const CLAIMS_QUERY_KEY = ['claims'] as const;

export function claimQueryKey(claimId: string) {
  return ['claims', claimId] as const;
}

export function useClaimsQuery(limit = 20) {
  return useQuery({
    queryKey: [...CLAIMS_QUERY_KEY, { limit }],
    queryFn: () => listClaims({ limit }),
  });
}

export function useClaimQuery(claimId: string | undefined) {
  return useQuery({
    queryKey: claimQueryKey(claimId ?? ''),
    queryFn: () => getClaim(claimId!),
    enabled: Boolean(claimId),
  });
}

export function useCreateClaimMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateClaimRequest) => createClaim(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLAIMS_QUERY_KEY });
    },
  });
}

export function useRespondToClaimMutation(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RespondToClaimRequest) => respondToClaim(claimId, body),
    onSuccess: (claim) => {
      queryClient.invalidateQueries({ queryKey: CLAIMS_QUERY_KEY });
      queryClient.setQueryData(claimQueryKey(claimId), claim);
    },
  });
}

export function useWithdrawClaimMutation(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => withdrawClaim(claimId),
    onSuccess: (claim) => {
      queryClient.invalidateQueries({ queryKey: CLAIMS_QUERY_KEY });
      queryClient.setQueryData(claimQueryKey(claimId), claim);
    },
  });
}
