/**
 * GET /subscription — customer plan snapshot with usage and entitlements.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createSubscriptionRouter } from './subscription.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { PolicyDocument } from '../repositories/policies.js';
import type { Env } from '../config/env.js';
import { essentialPlanFixture, plusPlanFixture } from '../lib/plan-test-fixtures.js';

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

function customerToken(env: Env, accountId: string, sessionId: string): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: 'customer',
      mfa_required: false,
      account_state: 'active',
      partner_organization_id: null,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

function samplePolicy(accountId: string, planCatalogId: string | null): PolicyDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439011',
    accountId,
    planTier: 'essential',
    planCatalogId,
    status: 'active',
    coverageLimits: [],
    billing: {
      provider: null,
      externalCustomerId: null,
      externalSubscriptionId: null,
      billingStatus: 'not_configured',
      currency: 'ZAR',
      amount: 199,
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

const ESSENTIAL_PLAN_ID = '507f1f77bcf86cd799439088';
const PLUS_PLAN_ID = '507f1f77bcf86cd799439089';

function createHarness(opts: { accountId?: string; policy?: PolicyDocument | null; activeAssetCount?: number }) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = opts.accountId ?? randomUUID();
  const sessionId = randomUUID();
  const policy =
    opts.policy !== undefined ? opts.policy : samplePolicy(accountId, ESSENTIAL_PLAN_ID);

  const ctx = {
    env,
    kv,
    policies: {
      async listByAccount(acctId: string, limit: number) {
        if (!policy || policy.accountId !== acctId) return [];
        return [policy].slice(0, limit);
      },
    },
    planCatalog: {
      async findById(id: string) {
        if (id === ESSENTIAL_PLAN_ID) return essentialPlanFixture(id);
        if (id === PLUS_PLAN_ID) return plusPlanFixture(id);
        return null;
      },
    },
    assets: {
      async countActiveByAccount() {
        return opts.activeAssetCount ?? 2;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createSubscriptionRouter(ctx));
  app.use(errorHandler);

  return { app, accountId, sessionId, env };
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('GET /subscription', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('returns plan snapshot with usage and entitlements', async () => {
    const { app, accountId, sessionId, env } = createHarness({ activeAssetCount: 3 });
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/subscription`, {
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        planSlug: string;
        planName: string;
        positioning: string;
        maxAssets: number;
        maxUsers: number;
        activeAssetCount: number;
        assetUsageLabel: string;
        entitlements: { incidentManagement: boolean; locationHistory: boolean };
      };
    };
    expect(body.data).toMatchObject({
      planSlug: 'essential',
      planName: 'Essential',
      maxAssets: 5,
      activeAssetCount: 3,
      assetUsageLabel: '3 / 5 assets',
    });
    expect(body.data.positioning).toBeTruthy();
    expect(body.data.entitlements.incidentManagement).toBe(false);
    expect(body.data.entitlements.locationHistory).toBe(false);
  });

  it('returns 404 when the customer has no policy', async () => {
    const accountId = randomUUID();
    const { app, sessionId, env } = createHarness({ accountId, policy: null });
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/subscription`, {
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(res.status).toBe(404);
  });
});
