/**
 * GET/PATCH /admin/plans* — RBAC boundary + merge semantics.
 * qa-test-strategy.md §3.2 (Feature 006 Stage 10 gap).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAdminPlansRouter } from './admin-plans.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { PlanCatalogDocument } from '../repositories/plan-catalog.js';

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

function samplePlan(id: string, overrides: Partial<PlanCatalogDocument> = {}): PlanCatalogDocument {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    slug: 'starter',
    name: 'Starter',
    tagline: 'Up to 5 devices',
    maxAssets: 5,
    monthlyAmountCents: 20_000,
    currency: 'ZAR',
    isCustomPricing: false,
    isActive: true,
    sortOrder: 1,
    features: ['Up to 5 registered assets'],
    accountTypes: ['both'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createHarness(opts: { plans?: PlanCatalogDocument[] } = {}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const adminId = randomUUID();
  const customerId = randomUUID();
  const sessionId = randomUUID();
  const stored = new Map<string, PlanCatalogDocument>();
  for (const plan of opts.plans ?? []) {
    stored.set(plan.id, plan);
  }

  const ctx = {
    env,
    kv,
    planCatalog: {
      async listAll() {
        return [...stored.values()];
      },
      async updateById(id: string, patch: Partial<PlanCatalogDocument>) {
        const existing = stored.get(id);
        if (!existing) return null;
        const updated: PlanCatalogDocument = { ...existing, ...patch, updatedAt: new Date('2026-08-13T00:00:00.000Z') };
        stored.set(id, updated);
        return updated;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/api/v1', createAdminPlansRouter(ctx));
  app.use(errorHandler);

  return {
    app,
    adminId,
    customerId,
    sessionId,
    env,
    adminBearer: `Bearer ${adminToken(env, adminId, sessionId)}`,
    customerBearer: `Bearer ${customerToken(env, customerId, sessionId)}`,
    stored,
  };
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/api/v1` });
    });
  });
}

describe('routes/admin-plans', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  describe('GET /admin/plans', () => {
    it('returns 401 when unauthenticated', async () => {
      const { app } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for an authenticated non-admin caller', async () => {
      const { app, customerBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans`, {
        headers: { authorization: customerBearer },
      });
      expect(res.status).toBe(403);
    });

    it('returns the full plan catalog for an admin', async () => {
      const plan = samplePlan('507f1f77bcf86cd799439011');
      const { app, adminBearer } = createHarness({ plans: [plan] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans`, {
        headers: { authorization: adminBearer },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<{ id: string }> };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.id).toBe(plan.id);
    });
  });

  describe('PATCH /admin/plans/:planId', () => {
    it('returns 401 when unauthenticated', async () => {
      const plan = samplePlan('507f1f77bcf86cd799439011');
      const { app } = createHarness({ plans: [plan] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ maxAssets: 8 }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 403 for an authenticated non-admin caller', async () => {
      const plan = samplePlan('507f1f77bcf86cd799439011');
      const { app, customerBearer } = createHarness({ plans: [plan] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { authorization: customerBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ maxAssets: 8 }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 404 for a nonexistent (but valid ObjectId-shaped) plan id', async () => {
      const { app, adminBearer } = createHarness({ plans: [] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans/507f1f77bcf86cd799439099`, {
        method: 'PATCH',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ maxAssets: 8 }),
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for a malformed (non-ObjectId) plan id rather than a 500', async () => {
      const { app, adminBearer } = createHarness({ plans: [] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans/not-a-valid-id`, {
        method: 'PATCH',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ maxAssets: 8 }),
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('applies a partial update without clobbering unspecified fields', async () => {
      const plan = samplePlan('507f1f77bcf86cd799439011', {
        name: 'Starter',
        maxAssets: 5,
        monthlyAmountCents: 20_000,
        features: ['Up to 5 registered assets'],
      });
      const { app, adminBearer, stored } = createHarness({ plans: [plan] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ maxAssets: 8 }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        maxAssets: number;
        name: string;
        monthlyAmountCents: number;
        features: string[];
      };
      expect(body.maxAssets).toBe(8);
      // Unspecified fields survive the merge untouched.
      expect(body.name).toBe('Starter');
      expect(body.monthlyAmountCents).toBe(20_000);
      expect(body.features).toEqual(['Up to 5 registered assets']);
      expect(stored.get(plan.id)?.maxAssets).toBe(8);
    });

    it('updates isActive without touching other fields', async () => {
      const plan = samplePlan('507f1f77bcf86cd799439011', { isActive: true });
      const { app, adminBearer } = createHarness({ plans: [plan] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { isActive: boolean; name: string; maxAssets: number };
      expect(body.isActive).toBe(false);
      expect(body.name).toBe('Starter');
      expect(body.maxAssets).toBe(5);
    });

    it('rejects a malformed body (negative monthlyAmountCents) with VALIDATION_ERROR', async () => {
      const plan = samplePlan('507f1f77bcf86cd799439011');
      const { app, adminBearer } = createHarness({ plans: [plan] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ monthlyAmountCents: -100 }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a malformed body (maxAssets not an integer) with VALIDATION_ERROR', async () => {
      const plan = samplePlan('507f1f77bcf86cd799439011');
      const { app, adminBearer } = createHarness({ plans: [plan] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ maxAssets: 4.5 }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an invalid accountTypes enum value with VALIDATION_ERROR', async () => {
      const plan = samplePlan('507f1f77bcf86cd799439011');
      const { app, adminBearer } = createHarness({ plans: [plan] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ accountTypes: ['nonsense'] }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
