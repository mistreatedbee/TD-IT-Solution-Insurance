import { apiFetch } from '../../dashboard/api/client';
import { newIdempotencyKey } from '../../customer/api/idempotency';

/**
 * Matches `backend/src/repositories/support-cases.ts` (`SUPPORT_CASE_CATEGORIES`) and
 * `docs/features/010-call-centre-dashboard/api-design.md` §5 — API-layer-validated, not a
 * database schema enum. Extending this list is a code change on both sides, not a
 * migration.
 */
export const SUPPORT_CASE_CATEGORIES = [
  'billing',
  'app_technical_issue',
  'policy_question',
  'asset_registration_help',
  'account_access',
  'other',
] as const;

export type SupportCaseCategory = (typeof SUPPORT_CASE_CATEGORIES)[number];

/**
 * `escalated` is included in the read-side status union because the backend's
 * `SupportCaseSummary`/`SupportCaseDetail` schema includes it (a case could reach that
 * status via a future, not-yet-authorized escalate endpoint) — but no UI in this module
 * ever offers it as a status a user can select. See `updateSupportCaseStatus` below,
 * whose accepted-status type deliberately excludes it.
 */
export type SupportCaseStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated';

/** Statuses reachable from this UI's status-update control (FR-15/16). `escalated` is
 * intentionally not part of this type — there is no escalation affordance here. */
export type UpdatableSupportCaseStatus = 'in_progress' | 'resolved' | 'closed';

export interface SupportCaseNote {
  agentAccountId: string;
  text: string;
  createdAt: string;
}

export interface SupportCaseSummary {
  id: string;
  referenceNumber: string;
  accountId: string;
  category: SupportCaseCategory | string;
  description: string;
  status: SupportCaseStatus;
  callerVerified: boolean;
  createdByAgentAccountId: string;
  assignedAgentAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportCaseDetail extends SupportCaseSummary {
  resolutionSummary: string | null;
  notes: SupportCaseNote[];
  escalatedToRecoveryCaseId: string | null;
  escalatedAt: string | null;
  closedAt: string | null;
}

export interface SupportCaseListPage {
  data: SupportCaseSummary[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export interface ListMySupportCasesOptions {
  status?: SupportCaseStatus;
  category?: SupportCaseCategory | string;
  accountId?: string;
  cursor?: string;
  limit?: number;
}

/**
 * FR-17 — `GET /v1/support-cases?scope=mine`. `scope=all` is withheld server-side
 * (SR-010-2) and is not offered anywhere in this client — there is no way to call this
 * function with anything other than the agent's own cases.
 */
export function listMySupportCases(options: ListMySupportCasesOptions = {}) {
  const qs = new URLSearchParams({ scope: 'mine' });
  if (options.status) qs.set('status', options.status);
  if (options.category) qs.set('category', options.category);
  if (options.accountId) qs.set('accountId', options.accountId);
  if (options.cursor) qs.set('cursor', options.cursor);
  if (options.limit) qs.set('limit', String(options.limit));
  return apiFetch<SupportCaseListPage>(`/support-cases?${qs}`);
}

/** FR-17 (detail) — `GET /v1/support-cases/:caseId`. */
export function getSupportCase(caseId: string) {
  return apiFetch<{ data: SupportCaseDetail }>(`/support-cases/${encodeURIComponent(caseId)}`).then(
    (r) => r.data,
  );
}

export interface CreateSupportCaseInput {
  /** Deliberate, reviewed exception to the never-client-supplied-accountId rule
   * (api-design.md §2.2) — must be an accountId the agent resolved via a prior
   * customer-lookup call. */
  accountId: string;
  category: SupportCaseCategory | string;
  description: string;
}

/** FR-12 — `POST /v1/support-cases`. Requires an `Idempotency-Key`. */
export function createSupportCase(input: CreateSupportCaseInput) {
  return apiFetch<{ data: SupportCaseDetail }>('/support-cases', {
    method: 'POST',
    body: { ...input, channel: 'phone' },
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  }).then((r) => r.data);
}

/** FR-14 — `POST /v1/support-cases/:caseId/notes`. No Idempotency-Key (api-design.md §2.3). */
export function addSupportCaseNote(caseId: string, text: string) {
  return apiFetch<{ data: { caseId: string; note: SupportCaseNote } }>(
    `/support-cases/${encodeURIComponent(caseId)}/notes`,
    { method: 'POST', body: { text } },
  ).then((r) => r.data);
}

/**
 * FR-15/16 — `PATCH /v1/support-cases/:caseId/status`. Only `in_progress` | `resolved` |
 * `closed` are accepted — the backend rejects `escalated` with 400 VALIDATION_ERROR and
 * this client's type system does not allow it to be requested in the first place.
 */
export function updateSupportCaseStatus(
  caseId: string,
  status: UpdatableSupportCaseStatus,
  resolutionSummary?: string,
) {
  return apiFetch<{ data: SupportCaseDetail }>(
    `/support-cases/${encodeURIComponent(caseId)}/status`,
    { method: 'PATCH', body: { status, resolutionSummary } },
  ).then((r) => r.data);
}

export function formatSupportCaseCategory(category: string): string {
  return category.replace(/_/g, ' ');
}
