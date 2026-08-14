/**
 * SR-14 forced-re-enrollment unit/integration test.
 *
 * api-design.md §11 Amendment B ratified the wire shape
 * (`mfaEnrollmentRequired`/`enrollmentTicket`/`expiresIn`) `POST /auth/login`
 * returns for an `mfa_required` account with no verified TOTP factor, but
 * flagged a blocking bug: the login handler issued the ticket via
 * `issueEnrollmentTicket` without ever calling `storePendingEnrollment` (the
 * KV-backed pending-enrollment record `/mfa/enroll`'s pre-session path also
 * requires, per SR-1's mechanism — see `lib/enrollment-pending-store.ts` and
 * `routes/invitations.ts`'s `/accept` handler, which already did this
 * correctly). Without it, the ticket passes `validateEnrollmentTicket` and
 * then immediately fails at `getPendingEnrollment` with
 * `ENROLLMENT_TICKET_INVALID` — the forced-re-enrollment flow was broken
 * end-to-end.
 *
 * This test exercises the full path against real HTTP requests to a router
 * stack built from fakes (no live Postgres/Redis/Supabase) — mirroring the
 * exact sequence a real client performs: login (mfa_required, no verified
 * factor) -> mfaEnrollmentRequired -> POST /mfa/enroll (ticket) ->
 * POST /mfa/enroll/verify (TOTP code) -> session tokens issued. It fails
 * against the pre-fix code (which omits `storePendingEnrollment`) with
 * `ENROLLMENT_TICKET_INVALID` at the `/mfa/enroll` step.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAuthRouter } from './auth.js';
import { createMfaRouter } from './mfa.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import type { AppContext } from '../context.js';
import type { AccountRow, AccountStatus, UserType, AccountState } from '../repositories/accounts.js';
import type { EnrollmentTicketRecord, EnrollmentTicketRepo } from '../lib/enrollment-ticket.js';
import type { SessionRecord, SessionRepo } from '../lib/refresh-session.js';
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

function createFakeEnrollmentTicketRepo(): EnrollmentTicketRepo {
  const rows = new Map<string, EnrollmentTicketRecord>();
  return {
    async create({ tokenHash, accountId, expiresAt }) {
      const record: EnrollmentTicketRecord = { id: randomUUID(), tokenHash, accountId, expiresAt, usedAt: null };
      rows.set(record.id, record);
      return record;
    },
    async findByTokenHash(tokenHash) {
      for (const record of rows.values()) {
        if (record.tokenHash === tokenHash) return record;
      }
      return null;
    },
    async tryMarkUsed(id, usedAt) {
      const record = rows.get(id);
      if (!record || record.usedAt !== null) return false;
      record.usedAt = usedAt;
      return true;
    },
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
  };
}

interface FakeAccountSeed {
  id: string;
  email: string;
  userType: UserType;
  accountState: AccountState;
  mfaRequired: boolean;
  partnerOrganizationId: string | null;
}

function createFakeAccountsRepo(seed: FakeAccountSeed) {
  const row: AccountRow = {
    id: seed.id,
    userType: seed.userType,
    accountState: seed.accountState,
    email: seed.email,
    phone: null,
    mfaRequired: seed.mfaRequired,
    partnerOrganizationId: seed.partnerOrganizationId,
    invitedBy: null,
    createdAt: new Date(),
  };
  return {
    async createCustomerAccount(): Promise<AccountRow> {
      throw new Error('not used in this test');
    },
    async createPrivilegedAccountFromInvitation(): Promise<AccountRow> {
      throw new Error('not used in this test');
    },
    async findById(id: string): Promise<AccountRow | null> {
      return id === row.id ? row : null;
    },
    async findByEmail(email: string): Promise<AccountRow | null> {
      return email.trim().toLowerCase() === row.email ? row : null;
    },
    async markEmailVerified(): Promise<void> {
      // no-op
    },
    async getAccountStatus(id: string): Promise<AccountStatus | null> {
      if (id !== row.id) return null;
      const status: AccountStatus = {
        id: row.id,
        accountState: row.accountState,
        mfaRequired: row.mfaRequired,
        userType: row.userType,
        partnerOrganizationId: row.partnerOrganizationId,
        updatedAt: new Date(),
      };
      return status;
    },
  };
}

const TEST_PASSWORD = 'a-fine-privileged-password-14chars';
const TEST_EMAIL = 'operator@example.com';
const TEST_USER_ACCESS_TOKEN = 'gotrue-user-access-token-stand-in';

function createFakeSupabaseAdmin(opts: { hasVerifiedFactor: boolean }): SupabaseAdmin {
  let enrolledFactorId: string | null = null;
  const notUsed = (name: string) => (): never => {
    throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
  };
  return {
    raw: {} as SupabaseAdmin['raw'],
    createUser: notUsed('createUser'),
    deleteUser: notUsed('deleteUser'),
    async verifyPassword(email, password) {
      if (email.trim().toLowerCase() !== TEST_EMAIL || password !== TEST_PASSWORD) {
        return null;
      }
      return { userId: 'unused', userAccessToken: TEST_USER_ACCESS_TOKEN };
    },
    async enrollTotpFactor(userAccessToken) {
      if (userAccessToken !== TEST_USER_ACCESS_TOKEN) {
        throw new Error('[test fake] enrollTotpFactor called with unexpected token');
      }
      enrolledFactorId = randomUUID();
      return { factorId: enrolledFactorId, qrCodeSvg: '<svg />', manualEntryKey: 'MANUALKEY' };
    },
    async challengeTotpFactor(_userAccessToken, factorId) {
      return { challengeId: `challenge-${factorId}` };
    },
    async verifyTotpFactor(_userAccessToken, _factorId, _challengeId, code) {
      return code === '123456';
    },
    async findVerifiedTotpFactor() {
      return opts.hasVerifiedFactor && enrolledFactorId ? { factorId: enrolledFactorId } : null;
    },
    updateUserPassword: notUsed('updateUserPassword'),
    generateEmailVerificationLink: notUsed('generateEmailVerificationLink'),
    sendSignupConfirmationEmail: notUsed('sendSignupConfirmationEmail'),
    sendPasswordRecoveryEmail: notUsed('sendPasswordRecoveryEmail'),
    sendInvitationEmail: notUsed('sendInvitationEmail'),
    getUserByEmail: async () => null,
    getUserFromAccessToken: notUsed('getUserFromAccessToken'),
    isUserEmailConfirmed: async () => false,
    verifySignupToken: notUsed('verifySignupToken'),
    generatePasswordResetLink: notUsed('generatePasswordResetLink'),
    verifyRecoveryToken: notUsed('verifyRecoveryToken'),
    mintTransientUserAccessToken: notUsed('mintTransientUserAccessToken'),
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

function createFakeIdempotencyRepo() {
  const store = new Map<
    string,
    { accountId: string | null; requestHash: string; responseStatus: number; responseBody: unknown }
  >();
  return {
    // Mirrors repositories/idempotency.ts's real `account_id is not distinct
    // from $3` scoping — a stored row belonging to a different account (or
    // caller) must never be replayed (cross-account IDOR guard).
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

async function startTestServer(ctx: AppContext): Promise<{ baseUrl: string; server: Server; app: Express }> {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAuthRouter(ctx));
  app.use(createMfaRouter(ctx));
  app.use(errorHandler);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, server, app };
}

/**
 * Shared minimal-context builder for the SR-006-1 / SR-006-2 regression
 * suites below. Every `AppContext` field not exercised by the route under
 * test is filled with a `not used` stub (mirroring the pattern already used
 * by `createFakeSupabaseAdmin` above) so an unexpected call fails loudly
 * instead of silently returning `undefined`.
 */
