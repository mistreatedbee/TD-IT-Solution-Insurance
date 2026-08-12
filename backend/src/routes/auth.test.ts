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
  const store = new Map<string, { requestHash: string; responseStatus: number; responseBody: unknown }>();
  return {
    async find(endpoint: string, key: string) {
      return store.get(`${endpoint}::${key}`) ?? null;
    },
    async store(input: {
      endpoint: string;
      idempotencyKey: string;
      accountId: string | null;
      requestHash: string;
      responseStatus: number;
      responseBody: unknown;
    }) {
      store.set(`${input.endpoint}::${input.idempotencyKey}`, {
        requestHash: input.requestHash,
        responseStatus: input.responseStatus,
        responseBody: input.responseBody,
      });
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
