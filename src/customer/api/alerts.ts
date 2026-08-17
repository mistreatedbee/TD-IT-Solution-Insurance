import { apiFetch } from './client';

export type AlertSeverity = 'critical' | 'high' | 'warning' | 'info';
export type AlertCategory =
  | 'security'
  | 'tracking'
  | 'device'
  | 'insurance'
  | 'payment'
  | 'account';

export interface CustomerAlertListPage {
  data: CustomerAlert[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export interface CustomerAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  body: string;
  href: string | null;
  source: string;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listCustomerAlerts(params?: { cursor?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<CustomerAlertListPage>(`/alerts${qs ? `?${qs}` : ''}`);
}

export function dismissCustomerAlert(alertId: string) {
  return apiFetch<CustomerAlert>(`/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    body: { dismissed: true },
  });
}
