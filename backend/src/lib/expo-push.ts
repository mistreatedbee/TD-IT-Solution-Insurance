/**
 * Expo Push API adapter — https://docs.expo.dev/push-notifications/sending-notifications/
 */
import type { Env } from '../config/env.js';
import type { BrandedPushContent, PushNotificationCategory } from './notification-brand.js';
import { NOTIFICATION_BRAND } from './notification-brand.js';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  subtitle?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
  categoryId?: string;
  badge?: number;
  ttl?: number;
  mutableContent?: boolean;
  _displayInForeground?: boolean;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushSendResult {
  tickets: ExpoPushTicket[];
  invalidTokens: string[];
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export function buildExpoPushPayload(
  expoPushToken: string,
  content: BrandedPushContent,
): ExpoPushMessage {
  return {
    to: expoPushToken,
    title: content.title,
    body: content.body,
    subtitle: content.subtitle,
    sound: 'default',
    priority: content.priority,
    channelId: content.category,
    categoryId: content.category,
    mutableContent: true,
    _displayInForeground: true,
    data: {
      ...content.data,
      event: content.eventId,
      category: content.category,
      brandColor: NOTIFICATION_BRAND.primaryMid,
      ...(content.deepLink ? { deepLink: content.deepLink } : {}),
    },
  };
}

export async function sendExpoPushMessages(
  env: Env,
  messages: ExpoPushMessage[],
): Promise<ExpoPushSendResult> {
  if (messages.length === 0) {
    return { tickets: [], invalidTokens: [] };
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (env.expoAccessToken) {
    headers.Authorization = `Bearer ${env.expoAccessToken}`;
  }

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });

  const json = (await response.json()) as { data?: ExpoPushTicket[]; errors?: unknown[] };
  if (!response.ok) {
    throw new Error(
      `[expo-push] HTTP ${response.status}: ${JSON.stringify(json.errors ?? json).slice(0, 500)}`,
    );
  }

  const tickets = json.data ?? [];
  const invalidTokens: string[] = [];
  tickets.forEach((ticket, index) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      const token = messages[index]?.to;
      if (token) invalidTokens.push(token);
    }
  });

  return { tickets, invalidTokens };
}

export function isPushEnabledForCategory(
  channels: Record<PushNotificationCategory, { push: boolean }>,
  category: PushNotificationCategory,
): boolean {
  return channels[category]?.push !== false;
}
