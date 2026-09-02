/**
 * Customer `/policies` routes — ownership scoping, idempotency, account gate.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MongoNetworkError } from 'mongodb';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createPoliciesRouter } from './policies.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AccountStatus } from '../repositories/accounts.js';
import type { PolicyDocument } from '../repositories/policies.js';
import type { Env } from '../config/env.js';
import type { IdempotencyRepo } from '../repositories/idempotency.js';
import { essentialPlanFixture, businessPlanFixture } from '../lib/plan-test-fixtures.js';

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

function customerToken(env: Env, accountId: string, sessionId: string, accountState = 'active'): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: 'customer',
      mfa_required: false,
      account_state: accountState,
      partner_organization_id: null,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

function createInMemoryIdempotencyRepo(): IdempotencyRepo {
  const rows = new Map<
    string,
    { accountId: string | null; requestHash: string; responseStatus: number; responseBody: unknown }
  >();
  return {
    // Mirrors repositories/idempotency.ts's real `account_id is not distinct
    // from $3` scoping — a stored row belonging to a different account must
    // never be replayed to this caller (cross-account IDOR guard).
    async find(endpoint, key, accountId) {
      const row = rows.get(`${endpoint}:${key}`);
      if (!row || row.accountId !== (accountId ?? null)) return null;
      return {
        endpoint,
        idempotencyKey: key,
        accountId: row.accountId,
        requestHash: row.requestHash,
        responseStatus: row.responseStatus,
        responseBody: row.responseBody,
        createdAt: new Date(),
      };
    },
    async store(record) {
      if (!rows.has(`${record.endpoint}:${record.idempotencyKey}`)) {
        rows.set(`${record.endpoint}:${record.idempotencyKey}`, {
          accountId: record.accountId,
          requestHash: record.requestHash,
          responseStatus: record.responseStatus,
          responseBody: record.responseBody,
        });
      }
    },
  };
}

function samplePolicy(accountId: string, id = '507f1f77bcf86cd799439011'): PolicyDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id,
    accountId,
    planTier: 'essential',
    planCatalogId: null,
    status: 'pending_activation',
    coverageLimits: [],
    billing: {
      provider: null,
      externalCustomerId: null,
      externalSubscriptionId: null,
      billingStatus: 'not_configured',
      currency: 'ZAR',
      amount: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      nextBillingAt: null,
      cancelAt: null,
    },
    effectiveDate: now,
    renewalDate: null,
    cancelledAt: null,
    legalHold: false,
    createdAt: now,
    updatedAt: now,
  };
}

function createHarness(opts: {
  accountId?: string;
  accountState?: AccountStatus['accountState'];
  policies?: PolicyDocument[];
}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = opts.accountId ?? randomUUID();
  const sessionId = randomUUID();
  const storedPolicies = new Map<string, PolicyDocument>();
  for (const p of opts.policies ?? []) {
    storedPolicies.set(p.id, p);
  }
  const statusHistory: Array<{ policyId: string; accountId: string; toStatus: string }> = [];

  const ctx = {
    env,
    kv,
    accounts: {
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== accountId) return null;
        return {
          id: accountId,
          accountState: opts.accountState ?? 'active',
          mfaRequired: false,
          userType: 'customer',
          partnerOrganizationId: null,
          updatedAt: new Date(),
        };
      },
    },
    policies: {
      async createForAccount(
        acctId: string,
        input: { planTier: string; planCatalogId?: string | null; monthlyAmountCents?: number | null },
      ): Promise<PolicyDocument> {
        const policy = samplePolicy(acctId, '507f1f77bcf86cd799439099');
        policy.planTier = input.planTier;
        policy.planCatalogId = input.planCatalogId ?? null;
        storedPolicies.set(policy.id, policy);
        return policy;
      },
      async listByAccount(acctId: string, limit: number) {
        return [...storedPolicies.values()].filter((p) => p.accountId === acctId).slice(0, limit);
      },
      async findByIdForAccount(acctId: string, policyId: string) {
        const row = storedPolicies.get(policyId);
        return row && row.accountId === acctId ? row : null;
      },
      async updatePlanForAccount(
        acctId: string,
        policyId: string,
        input: { planTier: string; planCatalogId: string; monthlyAmountCents?: number | null },
      ) {
        const row = storedPolicies.get(policyId);
        if (!row || row.accountId !== acctId) return null;
        const updated = {
          ...row,
          planTier: input.planTier,
          planCatalogId: input.planCatalogId,
          billing: {
            ...row.billing,
            amount:
              input.monthlyAmountCents != null && input.monthlyAmountCents > 0
                ? input.monthlyAmountCents / 100
                : null,
          },
          updatedAt: new Date(),
        };
        storedPolicies.set(policyId, updated);
        return updated;
      },
    },
    policyStatusHistory: {
      async recordInitial(input: { policyId: string; accountId: string; toStatus: string }) {
        statusHistory.push(input);
      },
    },
    idempotency: createInMemoryIdempotencyRepo(),
    planCatalog: {
      async findActiveById(id: string) {
        if (id === '507f1f77bcf86cd799439088') {
          return essentialPlanFixture(id);
        }
        if (id === '507f1f77bcf86cd799439087') {
          return businessPlanFixture(id);
        }
        if (id === '507f1f77bcf86cd799439090') {
          return essentialPlanFixture(id, { maxAssets: 5 });
        }
        return null;
      },
    },
    assets: {
      async countActiveByAccount() {
        return 0;
      },
    },
    customerNotifications: {
      async notifyPolicyCreated() {
        return undefined;
      },
      async notifyPolicyPendingActivation() {
        return undefined;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createPoliciesRouter(ctx));
  app.use(errorHandler);

  return { app, accountId, sessionId, env, statusHistory };
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('POST /policies', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('creates a policy for an active account with idempotency', async () => {
    const { app, accountId, sessionId, env, statusHistory } = createHarness({});
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/policies`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ planCatalogId: '507f1f77bcf86cd799439088' }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.planTier).toBe('essential');
    expect(body.status).toBe('pending_activation');
    expect((body.billing as { billingStatus: string }).billingStatus).toBe('not_configured');
    expect(body.coverageLimits).toEqual([]);
    expect(statusHistory).toHaveLength(1);
  });

  it('returns 403 ACCOUNT_NOT_ACTIVE when account is pending_verification', async () => {
    const { app, accountId, sessionId, env } = createHarness({ accountState: 'pending_verification' });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/policies`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId, 'pending_verification')}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ planCatalogId: '507f1f77bcf86cd799439088' }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('returns 403 ACCOUNT_NOT_ACTIVE when account is suspended', async () => {
    const { app, accountId, sessionId, env } = createHarness({ accountState: 'suspended' });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/policies`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId, 'suspended')}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ planCatalogId: '507f1f77bcf86cd799439088' }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('returns 400 when Idempotency-Key header is missing', async () => {
    const { app, accountId, sessionId, env } = createHarness({});
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/policies`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ planCatalogId: '507f1f77bcf86cd799439088' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('returns 503 UPSTREAM_UNAVAILABLE when MongoDB is unreachable (P-12)', async () => {
    const env = fakeEnv();
    const kv = new InMemoryKeyValueStore();
    const accountId = randomUUID();
    const sessionId = randomUUID();
    const ctx = {
      env,
      kv,
      accounts: {
        async getAccountStatus(id: string): Promise<AccountStatus | null> {
          if (id !== accountId) return null;
          return {
            id: accountId,
            accountState: 'active',
            mfaRequired: false,
            userType: 'customer',
            partnerOrganizationId: null,
            updatedAt: new Date(),
          };
        },
      },
      policies: {
        async createForAccount() {
          throw new MongoNetworkError('connection refused');
        },
        async listByAccount() {
          return [];
        },
        async findByIdForAccount() {
          return null;
        },
      },
      policyStatusHistory: {
        async recordInitial() {
          /* noop */
        },
      },
      idempotency: createInMemoryIdempotencyRepo(),
      planCatalog: {
        async findActiveById(id: string) {
          return essentialPlanFixture(id);
        },
      },
      assets: {
        async countActiveByAccount() {
          return 0;
        },
      },
    } as unknown as AppContext;

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use(createPoliciesRouter(ctx));
    app.use(errorHandler);

    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/policies`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ planCatalogId: '507f1f77bcf86cd799439088' }),
    });

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});

describe('GET /policies', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('lists only policies for the authenticated account', async () => {
    const accountId = randomUUID();
    const otherAccount = randomUUID();
    const ownPolicy = samplePolicy(accountId, '507f1f77bcf86cd799439011');
    const otherPolicy = samplePolicy(otherAccount, '507f1f77bcf86cd799439012');
    const { app, sessionId, env } = createHarness({
      accountId,
      policies: [ownPolicy, otherPolicy],
    });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/policies`, {
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Array<{ id: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(ownPolicy.id);
  });
});

