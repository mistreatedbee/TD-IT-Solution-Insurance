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
