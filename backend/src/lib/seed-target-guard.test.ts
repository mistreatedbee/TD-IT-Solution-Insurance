import { describe, expect, it } from 'vitest';
import { evaluateSeedGuard, SEED_CONFIRM_FLAG } from './seed-target-guard.js';

const STG = 'https://abcstaging123.supabase.co';
const flag = [SEED_CONFIRM_FLAG];

describe('evaluateSeedGuard', () => {
  it('refuses NODE_ENV=production even for a local target', () => {
    const r = evaluateSeedGuard({ env: { NODE_ENV: 'production', SUPABASE_URL: 'http://localhost:54321' }, argv: flag });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain('NODE_ENV');
  });

  it('refuses prod-looking names and denylisted hosts despite flag + allowlist', () => {
    const host = 'abcprod999.supabase.co';
    const a = evaluateSeedGuard({
      env: { SUPABASE_URL: `https://${host}`, ALLOW_SEED_TARGET: host },
      argv: flag,
    });
    expect(a.ok).toBe(true); // random ref with no marker and allowlisted
    const b = evaluateSeedGuard({
      env: { SUPABASE_URL: STG, ALLOW_SEED_TARGET: 'abcstaging123.supabase.co', MONGODB_URI: 'mongodb+srv://u:p@c.mongodb.net/td-production' },
      argv: flag,
    });
    expect(b.ok).toBe(false);
    const c = evaluateSeedGuard({
      env: { SUPABASE_URL: STG, ALLOW_SEED_TARGET: 'abcstaging123.supabase.co', PRODUCTION_TARGET_HOSTS: 'abcstaging123.supabase.co' },
      argv: flag,
    });
    expect(c.ok).toBe(false);
  });

  it('refuses a remote target without flag or allowlist', () => {
    expect(evaluateSeedGuard({ env: { SUPABASE_URL: STG }, argv: [] }).ok).toBe(false);
    expect(evaluateSeedGuard({ env: { SUPABASE_URL: STG }, argv: flag }).ok).toBe(false);
    expect(
      evaluateSeedGuard({ env: { SUPABASE_URL: STG, ALLOW_SEED_TARGET: 'abcstaging123.supabase.co' }, argv: [] }).ok,
    ).toBe(false);
  });

  it('allows local targets and allowlisted+confirmed staging', () => {
    expect(
      evaluateSeedGuard({ env: { SUPABASE_URL: 'http://127.0.0.1:54321', MONGODB_URI: 'mongodb://localhost:27017/td-dev' }, argv: [] }).ok,
    ).toBe(true);
    expect(
      evaluateSeedGuard({
        env: { SUPABASE_URL: STG, ALLOW_SEED_TARGET: 'abcstaging123.supabase.co', MONGODB_URI: 'mongodb+srv://u:p@c.mongodb.net/td-staging' },
        argv: flag,
      }).ok,
    ).toBe(true);
  });

  it('target label never contains credentials, query strings or keys', () => {
    const r = evaluateSeedGuard({
      env: {
        SUPABASE_URL: `${STG}/?apikey=SECRETKEY`,
        MONGODB_URI: 'mongodb+srv://admin:hunter2@c.mongodb.net/td-staging?authSource=x&password=hunter2',
      },
      argv: flag,
    });
    expect(r.targetLabel).toContain('abcstaging123.supabase.co');
    expect(r.targetLabel).toContain('c.mongodb.net/td-staging');
    for (const s of ['hunter2', 'admin', 'SECRETKEY', 'authSource']) expect(r.targetLabel).not.toContain(s);
  });
});
