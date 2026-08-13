/**
 * Feature 007 — notification API client.
 */
import { apiFetch } from './client';

export type PushPlatform = 'ios' | 'android' | 'unknown';

export interface RegisterPushTokenRequest {
  deviceId: string;
  expoPushToken: string;
  platform: PushPlatform;
  appVersion?: string | null;
}

export interface RegisterPushTokenResponse {
  deviceId: string;
  platform: PushPlatform;
  enabled: boolean;
  registeredAt: string;
}

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

export function registerPushToken(body: RegisterPushTokenRequest) {
  return apiFetch<RegisterPushTokenResponse>('/devices/push-token', {
    method: 'PUT',
    body,
  });
}

export function revokePushToken(deviceId: string) {
  return apiFetch<void>('/devices/push-token', {
    method: 'DELETE',
    body: { deviceId },
  });
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

export function sendTestPushNotification() {
  return apiFetch<{ message: string; sent: number; tickets: number }>('/notifications/test', {
    method: 'POST',
  });
}
