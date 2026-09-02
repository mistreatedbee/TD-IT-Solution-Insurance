import { apiFetch, type CursorPage } from '../../dashboard/api/client';

export interface AdminAccountSummary {
  id: string;
  email: string;
  userType: string;
  accountState: string;
  partnerOrganizationId: string | null;
  createdAt: string;
}

export interface AdminAccountDetail extends AdminAccountSummary {
  phone: string | null;
  mfaRequired: boolean;
  invitedBy: string | null;
  suspendedAt: string | null;
  deactivatedAt: string | null;
  updatedAt: string;
}

/** List projection — SR-004-admin-6; omits coverageLimits and full billing object. */
export interface AdminPolicySummary {
  id: string;
  accountId: string;
  planTier: string;
  planCatalogId: string | null;
  status: string;
  legalHold: boolean;
  billingStatus: string;
  effectiveDate: string;
  createdAt: string;
}

/** Detail read — full policy shape including billing and coverageLimits. */
export interface AdminPolicyDetail extends AdminPolicySummary {
  coverageLimits: unknown[];
  billing: Record<string, unknown>;
  renewalDate: string | null;
  cancelledAt: string | null;
  updatedAt: string;
}

/** List projection — SR-004-admin-6; omits details, estimatedValue, and photos. */
export interface AdminAssetSummary {
  id: string;
  accountId: string;
  assetType: string;
  displayName: string;
  status: string;
  legalHold: boolean;
  gpsDeviceId: string | null;
  registeredAt: string;
}

/** Detail read — full asset shape including polymorphic details. */
export interface AdminAssetDetail extends AdminAssetSummary {
  estimatedValue: number | null;
  photos: unknown[];
  details: Record<string, unknown>;
  gpsPairedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listAdminAccounts(params?: { cursor?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<CursorPage<AdminAccountSummary>>(`/admin/accounts${qs ? `?${qs}` : ''}`);
}

export function getAdminAccount(id: string) {
  return apiFetch<AdminAccountDetail>(`/admin/accounts/${encodeURIComponent(id)}`);
}

export type AdminSettableAccountState = 'active' | 'suspended' | 'deactivated';

export function updateAdminAccountState(
  id: string,
  body: { accountState: AdminSettableAccountState; reason?: string },
) {
  return apiFetch<AdminAccountDetail>(`/admin/accounts/${encodeURIComponent(id)}/state`, {
    method: 'PATCH',
    body,
  });
}

export function listAdminPolicies(params?: { cursor?: string; accountId?: string }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.accountId) search.set('accountId', params.accountId);
  const qs = search.toString();
  return apiFetch<CursorPage<AdminPolicySummary>>(`/admin/policies${qs ? `?${qs}` : ''}`);
}

export function getAdminPolicy(id: string) {
  return apiFetch<AdminPolicyDetail>(`/admin/policies/${encodeURIComponent(id)}`);
}

export function listAdminAssets(params?: { cursor?: string; accountId?: string }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.accountId) search.set('accountId', params.accountId);
  const qs = search.toString();
  return apiFetch<CursorPage<AdminAssetSummary>>(`/admin/assets${qs ? `?${qs}` : ''}`);
}

export function getAdminAsset(id: string) {
  return apiFetch<AdminAssetDetail>(`/admin/assets/${encodeURIComponent(id)}`);
}
