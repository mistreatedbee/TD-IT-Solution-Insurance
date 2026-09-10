import { apiFetch, type CursorPage } from '../../dashboard/api/client';
import type { CustomerProfile } from '../../customer/api/profile';

export interface VerificationRequestSummary {
  accountId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  idNumberMasked: string | null;
  verificationStatus: string;
  verificationSubmittedAt: string | null;
}

export interface AdminCustomerProfileResponse {
  account: { id: string; email: string; accountState: string };
  profile: CustomerProfile;
}

export function listVerificationRequests(params?: { cursor?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<CursorPage<VerificationRequestSummary>>(
    `/admin/verification-requests${qs ? `?${qs}` : ''}`,
  );
}

/**
 * FR-4 (Feature 012) — `GET /v1/admin/verification-requests/count`. A true
 * `countDocuments()` aggregate over `{ verificationStatus: 'pending_review' }`, distinct
 * from `listVerificationRequests` above (which returns a `CursorPage` of subject rows and
 * fires a bulk-disclosure audit event per row). Per
 * `docs/features/012-employee-dashboard/api-design.md` §4 and
 * `security-review.md` §10 item 3, this route takes **no query parameters** — do not add
 * any without a fresh compliance/security pass.
 */
export function countPendingVerifications() {
  return apiFetch<{ data: { count: number } }>('/admin/verification-requests/count').then(
    (r) => r.data.count,
  );
}

export function getAdminCustomerProfile(accountId: string) {
  return apiFetch<AdminCustomerProfileResponse>(
    `/admin/accounts/${encodeURIComponent(accountId)}/profile`,
  );
}

export function reviewCustomerVerification(
  accountId: string,
  body: {
    decision: 'verified' | 'rejected' | 'action_required';
    rejectionReasonCustomerSafe?: string;
  },
) {
  return apiFetch<AdminCustomerProfileResponse>(
    `/admin/accounts/${encodeURIComponent(accountId)}/profile/verification`,
    { method: 'PATCH', body },
  );
}
