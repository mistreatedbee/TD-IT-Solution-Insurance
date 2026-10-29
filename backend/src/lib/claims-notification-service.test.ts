/**
 * SR-018-10/CR-018-7 (security-review.md §16.4) — claims adverse-decision
 * notice email delivery.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createClaimsNotificationService } from './claims-notification-service.js';
import type { Env } from '../config/env.js';
import type { AccountRow } from '../repositories/accounts.js';
import type { ClaimDecisionNotice } from './claim-decision-notice.js';

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

function fakeAccount(overrides?: Partial<AccountRow>): AccountRow {
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
    ...overrides,
  };
}

function fakeNotice(overrides?: Partial<ClaimDecisionNotice>): ClaimDecisionNotice {
  return {
    kind: 'rejection',
    templateVersion: 1,
    groundCode: 'OTHER',
    renderedText: 'Claim reference: claim-1\nDecision: your claim has been REJECTED in full.',
    issuedAt: '2026-10-29T10:00:00.000Z',
    deliveries: [],
    ...overrides,
  };
}

function fakeClaimsRepo() {
  const appendNoticeDelivery = vi.fn(async () => true);
  return { appendNoticeDelivery } as never;
}

describe('claims-notification-service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the rejection notice email and records a successful delivery', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }));
    const claims = fakeClaimsRepo();
    const account = fakeAccount();
    const service = createClaimsNotificationService({
      env: fakeEnv(),
      accounts: { async findById() { return account; } } as never,
      claims,
    });
    const notice = fakeNotice({ kind: 'rejection' });

    await service.sendDecisionNoticeEmail({ accountId: account.id, claimId: 'claim-1', notice });

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.to).toEqual([account.email]);
    // Subject carries claim reference + decision type only — not the notice text.
    expect(body.subject).toContain('claim-1');
    expect(body.subject.toLowerCase()).toContain('rejected');
    expect(body.subject).not.toContain('REJECTED in full');

    expect(claims.appendNoticeDelivery).toHaveBeenCalledWith('claim-1', {
      noticeIssuedAt: notice.issuedAt,
      delivery: expect.objectContaining({ channel: 'email', succeeded: true }),
    });
  });

  it('sends the partial-approval shortfall notice', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'email-2' }), { status: 200 }));
    const claims = fakeClaimsRepo();
    const service = createClaimsNotificationService({
      env: fakeEnv(),
      accounts: { async findById() { return fakeAccount(); } } as never,
      claims,
    });
    const notice = fakeNotice({ kind: 'partial_approval_shortfall', groundCode: 'QUANTUM_DISPUTED' });

    await service.sendDecisionNoticeEmail({ accountId: 'acct-1', claimId: 'claim-2', notice });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(claims.appendNoticeDelivery).toHaveBeenCalledWith(
      'claim-2',
      expect.objectContaining({ delivery: expect.objectContaining({ succeeded: true }) }),
    );
  });

  it('sends the administrative-close notice', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'email-3' }), { status: 200 }));
    const claims = fakeClaimsRepo();
    const service = createClaimsNotificationService({
      env: fakeEnv(),
      accounts: { async findById() { return fakeAccount(); } } as never,
      claims,
    });
    const notice = fakeNotice({ kind: 'administrative_close', groundCode: 'DUPLICATE_CLAIM' });

    await service.sendDecisionNoticeEmail({ accountId: 'acct-1', claimId: 'claim-3', notice });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(claims.appendNoticeDelivery).toHaveBeenCalledWith(
      'claim-3',
      expect.objectContaining({ delivery: expect.objectContaining({ succeeded: true }) }),
    );
  });

  it('sends the renderedText verbatim without re-rendering the template', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'email-4' }), { status: 200 }));
    const claims = fakeClaimsRepo();
    const service = createClaimsNotificationService({
      env: fakeEnv(),
      accounts: { async findById() { return fakeAccount(); } } as never,
      claims,
    });
    const exactStoredText = 'EXACT STORED TEXT marker-0xDEADBEEF — do not regenerate me';
    const notice = fakeNotice({ renderedText: exactStoredText });

    await service.sendDecisionNoticeEmail({ accountId: 'acct-1', claimId: 'claim-4', notice });

    // The email's HTML body carries the notice's own `renderedText` field
    // byte-for-byte (modulo HTML-escaping, which this marker string doesn't
    // trigger) — proving no composer (`buildRejectionNotice`/etc.) was
    // invoked to produce different text for the email than what was stored.
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.html).toContain(exactStoredText);
  });

  it('records a failed delivery (succeeded: false) and leaves the decision standing when Resend is not configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const claims = fakeClaimsRepo();
    const service = createClaimsNotificationService({
      // No resendApiKey/emailFrom — isResendConfigured() returns false.
      env: fakeEnv({ resendApiKey: undefined, emailFrom: undefined }),
      accounts: { async findById() { return fakeAccount(); } } as never,
      claims,
    });
    const notice = fakeNotice();

    await expect(
      service.sendDecisionNoticeEmail({ accountId: 'acct-1', claimId: 'claim-5', notice }),
    ).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(claims.appendNoticeDelivery).toHaveBeenCalledWith('claim-5', {
      noticeIssuedAt: notice.issuedAt,
      delivery: expect.objectContaining({ channel: 'email', succeeded: false }),
    });
  });

  it('records a failed delivery when the Resend API call itself fails, and resolves rather than throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }));
    const claims = fakeClaimsRepo();
    const service = createClaimsNotificationService({
      env: fakeEnv(),
      accounts: { async findById() { return fakeAccount(); } } as never,
      claims,
    });
    const notice = fakeNotice();

    await expect(
      service.sendDecisionNoticeEmail({ accountId: 'acct-1', claimId: 'claim-6', notice }),
    ).resolves.toBeUndefined();

    expect(claims.appendNoticeDelivery).toHaveBeenCalledWith('claim-6', {
      noticeIssuedAt: notice.issuedAt,
      delivery: expect.objectContaining({ channel: 'email', succeeded: false }),
    });
  });

  it('refuses to send to an unverified (pending_verification) account and records a failed attempt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const claims = fakeClaimsRepo();
    const service = createClaimsNotificationService({
      env: fakeEnv(),
      accounts: {
        async findById() {
          return fakeAccount({ accountState: 'pending_verification' });
        },
      } as never,
      claims,
    });
    const notice = fakeNotice();

    await service.sendDecisionNoticeEmail({ accountId: 'acct-1', claimId: 'claim-7', notice });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(claims.appendNoticeDelivery).toHaveBeenCalledWith('claim-7', {
      noticeIssuedAt: notice.issuedAt,
      delivery: expect.objectContaining({ channel: 'email', succeeded: false }),
    });
  });

  it('refuses to send when the account cannot be found', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const claims = fakeClaimsRepo();
    const service = createClaimsNotificationService({
      env: fakeEnv(),
      accounts: { async findById() { return null; } } as never,
      claims,
    });
    const notice = fakeNotice();

    await service.sendDecisionNoticeEmail({ accountId: 'acct-missing', claimId: 'claim-8', notice });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(claims.appendNoticeDelivery).toHaveBeenCalledWith('claim-8', {
      noticeIssuedAt: notice.issuedAt,
      delivery: expect.objectContaining({ channel: 'email', succeeded: false }),
    });
  });

  it('never emails a more_info_request notice (not an adverse decision)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const claims = fakeClaimsRepo();
    const service = createClaimsNotificationService({
      env: fakeEnv(),
      accounts: { async findById() { return fakeAccount(); } } as never,
      claims,
    });
    const notice = fakeNotice({ kind: 'more_info_request', groundCode: null });

    await service.sendDecisionNoticeEmail({ accountId: 'acct-1', claimId: 'claim-9', notice });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(claims.appendNoticeDelivery).toHaveBeenCalledWith('claim-9', {
      noticeIssuedAt: notice.issuedAt,
      delivery: expect.objectContaining({ channel: 'email', succeeded: false }),
    });
  });
});
