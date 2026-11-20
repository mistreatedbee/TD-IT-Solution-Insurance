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
    // INC-001: this test file's existing coverage exercises the endpoint's
    // actual behavior, so it opts in explicitly; the kill-switch tests below
    // override this back off (and off-by-omission) to prove fail-closed.
    locationIngestionEnabled: true,
    ...overrides,
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
  envOverrides?: Partial<Env>;
  /** F-1 tests: make the withdrawal record write fail. */
  failWithdrawal?: boolean;
  /** NB-1: make the consent lookup fail. */
  failConsentLookup?: boolean;
  /** F-1 tests: runs inside the report's asset write (simulates a concurrent withdrawal). */
  onReportWrite?: () => Promise<void>;
}) {
  const env = fakeEnv(opts.envOverrides);
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
  /** Test helper: move the bound session to another device (SDL-10 device change). */
  const setSessionDevice = (deviceId: string) => {
    const row = sessions.get(sessionId)!;
    sessions.set(sessionId, { ...row, deviceId });
  };
  const setSessionMfaVerifiedAt = (at: Date | null) => {
    const row = sessions.get(sessionId)!;
    sessions.set(sessionId, { ...row, mfaVerifiedAt: at });
  };

  const storedEvents: LocationEventDocument[] = [];
  const storedConsentWithdrawals: Array<{
    id: string;
    accountId: string;
    assetId: string;
    eventType: 'withdrawn';
    purgedEventCount: number;
    actorSessionId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
  }> = [];
  const storedConsentGrants: Array<{
    id: string;
    accountId: string;
    assetId: string;
    eventType: 'granted';
    actorSessionId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    deviceId: string | null;
    consentTextVersion: string | null;
    scopes: string[];
    createdAt: Date;
  }> = [];
  // INC-001 A-7: every consent event in write order (append-only), newest last.
  const consentTimeline: Array<{
    accountId: string;
    assetId: string;
    eventType: 'granted' | 'withdrawn';
    deviceId: string | null;
    scopes: string[];
    createdAt: Date;
  }> = [];
  const pushSent: Array<{ templateId: string; variables: Record<string, string> }> = [];
  const noticesSent: Array<{ action: string; assetDisplayName?: string | null }> = [];

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
      async clearLocationForAccount(acctId: string, assetId: string) {
        const existing = storedAssets.get(assetId);
        if (!existing || existing.accountId !== acctId || existing.status === 'removed') return null;
        const updated: AssetDocument = {
          ...existing,
          locationSource: null,
          reportingDeviceId: null,
          lastLocation: null,
          updatedAt: new Date(),
        };
        storedAssets.set(assetId, updated);
        return updated;
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
        if (opts.onReportWrite) await opts.onReportWrite();

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
        triggeredBy?: LocationEventDocument['triggeredBy'];
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
      async countByAsset(acctId: string, assetId: string) {
        return storedEvents.filter((e) => e.accountId === acctId && e.assetId === assetId).length;
      },
      async deleteByAsset(acctId: string, assetId: string) {
        const before = storedEvents.length;
        for (let i = storedEvents.length - 1; i >= 0; i -= 1) {
          const e = storedEvents[i];
          if (e && e.accountId === acctId && e.assetId === assetId) storedEvents.splice(i, 1);
        }
        return before - storedEvents.length;
      },
    },
    pushNotifications: {
      async sendToAccount(input: { templateId: string; variables: Record<string, string> }) {
        pushSent.push({ templateId: input.templateId, variables: input.variables });
      },
    },
    authNotifications: {
      async notifyProtectionChanged(input: { action: string; assetDisplayName?: string | null }) {
        noticesSent.push({ action: input.action, assetDisplayName: input.assetDisplayName });
      },
    },
    auditLog: {
      async record() {
        return undefined;
      },
    },
    locationConsentLog: {
      async findLatestByAsset(acctId: string, assetId: string) {
        if (opts.failConsentLookup) throw new Error('mongo read failed');
        const rows = consentTimeline.filter((e) => e.accountId === acctId && e.assetId === assetId);
        return rows.length ? { ...rows[rows.length - 1]! } : null;
      },
      async recordGrant(input: {
        accountId: string;
        assetId: string;
        actorSessionId?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
        deviceId?: string | null;
        consentTextVersion?: string | null;
        scopes?: string[];
      }) {
        const record = {
          id: `consent-grant-${storedConsentGrants.length + 1}`,
          accountId: input.accountId,
          assetId: input.assetId,
          eventType: 'granted' as const,
          actorSessionId: input.actorSessionId ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          deviceId: input.deviceId ?? null,
          consentTextVersion: input.consentTextVersion ?? null,
          scopes: input.scopes ?? [],
          createdAt: new Date(),
        };
        storedConsentGrants.push(record);
        consentTimeline.push(record);
        return record;
      },
      async recordWithdrawal(input: {
        accountId: string;
        assetId: string;
        purgedEventCount: number;
        actorSessionId?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
      }) {
        if (opts.failWithdrawal) throw new Error('mongo write failed');
        const record = {
          id: `consent-${storedConsentWithdrawals.length + 1}`,
          accountId: input.accountId,
          assetId: input.assetId,
          eventType: 'withdrawn' as const,
          purgedEventCount: input.purgedEventCount,
          actorSessionId: input.actorSessionId ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          createdAt: new Date(),
        };
        storedConsentWithdrawals.push(record);
        consentTimeline.push({ ...record, deviceId: null, scopes: [] });
        return record;
      },
    },
    policies: {
      async listByAccount() {
        return [];
      },
    },
    planCatalog: {
      async findById() {
        return null;
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
    policies: {
      async listByAccount(acctId: string) {
        return [];
      },
    },
    planCatalog: {
      async findById() {
        return null;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAssetsRouter(ctx));
  app.use(errorHandler);

  return {
    app,
    accountId,
    sessionId,
    env,
    storedAssets,
    storedEvents,
    storedConsentWithdrawals,
    storedConsentGrants,
    pushSent,
    noticesSent,
    setSessionDevice,
    setSessionMfaVerifiedAt,
  };
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

  it('INC-001: refuses with 503 UPSTREAM_UNAVAILABLE when LOCATION_INGESTION_ENABLED is unset (fail-closed default)', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const { app, sessionId, env, storedEvents, storedAssets } = createHarness({
      accountId,
      assets: [phone],
      envOverrides: { locationIngestionEnabled: undefined },
    });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-report`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ latitude: -25.7479, longitude: 28.2293, accuracyMeters: 12 }),
    });

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    // No write occurred anywhere on the disabled path.
    expect(storedEvents).toHaveLength(0);
    expect(storedAssets.get(phone.id)?.lastLocation).toBeNull();
  });

  it('INC-001: refuses with 503 UPSTREAM_UNAVAILABLE when LOCATION_INGESTION_ENABLED is explicitly false', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const { app, sessionId, env, storedEvents } = createHarness({
      accountId,
      assets: [phone],
      envOverrides: { locationIngestionEnabled: false },
    });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-report`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ latitude: -25.7479, longitude: 28.2293, accuracyMeters: 12 }),
    });

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(storedEvents).toHaveLength(0);
  });

  it('INC-001: still functions when LOCATION_INGESTION_ENABLED is explicitly true', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const { app, sessionId, env, storedEvents } = createHarness({
      accountId,
      assets: [phone],
      envOverrides: { locationIngestionEnabled: true },
    });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-report`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ latitude: -25.7479, longitude: 28.2293, accuracyMeters: 12 }),
    });

    expect(response.status).toBe(200);
    expect(storedEvents).toHaveLength(1);
  });

  describe('extended triggers (LOCATION_EXTENDED_TRIGGERS_ENABLED)', () => {
    async function report(
      envOverrides: Partial<Env>,
      payload: Record<string, unknown>,
    ): Promise<{ status: number; body: { error?: { code: string } }; storedEvents: LocationEventDocument[] }> {
      const accountId = randomUUID();
      const phone = sampleSmartphone(accountId);
      const { app, sessionId, env, storedEvents } = createHarness({ accountId, assets: [phone], envOverrides });
      const listened = await listen(app);
      server = listened.server;
      const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-report`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ latitude: -25.7479, longitude: 28.2293, ...payload }),
      });
      const body = (await response.json()) as { error?: { code: string } };
      await new Promise<void>((resolve) => listened.server.close(() => resolve()));
      server = undefined;
      return { status: response.status, body, storedEvents };
    }

    for (const trigger of ['periodic_foreground', 'background'] as const) {
      it(`rejects ${trigger} with VALIDATION_ERROR when the switch is unset (fail-closed)`, async () => {
        const r = await report({ locationExtendedTriggersEnabled: undefined }, { triggeredBy: trigger });
        expect(r.status).toBe(400);
        expect(r.body.error?.code).toBe('VALIDATION_ERROR');
        expect(r.storedEvents).toHaveLength(0);
      });

      it(`rejects ${trigger} with VALIDATION_ERROR when the switch is explicitly false`, async () => {
        const r = await report({ locationExtendedTriggersEnabled: false }, { triggeredBy: trigger });
        expect(r.status).toBe(400);
        expect(r.body.error?.code).toBe('VALIDATION_ERROR');
        expect(r.storedEvents).toHaveLength(0);
      });

      it(`stores ${trigger} faithfully when the switch is on`, async () => {
        const r = await report({ locationExtendedTriggersEnabled: true }, { triggeredBy: trigger });
        expect(r.status).toBe(200);
        expect(r.storedEvents).toHaveLength(1);
        expect(r.storedEvents[0]?.triggeredBy).toBe(trigger);
      });

      it(`still refuses ${trigger} with 503 when ingestion itself is off, even with the switch on`, async () => {
        const r = await report(
          { locationIngestionEnabled: false, locationExtendedTriggersEnabled: true },
          { triggeredBy: trigger },
        );
        expect(r.status).toBe(503);
        expect(r.storedEvents).toHaveLength(0);
      });
    }

    for (const enabled of [undefined, true] as const) {
      for (const trigger of ['foreground_open', 'manual_refresh'] as const) {
        it(`stores ${trigger} unchanged (switch ${String(enabled)})`, async () => {
          const r = await report({ locationExtendedTriggersEnabled: enabled }, { triggeredBy: trigger });
          expect(r.status).toBe(200);
          expect(r.storedEvents[0]?.triggeredBy).toBe(trigger);
        });
      }

      it(`defaults a missing triggeredBy to manual_refresh (switch ${String(enabled)})`, async () => {
        const r = await report({ locationExtendedTriggersEnabled: enabled }, {});
        expect(r.status).toBe(200);
        expect(r.storedEvents[0]?.triggeredBy).toBe('manual_refresh');
      });
    }

    it('still rejects an unknown triggeredBy with VALIDATION_ERROR when the switch is on', async () => {
      const r = await report({ locationExtendedTriggersEnabled: true }, { triggeredBy: 'always_on' });
      expect(r.status).toBe(400);
      expect(r.body.error?.code).toBe('VALIDATION_ERROR');
      expect(r.storedEvents).toHaveLength(0);
    });
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

