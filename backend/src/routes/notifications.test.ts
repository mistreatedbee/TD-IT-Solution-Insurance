/**
 * Feature 007 — push token + preferences routes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createNotificationsRouter } from './notifications.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AccountStatus } from '../repositories/accounts.js';
import type { Env } from '../config/env.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferencesDocument,
} from '../repositories/notification-preferences.js';
import type { PushTokenDocument } from '../repositories/push-tokens.js';

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

function authToken(
  env: Env,
  accountId: string,
  sessionId: string,
  userType: 'customer' | 'admin' = 'customer',
): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: userType,
      mfa_required: false,
      account_state: 'active',
      partner_organization_id: null,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

function createHarness(opts?: { userType?: 'customer' | 'admin'; accountState?: AccountStatus['accountState'] }) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = randomUUID();
  const sessionId = randomUUID();
  const userType = opts?.userType ?? 'customer';
  const accountState = opts?.accountState ?? 'active';

  const tokens = new Map<string, PushTokenDocument>();
  let preferences: NotificationPreferencesDocument | null = null;

  const ctx = {
    env,
    kv,
    accounts: {
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== accountId) return null;
        return {
          accountId,
          accountState,
          emailVerified: true,
          mfaEnrolled: false,
        };
      },
    },
    pushTokens: {
      async register(input) {
        const key = `${input.accountId}:${input.deviceId}`;
        const now = new Date();
        const existing = [...tokens.values()].find(
          (row) => row.accountId === input.accountId && row.deviceId === input.deviceId,
        );
        const record: PushTokenDocument = {
          id: existing?.id ?? randomUUID(),
          accountId: input.accountId,
          deviceId: input.deviceId,
          expoPushToken: input.expoPushToken,
          tokenHash: 'hash',
          platform: input.platform,
          appVersion: input.appVersion ?? null,
          enabled: true,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          lastRegisteredAt: now,
        };
        tokens.set(key, record);
        return record;
      },
      async disableForDevice(accId, deviceId) {
        const key = `${accId}:${deviceId}`;
        const row = tokens.get(key);
        if (!row || !row.enabled) return false;
        tokens.set(key, { ...row, enabled: false, updatedAt: new Date() });
        return true;
      },
      async disableAllForAccount() {
        return 0;
      },
      async listEnabledForAccount() {
        return [];
      },
    },
    notificationPreferences: {
      async getOrCreate(accId: string) {
        if (!preferences) {
          const now = new Date();
          preferences = {
            id: randomUUID(),
            accountId: accId,
            channels: structuredClone(DEFAULT_NOTIFICATION_PREFERENCES),
            createdAt: now,
            updatedAt: now,
          };
        }
        return preferences;
      },
      async update(accId: string, patch) {
        const current = await this.getOrCreate(accId);
        const merged = structuredClone(current.channels);
        for (const [category, values] of Object.entries(patch)) {
          if (!values) continue;
          merged[category as keyof typeof merged] = {
            ...merged[category as keyof typeof merged],
            ...values,
          };
        }
        preferences = {
          ...current,
          channels: merged,
          updatedAt: new Date(),
        };
        return preferences;
      },
    },
    pushNotifications: {
      async sendToAccount() {
        return { tickets: [{ status: 'ok', id: 'ticket-1' }], invalidTokens: [] };
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createNotificationsRouter(ctx));
  app.use(errorHandler);

  let server: Server | null = null;
  let baseUrl = '';

  return {
    accountId,
    sessionId,
    userType,
    env,
    tokens,
    get preferences() {
      return preferences;
    },
    token: authToken(env, accountId, sessionId, userType),
    async start() {
      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => resolve());
      });
      const addr = server!.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
    },
    async stop() {
      if (!server) return;
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      server = null;
    },
    url(path: string) {
      return `${baseUrl}${path}`;
    },
  };
}

describe('notifications routes', () => {
  const harnesses: Array<Awaited<ReturnType<typeof createHarness>>> = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()!.stop();
    }
  });

  it('registers a push token for a customer', async () => {
    const h = createHarness();
    harnesses.push(h);
    await h.start();

    const response = await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${h.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId: 'device-1',
        expoPushToken: 'ExponentPushToken[abc123]',
        platform: 'ios',
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { deviceId: string; enabled: boolean };
    expect(body.deviceId).toBe('device-1');
    expect(body.enabled).toBe(true);
  });

  it('rejects invalid expo push token format', async () => {
    const h = createHarness();
    harnesses.push(h);
    await h.start();

    const response = await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${h.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId: 'device-1',
        expoPushToken: 'not-a-valid-token',
        platform: 'ios',
      }),
    });

    expect(response.status).toBe(400);
  });

  it('forbids push registration for admin accounts', async () => {
    const h = createHarness({ userType: 'admin' });
    harnesses.push(h);
    await h.start();

    const response = await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${h.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId: 'device-1',
        expoPushToken: 'ExponentPushToken[abc123]',
        platform: 'ios',
      }),
    });

    expect(response.status).toBe(403);
  });

  it('returns default notification preferences', async () => {
    const h = createHarness();
    harnesses.push(h);
    await h.start();

    const response = await fetch(h.url('/notifications/preferences'), {
      headers: { Authorization: `Bearer ${h.token}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { channels: { theft_critical: { push: boolean } } };
    expect(body.channels.theft_critical.push).toBe(true);
  });

  it('blocks disabling theft_critical push', async () => {
    const h = createHarness();
    harnesses.push(h);
    await h.start();

    const response = await fetch(h.url('/notifications/preferences'), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${h.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ theft_critical: { push: false } }),
    });

    expect(response.status).toBe(400);
  });

  it('revokes push token on logout device', async () => {
    const h = createHarness();
    harnesses.push(h);
    await h.start();

    await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${h.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId: 'device-1',
        expoPushToken: 'ExponentPushToken[abc123]',
        platform: 'android',
      }),
    });

    const response = await fetch(h.url('/devices/push-token'), {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${h.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deviceId: 'device-1' }),
    });

    expect(response.status).toBe(204);
    expect(h.tokens.get(`${h.accountId}:device-1`)?.enabled).toBe(false);
  });
});
