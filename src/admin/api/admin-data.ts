import { apiFetch, type CursorPage } from '../../dashboard/api/client';

export interface AdminAccountSummary {
  id: string;
  email: string;
  userType: string;
  accountState: string;
  partnerOrganizationId: string | null;
  createdAt: string;
  /** Human-readable account reference (format `TD-XXXXXX`) for support calls.
   * Optional until the backend rollout is complete — render defensively. */
  accountNumber?: string;
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

export function listAdminAccounts(params?: {
  cursor?: string;
  limit?: number;
  role?: 'customer' | 'staff';
  email?: string;
}) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.role) search.set('role', params.role);
  if (params?.email) search.set('email', params.email);
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

/** Business-owner gap report item 2 — PATCH /admin/policies/{policyId}: cancel. */
export function cancelAdminPolicy(policyId: string, body: { status: 'cancelled'; reason?: string }) {
  return apiFetch<AdminPolicyDetail>(`/admin/policies/${encodeURIComponent(policyId)}`, {
    method: 'PATCH',
    body,
  });
}

/** Business-owner gap report item 4 — PATCH /admin/policies/{policyId}/legal-hold. */
export function setAdminPolicyLegalHold(policyId: string, body: { legalHold: boolean; reason?: string }) {
  return apiFetch<AdminPolicyDetail>(`/admin/policies/${encodeURIComponent(policyId)}/legal-hold`, {
    method: 'PATCH',
    body,
  });
}

export function listAdminAssets(params?: {
  cursor?: string;
  accountId?: string;
  status?: 'active' | 'inactive' | 'removed';
  assetType?: string;
}) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.accountId) search.set('accountId', params.accountId);
  if (params?.status) search.set('status', params.status);
  if (params?.assetType) search.set('assetType', params.assetType);
  const qs = search.toString();
  return apiFetch<CursorPage<AdminAssetSummary>>(`/admin/assets${qs ? `?${qs}` : ''}`);
}

export function getAdminAsset(id: string) {
  return apiFetch<AdminAssetDetail>(`/admin/assets/${encodeURIComponent(id)}`);
}

/** Business-owner gap report item 3 — PATCH /admin/assets/{assetId}: archive/remove. */
export function archiveAdminAsset(assetId: string, body: { status: 'removed'; reason?: string }) {
  return apiFetch<AdminAssetDetail>(`/admin/assets/${encodeURIComponent(assetId)}`, {
    method: 'PATCH',
    body,
  });
}

/** Business-owner gap report item 4 — PATCH /admin/assets/{assetId}/legal-hold. */
export function setAdminAssetLegalHold(assetId: string, body: { legalHold: boolean; reason?: string }) {
  return apiFetch<AdminAssetDetail>(`/admin/assets/${encodeURIComponent(assetId)}/legal-hold`, {
    method: 'PATCH',
    body,
  });
}
