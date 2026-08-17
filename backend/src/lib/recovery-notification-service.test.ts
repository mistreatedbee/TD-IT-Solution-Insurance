/**
 * Recovery notifications — Feature 007 Group 3.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRecoveryNotificationService } from './recovery-notification-service.js';
import { createPushNotificationService } from './push-notification-service.js';
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

describe('recovery-notification-service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends theft report email and push (REC-001)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }),
    );
    const pushSend = vi.fn(async () => ({ tickets: [], invalidTokens: [] }));

    const service = createRecoveryNotificationService({
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
            channels: { theft_critical: { push: true, email: true, sms: false } },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      pushNotifications: { sendToAccount: pushSend } as never,
    });

    await service.notifyTheftReportSubmitted({
      accountId: 'acct-1',
      assetName: 'MacBook Pro',
      caseId: '507f1f77bcf86cd799439011',
      referenceNumber: 'RC-20260801-ABCD',
      assetId: '507f1f77bcf86cd799439021',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'recovery.case.created', accountId: 'acct-1' }),
    );
  });

  it('sends recovered notification (REC-005)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-2' }), { status: 200 }),
    );
    const pushSend = vi.fn(async () => ({ tickets: [], invalidTokens: [] }));

    const service = createRecoveryNotificationService({
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
            channels: { theft_critical: { push: true, email: true, sms: false } },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      pushNotifications: { sendToAccount: pushSend } as never,
    });

    await service.notifyRecoverySuccessful({
      accountId: 'acct-1',
      assetName: 'Work laptop',
      caseId: '507f1f77bcf86cd799439011',
      referenceNumber: 'RC-20260801-ABCD',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'recovery.case.recovered' }),
    );
  });

  it('notifies all active security operators on new theft case (partner push)', async () => {
    const pushSend = vi.fn(async () => ({ tickets: [], invalidTokens: [] }));

    const service = createRecoveryNotificationService({
      env: fakeEnv(),
      accounts: {
        async listActiveSecurityOperatorIds() {
          return ['op-1', 'op-2'];
        },
      } as never,
      notificationPreferences: {
        async getOrCreate() {
          return {
            id: 'pref-1',
            accountId: 'unused',
            channels: { theft_critical: { push: true, email: true, sms: false } },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      pushNotifications: { sendToAccount: pushSend } as never,
    });

    await service.notifySecurityOperatorsTheftReported({
      caseId: '507f1f77bcf86cd799439011',
      referenceNumber: 'RC-20260801-ABCD',
      assetName: 'MacBook Pro',
      assetId: '507f1f77bcf86cd799439021',
    });

    expect(pushSend).toHaveBeenCalledTimes(2);
    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'op-1',
        templateId: 'recovery.case.partner.new',
        variables: expect.objectContaining({
          caseId: '507f1f77bcf86cd799439011',
          referenceNumber: 'RC-20260801-ABCD',
          assetName: 'MacBook Pro',
        }),
      }),
    );
    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'op-2', templateId: 'recovery.case.partner.new' }),
    );
  });

  it('skips partner push when operator disabled theft_critical push', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }), { status: 200 }),
    );

    const pushNotifications = createPushNotificationService({
      env: fakeEnv(),
      pushTokens: {
        async listEnabledForAccount(accountId: string) {
          if (accountId === 'op-enabled') {
            return [{ expoPushToken: 'ExponentPushToken[enabled]', deviceId: 'dev-1' }];
          }
          return [{ expoPushToken: 'ExponentPushToken[disabled]', deviceId: 'dev-2' }];
        },
        async disableForDevice() {
          return undefined;
        },
      } as never,
      notificationPreferences: {
        async getOrCreate(accountId: string) {
          const pushEnabled = accountId === 'op-enabled';
          return {
            id: `pref-${accountId}`,
            accountId,
            channels: {
              theft_critical: { push: pushEnabled, email: true, sms: false },
              device_status: { push: true, email: true, sms: false },
              billing: { push: true, email: true, sms: false },
              account: { push: true, email: true, sms: false },
              claims: { push: true, email: true, sms: false },
              general: { push: false, email: true, sms: false },
              marketing: { push: false, email: false, sms: false },
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
    });

    const service = createRecoveryNotificationService({
      env: fakeEnv(),
      accounts: {
        async listActiveSecurityOperatorIds() {
          return ['op-enabled', 'op-disabled'];
        },
      } as never,
      notificationPreferences: {} as never,
      pushNotifications,
    });

    await service.notifySecurityOperatorsTheftReported({
      caseId: '507f1f77bcf86cd799439011',
      referenceNumber: 'RC-20260801-ABCD',
      assetName: 'MacBook Pro',
      assetId: '507f1f77bcf86cd799439021',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, fetchInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(fetchInit.body as string) as Array<{ to: string }>;
    expect(payload).toHaveLength(1);
    expect(payload[0]?.to).toBe('ExponentPushToken[enabled]');
  });
});
