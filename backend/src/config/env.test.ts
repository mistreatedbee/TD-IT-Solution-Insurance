/**
 * INC-003 §26 C-5 / K-5 — TRUST_PROXY_HOPS bounds.
 * security-review.md §16.4 SR-018-11 / CR-018-10 — production boot-time
 * guard against placeholder claim-notice config.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { parseTrustProxyHops, MAX_TRUST_PROXY_HOPS, loadEnv } from './env.js';

describe('parseTrustProxyHops', () => {
  it('defaults to 1 when unset (unchanged behaviour)', () => {
    expect(parseTrustProxyHops(undefined)).toBe(1);
  });

  it('accepts integers from 0 to the maximum', () => {
    expect(MAX_TRUST_PROXY_HOPS).toBe(5);
    for (let n = 0; n <= MAX_TRUST_PROXY_HOPS; n++) {
      expect(parseTrustProxyHops(String(n))).toBe(n);
    }
  });

  it('fails startup above the maximum', () => {
    expect(() => parseTrustProxyHops('6')).toThrow(/exceeds the maximum of 5/);
    expect(() => parseTrustProxyHops('30')).toThrow(/exceeds the maximum/);
  });

  it('rejects non-integer, negative and non-numeric values (including "true")', () => {
    for (const bad of ['-1', '1.5', 'abc', 'true']) {
      expect(() => parseTrustProxyHops(bad)).toThrow(/Invalid TRUST_PROXY_HOPS/);
    }
  });
});

describe('loadEnv — SR-018-11 / CR-018-10 production placeholder-notice-config boot guard', () => {
  const originalEnv = { ...process.env };

  const validBaseline: Record<string, string> = {
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://localhost:27017/test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    SUPABASE_DB_URL: 'postgres://user:pass@localhost:5432/postgres',
    SUPABASE_DB_CA_CERT_PATH: '/tmp/ca.pem',
    REDIS_URL: 'rediss://localhost:6379',
    SESSION_JWT_SIGNING_KEYS: 'kid1:' + 'a'.repeat(32),
    SESSION_JWT_ACTIVE_KID: 'kid1',
    CORS_ALLOWED_ORIGINS: 'https://example.com',
  };

  function resetEnv(overrides: Record<string, string | undefined>): void {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
    for (const [key, value] of Object.entries(validBaseline)) {
      process.env[key] = value;
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });

  it('refuses to start in production when CLAIMS_API_ENABLED=true and claim-notice config is still placeholder', () => {
    resetEnv({ CLAIMS_API_ENABLED: 'true' });
    // Deliberately leave every CLAIMS_NOTICE_* var unset so loadEnv()
    // substitutes TODO_OWNER_MUST_CONFIGURE placeholders for all of them.
    expect(() => loadEnv()).toThrow(/TODO_OWNER_MUST_CONFIGURE/);
    expect(() => loadEnv()).toThrow(/SR-018-11|CR-018-10/);
  });

  it('starts fine in production when CLAIMS_API_ENABLED is unset, even with placeholder notice config', () => {
    resetEnv({ CLAIMS_API_ENABLED: undefined });
    expect(() => loadEnv()).not.toThrow();
    expect(loadEnv().claimsApiEnabled).toBe(false);
  });

  it('starts fine in production when CLAIMS_API_ENABLED=true and every claim-notice value is real', () => {
    resetEnv({
      CLAIMS_API_ENABLED: 'true',
      CLAIMS_NOTICE_INTERNAL_COMPLAINTS_CONTACT: 'complaints@example.com',
      CLAIMS_NOTICE_NFO_NAME: 'NFO',
      CLAIMS_NOTICE_NFO_WEBSITE: 'https://nfo.example',
      CLAIMS_NOTICE_NFO_PHONE: '0800000000',
      CLAIMS_NOTICE_NFO_EMAIL: 'nfo@example.com',
      CLAIMS_NOTICE_FAIS_OMBUD_NAME: 'FAIS Ombud',
      CLAIMS_NOTICE_FAIS_OMBUD_WEBSITE: 'https://faisombud.example',
      CLAIMS_NOTICE_FAIS_OMBUD_PHONE: '0800000001',
      CLAIMS_NOTICE_FAIS_OMBUD_EMAIL: 'fais@example.com',
      CLAIMS_NOTICE_INSURER_LEGAL_NAME: 'TD IT Solution Insurance (Pty) Ltd',
      CLAIMS_NOTICE_INSURER_LICENCE_NUMBER: 'LIC-12345',
      CLAIMS_NOTICE_INSURER_FSP_NUMBER: 'FSP-67890',
    });
    expect(() => loadEnv()).not.toThrow();
    expect(loadEnv().claimsApiEnabled).toBe(true);
  });

  it('does not block non-production startup with placeholder notice config, even with the flag on', () => {
    resetEnv({ NODE_ENV: 'development', CLAIMS_API_ENABLED: 'true' });
    expect(() => loadEnv()).not.toThrow();
  });
});
