/**
 * Self-device location endpoints — Feature 008 Phase 1.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAssetsRouter } from './assets.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AccountStatus } from '../repositories/accounts.js';
import type { AssetDocument, AssetLastLocation } from '../repositories/assets.js';
import type { Env } from '../config/env.js';
import type { IdempotencyRepo } from '../repositories/idempotency.js';
import type { LocationEventDocument } from '../repositories/location-events.js';

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

function createInMemoryIdempotencyRepo(): IdempotencyRepo {
  const rows = new Map<
    string,
    { accountId: string | null; requestHash: string; responseStatus: number; responseBody: unknown }
  >();
  return {
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

function sampleSmartphone(accountId: string, id = '507f1f77bcf86cd799439011'): AssetDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id,
    accountId,
    assetType: 'smartphone',
    displayName: 'My iPhone',
    status: 'active',
    registeredAt: now,
    estimatedValue: null,
    photos: [],
    gpsDeviceId: null,
    gpsPairedAt: null,
    locationSource: null,
    reportingDeviceId: null,
    lastLocation: null,
    legalHold: false,
    details: { brand: 'Apple', model: 'iPhone 15', imei: '123456789012345' },
    createdAt: now,
    updatedAt: now,
  };
}

function sampleLaptop(accountId: string, id = '507f1f77bcf86cd799439012'): AssetDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id,
    accountId,
    assetType: 'laptop',
    displayName: 'Work laptop',
    status: 'active',
    registeredAt: now,
    estimatedValue: null,
    photos: [],
    gpsDeviceId: null,
    gpsPairedAt: null,
    locationSource: null,
    reportingDeviceId: null,
    lastLocation: null,
    legalHold: false,
    details: { brand: 'Dell', model: 'XPS', serialNumber: 'SN123' },
    createdAt: now,
    updatedAt: now,
  };
}

function createHarness(opts: {
  accountId?: string;
  accountState?: AccountStatus['accountState'];
  assets?: AssetDocument[];
  sessionDeviceId?: string | null;
}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = opts.accountId ?? randomUUID();
  const sessionId = randomUUID();
  const storedAssets = new Map<string, AssetDocument>();
  for (const asset of opts.assets ?? []) {
    storedAssets.set(asset.id, { ...asset });
  }

  const sessions = new Map<string, SessionRecord>();
  sessions.set(sessionId, {
    id: sessionId,
    accountId,
    refreshTokenHash: 'hash',
    deviceId: opts.sessionDeviceId === undefined ? 'device-bound-1' : opts.sessionDeviceId,
    deviceName: 'Test phone',
    familyId: randomUUID(),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    absoluteExpiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    revokedReason: null,
    replacedBySessionId: null,
    mfaVerifiedAt: null,
  });

  const storedEvents: LocationEventDocument[] = [];

  const ctx = {
    env,
    kv,
    accounts: {
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== accountId) return null;
        return {
          id,
          accountState: opts.accountState ?? 'active',
          mfaRequired: false,
          userType: 'customer',
          partnerOrganizationId: null,
          updatedAt: new Date(),
        };
      },
    },
    sessions: {
      async findById(id: string) {
        return sessions.get(id) ?? null;
      },
    },
    assets: {
      async findByIdForAccount(acctId: string, assetId: string) {
        const row = storedAssets.get(assetId);
        return row && row.accountId === acctId ? { ...row } : null;
      },
      async listLocationSummaryByAccount(acctId: string) {
        return [...storedAssets.values()].filter((a) => a.accountId === acctId && a.status !== 'removed');
      },
      async reportSelfDeviceLocation(
        acctId: string,
        assetId: string,
        sessionDeviceId: string,
        location: AssetLastLocation,
      ) {
        const existing = storedAssets.get(assetId);
        if (!existing || existing.accountId !== acctId) return { ok: false as const, reason: 'not_found' as const };
        if (existing.status !== 'active') return { ok: false as const, reason: 'not_active' as const };
        if (existing.assetType !== 'smartphone') return { ok: false as const, reason: 'not_smartphone' as const };
        if (existing.reportingDeviceId && existing.reportingDeviceId !== sessionDeviceId) {
          return { ok: false as const, reason: 'device_mismatch' as const };
        }

        const updated: AssetDocument = {
          ...existing,
          locationSource: 'self_device',
          reportingDeviceId: sessionDeviceId,
          lastLocation: location,
          updatedAt: new Date(),
        };
        storedAssets.set(assetId, updated);
        return { ok: true as const, asset: updated };
      },
    },
    locationEvents: {
      async append(input: {
        accountId: string;
        assetId: string;
        latitude: number;
        longitude: number;
        accuracyMeters: number | null;
        recordedAt: Date;
        source: 'self_device' | 'hardware';
        triggeredBy?: 'foreground_open' | 'manual_refresh' | null;
        deviceId?: string | null;
      }) {
        const event: LocationEventDocument = {
          id: `507f1f77bcf86cd7994390${String(storedEvents.length + 1).padStart(2, '0')}`,
          accountId: input.accountId,
          assetId: input.assetId,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMeters: input.accuracyMeters,
          recordedAt: input.recordedAt,
          receivedAt: new Date(),
          source: input.source,
          triggeredBy: input.triggeredBy ?? null,
          deviceId: input.deviceId ?? null,
        };
        storedEvents.unshift(event);
        return event;
      },
      async listByAsset(
        acctId: string,
        assetId: string,
        limit: number,
        cursor?: { recordedAt: Date; id: string },
      ) {
        let rows = storedEvents.filter((e) => e.accountId === acctId && e.assetId === assetId);
        if (cursor) {
          rows = rows.filter(
            (e) =>
              e.recordedAt < cursor.recordedAt ||
              (e.recordedAt.getTime() === cursor.recordedAt.getTime() && e.id < cursor.id),
          );
        }
        return rows.slice(0, limit);
      },
    },
    idempotency: createInMemoryIdempotencyRepo(),
    customerNotifications: {
      async notifyAssetCreated() {
        return undefined;
      },
      async notifyAssetUpdated() {
        return undefined;
      },
      async notifyAssetRemoved() {
        return undefined;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAssetsRouter(ctx));
  app.use(errorHandler);

  return { app, accountId, sessionId, env, storedAssets, storedEvents };
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('POST /assets/:assetId/location-report', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('records self-device location for an owned smartphone and binds the reporting device', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const { app, sessionId, env, storedEvents } = createHarness({ accountId, assets: [phone] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-report`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        latitude: -25.7479,
        longitude: 28.2293,
        accuracyMeters: 12,
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      assetId: string;
      locationSource: string;
      reportingDeviceId: string;
      lastLocation: { latitude: number; longitude: number; accuracyMeters: number };
    };
    expect(body.assetId).toBe(phone.id);
    expect(body.locationSource).toBe('self_device');
    expect(body.reportingDeviceId).toBe('device-bound-1');
    expect(body.lastLocation.latitude).toBe(-25.7479);
    expect(body.lastLocation.longitude).toBe(28.2293);
    expect(body.lastLocation.accuracyMeters).toBe(12);
    expect(storedEvents).toHaveLength(1);
    expect(storedEvents[0]?.source).toBe('self_device');
  });

  it('returns 404 for another account asset', async () => {
    const owner = randomUUID();
    const caller = randomUUID();
    const phone = sampleSmartphone(owner);
    const { app, sessionId, env } = createHarness({ accountId: caller, assets: [phone] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-report`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, caller, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ latitude: -25.7, longitude: 28.2 }),
    });

    expect(response.status).toBe(404);
  });

  it('returns 403 for non-smartphone assets', async () => {
    const accountId = randomUUID();
    const laptop = sampleLaptop(accountId);
    const { app, sessionId, env } = createHarness({ accountId, assets: [laptop] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${laptop.id}/location-report`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ latitude: -25.7, longitude: 28.2 }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns DEVICE_MISMATCH when session has no bound device', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const { app, sessionId, env } = createHarness({
      accountId,
      assets: [phone],
      sessionDeviceId: null,
    });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-report`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ latitude: -25.7, longitude: 28.2 }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('DEVICE_MISMATCH');
  });

  it('returns DEVICE_MISMATCH when a different device reports after binding', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId, '507f1f77bcf86cd799439099');
    const bound = {
      ...phone,
      locationSource: 'self_device' as const,
      reportingDeviceId: 'original-device',
      lastLocation: {
        latitude: -25.1,
        longitude: 28.1,
        accuracyMeters: 10,
        recordedAt: new Date('2026-08-01T10:00:00.000Z'),
      },
    };
    const { app, sessionId, env } = createHarness({ accountId, assets: [bound] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-report`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ latitude: -25.7, longitude: 28.2 }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('DEVICE_MISMATCH');
  });
});

describe('GET /assets/:assetId/location', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('returns last location for an owned asset', async () => {
    const accountId = randomUUID();
    const phone = {
      ...sampleSmartphone(accountId),
      locationSource: 'self_device' as const,
      reportingDeviceId: 'device-bound-1',
      lastLocation: {
        latitude: -26.2,
        longitude: 28.04,
        accuracyMeters: 8,
        recordedAt: new Date('2026-08-01T11:00:00.000Z'),
      },
    };
    const { app, sessionId, env } = createHarness({ accountId, assets: [phone] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location`, {
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { lastLocation: { latitude: number } };
    expect(body.lastLocation.latitude).toBe(-26.2);
  });

  it('returns 404 when no location has been recorded', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const { app, sessionId, env } = createHarness({ accountId, assets: [phone] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location`, {
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(404);
  });
});

describe('GET /assets/location-summary', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('lists all account assets with location summary fields', async () => {
    const accountId = randomUUID();
    const otherAccount = randomUUID();
    const phone = {
      ...sampleSmartphone(accountId, '507f1f77bcf86cd799439021'),
      locationSource: 'self_device' as const,
      reportingDeviceId: 'device-bound-1',
      lastLocation: {
        latitude: -25.9,
        longitude: 28.1,
        accuracyMeters: 15,
        recordedAt: new Date('2026-08-01T11:30:00.000Z'),
      },
    };
    const laptop = sampleLaptop(accountId, '507f1f77bcf86cd799439022');
    const otherPhone = sampleSmartphone(otherAccount, '507f1f77bcf86cd799439023');
    const { app, sessionId, env } = createHarness({
      accountId,
      assets: [phone, laptop, otherPhone],
    });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/location-summary`, {
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ assetId: string; displayName: string; lastLocation: { latitude: number } | null }>;
    };
    expect(body.data).toHaveLength(2);
    const phoneEntry = body.data.find((row) => row.assetId === phone.id);
    expect(phoneEntry?.displayName).toBe('My iPhone');
    expect(phoneEntry?.lastLocation?.latitude).toBe(-25.9);
    const laptopEntry = body.data.find((row) => row.assetId === laptop.id);
    expect(laptopEntry?.lastLocation).toBeNull();
  });
});

describe('GET /assets/:assetId/location-history', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('returns paginated location events newest first after a report', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const { app, sessionId, env } = createHarness({ accountId, assets: [phone] });
    const listened = await listen(app);
    server = listened.server;
    const token = customerToken(env, accountId, sessionId);

    await fetch(`${listened.baseUrl}/assets/${phone.id}/location-report`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        latitude: -25.7479,
        longitude: 28.2293,
        triggeredBy: 'manual_refresh',
      }),
    });

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-history?limit=10`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ latitude: number; source: string }>;
      pagination: { hasMore: boolean };
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.latitude).toBe(-25.7479);
    expect(body.data[0]?.source).toBe('self_device');
    expect(body.pagination.hasMore).toBe(false);
  });
});
