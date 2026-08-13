/**
 * Onboarding notifications — ONB-001 welcome, ONB-002 incomplete reminders.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOnboardingNotificationService } from './onboarding-notification-service.js';
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

const customerAccount = {
  id: 'acct-1',
  userType: 'customer' as const,
  accountState: 'active' as const,
  email: 'customer@example.com',
  phone: null,
  mfaRequired: false,
  partnerOrganizationId: null,
  invitedBy: null,
  createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
};

describe('onboarding-notification-service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends welcome email and push once (deduped)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }),
    );
    const pushSend = vi.fn(async () => ({ tickets: [{ status: 'ok' }], invalidTokens: [] }));
    let welcomeMarked = false;

    const service = createOnboardingNotificationService({
      env: fakeEnv(),
      accounts: { async findById() { return customerAccount; } } as never,
      notificationPreferences: {
        async getOrCreate() {
          return {
            id: 'pref-1',
            accountId: 'acct-1',
            channels: { general: { push: true, email: true, sms: false } },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      deliveryState: {
        async tryMarkWelcomeSent() {
          if (welcomeMarked) return false;
          welcomeMarked = true;
          return true;
        },
      } as never,
      pushNotifications: { sendToAccount: pushSend } as never,
    });

    await service.notifyWelcomeIfNeeded('acct-1');
    await service.notifyWelcomeIfNeeded('acct-1');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pushSend).toHaveBeenCalledOnce();
    expect(pushSend).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'general.welcome' }));
  });

  it('sends onboarding incomplete reminder when account is 24h+ old with no policy', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-2' }), { status: 200 }),
    );
    const pushSend = vi.fn(async () => ({ tickets: [], invalidTokens: [] }));

    const service = createOnboardingNotificationService({
      env: fakeEnv(),
      accounts: { async findById() { return customerAccount; } } as never,
      notificationPreferences: {
        async getOrCreate() {
          return {
            id: 'pref-1',
            accountId: 'acct-1',
            channels: { general: { push: true, email: true, sms: false } },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      deliveryState: {
        async getOrCreate() {
          return {
            accountId: 'acct-1',
            welcomeSentAt: new Date(),
            onboardingReminderCount: 0,
            lastOnboardingReminderAt: null,
            policyRenewalReminders: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
        async tryIncrementOnboardingReminder() {
          return true;
        },
      } as never,
      pushNotifications: { sendToAccount: pushSend } as never,
    });

    await service.maybeNotifyOnboardingIncomplete({
      accountId: 'acct-1',
      accountCreatedAt: customerAccount.createdAt,
      policyCount: 0,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'onboarding.incomplete' }),
    );
  });
});
