/**
 * ADR-0012 (step-up authentication for privileged actions) coverage.
 *
 * Exercises the full HTTP path against fakes (no live Postgres/Redis/
 * Supabase): a stale-session admin gets `STEP_UP_REQUIRED` from
 * `POST /v1/invitations`, completes `POST /auth/mfa/step-up/challenge` +
 * `POST /auth/mfa/step-up/verify`, then successfully retries the original
 * action — plus the wrong-code, rate-limit, and INV-2 refresh-regression
 * cases the ADR's C-3 condition calls out explicitly.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAuthRouter } from './auth.js';
import { createStepUpRouter } from './step-up.js';
import { createInvitationsRouter } from './invitations.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import { mintNewSession, rotateRefreshToken, type SessionRecord, type SessionRepo } from '../lib/refresh-session.js';
import { INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS, MFA_CHALLENGE_LIMIT } from '../lib/policy.js';
import { STEP_UP_ACTIONS } from '../lib/step-up.js';
import type { AppContext } from '../context.js';
import type { AccountRow, AccountStatus, UserType, AccountState } from '../repositories/accounts.js';
import type { SupabaseAdmin } from '../db/supabase.js';
import type { Env } from '../config/env.js';

function fakeEnv(): Env {
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
  };
}

function createFakeSessionRepo(): SessionRepo {
  const rows = new Map<string, SessionRecord>();
  return {
    async insertNew(input) {
      const record: SessionRecord = {
        id: input.id,
        accountId: input.accountId,
        refreshTokenHash: input.refreshTokenHash,
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        familyId: input.familyId,
        createdAt: new Date(),
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
        revokedAt: null,
        revokedReason: null,
        replacedBySessionId: null,
        mfaVerifiedAt: input.mfaVerifiedAt,
      };
      rows.set(record.id, record);
      return record;
    },
    async findByRefreshTokenHash(hash) {
      for (const row of rows.values()) {
        if (row.refreshTokenHash === hash) return row;
      }
      return null;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async revokeAndReplace(id, reason, replacedBySessionId) {
      const row = rows.get(id);
      if (row && row.revokedAt === null) {
        row.revokedAt = new Date();
        row.revokedReason = reason;
        row.replacedBySessionId = replacedBySessionId;
      }
    },
    async revoke(id, reason) {
      const row = rows.get(id);
      if (row && row.revokedAt === null) {
        row.revokedAt = new Date();
        row.revokedReason = reason;
      }
    },
    async revokeFamily(familyId, reason) {
      const revoked: string[] = [];
      for (const row of rows.values()) {
        if (row.familyId === familyId && row.revokedAt === null) {
          row.revokedAt = new Date();
          row.revokedReason = reason;
          revoked.push(row.id);
        }
      }
      return revoked;
    },
    async revokeAllForAccount(accountId, reason) {
      const revoked: string[] = [];
      for (const row of rows.values()) {
        if (row.accountId === accountId && row.revokedAt === null) {
          row.revokedAt = new Date();
          row.revokedReason = reason;
          revoked.push(row.id);
        }
      }
      return revoked;
    },
    async hasPriorSessionForDevice(accountId, deviceId) {
      for (const row of rows.values()) {
        if (row.accountId === accountId && row.deviceId === deviceId) return true;
      }
      return false;
    },
    async touchMfaVerifiedAt(id, at) {
      const row = rows.get(id);
      if (row && row.revokedAt === null) {
        row.mfaVerifiedAt = at;
      }
    },
  };
}

const ADMIN_ID = randomUUID();
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_FACTOR_ID = randomUUID();
const CORRECT_CODE = '123456';

function createFakeAccountsRepo() {
  const row: AccountRow = {
    id: ADMIN_ID,
    userType: 'admin' as UserType,
    accountState: 'active' as AccountState,
    email: ADMIN_EMAIL,
    phone: null,
    mfaRequired: true,
    partnerOrganizationId: null,
    invitedBy: null,
    createdAt: new Date(),
  };
  return {
    async createCustomerAccount(): Promise<AccountRow> {
      throw new Error('not used');
    },
    async createPrivilegedAccountFromInvitation(): Promise<AccountRow> {
      throw new Error('not used');
    },
    async findById(id: string): Promise<AccountRow | null> {
      return id === row.id ? row : null;
    },
    async findByEmail(email: string): Promise<AccountRow | null> {
      return email.trim().toLowerCase() === row.email ? row : null;
    },
    async markEmailVerified(): Promise<void> {
      return;
    },
    async getAccountStatus(id: string): Promise<AccountStatus | null> {
      if (id !== row.id) return null;
      return {
        id: row.id,
        accountState: row.accountState,
        mfaRequired: row.mfaRequired,
        userType: row.userType,
        partnerOrganizationId: row.partnerOrganizationId,
        updatedAt: new Date(),
      };
    },
  };
}

function createFakeSupabaseAdmin(): SupabaseAdmin {
  const notUsed = (name: string) => (): never => {
    throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
  };
  return {
    raw: {} as SupabaseAdmin['raw'],
    createUser: notUsed('createUser'),
    deleteUser: notUsed('deleteUser'),
    verifyPassword: notUsed('verifyPassword'),
    enrollTotpFactor: notUsed('enrollTotpFactor'),
    async challengeTotpFactor(_userAccessToken, factorId) {
      return { challengeId: `challenge-${factorId}` };
    },
    async verifyTotpFactor(_userAccessToken, _factorId, _challengeId, code) {
      return code === CORRECT_CODE;
    },
    async findVerifiedTotpFactor() {
      return { factorId: ADMIN_FACTOR_ID };
    },
    updateUserPassword: notUsed('updateUserPassword'),
    generateEmailVerificationLink: notUsed('generateEmailVerificationLink'),
    sendSignupConfirmationEmail: notUsed('sendSignupConfirmationEmail'),
    sendPasswordRecoveryEmail: notUsed('sendPasswordRecoveryEmail'),
    async sendInvitationEmail() {
      return undefined;
    },
    getUserByEmail: async () => null,
    getUserFromAccessToken: notUsed('getUserFromAccessToken'),
    isUserEmailConfirmed: async () => false,
    verifySignupToken: notUsed('verifySignupToken'),
    generatePasswordResetLink: notUsed('generatePasswordResetLink'),
    verifyRecoveryToken: notUsed('verifyRecoveryToken'),
    async mintTransientUserAccessToken(email) {
      return `transient-token-for-${email}`;
    },
  };
}

function createFakeAuditLog() {
  const events: Array<{ accountId: string | null; eventType: string }> = [];
  return {
    events,
    async record(event: { accountId: string | null; eventType: string }) {
      events.push(event);
    },
  };
}

function createFakeInvitationsRepo() {
  return {
    async hasPendingForEmail() {
      return false;
    },
    async create(input: { email: string; userType: string; partnerOrganizationId: string | null; invitedBy: string }) {
      return {
        id: randomUUID(),
        email: input.email,
        userType: input.userType,
        partnerOrganizationId: input.partnerOrganizationId,
        invitedBy: input.invitedBy,
        status: 'pending' as const,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        acceptedAt: null,
        createdAt: new Date(),
      };
    },
    async findByTokenHash() {
      return null;
    },
    async markAccepted() {
      return null;
    },
  };
}

function createFakeIdempotencyRepo() {
  const store = new Map<string, { accountId: string | null; requestHash: string; responseStatus: number; responseBody: unknown }>();
  return {
    async find(endpoint: string, key: string, accountId: string | null) {
      const row = store.get(`${endpoint}::${key}`);
      if (!row || row.accountId !== (accountId ?? null)) return null;
      return row;
    },
    async store(input: {
      endpoint: string;
      idempotencyKey: string;
      accountId: string | null;
      requestHash: string;
      responseStatus: number;
      responseBody: unknown;
    }) {
      if (!store.has(`${input.endpoint}::${input.idempotencyKey}`)) {
        store.set(`${input.endpoint}::${input.idempotencyKey}`, {
          accountId: input.accountId,
          requestHash: input.requestHash,
          responseStatus: input.responseStatus,
          responseBody: input.responseBody,
        });
      }
    },
  };
}

function buildCtx(sessions: SessionRepo, kv: InMemoryKeyValueStore): AppContext {
  return {
    env: fakeEnv(),
    pool: undefined as unknown as AppContext['pool'],
    kv,
    supabase: createFakeSupabaseAdmin(),
    accounts: createFakeAccountsRepo() as unknown as AppContext['accounts'],
    invitations: createFakeInvitationsRepo() as unknown as AppContext['invitations'],
    sessions,
    enrollmentTickets: undefined as unknown as AppContext['enrollmentTickets'],
    resetMfaTokens: undefined as unknown as AppContext['resetMfaTokens'],
    auditLog: createFakeAuditLog() as unknown as AppContext['auditLog'],
    idempotency: createFakeIdempotencyRepo() as unknown as AppContext['idempotency'],
    policies: undefined as unknown as AppContext['policies'],
    assets: undefined as unknown as AppContext['assets'],
    policyStatusHistory: undefined as unknown as AppContext['policyStatusHistory'],
    adminAccessLog: undefined as unknown as AppContext['adminAccessLog'],
    recoveryCases: undefined as unknown as AppContext['recoveryCases'],
    planCatalog: undefined as unknown as AppContext['planCatalog'],
    pushTokens: undefined as unknown as AppContext['pushTokens'],
    pushTokenSecurityLog: undefined as unknown as AppContext['pushTokenSecurityLog'],
    notificationPreferences: undefined as unknown as AppContext['notificationPreferences'],
    pushNotifications: undefined as unknown as AppContext['pushNotifications'],
    customerNotifications: undefined as unknown as AppContext['customerNotifications'],
    authNotifications: undefined as unknown as AppContext['authNotifications'],
    notificationDeliveryState: undefined as unknown as AppContext['notificationDeliveryState'],
    onboardingNotifications: undefined as unknown as AppContext['onboardingNotifications'],
    policyNotifications: undefined as unknown as AppContext['policyNotifications'],
    policyActivation: undefined as unknown as AppContext['policyActivation'],
    recoveryNotifications: undefined as unknown as AppContext['recoveryNotifications'],
  } as AppContext;
}

async function startTestServer(ctx: AppContext): Promise<{ baseUrl: string; server: Server; app: Express }> {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAuthRouter(ctx));
  app.use(createStepUpRouter(ctx));
  app.use(createInvitationsRouter(ctx));
  app.use(errorHandler);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, server, app };
}

function accessTokenFor(env: Env, sessionId: string): string {
  return signAccessToken(
    {
      sub: ADMIN_ID,
      user_type: 'admin',
      mfa_required: true,
      account_state: 'active',
      partner_organization_id: null,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

async function createInvitations(baseUrl: string, token: string) {
  return fetch(`${baseUrl}/invitations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'idempotency-key': randomUUID(),
    },
    body: JSON.stringify({ email: 'newadmin@example.com', userType: 'support_agent' }),
  });
}

describe('ADR-0012 step-up authentication', () => {
  let sessions: SessionRepo;
  let kv: InMemoryKeyValueStore;
  let ctx: AppContext;
  let server: Server;
  let baseUrl: string;
  let sessionId: string;
  let token: string;
  let sessionBefore: Awaited<ReturnType<SessionRepo['findById']>>;

  beforeEach(async () => {
    sessions = createFakeSessionRepo();
    kv = new InMemoryKeyValueStore();
    ctx = buildCtx(sessions, kv);

    // Seed a session whose mfa_verified_at is well outside the 15-minute
    // window — simulates an admin who logged in with MFA over 15 minutes
    // ago and is still working.
    const staleMfaVerifiedAt = new Date(Date.now() - (INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS + 60) * 1000);
    const { session } = await mintNewSession(sessions, {
      accountId: ADMIN_ID,
      deviceId: null,
      deviceName: null,
      ipAddress: '10.0.0.1',
      userAgent: 'test-agent',
      surface: 'privilegedWeb',
      mfaVerifiedAt: staleMfaVerifiedAt,
    });
    sessionId = session.id;
    token = accessTokenFor(ctx.env, sessionId);
    sessionBefore = await sessions.findById(sessionId);

    const started = await startTestServer(ctx);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  it('blocks the privileged action on a stale session, then unblocks it after a successful step-up', async () => {
    const first = await createInvitations(baseUrl, token);
    expect(first.status).toBe(401);
    expect((await first.json()).error.code).toBe('STEP_UP_REQUIRED');

    const challengeRes = await fetch(`${baseUrl}/auth/mfa/step-up/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    expect(challengeRes.status).toBe(200);
    const { stepUpChallengeToken } = (await challengeRes.json()) as { stepUpChallengeToken: string };
    expect(stepUpChallengeToken).toBeTruthy();

    const verifyRes = await fetch(`${baseUrl}/auth/mfa/step-up/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ stepUpChallengeToken, code: CORRECT_CODE }),
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = (await verifyRes.json()) as { mfaVerifiedAt: string; stepUpExpiresAt: string };
    expect(verifyBody.mfaVerifiedAt).toBeTruthy();

    // The session's mfa_verified_at was actually updated server-side.
    const refreshed = await sessions.findById(sessionId);
    expect(refreshed?.mfaVerifiedAt).not.toBeNull();
    expect(Date.now() - (refreshed!.mfaVerifiedAt as Date).getTime()).toBeLessThan(5000);

    // ADR-0012 §2.2.2 / C-3(ii): step-up freshens the factor proof only —
    // it must never extend the session's own lifetime.
    expect(refreshed?.expiresAt.getTime()).toBe(sessionBefore!.expiresAt.getTime());
    expect(refreshed?.absoluteExpiresAt.getTime()).toBe(sessionBefore!.absoluteExpiresAt.getTime());

    // Same original request now succeeds without re-prompting again.
    const retry = await createInvitations(baseUrl, token);
    expect(retry.status).toBe(201);

    server.close();
  });

  it('rejects a wrong code and leaves the action blocked', async () => {
    const challengeRes = await fetch(`${baseUrl}/auth/mfa/step-up/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const { stepUpChallengeToken } = (await challengeRes.json()) as { stepUpChallengeToken: string };

    const verifyRes = await fetch(`${baseUrl}/auth/mfa/step-up/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ stepUpChallengeToken, code: '000000' }),
    });
    expect(verifyRes.status).toBe(400);
    expect((await verifyRes.json()).error.code).toBe('MFA_CHALLENGE_INVALID');

    const still = await createInvitations(baseUrl, token);
    expect(still.status).toBe(401);
    expect((await still.json()).error.code).toBe('STEP_UP_REQUIRED');

    // The session itself must remain intact — a wrong step-up code is not a
    // session-revoking event (ADR-0012 §5.3).
    const session = await sessions.findById(sessionId);
    expect(session?.revokedAt).toBeNull();

    server.close();
  });

  it('rate-limits repeated verify attempts without revoking the session', async () => {
    const challengeRes = await fetch(`${baseUrl}/auth/mfa/step-up/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const { stepUpChallengeToken } = (await challengeRes.json()) as { stepUpChallengeToken: string };

    let lastStatus = 0;
    let lastCode: string | undefined;
    // MFA_CHALLENGE_LIMIT.attempts wrong attempts exhaust the window; one
    // more must be rejected as expired rather than re-checked against
    // Supabase.
    for (let i = 0; i < MFA_CHALLENGE_LIMIT.attempts + 1; i += 1) {
      const res = await fetch(`${baseUrl}/auth/mfa/step-up/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ stepUpChallengeToken, code: '000000' }),
      });
      lastStatus = res.status;
      lastCode = (await res.json()).error.code;
    }
    expect(lastCode).toBe('MFA_CHALLENGE_EXPIRED');
    expect(lastStatus).toBe(410);

    const session = await sessions.findById(sessionId);
    expect(session?.revokedAt).toBeNull();

    server.close();
  });

  it('a challenge minted for one session cannot be spent by another session', async () => {
    const otherSession = await mintNewSession(sessions, {
      accountId: ADMIN_ID,
      deviceId: null,
      deviceName: null,
      ipAddress: '10.0.0.2',
      userAgent: 'other-agent',
      surface: 'privilegedWeb',
      mfaVerifiedAt: null,
    });
    const otherToken = accessTokenFor(ctx.env, otherSession.session.id);

    const challengeRes = await fetch(`${baseUrl}/auth/mfa/step-up/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const { stepUpChallengeToken } = (await challengeRes.json()) as { stepUpChallengeToken: string };

    const crossSessionVerify = await fetch(`${baseUrl}/auth/mfa/step-up/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${otherToken}` },
      body: JSON.stringify({ stepUpChallengeToken, code: CORRECT_CODE }),
    });
    expect(crossSessionVerify.status).toBe(400);
    expect((await crossSessionVerify.json()).error.code).toBe('MFA_CHALLENGE_INVALID');

    server.close();
  });
});

describe('ADR-0012 SU-FU-1 — STEP_UP_ACTIONS table consistency', () => {
  it('every Tier A row is enforced — the table may not claim a gap that is not actually wired', () => {
    expect(STEP_UP_ACTIONS.length).toBeGreaterThan(0);
    for (const row of STEP_UP_ACTIONS) {
      expect(row.status).toBe('enforced');
    }
  });
});

describe('ADR-0012 INV-2 regression — refresh must never renew mfa_verified_at', () => {
  it('rotateRefreshToken copies mfa_verified_at forward verbatim, never to "now"', async () => {
    const sessions = createFakeSessionRepo();
    const originalMfaVerifiedAt = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    const { session, refreshToken } = await mintNewSession(sessions, {
      accountId: ADMIN_ID,
      deviceId: null,
      deviceName: null,
      ipAddress: '10.0.0.1',
      userAgent: 'test-agent',
      surface: 'privilegedWeb',
      mfaVerifiedAt: originalMfaVerifiedAt,
    });
    expect(session.mfaVerifiedAt?.getTime()).toBe(originalMfaVerifiedAt.getTime());

    const result = await rotateRefreshToken(sessions, {
      presentedRefreshToken: refreshToken,
      presentedDeviceId: null,
      ipAddress: '10.0.0.1',
      userAgent: 'test-agent',
      surface: 'privilegedWeb',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    // Ratified INV-2: copied forward VERBATIM, not renewed to the rotation
    // time. If refresh ever starts renewing this, it silently converts
    // step-up into a no-op (ADR-0012 §1.3/§5.1 branch B2).
    expect(result.session.mfaVerifiedAt?.getTime()).toBe(originalMfaVerifiedAt.getTime());
    expect(result.session.mfaVerifiedAt?.getTime()).not.toBe(Date.now());
  });
});
