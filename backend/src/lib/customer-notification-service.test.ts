/**
 * Customer notification service — policy/asset email + push.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCustomerNotificationService } from './customer-notification-service.js';
import type { Env } from '../config/env.js';

function fakeEnv(overrides?: Partial<Env>): Env {
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
    resendApiKey: 're_test_key',
    emailFrom: 'notifications@tditsolutionsinsurance.co.za',
    emailFromName: 'TD IT Solution Insurance',
    ...overrides,
  };
}

describe('customer-notification-service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends policy created email and push for customers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }),
    );
    const pushSend = vi.fn(async () => ({ tickets: [{ status: 'ok' }], invalidTokens: [] }));

    const service = createCustomerNotificationService({
      env: fakeEnv(),
      accounts: {
        async findById() {
          return {
            id: 'acct-1',
            userType: 'customer',
            accountState: 'active',
            email: 'customer@example.com',
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
            id: 'pref-1',
            accountId: 'acct-1',
            channels: {
              general: { push: true, email: true, sms: false },
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      pushNotifications: { sendToAccount: pushSend } as never,
    });

    await service.notifyPolicyCreated({
      accountId: 'acct-1',
      policyId: '507f1f77bcf86cd799439099',
      planName: 'Starter',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'policy.created', accountId: 'acct-1' }),
    );
  });

  it('sends asset created push without email when Resend is not configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const pushSend = vi.fn(async () => ({ tickets: [], invalidTokens: [] }));

    const service = createCustomerNotificationService({
      env: fakeEnv({ resendApiKey: undefined, emailFrom: undefined }),
      accounts: {
        async findById() {
          return {
            id: 'acct-1',
            userType: 'customer',
            accountState: 'active',
            email: 'customer@example.com',
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
            id: 'pref-1',
            accountId: 'acct-1',
            channels: {
              general: { push: true, email: true, sms: false },
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      pushNotifications: { sendToAccount: pushSend } as never,
    });

    await service.notifyAssetCreated({
      accountId: 'acct-1',
      assetId: '507f1f77bcf86cd799439088',
      assetName: 'MacBook Pro',
      assetType: 'laptop',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'asset.created' }),
    );
  });
});
