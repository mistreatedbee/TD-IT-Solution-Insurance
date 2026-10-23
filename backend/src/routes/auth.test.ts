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

import { createAuthRouter, RECOVERY_IDENTITY_MISMATCH_LOG_TAG, RECOVERY_IDENTITY_UNBOUND_LOG_TAG } from './auth.js';
import { createMfaRouter } from './mfa.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import type { AppContext } from '../context.js';
import type { AccountRow, AccountStatus, UserType, AccountState } from '../repositories/accounts.js';
import type { EnrollmentTicketRecord, EnrollmentTicketRepo } from '../lib/enrollment-ticket.js';
import type { SessionRecord, SessionRepo } from '../lib/refresh-session.js';
import { ACCOUNT_WIDE_REVOCATION_REASONS, WATERMARK_AUDIT_EVENT_TYPES } from '../lib/gotrue-session-revocation.js';
import {
  SupabaseUnavailableError,
  SupabaseUserAlreadyExistsError,
  SupabaseEmailNotConfirmedError,
  type SupabaseAdmin,
} from '../db/supabase.js';
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

function createFakeSessionRepo(
  opts: { stateTransitionWatermark?: () => Date | null; auditWatermark?: () => Date | null } = {},
): SessionRepo {
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
    // Mirrors repositories/sessions.ts: latest account-wide revocation on
    // this account's rows, or an (injected) admin state-transition time.
    async findRevocationWatermark(accountId) {
      const candidates: number[] = [];
      for (const row of rows.values()) {
        if (
          row.accountId === accountId &&
          row.revokedAt !== null &&
          row.revokedReason !== null &&
          ACCOUNT_WIDE_REVOCATION_REASONS.includes(row.revokedReason)
        ) {
          candidates.push(row.revokedAt.getTime());
        }
      }
      const transition = opts.stateTransitionWatermark?.() ?? null;
      if (transition) candidates.push(transition.getTime());
      // INC-003 §13 D-1: watermark audit events (password_reset_completed,
      // session_family_revoked), independent of any live session row.
      const audit = opts.auditWatermark?.() ?? null;
      if (audit) candidates.push(audit.getTime());
      return candidates.length > 0 ? new Date(Math.max(...candidates)) : null;
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
    const enrolledFactorId: string | null = opts.hasVerifiedFactor ? randomUUID() : null;
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
      signOutAllUserSessions: notUsed('signOutAllUserSessions'),
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
 * INC-003 A-10 / A-23 regression (A-5 threat model §4.2 N-1/N-2/N-3): a
 * browser-resident GoTrue session authenticated BEFORE an account-wide
 * revocation (logout-all, admin suspend/reactivate, SR-8 reuse, FR-20
 * mismatch) must not be re-minted into a backend session by
 * `/auth/supabase/exchange`. Fails against the pre-fix handler, which only
 * asked GoTrue "is this token valid right now?".
 */
describe('POST /auth/supabase/exchange — INC-003 A-10/A-23 revocation watermark', () => {
  const ACCOUNT_ID = randomUUID();
  const EMAIL = 'watermark-customer@example.com';

  function gotrueJwt(payload: Record<string, unknown>): string {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.signature-not-checked-by-this-fake`;
  }

  const RESET_PASSWORD = 'a-brand-new-customer-password';

  function fakeSupabase(
    validTokens: Set<string>,
    calls: string[],
    opts: { hasFactor?: boolean; signOutFails?: boolean } = {},
  ): SupabaseAdmin {
    const notUsed = (name: string) => (): never => {
      throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
    };
    return {
      raw: {} as SupabaseAdmin['raw'],
      createUser: notUsed('createUser'),
      deleteUser: notUsed('deleteUser'),
      verifyPassword: notUsed('verifyPassword'),
      enrollTotpFactor: notUsed('enrollTotpFactor'),
      async challengeTotpFactor() {
        return { challengeId: 'gotrue-challenge-1' };
      },
      async verifyTotpFactor(_t, _f, _c, code) {
        calls.push('verifyTotpFactor');
        return code === '123456';
      },
      async findVerifiedTotpFactor() {
        calls.push('findVerifiedTotpFactor');
        return opts.hasFactor ? { factorId: 'factor-1' } : null;
      },
      async updateUserPassword(_token, password) {
        expect(password).toBe(RESET_PASSWORD);
        calls.push('updateUserPassword');
      },
      generateEmailVerificationLink: notUsed('generateEmailVerificationLink'),
      sendSignupConfirmationEmail: notUsed('sendSignupConfirmationEmail'),
      sendPasswordRecoveryEmail: notUsed('sendPasswordRecoveryEmail'),
      sendInvitationEmail: notUsed('sendInvitationEmail'),
      getUserByEmail: notUsed('getUserByEmail'),
      async getUserFromAccessToken(accessToken) {
        if (!validTokens.has(accessToken)) return null;
        return { userId: ACCOUNT_ID, email: EMAIL, emailConfirmed: true };
      },
      isUserEmailConfirmed: notUsed('isUserEmailConfirmed'),
      verifySignupToken: notUsed('verifySignupToken'),
      generatePasswordResetLink: notUsed('generatePasswordResetLink'),
      verifyRecoveryToken: notUsed('verifyRecoveryToken'),
      mintTransientUserAccessToken: notUsed('mintTransientUserAccessToken'),
      async signOutAllUserSessions(email) {
        calls.push(`signOutAllUserSessions:${email}`);
        if (opts.signOutFails) throw new Error('gotrue down');
      },
    };
  }

  /** Audit fake that remembers WHEN each watermark-type event was written. */
  function createTimedAuditLog() {
    const events: Array<{ accountId: string | null; eventType: string; at: Date }> = [];
    return {
      events,
      async record(event: { accountId: string | null; eventType: string }) {
        events.push({ ...event, at: new Date() });
      },
      latestWatermarkEvent(): Date | null {
        const times = events
          .filter((e) => (WATERMARK_AUDIT_EVENT_TYPES as readonly string[]).includes(e.eventType))
          .map((e) => e.at.getTime());
        return times.length > 0 ? new Date(Math.max(...times)) : null;
      },
    };
  }

  async function start(
    tokens: string[],
    opts: { stateTransitionAt?: Date; hasFactor?: boolean; auditFailsOn?: string } = {},
  ) {
    const calls: string[] = [];
    const accounts = createFakeAccountsRepo({
      id: ACCOUNT_ID,
      email: EMAIL,
      userType: 'customer',
      accountState: 'active',
      mfaRequired: false,
      partnerOrganizationId: null,
    });
    const auditLog = createTimedAuditLog();
    if (opts.auditFailsOn) {
      const original = auditLog.record.bind(auditLog);
      auditLog.record = async (event) => {
        if (event.eventType === opts.auditFailsOn) {
          calls.push(`auditFailed:${event.eventType}`);
          throw new Error('audit insert failed');
        }
        return original(event);
      };
    }
    const sessions = createFakeSessionRepo({
      stateTransitionWatermark: () => opts.stateTransitionAt ?? null,
      auditWatermark: () => auditLog.latestWatermarkEvent(),
    });
    const ctx = buildMinimalCtx({
      accounts: accounts as unknown as AppContext['accounts'],
      supabase: fakeSupabase(new Set(tokens), calls, { hasFactor: opts.hasFactor }),
      sessions,
      auditLog: auditLog as unknown as AppContext['auditLog'],
      pushTokens: { disableAllForAccount: async () => 0 } as unknown as AppContext['pushTokens'],
    });
    return { ...(await startTestServer(ctx)), sessions, auditLog, calls };
  }

  async function exchange(baseUrl: string, accessToken: string) {
    const response = await fetch(`${baseUrl}/auth/supabase/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    });
    return { response, body: (await response.json()) as Record<string, unknown> };
  }

  const nowSec = () => Math.floor(Date.now() / 1000);

  it('N-1: a GoTrue session authenticated before logout-all is refused; a fresh sign-in afterwards is accepted', async () => {
    const stale = gotrueJwt({ sub: ACCOUNT_ID, iat: nowSec(), amr: [{ method: 'password', timestamp: nowSec() - 3600 }] });
    const fresh = gotrueJwt({ sub: ACCOUNT_ID, iat: nowSec(), amr: [{ method: 'password', timestamp: nowSec() + 1 }] });
    const { server, baseUrl, sessions, auditLog, calls } = await start([stale, fresh]);
    try {
      // A backend session exists from an earlier exchange, then the owner
      // presses "log out everywhere" (e.g. from the mobile app).
      const first = await exchange(baseUrl, stale);
      expect(first.response.status, JSON.stringify(first.body)).toBe(200);
      await sessions.revokeAllForAccount(ACCOUNT_ID, 'logout_all');
      calls.length = 0;

      // The attacker refreshes the stolen GoTrue session — `iat` is new, but
      // `amr` still records the original authentication time.
      const replay = await exchange(baseUrl, stale);
      expect(replay.response.status, JSON.stringify(replay.body)).toBe(401);
      expect((replay.body.error as { code?: string }).code).toBe('REFRESH_TOKEN_INVALID');
      expect(replay.body.accessToken).toBeUndefined();
      // Refused before any factor lookup / minting path is reachable.
      expect(calls).not.toContain('findVerifiedTotpFactor');
      expect(auditLog.events.some((e) => e.eventType === 'login_failure' && e.accountId === ACCOUNT_ID)).toBe(true);

      const relogin = await exchange(baseUrl, fresh);
      expect(relogin.response.status, JSON.stringify(relogin.body)).toBe(200);
      expect(relogin.body.accessToken).toBeTruthy();
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it.each(['admin_forced', 'rotation_reuse_detected', 'device_mismatch', 'password_reset'] as const)(
    'N-2/N-3: a pre-existing GoTrue session is refused after a %s revocation',
    async (reason) => {
      const stale = gotrueJwt({ sub: ACCOUNT_ID, amr: [{ method: 'password', timestamp: nowSec() - 60 }] });
      const { server, baseUrl, sessions } = await start([stale]);
      try {
        expect((await exchange(baseUrl, stale)).response.status).toBe(200);
        await sessions.revokeAllForAccount(ACCOUNT_ID, reason);
        expect((await exchange(baseUrl, stale)).response.status).toBe(401);
      } finally {
        await new Promise((resolve) => server.close(() => resolve(undefined)));
      }
    },
  );

  it('single-session logout does NOT advance the watermark (other live sessions keep working)', async () => {
    const token = gotrueJwt({ sub: ACCOUNT_ID, amr: [{ method: 'password', timestamp: nowSec() - 60 }] });
    const { server, baseUrl, sessions } = await start([token]);
    try {
      const first = await exchange(baseUrl, token);
      expect(first.response.status).toBe(200);
      await sessions.revoke(first.body.sessionId as string, 'logout');
      expect((await exchange(baseUrl, token)).response.status).toBe(200);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('A-23: suspend -> reactivate refuses a GoTrue session minted DURING the suspension', async () => {
    // GoTrue session obtained while suspended (e.g. a C-1 password grant);
    // the reactivation's state-transition row is the watermark.
    const duringSuspension = gotrueJwt({ sub: ACCOUNT_ID, amr: [{ method: 'password', timestamp: nowSec() - 120 }] });
    const { server, baseUrl } = await start([duringSuspension], { stateTransitionAt: new Date(Date.now() - 30_000) });
    try {
      expect((await exchange(baseUrl, duringSuspension)).response.status).toBe(401);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  async function confirmReset(baseUrl: string, recoveryAccessToken: string) {
    const response = await fetch(`${baseUrl}/auth/reset-password/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ recoveryAccessToken, newPassword: RESET_PASSWORD }),
    });
    return { response, body: (await response.json()) as Record<string, unknown> };
  }

  it('§13 D-1/C-1: a password reset by a user with ZERO live sessions still evicts a stolen GoTrue session', async () => {
    // Victim is logged out everywhere (no app.sessions row at all), the
    // attacker holds an older browser GoTrue session, the victim resets.
    const stolen = gotrueJwt({ sub: ACCOUNT_ID, amr: [{ method: 'password', timestamp: nowSec() - 3600 }] });
    const recovery = gotrueJwt({ sub: ACCOUNT_ID, amr: [{ method: 'otp', timestamp: nowSec() }] });
    const { server, baseUrl, calls } = await start([stolen, recovery]);
    try {
      const reset = await confirmReset(baseUrl, recovery);
      expect(reset.response.status, JSON.stringify(reset.body)).toBe(200);
      expect(calls).toContain('updateUserPassword');
      // C-1: the reset also propagates to GoTrue.
      expect(calls).toContain(`signOutAllUserSessions:${EMAIL}`);

      const replay = await exchange(baseUrl, stolen);
      expect(replay.response.status, JSON.stringify(replay.body)).toBe(401);
      expect(replay.body.accessToken).toBeUndefined();
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('§13 D-1: a session-family revocation that found no live row still advances the watermark', async () => {
    const stolen = gotrueJwt({ sub: ACCOUNT_ID, amr: [{ method: 'password', timestamp: nowSec() - 60 }] });
    const { server, baseUrl, auditLog } = await start([stolen]);
    try {
      await auditLog.record({ accountId: ACCOUNT_ID, eventType: 'session_family_revoked' });
      expect((await exchange(baseUrl, stolen)).response.status).toBe(401);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('§13 C-3: /reset-password/confirm refuses a recoveryAccessToken from a GoTrue session that predates the watermark', async () => {
    const stale = gotrueJwt({ sub: ACCOUNT_ID, amr: [{ method: 'password', timestamp: nowSec() - 120 }] });
    const fresh = gotrueJwt({ sub: ACCOUNT_ID, amr: [{ method: 'otp', timestamp: nowSec() }] });
    const { server, baseUrl, calls } = await start([stale, fresh], { stateTransitionAt: new Date(Date.now() - 30_000) });
    try {
      const refused = await confirmReset(baseUrl, stale);
      expect(refused.response.status, JSON.stringify(refused.body)).toBe(404);
      expect((refused.body.error as { code?: string }).code).toBe('RESET_TOKEN_INVALID');
      expect(calls).not.toContain('updateUserPassword');

      const accepted = await confirmReset(baseUrl, fresh);
      expect(accepted.response.status, JSON.stringify(accepted.body)).toBe(200);
      expect(calls).toContain('updateUserPassword');
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('§15.2: GoTrue sign-out runs BEFORE the audit insert, and a failing insert still fails the request', async () => {
    const recovery = gotrueJwt({ sub: ACCOUNT_ID, amr: [{ method: 'otp', timestamp: nowSec() }] });
    const { server, baseUrl, calls } = await start([recovery], { auditFailsOn: 'password_reset_completed' });
    try {
      const reset = await confirmReset(baseUrl, recovery);
      expect(reset.response.status).toBe(500);
      const signOutAt = calls.indexOf(`signOutAllUserSessions:${EMAIL}`);
      const auditAt = calls.indexOf('auditFailed:password_reset_completed');
      expect(signOutAt).toBeGreaterThanOrEqual(0);
      expect(auditAt).toBeGreaterThan(signOutAt);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('§15.2: an exchange-issued MFA challenge cannot be completed after a revocation lands', async () => {
    const token = gotrueJwt({ sub: ACCOUNT_ID, amr: [{ method: 'password', timestamp: nowSec() - 60 }] });
    const { server, baseUrl, sessions, calls } = await start([token], { hasFactor: true });
    try {
      const first = await exchange(baseUrl, token);
      expect(first.response.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body.mfaRequired).toBe(true);

      // Owner revokes everything while the attacker sits on the challenge.
      await sessions.insertNew({
        id: randomUUID(),
        accountId: ACCOUNT_ID,
        refreshTokenHash: 'h',
        deviceId: null,
        deviceName: null,
        ipAddress: null,
        userAgent: null,
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
        mfaVerifiedAt: null,
      });
      await sessions.revokeAllForAccount(ACCOUNT_ID, 'logout_all');

      const response = await fetch(`${baseUrl}/auth/mfa/challenge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mfaChallengeToken: first.body.mfaChallengeToken, code: '123456' }),
      });
      const body = (await response.json()) as Record<string, unknown>;
      expect(response.status, JSON.stringify(body)).toBe(410);
      expect((body.error as { code?: string }).code).toBe('MFA_CHALLENGE_EXPIRED');
      expect(body.accessToken).toBeUndefined();
      expect(calls).not.toContain('verifyTotpFactor');
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('§13 C-3: fails closed on an unreadable recoveryAccessToken when a watermark exists', async () => {
    const { server, baseUrl, calls } = await start(['opaque-recovery-token'], {
      stateTransitionAt: new Date(Date.now() - 1000),
    });
    try {
      expect((await confirmReset(baseUrl, 'opaque-recovery-token')).response.status).toBe(404);
      expect(calls).not.toContain('updateUserPassword');
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('fails closed: with a watermark present, a token whose authentication time cannot be read is refused', async () => {
    const noAmr = gotrueJwt({ sub: ACCOUNT_ID, iat: nowSec() + 10 });
    const { server, baseUrl } = await start(['opaque-not-a-jwt', noAmr], { stateTransitionAt: new Date(Date.now() - 1000) });
    try {
      expect((await exchange(baseUrl, noAmr)).response.status).toBe(401);
      expect((await exchange(baseUrl, 'opaque-not-a-jwt')).response.status).toBe(401);
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
    const enrollBody = (await enrollResponse.json()) as {
      enrollmentId?: string;
      qrCodeSvg?: string;
      qrCodeImage?: string;
      manualEntryKey?: string;
      error?: { code: string };
    };
    expect(enrollResponse.status, JSON.stringify(enrollBody)).toBe(200);
    expect(enrollBody.enrollmentId).toBeTruthy();
    // P1 fix (docs/features/017.../01-architecture-scope-note.md R-2): GoTrue's
    // totp.qr_code is raw SVG markup, not base64 PNG. The wire field must be
    // named for what it is (qrCodeSvg) so clients don't wrap it as
    // `data:image/png;base64,...` again. qrCodeImage must NOT reappear.
    expect(enrollBody.qrCodeSvg).toBe('<svg />');
    expect(enrollBody.qrCodeImage).toBeUndefined();
    expect(enrollBody.manualEntryKey).toBe('MANUALKEY');

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

  it('INC-003 §15.2: an enrolment cannot be completed (or mint a session) after a revocation lands mid-enrolment', async () => {
    const loginBody = (await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      })
    ).json()) as { enrollmentTicket: string };
    const enrollBody = (await (
      await fetch(`${baseUrl}/mfa/enroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enrollmentTicket: loginBody.enrollmentTicket }),
      })
    ).json()) as { enrollmentId: string };

    // An account-wide revocation (e.g. logout-all from another device) lands
    // before the code is entered.
    await ctx.sessions.insertNew({
      id: randomUUID(),
      accountId,
      refreshTokenHash: 'other-device',
      deviceId: null,
      deviceName: null,
      ipAddress: null,
      userAgent: null,
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 60_000),
      mfaVerifiedAt: null,
    });
    await ctx.sessions.revokeAllForAccount(accountId, 'logout_all');

    const verifyResponse = await fetch(`${baseUrl}/mfa/enroll/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ enrollmentId: enrollBody.enrollmentId, code: '123456' }),
    });
    const verifyBody = (await verifyResponse.json()) as { accessToken?: string; error?: { code: string } };
    expect(verifyBody.error?.code, JSON.stringify(verifyBody)).toBe('MFA_ENROLLMENT_NOT_FOUND');
    expect(verifyBody.accessToken).toBeUndefined();
    expect(auditLog.events.some((e) => e.eventType === 'mfa_enrolled')).toBe(false);
  });
});

/**
 * ADR-0014 §14.5 AE-1 regression: `POST /auth/login` must distinguish "right
 * password, unconfirmed email" (GoTrue `email_not_confirmed`) from an
 * ordinary wrong password. The former must answer `ACCOUNT_NOT_ACTIVE` and
 * must NOT count toward FR-11's per-identifier lockout; the latter must
 * still answer `INVALID_CREDENTIALS` and MUST still count toward lockout —
 * otherwise a wrong-password guess against an unconfirmed email would be an
 * account-existence/enumeration oracle (the risk the ADR's own AE-1 section
 * flags as contingent on GoTrue's password-vs-confirmation check order).
 */
describe('POST /auth/login — ADR-0014 AE-1 (email_not_confirmed vs invalid credentials)', () => {
  const accountId = randomUUID();
  const AE1_EMAIL = 'unverified-customer@example.com';
  const AE1_PASSWORD = 'a-fine-customer-password-14chars';

  function createAe1Ctx(): AppContext {
    const accounts = createFakeAccountsRepo({
      id: accountId,
      email: AE1_EMAIL,
      userType: 'customer',
      accountState: 'pending_verification',
      mfaRequired: false,
      partnerOrganizationId: null,
    });
    const notUsed = (name: string) => (): never => {
      throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
    };
    const supabase: SupabaseAdmin = {
      raw: {} as SupabaseAdmin['raw'],
      createUser: notUsed('createUser'),
      deleteUser: notUsed('deleteUser'),
      async verifyPassword(email, password) {
        if (email.trim().toLowerCase() !== AE1_EMAIL) {
          return null;
        }
        if (password === AE1_PASSWORD) {
          // Right password, email not confirmed — exactly GoTrue's
          // `email_not_confirmed` response per AE-1.
          throw new SupabaseEmailNotConfirmedError();
        }
        // Wrong password against the same (unconfirmed) account — must
        // behave exactly like any other wrong password: an ordinary `null`,
        // never the confirmation-status error. This is the enumeration-
        // safety half of AE-1.
        return null;
      },
      enrollTotpFactor: notUsed('enrollTotpFactor'),
      challengeTotpFactor: notUsed('challengeTotpFactor'),
      verifyTotpFactor: notUsed('verifyTotpFactor'),
      findVerifiedTotpFactor: notUsed('findVerifiedTotpFactor'),
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
      signOutAllUserSessions: notUsed('signOutAllUserSessions'),
    } as unknown as SupabaseAdmin;

    return buildMinimalCtx({
      accounts: accounts as unknown as AppContext['accounts'],
      supabase,
    });
  }

  it('a correct password on an unverified account gets ACCOUNT_NOT_ACTIVE, not INVALID_CREDENTIALS, and never locks the account out', async () => {
    const ctx = createAe1Ctx();
    const { server, baseUrl } = await startTestServer(ctx);
    try {
      // More than LOGIN_LOCKOUT.perIdentifierAttempts (5) correct-password
      // attempts in a row — if this were (mis)counted as a login failure,
      // the account would be 423-locked well before attempt 6.
      for (let i = 0; i < 6; i++) {
        const response = await fetch(`${baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: AE1_EMAIL, password: AE1_PASSWORD }),
        });
        const body = (await response.json()) as { error?: { code: string } };
        expect(response.status, `attempt ${i}: ${JSON.stringify(body)}`).toBe(403);
        expect(body.error?.code, `attempt ${i}`).toBe('ACCOUNT_NOT_ACTIVE');
      }
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('a wrong password on an unverified account still returns INVALID_CREDENTIALS (not an enumeration leak) and still counts toward lockout', async () => {
    const ctx = createAe1Ctx();
    const { server, baseUrl } = await startTestServer(ctx);
    try {
      // LOGIN_LOCKOUT.perIdentifierAttempts is 5 — the first 5 wrong-password
      // attempts must each come back INVALID_CREDENTIALS (never
      // ACCOUNT_NOT_ACTIVE: that would leak that this email exists and is
      // merely unconfirmed), and the 6th must be locked — proving the
      // counter genuinely incremented on each of the first 5.
      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: AE1_EMAIL, password: 'definitely-the-wrong-password' }),
        });
        const body = (await response.json()) as { error?: { code: string } };
        expect(response.status, `attempt ${i}: ${JSON.stringify(body)}`).toBe(401);
        expect(body.error?.code, `attempt ${i}`).toBe('INVALID_CREDENTIALS');
      }

      const lockedResponse = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: AE1_EMAIL, password: 'definitely-the-wrong-password' }),
      });
      const lockedBody = (await lockedResponse.json()) as { error?: { code: string } };
      expect(lockedResponse.status, JSON.stringify(lockedBody)).toBe(423);
      expect(lockedBody.error?.code).toBe('ACCOUNT_LOCKED');
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
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

  const resetSignOutCalls: string[] = [];

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
      // INC-003 A-20: the factor check now runs for every user type; this
      // customer has none, so the reset completes immediately.
      async findVerifiedTotpFactor() {
        return null;
      },
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
      async signOutAllUserSessions(email) {
        resetSignOutCalls.push(email);
      },
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
      // INC-003 §13 C-1: the reset also reaches every GoTrue session.
      expect(resetSignOutCalls).toEqual([resetEmail]);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });
});

/**
 * Regression: an admin/staff account that forgets its password before ever
 * completing MFA enrollment has no verified TOTP factor yet — unconditionally
 * requiring a code at `/auth/reset-password/confirm` left that account with
 * no way to finish a reset (the UI has no enrollment ticket to act on and no
 * code to enter). `routes/auth.ts`'s privileged branch now mirrors the same
 * `findVerifiedTotpFactor` check login already uses (:410/:589) to decide
 * whether a factor exists before demanding a challenge for it.
 */
describe('POST /auth/reset-password/confirm — privileged account MFA-enrollment-state branching', () => {
  const privilegedAccountId = randomUUID();
  const privilegedEmail = 'new-admin@example.com';
  const privilegedResetToken = 'valid-privileged-reset-token';
  const privilegedNewPassword = 'a-fine-privileged-password-14chars';
  const privilegedUserAccessToken = 'privileged-recovery-access-token-stand-in';

  function fakePrivilegedResetSupabase(opts: { hasVerifiedFactor: boolean; signOutCalls?: string[] }): SupabaseAdmin {
    const notUsed = (name: string) => (): never => {
      throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
    };
    return {
      raw: {} as SupabaseAdmin['raw'],
      createUser: notUsed('createUser'),
      deleteUser: notUsed('deleteUser'),
      verifyPassword: notUsed('verifyPassword'),
      enrollTotpFactor: notUsed('enrollTotpFactor'),
      async challengeTotpFactor() {
        return { challengeId: 'challenge-1' };
      },
      async verifyTotpFactor(_t, _f, _c, code) {
        return code === '123456';
      },
      async findVerifiedTotpFactor(userAccessToken) {
        expect(userAccessToken).toBe(privilegedUserAccessToken);
        return opts.hasVerifiedFactor ? { factorId: 'factor-1' } : null;
      },
      async updateUserPassword(userAccessToken, password) {
        expect(userAccessToken).toBe(privilegedUserAccessToken);
        expect(password).toBe(privilegedNewPassword);
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
        if (email !== privilegedEmail || tokenHash !== privilegedResetToken) return null;
        return { userId: privilegedAccountId, userAccessToken: privilegedUserAccessToken };
      },
      mintTransientUserAccessToken: notUsed('mintTransientUserAccessToken'),
      async signOutAllUserSessions(email: string) {
        opts.signOutCalls?.push(email);
      },
    } as unknown as SupabaseAdmin;
  }

  function createFakeResetMfaTokensRepo(): AppContext['resetMfaTokens'] {
    const records = new Map<string, { id: string; tokenHash: string; accountId: string; resetTokenHash: string; expiresAt: Date; usedAt: Date | null }>();
    let nextId = 0;
    return {
      async create(record) {
        const id = String(++nextId);
        const full = { id, usedAt: null, ...record };
        records.set(record.tokenHash, full);
        return full;
      },
      async findByTokenHash(tokenHash) {
        return records.get(tokenHash) ?? null;
      },
      async tryMarkUsed(id, usedAt) {
        for (const record of records.values()) {
          if (record.id === id && record.usedAt === null) {
            record.usedAt = usedAt;
            return true;
          }
        }
        return false;
      },
    };
  }

  it('completes immediately (no MFA step) for a privileged account with no verified TOTP factor yet', async () => {
    const accounts = createFakeAccountsRepo({
      id: privilegedAccountId,
      email: privilegedEmail,
      userType: 'admin',
      accountState: 'active',
      mfaRequired: true,
      partnerOrganizationId: null,
    });
    const disableAllForAccountCalls: string[] = [];
    const pushTokensFake = {
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

    const ctx = buildMinimalCtx({
      accounts: accounts as unknown as AppContext['accounts'],
      supabase: fakePrivilegedResetSupabase({ hasVerifiedFactor: false }),
      pushTokens: pushTokensFake as unknown as AppContext['pushTokens'],
      resetMfaTokens: createFakeResetMfaTokensRepo(),
    });

    const { server, baseUrl } = await startTestServer(ctx);
    try {
      const response = await fetch(`${baseUrl}/auth/reset-password/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ email: privilegedEmail, resetToken: privilegedResetToken, newPassword: privilegedNewPassword }),
      });
      const body = (await response.json()) as {
        message?: string;
        allSessionsRevoked?: boolean;
        mfaVerificationRequired?: boolean;
      };
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.mfaVerificationRequired).toBeUndefined();
      expect(body.allSessionsRevoked).toBe(true);
      expect(disableAllForAccountCalls).toEqual([privilegedAccountId]);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('still requires an MFA-verify step for a privileged account that already completed enrollment', async () => {
    const accounts = createFakeAccountsRepo({
      id: privilegedAccountId,
      email: privilegedEmail,
      userType: 'admin',
      accountState: 'active',
      mfaRequired: true,
      partnerOrganizationId: null,
    });

    const ctx = buildMinimalCtx({
      accounts: accounts as unknown as AppContext['accounts'],
      supabase: fakePrivilegedResetSupabase({ hasVerifiedFactor: true }),
      resetMfaTokens: createFakeResetMfaTokensRepo(),
    });

    const { server, baseUrl } = await startTestServer(ctx);
    try {
      const response = await fetch(`${baseUrl}/auth/reset-password/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ email: privilegedEmail, resetToken: privilegedResetToken, newPassword: privilegedNewPassword }),
      });
      const body = (await response.json()) as { mfaVerificationRequired?: boolean; mfaVerificationToken?: string };
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.mfaVerificationRequired).toBe(true);
      expect(typeof body.mfaVerificationToken).toBe('string');
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('INC-003 A-20: a CUSTOMER with a verified TOTP factor gets the same MFA step (not an UPSTREAM_UNAVAILABLE dead end), and the password is applied only after a valid code', async () => {
    const accounts = createFakeAccountsRepo({
      id: privilegedAccountId,
      email: privilegedEmail,
      userType: 'customer',
      accountState: 'active',
      mfaRequired: false, // customers opt in; not required
      partnerOrganizationId: null,
    });
    const signOutCalls: string[] = [];
    const supabase = fakePrivilegedResetSupabase({ hasVerifiedFactor: true, signOutCalls });
    const updateSpy = vi.spyOn(supabase, 'updateUserPassword');
    const disabled: string[] = [];
    const ctx = buildMinimalCtx({
      accounts: accounts as unknown as AppContext['accounts'],
      supabase,
      resetMfaTokens: createFakeResetMfaTokensRepo(),
      pushTokens: {
        disableAllForAccount: async (id: string) => {
          disabled.push(id);
          return 0;
        },
      } as unknown as AppContext['pushTokens'],
    });

    const { server, baseUrl } = await startTestServer(ctx);
    try {
      const confirm = await fetch(`${baseUrl}/auth/reset-password/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ email: privilegedEmail, resetToken: privilegedResetToken, newPassword: privilegedNewPassword }),
      });
      const confirmBody = (await confirm.json()) as { mfaVerificationRequired?: boolean; mfaVerificationToken?: string };
      expect(confirm.status, JSON.stringify(confirmBody)).toBe(200);
      expect(confirmBody.mfaVerificationRequired).toBe(true);
      // SR-6 semantics: nothing applied, nothing revoked yet.
      expect(updateSpy).not.toHaveBeenCalled();
      expect(disabled).toEqual([]);

      const wrong = await fetch(`${baseUrl}/auth/reset-password/mfa-verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ mfaVerificationToken: confirmBody.mfaVerificationToken, code: '000000' }),
      });
      expect(wrong.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();

      const verify = await fetch(`${baseUrl}/auth/reset-password/mfa-verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ mfaVerificationToken: confirmBody.mfaVerificationToken, code: '123456' }),
      });
      expect(verify.status, await verify.clone().text()).toBe(200);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(disabled).toEqual([privilegedAccountId]);
      expect(signOutCalls).toEqual([privilegedEmail]);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('INC-003 §13 C-1: the MFA-gated completion path also signs the account out of every GoTrue session', async () => {
    const accounts = createFakeAccountsRepo({
      id: privilegedAccountId,
      email: privilegedEmail,
      userType: 'admin',
      accountState: 'active',
      mfaRequired: true,
      partnerOrganizationId: null,
    });
    const signOutCalls: string[] = [];
    const ctx = buildMinimalCtx({
      accounts: accounts as unknown as AppContext['accounts'],
      supabase: fakePrivilegedResetSupabase({ hasVerifiedFactor: true, signOutCalls }),
      resetMfaTokens: createFakeResetMfaTokensRepo(),
      pushTokens: { disableAllForAccount: async () => 0 } as unknown as AppContext['pushTokens'],
    });

    const { server, baseUrl } = await startTestServer(ctx);
    try {
      const confirm = await fetch(`${baseUrl}/auth/reset-password/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ email: privilegedEmail, resetToken: privilegedResetToken, newPassword: privilegedNewPassword }),
      });
      const { mfaVerificationToken } = (await confirm.json()) as { mfaVerificationToken: string };
      expect(signOutCalls).toHaveLength(0); // nothing applied yet (SR-6)

      const verify = await fetch(`${baseUrl}/auth/reset-password/mfa-verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ mfaVerificationToken, code: '123456' }),
      });
      expect(verify.status, await verify.clone().text()).toBe(200);
      expect(signOutCalls).toEqual([privilegedEmail]);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });
});

/**
 * INC-003 F-2 regression: `POST /auth/reset-password/request` must select
 * the redirect URL from one of two server-configured, allow-listed
 * constants (`env.passwordResetRedirectUrl` / `...RedirectUrlWeb`) based
 * only on the closed `client: 'web' | 'mobile'` discriminator — and must
 * never accept or echo a caller-supplied URL, which would turn this into an
 * open redirect that exfiltrates the Supabase recovery token
 * (`docs/organization/incidents/INC-003-web-password-reset-control-bypass.md`
 * §5, F-2).
 */
describe('POST /auth/reset-password/request — INC-003 F-2 per-client redirect allow-list', () => {
  const requestAccountId = randomUUID();
  const requestEmail = 'reset-client-select@example.com';
  const mobileRedirect = 'tditinsurance://reset-password';
  const webRedirect = 'https://web.example.com/reset-password';

  function createFakeRequestSupabase() {
    const sendPasswordRecoveryEmailCalls: Array<{ email: string; redirectTo: string }> = [];
    const notUsed = (name: string) => (): never => {
      throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
    };
    const supabase: SupabaseAdmin = {
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
      async sendPasswordRecoveryEmail(email, redirectTo) {
        sendPasswordRecoveryEmailCalls.push({ email, redirectTo });
      },
      sendInvitationEmail: notUsed('sendInvitationEmail'),
      getUserByEmail: notUsed('getUserByEmail'),
      getUserFromAccessToken: notUsed('getUserFromAccessToken'),
      isUserEmailConfirmed: notUsed('isUserEmailConfirmed'),
      verifySignupToken: notUsed('verifySignupToken'),
      generatePasswordResetLink: notUsed('generatePasswordResetLink'),
      verifyRecoveryToken: notUsed('verifyRecoveryToken'),
      mintTransientUserAccessToken: notUsed('mintTransientUserAccessToken'),
    };
    return { sendPasswordRecoveryEmailCalls, supabase };
  }

  function buildRequestCtx() {
    const accounts = createFakeAccountsRepo({
      id: requestAccountId,
      email: requestEmail,
      userType: 'customer',
      accountState: 'active',
      mfaRequired: false,
      partnerOrganizationId: null,
    });
    const supabaseFake = createFakeRequestSupabase();
    const ctx = buildMinimalCtx({
      accounts: accounts as unknown as AppContext['accounts'],
      supabase: supabaseFake.supabase,
      env: {
        ...fakeEnv(),
        passwordResetRedirectUrl: mobileRedirect,
        passwordResetRedirectUrlWeb: webRedirect,
      },
    });
    return { ctx, supabaseFake };
  }

  it('uses the mobile allow-listed redirect when client is omitted (mobile does not send it today)', async () => {
    const { ctx, supabaseFake } = buildRequestCtx();
    const { server, baseUrl } = await startTestServer(ctx);
    try {
      const response = await fetch(`${baseUrl}/auth/reset-password/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: requestEmail }),
      });
      expect(response.status).toBe(202);
      expect(supabaseFake.sendPasswordRecoveryEmailCalls).toHaveLength(1);
      expect(supabaseFake.sendPasswordRecoveryEmailCalls[0].redirectTo.startsWith(mobileRedirect)).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('uses the web allow-listed redirect when client is "web"', async () => {
    const { ctx, supabaseFake } = buildRequestCtx();
    const { server, baseUrl } = await startTestServer(ctx);
    try {
      const response = await fetch(`${baseUrl}/auth/reset-password/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: requestEmail, client: 'web' }),
      });
      expect(response.status).toBe(202);
      expect(supabaseFake.sendPasswordRecoveryEmailCalls).toHaveLength(1);
      expect(supabaseFake.sendPasswordRecoveryEmailCalls[0].redirectTo.startsWith(webRedirect)).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('never echoes a caller-supplied redirect URL into the Supabase call, even if one is smuggled in the body', async () => {
    const { ctx, supabaseFake } = buildRequestCtx();
    const { server, baseUrl } = await startTestServer(ctx);
    const attackerUrl = 'https://attacker.example/steal-token';
    try {
      const response = await fetch(`${baseUrl}/auth/reset-password/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Extra, schema-unrecognized fields attempting to smuggle a redirect
        // target must have zero effect — the endpoint has no code path that
        // reads a caller-supplied URL at all.
        body: JSON.stringify({
          email: requestEmail,
          client: 'web',
          redirectUrl: attackerUrl,
          redirectTo: attackerUrl,
          continueUrl: attackerUrl,
        }),
      });
      expect(response.status).toBe(202);
      expect(supabaseFake.sendPasswordRecoveryEmailCalls).toHaveLength(1);
      const { redirectTo } = supabaseFake.sendPasswordRecoveryEmailCalls[0];
      expect(redirectTo.startsWith(webRedirect)).toBe(true);
      expect(redirectTo).not.toContain('attacker.example');
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });
});

/**
 * INC-003 A-16: web signup / resend now go through the backend instead of
 * GoTrue-direct. Pins: the per-client allow-listed verification redirect
 * (never a caller URL), consent still required server-side, and uniform
 * responses (no account enumeration) — including for an auth user created by
 * the pre-A-16 browser signUp that has no app.accounts row.
 */
describe('POST /auth/signup + /auth/resend-verification — INC-003 A-16', () => {
  const WEB_VERIFY_URL = 'https://web.example.test/auth/callback?type=signup';
  const MOBILE_VERIFY_URL = 'tditinsurance://verify-email';

  function harness(opts: {
    existingAuthUser?: boolean;
    accounts?: Array<{ email: string; accountState: AccountState }>;
    sendFails?: boolean;
  } = {}) {
    const sent: Array<{ email: string; redirectTo: string }> = [];
    const created: string[] = [];
    const rows = new Map<string, AccountRow>();
    for (const a of opts.accounts ?? []) {
      rows.set(a.email, {
        id: randomUUID(),
        userType: 'customer',
        accountState: a.accountState,
        email: a.email,
        phone: null,
        mfaRequired: false,
        partnerOrganizationId: null,
        invitedBy: null,
        createdAt: new Date(),
      });
    }
    const notUsed = (name: string) => (): never => {
      throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
    };
    const supabase = new Proxy(
      {
        async createUser(email: string) {
          if (opts.existingAuthUser) throw new SupabaseUserAlreadyExistsError();
          created.push(email);
          return { userId: randomUUID() };
        },
        async sendSignupConfirmationEmail(email: string, redirectTo: string) {
          sent.push({ email, redirectTo });
          if (opts.sendFails) throw new Error('hook down');
        },
      } as Record<string, unknown>,
      { get: (target, prop: string) => (prop in target ? target[prop] : notUsed(prop)) },
    ) as unknown as SupabaseAdmin;
    const accounts = {
      async findByEmail(email: string) {
        return rows.get(email) ?? null;
      },
      async createCustomerAccount(id: string, email: string) {
        const row: AccountRow = {
          id,
          userType: 'customer',
          accountState: 'pending_verification',
          email,
          phone: null,
          mfaRequired: false,
          partnerOrganizationId: null,
          invitedBy: null,
          createdAt: new Date(),
        };
        rows.set(email, row);
        return row;
      },
    };
    const ctx = buildMinimalCtx({
      env: { ...fakeEnv(), emailVerificationRedirectUrl: MOBILE_VERIFY_URL, emailVerificationRedirectUrlWeb: WEB_VERIFY_URL },
      accounts: accounts as unknown as AppContext['accounts'],
      supabase,
    });
    return { ctx, sent, created, rows };
  }

  async function post(baseUrl: string, path: string, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async function withServer<T>(ctx: AppContext, fn: (baseUrl: string) => Promise<T>): Promise<T> {
    const { server, baseUrl } = await startTestServer(ctx);
    try {
      return await fn(baseUrl);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  }

  const PASSWORD = 'a-good-long-password';

  it('client "web" uses the web allow-listed redirect; omitted client keeps the mobile one', async () => {
    const h = harness();
    await withServer(h.ctx, async (baseUrl) => {
      expect((await post(baseUrl, '/auth/signup', { email: 'web@example.com', password: PASSWORD, consentAccepted: true, client: 'web' })).status).toBe(202);
      expect((await post(baseUrl, '/auth/signup', { email: 'mob@example.com', password: PASSWORD, consentAccepted: true })).status).toBe(202);
    });
    expect(h.sent).toEqual([
      { email: 'web@example.com', redirectTo: WEB_VERIFY_URL },
      { email: 'mob@example.com', redirectTo: MOBILE_VERIFY_URL },
    ]);
  });

  it('never uses a caller-supplied redirect smuggled into the body', async () => {
    const h = harness();
    await withServer(h.ctx, async (baseUrl) => {
      await post(baseUrl, '/auth/signup', {
        email: 'x@example.com',
        password: PASSWORD,
        consentAccepted: true,
        client: 'web',
        redirectTo: 'https://attacker.example/steal',
        emailRedirectTo: 'https://attacker.example/steal',
      });
    });
    expect(h.sent).toEqual([{ email: 'x@example.com', redirectTo: WEB_VERIFY_URL }]);
  });

  it('consent is still required server-side (unchanged semantics)', async () => {
    const h = harness();
    await withServer(h.ctx, async (baseUrl) => {
      expect((await post(baseUrl, '/auth/signup', { email: 'c@example.com', password: PASSWORD, client: 'web' })).status).toBe(400);
      expect(
        (await post(baseUrl, '/auth/signup', { email: 'c@example.com', password: PASSWORD, consentAccepted: false, client: 'web' })).status,
      ).toBe(400);
    });
    expect(h.created).toEqual([]);
  });

  it('no enumeration: new email, registered app account, and auth-only user (pre-A-16 browser signup) all get the identical 202', async () => {
    const fresh = harness();
    const registered = harness({ accounts: [{ email: 'taken@example.com', accountState: 'active' }] });
    const authOnly = harness({ existingAuthUser: true });
    const bodies = await Promise.all([
      withServer(fresh.ctx, (b) => post(b, '/auth/signup', { email: 'new@example.com', password: PASSWORD, consentAccepted: true, client: 'web' })),
      withServer(registered.ctx, (b) => post(b, '/auth/signup', { email: 'taken@example.com', password: PASSWORD, consentAccepted: true, client: 'web' })),
      withServer(authOnly.ctx, (b) => post(b, '/auth/signup', { email: 'legacy@example.com', password: PASSWORD, consentAccepted: true, client: 'web' })),
    ]);
    for (const r of bodies) expect(r.status).toBe(202);
    expect(bodies[1]!.body).toEqual(bodies[0]!.body);
    expect(bodies[2]!.body).toEqual(bodies[0]!.body);
    // The auth-only case sends nothing (no mail-bombing via /signup) and creates no app row.
    expect(authOnly.sent).toEqual([]);
    expect(authOnly.rows.size).toBe(0);
  });

  it('resend: identical 202 for unknown, pending, and active accounts; only pending is mailed, with the web redirect', async () => {
    const h = harness({
      accounts: [
        { email: 'pending@example.com', accountState: 'pending_verification' },
        { email: 'active@example.com', accountState: 'active' },
      ],
    });
    const results = await withServer(h.ctx, async (baseUrl) => [
      await post(baseUrl, '/auth/resend-verification', { email: 'nobody@example.com', client: 'web' }),
      await post(baseUrl, '/auth/resend-verification', { email: 'pending@example.com', client: 'web' }),
      await post(baseUrl, '/auth/resend-verification', { email: 'active@example.com', client: 'web' }),
    ]);
    for (const r of results) {
      expect(r.status).toBe(202);
      expect(r.body).toEqual(results[0]!.body);
    }
    expect(h.sent).toEqual([{ email: 'pending@example.com', redirectTo: WEB_VERIFY_URL }]);
  });

  it('resend: a delivery failure for a pending account is still the uniform 202 (no 503 oracle)', async () => {
    const h = harness({ accounts: [{ email: 'pending@example.com', accountState: 'pending_verification' }], sendFails: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const r = await withServer(h.ctx, (b) => post(b, '/auth/resend-verification', { email: 'pending@example.com', client: 'web' }));
      expect(r.status).toBe(202);
    } finally {
      warn.mockRestore();
    }
  });

  it('resend: a per-IP ceiling bounds sweeping many different addresses', async () => {
    const h = harness();
    const statuses = await withServer(h.ctx, async (baseUrl) => {
      const out: number[] = [];
      for (let i = 0; i < 21; i += 1) {
        out.push((await post(baseUrl, '/auth/resend-verification', { email: `sweep-${i}@example.com`, client: 'web' })).status);
      }
      return out;
    });
    expect(statuses.slice(0, 20).every((st) => st === 202)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

/**
 * INC-003 C-12 / finding B-1 (§30.2). The reset and verify routes must act
 * only on the account GoTrue redeemed the token for, never on the account the
 * client-supplied email names. These fakes model the ADR-0014 G-4
 * `token_hash` semantics in which GoTrue resolves the user from the hash and
 * IGNORES the email: that is exactly the configuration in which the old
 * code's implicit email binding disappeared. A hash for account A submitted
 * with account B's email must leave B (and A) completely untouched.
 */
describe('INC-003 C-12 / B-1 — GoTrue-verified user is bound to the account acted on', () => {
  const A = { id: randomUUID(), email: 'attacker-a@example.com' };
  const B = { id: randomUUID(), email: 'victim-b@example.com' };
  const UNREGISTERED_EMAIL = 'nobody@example.com';
  const NEW_PASSWORD = 'a-new-customer-password';
  const HASH_A = 'recovery-hash-for-A';
  const HASH_NO_ID = 'recovery-hash-gotrue-returns-no-user-id';
  const SIGNUP_HASH_A = 'signup-hash-for-A';
  const SIGNUP_HASH_NO_ID = 'signup-hash-gotrue-returns-no-user-id';
  const ACCESS_TOKEN_X = 'gotrue-access-token-for-unlinked-user';

  interface Harness {
    ctx: AppContext;
    kv: InMemoryKeyValueStore;
    spies: {
      updateUserPassword: string[];
      signOut: string[];
      revokeAll: string[];
      pushDisable: string[];
      audit: Array<{ accountId: string | null; eventType: string }>;
      passwordChangedNotices: string[];
      markEmailVerified: string[];
      welcome: string[];
      resetMfaTokensCreated: string[];
      totpVerifyCalls: number;
    };
  }

  function makeHarness(opts: { factorUserIds?: string[]; updateUserPasswordThrows?: Error; findByIdThrowsAfter?: number; verifyRecoveryThrows?: Error } = {}): Harness {
    const spies: Harness['spies'] = {
      updateUserPassword: [],
      signOut: [],
      revokeAll: [],
      pushDisable: [],
      audit: [],
      passwordChangedNotices: [],
      markEmailVerified: [],
      welcome: [],
      resetMfaTokensCreated: [],
      totpVerifyCalls: 0,
    };
    const rows = [A, B].map(
      (a): AccountRow => ({
        id: a.id,
        userType: 'customer',
        accountState: 'active',
        email: a.email,
        phone: null,
        mfaRequired: false,
        partnerOrganizationId: null,
        invitedBy: null,
        createdAt: new Date(),
      }),
    );
    let findByIdCalls = 0;
    const accounts = {
      async findById(id: string) {
        findByIdCalls += 1;
        if (opts.findByIdThrowsAfter !== undefined && findByIdCalls > opts.findByIdThrowsAfter) {
          throw new Error('simulated database failure');
        }
        return rows.find((r) => r.id === id) ?? null;
      },
      async findByEmail(email: string) {
        return rows.find((r) => r.email === email.trim().toLowerCase()) ?? null;
      },
      async markEmailVerified(id: string) {
        spies.markEmailVerified.push(id);
      },
    };
    const notUsed = (name: string) => (): never => {
      throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
    };
    const uatFor = (userId: string | null) => `uat-${userId ?? 'none'}`;
    const factorUsers = new Set(opts.factorUserIds ?? []);
    const supabase = {
      raw: {} as SupabaseAdmin['raw'],
      // token_hash semantics: the email argument is ignored.
      async verifyRecoveryToken(_email: string, tokenHash: string) {
        if (opts.verifyRecoveryThrows) throw opts.verifyRecoveryThrows;
        if (tokenHash === HASH_A) return { userId: A.id, userAccessToken: uatFor(A.id) };
        if (tokenHash === HASH_NO_ID) return { userId: null, userAccessToken: uatFor(null) };
        return null;
      },
      async verifySignupToken(_email: string, tokenHash: string) {
        if (tokenHash === SIGNUP_HASH_A) return { userId: A.id };
        if (tokenHash === SIGNUP_HASH_NO_ID) return { userId: null };
        return null;
      },
      async getUserFromAccessToken(token: string) {
        // A GoTrue user that is NOT B, but whose GoTrue email claims B's address.
        if (token === ACCESS_TOKEN_X) return { userId: randomUUID(), email: B.email, emailConfirmed: true };
        return null;
      },
      async findVerifiedTotpFactor(userAccessToken: string) {
        for (const id of factorUsers) if (userAccessToken === uatFor(id)) return { factorId: `factor-${id}` };
        return null;
      },
      async challengeTotpFactor() {
        return { challengeId: 'challenge-1' };
      },
      async verifyTotpFactor(_t: string, _f: string, _c: string, code: string) {
        spies.totpVerifyCalls += 1;
        return code === '123456';
      },
      async updateUserPassword(userAccessToken: string) {
        if (opts.updateUserPasswordThrows) throw opts.updateUserPasswordThrows;
        spies.updateUserPassword.push(userAccessToken);
      },
      async signOutAllUserSessions(email: string) {
        spies.signOut.push(email);
      },
      createUser: notUsed('createUser'),
      deleteUser: notUsed('deleteUser'),
      verifyPassword: notUsed('verifyPassword'),
      enrollTotpFactor: notUsed('enrollTotpFactor'),
      generateEmailVerificationLink: notUsed('generateEmailVerificationLink'),
      sendSignupConfirmationEmail: notUsed('sendSignupConfirmationEmail'),
      sendPasswordRecoveryEmail: notUsed('sendPasswordRecoveryEmail'),
      sendInvitationEmail: notUsed('sendInvitationEmail'),
      getUserByEmail: notUsed('getUserByEmail'),
      isUserEmailConfirmed: notUsed('isUserEmailConfirmed'),
      generatePasswordResetLink: notUsed('generatePasswordResetLink'),
      mintTransientUserAccessToken: notUsed('mintTransientUserAccessToken'),
    } as unknown as SupabaseAdmin;

    const mfaRecords = new Map<string, { id: string; tokenHash: string; accountId: string; resetTokenHash: string; expiresAt: Date; usedAt: Date | null }>();
    let nextId = 0;
    const resetMfaTokens: AppContext['resetMfaTokens'] = {
      async create(record) {
        spies.resetMfaTokensCreated.push(record.accountId);
        const full = { id: String(++nextId), usedAt: null, ...record };
        mfaRecords.set(record.tokenHash, full);
        return full;
      },
      async findByTokenHash(tokenHash) {
        return mfaRecords.get(tokenHash) ?? null;
      },
      async tryMarkUsed(id, usedAt) {
        for (const r of mfaRecords.values()) {
          if (r.id === id && r.usedAt === null) {
            r.usedAt = usedAt;
            return true;
          }
        }
        return false;
      },
    };

    const kv = new InMemoryKeyValueStore();
    const ctx = buildMinimalCtx({
      kv,
      accounts: accounts as unknown as AppContext['accounts'],
      supabase,
      resetMfaTokens,
      sessions: {
        async revokeAllForAccount(accountId: string) {
          spies.revokeAll.push(accountId);
          return [];
        },
        async findRevocationWatermark() {
          return null;
        },
      } as unknown as AppContext['sessions'],
      pushTokens: {
        async disableAllForAccount(accountId: string) {
          spies.pushDisable.push(accountId);
          return 0;
        },
      } as unknown as AppContext['pushTokens'],
      auditLog: {
        async record(event: { accountId: string | null; eventType: string }) {
          spies.audit.push(event);
        },
      } as unknown as AppContext['auditLog'],
      authNotifications: {
        async notifyPasswordChanged(input: { accountId: string }) {
          spies.passwordChangedNotices.push(input.accountId);
        },
      } as unknown as AppContext['authNotifications'],
      onboardingNotifications: {
        async notifyWelcomeIfNeeded(accountId: string) {
          spies.welcome.push(accountId);
        },
      } as unknown as AppContext['onboardingNotifications'],
    });
    return { ctx, kv, spies };
  }

  function expectNoSideEffects(h: Harness) {
    expect(h.spies.updateUserPassword).toEqual([]);
    expect(h.spies.signOut).toEqual([]);
    expect(h.spies.revokeAll).toEqual([]);
    expect(h.spies.pushDisable).toEqual([]);
    expect(h.spies.audit).toEqual([]);
    expect(h.spies.passwordChangedNotices).toEqual([]);
    expect(h.spies.markEmailVerified).toEqual([]);
    expect(h.spies.welcome).toEqual([]);
  }

  async function post(baseUrl: string, path: string, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as Record<string, unknown> & { error?: { code?: string } };
    return { status: response.status, body: json };
  }

  /** Every alert line must carry ids only: no email, no token, no password. */
  function alertLines(warnSpy: ReturnType<typeof vi.spyOn>, tag: string): string[] {
    const lines = warnSpy.mock.calls.map((c) => c.map(String).join(' ')).filter((l) => l.includes(tag));
    for (const line of lines) {
      for (const secret of [A.email, B.email, UNREGISTERED_EMAIL, HASH_A, HASH_NO_ID, SIGNUP_HASH_A, NEW_PASSWORD, 'uat-']) {
        expect(line).not.toContain(secret);
      }
    }
    return lines;
  }

  async function withServer<T>(h: Harness, fn: (baseUrl: string) => Promise<T>): Promise<T> {
    const { server, baseUrl } = await startTestServer(h.ctx);
    try {
      return await fn(baseUrl);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  }

  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('/confirm: a hash redeemed for A, submitted with B\'s email, does nothing to A or B and alerts with ids only', async () => {
    const h = makeHarness();
    await withServer(h, async (baseUrl) => {
      const res = await post(baseUrl, '/auth/reset-password/confirm', { email: B.email, resetToken: HASH_A, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('RESET_TOKEN_INVALID');
    });
    expectNoSideEffects(h);
    expect(h.spies.resetMfaTokensCreated).toEqual([]);
    const lines = alertLines(warnSpy, RECOVERY_IDENTITY_MISMATCH_LOG_TAG);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`verifiedUserId=${A.id}`);
    expect(lines[0]).toContain(`submittedEmailAccountId=${B.id}`);
  });

  it('/confirm: the mismatch response is identical to an unregistered email (no enumeration of B)', async () => {
    const h = makeHarness();
    await withServer(h, async (baseUrl) => {
      const registered = await post(baseUrl, '/auth/reset-password/confirm', { email: B.email, resetToken: HASH_A, newPassword: NEW_PASSWORD });
      const unregistered = await post(baseUrl, '/auth/reset-password/confirm', { email: UNREGISTERED_EMAIL, resetToken: HASH_A, newPassword: NEW_PASSWORD });
      expect(unregistered.status).toBe(registered.status);
      expect(unregistered.body.error?.code).toBe(registered.body.error?.code);
      expect((unregistered.body.error as { message?: string }).message).toBe((registered.body.error as { message?: string }).message);
    });
    expectNoSideEffects(h);
  });

  it('/confirm: the matching case (hash for A, email A) still completes, acting on A only', async () => {
    const h = makeHarness();
    await withServer(h, async (baseUrl) => {
      const res = await post(baseUrl, '/auth/reset-password/confirm', { email: A.email, resetToken: HASH_A, newPassword: NEW_PASSWORD });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.allSessionsRevoked).toBe(true);
    });
    expect(h.spies.updateUserPassword).toEqual([`uat-${A.id}`]);
    expect(h.spies.revokeAll).toEqual([A.id]);
    expect(h.spies.pushDisable).toEqual([A.id]);
    expect(h.spies.signOut).toEqual([A.email]);
    expect(h.spies.audit).toEqual([expect.objectContaining({ accountId: A.id, eventType: 'password_reset_completed' })]);
    await vi.waitFor(() => expect(h.spies.passwordChangedNotices).toEqual([A.id]));
    expect(alertLines(warnSpy, RECOVERY_IDENTITY_MISMATCH_LOG_TAG)).toHaveLength(0);
  });

  it('/confirm: GoTrue accepting the hash but returning no user id fails closed (no side effects, unbound alert)', async () => {
    const h = makeHarness();
    await withServer(h, async (baseUrl) => {
      const res = await post(baseUrl, '/auth/reset-password/confirm', { email: A.email, resetToken: HASH_NO_ID, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('RESET_TOKEN_INVALID');
    });
    expectNoSideEffects(h);
    expect(alertLines(warnSpy, RECOVERY_IDENTITY_UNBOUND_LOG_TAG)).toHaveLength(1);
  });

  it('/confirm (recoveryAccessToken branch): a GoTrue user that is not B cannot act on B even if its email claims B', async () => {
    const h = makeHarness();
    await withServer(h, async (baseUrl) => {
      const res = await post(baseUrl, '/auth/reset-password/confirm', { recoveryAccessToken: ACCESS_TOKEN_X, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('RESET_TOKEN_INVALID');
    });
    expectNoSideEffects(h);
  });

  it('MFA-deferred path: hash for A with B\'s email parks nothing for B; matching case parks verifiedUserId and completes for A', async () => {
    const h = makeHarness({ factorUserIds: [A.id, B.id] });
    await withServer(h, async (baseUrl) => {
      const mismatch = await post(baseUrl, '/auth/reset-password/confirm', { email: B.email, resetToken: HASH_A, newPassword: NEW_PASSWORD });
      expect(mismatch.status).toBe(404);
      expect(mismatch.body.mfaVerificationToken).toBeUndefined();
      expect(h.spies.resetMfaTokensCreated).toEqual([]);
      expectNoSideEffects(h);

      const ok = await post(baseUrl, '/auth/reset-password/confirm', { email: A.email, resetToken: HASH_A, newPassword: NEW_PASSWORD });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.mfaVerificationRequired).toBe(true);
      expect(h.spies.resetMfaTokensCreated).toEqual([A.id]);
      const parked = JSON.parse((await h.kv.get(`reset-mfa-pending:${String(ok.body.mfaVerificationToken)}`))!) as { verifiedUserId?: string };
      expect(parked.verifiedUserId).toBe(A.id);
      expectNoSideEffects(h);

      const done = await post(baseUrl, '/auth/reset-password/mfa-verify', { mfaVerificationToken: ok.body.mfaVerificationToken, code: '123456' });
      expect(done.status, JSON.stringify(done.body)).toBe(200);
    });
    expect(h.spies.updateUserPassword).toEqual([`uat-${A.id}`]);
    expect(h.spies.revokeAll).toEqual([A.id]);
    expect(h.spies.pushDisable).toEqual([A.id]);
    expect(h.spies.signOut).toEqual([A.email]);
    expect(h.spies.audit.map((e) => e.accountId)).toEqual([A.id]);
  });

  it('MFA-deferred completion re-checks the parked identity: a record whose verifiedUserId is not the token\'s account, or is missing, fails closed before any TOTP call', async () => {
    const h = makeHarness({ factorUserIds: [A.id] });
    await withServer(h, async (baseUrl) => {
      for (const tamper of [{ verifiedUserId: B.id }, { verifiedUserId: undefined }]) {
        const ok = await post(baseUrl, '/auth/reset-password/confirm', { email: A.email, resetToken: HASH_A, newPassword: NEW_PASSWORD });
        expect(ok.body.mfaVerificationRequired).toBe(true);
        const key = `reset-mfa-pending:${String(ok.body.mfaVerificationToken)}`;
        const parked = JSON.parse((await h.kv.get(key))!) as Record<string, unknown>;
        await h.kv.set(key, JSON.stringify({ ...parked, ...tamper }), 600);

        const res = await post(baseUrl, '/auth/reset-password/mfa-verify', { mfaVerificationToken: ok.body.mfaVerificationToken, code: '123456' });
        expect(res.status).toBe(404);
        expect(res.body.error?.code).toBe('RESET_TOKEN_INVALID');
      }
    });
    expect(h.spies.totpVerifyCalls).toBe(0);
    expectNoSideEffects(h);
    expect(alertLines(warnSpy, RECOVERY_IDENTITY_MISMATCH_LOG_TAG)).toHaveLength(1);
    expect(alertLines(warnSpy, RECOVERY_IDENTITY_UNBOUND_LOG_TAG)).toHaveLength(1);
  });

  it('/verify-email: a signup hash for A submitted with B\'s email does not verify B, welcome B, or touch A', async () => {
    const h = makeHarness();
    await withServer(h, async (baseUrl) => {
      const res = await post(baseUrl, '/auth/verify-email', { email: B.email, token: SIGNUP_HASH_A });
      expect(res.status).toBe(410);
      expect(res.body.error?.code).toBe('RESET_TOKEN_EXPIRED');
    });
    expectNoSideEffects(h);
    const lines = alertLines(warnSpy, RECOVERY_IDENTITY_MISMATCH_LOG_TAG);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('route=POST /v1/auth/verify-email');
  });

  it('/verify-email: matching case verifies A; a GoTrue response with no user id fails closed', async () => {
    const h = makeHarness();
    await withServer(h, async (baseUrl) => {
      const noId = await post(baseUrl, '/auth/verify-email', { email: A.email, token: SIGNUP_HASH_NO_ID });
      expect(noId.status).toBe(410);
      expect(h.spies.markEmailVerified).toEqual([]);
      expect(alertLines(warnSpy, RECOVERY_IDENTITY_UNBOUND_LOG_TAG)).toHaveLength(1);

      const ok = await post(baseUrl, '/auth/verify-email', { email: A.email, token: SIGNUP_HASH_A });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    });
    expect(h.spies.markEmailVerified).toEqual([A.id]);
    await vi.waitFor(() => expect(h.spies.welcome).toEqual([A.id]));
  });

  it('§30 advisory: a 5xx after the reset link was redeemed is RESET_COMPLETION_FAILED; pre-redemption 503 and post-redemption 4xx are unchanged', async () => {
    // Post-redemption: the GoTrue password write fails.
    const failingWrite = makeHarness({ updateUserPasswordThrows: new SupabaseUnavailableError('update user password returned 500') });
    await withServer(failingWrite, async (baseUrl) => {
      const res = await post(baseUrl, '/auth/reset-password/confirm', { email: A.email, resetToken: HASH_A, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(500);
      expect(res.body.error?.code).toBe('RESET_COMPLETION_FAILED');
    });
    // Post-redemption: a database failure resolving the account.
    const failingDb = makeHarness({ findByIdThrowsAfter: 0 });
    await withServer(failingDb, async (baseUrl) => {
      const res = await post(baseUrl, '/auth/reset-password/confirm', { email: A.email, resetToken: HASH_A, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(500);
      expect(res.body.error?.code).toBe('RESET_COMPLETION_FAILED');
    });
    // Pre-redemption: GoTrue /verify unavailable stays a retryable 503.
    const preRedemption = makeHarness({ verifyRecoveryThrows: new SupabaseUnavailableError('verify recovery token returned 502') });
    await withServer(preRedemption, async (baseUrl) => {
      const res = await post(baseUrl, '/auth/reset-password/confirm', { email: A.email, resetToken: HASH_A, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(503);
      expect(res.body.error?.code).toBe('UPSTREAM_UNAVAILABLE');
    });
    // Post-redemption 4xx: unchanged.
    const shortPassword = makeHarness();
    await withServer(shortPassword, async (baseUrl) => {
      const res = await post(baseUrl, '/auth/reset-password/confirm', { email: A.email, resetToken: HASH_A, newPassword: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    });
  });
});

/**
 * ADR-0014 §15.5/§18.3, condition CS-1 (Phase 1 exit criterion). Every writer
 * that creates or activates a customer account must now write an
 * `account_created`/`email_verified` audit row, and none of the four routes'
 * response shapes, status codes, or branch-distinguishing side effects may
 * change as a result (the uniform-response rule binds `/auth/signup`,
 * `/auth/resend-verification` and `/auth/notify-email-verified` exactly as it
 * did before this change).
 */
describe('ADR-0014 CS-1 — account_created / email_verified audit rows', () => {
  function fakeAuditLogWithEvents() {
    const events: Array<{ accountId: string | null; eventType: string; ipAddress?: string | null }> = [];
    return {
      events,
      async record(event: { accountId: string | null; eventType: string; ipAddress?: string | null }) {
        events.push(event);
      },
    };
  }

  async function post(baseUrl: string, path: string, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async function withServer<T>(ctx: AppContext, fn: (baseUrl: string) => Promise<T>): Promise<T> {
    const { server, baseUrl } = await startTestServer(ctx);
    try {
      return await fn(baseUrl);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  }

  const PASSWORD = 'a-good-long-password';

  describe('POST /auth/signup', () => {
    it('writes account_created for a newly created account, and does not change the 202 response', async () => {
      const auditLog = fakeAuditLogWithEvents();
      const created: string[] = [];
      const rows = new Map<string, AccountRow>();
      const notUsed = (name: string) => (): never => {
        throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
      };
      const supabase = new Proxy(
        {
          async createUser(email: string) {
            const userId = randomUUID();
            created.push(email);
            return { userId };
          },
          async sendSignupConfirmationEmail() {
            return undefined;
          },
        } as Record<string, unknown>,
        { get: (target, prop: string) => (prop in target ? target[prop] : notUsed(prop)) },
      ) as unknown as SupabaseAdmin;
      const accounts = {
        async findByEmail(email: string) {
          return rows.get(email) ?? null;
        },
        async createCustomerAccount(id: string, email: string) {
          const row: AccountRow = {
            id,
            userType: 'customer',
            accountState: 'pending_verification',
            email,
            phone: null,
            mfaRequired: false,
            partnerOrganizationId: null,
            invitedBy: null,
            createdAt: new Date(),
          };
          rows.set(email, row);
          return row;
        },
      };
      const ctx = buildMinimalCtx({
        accounts: accounts as unknown as AppContext['accounts'],
        supabase,
        auditLog: auditLog as unknown as AppContext['auditLog'],
      });
      const response = await withServer(ctx, (baseUrl) =>
        post(baseUrl, '/auth/signup', { email: 'new-cs1@example.com', password: PASSWORD, consentAccepted: true, client: 'web' }),
      );
      expect(response.status).toBe(202);
      expect(response.body).toEqual({ message: 'If this email is new, check your inbox to verify your account.' });

      const createdAccount = rows.get('new-cs1@example.com');
      expect(createdAccount).toBeDefined();
      expect(auditLog.events).toContainEqual(
        expect.objectContaining({ accountId: createdAccount!.id, eventType: 'account_created' }),
      );
    });

    it('writes no account_created row for an already-registered email (uniform 202, no new account)', async () => {
      const auditLog = fakeAuditLogWithEvents();
      const existing: AccountRow = {
        id: randomUUID(),
        userType: 'customer',
        accountState: 'active',
        email: 'taken-cs1@example.com',
        phone: null,
        mfaRequired: false,
        partnerOrganizationId: null,
        invitedBy: null,
        createdAt: new Date(),
      };
      const accounts = {
        async findByEmail(email: string) {
          return email === existing.email ? existing : null;
        },
        async createCustomerAccount(): Promise<AccountRow> {
          throw new Error('must not be called — account already exists');
        },
      };
      const ctx = buildMinimalCtx({
        accounts: accounts as unknown as AppContext['accounts'],
        supabase: {} as unknown as SupabaseAdmin,
        auditLog: auditLog as unknown as AppContext['auditLog'],
      });
      const response = await withServer(ctx, (baseUrl) =>
        post(baseUrl, '/auth/signup', { email: existing.email, password: PASSWORD, consentAccepted: true, client: 'web' }),
      );
      expect(response.status).toBe(202);
      expect(auditLog.events).toEqual([]);
    });
  });

  describe('POST /auth/verify-email', () => {
    function harness() {
      const auditLog = fakeAuditLogWithEvents();
      const markEmailVerifiedCalls: string[] = [];
      const account: AccountRow = {
        id: randomUUID(),
        userType: 'customer',
        accountState: 'pending_verification',
        email: 'verify-cs1@example.com',
        phone: null,
        mfaRequired: false,
        partnerOrganizationId: null,
        invitedBy: null,
        createdAt: new Date(),
      };
      const accounts = {
        async findById(id: string): Promise<AccountRow | null> {
          return id === account.id ? account : null;
        },
        async findByEmail(email: string): Promise<AccountRow | null> {
          return email === account.email ? account : null;
        },
        async markEmailVerified(id: string): Promise<void> {
          markEmailVerifiedCalls.push(id);
          if (id === account.id) account.accountState = 'active';
        },
      };
      const notUsed = (name: string) => (): never => {
        throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
      };
      const supabase = new Proxy(
        {
          async verifySignupToken(email: string, token: string) {
            if (token !== 'good-token') return null;
            return { userId: account.id };
          },
        } as Record<string, unknown>,
        { get: (target, prop: string) => (prop in target ? target[prop] : notUsed(prop)) },
      ) as unknown as SupabaseAdmin;
      const ctx = buildMinimalCtx({
        accounts: accounts as unknown as AppContext['accounts'],
        supabase,
        auditLog: auditLog as unknown as AppContext['auditLog'],
      });
      return { ctx, auditLog, account, markEmailVerifiedCalls };
    }

    it('writes email_verified on a genuine pending_verification -> active transition, without changing the 200 response', async () => {
      const h = harness();
      const response = await withServer(h.ctx, (baseUrl) =>
        post(baseUrl, '/auth/verify-email', { email: h.account.email, token: 'good-token' }),
      );
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Email verified.' });
      expect(h.auditLog.events).toContainEqual(
        expect.objectContaining({ accountId: h.account.id, eventType: 'email_verified' }),
      );
    });

    it('does not write email_verified for a replayed token against an already-active account', async () => {
      const h = harness();
      h.account.accountState = 'active'; // already verified before this request
      const response = await withServer(h.ctx, (baseUrl) =>
        post(baseUrl, '/auth/verify-email', { email: h.account.email, token: 'good-token' }),
      );
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Email verified.' });
      // markEmailVerified is still called (its own UPDATE is a no-op against
      // a non-pending row) but no new audit row should result.
      expect(h.markEmailVerifiedCalls).toEqual([h.account.id]);
      expect(h.auditLog.events.filter((e) => e.eventType === 'email_verified')).toEqual([]);
    });

    it('writes no audit row for an expired/invalid token (unchanged 4xx)', async () => {
      const h = harness();
      const response = await withServer(h.ctx, (baseUrl) =>
        post(baseUrl, '/auth/verify-email', { email: h.account.email, token: 'bad-token' }),
      );
      expect(response.status).toBe(410);
      expect(h.auditLog.events).toEqual([]);
    });
  });

  describe('POST /auth/notify-email-verified', () => {
    function harness(opts: { confirmedInGoTrue: boolean }) {
      const auditLog = fakeAuditLogWithEvents();
      const accountId = randomUUID();
      const email = 'backfill-cs1@example.com';
      const rows = new Map<string, AccountRow>();
      const notUsed = (name: string) => (): never => {
        throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
      };
      const supabase = new Proxy(
        {
          async getUserByEmail() {
            return { userId: accountId };
          },
          async isUserEmailConfirmed() {
            return opts.confirmedInGoTrue;
          },
        } as Record<string, unknown>,
        { get: (target, prop: string) => (prop in target ? target[prop] : notUsed(prop)) },
      ) as unknown as SupabaseAdmin;
      const accounts = {
        async findById(id: string): Promise<AccountRow | null> {
          return rows.get(id) ?? null;
        },
        async createCustomerAccount(id: string, em: string) {
          const row: AccountRow = {
            id,
            userType: 'customer',
            accountState: 'pending_verification',
            email: em,
            phone: null,
            mfaRequired: false,
            partnerOrganizationId: null,
            invitedBy: null,
            createdAt: new Date(),
          };
          rows.set(id, row);
          return row;
        },
        async markEmailVerified(id: string): Promise<void> {
          const row = rows.get(id);
          if (row) row.accountState = 'active';
        },
      };
      const authNotifications = {
        async notifyEmailAlreadyVerified() {
          return false;
        },
      };
      const ctx = buildMinimalCtx({
        accounts: accounts as unknown as AppContext['accounts'],
        supabase,
        auditLog: auditLog as unknown as AppContext['auditLog'],
        authNotifications: authNotifications as unknown as AppContext['authNotifications'],
      });
      return { ctx, auditLog, accountId, email, rows };
    }

    it('backfills app.accounts and writes both account_created and email_verified for a GoTrue-only, already-confirmed user — uniform 202 unchanged', async () => {
      const h = harness({ confirmedInGoTrue: true });
      const response = await withServer(h.ctx, (baseUrl) => post(baseUrl, '/auth/notify-email-verified', { email: h.email }));
      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        message: 'If this account needs anything from us, check your inbox — you can also try logging in.',
      });
      expect(h.auditLog.events).toEqual([
        expect.objectContaining({ accountId: h.accountId, eventType: 'account_created' }),
        expect.objectContaining({ accountId: h.accountId, eventType: 'email_verified' }),
      ]);
      expect(h.rows.get(h.accountId)?.accountState).toBe('active');
    });

    it('writes no audit row when GoTrue reports the email not yet confirmed (uniform 202 unchanged)', async () => {
      const h = harness({ confirmedInGoTrue: false });
      const response = await withServer(h.ctx, (baseUrl) => post(baseUrl, '/auth/notify-email-verified', { email: h.email }));
      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        message: 'If this account needs anything from us, check your inbox — you can also try logging in.',
      });
      expect(h.auditLog.events).toEqual([]);
      expect(h.rows.size).toBe(0);
    });
  });

  describe('POST /auth/supabase/exchange', () => {
    it('backfills app.accounts and writes account_created for a GoTrue-only user, without changing the success response shape', async () => {
      const auditLog = fakeAuditLogWithEvents();
      const accountId = randomUUID();
      const email = 'exchange-cs1@example.com';
      const accessToken = 'exchange-cs1-token';
      const rows = new Map<string, AccountRow>();
      const notUsed = (name: string) => (): never => {
        throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
      };
      const supabase = new Proxy(
        {
          async getUserFromAccessToken(token: string) {
            if (token !== accessToken) return null;
            return { userId: accountId, email, emailConfirmed: true };
          },
          async findVerifiedTotpFactor() {
            return null;
          },
        } as Record<string, unknown>,
        { get: (target, prop: string) => (prop in target ? target[prop] : notUsed(prop)) },
      ) as unknown as SupabaseAdmin;
      const accounts = {
        async findById(id: string): Promise<AccountRow | null> {
          return rows.get(id) ?? null;
        },
        async createCustomerAccount(id: string, em: string) {
          const row: AccountRow = {
            id,
            userType: 'customer',
            accountState: 'pending_verification',
            email: em,
            phone: null,
            mfaRequired: false,
            partnerOrganizationId: null,
            invitedBy: null,
            createdAt: new Date(),
          };
          rows.set(id, row);
          return row;
        },
        async markEmailVerified(id: string): Promise<void> {
          const row = rows.get(id);
          if (row) row.accountState = 'active';
        },
      };
      const ctx = buildMinimalCtx({
        accounts: accounts as unknown as AppContext['accounts'],
        supabase,
        auditLog: auditLog as unknown as AppContext['auditLog'],
      });
      const response = await withServer(ctx, (baseUrl) => post(baseUrl, '/auth/supabase/exchange', { accessToken }));
      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({ accessToken: expect.any(String), refreshToken: expect.any(String), sessionId: expect.any(String) }),
      );
      expect(auditLog.events).toContainEqual(
        expect.objectContaining({ accountId, eventType: 'account_created' }),
      );
      // Exactly one account_created row — the exchange route does not also
      // write email_verified for its own resolveCustomerAccountAfterSupabaseAuth
      // activation (out of CS-1's scope as written; see this test file's
      // accompanying report).
      expect(auditLog.events.filter((e) => e.eventType === 'account_created')).toHaveLength(1);
    });

    it('writes no account_created row when the account already exists', async () => {
      const auditLog = fakeAuditLogWithEvents();
      const accountId = randomUUID();
      const email = 'exchange-existing-cs1@example.com';
      const accessToken = 'exchange-existing-cs1-token';
      const existing: AccountRow = {
        id: accountId,
        userType: 'customer',
        accountState: 'active',
        email,
        phone: null,
        mfaRequired: false,
        partnerOrganizationId: null,
        invitedBy: null,
        createdAt: new Date(),
      };
      const notUsed = (name: string) => (): never => {
        throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
      };
      const supabase = new Proxy(
        {
          async getUserFromAccessToken(token: string) {
            if (token !== accessToken) return null;
            return { userId: accountId, email, emailConfirmed: true };
          },
          async findVerifiedTotpFactor() {
            return null;
          },
        } as Record<string, unknown>,
        { get: (target, prop: string) => (prop in target ? target[prop] : notUsed(prop)) },
      ) as unknown as SupabaseAdmin;
      const accounts = {
        async findById(id: string): Promise<AccountRow | null> {
          return id === existing.id ? existing : null;
        },
        async createCustomerAccount(): Promise<AccountRow> {
          throw new Error('must not be called — account already exists');
        },
      };
      const ctx = buildMinimalCtx({
        accounts: accounts as unknown as AppContext['accounts'],
        supabase,
        auditLog: auditLog as unknown as AppContext['auditLog'],
      });
      const response = await withServer(ctx, (baseUrl) => post(baseUrl, '/auth/supabase/exchange', { accessToken }));
      expect(response.status).toBe(200);
      expect(auditLog.events.filter((e) => e.eventType === 'account_created')).toEqual([]);
    });
  });

  describe('POST /auth/resend-verification', () => {
    it('writes no new audit event (neither account_created nor email_verified) for a pending account that gets re-mailed', async () => {
      const auditLog = fakeAuditLogWithEvents();
      const account: AccountRow = {
        id: randomUUID(),
        userType: 'customer',
        accountState: 'pending_verification',
        email: 'resend-cs1@example.com',
        phone: null,
        mfaRequired: false,
        partnerOrganizationId: null,
        invitedBy: null,
        createdAt: new Date(),
      };
      const notUsed = (name: string) => (): never => {
        throw new Error(`[test fake] SupabaseAdmin.${name} should not be called in this test`);
      };
      const supabase = new Proxy(
        {
          async sendSignupConfirmationEmail() {
            return undefined;
          },
        } as Record<string, unknown>,
        { get: (target, prop: string) => (prop in target ? target[prop] : notUsed(prop)) },
      ) as unknown as SupabaseAdmin;
      const accounts = {
        async findByEmail(email: string) {
          return email === account.email ? account : null;
        },
      };
      const ctx = buildMinimalCtx({
        accounts: accounts as unknown as AppContext['accounts'],
        supabase,
        auditLog: auditLog as unknown as AppContext['auditLog'],
      });
      const response = await withServer(ctx, (baseUrl) =>
        post(baseUrl, '/auth/resend-verification', { email: account.email, client: 'web' }),
      );
      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        message: 'If this account needs verifying, check your inbox.',
        retryAfterSeconds: expect.any(Number),
      });
      expect(auditLog.events).toEqual([]);
    });
  });
});
