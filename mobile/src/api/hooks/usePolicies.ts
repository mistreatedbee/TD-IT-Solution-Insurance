import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changePolicyPlan,
  createPolicy,
  getPolicy,
  listPolicies,
  type CreatePolicyRequest,
  type ListPoliciesParams,
} from '../policies';

export const POLICIES_QUERY_KEY = ['policies'] as const;

export function policiesQueryKey(params?: ListPoliciesParams) {
  return params ? ([...POLICIES_QUERY_KEY, params] as const) : POLICIES_QUERY_KEY;
}

export function policyQueryKey(policyId: string) {
  return ['policies', policyId] as const;
}

export function usePoliciesQuery(params?: ListPoliciesParams) {
  return useQuery({
    queryKey: policiesQueryKey(params),
    queryFn: () => listPolicies(params),
  });
}

export function usePolicyQuery(policyId: string | undefined) {
  return useQuery({
    queryKey: policyQueryKey(policyId ?? ''),
    queryFn: () => getPolicy(policyId!),
    enabled: Boolean(policyId),
  });
}

export function useCreatePolicyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePolicyRequest) => createPolicy(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: POLICIES_QUERY_KEY });
    },
  });
}

export function useChangePolicyPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, planCatalogId }: { policyId: string; planCatalogId: string }) =>
      changePolicyPlan(policyId, planCatalogId),
    onSuccess: (policy) => {
      queryClient.invalidateQueries({ queryKey: POLICIES_QUERY_KEY });
      if (policy.id) {
        queryClient.invalidateQueries({ queryKey: policyQueryKey(policy.id) });
      }
    },
  });
}
