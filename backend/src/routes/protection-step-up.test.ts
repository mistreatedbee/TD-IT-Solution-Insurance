/**
 * Feature 021 stage (b) - protection-change step-up (spec 03-stage-b-step-up-spec.md section 9,
 * backend cases 1-13; case 14 is the unmodified ADR-0012 suites). Full HTTP path against
 * in-memory fakes.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAssetsRouter } from './assets.js';
import { createCustomerProfileRouter } from './customer-profile.js';
import { createStepUpRouter } from './step-up.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import { rotateRefreshToken, mintNewSession, type SessionRecord, type SessionRepo } from '../lib/refresh-session.js';
import { requireStepUp, evaluateProtectionStepUp, STEP_UP_ACTIONS, CUSTOMER_PROTECTION_STEP_UP_ACTIONS } from '../lib/step-up.js';
import { PROTECTION_CHANGE_STEP_UP_WINDOW_SECONDS, PROTECTION_REAUTH_LIMIT } from '../lib/policy.js';
import { createAuthNotificationService } from '../lib/auth-notification-service.js';
import { maskPhoneLast3 } from '../lib/domain-email-templates.js';
import { SupabaseUnavailableError } from '../db/supabase.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { AccountRow } from '../repositories/accounts.js';
import type { AssetDocument } from '../repositories/assets.js';
import type { CustomerProfileDocument } from '../repositories/customer-profiles.js';

const PASSWORD = 'correct-horse-battery';
const WINDOW_MS = PROTECTION_CHANGE_STEP_UP_WINDOW_SECONDS * 1000;
const EMAIL = 'customer@example.com';
const ASSET_ID = '507f1f77bcf86cd799439022';

function fakeEnv(extra: Partial<Env> = {}): Env {
  return {
    nodeEnv: 'test', isProduction: false, port: 0,
    mongodbUri: 'mongodb://unused', supabaseUrl: 'https://unused.supabase.co',
    supabaseServiceRoleKey: 'unused', supabaseDbUrl: 'postgres://unused',
    supabaseDbCaCertPath: undefined, redisUrl: undefined,
    jwtSigningKeys: [{ kid: 'test-kid', secret: 'x'.repeat(32) }], jwtActiveKid: 'test-kid',
    internalServiceCredentials: [], trustProxyHops: 0, corsAllowedOrigins: [],
    emailVerificationRedirectUrl: 'x://a', passwordResetRedirectUrl: 'x://b', invitationAcceptRedirectUrl: 'x://c',
    ...extra,
  } as Env;
}

function createSessionRepo() {
  const rows = new Map<string, SessionRecord>();
  const writes: string[] = [];
  const repo: SessionRepo = {
    async insertNew(i) {
      const r: SessionRecord = {
        id: i.id, accountId: i.accountId, refreshTokenHash: i.refreshTokenHash, deviceId: i.deviceId,
        deviceName: i.deviceName, familyId: i.familyId, createdAt: new Date(), expiresAt: i.expiresAt,
        absoluteExpiresAt: i.absoluteExpiresAt, revokedAt: null, revokedReason: null,
        replacedBySessionId: null, mfaVerifiedAt: i.mfaVerifiedAt, passwordReauthAt: i.passwordReauthAt ?? null,
      };
      rows.set(r.id, r);
      return r;
    },
    async findByRefreshTokenHash(h) { return [...rows.values()].find((r) => r.refreshTokenHash === h) ?? null; },
    async findById(id) { return rows.get(id) ?? null; },
    async revokeAndReplace(id, reason, by) {
      const r = rows.get(id);
      if (r && !r.revokedAt) { r.revokedAt = new Date(); r.revokedReason = reason; r.replacedBySessionId = by; }
    },
    async revoke(id, reason) {
      const r = rows.get(id);
      if (r && !r.revokedAt) { r.revokedAt = new Date(); r.revokedReason = reason; }
    },
    async revokeFamily() { return []; },
    async revokeAllForAccount() { return []; },
    async hasPriorSessionForDevice() { return false; },
    async touchMfaVerifiedAt(id, at) { writes.push('mfa'); const r = rows.get(id); if (r && !r.revokedAt) r.mfaVerifiedAt = at; },
    async touchPasswordReauthAt(id, at) { writes.push('password'); const r = rows.get(id); if (r && !r.revokedAt) r.passwordReauthAt = at; },
    async findRevocationWatermark() { return null; },
  };
  return { repo, rows, writes };
}

interface HarnessOpts {
  userType?: string;
  totp?: boolean;
  openClaim?: boolean;
  openCase?: boolean;
  notifyFails?: boolean;
}

async function build(opts: HarnessOpts = {}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = randomUUID();
  const userType = opts.userType ?? 'customer';
  const { repo: sessions, rows, writes } = createSessionRepo();
  const audit: Array<Record<string, unknown>> = [];
  const notices: Array<Record<string, unknown>> = [];
  let phoneWrites = 0;
  let removals = 0;
  const verifyCalls: Array<{ email: string; password: string }> = [];

  const asset: AssetDocument = {
    id: ASSET_ID, accountId, assetType: 'laptop', displayName: 'Work laptop', status: 'active',
    registeredAt: new Date(), estimatedValue: null, photos: [], gpsDeviceId: null, gpsPairedAt: null,
    locationSource: null, reportingDeviceId: null, lastLocation: null, legalHold: false,
    details: { brand: 'Dell', model: 'XPS', serialNumber: 'SN1' }, createdAt: new Date(), updatedAt: new Date(),
  } as AssetDocument;
  let profile: CustomerProfileDocument = {
    id: randomUUID(), accountId, firstName: 'Sam', middleName: null, lastName: 'Doe', dateOfBirth: null,
    phone: '+27111111111', idNumberLast4: null, residentialAddress: null,
    emergencyContact: { name: 'Pat', relationship: 'Sibling', phone: '+27820000111' },
    verificationStatus: 'not_started', verificationSubmittedAt: null, verificationReviewedAt: null,
    rejectionReasonCustomerSafe: null, profilePictureUpdatedAt: null, verificationRevision: 0,
    createdAt: new Date(), updatedAt: new Date(),
  } as CustomerProfileDocument;

  const account: AccountRow = {
    id: accountId, email: EMAIL, userType, accountState: 'active', phone: null,
    partnerOrganizationId: null, mfaRequired: false, invitedBy: null, createdAt: new Date(),
  } as AccountRow;

  const ctx = {
    env, kv, sessions,
    accounts: {
      async findById(id: string) { return id === accountId ? account : null; },
      async getAccountStatus(id: string) {
        return id === accountId
          ? { id, accountState: 'active', mfaRequired: false, userType, partnerOrganizationId: null, updatedAt: new Date() }
          : null;
      },
      async updatePhone() { phoneWrites += 1; },
    },
    supabase: {
      async verifyPassword(email: string, password: string) {
        verifyCalls.push({ email, password });
        if (opts.userType === 'unavailable') throw new SupabaseUnavailableError('x');
        return password === PASSWORD ? { userId: 'u', userAccessToken: 'transient' } : null;
      },
      async findVerifiedTotpFactor() { return opts.totp ? { factorId: 'f' } : null; },
      async mintTransientUserAccessToken() { return 'token'; },
    },
    auditLog: { async record(e: Record<string, unknown>) { audit.push(e); } },
    authNotifications: {
      async notifyProtectionChanged(p: Record<string, unknown>) {
        notices.push(p);
        if (opts.notifyFails) throw new Error('resend down');
      },
    },
    customerNotifications: { async notifyAssetRemoved() { return undefined; } },
    assets: {
      async findByIdForAccount(a: string, id: string) { return a === accountId && id === ASSET_ID ? asset : null; },
      async markRemovedForAccount() { removals += 1; asset.status = 'removed'; return { ...asset, status: 'removed' }; },
      async listByAccount() { return []; },
    },
    claims: { async findNonTerminalByAssetForAccount() { return opts.openClaim ? ({ id: 'c' } as never) : null; } },
    recoveryCases: {
      async findOpenByAssetForAccount() { return opts.openCase ? ({ id: 'r' } as never) : null; },
      async listByAccount() { return []; },
    },
    policies: { async listByAccount() { return []; } },
    customerProfiles: {
      async getOrCreateForAccount() { return profile; },
      async updateForAccount(_a: string, patch: Partial<CustomerProfileDocument>) {
        profile = { ...profile, ...patch };
        return profile;
      },
    },
    alerts: { async upsertForAccount() { return {}; }, async dismissStaleKeys() { return undefined; } },
  } as unknown as AppContext;

  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAssetsRouter(ctx));
  app.use(createCustomerProfileRouter(ctx));
  app.use(createStepUpRouter(ctx));
  app.use(errorHandler);
  const server: Server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const newSession = async (p: { mfa?: Date | null; pw?: Date | null; deviceName?: string } = {}) => {
    const { session } = await mintNewSession(sessions, {
      accountId, deviceId: 'dev', deviceName: p.deviceName ?? 'Sam iPhone', ipAddress: '1.1.1.1',
      userAgent: 'ua', surface: 'customerMobile', mfaVerifiedAt: p.mfa ?? null,
    });
    if (p.pw) await sessions.touchPasswordReauthAt(session.id, p.pw);
    writes.length = 0;
    const token = signAccessToken(
      { sub: accountId, user_type: userType as 'customer', mfa_required: false, account_state: 'active', partner_organization_id: null, session_id: session.id },
      env.jwtSigningKeys, env.jwtActiveKid,
    ).token;
    return { id: session.id, token };
  };
  const ago = (ms: number) => new Date(Date.now() - ms);
  const call = (path: string, method: string, token: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const flush = () => new Promise((r) => setTimeout(r, 25));

  return {
    ctx, kv, server, rows, writes, audit, notices, verifyCalls, newSession, ago, call, flush, accountId,
    stats: () => ({ phoneWrites, removals, profile, asset }),
  };
}

let active: Awaited<ReturnType<typeof build>> | undefined;
async function h(opts?: HarnessOpts) {
  active = await build(opts);
  return active;
}
afterEach(async () => {
  if (active) await new Promise<void>((r) => active!.server.close(() => r()));
  active = undefined;
  vi.restoreAllMocks();
});

const NEW_CONTACT = { name: 'Alex', relationship: 'Friend', phone: '+27829999123' };
const body = async (r: Response) => (await r.json()) as { error: { code: string; attemptsRemaining?: number }; [k: string]: unknown };

describe('1. G-1 / G-2 enforcement', () => {
  it('G-1: no proof -> 401 STEP_UP_REQUIRED, no mutation, no audit row', async () => {
    const t = await h();
    const s = await t.newSession();
    const res = await t.call(`/assets/${ASSET_ID}`, 'DELETE', s.token);
    expect(res.status).toBe(401);
    expect((await body(res)).error.code).toBe('STEP_UP_REQUIRED');
    expect(t.stats().removals).toBe(0);
    expect(t.audit).toHaveLength(0);
  });
  it('G-1: fresh MFA proof -> 200; fresh password proof -> 200; method recorded', async () => {
    const t = await h();
    const mfa = await t.newSession({ mfa: t.ago(1000) });
    expect((await t.call(`/assets/${ASSET_ID}`, 'DELETE', mfa.token)).status).toBe(200);
    expect(t.audit.find((e) => e.eventType === 'protection_change')?.protectionDetail).toBe(`asset_removed|mfa|${ASSET_ID}`);
    const t2 = await h();
    const pw = await t2.newSession({ pw: t2.ago(1000) });
    expect((await t2.call(`/assets/${ASSET_ID}`, 'DELETE', pw.token)).status).toBe(200);
    expect(t2.audit.find((e) => e.eventType === 'protection_change')?.protectionDetail).toBe(`asset_removed|password|${ASSET_ID}`);
  });
  it('G-1/G-2: proof older than 300 s -> 401; 299 s passes; exactly 300 s passes (boundary)', async () => {
    const t = await h();
    const stale = await t.newSession({ mfa: t.ago(WINDOW_MS + 1000), pw: t.ago(WINDOW_MS + 1000) });
    expect((await t.call(`/assets/${ASSET_ID}`, 'DELETE', stale.token)).status).toBe(401);
    expect((await t.call('/account/profile', 'PATCH', stale.token, { emergencyContact: NEW_CONTACT })).status).toBe(401);
    const near = await t.newSession({ mfa: t.ago(WINDOW_MS - 1000) });
    expect((await t.call('/account/profile', 'PATCH', near.token, { emergencyContact: NEW_CONTACT })).status).toBe(200);
    const edge = await t.newSession({ pw: new Date(1_000_000) });
    expect(await evaluateProtectionStepUp(t.ctx, edge.id, 1_000_000 + WINDOW_MS)).toBe('password');
    expect(await evaluateProtectionStepUp(t.ctx, edge.id, 1_000_000 + WINDOW_MS + 1)).toBeNull();
  });
});

describe('2. G-2 field-level gating', () => {
  it('editing only firstName with no proof -> 200; unchanged contact re-sent -> 200', async () => {
    const t = await h();
    const s = await t.newSession();
    expect((await t.call('/account/profile', 'PATCH', s.token, { firstName: 'Samuel' })).status).toBe(200);
    expect((await t.call('/account/profile', 'PATCH', s.token, { emergencyContact: { name: 'Pat', relationship: 'Sibling', phone: '+27820000111' } })).status).toBe(200);
    expect(t.audit.filter((e) => e.eventType === 'protection_change')).toHaveLength(0);
  });
  it('changing emergencyContact with no proof -> 401 and phone in the same body is NOT written', async () => {
    const t = await h();
    const s = await t.newSession();
    const res = await t.call('/account/profile', 'PATCH', s.token, { phone: '+27833333333', firstName: 'Zed', emergencyContact: NEW_CONTACT });
    expect(res.status).toBe(401);
    expect(t.stats().phoneWrites).toBe(0);
    expect(t.stats().profile.firstName).toBe('Sam');
    expect(t.stats().profile.emergencyContact?.name).toBe('Pat');
  });
});

describe('3. A-6 open claim / case', () => {
  it('G-1 with an open claim or an open recovery case -> 409 even with fresh proof, copy names neither', async () => {
    for (const o of [{ openClaim: true }, { openCase: true }]) {
      const t = await h(o);
      const s = await t.newSession({ mfa: t.ago(500) });
      const res = await t.call(`/assets/${ASSET_ID}`, 'DELETE', s.token);
      expect(res.status).toBe(409);
      const text = JSON.stringify(await res.json()).toLowerCase();
      expect(text).not.toMatch(/claim|recovery|case/);
      expect(t.stats().removals).toBe(0);
    }
  });
});

describe('4. revoked session', () => {
  it('revoked session with a fresh passwordReauthAt -> STEP_UP_REQUIRED (evaluator and no mutation)', async () => {
    const t = await h();
    const s = await t.newSession({ pw: t.ago(100) });
    await t.ctx.sessions.revoke(s.id, 'logout');
    expect(await evaluateProtectionStepUp(t.ctx, s.id)).toBeNull();
    const res = await t.call(`/assets/${ASSET_ID}`, 'DELETE', s.token);
    expect(res.status).toBe(401);
    expect(t.stats().removals).toBe(0);
  });
});

describe('5/7. P-INV-1 and P-INV-4: password re-auth write scope', () => {
  it('writes only password_reauth_at; mfa_verified_at and both expiries unchanged; no tokens in response', async () => {
    const t = await h();
    const s = await t.newSession();
    const before = { ...t.rows.get(s.id)! };
    const res = await t.call('/auth/reauth/password', 'POST', s.token, { password: PASSWORD });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(['reauthAt', 'reauthExpiresAt']);
    const after = t.rows.get(s.id)!;
    expect(t.writes).toEqual(['password']);
    expect(after.mfaVerifiedAt).toEqual(before.mfaVerifiedAt);
    expect(after.expiresAt).toEqual(before.expiresAt);
    expect(after.absoluteExpiresAt).toEqual(before.absoluteExpiresAt);
    expect(after.passwordReauthAt).not.toBeNull();
    expect(new Date(json.reauthExpiresAt as string).getTime() - new Date(json.reauthAt as string).getTime()).toBe(WINDOW_MS);
    // the proof now satisfies a guarded action
    expect((await t.call(`/assets/${ASSET_ID}`, 'DELETE', s.token)).status).toBe(200);
  });
  it('the admin requireStepUp rejects a session with only a fresh passwordReauthAt', async () => {
    const t = await h();
    const s = await t.newSession({ pw: t.ago(100) });
    const mw = requireStepUp(t.ctx, 15 * 60);
    const next = vi.fn();
    await mw({ auth: { sessionId: s.id, accountId: t.accountId } } as never, {} as never, next);
    const err = next.mock.calls[0]?.[0] as { code?: string } | undefined;
    expect(err?.code).toBe('STEP_UP_REQUIRED');
    // and the admin policy table is untouched / the customer table is separate
    expect(STEP_UP_ACTIONS.every((a) => a.status === 'enforced')).toBe(true);
    expect(CUSTOMER_PROTECTION_STEP_UP_ACTIONS.map((a) => a.status)).toEqual(['enforced', 'enforced', 'reserved']);
  });
});

describe('6. P-INV-2: refresh copies password_reauth_at and never renews it', () => {
  it('copy-forward only', async () => {
    const { repo } = createSessionRepo();
    const reauth = new Date(Date.now() - 120_000);
    const { session, refreshToken } = await mintNewSession(repo, {
      accountId: randomUUID(), deviceId: null, deviceName: null, ipAddress: null, userAgent: null,
      surface: 'customerMobile', mfaVerifiedAt: null,
    });
    await repo.touchPasswordReauthAt(session.id, reauth);
    const result = await rotateRefreshToken(repo, {
      presentedRefreshToken: refreshToken, presentedDeviceId: null, ipAddress: null, userAgent: null, surface: 'customerMobile',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.passwordReauthAt).toEqual(reauth);
    // a session that never re-authenticated stays null after refresh
    const { session: s2, refreshToken: t2 } = await mintNewSession(repo, {
      accountId: randomUUID(), deviceId: null, deviceName: null, ipAddress: null, userAgent: null,
      surface: 'customerMobile', mfaVerifiedAt: null,
    });
    void s2;
    const r2 = await rotateRefreshToken(repo, {
      presentedRefreshToken: t2, presentedDeviceId: null, ipAddress: null, userAgent: null, surface: 'customerMobile',
    });
    if (r2.ok) expect(r2.session.passwordReauthAt).toBeNull();
  });
});

describe('8/9/11. route preconditions', () => {
  it('8: account with a verified TOTP factor -> 409 MFA_STEP_UP_REQUIRED, nothing written', async () => {
    const t = await h({ totp: true });
    const s = await t.newSession();
    const res = await t.call('/auth/reauth/password', 'POST', s.token, { password: PASSWORD });
    expect(res.status).toBe(409);
    expect((await body(res)).error.code).toBe('MFA_STEP_UP_REQUIRED');
    expect(t.writes).toHaveLength(0);
    expect(t.rows.get(s.id)!.passwordReauthAt).toBeNull();
  });
  it('9: email / accountId / biometricVerified in the body -> 400, password never verified', async () => {
    const t = await h();
    const s = await t.newSession();
    for (const extra of [{ email: 'x@y.z' }, { accountId: randomUUID() }, { biometricVerified: true }]) {
      const res = await t.call('/auth/reauth/password', 'POST', s.token, { password: PASSWORD, ...extra });
      expect(res.status).toBe(400);
    }
    expect(t.verifyCalls).toHaveLength(0);
  });
  it('11: privileged userType -> 403; email comes from the account row only', async () => {
    const t = await h({ userType: 'admin' });
    const s = await t.newSession();
    expect((await t.call('/auth/reauth/password', 'POST', s.token, { password: PASSWORD })).status).toBe(403);
    expect(t.writes).toHaveLength(0);
    const c = await h();
    const cs = await c.newSession();
    await c.call('/auth/reauth/password', 'POST', cs.token, { password: PASSWORD });
    expect(c.verifyCalls[0]?.email).toBe(EMAIL);
  });
});

describe('10. lockout', () => {
  it('5th wrong password revokes only the current session; other sessions survive; login counter untouched', async () => {
    const t = await h();
    const a = await t.newSession();
    const b = await t.newSession();
    for (let i = 1; i < PROTECTION_REAUTH_LIMIT.attempts; i += 1) {
      const res = await t.call('/auth/reauth/password', 'POST', a.token, { password: 'wrong-wrong-wrong' });
      expect(res.status).toBe(401);
      const j = await body(res);
      expect(j.error.code).toBe('INVALID_CREDENTIALS');
      expect(j.error.attemptsRemaining).toBe(PROTECTION_REAUTH_LIMIT.attempts - i);
    }
    expect(t.rows.get(a.id)!.revokedAt).toBeNull();
    const fifth = await t.call('/auth/reauth/password', 'POST', a.token, { password: 'wrong-wrong-wrong' });
    expect(fifth.status).toBe(401);
    expect(t.rows.get(a.id)!.revokedAt).not.toBeNull();
    expect(t.rows.get(b.id)!.revokedAt).toBeNull();
    expect(await t.kv.get(`rl:login:id:${EMAIL}`)).toBeNull();
    expect(t.audit.map((e) => e.eventType)).toContain('protection_reauth_exhausted');
    await t.flush();
    expect(t.notices.some((n) => n.action === 'reauth_exhausted')).toBe(true);
    // The per-ACCOUNT reauth counter is also exhausted, so re-authentication stays throttled
    // (429) for the window on every session - but the other session is not revoked and the
    // account is not locked: it can still make ordinary calls.
    expect((await t.call('/auth/reauth/password', 'POST', b.token, { password: PASSWORD })).status).toBe(429);
    expect(t.rows.get(b.id)!.revokedAt).toBeNull();
    expect(t.verifyCalls).toHaveLength(PROTECTION_REAUTH_LIMIT.attempts);
  });
});

describe('12. out-of-band notice', () => {
  it('sent through Resend even when channels.account.email === false; no coordinates or full phone', async () => {
    const sent: Array<{ body: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => {
      sent.push({ body: init.body });
      return { ok: true, status: 200, text: async () => '' };
    }));
    const service = createAuthNotificationService({
      env: fakeEnv({ resendApiKey: 'k', emailFrom: 'no-reply@example.com' } as Partial<Env>),
      accounts: { async findById() { return { id: 'a', email: EMAIL, userType: 'customer' }; } } as never,
      notificationPreferences: { async getOrCreate() { throw new Error('prefs must not be consulted'); } } as never,
      pushNotifications: { sendToAccount: vi.fn() } as never,
    });
    await service.notifyProtectionChanged({
      accountId: 'a', action: 'emergency_contact_changed', contactPhoneMasked: maskPhoneLast3('+27829999123'),
      deviceName: 'Sam iPhone', at: new Date('2026-11-17T10:00:00Z'),
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toContain('Sam iPhone');
    expect(sent[0]!.body).toContain('***123');
    expect(sent[0]!.body).not.toContain('27829999123');
    expect(sent[0]!.body).not.toMatch(/latitude|longitude|lat\b|lng/i);
    vi.unstubAllGlobals();
  });
  it('a notice failure leaves the change committed and audits protection_change_notice_failed', async () => {
    const t = await h({ notifyFails: true });
    const s = await t.newSession({ mfa: t.ago(100) });
    const res = await t.call(`/assets/${ASSET_ID}`, 'DELETE', s.token);
    expect(res.status).toBe(200);
    await t.flush();
    expect(t.stats().removals).toBe(1);
    expect(t.audit.map((e) => e.eventType)).toContain('protection_change_notice_failed');
  });
  it('emergency contact change notifies with a masked number and the session device name', async () => {
    const t = await h();
    const s = await t.newSession({ mfa: t.ago(100), deviceName: 'Sam iPhone' });
    expect((await t.call('/account/profile', 'PATCH', s.token, { emergencyContact: NEW_CONTACT })).status).toBe(200);
    await t.flush();
    expect(t.notices[0]).toMatchObject({ action: 'emergency_contact_changed', contactPhoneMasked: '***123', deviceName: 'Sam iPhone' });
    expect(JSON.stringify(t.notices)).not.toContain('Alex');
  });
});

describe('13. audit rows and log hygiene', () => {
  it('writes verified / failed / change events and never a password, code, token or contact detail', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    }
    const t = await h();
    const s = await t.newSession();
    await t.call('/auth/reauth/password', 'POST', s.token, { password: 'wrong-wrong-wrong' });
    await t.call('/auth/reauth/password', 'POST', s.token, { password: PASSWORD });
    await t.call('/account/profile', 'PATCH', s.token, { emergencyContact: NEW_CONTACT });
    await t.flush();
    const types = t.audit.map((e) => e.eventType);
    expect(types).toEqual(expect.arrayContaining(['protection_reauth_failed', 'protection_reauth_verified', 'protection_change']));
    const blob = JSON.stringify(t.audit) + logs.join('\n');
    for (const secret of [PASSWORD, 'wrong-wrong-wrong', 'transient', 'Alex', '27829999123', s.token]) {
      expect(blob).not.toContain(secret);
    }
    for (const e of t.audit) {
      expect(e.actorSessionId).toBe(s.id);
      expect(e.accountId).toBe(t.accountId);
    }
  });
});
