import { apiFetch } from './client';
import { newIdempotencyKey } from './idempotency';

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
}

export interface PolicyListPage {
  data: Policy[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export function listPolicies() {
  return apiFetch<PolicyListPage>('/policies', { method: 'GET' });
}

export function createPolicy(body: { planCatalogId?: string; planTier?: string }) {
  return apiFetch<Policy>('/policies', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}
