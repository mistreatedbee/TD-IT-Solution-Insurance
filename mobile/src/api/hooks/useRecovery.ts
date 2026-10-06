import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRecoveryCase,
  getRecoveryCase,
  getRecoveryCaseLocation,
  listRecoveryCases,
  updateRecoveryCasePoliceReport,
  type CreateRecoveryCaseRequest,
  type UpdatePoliceReportRequest,
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
    // Idempotency key is the caller's responsibility, not minted fresh per
    // call — a retry of the same submission intent MUST reuse the same key,
    // or the server can't recognise it as a retry (offline-retry policy,
    // docs/organization/05-development-standards.md).
    mutationFn: ({ body, idempotencyKey }: { body: CreateRecoveryCaseRequest; idempotencyKey: string }) =>
      createRecoveryCase(body, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recovery', 'cases'] });
    },
  });
}

export function useUpdatePoliceReportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, body }: { caseId: string; body: UpdatePoliceReportRequest }) =>
      updateRecoveryCasePoliceReport(caseId, body),
    onSuccess: (updatedCase) => {
      queryClient.invalidateQueries({ queryKey: ['recovery', 'cases'] });
      queryClient.setQueryData(['recovery', 'cases', updatedCase.id], updatedCase);
    },
  });
}
