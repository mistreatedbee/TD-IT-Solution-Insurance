import { apiFetch, type CursorPage } from '../../dashboard/api/client';

/**
 * Business-owner gap report item 6 — `GET /v1/admin/audit-log`
 * (`backend/src/routes/admin-audit-log.ts`). Read-only; no write/delete
 * capability exists on this resource anywhere in the API.
 */
export interface AdminAuditLogEntry {
  id: string;
  accountId: string | null;
  eventType: string;
  attemptedIdentifier: string | null;
  ipAddress: string | null;
  createdAt: string;
}

/** Mirrors `backend/src/routes/admin-audit-log.ts`'s `AUDIT_EVENT_TYPES` list
 * exactly — kept in sync by hand since the backend deliberately does not
 * publish this list as a shared contract today. */
export const ADMIN_AUDIT_EVENT_TYPES = [
  'login_success',
  'login_failure',
  'logout',
  'password_reset_requested',
  'password_reset_completed',
  'mfa_enrolled',
  'mfa_verified',
  'mfa_challenge_failed',
  'session_revoked',
  'refresh_token_reuse_detected',
  'privileged_data_access',
  'privileged_bulk_access',
  'privilege_granted',
  'mfa_enrollment_ticket_issued',
  'mfa_enrollment_ticket_rejected',
  'account_locked',
  'session_family_revoked',
  'mfa_step_up_verified',
  'mfa_step_up_failed',
  'account_created',
  'email_verified',
] as const;

export type AdminAuditEventType = (typeof ADMIN_AUDIT_EVENT_TYPES)[number];

export interface ListAdminAuditLogParams {
  cursor?: string;
  limit?: number;
  accountId?: string;
  eventType?: AdminAuditEventType;
  /** Inclusive ISO-8601 datetime (`z.string().datetime()` on the backend — a
   * bare `YYYY-MM-DD` date is not accepted; callers must supply a full
   * timestamp, e.g. `2026-10-01T00:00:00.000Z`). */
  from?: string;
  /** Inclusive ISO-8601 datetime — see `from`. */
  to?: string;
}

export function listAdminAuditLog(params?: ListAdminAuditLogParams) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.accountId) search.set('accountId', params.accountId);
  if (params?.eventType) search.set('eventType', params.eventType);
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  const qs = search.toString();
  return apiFetch<CursorPage<AdminAuditLogEntry>>(`/admin/audit-log${qs ? `?${qs}` : ''}`);
}