function buildMinimalCtx(overrides: Partial<AppContext> & Pick<AppContext, 'accounts' | 'supabase'>): AppContext {
  const base: AppContext = {
    env: fakeEnv(),
    pool: undefined as unknown as AppContext['pool'],
    kv: new InMemoryKeyValueStore(),
    supabase: overrides.supabase,
    accounts: overrides.accounts,
    invitations: undefined as unknown as AppContext['invitations'],
    sessions: createFakeSessionRepo(),
    enrollmentTickets: createFakeEnrollmentTicketRepo(),
    resetMfaTokens: undefined as unknown as AppContext['resetMfaTokens'],
    auditLog: createFakeAuditLog() as unknown as AppContext['auditLog'],
    idempotency: createFakeIdempotencyRepo() as unknown as AppContext['idempotency'],
    // scheduleCustomerLifecycleNotifications (fired-and-forgotten on every
    // successful session mint for a customer account) touches these three —
    // no-op fakes so it resolves cleanly instead of rejecting into the
    // console on every test.
    policies: {
      countByAccount: async () => 0,
      listActiveForAccount: async () => [],
    } as unknown as AppContext['policies'],
    assets: undefined as unknown as AppContext['assets'],
    policyStatusHistory: undefined as unknown as AppContext['policyStatusHistory'],
    adminAccessLog: undefined as unknown as AppContext['adminAccessLog'],
    recoveryCases: undefined as unknown as AppContext['recoveryCases'],
    planCatalog: undefined as unknown as AppContext['planCatalog'],
    pushTokens: undefined as unknown as AppContext['pushTokens'],
    notificationPreferences: undefined as unknown as AppContext['notificationPreferences'],
    pushNotifications: undefined as unknown as AppContext['pushNotifications'],
    customerNotifications: undefined as unknown as AppContext['customerNotifications'],
    authNotifications: {
      async notifyPasswordChanged() {
        return undefined;
      },
      async notifyNewDeviceLogin() {
        return undefined;
      },
      async notifyMfaEnabled() {
        return undefined;
      },
      async notifyAccountLocked() {
        return undefined;
      },
      async notifyEmailAlreadyVerified() {
        return false;
      },
    } as unknown as AppContext['authNotifications'],
    notificationDeliveryState: undefined as unknown as AppContext['notificationDeliveryState'],
    onboardingNotifications: {
      notifyWelcomeIfNeeded: async () => undefined,
      maybeNotifyOnboardingIncomplete: async () => undefined,
    } as unknown as AppContext['onboardingNotifications'],
    policyNotifications: {
      maybeNotifyRenewalReminders: async () => undefined,
    } as unknown as AppContext['policyNotifications'],
    policyActivation: undefined as unknown as AppContext['policyActivation'],
    recoveryNotifications: undefined as unknown as AppContext['recoveryNotifications'],
  };
  return { ...base, ...overrides };
}

