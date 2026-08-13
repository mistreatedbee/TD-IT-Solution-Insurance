/**
 * Auth security notifications — Feature 007 Group 2.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAuthNotificationService } from './auth-notification-service.js';
import type { Env } from '../config/env.js';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../repositories/notification-preferences.js';

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
    resendApiKey: 're_test',
    emailFrom: 'notifications@tditsolutionsinsurance.co.za',
  };
}

describe('auth-notification-service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends password changed email and push for customers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const pushSend = vi.fn(async () => ({ tickets: [], invalidTokens: [] }));

    const service = createAuthNotificationService({
      env: fakeEnv(),
      accounts: {
        async findById() {
          return {
            id: 'acct-1',
            userType: 'customer',
            accountState: 'active',
            email: 'user@example.com',
            phone: null,
            mfaRequired: false,
            partnerOrganizationId: null,
            invitedBy: null,
            createdAt: new Date(),
          };
        },
      } as never,
      notificationPreferences: {
        async getOrCreate() {
          return {
            id: 'p1',
            accountId: 'acct-1',
            channels: DEFAULT_NOTIFICATION_PREFERENCES,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      pushNotifications: { sendToAccount: pushSend } as never,
    });

    await service.notifyPasswordChanged({ accountId: 'acct-1' });

    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'auth.password.changed' }),
    );
  });

  it('sends new device login notification', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const pushSend = vi.fn(async () => ({ tickets: [], invalidTokens: [] }));

    const service = createAuthNotificationService({
      env: fakeEnv(),
      accounts: {
        async findById() {
          return {
            id: 'acct-1',
            userType: 'customer',
            accountState: 'active',
            email: 'user@example.com',
            phone: null,
            mfaRequired: false,
            partnerOrganizationId: null,
            invitedBy: null,
            createdAt: new Date(),
          };
        },
      } as never,
      notificationPreferences: {
        async getOrCreate() {
          return {
            id: 'p1',
            accountId: 'acct-1',
            channels: DEFAULT_NOTIFICATION_PREFERENCES,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      pushNotifications: { sendToAccount: pushSend } as never,
    });

    await service.notifyNewDeviceLogin({
      accountId: 'acct-1',
      userType: 'customer',
      deviceName: 'iPhone 15',
      ipAddress: '102.0.0.1',
    });

    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'auth.login.new_device' }),
    );
  });
});
