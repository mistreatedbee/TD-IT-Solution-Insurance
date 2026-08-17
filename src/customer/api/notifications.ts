import { apiFetch } from './client';

export type NotificationCategory =
  | 'theft_critical'
  | 'device_status'
  | 'billing'
  | 'account'
  | 'claims'
  | 'general'
  | 'marketing';

export interface CategoryChannelPreferences {
  push: boolean;
  email: boolean;
  sms: boolean;
}

export interface NotificationPreferencesResponse {
  accountId: string;
  channels: Record<NotificationCategory, CategoryChannelPreferences>;
  updatedAt: string;
}

export function getNotificationPreferences() {
  return apiFetch<NotificationPreferencesResponse>('/notifications/preferences');
}

export function updateNotificationPreferences(
  patch: Partial<Record<NotificationCategory, Partial<CategoryChannelPreferences>>>,
) {
  return apiFetch<NotificationPreferencesResponse>('/notifications/preferences', {
    method: 'PATCH',
    body: patch,
  });
}
