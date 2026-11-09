/**
 * Admin dispatch-queue client — OB-03 Track B.
 * `backend/src/routes/admin-case-dispatch.ts` (§2.1-§2.6 of
 * `docs/features/009-customer-experience-redesign/api-design-ob03-dispatch-location-grants.md`).
 * Mirrors `AdminClaimsPages.tsx`'s `admin-claims.ts` client shape.
 *
 * Contract notes resolved against the actual backend code at build time
 * (B3), not assumed from the B2 design doc's open questions (§8 there):
 *
 * 1. `GET /admin/dispatch/cases/:caseId` DOES surface an in-flight
 *    `pendingApproval` object (`admin-case-dispatch.ts`'s
 *    `serializeAdminDispatchCase`, lines 95-103) — `{ id, requestedBy,
 *    requestedTargetOrgId, requestedAt, expiresAt }`. `AdminCaseDispatchPages`
 *    sources Screen 2's "awaiting approval" banner AND Screen 5's approval
 *    detail entirely from this field — no separate "get one pending
 *    approval" route exists or is needed.
 * 2. The partner-organization list API (`admin-partner-organizations.ts`'s
 *    `serialize()`) does NOT expose `agreementStatus`/`terminatedAt` to the
 *    admin client today, even though those fields exist on the backend
 *    `PartnerOrganizationDocument` (`repositories/partner-organizations.ts`).
 *    This is a real contract gap, not assumed — flagged back to
 *    `backend-engineer` to add those fields to the list response. Until
 *    then, the org picker here filters client-side on `status === 'active'`
 *    as the closest available proxy; this is NOT equivalent to the server's
 *    actual A2 eligibility check (`agreementStatus === 'executed' &&
 *    terminatedAt === null`), which the server still enforces authoritatively
 *    on every dispatch/re-dispatch/approve call (422 `DISPATCH_TARGET_NOT_ELIGIBLE`
 *    if the picker's guess was wrong). The picker is defensive UX only, per
 *    the B2 spec's own framing of this filter.
 * 3. `requestedBy` is a raw admin `accountId` with no name/email resolution
 *    anywhere in this admin surface today — `AdminClaimsPages.tsx`'s
 *    `ClaimDetailPage` shows `claim.accountId` the same way, linked to
 *    `/admin/accounts/:accountId` via `AdminNavLink`, never a resolved name.
 *    Screen 5 here follows the identical established pattern rather than
 *    inventing a name lookup that doesn't exist elsewhere in `src/admin/`.
 */
import { apiFetch, type CursorPage } from '../../dashboard/api/client';

export type AdminDispatchStatus = 'undispatched' | 'pending' | 'accepted';
export type AdminCaseStatus = 'open' | 'investigating' | 'tracking' | 'recovered' | 'closed';

export type RedispatchReason =
  | 'partner_declined'
  | 'partner_handed_back'
  | 'agreement_ended'
  | 'admin_recall'
  | 'other';

export const REDISPATCH_REASONS: RedispatchReason[] = [
  'partner_declined',
  'partner_handed_back',
  'agreement_ended',
  'admin_recall',
  'other',
];

export const REDISPATCH_REASON_LABELS: Record<RedispatchReason, string> = {
  partner_declined: 'Partner declined',
  partner_handed_back: 'Partner handed back',
  agreement_ended: 'Agreement ended',
  admin_recall: 'Admin recall',
  other: 'Other',
};

export interface AdminDispatchPendingApproval {
  id: string;
  requestedBy: string;
  requestedTargetOrgId: string;
  requestedAt: string;
  expiresAt: string;
}

export interface AdminDispatchCase {
  id: string;
  status: AdminCaseStatus;
  referenceNumber: string;
  reportedAt: string;
  partnerOrganizationId: string | null;
  dispatchStatus: AdminDispatchStatus;
  dispatchedAt: string | null;
  dispatchedBy: string | null;
  acceptedAt: string | null;
  firstDispatchedAt: string | null;
  dispatchCount: number;
  pendingApproval: AdminDispatchPendingApproval | null;
  createdAt: string;
  updatedAt: string;
  /** Present only on the detail route (2.5) — absent (undefined) from the list/count paths (A8). */
  lastLocation?: { latitude: number; longitude: number } | null;
  lastLocationAt?: string | null;
}

export function listAdminDispatchCases(params?: {
  status?: AdminCaseStatus;
  dispatchStatus?: AdminDispatchStatus;
  cursor?: string;
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.dispatchStatus) search.set('dispatchStatus', params.dispatchStatus);
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<CursorPage<AdminDispatchCase>>(`/admin/dispatch/cases${qs ? `?${qs}` : ''}`);
}

export function getAdminDispatchCase(caseId: string) {
  return apiFetch<{ data: AdminDispatchCase }>(`/admin/dispatch/cases/${encodeURIComponent(caseId)}`).then(
    (r) => r.data,
  );
}

export type DispatchResult =
  | { kind: 'dispatched'; case: AdminDispatchCase }
  | { kind: 'pending_approval'; pendingApprovalId: string };

export async function dispatchCase(
  caseId: string,
  body: { partnerOrganizationId: string },
): Promise<DispatchResult> {
  const res = await apiFetch<{ data: AdminDispatchCase | { pendingApprovalId: string } }>(
    `/admin/dispatch/cases/${encodeURIComponent(caseId)}/dispatch`,
    { method: 'POST', body },
  );
  if ('pendingApprovalId' in res.data) {
    return { kind: 'pending_approval', pendingApprovalId: res.data.pendingApprovalId };
  }
  return { kind: 'dispatched', case: res.data };
}

export async function reDispatchCase(
  caseId: string,
  body: { targetPartnerOrganizationId: string | null; reason: RedispatchReason },
): Promise<DispatchResult> {
  const res = await apiFetch<{ data: AdminDispatchCase | { pendingApprovalId: string } }>(
    `/admin/dispatch/cases/${encodeURIComponent(caseId)}/re-dispatch`,
    { method: 'POST', body },
  );
  if ('pendingApprovalId' in res.data) {
    return { kind: 'pending_approval', pendingApprovalId: res.data.pendingApprovalId };
  }
  return { kind: 'dispatched', case: res.data };
}

export function approveCaseDispatch(caseId: string, body: { pendingApprovalId: string }) {
  return apiFetch<{ data: AdminDispatchCase }>(
    `/admin/dispatch/cases/${encodeURIComponent(caseId)}/re-dispatch/approve`,
    { method: 'POST', body },
  ).then((r) => r.data);
}
