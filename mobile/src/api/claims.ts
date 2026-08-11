/**
 * Phase 2 Claims API — client contract stub.
 * Backend routes do not exist yet; calls fail until claims domain ships.
 */
import { apiFetch } from './client';
import { newIdempotencyKey } from './idempotency';

export type ClaimStatus = 'submitted' | 'under_review' | 'approved' | 'denied' | 'closed';

export interface Claim {
  id: string;
  assetId: string;
  status: ClaimStatus;
  referenceNumber: string;
  submittedAt: string;
  incidentSummary?: string | null;
  recoveryCaseId?: string | null;
}

export interface ClaimListPage {
  data: Claim[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export interface CreateClaimRequest {
  assetId: string;
  incidentSummary: string;
  recoveryCaseId?: string;
}

export function listClaims(params?: { cursor?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit !== undefined) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<ClaimListPage>(`/claims${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export function getClaim(claimId: string) {
  return apiFetch<Claim>(`/claims/${encodeURIComponent(claimId)}`, { method: 'GET' });
}

export function createClaim(body: CreateClaimRequest) {
  return apiFetch<Claim>('/claims', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}
