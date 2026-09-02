/**
 * GET /plans and GET /plans/catalog — customer plan catalog.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createPlansRouter } from './plans.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { PlanCatalogDocument } from '../repositories/plan-catalog.js';
import { essentialPlanFixture, plusPlanFixture, proPlanFixture, businessPlanFixture } from '../lib/plan-test-fixtures.js';
import { PLAN_CATALOG_DEFAULTS } from '../lib/plan-catalog-defaults.js';

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

const samplePlans: PlanCatalogDocument[] = [
  essentialPlanFixture('507f1f77bcf86cd799439011'),
  plusPlanFixture('507f1f77bcf86cd799439012'),
  proPlanFixture('507f1f77bcf86cd799439013'),
  businessPlanFixture('507f1f77bcf86cd799439014'),
];

function buildApp(planCatalog: AppContext['planCatalog']): Express {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  const ctx = {
    env,
    kv,
    planCatalog,
  } as unknown as AppContext;
  app.use('/api/v1', createPlansRouter(ctx));
  app.use(errorHandler);
  return app;
}

async function withServer(app: Express, fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}/api/v1`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe('plans routes', () => {
  const planCatalog = {
    async listActive() {
      return samplePlans;
    },
  };

  afterEach(() => {
    /* no-op */
  });

  it('GET /plans/catalog returns four active tiers with v2 pricing', async () => {
    const app = buildApp(planCatalog as AppContext['planCatalog']);
    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/plans/catalog`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: Array<{
          slug: string;
          name: string;
          monthlyAmountCents: number | null;
          isCustomPricing: boolean;
          maxAssets: number | null;
        }>;
      };
      expect(body.data).toHaveLength(4);
      expect(body.data.map((p) => p.slug)).toEqual(['essential', 'plus', 'pro', 'business']);
      expect(body.data.map((p) => p.monthlyAmountCents)).toEqual([19_900, 39_900, 69_900, null]);
      expect(body.data[0]?.name).toBe('Essential');
      expect(body.data[0]?.maxAssets).toBe(PLAN_CATALOG_DEFAULTS[0]!.maxAssets);
      expect(body.data[3]?.isCustomPricing).toBe(true);
    });
  });

  it('GET /plans requires authentication', async () => {
    const app = buildApp(planCatalog as AppContext['planCatalog']);
    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/plans`);
      expect(res.status).toBe(401);
    });
  });

  it('GET /plans returns active plans for authenticated customers', async () => {
    const app = buildApp(planCatalog as AppContext['planCatalog']);
    const env = fakeEnv();
    const token = signAccessToken(
      {
        sub: 'acc-1',
        user_type: 'customer',
        mfa_required: false,
        account_state: 'active',
        partner_organization_id: null,
        session_id: 'sess-1',
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: unknown[] };
      expect(body.data).toHaveLength(4);
    });
  });
});