/**
 * SR-006-1 regression: `POST /auth/supabase/exchange` must not mint a full
 * backend session from a Supabase password/link-derived (AAL1) token when
 * the account has a verified TOTP factor enrolled — it must return the same
 * `mfaRequired`/`mfaChallengeToken` challenge shape `POST /auth/login`
 * returns, and only `POST /auth/mfa/challenge` may issue tokens after that.
 * Fails against the pre-fix code, which minted `{accessToken, refreshToken}`
 * unconditionally (`mfaVerifiedAt: null`) regardless of enrolled factors.
 */
describe('POST /auth/supabase/exchange — SR-006-1 MFA-bypass regression', () => {
  const EXCHANGE_ACCOUNT_ID = randomUUID();
  const EXCHANGE_EMAIL = 'customer-mfa@example.com';
  const EXCHANGE_SUPABASE_TOKEN = 'supabase-aal1-access-token-stand-in';

  function fakeExchangeSupabase(opts: { hasVerifiedFactor: boolean }): SupabaseAdmin {
    let enrolledFactorId: string | null = opts.hasVerifiedFactor ? randomUUID() : null;
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
        return code === '123456';
      },
      async findVerifiedTotpFactor(userAccessToken) {
        if (userAccessToken !== EXCHANGE_SUPABASE_TOKEN) {
          throw new Error('[test fake] findVerifiedTotpFactor called with unexpected token');
        }
        return enrolledFactorId ? { factorId: enrolledFactorId } : null;
      },
      updateUserPassword: notUsed('updateUserPassword'),
      generateEmailVerificationLink: notUsed('generateEmailVerificationLink'),
      sendSignupConfirmationEmail: notUsed('sendSignupConfirmationEmail'),
      sendPasswordRecoveryEmail: notUsed('sendPasswordRecoveryEmail'),
      sendInvitationEmail: notUsed('sendInvitationEmail'),
      getUserByEmail: notUsed('getUserByEmail'),
      async getUserFromAccessToken(accessToken) {
        if (accessToken !== EXCHANGE_SUPABASE_TOKEN) return null;
        return { userId: EXCHANGE_ACCOUNT_ID, email: EXCHANGE_EMAIL, emailConfirmed: true };
      },
      isUserEmailConfirmed: notUsed('isUserEmailConfirmed'),
      verifySignupToken: notUsed('verifySignupToken'),
      generatePasswordResetLink: notUsed('generatePasswordResetLink'),
      verifyRecoveryToken: notUsed('verifyRecoveryToken'),
      mintTransientUserAccessToken: notUsed('mintTransientUserAccessToken'),
    };
  }

  async function startExchangeServer(hasVerifiedFactor: boolean) {
    const accounts = createFakeAccountsRepo({
      id: EXCHANGE_ACCOUNT_ID,
      email: EXCHANGE_EMAIL,
      userType: 'customer',
      accountState: 'active',
      mfaRequired: false,
      partnerOrganizationId: null,
    });
    const ctx = buildMinimalCtx({
      accounts: accounts as unknown as AppContext['accounts'],
      supabase: fakeExchangeSupabase({ hasVerifiedFactor }),
    });
    return { ...(await startTestServer(ctx)), ctx };
  }

  it('mints tokens directly when no verified TOTP factor is enrolled (baseline — unchanged behaviour)', async () => {
    const { server, baseUrl } = await startExchangeServer(false);
    try {
      const response = await fetch(`${baseUrl}/auth/supabase/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken: EXCHANGE_SUPABASE_TOKEN }),
      });
      const body = (await response.json()) as { accessToken?: string; refreshToken?: string; mfaRequired?: boolean };
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();
      expect(body.mfaRequired).toBeUndefined();
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('SR-006-1: returns an MFA challenge — never a session — when a verified TOTP factor exists', async () => {
    const { server, baseUrl } = await startExchangeServer(true);
    try {
      const response = await fetch(`${baseUrl}/auth/supabase/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken: EXCHANGE_SUPABASE_TOKEN }),
      });
      const body = (await response.json()) as {
        mfaRequired?: boolean;
        mfaChallengeToken?: string;
        expiresIn?: number;
        accessToken?: string;
        refreshToken?: string;
      };
      expect(response.status, JSON.stringify(body)).toBe(200);

      // The bug this regresses against: the pre-fix handler minted a full
      // session unconditionally. Assert both the positive (challenge shape
      // present) and negative (no session tokens anywhere in the response).
      expect(body.mfaRequired).toBe(true);
      expect(typeof body.mfaChallengeToken).toBe('string');
      expect(body.mfaChallengeToken!.length).toBeGreaterThan(0);
      expect(body.accessToken).toBeUndefined();
      expect(body.refreshToken).toBeUndefined();

      // The challenge must actually be completable via the same
      // POST /auth/mfa/challenge path /auth/login uses, proving this isn't
      // a dead-end token — the outer server (auth + mfa routers already
      // mounted by startTestServer) is reused directly.
      const verifyResponse = await fetch(`${baseUrl}/auth/mfa/challenge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mfaChallengeToken: body.mfaChallengeToken, code: '123456' }),
      });
      const verifyBody = (await verifyResponse.json()) as { accessToken?: string; refreshToken?: string };
      expect(verifyResponse.status, JSON.stringify(verifyBody)).toBe(200);
      expect(verifyBody.accessToken).toBeTruthy();
      expect(verifyBody.refreshToken).toBeTruthy();
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });
});

/**
 * SR-006-2 regression: `POST /auth/notify-email-verified` must return an
 * identical response regardless of whether the submitted email belongs to
 * no account, an unverified account, or an already-verified account — and
 * must carry an IP-scoped rate limiter in addition to the pre-existing
 * per-email cooldown. Fails against the pre-fix code, which returned three
 * distinguishable `{status: ...}` shapes.
 */
describe('POST /auth/notify-email-verified — SR-006-2 account-existence-oracle regression', () => {
  const VERIFIED_ACCOUNT_ID = randomUUID();
  const VERIFIED_EMAIL = 'already-verified@example.com';
  const PENDING_ACCOUNT_ID = randomUUID();
  const PENDING_EMAIL = 'still-pending@example.com';
  const UNKNOWN_EMAIL = 'no-such-account@example.com';

  function fakeNotifySupabase(): SupabaseAdmin {
    const notUsed = (name: string) => (): never => {
      throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
    };
    return {
      raw: {} as SupabaseAdmin['raw'],
      createUser: notUsed('createUser'),
      deleteUser: notUsed('deleteUser'),
      verifyPassword: notUsed('verifyPassword'),
      enrollTotpFactor: notUsed('enrollTotpFactor'),
      challengeTotpFactor: notUsed('challengeTotpFactor'),
      verifyTotpFactor: notUsed('verifyTotpFactor'),
      findVerifiedTotpFactor: notUsed('findVerifiedTotpFactor'),
      updateUserPassword: notUsed('updateUserPassword'),
      generateEmailVerificationLink: notUsed('generateEmailVerificationLink'),
      sendSignupConfirmationEmail: notUsed('sendSignupConfirmationEmail'),
      sendPasswordRecoveryEmail: notUsed('sendPasswordRecoveryEmail'),
      sendInvitationEmail: notUsed('sendInvitationEmail'),
      async getUserByEmail(email) {
        const normalized = email.trim().toLowerCase();
        if (normalized === VERIFIED_EMAIL) return { userId: VERIFIED_ACCOUNT_ID };
        if (normalized === PENDING_EMAIL) return { userId: PENDING_ACCOUNT_ID };
        return null;
      },
      getUserFromAccessToken: notUsed('getUserFromAccessToken'),
      async isUserEmailConfirmed(userId) {
        return userId === VERIFIED_ACCOUNT_ID;
      },
      verifySignupToken: notUsed('verifySignupToken'),
      generatePasswordResetLink: notUsed('generatePasswordResetLink'),
      verifyRecoveryToken: notUsed('verifyRecoveryToken'),
      mintTransientUserAccessToken: notUsed('mintTransientUserAccessToken'),
    };
  }

  function multiAccountRepo() {
    const rows = new Map<string, AccountRow>([
      [
        VERIFIED_ACCOUNT_ID,
        {
          id: VERIFIED_ACCOUNT_ID,
          userType: 'customer',
          accountState: 'active',
          email: VERIFIED_EMAIL,
          phone: null,
          mfaRequired: false,
          partnerOrganizationId: null,
          invitedBy: null,
          createdAt: new Date(),
        },
      ],
      [
        PENDING_ACCOUNT_ID,
        {
          id: PENDING_ACCOUNT_ID,
          userType: 'customer',
          accountState: 'pending_verification',
          email: PENDING_EMAIL,
          phone: null,
          mfaRequired: false,
          partnerOrganizationId: null,
          invitedBy: null,
          createdAt: new Date(),
        },
      ],
    ]);
    return {
      async createCustomerAccount(): Promise<AccountRow> {
        throw new Error('not used in this test');
      },
      async createPrivilegedAccountFromInvitation(): Promise<AccountRow> {
        throw new Error('not used in this test');
      },
      async findById(id: string): Promise<AccountRow | null> {
        return rows.get(id) ?? null;
      },
      async findByEmail(): Promise<AccountRow | null> {
        throw new Error('not used in this test');
      },
      async markEmailVerified(id: string): Promise<void> {
        const row = rows.get(id);
        if (row) row.accountState = 'active';
      },
      async getAccountStatus(): Promise<AccountStatus | null> {
        throw new Error('not used in this test');
      },
    };
  }

  async function startNotifyServer() {
    const ctx = buildMinimalCtx({
      accounts: multiAccountRepo() as unknown as AppContext['accounts'],
      supabase: fakeNotifySupabase(),
    });
    return { ...(await startTestServer(ctx)), ctx };
  }

  it('SR-006-2: returns byte-identical responses for unknown, pending, and already-verified emails', async () => {
    const { server, baseUrl } = await startNotifyServer();
    try {
      const responses = await Promise.all(
        [UNKNOWN_EMAIL, PENDING_EMAIL, VERIFIED_EMAIL].map((email) =>
          fetch(`${baseUrl}/auth/notify-email-verified`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email }),
          }),
        ),
      );
      const bodies = await Promise.all(responses.map((r) => r.json()));

      for (const response of responses) {
        expect(response.status).toBe(202);
      }
      // Every branch (no account / not-yet-verified / already-verified)
      // must produce the exact same response body — the core SR-006-2
      // assertion. The pre-fix code returned three distinguishable shapes
      // ({status: 'unknown'}, {status: 'pending_verification'},
      // {status: 'already_verified', confirmationEmailSent}).
      expect(bodies[0]).toEqual(bodies[1]);
      expect(bodies[1]).toEqual(bodies[2]);
      expect(bodies[0]).not.toHaveProperty('status');
      expect(bodies[0]).not.toHaveProperty('confirmationEmailSent');
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('SR-006-2: still performs its side effect (activating a genuinely already-verified pending account) behind the uniform response', async () => {
    const { server, baseUrl, ctx } = await startNotifyServer();
    try {
      const response = await fetch(`${baseUrl}/auth/notify-email-verified`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: VERIFIED_EMAIL }),
      });
      expect(response.status).toBe(202);
      const account = await ctx.accounts.findById(VERIFIED_ACCOUNT_ID);
      expect(account?.accountState).toBe('active');
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('SR-006-2: an IP-scoped limiter bounds requests across many different (non-existent) email addresses', async () => {
    const { server, baseUrl } = await startNotifyServer();
    try {
      const attempts = 25; // NOTIFY_EMAIL_VERIFIED_IP_LIMIT.attempts is 20 — this must exceed it
      const statuses: number[] = [];
      for (let i = 0; i < attempts; i++) {
        // A distinct email per request so the (separate, lower-ceiling)
        // per-email cooldown never fires first and confounds this assertion
        // — this test is specifically about the IP-scoped limiter.
        const response = await fetch(`${baseUrl}/auth/notify-email-verified`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: `probe-${i}@example.com` }),
        });
        statuses.push(response.status);
      }
      expect(statuses.some((s) => s === 429)).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });
});

describe('POST /auth/login SR-14 forced-re-enrollment (api-design.md §11 Amendment B)', () => {
  const accountId = randomUUID();
  let ctx: AppContext;
  let server: Server;
  let baseUrl: string;
  let auditLog: ReturnType<typeof createFakeAuditLog>;

  beforeEach(async () => {
    vi.useRealTimers();
    auditLog = createFakeAuditLog();
    const kv = new InMemoryKeyValueStore();
    const accounts = createFakeAccountsRepo({
      id: accountId,
      email: TEST_EMAIL,
      userType: 'security_company_operator',
      accountState: 'active',
      mfaRequired: true, // mfa_required account, per SR-14
      partnerOrganizationId: randomUUID(),
    });

    ctx = {
      env: fakeEnv(),
      pool: undefined as unknown as AppContext['pool'],
      kv,
      supabase: createFakeSupabaseAdmin({ hasVerifiedFactor: false }), // no verified factor yet
      accounts: accounts as unknown as AppContext['accounts'],
      invitations: undefined as unknown as AppContext['invitations'],
      sessions: createFakeSessionRepo(),
      enrollmentTickets: createFakeEnrollmentTicketRepo(),
      resetMfaTokens: undefined as unknown as AppContext['resetMfaTokens'],
      auditLog: auditLog as unknown as AppContext['auditLog'],
      idempotency: createFakeIdempotencyRepo() as unknown as AppContext['idempotency'],
      policies: undefined as unknown as AppContext['policies'],
      assets: undefined as unknown as AppContext['assets'],
      policyStatusHistory: undefined as unknown as AppContext['policyStatusHistory'],
      adminAccessLog: undefined as unknown as AppContext['adminAccessLog'],
      recoveryCases: undefined as unknown as AppContext['recoveryCases'],
      authNotifications: {
        async notifyPasswordChanged() {
          return undefined;
        },
        async notifyNewDeviceLogin() {
          return undefined;
        },
        async notifyMfaEnabled() {
          return undefined;
        },
        async notifyAccountLocked() {
          return undefined;
        },
      },
    };

    const started = await startTestServer(ctx);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  });

  it('login returns mfaEnrollmentRequired + a ticket that is actually persisted and consumable at /mfa/enroll and /mfa/enroll/verify', async () => {
    // 1. Login with correct credentials, no verified TOTP factor yet.
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    expect(loginResponse.status).toBe(200);
    const loginBody = (await loginResponse.json()) as {
      mfaEnrollmentRequired: boolean;
      enrollmentTicket: string;
      expiresIn: number;
    };
    expect(loginBody.mfaEnrollmentRequired).toBe(true);
    expect(typeof loginBody.enrollmentTicket).toBe('string');
    expect(loginBody.enrollmentTicket.length).toBeGreaterThan(0);
    expect(loginBody.expiresIn).toBeGreaterThan(0);

    // The audit trail should record the ticket issuance (mirrors
    // invitations.ts's /accept handler).
    expect(auditLog.events.some((e) => e.eventType === 'mfa_enrollment_ticket_issued' && e.accountId === accountId)).toBe(
      true,
    );

    // 2. Present the ticket at /mfa/enroll (pre-session path). This is the
    // exact step that failed with ENROLLMENT_TICKET_INVALID before the fix,
    // because storePendingEnrollment was never called at login time.
    const enrollResponse = await fetch(`${baseUrl}/mfa/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enrollmentTicket: loginBody.enrollmentTicket }),
    });
    const enrollBody = (await enrollResponse.json()) as { enrollmentId?: string; error?: { code: string } };
    expect(enrollResponse.status, JSON.stringify(enrollBody)).toBe(200);
    expect(enrollBody.enrollmentId).toBeTruthy();

    // 3. Complete enrollment with the (fake) TOTP code — this consumes the
    // ticket and mints a session, per SR-14(a)'s "force enrollment rather
    // than issue a session [until this point]" requirement.
    const verifyResponse = await fetch(`${baseUrl}/mfa/enroll/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ enrollmentId: enrollBody.enrollmentId, code: '123456' }),
    });
    const verifyBody = (await verifyResponse.json()) as {
      accessToken?: string;
      refreshToken?: string;
      error?: { code: string };
    };
    expect(verifyResponse.status, JSON.stringify(verifyBody)).toBe(200);
    expect(verifyBody.accessToken).toBeTruthy();
    expect(verifyBody.refreshToken).toBeTruthy();

    // 4. The ticket must now be single-use: presenting it again at
    // /mfa/enroll must be rejected.
    const secondEnrollAttempt = await fetch(`${baseUrl}/mfa/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enrollmentTicket: loginBody.enrollmentTicket }),
    });
    const secondEnrollBody = (await secondEnrollAttempt.json()) as { error?: { code: string } };
    expect(secondEnrollAttempt.status).toBe(401);
    expect(secondEnrollBody.error?.code).toBe('ENROLLMENT_TICKET_INVALID');
  });
});

