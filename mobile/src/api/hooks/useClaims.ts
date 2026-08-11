import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClaim, getClaim, listClaims, type CreateClaimRequest } from '../claims';

export function useClaimsQuery(limit = 20) {
  return useQuery({
    queryKey: ['claims', { limit }],
    queryFn: () => listClaims({ limit }),
  });
}

export function useClaimQuery(claimId: string | undefined) {
  return useQuery({
    queryKey: ['claims', claimId],
    queryFn: () => getClaim(claimId!),
    enabled: Boolean(claimId),
  });
}

export function useCreateClaimMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateClaimRequest) => createClaim(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}
