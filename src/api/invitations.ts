/**
 * Feature 017 D-1 — client module for the public, unauthenticated invitation
 * accept + MFA enrollment flow (`/invitations/accept?token=…`).
 *
 * Mirrors `mobile/src/api/invitations.ts` in call shape only (per
 * `docs/features/017-privileged-account-self-service/ui-design.md`'s route
 * header) — not a copy of its component/markup layer. Every call here is
 * pre-session: `authenticated: false` throughout, since no bearer token
 * exists until `POST /mfa/enroll/verify` succeeds.
 *
 * Uses `src/dashboard/api/client`'s `apiFetch` (the privileged-web surface's
 * existing HTTP client) rather than inventing a third fetch wrapper — this
 * page is a sibling of the privileged dashboards even though it renders
 * outside their route trees.
 */
import { apiFetch } from '../dashboard/api/client';
import { newIdempotencyKey } from '../customer/api/idempotency';

export interface InvitationPublic {
  email: string;
  userType: 'admin' | 'security_company_operator' | 'support_agent';
  partnerOrganizationName: string | null;
  status: string;
  expiresAt: string;
}

export function getInvitation(token: string): Promise<InvitationPublic> {
  return apiFetch<InvitationPublic>(`/invitations/${encodeURIComponent(token)}`, {
    method: 'GET',
    authenticated: false,
  });
}

export interface AcceptInvitationResult {
  accountId: string;
  mfaEnrollmentRequired: true;
  enrollmentTicket: string;
}

export function acceptInvitation(token: string, password: string): Promise<AcceptInvitationResult> {
  return apiFetch<AcceptInvitationResult>(`/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    body: { password },
    authenticated: false,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}

export interface MfaEnrollResult {
  /** Raw SVG markup from GoTrue — see backend/src/routes/mfa.ts. Never base64 PNG. */
  qrCodeSvg: string;
  manualEntryKey: string;
  enrollmentId: string;
}

export function mfaEnroll(enrollmentTicket: string): Promise<MfaEnrollResult> {
  return apiFetch<MfaEnrollResult>('/mfa/enroll', {
    method: 'POST',
    body: { enrollmentTicket },
    authenticated: false,
  });
}

export interface MfaEnrollVerifyResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

export function mfaEnrollVerify(enrollmentId: string, code: string): Promise<MfaEnrollVerifyResult> {
  return apiFetch<MfaEnrollVerifyResult>('/mfa/enroll/verify', {
    method: 'POST',
    body: { enrollmentId, code },
    authenticated: false,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}
