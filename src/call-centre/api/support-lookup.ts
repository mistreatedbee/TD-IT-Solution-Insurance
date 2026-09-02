import { apiFetch } from '../../dashboard/api/client';

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
  }>;
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
}

export async function lookupCustomerByEmail(email: string): Promise<SupportCustomerLookup> {
  const qs = new URLSearchParams({ email });
  return apiFetch<{ data: SupportCustomerLookup }>(`/support/customer-lookup?${qs}`).then((r) => r.data);
}

export async function lookupCustomerByPolicyId(policyId: string): Promise<SupportCustomerLookup> {
  const qs = new URLSearchParams({ policyId });
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
