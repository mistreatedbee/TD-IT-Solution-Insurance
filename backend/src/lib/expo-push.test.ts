/**
 * Expo push adapter — Feature 007.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildBrandedPushMessage } from './notification-brand.js';
import { buildExpoPushPayload, sendExpoPushMessages } from './expo-push.js';
import type { Env } from '../config/env.js';

function fakeEnv(): Env {
  return {
    nodeEnv: 'test',
    isProduction: false,
    port: 0,
    mongodbUri: 'mongodb://unused',
    supabaseUrl: 'https://unused.supabase.co',
    supabaseServiceRoleKey: 'unused',
    supabaseDbUrl: 'postgres://unused',
    supabaseDbCaCertPath: undefined,
    redisUrl: undefined,
    jwtSigningKeys: [{ kid: 'test-kid', secret: 'x'.repeat(32) }],
    jwtActiveKid: 'test-kid',
    internalServiceCredentials: [],
    trustProxyHops: 0,
    corsAllowedOrigins: [],
    emailVerificationRedirectUrl: 'tditinsurance://verify-email',
    passwordResetRedirectUrl: 'tditinsurance://reset-password',
    invitationAcceptRedirectUrl: 'tditinsurance://invitations/accept',
  };
}

describe('expo-push', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds payload with brand subtitle and category', () => {
    const content = buildBrandedPushMessage('account.security.test');
    const payload = buildExpoPushPayload('ExponentPushToken[abc]', content);

    expect(payload.subtitle).toBe(content.subtitle);
    expect(payload.categoryId).toBe('account');
    expect(payload.channelId).toBe('account');
    expect(payload.data?.brandColor).toBe('#2C3E50');
    expect(payload.data?.logoUrl).toContain('logo.png');
  });

  it('sends messages to Expo Push API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }), { status: 200 }),
    );

    const result = await sendExpoPushMessages(fakeEnv(), [
      buildExpoPushPayload('ExponentPushToken[abc]', buildBrandedPushMessage('account.security.test')),
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.tickets[0]?.status).toBe('ok');
  });
});
