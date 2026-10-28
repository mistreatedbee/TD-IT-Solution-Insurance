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
