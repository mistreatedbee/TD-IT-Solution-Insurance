/**
 * POST /analytics/events — M4 session_start ingestion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAnalyticsRouter } from './analytics.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { ProductEventsRepo } from '../repositories/product-events.js';

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

function createInMemoryProductEventsRepo(): ProductEventsRepo {
  const rows: Array<{
    accountId: string;
    eventName: string;
    surface: string;
    dayBucket: string;
  }> = [];

  return {
    async record(input) {
      if (input.eventName === 'session_start') {
        const dup = rows.some(
          (row) =>
            row.accountId === input.accountId &&
            row.eventName === 'session_start' &&
            row.dayBucket === input.dayBucket,
        );
        if (dup) return { recorded: false, duplicate: true };
      }
      rows.push({
        accountId: input.accountId,
        eventName: input.eventName,
        surface: input.surface,
        dayBucket: input.dayBucket,
      });
      return { recorded: true, duplicate: false };
    },
    async countDistinctSessionStartsByDay() {
      return [];
    },
    async findById() {
      return null;
    },
  };
}

function createHarness(productEvents: ProductEventsRepo) {
  const env = fakeEnv();
  const ctx = {
    env,
    kv: new InMemoryKeyValueStore(),
    accounts: {
      async getAccountStatus(id: string) {
        return id
          ? {
              id,
              accountState: 'active' as const,
              mfaRequired: false,
              userType: 'customer' as const,
              partnerOrganizationId: null,
              updatedAt: new Date(),
            }
          : null;
      },
    },
    productEvents,
  } as unknown as AppContext;

  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/v1/analytics', createAnalyticsRouter(ctx));
  app.use(errorHandler);

  return { app, env };
}

async function withServer(
  app: Express,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s));
    s.on('error', reject);
  });
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe('POST /analytics/events', () => {
  const accountId = randomUUID();

  afterEach(() => {
    // no shared state
  });

  it('records session_start for an active customer', async () => {
    const productEvents = createInMemoryProductEventsRepo();
    const { app, env } = createHarness(productEvents);
    const token = signAccessToken(
      {
        sub: accountId,
        user_type: 'customer',
        mfa_required: false,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/analytics/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: [{ eventName: 'session_start', surface: 'mobile' }],
        }),
      });
      expect(res.status).toBe(202);
      const body = (await res.json()) as { data: { results: Array<{ recorded: boolean }> } };
      expect(body.data.results[0]?.recorded).toBe(true);
    });
  });

  it('dedupes session_start within the same day bucket', async () => {
    const productEvents = createInMemoryProductEventsRepo();
    const { app, env } = createHarness(productEvents);
    const token = signAccessToken(
      {
        sub: accountId,
        user_type: 'customer',
        mfa_required: false,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    await withServer(app, async (baseUrl) => {
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const payload = JSON.stringify({
        events: [{ eventName: 'session_start', surface: 'mobile' }],
      });
      const first = await fetch(`${baseUrl}/v1/analytics/events`, { method: 'POST', headers, body: payload });
      const second = await fetch(`${baseUrl}/v1/analytics/events`, { method: 'POST', headers, body: payload });
      expect(first.status).toBe(202);
      expect(second.status).toBe(202);
      const body = (await second.json()) as { data: { results: Array<{ duplicate: boolean }> } };
      expect(body.data.results[0]?.duplicate).toBe(true);
    });
  });
});
