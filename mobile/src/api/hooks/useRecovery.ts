import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRecoveryCase,
  getRecoveryCase,
  getRecoveryCaseLocation,
  listRecoveryCases,
  type CreateRecoveryCaseRequest,
} from '../recovery';

export function useRecoveryCasesQuery(limit = 20) {
  return useQuery({
    queryKey: ['recovery', 'cases', { limit }],
    queryFn: () => listRecoveryCases({ limit }),
  });
}

export function useRecoveryCaseQuery(caseId: string | undefined) {
  return useQuery({
    queryKey: ['recovery', 'cases', caseId],
    queryFn: () => getRecoveryCase(caseId!),
    enabled: Boolean(caseId),
  });
}

export function useRecoveryLocationQuery(caseId: string | undefined) {
  return useQuery({
    queryKey: ['recovery', 'cases', caseId, 'location'],
    queryFn: () => getRecoveryCaseLocation(caseId!),
    enabled: Boolean(caseId),
    refetchInterval: 30_000,
  });
}

export function useCreateRecoveryCaseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRecoveryCaseRequest) => createRecoveryCase(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recovery', 'cases'] });
    },
  });
}
