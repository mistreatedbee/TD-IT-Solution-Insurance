/**
 * Policy notifications — POL-002 activation, POL-003 renewal reminders.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPolicyNotificationService } from './policy-notification-service.js';
import type { Env } from '../config/env.js';
import type { PolicyDocument } from '../repositories/policies.js';

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
  createdAt: new Date(),
};

function activePolicy(renewalInDays: number): PolicyDocument {
  const renewalDate = new Date();
  renewalDate.setDate(renewalDate.getDate() + renewalInDays);
  return {
    id: '507f1f77bcf86cd799439099',
    accountId: 'acct-1',
    planTier: 'Starter',
    planCatalogId: null,
    status: 'active',
    coverageLimits: [],
    billing: {
      provider: null,
      externalCustomerId: null,
      externalSubscriptionId: null,
      billingStatus: 'not_configured',
      currency: 'ZAR',
      amount: 199,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      nextBillingAt: null,
      cancelAt: null,
    },
    effectiveDate: new Date(),
    renewalDate,
    cancelledAt: null,
    legalHold: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('policy-notification-service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends policy activated email and push', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }),
    );
    const pushSend = vi.fn(async () => ({ tickets: [], invalidTokens: [] }));

    const service = createPolicyNotificationService({
      env: fakeEnv(),
      accounts: { async findById() { return customerAccount; } } as never,
      notificationPreferences: {
        async getOrCreate() {
          return {
            id: 'pref-1',
            accountId: 'acct-1',
            channels: { billing: { push: true, email: true, sms: false } },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      deliveryState: {} as never,
      pushNotifications: { sendToAccount: pushSend } as never,
    });

    await service.notifyPolicyActivated({
      accountId: 'acct-1',
      policyId: '507f1f77bcf86cd799439099',
      planName: 'Starter',
      effectiveDate: new Date('2026-08-13'),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'policy.activated', accountId: 'acct-1' }),
    );
  });

  it('sends renewal reminder when policy renews within 30 days', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-2' }), { status: 200 }),
    );
    const pushSend = vi.fn(async () => ({ tickets: [], invalidTokens: [] }));

    const service = createPolicyNotificationService({
      env: fakeEnv(),
      accounts: { async findById() { return customerAccount; } } as never,
      notificationPreferences: {
        async getOrCreate() {
          return {
            id: 'pref-1',
            accountId: 'acct-1',
            channels: { billing: { push: true, email: true, sms: false } },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      deliveryState: {
        async tryMarkRenewalReminderSent() {
          return true;
        },
      } as never,
      pushNotifications: { sendToAccount: pushSend } as never,
    });

    await service.maybeNotifyRenewalReminders({
      accountId: 'acct-1',
      activePolicies: [activePolicy(14)],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'policy.renewal.upcoming' }),
    );
  });
});
