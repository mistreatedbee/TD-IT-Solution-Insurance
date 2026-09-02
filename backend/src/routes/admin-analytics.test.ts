/**
 * GET /admin/analytics/dau — M4 admin DAU read API.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAdminAnalyticsRouter } from './admin-analytics.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { DailyActiveUserRow, ProductEventsRepo } from '../repositories/product-events.js';

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
    locationIngestionEnabled: false,
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

function createHarness(series: DailyActiveUserRow[]) {
  const env = fakeEnv();
  const adminId = randomUUID();
  const sessionId = randomUUID();

  const productEvents: ProductEventsRepo = {
    async record() {
      return { recorded: true, duplicate: false };
    },
    async countDistinctSessionStartsByDay() {
      return series;
    },
    async findById() {
      return null;
    },
  };

  const ctx = {
    env,
    kv: new InMemoryKeyValueStore(),
    productEvents,
  } as unknown as AppContext;

  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/admin/analytics', createAdminAnalyticsRouter(ctx));
  app.use(errorHandler);

  let server: Server | null = null;

  return {
    adminId,
    sessionId,
    async start(): Promise<string> {
      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => resolve());
      });
      const addr = server!.address() as AddressInfo;
      return `http://127.0.0.1:${addr.port}`;
    },
    async stop() {
      await new Promise<void>((resolve, reject) => {
        if (!server) return resolve();
        server.close((err) => (err ? reject(err) : resolve()));
      });
      server = null;
    },
    url(base: string, path: string) {
      return `${base}${path}`;
    },
    authHeaders(token: string) {
      return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
    },
  };
}

describe('GET /admin/analytics/dau', () => {
  let baseUrl = '';
  let harness: ReturnType<typeof createHarness>;

  afterEach(async () => {
    if (harness) await harness.stop();
  });

  it('returns DAU series for admin', async () => {
    harness = createHarness([
      { dayBucket: '2026-08-01', distinctAccounts: 2 },
      { dayBucket: '2026-08-02', distinctAccounts: 5 },
    ]);
    baseUrl = await harness.start();
    const token = adminToken(fakeEnv(), harness.adminId, harness.sessionId);

    const res = await fetch(
      harness.url(baseUrl, '/admin/analytics/dau?from=2026-08-01&to=2026-08-07'),
      { headers: harness.authHeaders(token) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.timezone).toBe('Africa/Johannesburg');
    expect(body.data.event).toBe('session_start');
    expect(body.data.series).toEqual([
      { dayBucket: '2026-08-01', distinctAccounts: 2 },
      { dayBucket: '2026-08-02', distinctAccounts: 5 },
    ]);
  });

  it('rejects non-admin callers', async () => {
    harness = createHarness([]);
    baseUrl = await harness.start();
    const customerToken = signAccessToken(
      {
        sub: randomUUID(),
        user_type: 'customer',
        mfa_required: false,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      fakeEnv().jwtSigningKeys,
      fakeEnv().jwtActiveKid,
    ).token;

    const res = await fetch(
      harness.url(baseUrl, '/admin/analytics/dau?from=2026-08-01&to=2026-08-07'),
      { headers: harness.authHeaders(customerToken) },
    );

    expect(res.status).toBe(403);
  });

  it('validates date range', async () => {
    harness = createHarness([]);
    baseUrl = await harness.start();
    const token = adminToken(fakeEnv(), harness.adminId, harness.sessionId);

    const res = await fetch(
      harness.url(baseUrl, '/admin/analytics/dau?from=2026-08-10&to=2026-08-01'),
      { headers: harness.authHeaders(token) },
    );

    expect(res.status).toBe(400);
  });
});
