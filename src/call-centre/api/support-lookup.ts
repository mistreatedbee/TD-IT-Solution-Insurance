import { apiFetch } from '../../dashboard/api/client';
import type { PlanSupportLevel } from '../../customer/api/plans';

export interface SupportCustomerPolicy {
  id: string;
  planTier: string;
  planName?: string;
  status: string;
  monthlyAmountCents?: number | null;
  maxAssets?: number | null;
  supportLevel?: PlanSupportLevel;
  registeredAssetCount?: number;
}

export interface SupportCustomerLookup {
  accountId: string;
  email: string;
  accountState: string;
  policyCount: number;
  assetCount: number;
  assets: Array<{
    id: string;
    assetType: string;
    displayName: string;
    status: string;
    /** Additive asset identifiers (Feature 010 candidate #1) — nullable per-type. */
    make: string | null;
    model: string | null;
    serialNumber: string | null;
    imei: string | null;
  }>;
  /** Primary plan summary from customer-lookup API. */
  subscription?: {
    planName: string | null;
    planSlug: string;
    assetUsageLabel: string;
    supportLevel: string;
    activeAssetCount: number;
    maxAssets: number | null;
  } | null;
  /** Legacy shape — prefer `subscription` when present. */
  policies?: SupportCustomerPolicy[];
  openRecoveryCaseCount: number;
  recoveryCases: Array<{
    id: string;
    referenceNumber: string;
    status: string;
    reportedAt: string;
    callCentreNotes: Array<{
      agentAccountId: string;
      text: string;
      createdAt: string;
    }>;
  }>;
  /** FR-11 addendum (api-design.md §3) — counts status IN ('open', 'in_progress') only. */
  openSupportCaseCount: number;
  supportCases: Array<{
    id: string;
    referenceNumber: string;
    status: string;
    category: string;
    createdAt: string;
    callerVerified: boolean;
  }>;
}

export async function lookupCustomerByEmail(email: string): Promise<SupportCustomerLookup> {
  const qs = new URLSearchParams({ email });
  return apiFetch<{ data: SupportCustomerLookup }>(`/support/customer-lookup?${qs}`).then((r) => r.data);
}

export async function lookupCustomerByPolicyId(policyId: string): Promise<SupportCustomerLookup> {
  const qs = new URLSearchParams({ policyId });
  return apiFetch<{ data: SupportCustomerLookup }>(`/support/customer-lookup?${qs}`).then((r) => r.data);
}

export async function lookupCustomerByPhone(phone: string): Promise<SupportCustomerLookup> {
  const qs = new URLSearchParams({ phone });
  return apiFetch<{ data: SupportCustomerLookup }>(`/support/customer-lookup?${qs}`).then((r) => r.data);
}

export async function addCallCentreCaseNote(caseId: string, text: string) {
  return apiFetch<{
    data: {
      caseId: string;
      note: { agentAccountId: string; text: string; createdAt: string };
    };
  }>(`/support/recovery-cases/${encodeURIComponent(caseId)}/notes`, {
    method: 'POST',
    body: { text },
  }).then((r) => r.data);
}

/**
 * Candidate #2 (`GET /v1/support/recovery-cases/:idOrReference`) — accepts either the
 * Mongo ObjectId or the `RC-YYYYMMDD-XXXX` reference number. Deliberately excludes
 * location coordinates and SAPS police-report fields — the backend never returns them to
 * this route, so this shape does not declare them either.
 */
export interface SupportRecoveryCaseDetail {
  id: string;
  accountId: string;
  assetId: string;
  status: string;
  referenceNumber: string;
  reportedAt: string;
  closedAt: string | null;
  notes: string | null;
  lastLocationAt: string | null;
  callCentreNotes: Array<{
    agentAccountId: string;
    text: string;
    createdAt: string;
  }>;
}

export async function getRecoveryCaseForCallCentre(idOrReference: string): Promise<SupportRecoveryCaseDetail> {
  return apiFetch<{ data: SupportRecoveryCaseDetail }>(
    `/support/recovery-cases/${encodeURIComponent(idOrReference)}`,
  ).then((r) => r.data);
}

/**
 * Candidate #3 (`GET /v1/support/customers/:accountId/notification-preferences`) —
 * agent-visibility-only read of a customer's notification channel preferences. No edit
 * capability exists on this route or anywhere in this client.
 */
export type SupportNotificationChannelPreferences = { push: boolean; email: boolean; sms: boolean };

export interface SupportCustomerNotificationPreferences {
  accountId: string;
  channels: Record<string, SupportNotificationChannelPreferences>;
  updatedAt: string;
}

export async function getCustomerNotificationPreferencesForCallCentre(
  accountId: string,
): Promise<SupportCustomerNotificationPreferences> {
  return apiFetch<{ data: SupportCustomerNotificationPreferences }>(
    `/support/customers/${encodeURIComponent(accountId)}/notification-preferences`,
  ).then((r) => r.data);
}
