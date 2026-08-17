/**
 * GET/PATCH /v1/admin/accounts* — RBAC, pagination, state mutation, and ADR-0006 AUD-3(b) bulk audit.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAdminAccountsRouter } from './admin-accounts.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import {
  InvalidAccountStateTransitionError,
  isAllowedAdminAccountStateTransition,
  type AdminAccountDetail,
  type AdminAccountSummary,
  type AdminAccountListFilters,
  type AccountRow,
  type AccountState,
  type AccountStatus,
  type AdminSettableAccountState,
  type UserType,
} from '../repositories/accounts.js';
import type { AuditEventInput, BulkDisclosureInput } from '../repositories/audit-log.js';
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

function adminToken(env: Env, accountId: string, sessionId: string): string {
  return signAccessToken(
    {
      sub: accountId,
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

function createHarness(opts: {
  listRows?: AdminAccountSummary[];
  detailRow?: AdminAccountDetail | null;
}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const adminId = randomUUID();
  const sessionId = randomUUID();
  const bulkCalls: BulkDisclosureInput[] = [];
  const recordCalls: AuditEventInput[] = [];

  const defaultSummary: AdminAccountSummary = {
    id: randomUUID(),
    email: 'customer@example.com',
    userType: 'customer',
    accountState: 'active',
    partnerOrganizationId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const listRows = opts.listRows ?? [defaultSummary];
  const detailRow = opts.detailRow ?? {
    ...defaultSummary,
    phone: null,
    mfaRequired: false,
    invitedBy: null,
    suspendedAt: null,
    deactivatedAt: null,
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  const stubAccount: AccountRow = {
    id: adminId,
    userType: 'admin',
    accountState: 'active',
    email: 'admin@example.com',
    phone: null,
    mfaRequired: true,
    partnerOrganizationId: null,
    invitedBy: null,
    createdAt: new Date(),
  };

  const ctx = {
    env,
    kv,
    accounts: {
      async createCustomerAccount(): Promise<AccountRow> {
        throw new Error('not used');
      },
      async createPrivilegedAccountFromInvitation(): Promise<AccountRow> {
        throw new Error('not used');
      },
      async findById(id: string): Promise<AccountRow | null> {
        return id === adminId ? stubAccount : null;
      },
      async findByEmail(): Promise<AccountRow | null> {
        return null;
      },
      async markEmailVerified(): Promise<void> {
        throw new Error('not used');
      },
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== adminId) return null;
        return {
          id: adminId,
          accountState: 'active',
          mfaRequired: true,
          userType: 'admin',
          partnerOrganizationId: null,
          updatedAt: new Date(),
        };
      },
      async listForAdmin(_filters: AdminAccountListFilters, limit: number): Promise<AdminAccountSummary[]> {
        return listRows.slice(0, limit);
      },
      async findByIdForAdminDetail(id: string): Promise<AdminAccountDetail | null> {
        return detailRow && detailRow.id === id ? detailRow : null;
      },
    },
    auditLog: {
      async record(event: AuditEventInput): Promise<void> {
        recordCalls.push(event);
      },
      async recordBulkDisclosure(input: BulkDisclosureInput): Promise<void> {
        bulkCalls.push(input);
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAdminAccountsRouter(ctx));
  app.use(errorHandler);

  let server: Server | undefined;
  let baseUrl = '';

  return {
    adminId,
    sessionId,
    bulkCalls,
    recordCalls,
    token: adminToken(env, adminId, sessionId),
    async start() {
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const addr = server!.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    },
    async stop() {
      await new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    url(path: string) {
      return `${baseUrl}${path}`;
    },
  };
}

describe('routes/admin-accounts', () => {
  let harness: ReturnType<typeof createHarness>;

  afterEach(async () => {
    if (harness) await harness.stop();
  });

  it('returns 403 for non-admin callers', async () => {
    const env = fakeEnv();
    const customerId = randomUUID();
    const token = signAccessToken(
      {
        sub: customerId,
        user_type: 'customer',
        mfa_required: false,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    harness = createHarness({});
    await harness.start();
    const res = await fetch(harness.url('/admin/accounts'), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('list call records bulk disclosure per ADR-0006 R-1', async () => {
    const subjectA = randomUUID();
    const subjectB = randomUUID();
    harness = createHarness({
      listRows: [
        {
          id: subjectA,
          email: 'a@example.com',
          userType: 'customer',
          accountState: 'active',
          partnerOrganizationId: null,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        },
        {
          id: subjectB,
          email: 'b@example.com',
          userType: 'customer',
          accountState: 'active',
          partnerOrganizationId: null,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
        },
      ],
    });
    await harness.start();

    const res = await fetch(harness.url('/admin/accounts?limit=50'), {
      headers: { authorization: `Bearer ${harness.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(2);

    expect(harness.bulkCalls).toHaveLength(1);
    expect([...harness.bulkCalls[0]!.disclosedAccountIds].sort()).toEqual([subjectA, subjectB].sort());
    expect(harness.bulkCalls[0]?.actorAccountId).toBe(harness.adminId);
    expect(harness.bulkCalls[0]?.actorSessionId).toBe(harness.sessionId);
  });

  it('empty list still records bulk disclosure with zero subjects', async () => {
    harness = createHarness({ listRows: [] });
    await harness.start();

    const res = await fetch(harness.url('/admin/accounts'), {
      headers: { authorization: `Bearer ${harness.token}` },
    });
    expect(res.status).toBe(200);
    expect(harness.bulkCalls).toHaveLength(1);
    expect(harness.bulkCalls[0]?.disclosedAccountIds).toEqual([]);
  });

  it('detail call records privileged_data_access for the subject viewed', async () => {
    const subjectId = randomUUID();
    harness = createHarness({
      detailRow: {
        id: subjectId,
        email: 'viewed@example.com',
        phone: '+27123456789',
        userType: 'customer',
        accountState: 'active',
        mfaRequired: false,
        partnerOrganizationId: null,
        invitedBy: null,
        suspendedAt: null,
        deactivatedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    });
    await harness.start();

    const res = await fetch(harness.url(`/admin/accounts/${subjectId}`), {
      headers: { authorization: `Bearer ${harness.token}` },
    });
    expect(res.status).toBe(200);
    expect(harness.recordCalls).toHaveLength(1);
    expect(harness.recordCalls[0]?.accountId).toBe(subjectId);
    expect(harness.recordCalls[0]?.eventType).toBe('privileged_data_access');
    expect(harness.recordCalls[0]?.actorAccountId).toBe(harness.adminId);
  });
});

function makeDetail(input: {
  id: string;
  email: string;
  userType: UserType;
  accountState: AccountState;
  suspendedAt?: Date | null;
  deactivatedAt?: Date | null;
}): AdminAccountDetail {
  return {
    id: input.id,
    email: input.email,
    phone: null,
    userType: input.userType,
    accountState: input.accountState,
    mfaRequired: false,
    partnerOrganizationId: null,
    invitedBy: null,
    suspendedAt: input.suspendedAt ?? null,
    deactivatedAt: input.deactivatedAt ?? null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

function createStateHarness(initialAccounts: AdminAccountDetail[]) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const adminId = randomUUID();
  const sessionId = randomUUID();
  const accounts = new Map(initialAccounts.map((a) => [a.id, { ...a }]));

  const revokeAllForAccountCalls: Array<{ accountId: string; reason: string }> = [];
  const disableAllForAccountCalls: string[] = [];
  const recordCalls: AuditEventInput[] = [];

  const stubAdmin: AccountRow = {
    id: adminId,
    userType: 'admin',
    accountState: 'active',
    email: 'admin@example.com',
    phone: null,
    mfaRequired: true,
    partnerOrganizationId: null,
    invitedBy: null,
    createdAt: new Date(),
  };

  const ctx = {
    env,
    kv,
    pool: {} as AppContext['pool'],
    sessions: {
      async revokeAllForAccount(accountId: string, reason: string) {
        revokeAllForAccountCalls.push({ accountId, reason });
        return [`session-${accountId}`];
      },
    },
    pushTokens: {
      async disableAllForAccount(accountId: string) {
        disableAllForAccountCalls.push(accountId);
        return 1;
      },
    },
    accounts: {
      async createCustomerAccount(): Promise<AccountRow> {
        throw new Error('not used');
      },
      async createPrivilegedAccountFromInvitation(): Promise<AccountRow> {
        throw new Error('not used');
      },
      async findById(id: string): Promise<AccountRow | null> {
        return id === adminId ? stubAdmin : null;
      },
      async findByEmail(): Promise<AccountRow | null> {
        return null;
      },
      async markEmailVerified(): Promise<void> {
        throw new Error('not used');
      },
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== adminId) return null;
        return {
          id: adminId,
          accountState: 'active',
          mfaRequired: true,
          userType: 'admin',
          partnerOrganizationId: null,
          updatedAt: new Date(),
        };
      },
      async listForAdmin(): Promise<AdminAccountSummary[]> {
        return [];
      },
      async findByIdForAdminDetail(id: string): Promise<AdminAccountDetail | null> {
        const row = accounts.get(id);
        return row ? { ...row } : null;
      },
      async transitionAccountState(input: {
        accountId: string;
        toState: AdminSettableAccountState;
        reason?: string | null;
        actorAccountId: string;
      }) {
        const current = accounts.get(input.accountId);
        if (!current) return null;
        if (!isAllowedAdminAccountStateTransition(current.accountState, input.toState)) {
          throw new InvalidAccountStateTransitionError(current.accountState, input.toState);
        }
        const updated = {
          ...current,
          accountState: input.toState,
          suspendedAt:
            input.toState === 'suspended'
              ? new Date()
              : input.toState === 'active'
                ? null
                : current.suspendedAt,
          deactivatedAt:
            input.toState === 'deactivated'
              ? new Date()
              : input.toState === 'active'
                ? null
                : current.deactivatedAt,
          updatedAt: new Date(),
        };
        accounts.set(input.accountId, updated);
        expect(input.actorAccountId).toBe(adminId);
        return { ...updated };
      },
    },
    auditLog: {
      async record(event: AuditEventInput): Promise<void> {
        recordCalls.push(event);
      },
      async recordBulkDisclosure(_input: BulkDisclosureInput): Promise<void> {
        throw new Error('not used');
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAdminAccountsRouter(ctx));
  app.use(errorHandler);

  let server: Server | undefined;
  let baseUrl = '';

  return {
    adminId,
    sessionId,
    accounts,
    revokeAllForAccountCalls,
    disableAllForAccountCalls,
    recordCalls,
    token: adminToken(env, adminId, sessionId),
    async start() {
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const addr = server!.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    },
    async stop() {
      await new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    url(path: string) {
      return `${baseUrl}${path}`;
    },
    async patchState(subjectId: string, body: { accountState: AdminSettableAccountState; reason?: string }) {
      return fetch(this.url(`/admin/accounts/${subjectId}/state`), {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    },
  };
}

describe('PATCH /admin/accounts/:id/state', () => {
  let harness: ReturnType<typeof createStateHarness>;

  afterEach(async () => {
    if (harness) await harness.stop();
  });

  it('admin can suspend customer — state changes, sessions revoked, push tokens disabled', async () => {
    const customerId = randomUUID();
    harness = createStateHarness([
      makeDetail({
        id: customerId,
        email: 'customer@example.com',
        userType: 'customer',
        accountState: 'active',
      }),
    ]);
    await harness.start();

    const res = await harness.patchState(customerId, { accountState: 'suspended', reason: 'fraud review' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminAccountDetail;
    expect(body.accountState).toBe('suspended');
    expect(body.suspendedAt).not.toBeNull();
    expect(harness.accounts.get(customerId)?.accountState).toBe('suspended');
    expect(harness.revokeAllForAccountCalls).toEqual([{ accountId: customerId, reason: 'admin_forced' }]);
    expect(harness.disableAllForAccountCalls).toEqual([customerId]);
    expect(harness.recordCalls).toHaveLength(1);
    expect(harness.recordCalls[0]?.eventType).toBe('privileged_data_access');
    expect(harness.recordCalls[0]?.accountId).toBe(customerId);
  });

  it('admin can deactivate a suspended customer', async () => {
    const customerId = randomUUID();
    harness = createStateHarness([
      makeDetail({
        id: customerId,
        email: 'customer@example.com',
        userType: 'customer',
        accountState: 'suspended',
        suspendedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ]);
    await harness.start();

    const res = await harness.patchState(customerId, { accountState: 'deactivated' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminAccountDetail;
    expect(body.accountState).toBe('deactivated');
    expect(body.deactivatedAt).not.toBeNull();
    expect(harness.revokeAllForAccountCalls).toHaveLength(1);
    expect(harness.disableAllForAccountCalls).toEqual([customerId]);
  });

  it('admin can reactivate suspended customer — active, suspended_at cleared, no push side effects', async () => {
    const customerId = randomUUID();
    harness = createStateHarness([
      makeDetail({
        id: customerId,
        email: 'customer@example.com',
        userType: 'customer',
        accountState: 'suspended',
        suspendedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ]);
    await harness.start();

    const res = await harness.patchState(customerId, { accountState: 'active' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminAccountDetail;
    expect(body.accountState).toBe('active');
    expect(body.suspendedAt).toBeNull();
    expect(harness.revokeAllForAccountCalls).toHaveLength(0);
    expect(harness.disableAllForAccountCalls).toHaveLength(0);
  });

  it('cannot deactivate self or another admin account', async () => {
    const otherAdminId = randomUUID();
    harness = createStateHarness([
      makeDetail({
        id: otherAdminId,
        email: 'other-admin@example.com',
        userType: 'admin',
        accountState: 'active',
      }),
    ]);
    await harness.start();

    const selfRes = await harness.patchState(harness.adminId, { accountState: 'deactivated' });
    expect(selfRes.status).toBe(403);

    const otherRes = await harness.patchState(otherAdminId, { accountState: 'suspended' });
    expect(otherRes.status).toBe(403);
  });

  it('invalid transition returns 409 CONFLICT', async () => {
    const customerId = randomUUID();
    harness = createStateHarness([
      makeDetail({
        id: customerId,
        email: 'customer@example.com',
        userType: 'customer',
        accountState: 'deactivated',
        deactivatedAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ]);
    await harness.start();

    const res = await harness.patchState(customerId, { accountState: 'active' });
    expect(res.status).toBe(409);
  });

  it('non-admin gets 403', async () => {
    const customerId = randomUUID();
    harness = createStateHarness([
      makeDetail({
        id: customerId,
        email: 'customer@example.com',
        userType: 'customer',
        accountState: 'active',
      }),
    ]);
    await harness.start();

    const env = fakeEnv();
    const token = signAccessToken(
      {
        sub: customerId,
        user_type: 'customer',
        mfa_required: false,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    const res = await fetch(harness.url(`/admin/accounts/${customerId}/state`), {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accountState: 'suspended' }),
    });
    expect(res.status).toBe(403);
  });
});
