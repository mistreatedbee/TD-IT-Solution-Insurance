/**
 * `GET /account/me` — `mfaEnrolled` regression coverage.
 *
 * api-design.md's `Account` schema declares `mfaEnrolled`, but the handler
 * never set it (always `undefined` on the wire). This test fails against
 * the pre-fix handler (the response body has no `mfaEnrolled` key at all)
 * and asserts the fixed handler reuses the same
 * `mintTransientUserAccessToken` + `findVerifiedTotpFactor` check
 * `routes/mfa.ts`'s authenticated opt-in path already uses, rather than a
 * second, possibly-diverging mechanism.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createSessionRouter } from './session.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import { SupabaseUnavailableError } from '../db/supabase.js';
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

const TEST_EMAIL = 'customer@example.com';
const TEST_ACCESS_TOKEN = 'gotrue-transient-token-stand-in';

function createFakeAccountsRepo(seed: {
  id: string;
  email: string;
  userType: UserType;
  accountState: AccountState;
  mfaRequired: boolean;
  partnerOrganizationId: string | null;
}) {
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

function createFakeSupabaseAdmin(opts: { hasVerifiedFactor: boolean; unavailable?: boolean }): SupabaseAdmin {
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
    async findVerifiedTotpFactor(userAccessToken) {
      if (opts.unavailable) {
        throw new SupabaseUnavailableError('simulated outage');
      }
      if (userAccessToken !== TEST_ACCESS_TOKEN) {
        throw new Error('[test fake] findVerifiedTotpFactor called with unexpected token');
      }
      return opts.hasVerifiedFactor ? { factorId: randomUUID() } : null;
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
    async mintTransientUserAccessToken(email) {
      if (opts.unavailable) {
        throw new SupabaseUnavailableError('simulated outage');
      }
      if (email.trim().toLowerCase() !== TEST_EMAIL) {
        throw new Error('[test fake] mintTransientUserAccessToken called with unexpected email');
      }
      return TEST_ACCESS_TOKEN;
    },
  };
}

async function startTestServer(ctx: AppContext): Promise<{ baseUrl: string; server: Server; app: Express }> {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createSessionRouter(ctx));
  app.use(errorHandler);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, server, app };
}

function buildCtx(supabase: SupabaseAdmin, accountId: string): AppContext {
  const env = fakeEnv();
  return {
    env,
    pool: undefined as unknown as AppContext['pool'],
    kv: new InMemoryKeyValueStore(),
    supabase,
    accounts: createFakeAccountsRepo({
      id: accountId,
      email: TEST_EMAIL,
      userType: 'customer',
      accountState: 'active',
      mfaRequired: false,
      partnerOrganizationId: null,
    }) as unknown as AppContext['accounts'],
    invitations: undefined as unknown as AppContext['invitations'],
    sessions: undefined as unknown as AppContext['sessions'],
    enrollmentTickets: undefined as unknown as AppContext['enrollmentTickets'],
    resetMfaTokens: undefined as unknown as AppContext['resetMfaTokens'],
    auditLog: undefined as unknown as AppContext['auditLog'],
    idempotency: undefined as unknown as AppContext['idempotency'],
    policies: undefined as unknown as AppContext['policies'],
    assets: undefined as unknown as AppContext['assets'],
    policyStatusHistory: undefined as unknown as AppContext['policyStatusHistory'],
  };
}

function bearerFor(ctx: AppContext, accountId: string): string {
  const { token } = signAccessToken(
    {
      sub: accountId,
      user_type: 'customer',
      mfa_required: false,
      account_state: 'active',
      partner_organization_id: null,
      session_id: randomUUID(),
    },
    ctx.env.jwtSigningKeys,
    ctx.env.jwtActiveKid,
  );
  return token;
}

describe('GET /account/me — mfaEnrolled', () => {
  const accountId = randomUUID();
  let server: Server;
  let baseUrl: string;

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('is true when the account has a verified TOTP factor', async () => {
    const ctx = buildCtx(createFakeSupabaseAdmin({ hasVerifiedFactor: true }), accountId);
    const started = await startTestServer(ctx);
    server = started.server;
    baseUrl = started.baseUrl;

    const response = await fetch(`${baseUrl}/account/me`, {
      headers: { authorization: `Bearer ${bearerFor(ctx, accountId)}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { mfaEnrolled: boolean };
    expect(body.mfaEnrolled).toBe(true);
  });

  it('is false when the account has no verified TOTP factor', async () => {
    const ctx = buildCtx(createFakeSupabaseAdmin({ hasVerifiedFactor: false }), accountId);
    const started = await startTestServer(ctx);
    server = started.server;
    baseUrl = started.baseUrl;

    const response = await fetch(`${baseUrl}/account/me`, {
      headers: { authorization: `Bearer ${bearerFor(ctx, accountId)}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { mfaEnrolled: boolean };
    expect(body.mfaEnrolled).toBe(false);
  });

  it('surfaces UPSTREAM_UNAVAILABLE (503) rather than a raw error when Supabase is unreachable', async () => {
    const ctx = buildCtx(createFakeSupabaseAdmin({ hasVerifiedFactor: false, unavailable: true }), accountId);
    const started = await startTestServer(ctx);
    server = started.server;
    baseUrl = started.baseUrl;

    const response = await fetch(`${baseUrl}/account/me`, {
      headers: { authorization: `Bearer ${bearerFor(ctx, accountId)}` },
    });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});
