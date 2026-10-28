/**
 * SR-018-9 regression test.
 *
 * `claims.ts` / `admin-claims.ts` register their `CLAIMS_API_ENABLED` kill
 * switch as a path-less `router.use(...)`. Both routers are mounted at the
 * v1 root with no path prefix (see `index.ts`). In Express, a path-less
 * `router.use` on a root-mounted router runs for EVERY request that reaches
 * that router instance — not just the routes it itself defines. With the
 * switch off, that silently 404'd every router mounted AFTER claims in
 * index.ts's real mount order: `/analytics`, `/admin/analytics`, `/support`,
 * `/support-cases*`.
 *
 * This file builds a single Express app mounting the routers in the exact
 * relative order `index.ts` uses, starting from `createClaimsRouter` through
 * `createSupportCasesRouter` (a faithful extraction of that tail segment —
 * routers mounted *before* claims in the real app are irrelevant to this
 * bug, since Express middleware ordering only matters relative to the
 * routers that come after the offending `router.use`). With
 * `claimsApiEnabled: false` it asserts:
 *   (a) every claims route is still correctly gated to 404, and
 *   (b) at least one route on each router mounted after claims is
 *       reachable again (i.e. does NOT get the claims kill-switch 404).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createClaimsRouter } from './claims.js';
import { createAdminClaimsRouter } from './admin-claims.js';
import { createAnalyticsRouter } from './analytics.js';
import { createAdminAnalyticsRouter } from './admin-analytics.js';
import { createSupportLookupRouter } from './support-lookup.js';
import { createSupportCasesRouter } from './support-cases.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';

function fakeEnv(overrides?: Partial<Env>): Env {
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
    locationIngestionEnabled: false,
    claimsApiEnabled: false,
    ...overrides,
  } as unknown as Env;
}

/**
 * None of the five routers under test touch `ctx` fields other than
 * `env`/`kv` at *construction* time — every other `ctx.*` access happens
 * inside a route handler, downstream of that handler's own `authenticate`
 * middleware. Every request this test fires is either unauthenticated or
 * carries no valid session, so it will never get far enough to need the
 * rest of a real `AppContext`. This stub intentionally throws if anything
 * unexpected does reach one of those methods, to fail loudly rather than
 * silently returning undefined and masking a real bug.
 */
function unreachable(label: string) {
  return () => {
    throw new Error(`unexpected ctx access in SR-018-9 regression test: ${label}`);
  };
}

function buildApp(env: Env): Express {
  const kv = new InMemoryKeyValueStore();
  const ctx = {
    env,
    kv,
    idempotency: { find: unreachable('idempotency.find'), store: unreachable('idempotency.store') },
    accounts: new Proxy({}, { get: () => unreachable('accounts.*') }),
    assets: new Proxy({}, { get: () => unreachable('assets.*') }),
    policies: new Proxy({}, { get: () => unreachable('policies.*') }),
    recoveryCases: new Proxy({}, { get: () => unreachable('recoveryCases.*') }),
    claims: new Proxy({}, { get: () => unreachable('claims.*') }),
    supportCases: new Proxy({}, { get: () => unreachable('supportCases.*') }),
    auditLog: new Proxy({}, { get: () => unreachable('auditLog.*') }),
    notificationPreferences: new Proxy({}, { get: () => unreachable('notificationPreferences.*') }),
    productEvents: new Proxy({}, { get: () => unreachable('productEvents.*') }),
  } as unknown as AppContext;

  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);

  // This is the load-bearing part of the test: the exact relative mount
  // order index.ts uses for this tail segment.
  app.use(createClaimsRouter(ctx));
  app.use(createAdminClaimsRouter(ctx));
  app.use('/analytics', createAnalyticsRouter(ctx));
  app.use('/admin/analytics', createAdminAnalyticsRouter(ctx));
  app.use('/support', createSupportLookupRouter(ctx));
  app.use(createSupportCasesRouter(ctx));

  app.use(errorHandler);
  return app;
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

let activeServer: Server | undefined;
afterEach(async () => {
  if (activeServer) {
    await new Promise((resolve) => activeServer!.close(resolve));
    activeServer = undefined;
  }
});

describe('SR-018-9: claims kill switch must not shadow routers mounted after it', () => {
  it('still 404s every claims/admin-claims route while CLAIMS_API_ENABLED is off', async () => {
    const app = buildApp(fakeEnv());
    const listened = await listen(app);
    activeServer = listened.server;

    const claimsRes = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({}),
    });
    expect(claimsRes.status).toBe(404);

    const adminClaimsRes = await fetch(`${listened.baseUrl}/admin/claims`);
    expect(adminClaimsRes.status).toBe(404);
  });

  it('leaves /analytics reachable (past the claims gate) while CLAIMS_API_ENABLED is off', async () => {
    const app = buildApp(fakeEnv());
    const listened = await listen(app);
    activeServer = listened.server;

    const res = await fetch(`${listened.baseUrl}/analytics/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Reachable: whatever this router itself returns for an unauthenticated/
    // malformed request (4xx from its own validation/auth), never the
    // claims-router's blanket kill-switch 404.
    expect(res.status).not.toBe(404);
  });

  it('leaves /admin/analytics reachable (past the claims gate) while CLAIMS_API_ENABLED is off', async () => {
    const app = buildApp(fakeEnv());
    const listened = await listen(app);
    activeServer = listened.server;

    const res = await fetch(`${listened.baseUrl}/admin/analytics/dau?from=2026-01-01&to=2026-01-02`);
    expect(res.status).not.toBe(404);
  });

  it('leaves /support/* reachable (past the claims gate) while CLAIMS_API_ENABLED is off', async () => {
    const app = buildApp(fakeEnv());
    const listened = await listen(app);
    activeServer = listened.server;

    const res = await fetch(`${listened.baseUrl}/support/customer-lookup?email=a@example.com`);
    expect(res.status).not.toBe(404);
  });

  it('leaves /support-cases* reachable (past the claims gate) while CLAIMS_API_ENABLED is off', async () => {
    const app = buildApp(fakeEnv());
    const listened = await listen(app);
    activeServer = listened.server;

    const res = await fetch(`${listened.baseUrl}/support-cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).not.toBe(404);
  });
});