/**
 * SR-007-1 (security-review.md §8.2): a completed password reset must also
 * disable every device's push token for the account, not just revoke
 * sessions — otherwise a stolen-device attacker with a still-live session
 * keeps receiving the account's notifications (incl. theft_critical) straight
 * through the legitimate owner's reset. `routes/auth.ts:869` wires
 * `ctx.pushTokens.disableAllForAccount` into the non-privileged branch of
 * `POST /auth/reset-password/confirm`; this test pins that call and fails if
 * it is ever removed. Uses `buildMinimalCtx` with a real fake `pushTokens`
 * override (not the default `undefined as unknown as ...`, which exists
 * specifically to fail loudly if an untested path reaches it).
 */
describe('POST /auth/reset-password/confirm — SR-007-1 push-token regression', () => {
  const resetAccountId = randomUUID();
  const resetEmail = 'reset-target@example.com';
  const resetToken = 'valid-reset-token';
  const resetNewPassword = 'a-new-customer-password';
  const resetUserAccessToken = 'recovery-user-access-token-stand-in';

  function fakeResetSupabase(): SupabaseAdmin {
    const notUsed = (name: string) => (): never => {
      throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
    };
    return {
      raw: {} as SupabaseAdmin['raw'],
      createUser: notUsed('createUser'),
      deleteUser: notUsed('deleteUser'),
      verifyPassword: notUsed('verifyPassword'),
      enrollTotpFactor: notUsed('enrollTotpFactor'),
      challengeTotpFactor: notUsed('challengeTotpFactor'),
      verifyTotpFactor: notUsed('verifyTotpFactor'),
      findVerifiedTotpFactor: notUsed('findVerifiedTotpFactor'),
      async updateUserPassword(userAccessToken, password) {
        expect(userAccessToken).toBe(resetUserAccessToken);
        expect(password).toBe(resetNewPassword);
      },
      generateEmailVerificationLink: notUsed('generateEmailVerificationLink'),
      sendSignupConfirmationEmail: notUsed('sendSignupConfirmationEmail'),
      sendPasswordRecoveryEmail: notUsed('sendPasswordRecoveryEmail'),
      sendInvitationEmail: notUsed('sendInvitationEmail'),
      getUserByEmail: notUsed('getUserByEmail'),
      getUserFromAccessToken: notUsed('getUserFromAccessToken'),
      isUserEmailConfirmed: notUsed('isUserEmailConfirmed'),
      verifySignupToken: notUsed('verifySignupToken'),
      generatePasswordResetLink: notUsed('generatePasswordResetLink'),
      async verifyRecoveryToken(email, tokenHash) {
        if (email !== resetEmail || tokenHash !== resetToken) return null;
        return { userId: resetAccountId, userAccessToken: resetUserAccessToken };
      },
      mintTransientUserAccessToken: notUsed('mintTransientUserAccessToken'),
    };
  }

  function createFakePushTokensRepo() {
    const disableAllForAccountCalls: string[] = [];
    const repo = {
      async register(): Promise<never> {
        throw new Error('not used in this test');
      },
      async disableForDevice(): Promise<never> {
        throw new Error('not used in this test');
      },
      async disableAllForAccount(accId: string) {
        disableAllForAccountCalls.push(accId);
        return 1;
      },
      async listEnabledForAccount(): Promise<never> {
        throw new Error('not used in this test');
      },
    };
    return { disableAllForAccountCalls, repo };
  }

  it('disables every push token for the account when a password reset completes (non-privileged branch)', async () => {
    const accounts = createFakeAccountsRepo({
      id: resetAccountId,
      email: resetEmail,
      userType: 'customer',
      accountState: 'active',
      mfaRequired: false,
      partnerOrganizationId: null,
    });
    const pushTokensFake = createFakePushTokensRepo();

    const ctx = buildMinimalCtx({
      accounts: accounts as unknown as AppContext['accounts'],
      supabase: fakeResetSupabase(),
      pushTokens: pushTokensFake.repo as unknown as AppContext['pushTokens'],
    });

    const { server, baseUrl } = await startTestServer(ctx);
    try {
      const response = await fetch(`${baseUrl}/auth/reset-password/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ email: resetEmail, resetToken, newPassword: resetNewPassword }),
      });
      const body = (await response.json()) as { message?: string; allSessionsRevoked?: boolean };
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.allSessionsRevoked).toBe(true);

      // The load-bearing assertion: disableAllForAccount was actually
      // invoked, with the reset account's id, exactly once.
      expect(pushTokensFake.disableAllForAccountCalls).toEqual([resetAccountId]);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });
});
