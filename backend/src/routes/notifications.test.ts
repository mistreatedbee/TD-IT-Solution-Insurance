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
import { isTakeoverCooldownElapsed, PUSH_TOKEN_TAKEOVER_COOLDOWN_MS } from '../lib/push-token-takeover.js';
import type { PushTokenSecurityEventInput } from '../repositories/push-token-security-log.js';

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

function createHarness(opts?: {
  userType?: 'customer' | 'admin';
  accountState?: AccountStatus['accountState'];
  /** Device id bound to this harness's primary session — SR-007-2. `null`
   * (the default) means "no binding recorded for this session", which the
   * route treats as nothing to compare against (mirrors
   * lib/refresh-session.ts's `session.deviceId` nullability). */
  boundDeviceId?: string | null;
}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = randomUUID();
  const sessionId = randomUUID();
  const userType = opts?.userType ?? 'customer';
  const accountState = opts?.accountState ?? 'active';

  const tokens = new Map<string, PushTokenDocument>();
  let preferences: NotificationPreferencesDocument | null = null;
  const sessionDevices = new Map<string, string | null>();
  sessionDevices.set(sessionId, opts?.boundDeviceId ?? null);
  const securityLogRecords: PushTokenSecurityEventInput[] = [];
  const takeoverAlertEmails: string[] = [];

  const ctx = {
    env,
    kv,
    accounts: {
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        // Any account id is "active" for this harness — tests exercising a
        // second account (SR-007-2's cross-account demotion case) mint
        // their own accountId and never register it separately here.
        return {
          accountId: id,
          accountState: id === accountId ? accountState : 'active',
          emailVerified: true,
          mfaEnrolled: false,
        };
      },
    },
    sessions: {
      async findById(id: string) {
        if (!sessionDevices.has(id)) return null;
        return { deviceId: sessionDevices.get(id) ?? null } as unknown as never;
      },
    },
    pushTokens: {
      // Mirrors repositories/push-tokens.ts's SR-007-2 deferred-takeover
      // state machine for the purpose of this test double: two rows
      // "collide" when they carry the same expoPushToken (standing in for
      // tokenHash equality). A collision is NEVER demoted inline — it is
      // quarantined (enabled: false, pendingTakeoverSince set) until
      // lib/push-token-takeover.ts's cooldown elapses and the claiming
      // account+device registers again.
      async register(input) {
        const key = `${input.accountId}:${input.deviceId}`;
        const now = new Date();
        const existing = tokens.get(key) ?? null;

        const contestedAccountIds = [
          ...new Set(
            [...tokens.values()]
              .filter(
                (row) =>
                  row.expoPushToken === input.expoPushToken &&
                  row.accountId !== input.accountId &&
                  row.enabled,
              )
              .map((row) => row.accountId),
          ),
        ];

        if (contestedAccountIds.length === 0) {
          const record: PushTokenDocument = {
            id: existing?.id ?? randomUUID(),
            accountId: input.accountId,
            deviceId: input.deviceId,
            expoPushToken: input.expoPushToken,
            tokenHash: 'hash',
            platform: input.platform,
            appVersion: input.appVersion ?? null,
            enabled: true,
            pendingTakeoverSince: null,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            lastRegisteredAt: now,
          };
          tokens.set(key, record);
          return {
            token: record,
            demotedAccountIds: [],
            contestedAccountIds: [],
            pendingTakeover: false,
            isNewTakeoverClaim: false,
          };
        }

        const alreadyPendingSameClaim =
          existing !== null &&
          existing.expoPushToken === input.expoPushToken &&
          existing.pendingTakeoverSince !== null;

        if (alreadyPendingSameClaim) {
          const pendingSince = existing!.pendingTakeoverSince as Date;
          if (isTakeoverCooldownElapsed(pendingSince, now)) {
            for (const [k, row] of tokens.entries()) {
              if (row.expoPushToken === input.expoPushToken && row.accountId !== input.accountId && row.enabled) {
                tokens.set(k, { ...row, enabled: false, updatedAt: now });
              }
            }
            const record: PushTokenDocument = {
              ...existing!,
              expoPushToken: input.expoPushToken,
              platform: input.platform,
              appVersion: input.appVersion ?? null,
              enabled: true,
              pendingTakeoverSince: null,
              updatedAt: now,
              lastRegisteredAt: now,
            };
            tokens.set(key, record);
            return {
              token: record,
              demotedAccountIds: contestedAccountIds,
              contestedAccountIds,
              pendingTakeover: false,
              isNewTakeoverClaim: false,
            };
          }

          const record: PushTokenDocument = {
            ...existing!,
            expoPushToken: input.expoPushToken,
            platform: input.platform,
            appVersion: input.appVersion ?? null,
            updatedAt: now,
            lastRegisteredAt: now,
          };
          tokens.set(key, record);
          return {
            token: record,
            demotedAccountIds: [],
            contestedAccountIds,
            pendingTakeover: true,
            isNewTakeoverClaim: false,
          };
        }

        const record: PushTokenDocument = {
          id: existing?.id ?? randomUUID(),
          accountId: input.accountId,
          deviceId: input.deviceId,
          expoPushToken: input.expoPushToken,
          tokenHash: 'hash',
          platform: input.platform,
          appVersion: input.appVersion ?? null,
          enabled: false,
          pendingTakeoverSince: now,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          lastRegisteredAt: now,
        };
        tokens.set(key, record);
        return {
          token: record,
          demotedAccountIds: [],
          contestedAccountIds,
          pendingTakeover: true,
          isNewTakeoverClaim: true,
        };
      },
      async disableForDevice(accId, deviceId) {
        const key = `${accId}:${deviceId}`;
        const row = tokens.get(key);
        if (!row || !row.enabled) return false;
        tokens.set(key, { ...row, enabled: false, updatedAt: new Date() });
        return true;
      },
      async disableAllForAccount(accId: string) {
        let count = 0;
        for (const [k, row] of tokens.entries()) {
          if (row.accountId === accId && row.enabled) {
            tokens.set(k, { ...row, enabled: false, updatedAt: new Date() });
            count += 1;
          }
        }
        return count;
      },
      async listEnabledForAccount() {
        return [];
      },
    },
    pushTokenSecurityLog: {
      async record(input: PushTokenSecurityEventInput) {
        securityLogRecords.push(input);
      },
    },
    authNotifications: {
      async notifyPushTokenReregisteredElsewhere({ accountId: losingAccountId }: { accountId: string }) {
        takeoverAlertEmails.push(losingAccountId);
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
    securityLogRecords,
    takeoverAlertEmails,
    get preferences() {
      return preferences;
    },
    token: authToken(env, accountId, sessionId, userType),
    /** SR-007-2 regression helper: mints a second, independent
     * account+session (with its own bound device) against this same
     * harness/ctx, so a cross-account token-collision scenario can be
     * exercised without a second server instance. */
    addAccount(boundDeviceId: string | null) {
      const otherAccountId = randomUUID();
      const otherSessionId = randomUUID();
      sessionDevices.set(otherSessionId, boundDeviceId);
      return {
        accountId: otherAccountId,
        token: authToken(env, otherAccountId, otherSessionId, 'customer'),
      };
    },
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
    const h = createHarness({ boundDeviceId: 'device-1' });
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
    const h = createHarness({ boundDeviceId: 'device-1' });
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

  it('revoking on logout leaves zero enabled tokens for the account (SR-007-1)', async () => {
    const h = createHarness({ boundDeviceId: 'device-1' });
    harnesses.push(h);
    await h.start();

    await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'device-1',
        expoPushToken: 'ExponentPushToken[abc123]',
        platform: 'android',
      }),
    });

    await fetch(h.url('/devices/push-token'), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'device-1' }),
    });

    const stillEnabled = [...h.tokens.values()].filter(
      (row) => row.accountId === h.accountId && row.enabled,
    );
    expect(stillEnabled).toHaveLength(0);
  });

  it('SR-007-2: rejects push-token registration when deviceId does not match the session-bound device', async () => {
    const h = createHarness({ boundDeviceId: 'device-legit' });
    harnesses.push(h);
    await h.start();

    const response = await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'device-attacker-supplied',
        expoPushToken: 'ExponentPushToken[victimtoken]',
        platform: 'ios',
      }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code?: string } };
    expect(body.error.code).toBe('DEVICE_MISMATCH');
    // Nothing was persisted for the mismatched request.
    expect(h.tokens.size).toBe(0);
  });

  it('SR-007-2: allows registration when deviceId matches the session-bound device', async () => {
    const h = createHarness({ boundDeviceId: 'device-legit' });
    harnesses.push(h);
    await h.start();

    const response = await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'device-legit',
        expoPushToken: 'ExponentPushToken[abc123]',
        platform: 'ios',
      }),
    });

    expect(response.status).toBe(200);
  });

  it('SR-007-2 (re-verification §7.2b): a session with no bound device is now REJECTED, not skipped', async () => {
    // Was: "a session with no bound device does not block registration" —
    // that was the bypass. An attacker who simply omits `deviceId` at
    // login/exchange (both nullable — routes/auth.ts) previously sailed
    // through this check entirely. Fail closed: no bound device on the
    // session means the registration is rejected outright, because this
    // route's caller always supplies a deviceId, so there is no legitimate
    // device-less caller here (security-review.md §7.2's closing note).
    const h = createHarness({ boundDeviceId: null });
    harnesses.push(h);
    await h.start();

    const response = await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'any-device-id',
        expoPushToken: 'ExponentPushToken[abc123]',
        platform: 'ios',
      }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code?: string } };
    expect(body.error.code).toBe('DEVICE_MISMATCH');
    expect(h.tokens.size).toBe(0);
  });

  it('SR-007-2 (re-verification §7.2a): a cross-account token collision does NOT silence the prior owner — it is quarantined, not demoted', async () => {
    // This is the attack the original "fix" did not close: the attacker
    // does not need to spoof a device id at all — they register the
    // VICTIM'S STOLEN TOKEN STRING under the attacker's own account, using
    // the attacker's own honestly-bound device id. The device-mismatch
    // check above is irrelevant to this path; the real protection is that
    // registering a contested token no longer demotes the prior owner
    // inline (repositories/push-tokens.ts's deferred-takeover state
    // machine).
    const h = createHarness({ boundDeviceId: 'victim-device' });
    harnesses.push(h);
    await h.start();

    // Victim registers their device normally.
    await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'victim-device',
        expoPushToken: 'ExponentPushToken[sharedtoken]',
        platform: 'ios',
      }),
    });
    expect(h.tokens.get(`${h.accountId}:victim-device`)?.enabled).toBe(true);

    // Attacker controls a second, independent account+session bound to
    // their OWN device, and re-registers the same (stolen) Expo push
    // token string under it.
    const attacker = h.addAccount('attacker-device');
    const attackResponse = await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${attacker.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'attacker-device',
        expoPushToken: 'ExponentPushToken[sharedtoken]',
        platform: 'ios',
      }),
    });

    // The registration itself is accepted (this IS the legitimate
    // resold-device shape) but it must not touch the victim's row.
    expect(attackResponse.status).toBe(200);
    const attackBody = (await attackResponse.json()) as { enabled: boolean; pendingTakeover: boolean };
    // The claiming (attacker's) row is quarantined — not enabled, so it
    // receives no push traffic either — pending the cooldown.
    expect(attackBody.enabled).toBe(false);
    expect(attackBody.pendingTakeover).toBe(true);

    // The core assertion this test exists to make: the victim keeps
    // receiving their own notifications, including theft_critical, for the
    // entire cooldown window. This is the opposite of the old test's
    // assertion, which documented the vulnerability rather than a fix.
    expect(h.tokens.get(`${h.accountId}:victim-device`)?.enabled).toBe(true);

    // A structured, queryable audit record was written (not a console.warn
    // — security-review.md §7.2c) and the losing account was alerted by
    // email exactly once.
    expect(h.securityLogRecords).toHaveLength(1);
    expect(h.securityLogRecords[0]).toMatchObject({
      eventType: 'takeover_pending',
      claimingAccountId: attacker.accountId,
      claimingDeviceId: 'attacker-device',
      contestedAccountIds: [h.accountId],
    });
    expect(h.takeoverAlertEmails).toEqual([h.accountId]);
  });

  it('SR-007-2: re-registering during the cooldown does not re-alert the losing account', async () => {
    const h = createHarness({ boundDeviceId: 'victim-device' });
    harnesses.push(h);
    await h.start();

    await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'victim-device',
        expoPushToken: 'ExponentPushToken[sharedtoken]',
        platform: 'ios',
      }),
    });

    const attacker = h.addAccount('attacker-device');
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(h.url('/devices/push-token'), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${attacker.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'attacker-device',
          expoPushToken: 'ExponentPushToken[sharedtoken]',
          platform: 'ios',
        }),
      });
      // eslint-disable-next-line no-await-in-loop
      const body = (await response.json()) as { pendingTakeover: boolean };
      expect(body.pendingTakeover).toBe(true);
    }

    // Only the FIRST contested registration alerts/logs — a legitimate app
    // re-registering on every foreground during the cooldown must not spam
    // the losing account or the security log.
    expect(h.securityLogRecords).toHaveLength(1);
    expect(h.takeoverAlertEmails).toEqual([h.accountId]);
    expect(h.tokens.get(`${h.accountId}:victim-device`)?.enabled).toBe(true);
  });

  it('SR-007-2: the takeover completes only after the cooldown elapses with no resolution', async () => {
    const h = createHarness({ boundDeviceId: 'victim-device' });
    harnesses.push(h);
    await h.start();

    await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'victim-device',
        expoPushToken: 'ExponentPushToken[sharedtoken]',
        platform: 'ios',
      }),
    });

    const attacker = h.addAccount('attacker-device');
    await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${attacker.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'attacker-device',
        expoPushToken: 'ExponentPushToken[sharedtoken]',
        platform: 'ios',
      }),
    });
    expect(h.tokens.get(`${h.accountId}:victim-device`)?.enabled).toBe(true);

    // Force the quarantined row's clock into the past rather than the
    // route's real Date.now() — exercises the same
    // isTakeoverCooldownElapsed() the real repository uses, without
    // depending on fake timers interacting with the HTTP server.
    const claimKey = `${attacker.accountId}:attacker-device`;
    const claim = h.tokens.get(claimKey)!;
    h.tokens.set(claimKey, {
      ...claim,
      pendingTakeoverSince: new Date(Date.now() - PUSH_TOKEN_TAKEOVER_COOLDOWN_MS - 1000),
    });

    const completingResponse = await fetch(h.url('/devices/push-token'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${attacker.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'attacker-device',
        expoPushToken: 'ExponentPushToken[sharedtoken]',
        platform: 'ios',
      }),
    });
    const completingBody = (await completingResponse.json()) as { enabled: boolean; pendingTakeover: boolean };

    expect(completingBody.enabled).toBe(true);
    expect(completingBody.pendingTakeover).toBe(false);
    // Only NOW, after the uncontested cooldown, does the prior owner's row
    // actually get disabled.
    expect(h.tokens.get(`${h.accountId}:victim-device`)?.enabled).toBe(false);
    expect(h.securityLogRecords.map((r) => r.eventType)).toEqual(['takeover_pending', 'takeover_completed']);
    // Still exactly one alert email — the completion does not send a second.
    expect(h.takeoverAlertEmails).toEqual([h.accountId]);
  });
});
