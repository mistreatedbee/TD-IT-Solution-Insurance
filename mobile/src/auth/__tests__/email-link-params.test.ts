/**
 * INC-003 C-8 / ADR-0014 G-4: the deep links carry what the Send Email Hook
 * appends (`token_hash`, `type`, `email` —
 * supabase/functions/auth-send-email/lib/confirmation-url.ts), with the
 * legacy `token` / `resetToken` / `access_token` names still accepted.
 */
import { ApiError, NetworkUnavailableError } from '../../api/errors';
import {
  clearedEmailLinkParams,
  EMAIL_LINK_PARAM_KEYS,
  hasEmailLinkParams,
  isRetryableBeforeRedemption,
  parseResetPasswordLink,
  parseVerifyEmailLink,
} from '../email-link-params';

function apiError(status: number, code: string) {
  return new ApiError(status, { error: { code, message: code, requestId: 'req-1' } });
}

describe('parseVerifyEmailLink', () => {
  it('reads the hook link: token_hash + type=signup + email (email normalised)', () => {
    expect(
      parseVerifyEmailLink({ token_hash: 'hash-abc', type: 'signup', email: ' User@Example.COM ' }),
    ).toEqual({ kind: 'link', token: 'hash-abc', email: 'user@example.com' });
  });

  it('accepts the `email` OTP-type alias', () => {
    expect(parseVerifyEmailLink({ token_hash: 'h', type: 'email', email: 'a@b.co' }).kind).toBe('link');
  });

  it('still accepts a legacy `token` link, and prefers token_hash when both are present', () => {
    expect(parseVerifyEmailLink({ token: 'legacy', email: 'a@b.co' })).toEqual({
      kind: 'link',
      token: 'legacy',
      email: 'a@b.co',
    });
    expect(parseVerifyEmailLink({ token: 'legacy', token_hash: 'new', email: 'a@b.co' })).toMatchObject({
      token: 'new',
    });
  });

  it('takes the first value when Expo Router hands back an array', () => {
    expect(parseVerifyEmailLink({ token_hash: ['h1', 'h2'], email: ['a@b.co'] })).toMatchObject({
      token: 'h1',
      email: 'a@b.co',
    });
  });

  it('rejects a non-signup type (e.g. a recovery link opened on the verify route)', () => {
    expect(parseVerifyEmailLink({ token_hash: 'h', type: 'recovery', email: 'a@b.co' })).toEqual({
      kind: 'invalid',
      email: 'a@b.co',
    });
  });

  it('rejects a token with no email (the backend requires it)', () => {
    expect(parseVerifyEmailLink({ token_hash: 'h', type: 'signup' })).toEqual({ kind: 'invalid' });
  });

  it('keeps the legacy no-token type=signup redirect as already-verified', () => {
    expect(parseVerifyEmailLink({ type: 'signup' }).kind).toBe('already-verified');
  });

  it('returns none for an empty link, ignoring blank values', () => {
    expect(parseVerifyEmailLink({ token_hash: '  ', token: '' }).kind).toBe('none');
  });
});

describe('parseResetPasswordLink', () => {
  it('maps the hook link to a resetToken credential', () => {
    expect(
      parseResetPasswordLink({ token_hash: 'hash-r', type: 'recovery', email: 'Cust@Example.com' }),
    ).toEqual({
      kind: 'credential',
      credential: { kind: 'link', resetToken: 'hash-r', email: 'cust@example.com' },
    });
  });

  it('accepts legacy resetToken and token names (token_hash wins)', () => {
    expect(parseResetPasswordLink({ resetToken: 'rt', email: 'a@b.co' })).toMatchObject({
      credential: { resetToken: 'rt' },
    });
    expect(parseResetPasswordLink({ token: 't', email: 'a@b.co' })).toMatchObject({
      credential: { resetToken: 't' },
    });
    expect(parseResetPasswordLink({ token: 't', token_hash: 'h', email: 'a@b.co' })).toMatchObject({
      credential: { resetToken: 'h' },
    });
  });

  it('rejects a non-recovery type and a missing email', () => {
    expect(parseResetPasswordLink({ token_hash: 'h', type: 'signup', email: 'a@b.co' }).kind).toBe('invalid');
    expect(parseResetPasswordLink({ token_hash: 'h', type: 'recovery' }).kind).toBe('invalid');
  });

  it('still maps the legacy access_token parameter (A-12), but a hash link takes precedence', () => {
    expect(parseResetPasswordLink({ access_token: 'gotrue-jwt' })).toEqual({
      kind: 'credential',
      credential: { kind: 'recovery-access-token', recoveryAccessToken: 'gotrue-jwt' },
    });
    expect(
      parseResetPasswordLink({ access_token: 'gotrue-jwt', token_hash: 'h', email: 'a@b.co' }),
    ).toMatchObject({ credential: { kind: 'link', resetToken: 'h' } });
  });

  it('returns none with no link', () => {
    expect(parseResetPasswordLink({}).kind).toBe('none');
  });
});

describe('param scrubbing helpers', () => {
  it('detects link params and produces a patch that clears every key', () => {
    expect(hasEmailLinkParams({ token_hash: 'h' })).toBe(true);
    expect(hasEmailLinkParams({})).toBe(false);
    const patch = clearedEmailLinkParams();
    expect(Object.keys(patch).sort()).toEqual([...EMAIL_LINK_PARAM_KEYS].sort());
    expect(Object.values(patch).every((v) => v === undefined)).toBe(true);
  });
});

describe('isRetryableBeforeRedemption', () => {
  it('treats offline, rate-limit, upstream and 5xx failures as link-still-usable', () => {
    expect(isRetryableBeforeRedemption(new NetworkUnavailableError())).toBe(true);
    expect(isRetryableBeforeRedemption(apiError(429, 'RATE_LIMITED'))).toBe(true);
    expect(isRetryableBeforeRedemption(apiError(503, 'UPSTREAM_UNAVAILABLE'))).toBe(true);
    expect(isRetryableBeforeRedemption(apiError(500, 'INTERNAL_ERROR'))).toBe(true);
  });

  it('treats expiry, invalid and post-redemption validation failures as spent', () => {
    expect(isRetryableBeforeRedemption(apiError(410, 'RESET_TOKEN_EXPIRED'))).toBe(false);
    expect(isRetryableBeforeRedemption(apiError(404, 'RESET_TOKEN_INVALID'))).toBe(false);
    expect(isRetryableBeforeRedemption(apiError(400, 'VALIDATION_ERROR'))).toBe(false);
    expect(isRetryableBeforeRedemption(new Error('boom'))).toBe(false);
  });
});
