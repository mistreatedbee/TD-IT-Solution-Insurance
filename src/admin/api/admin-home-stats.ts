import { apiFetch } from '../../dashboard/api/client';

/**
 * Admin Home KPI row — each of these hits a dedicated, audit-light COUNT
 * endpoint (backend/src/routes/admin-{accounts,policies,assets}.ts), never a
 * list endpoint's page length, which both caps at the page limit and would
 * fire a bulk-disclosure audit row on every home-page load.
 */
export function getActiveCustomerCount() {
  return apiFetch<{ data: { count: number } }>('/admin/accounts/customers/count').then((r) => r.data.count);
}

export function getActivePolicyCount() {
  return apiFetch<{ data: { count: number } }>('/admin/policies/count').then((r) => r.data.count);
}

export function getActiveAssetCount() {
  return apiFetch<{ data: { count: number } }>('/admin/assets/count').then((r) => r.data.count);
}
