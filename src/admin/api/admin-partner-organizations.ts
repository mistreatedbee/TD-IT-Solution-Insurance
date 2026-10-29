/**
 * Admin partner-organizations directory client —
 * `backend/src/routes/admin-partner-organizations.ts`. Used by
 * `InviteStaffPage` to populate the partner-org picker for
 * `security_company_operator` invitations (closes the gap described in
 * `admin-invitations.ts`'s prior scope note).
 */
import { apiFetch } from '../../dashboard/api/client';

export interface AdminPartnerOrganization {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  contactEmail: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listPartnerOrganizations(): Promise<{ data: AdminPartnerOrganization[] }> {
  return apiFetch<{ data: AdminPartnerOrganization[] }>('/admin/partner-organizations');
}

/**
 * `GET /v1/admin/partner-organizations/:id/scorecard` —
 * `backend/src/routes/admin-partner-organization-scorecard.ts`. Read-only
 * recovery-performance aggregation; `from`/`to` are optional YYYY-MM-DD
 * bounds, omit either (or both) for a full-range scorecard.
 */
export interface AdminPartnerOrganizationScorecard {
  partnerOrganizationId: string;
  partnerOrganizationName: string;
  range: { from: string | null; to: string | null };
  totalCasesClaimed: number;
  activeCases: number;
  recoveredCount: number;
  closedOtherCount: number;
  recoveryRatePercent: number | null;
  averageTimeToTerminalStatusHours: number | null;
  releasedCount: number;
  reassignedAwayCount: number;
}

export function getPartnerOrganizationScorecard(
  id: string,
  range: { from?: string; to?: string } = {},
): Promise<AdminPartnerOrganizationScorecard> {
  const search = new URLSearchParams();
  if (range.from) search.set('from', range.from);
  if (range.to) search.set('to', range.to);
  const query = search.toString();
  return apiFetch<{ data: AdminPartnerOrganizationScorecard }>(
    `/admin/partner-organizations/${id}/scorecard${query ? `?${query}` : ''}`,
  ).then((r) => r.data);
}
