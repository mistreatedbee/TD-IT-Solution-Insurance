import { apiFetch } from '../../dashboard/api/client';

export interface DailyActiveUserRow {
  dayBucket: string;
  distinctAccounts: number;
}

export interface AdminDauResponse {
  timezone: string;
  event: string;
  series: DailyActiveUserRow[];
}

export function getAdminDau(params: { from: string; to: string }) {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  return apiFetch<{ data: AdminDauResponse }>(`/admin/analytics/dau?${search}`).then((r) => r.data);
}
