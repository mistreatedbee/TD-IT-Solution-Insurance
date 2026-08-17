/**
 * GET/PATCH /alerts — Feature 009 Phase 6.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAlertsRouter } from './alerts.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { AlertDocument, AlertsRepo, UpsertAlertInput } from '../repositories/alerts.js';

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

function mongoLikeId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 24);
}

function createInMemoryAlertsRepo(): AlertsRepo {
  const rows = new Map<string, AlertDocument>();

  function key(accountId: string, dedupeKey: string) {
    return `${accountId}:${dedupeKey}`;
  }

  return {
    async upsertForAccount(accountId, input: UpsertAlertInput) {
      const existingKey = [...rows.entries()].find(
        ([, v]) => v.accountId === accountId && v.dedupeKey === input.dedupeKey,
      )?.[0];
      const now = new Date();
      const alert: AlertDocument = {
        id: existingKey?.split(':')[2] ?? mongoLikeId(),
        accountId,
        dedupeKey: input.dedupeKey,
        severity: input.severity,
        category: input.category,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
        source: input.source,
        readAt: existingKey ? (rows.get(existingKey)?.readAt ?? null) : null,
        dismissedAt: existingKey ? (rows.get(existingKey)?.dismissedAt ?? null) : null,
        createdAt: existingKey ? rows.get(existingKey)!.createdAt : now,
        updatedAt: now,
      };
      rows.set(key(accountId, input.dedupeKey) + `:${alert.id}`, alert);
      return alert;
    },
    async dismissStaleKeys(accountId, activeDedupeKeys) {
      const active = new Set(activeDedupeKeys);
      for (const [k, alert] of rows.entries()) {
        if (alert.accountId === accountId && alert.source === 'system' && !active.has(alert.dedupeKey)) {
          rows.set(k, { ...alert, dismissedAt: new Date() });
        }
      }
    },
    async listActive(accountId, limit, _cursor) {
      return [...rows.values()]
        .filter((a) => a.accountId === accountId && !a.dismissedAt)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
    async findByIdForAccount(accountId, alertId) {
      return [...rows.values()].find((a) => a.accountId === accountId && a.id === alertId) ?? null;
    },
    async dismiss(accountId, alertId) {
      for (const [k, alert] of rows.entries()) {
        if (alert.accountId === accountId && alert.id === alertId && !alert.dismissedAt) {
          const updated = { ...alert, dismissedAt: new Date() };
          rows.set(k, updated);
          return updated;
        }
      }
      return null;
    },
    async markRead(accountId, alertId) {
      for (const [k, alert] of rows.entries()) {
        if (alert.accountId === accountId && alert.id === alertId && !alert.readAt) {
          const updated = { ...alert, readAt: new Date() };
          rows.set(k, updated);
          return updated;
        }
      }
      return null;
    },
  };
}

describe('alerts routes', () => {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = randomUUID();
  const sessionId = randomUUID();
  let server: Server | undefined;
  let baseUrl = '';

  function authToken(): string {
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

  function buildApp(alertsRepo: AlertsRepo) {
    const ctx = {
      env,
      kv,
      alerts: alertsRepo,
      accounts: {
        async findById(id: string) {
          return id === accountId
            ? { id, email: 'user@example.com', userType: 'customer', accountState: 'active' }
            : null;
        },
        async getAccountStatus(id: string) {
          return id === accountId
            ? { id, accountState: 'active', mfaRequired: false, userType: 'customer' }
            : null;
        },
      },
      customerProfiles: { async findByAccountId() { return null; } },
      policies: { async listByAccount() { return []; } },
      assets: { async listByAccount() { return []; } },
      recoveryCases: { async listByAccount() { return []; } },
    } as unknown as AppContext;

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use('/v1', createAlertsRouter(ctx));
    app.use(errorHandler);
    return app;
  }

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it('GET /alerts returns synced system alerts', async () => {
    const app = buildApp(createInMemoryAlertsRepo());
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`;
        resolve();
      });
    });

    const res = await fetch(`${baseUrl}/alerts`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ title: string }> };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.some((a) => a.title.toLowerCase().includes('asset'))).toBe(true);
  });

  it('PATCH /alerts/:id dismisses an alert', async () => {
    const repo = createInMemoryAlertsRepo();
    const app = buildApp(repo);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`;
        resolve();
      });
    });

    const listRes = await fetch(`${baseUrl}/alerts`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    const list = (await listRes.json()) as { data: Array<{ id: string }> };
    const alertId = list.data[0]?.id;
    expect(alertId).toBeTruthy();

    const patchRes = await fetch(`${baseUrl}/alerts/${alertId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${authToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dismissed: true }),
    });
    expect(patchRes.status).toBe(200);

    const afterRes = await fetch(`${baseUrl}/alerts`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    const after = (await afterRes.json()) as { data: Array<{ id: string }> };
    expect(after.data.find((a) => a.id === alertId)).toBeUndefined();
  });
});
