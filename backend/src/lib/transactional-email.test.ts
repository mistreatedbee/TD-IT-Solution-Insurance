import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isEmailConfigured, sendTransactionalEmail } from './transactional-email.js';
import type { Env } from '../config/env.js';

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    nodeEnv: 'test',
    isProduction: false,
    port: 3000,
    mongodbUri: 'mongodb://unused',
    supabaseUrl: 'https://unused.supabase.co',
    supabaseServiceRoleKey: 'unused',
    supabaseDbUrl: 'postgres://unused',
    supabaseDbCaCertPath: undefined,
    redisUrl: undefined,
    jwtSigningKeys: [{ kid: 'k', secret: 'x'.repeat(32) }],
    jwtActiveKid: 'k',
    internalServiceCredentials: [],
    trustProxyHops: 0,
    corsAllowedOrigins: [],
    brevoApiKey: undefined,
    emailFrom: undefined,
    emailFromName: undefined,
    emailVerificationRedirectUrl: 'tditinsurance://verify-email',
    passwordResetRedirectUrl: 'tditinsurance://reset-password',
    invitationAcceptRedirectUrl: 'tditinsurance://invitations/accept',
    ...overrides,
  };
}

describe('transactional-email', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isEmailConfigured is false without credentials', () => {
    expect(isEmailConfigured(baseEnv())).toBe(false);
    expect(isEmailConfigured(baseEnv({ brevoApiKey: 'key' }))).toBe(false);
  });

  it('isEmailConfigured is true when Brevo key and from address are set', () => {
    expect(isEmailConfigured(baseEnv({ brevoApiKey: 'key', emailFrom: 'noreply@example.com' }))).toBe(
      true,
    );
  });

  it('returns false and does not fetch when email is not configured', async () => {
    const fetchMock = vi.mocked(fetch);
    const sent = await sendTransactionalEmail(baseEnv(), {
      to: 'user@example.com',
      kind: 'verification',
      actionLink: 'https://example.com/verify',
    });
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls Brevo API when configured', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(
      new Response('{}', { status: 201 }),
    );
    const sent = await sendTransactionalEmail(
      baseEnv({ brevoApiKey: 'test-key', emailFrom: 'noreply@tditsolutions.co.za' }),
      {
        to: 'user@example.com',
        kind: 'verification',
        actionLink: 'https://example.com/verify?token=abc',
      },
    );
    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ 'api-key': 'test-key' });
  });
});