describe('GET /policies/:policyId', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('returns 404 when policy belongs to another account', async () => {
    const otherAccount = randomUUID();
    const policy = samplePolicy(otherAccount);
    const { app, accountId, sessionId, env } = createHarness({ policies: [policy] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/policies/${policy.id}`, {
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(404);
  });

  it('returns own policy', async () => {
    const accountId = randomUUID();
    const policy = samplePolicy(accountId);
    const { app, sessionId, env } = createHarness({ accountId, policies: [policy] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/policies/${policy.id}`, {
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string };
    expect(body.id).toBe(policy.id);
  });
});

describe('PATCH /policies/:policyId/plan', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('changes plan when downgrade is allowed', async () => {
    const accountId = randomUUID();
    const policy = samplePolicy(accountId);
    policy.planCatalogId = '507f1f77bcf86cd799439088';
    const { app, sessionId, env } = createHarness({ accountId, policies: [policy] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/policies/${policy.id}/plan`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ planCatalogId: '507f1f77bcf86cd799439088' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { planTier: string };
    expect(body.planTier).toBe('essential');
  });

  it('returns PLAN_REQUIRES_QUOTE for business/custom plan', async () => {
    const accountId = randomUUID();
    const policy = samplePolicy(accountId);
    const { app, sessionId, env } = createHarness({ accountId, policies: [policy] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/policies/${policy.id}/plan`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ planCatalogId: '507f1f77bcf86cd799439087' }),
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('PLAN_REQUIRES_QUOTE');
  });
});
