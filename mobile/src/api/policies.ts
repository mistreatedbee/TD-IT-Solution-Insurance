/**
 * Typed calls to Policy & Asset Service — policy endpoints only.
 * Types from src/api/generated/policy-asset-service.ts (openapi-typescript
 * output from openapi/policy-asset-service.yaml, copied from
 * docs/features/004-policy-asset-management/api-design.md §6).
 *
 * accountId is never sent from this client — scoped server-side from the
 * bearer token per api-design.md §4.2.
 */
import { apiFetch } from './client';
import { newIdempotencyKey } from './idempotency';
import type { components } from './generated/policy-asset-service';

type Schemas = components['schemas'];

export type Policy = Schemas['Policy'];
export type PolicyListPage = Schemas['PolicyListPage'];
export type CreatePolicyRequest = Schemas['CreatePolicyRequest'];

export interface ListPoliciesParams {
  cursor?: string;
  limit?: number;
}

function buildQuery(params?: ListPoliciesParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listPolicies(params?: ListPoliciesParams) {
  return apiFetch<PolicyListPage>(`/policies${buildQuery(params)}`, { method: 'GET' });
}

export function getPolicy(policyId: string) {
  return apiFetch<Policy>(`/policies/${encodeURIComponent(policyId)}`, { method: 'GET' });
}

export function createPolicy(body: CreatePolicyRequest) {
  return apiFetch<Policy>('/policies', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}