describe('POST /assets/:assetId/location-consent', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('records a granted consent event for an owned asset', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const { app, sessionId, env, storedConsentGrants } = createHarness({ accountId, assets: [phone] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-consent`, {
      method: 'POST',
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { assetId: string; eventType: string; createdAt: string };
    expect(body.assetId).toBe(phone.id);
    expect(body.eventType).toBe('granted');
    expect(storedConsentGrants).toHaveLength(1);
    expect(storedConsentGrants[0]?.accountId).toBe(accountId);
    expect(storedConsentGrants[0]?.assetId).toBe(phone.id);
  });

  it('is not gated by locationIngestionEnabled', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const { app, sessionId, env, storedConsentGrants } = createHarness({
      accountId,
      assets: [phone],
      envOverrides: { locationIngestionEnabled: false },
    });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-consent`, {
      method: 'POST',
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(200);
    expect(storedConsentGrants).toHaveLength(1);
  });

  it('records a fresh event on a repeat grant call (idempotent, not upserted)', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const { app, sessionId, env, storedConsentGrants } = createHarness({ accountId, assets: [phone] });
    const listened = await listen(app);
    server = listened.server;

    for (let i = 0; i < 2; i += 1) {
      const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-consent`, {
        method: 'POST',
        headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
      });
      expect(response.status).toBe(200);
    }

    expect(storedConsentGrants).toHaveLength(2);
    expect(storedConsentGrants[0]?.id).not.toBe(storedConsentGrants[1]?.id);
  });

  it('returns 404 for an asset owned by another account', async () => {
    const accountId = randomUUID();
    const otherAccountId = randomUUID();
    const phone = sampleSmartphone(otherAccountId);
    const { app, sessionId, env, storedConsentGrants } = createHarness({ accountId, assets: [phone] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-consent`, {
      method: 'POST',
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(404);
    expect(storedConsentGrants).toHaveLength(0);
  });

  it('returns 401 when unauthenticated', async () => {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const { app } = createHarness({ accountId, assets: [phone] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-consent`, {
      method: 'POST',
    });

    expect(response.status).toBe(401);
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

describe('INC-001 A-7: server-side location consent (LOCATION_CONSENT_ENFORCED)', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  async function setup(envOverrides: Partial<Env> = {}) {
    const accountId = randomUUID();
    const phone = sampleSmartphone(accountId);
    const h = createHarness({
      accountId,
      assets: [phone],
      envOverrides: { locationConsentEnforced: true, locationExtendedTriggersEnabled: true, ...envOverrides },
    });
    const listened = await listen(h.app);
    server = listened.server;
    const auth = { authorization: `Bearer ${customerToken(h.env, accountId, h.sessionId)}` };
    const grant = (body?: unknown) =>
      fetch(`${listened.baseUrl}/assets/${phone.id}/location-consent`, {
        method: 'POST',
        headers: body === undefined ? auth : { ...auth, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const report = (triggeredBy?: string) =>
      fetch(`${listened.baseUrl}/assets/${phone.id}/location-report`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ latitude: -25.7, longitude: 28.2, ...(triggeredBy ? { triggeredBy } : {}) }),
      });
    const withdraw = () =>
      fetch(`${listened.baseUrl}/assets/${phone.id}/location`, { method: 'DELETE', headers: auth });
    return { ...h, phone, grant, report, withdraw };
  }

  async function code(res: Response): Promise<string> {
    return ((await res.json()) as { error: { code: string } }).error.code;
  }

  it('refuses a report with 403 CONSENT_REQUIRED when no consent record exists, and stores nothing', async () => {
    const { report, storedEvents, storedAssets, phone } = await setup();
    const res = await report();
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('CONSENT_REQUIRED');
    expect(storedEvents).toHaveLength(0);
    expect(storedAssets.get(phone.id)?.lastLocation).toBeNull();
  });

  it('accepts a report after a grant from the same device, and records device/scopes/version', async () => {
    const { grant, report, storedConsentGrants } = await setup();
    const g = await grant({ scopes: ['foreground', 'periodic'], consentTextVersion: 'inc002-12.3-v1' });
    expect(g.status).toBe(200);
    expect(storedConsentGrants[0]).toMatchObject({
      deviceId: 'device-bound-1',
      scopes: ['foreground', 'periodic'],
      consentTextVersion: 'inc002-12.3-v1',
    });
    expect((await report('foreground_open')).status).toBe(200);
    expect((await report('periodic_foreground')).status).toBe(200);
  });

  it('a body-less grant (pre-A-7 client) covers foreground only', async () => {
    const { grant, report, storedConsentGrants } = await setup();
    expect((await grant()).status).toBe(200);
    expect(storedConsentGrants[0]?.scopes).toEqual(['foreground']);
    expect(storedConsentGrants[0]?.consentTextVersion).toBeNull();
    expect((await report('manual_refresh')).status).toBe(200);
    const periodic = await report('periodic_foreground');
    expect(periodic.status).toBe(403);
    expect(await code(periodic)).toBe('CONSENT_REQUIRED');
  });

  it('refuses the background trigger unless background scope was separately granted', async () => {
    const { grant, report } = await setup();
    await grant({ scopes: ['foreground', 'periodic'] });
    const refused = await report('background');
    expect(refused.status).toBe(403);
    expect(await code(refused)).toBe('CONSENT_REQUIRED');
    await grant({ scopes: ['foreground', 'periodic', 'background'] });
    expect((await report('background')).status).toBe(200);
  });

  it('opt-out takes effect immediately: the next report after DELETE /location is refused', async () => {
    const { grant, report, withdraw } = await setup();
    await grant({ scopes: ['foreground'] });
    expect((await report()).status).toBe(200);
    expect((await withdraw()).status).toBe(200);
    const after = await report();
    expect(after.status).toBe(403);
    expect(await code(after)).toBe('CONSENT_REQUIRED');
  });

  it('a grant bound to another device does not authorise this device (SDL-10)', async () => {
    const { grant, report, setSessionDevice } = await setup();
    setSessionDevice('device-other');
    await grant({ scopes: ['foreground'] });
    setSessionDevice('device-bound-1');
    const res = await report();
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('CONSENT_REQUIRED');
  });

  it('rejects an invalid grant body (unknown scope, missing foreground, extra field)', async () => {
    const { grant } = await setup();
    expect((await grant({ scopes: ['everything'] })).status).toBe(400);
    expect((await grant({ scopes: ['background'] })).status).toBe(400);
    expect((await grant({ scopes: ['foreground'], extra: 1 })).status).toBe(400);
  });

  it('sends an out-of-band notice (security email + push) on grant and on withdrawal, without coordinates', async () => {
    const { grant, withdraw, pushSent, noticesSent } = await setup();
    await grant({ scopes: ['foreground'] });
    await withdraw();
    await new Promise((r) => setTimeout(r, 20));
    expect(noticesSent.map((n) => n.action)).toEqual(['location_tracking_enabled', 'location_tracking_disabled']);
    expect(noticesSent[0]?.assetDisplayName).toBe('My iPhone');
    expect(pushSent.map((p) => p.templateId)).toEqual(['location.tracking.enabled', 'location.tracking.disabled']);
    expect(JSON.stringify(pushSent)).not.toMatch(/-25\.7|28\.2/);
  });

  it('when the switch is off, reports are accepted without a consent record (owner-test migration safety)', async () => {
    const { report } = await setup({ locationConsentEnforced: false });
    expect((await report()).status).toBe(200);
  });

  it('LOCATION_CONSENT_STEP_UP_ENFORCED: opt-in needs a fresh step-up; withdrawal never does', async () => {
    const { grant, withdraw, setSessionMfaVerifiedAt, storedConsentGrants } = await setup({
      locationConsentStepUpEnforced: true,
    });
    const refused = await grant({ scopes: ['foreground'] });
    expect(refused.status).toBe(401);
    expect(await code(refused)).toBe('STEP_UP_REQUIRED');
    expect(storedConsentGrants).toHaveLength(0);
    setSessionMfaVerifiedAt(new Date());
    expect((await grant({ scopes: ['foreground'] })).status).toBe(200);
    setSessionMfaVerifiedAt(null);
    expect((await withdraw()).status).toBe(200);
  });

  describe('Stage 8 PR #44 F-1: withdrawal is recorded before the purge, fail-closed', () => {
    async function setupF1(extra: { failWithdrawal?: boolean } = {}) {
      const accountId = randomUUID();
      const phone = sampleSmartphone(accountId);
      let hook: (() => Promise<void>) | null = null;
      const h = createHarness({
        accountId,
        assets: [phone],
        envOverrides: { locationConsentEnforced: true },
        failWithdrawal: extra.failWithdrawal,
        onReportWrite: async () => {
          if (hook) {
            const run = hook;
            hook = null;
            await run();
          }
        },
      });
      const listened = await listen(h.app);
      server = listened.server;
      const auth = { authorization: `Bearer ${customerToken(h.env, accountId, h.sessionId)}` };
      const call = (path: string, method: string, body?: unknown) =>
        fetch(`${listened.baseUrl}/assets/${phone.id}${path}`, {
          method,
          headers: body === undefined ? auth : { ...auth, 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      return { ...h, phone, call, setHook: (fn: () => Promise<void>) => (hook = fn) };
    }

    it('(a) a report in flight when tracking is turned off is refused and leaves nothing stored', async () => {
      const { call, setHook, storedEvents, storedAssets, phone } = await setupF1();
      await call('/location-consent', 'POST', { scopes: ['foreground'] });
      expect((await call('/location-report', 'POST', { latitude: -25.7, longitude: 28.2 })).status).toBe(200);
      // The withdrawal lands after this report passed its consent check but before it returns.
      setHook(async () => {
        expect((await call('/location', 'DELETE')).status).toBe(200);
      });
      const raced = await call('/location-report', 'POST', { latitude: -25.8, longitude: 28.3 });
      expect(raced.status).toBe(403);
      expect(((await raced.json()) as { error: { code: string } }).error.code).toBe('CONSENT_REQUIRED');
      expect(storedEvents).toHaveLength(0);
      expect(storedAssets.get(phone.id)?.lastLocation).toBeNull();
    });

    it('(b) a failed withdrawal write returns an error and purges nothing; the grant is not reported as off', async () => {
      const { call, storedEvents, storedAssets, phone, storedConsentWithdrawals } = await setupF1({
        failWithdrawal: true,
      });
      await call('/location-consent', 'POST', { scopes: ['foreground'] });
      expect((await call('/location-report', 'POST', { latitude: -25.7, longitude: 28.2 })).status).toBe(200);
      const res = await call('/location', 'DELETE');
      expect(res.status).toBe(500);
      expect(storedConsentWithdrawals).toHaveLength(0);
      expect(storedEvents).toHaveLength(1);
      expect(storedAssets.get(phone.id)?.lastLocation).not.toBeNull();
    });

    it('NB-1: a failing consent lookup with enforcement on returns 500 and stores nothing', async () => {
      const accountId = randomUUID();
      const phone = sampleSmartphone(accountId);
      const h = createHarness({
        accountId,
        assets: [phone],
        envOverrides: { locationConsentEnforced: true },
        failConsentLookup: true,
      });
      const listened = await listen(h.app);
      server = listened.server;
      const res = await fetch(`${listened.baseUrl}/assets/${phone.id}/location-report`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${customerToken(h.env, accountId, h.sessionId)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ latitude: -25.7, longitude: 28.2 }),
      });
      expect(res.status).toBe(500);
      expect(h.storedEvents).toHaveLength(0);
      expect(h.storedAssets.get(phone.id)?.lastLocation).toBeNull();
    });

    it('records the withdrawal before clearing the location (order)', async () => {
      const { call, storedConsentWithdrawals } = await setupF1();
      await call('/location-consent', 'POST', { scopes: ['foreground'] });
      await call('/location-report', 'POST', { latitude: -25.7, longitude: 28.2 });
      const res = await call('/location', 'DELETE');
      expect(res.status).toBe(200);
      expect(storedConsentWithdrawals[0]?.purgedEventCount).toBe(1);
      expect(((await res.json()) as { purgedEventCount: number }).purgedEventCount).toBe(1);
    });
  });
});
