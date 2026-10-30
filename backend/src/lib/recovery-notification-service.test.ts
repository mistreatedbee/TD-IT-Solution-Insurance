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
      assets: {
        async findByIdForAdmin() {
          return { id: '507f1f77bcf86cd799439021', reportingDeviceId: null } as never;
        },
        async findByIdForAccount() {
          return null;
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
      assetType: 'laptop',
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
          assetType: 'laptop',
        }),
      }),
    );
    // PDM-5 (compliance-review-security-partner-data-minimisation.md F-7):
    // the customer-authored asset display name must never reach the partner
    // push — objectContaining above only proves the listed keys are present,
    // not that assetName is absent.
    for (const call of pushSend.mock.calls) {
      const [args] = call as [{ variables?: Record<string, unknown> }];
      expect(args.variables).not.toHaveProperty('assetName');
    }
    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'op-2', templateId: 'recovery.case.partner.new' }),
    );
    // PDM-5 (compliance-review-security-partner-data-minimisation.md F-7):
    // the partner fan-out must never carry the customer-authored asset
    // display name, which routinely contains a person's name or plate.
    for (const [call] of pushSend.mock.calls) {
      expect(call.variables).not.toHaveProperty('assetName');
    }
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
      assetType: 'laptop',
      assetId: '507f1f77bcf86cd799439021',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, fetchInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(fetchInit.body as string) as Array<{ to: string }>;
    expect(payload).toHaveLength(1);
    expect(payload[0]?.to).toBe('ExponentPushToken[enabled]');
  });

  describe('[CO-OB03-1] device suppression on reported-stolen devices', () => {
    const basePrefs = {
      async getOrCreate(accountId: string) {
        return {
          id: `pref-${accountId}`,
          accountId,
          channels: { theft_critical: { push: true, email: true, sms: false } },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    };
    const baseAccount = {
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
    };

    function buildService(assets: unknown, pushTokens: Record<string, unknown>) {
      const pushNotifications = createPushNotificationService({
        env: fakeEnv(),
        pushTokens: pushTokens as never,
        notificationPreferences: basePrefs as never,
      });
      return createRecoveryNotificationService({
        env: fakeEnv(),
        accounts: baseAccount as never,
        assets: assets as never,
        notificationPreferences: basePrefs as never,
        pushNotifications,
      });
    }

    it('suppresses the push to the reported-stolen device token while a second token on the same account still receives it', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: [{ status: 'ok', id: 't-1' }] }), { status: 200 }),
      );
      const service = buildService(
        {
          async findByIdForAdmin() {
            return { id: 'asset-1', reportingDeviceId: 'stolen-device' };
          },
        },
        {
          async listEnabledForAccount() {
            return [
              { expoPushToken: 'ExponentPushToken[stolen]', deviceId: 'stolen-device' },
              { expoPushToken: 'ExponentPushToken[other]', deviceId: 'other-device' },
            ];
          },
          async disableForDevice() {
            return undefined;
          },
        },
      );

      await service.notifyCaseStatusUpdated({
        accountId: 'acct-1',
        assetName: 'iPhone',
        caseId: '507f1f77bcf86cd799439011',
        referenceNumber: 'RC-20260801-ABCD',
        status: 'tracking',
        assetId: 'asset-1',
        reportedFromDeviceId: null,
      });

      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      const pushCall = fetchMock.mock.calls.find((call) => {
        try {
          return Array.isArray(JSON.parse((call[1] as RequestInit).body as string));
        } catch {
          return false;
        }
      }) as [string, RequestInit] | undefined;
      expect(pushCall).toBeDefined();
      const payload = JSON.parse((pushCall as [string, RequestInit])[1].body as string) as Array<{ to: string }>;
      expect(payload).toHaveLength(1);
      expect(payload[0]?.to).toBe('ExponentPushToken[other]');
    });

    it('[CR-7 carve-out] does NOT suppress the reported device token when it is also the device the report was filed from', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: [{ status: 'ok', id: 't-1' }] }), { status: 200 }),
      );
      const service = buildService(
        {
          async findByIdForAdmin() {
            return { id: 'asset-1', reportingDeviceId: 'stolen-device' };
          },
        },
        {
          async listEnabledForAccount() {
            return [{ expoPushToken: 'ExponentPushToken[stolen]', deviceId: 'stolen-device' }];
          },
          async disableForDevice() {
            return undefined;
          },
        },
      );

      await service.notifyCaseStatusUpdated({
        accountId: 'acct-1',
        assetName: 'iPhone',
        caseId: '507f1f77bcf86cd799439011',
        referenceNumber: 'RC-20260801-ABCD',
        status: 'tracking',
        assetId: 'asset-1',
        // Reported from the same device that is now the case's reported
        // device — CR-7's carve-out: this session isn't demoted.
        reportedFromDeviceId: 'stolen-device',
      });

      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      const pushCall = fetchMock.mock.calls.find((call) => {
        try {
          return Array.isArray(JSON.parse((call[1] as RequestInit).body as string));
        } catch {
          return false;
        }
      }) as [string, RequestInit] | undefined;
      expect(pushCall).toBeDefined();
      const payload = JSON.parse((pushCall as [string, RequestInit])[1].body as string) as Array<{ to: string }>;
      expect(payload).toHaveLength(1);
      expect(payload[0]?.to).toBe('ExponentPushToken[stolen]');
    });

    it('[fail-closed] suppresses the push entirely (not just one token) when the device-binding lookup errors, but still sends the email', async () => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }));
      const listEnabledForAccount = vi.fn();
      const service = buildService(
        {
          async findByIdForAdmin() {
            throw new Error('mongo unavailable');
          },
          async findByIdForAccount() {
            throw new Error('mongo unavailable');
          },
        },
        {
          listEnabledForAccount,
          async disableForDevice() {
            return undefined;
          },
        },
      );

      await service.notifyCaseStatusUpdated({
        accountId: 'acct-1',
        assetName: 'iPhone',
        caseId: '507f1f77bcf86cd799439011',
        referenceNumber: 'RC-20260801-ABCD',
        status: 'tracking',
        assetId: 'asset-1',
        reportedFromDeviceId: null,
      });

      // Email still sent unconditionally.
      expect(fetchMock).toHaveBeenCalledOnce();
      // No push attempt at all — the token lookup itself was never reached.
      expect(listEnabledForAccount).not.toHaveBeenCalled();
    });
  });

  describe('[CO-OB03-2] target-org-only dispatch push', () => {
    it('sends to active operators of the target org only, with no assetId in the payload', async () => {
      const pushSend = vi.fn(async () => ({ tickets: [], invalidTokens: [] }));
      const calledOrgIds: string[] = [];

      const service = createRecoveryNotificationService({
        env: fakeEnv(),
        accounts: {
          async listActiveSecurityOperatorIdsForOrg(orgId: string) {
            calledOrgIds.push(orgId);
            return ['op-target-1'];
          },
          async listActiveSecurityOperatorIds() {
            throw new Error('must not be called for a dispatch-time push');
          },
        } as never,
        assets: {} as never,
        notificationPreferences: {} as never,
        pushNotifications: { sendToAccount: pushSend } as never,
      });

      await service.notifyPartnerOrgCaseDispatched({
        caseId: '507f1f77bcf86cd799439011',
        referenceNumber: 'RC-20260801-ABCD',
        assetType: 'laptop',
        partnerOrganizationId: 'org-target',
      });

      expect(calledOrgIds).toEqual(['org-target']);
      expect(pushSend).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'op-target-1', templateId: 'recovery.case.partner.new' }),
      );
      const [call] = pushSend.mock.calls[0] as [{ variables?: Record<string, unknown> }];
      expect(call.variables).not.toHaveProperty('assetId');
    });
  });
});
