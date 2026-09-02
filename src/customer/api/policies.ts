import { apiFetch } from './client';
import { newIdempotencyKey } from './idempotency';

/** Returned when `GET /policies?include=planSummary` is used. */
export interface PolicyPlanSummary {
  planName: string | null;
  maxAssets: number | null;
  activeAssetCount: number;
  assetUsageLabel: string;
  supportLevel: string;
  monthlyAmountCents: number | null;
}

export interface Policy {
  id: string;
  planTier: string;
  planCatalogId: string | null;
  status: string;
  billing: {
    billingStatus: string;
    currency?: string;
    amount?: number | null;
  };
  planSummary?: PolicyPlanSummary;
}

export interface PolicyListPage {
  data: Policy[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export interface ListPoliciesOptions {
  includePlanSummary?: boolean;
}

export function listPolicies(options?: ListPoliciesOptions) {
  const qs = options?.includePlanSummary ? '?include=planSummary' : '';
  return apiFetch<PolicyListPage>(`/policies${qs}`, { method: 'GET' });
}

export function createPolicy(body: { planCatalogId?: string; planTier?: string }) {
  return apiFetch<Policy>('/policies', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}

export function changePolicyPlan(policyId: string, planCatalogId: string) {
  return apiFetch<Policy>(`/policies/${encodeURIComponent(policyId)}/plan`, {
    method: 'PATCH',
    body: { planCatalogId },
  });
}
