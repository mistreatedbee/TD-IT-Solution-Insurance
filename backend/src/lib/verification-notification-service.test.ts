/**
 * Feature 023 Phase A — verification decision email + push, preference-aware.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createVerificationNotificationService } from './verification-notification-service.js';
import { buildVerificationDecisionEmail } from './domain-email-templates.js';
import { buildBrandedPushMessage } from './notification-brand.js';
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

function build(opts: {
  userType?: string;
  account?: { push: boolean; email: boolean; sms: boolean };
  env?: Partial<Env>;
}) {
  const pushSend = vi.fn(async () => ({ tickets: [], invalidTokens: [] }));
  const service = createVerificationNotificationService({
    env: fakeEnv(opts.env),
    accounts: {
      async findById() {
        return { id: 'acct-1', userType: opts.userType ?? 'customer', email: 'customer@example.com' };
      },
    } as never,
    notificationPreferences: {
      async getOrCreate() {
        return { channels: opts.account ? { account: opts.account } : {} };
      },
    } as never,
    pushNotifications: { sendToAccount: pushSend } as never,
  });
  return { service, pushSend };
}

describe('verification-notification-service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['verified', 'account.verification.verified'],
    ['action_required', 'account.verification.action_required'],
    ['rejected', 'account.verification.rejected'],
  ] as const)('sends email and push on %s', async (decision, templateId) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"e"}', { status: 200 }));
    const { service, pushSend } = build({});
    await service.notifyVerificationDecision({ accountId: 'acct-1', decision, reasonCustomerSafe: 'Name mismatch' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pushSend).toHaveBeenCalledWith({ accountId: 'acct-1', templateId });
  });

  it('respects account email and push opt-outs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { service, pushSend } = build({ account: { push: false, email: false, sms: false } });
    await service.notifyVerificationDecision({ accountId: 'acct-1', decision: 'verified', reasonCustomerSafe: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushSend).not.toHaveBeenCalled();
  });

  it('skips email when Resend is not configured but still pushes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { service, pushSend } = build({ env: { resendApiKey: undefined, emailFrom: undefined } });
    await service.notifyVerificationDecision({ accountId: 'acct-1', decision: 'verified', reasonCustomerSafe: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushSend).toHaveBeenCalledOnce();
  });

  it('never notifies a non-customer account', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { service, pushSend } = build({ userType: 'admin' });
    await service.notifyVerificationDecision({ accountId: 'acct-1', decision: 'verified', reasonCustomerSafe: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushSend).not.toHaveBeenCalled();
  });
});

describe('verification decision copy', () => {
  it('email includes the escaped customer-safe reason on decline / action required only', () => {
    const declined = buildVerificationDecisionEmail({ decision: 'rejected', reasonCustomerSafe: 'Name <b>mismatch</b>' });
    expect(declined.html).toContain('Name &lt;b&gt;mismatch&lt;/b&gt;');
    const approved = buildVerificationDecisionEmail({ decision: 'verified', reasonCustomerSafe: 'stale reason' });
    expect(approved.html).not.toContain('stale reason');
    expect(approved.subject).toBe('Your identity is verified');
  });

  it('push is lock-screen safe: account category, deep link to verification, no reason text', () => {
    const push = buildBrandedPushMessage('account.verification.action_required');
    expect(push.category).toBe('account');
    expect(push.deepLink).toBe('tditinsurance://account/verification');
    expect(push.body).not.toMatch(/reason/i);
  });
});
