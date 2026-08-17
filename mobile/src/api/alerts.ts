import { apiFetch } from './client';

export type AlertSeverity = 'critical' | 'high' | 'warning' | 'info';
export type AlertCategory =
  | 'security'
  | 'tracking'
  | 'device'
  | 'insurance'
  | 'payment'
  | 'account';

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

export interface AlertListPage {
  data: CustomerAlert[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export function listAlerts(params?: { cursor?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit !== undefined) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<AlertListPage>(`/alerts${qs ? `?${qs}` : ''}`);
}

export function patchAlert(alertId: string, body: { dismissed?: boolean; read?: boolean }) {
  return apiFetch<CustomerAlert>(`/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    body,
  });
}
