/**
 * GET /admin/assets* — RBAC, pagination, ADR-0006 R-1 Trail B bulk audit.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAdminLocationsRouter } from './admin-locations.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AccountRow, AccountStatus } from '../repositories/accounts.js';
import type {
  AdminAccessBulkDisclosureInput,
  AdminAccessDetailInput,
  AdminAccessStateChangeInput,
} from '../repositories/admin-access-log.js';
import type { AssetDocument } from '../repositories/assets.js';
import type { TrackingDeviceDocument } from '../repositories/tracking-devices.js';
import type { LocationEventDocument } from '../repositories/location-events.js';
import type { LocationConsentEventDocument } from '../repositories/location-consent-log.js';
import type { Env } from '../config/env.js';

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

function sampleAsset(accountId: string, id = '507f1f77bcf86cd799439021'): AssetDocument {
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
  assets?: AssetDocument[];
  devices?: TrackingDeviceDocument[];
  events?: LocationEventDocument[];
  consent?: LocationConsentEventDocument[];
  customerId?: string;
  mfaVerifiedAt?: Date | null;
  sessionRevokedAt?: Date | null;
}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const adminId = randomUUID();
  const sessionId = randomUUID();
  const bulkCalls: AdminAccessBulkDisclosureInput[] = [];
  const detailCalls: AdminAccessDetailInput[] = [];
  const stateChangeCalls: AdminAccessStateChangeInput[] = [];
  const stored = new Map<string, AssetDocument>();
  const registered: TrackingDeviceDocument[] = [];
  const stateCalls: AdminAccessStateChangeInput[] = [];
  const historyCalls: Array<{ accountId: string; assetId: string; limit: number }> = [];
  for (const a of opts.assets ?? []) {
    stored.set(a.id, a);
  }

  const sessionRecord = {
    id: sessionId,
    accountId: adminId,
    revokedAt: opts.sessionRevokedAt ?? null,
    mfaVerifiedAt: opts.mfaVerifiedAt !== undefined ? opts.mfaVerifiedAt : new Date(),
  };

  const stubAccount: AccountRow = {
    id: adminId,
    userType: 'admin',
    accountState: 'active',
    email: 'admin@example.com',
    phone: null,
    mfaRequired: true,
    partnerOrganizationId: null,
    invitedBy: null,
    createdAt: new Date(),
  };

  const ctx = {
    env,
    kv,
    sessions: {
      async findById(id: string) {
        return id === sessionId ? { ...sessionRecord } : null;
      },
    },
    accounts: {
      async findById(id: string): Promise<AccountRow | null> {
        if (id === adminId) return stubAccount;
        if (opts.customerId && id === opts.customerId) return { ...stubAccount, id, userType: 'customer', mfaRequired: false };
        return null;
      },
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== adminId) return null;
        return {
          id: adminId,
          accountState: 'active',
          mfaRequired: true,
          userType: 'admin',
          partnerOrganizationId: null,
          updatedAt: new Date(),
        };
      },
    },
    assets: {
      async listLocatedForAdmin(filters: { source?: 'phone' | 'hardware' }, limit: number) {
        return [...stored.values()]
          .filter((x) => x.lastLocation !== null)
          .filter((x) => (filters.source === 'phone' ? x.locationSource === 'self_device' : true))
          .filter((x) => (filters.source === 'hardware' ? x.gpsDeviceId !== null : true))
          .slice(0, limit);
      },
      async findByIdForAdmin(id: string) {
        return stored.get(id) ?? null;
      },
    },
    locationEvents: {
      async listByAsset(accountId: string, assetId: string, limit: number) {
        historyCalls.push({ accountId, assetId, limit });
        return (opts.events ?? []).filter((e) => e.accountId === accountId && e.assetId === assetId).slice(0, limit);
      },
    },
    locationConsentLog: {
      async findLatestByAsset(accountId: string, assetId: string) {
        const rows = (opts.consent ?? []).filter((c) => c.accountId === accountId && c.assetId === assetId);
        return rows.length ? rows[rows.length - 1] : null;
      },
    },
    trackingDevices: {
      async findManyByIdsForAdmin(ids: string[]) {
        return (opts.devices ?? []).filter((d) => ids.includes(d.id));
      },
    },
    adminAccessLog: {
      async recordBulkDisclosure(input: AdminAccessBulkDisclosureInput): Promise<void> {
        bulkCalls.push(input);
      },
      async recordDetail(input: AdminAccessDetailInput): Promise<void> {
        detailCalls.push(input);
      },
      async recordStateChange(input: AdminAccessStateChangeInput): Promise<void> {
        stateChangeCalls.push(input);
        stateCalls.push(input);
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAdminLocationsRouter(ctx));
  app.use(errorHandler);

  let server: Server | undefined;
  let baseUrl = '';

  return {
    adminId,
    sessionId,
    bulkCalls,
    historyCalls,
    registered,
    detailCalls,
    stateChangeCalls,
    stored,
    token: adminToken(env, adminId, sessionId),
    async start() {
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const addr = server!.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    },
    async stop() {
      await new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    url(path: string) {
      return `${baseUrl}${path}`;
    },
  };
}


function device(over: Partial<TrackingDeviceDocument> = {}): TrackingDeviceDocument {
  const now = new Date();
  return {
    id: '507f1f77bcf86cd799439100',
    accountId: randomUUID(),
    providerId: 'hardware',
    serialOrImei: '869890083100051',
    label: 'Pilot unit',
    deviceTypeId: 'gps_tracker_generic',
    status: 'active',
    capabilities: {} as TrackingDeviceDocument['capabilities'],
    assetId: null,
    activatedAt: now,
    lastTelemetryAt: now,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}


const loc = (over: Partial<AssetDocument> = {}, accountId: string = randomUUID(), id = '507f1f77bcf86cd799439021'): AssetDocument => ({
  ...sampleAsset(accountId, id),
  lastLocation: { latitude: -26.2, longitude: 28.04, accuracyMeters: null, recordedAt: new Date(Date.now() - 120_000) },
  ...over,
});

describe('routes/admin-locations', () => {
  let harness: ReturnType<typeof createHarness>;
  afterEach(async () => {
    if (harness) await harness.stop();
  });
  const get = (h: ReturnType<typeof createHarness>, qs = '') =>
    fetch(h.url(`/admin/locations${qs}`), { headers: { authorization: `Bearer ${h.token}` } });

  it('lists phones and hardware-tracked assets together, joins the tracker, and audits the disclosure', async () => {
    const a1 = randomUUID();
    const phone = loc({ assetType: 'smartphone', displayName: 'iPhone 15', locationSource: 'self_device' }, a1, '507f1f77bcf86cd799439031');
    const car = loc({ assetType: 'vehicle', displayName: 'Toyota Hilux', gpsDeviceId: '507f1f77bcf86cd799439100' }, a1, '507f1f77bcf86cd799439032');
    const noFix = { ...sampleAsset(a1, '507f1f77bcf86cd799439033'), lastLocation: null };
    const dev = device({ id: '507f1f77bcf86cd799439100' });
    harness = createHarness({ assets: [phone, car, noFix], devices: [dev] });
    await harness.start();
    const res = await get(harness);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ assetName: string; source: string; freshness: string; device: { id: string } | null }> };
    expect(body.data.map((r) => r.assetName).sort()).toEqual(['Toyota Hilux', 'iPhone 15']); // the asset with no fix is not listed
    expect(body.data.find((r) => r.source === 'phone')).toMatchObject({ assetName: 'iPhone 15', freshness: 'online', device: null });
    expect(body.data.find((r) => r.source === 'hardware')!.device).toMatchObject({ id: '507f1f77bcf86cd799439100' });
    expect(harness.bulkCalls).toHaveLength(1);
    expect(harness.bulkCalls[0]).toMatchObject({ resourceType: 'asset', endpoint: 'GET /v1/admin/locations', resultCount: 2, disclosedAccountIds: [a1], actorAccountId: harness.adminId });
  });

  it('filters by source', async () => {
    const a = randomUUID();
    harness = createHarness({
      assets: [
        loc({ assetType: 'smartphone', locationSource: 'self_device' }, a, '507f1f77bcf86cd799439041'),
        loc({ gpsDeviceId: '507f1f77bcf86cd799439100' }, a, '507f1f77bcf86cd799439042'),
      ],
    });
    await harness.start();
    expect(((await (await get(harness, '?source=phone')).json()) as { data: unknown[] }).data).toHaveLength(1);
    expect(((await (await get(harness, '?source=hardware')).json()) as { data: unknown[] }).data).toHaveLength(1);
  });

  it('rejects an unknown source', async () => {
    harness = createHarness({});
    await harness.start();
    expect((await get(harness, '?source=bogus')).status).toBe(400);
  });

  it('is admin only: a customer gets 403 and nothing is disclosed', async () => {
    const env = fakeEnv();
    const token = signAccessToken(
      { sub: randomUUID(), user_type: 'customer', mfa_required: false, account_state: 'active', partner_organization_id: null, session_id: randomUUID() },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;
    harness = createHarness({ assets: [loc()] });
    await harness.start();
    const res = await fetch(harness.url('/admin/locations'), { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
    expect(harness.bulkCalls).toHaveLength(0);
  });

  it('is not available to a security-company operator (partner access is case-scoped, ADR-0017)', async () => {
    const env = fakeEnv();
    const token = signAccessToken(
      { sub: randomUUID(), user_type: 'security_company_operator', mfa_required: true, account_state: 'active', partner_organization_id: randomUUID(), session_id: randomUUID() },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;
    harness = createHarness({ assets: [loc()] });
    await harness.start();
    const res = await fetch(harness.url('/admin/locations'), { headers: { authorization: `Bearer ${token}` } });
    expect([401, 403]).toContain(res.status);
    expect(harness.bulkCalls).toHaveLength(0);
  });

  it('requires a token', async () => {
    harness = createHarness({});
    await harness.start();
    expect((await fetch(harness.url('/admin/locations'))).status).toBe(401);
  });
});

describe('routes/admin-locations GET /admin/assets/:assetId/location', () => {
  let harness: ReturnType<typeof createHarness>;
  afterEach(async () => {
    if (harness) await harness.stop();
  });
  const ASSET = '507f1f77bcf86cd799439051';
  const getOne = (h: ReturnType<typeof createHarness>, id = ASSET, token = h.token) =>
    fetch(h.url(`/admin/assets/${id}/location`), { headers: { authorization: `Bearer ${token}` } });
  const event = (accountId: string, n: number, over: Partial<LocationEventDocument> = {}): LocationEventDocument => ({
    id: `507f1f77bcf86cd7994392${String(n).padStart(2, '0')}`,
    accountId,
    assetId: ASSET,
    latitude: -26.2 + n / 1000,
    longitude: 28.04,
    accuracyMeters: 12,
    recordedAt: new Date(Date.now() - n * 60_000),
    receivedAt: new Date(),
    source: 'self_device',
    triggeredBy: 'foreground_open',
    deviceId: null,
    ...over,
  });
  const consentEvent = (accountId: string, eventType: 'granted' | 'withdrawn'): LocationConsentEventDocument =>
    ({ id: randomUUID(), accountId, assetId: ASSET, eventType, createdAt: new Date() }) as unknown as LocationConsentEventDocument;

  it('returns the last known location, tracker and recent history, and audits the access with the owner as subject', async () => {
    const owner = randomUUID();
    const car = loc({ assetType: 'vehicle', gpsDeviceId: '507f1f77bcf86cd799439100',
      lastLocation: { latitude: -26.2, longitude: 28.04, accuracyMeters: 8, recordedAt: new Date(Date.now() - 120_000) } }, owner, ASSET);
    harness = createHarness({
      assets: [car],
      devices: [device({ id: '507f1f77bcf86cd799439100', accountId: owner, assetId: ASSET })],
      events: [event(owner, 1, { source: 'hardware' }), event(owner, 2, { source: 'hardware' }), event(randomUUID(), 3)],
      consent: [consentEvent(owner, 'granted')],
    });
    await harness.start();
    const res = await getOne(harness);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, unknown> & { history: Array<{ source: string }> } };
    expect(data).toMatchObject({
      assetId: ASSET,
      accountId: owner,
      trackingOff: false,
      source: 'hardware',
      freshness: 'online',
      lastLocation: { latitude: -26.2, longitude: 28.04, accuracyMeters: 8 },
      trackingDevice: { id: '507f1f77bcf86cd799439100', status: 'active' },
    });
    expect(data.history).toHaveLength(2); // another account's events never join this asset
    expect(data.history[0].source).toBe('hardware');
    expect(harness.historyCalls[0]).toEqual({ accountId: owner, assetId: ASSET, limit: 20 });
    expect(harness.detailCalls).toHaveLength(1);
    expect(harness.detailCalls[0]).toMatchObject({
      resourceType: 'asset_location', // distinct from an ordinary asset view (DSAR/POPIA reporting)
      resourceId: ASSET,
      targetAccountId: owner,
      actorAccountId: harness.adminId,
      endpoint: 'GET /v1/admin/assets/{assetId}/location',
    });
    expect(JSON.stringify(harness.detailCalls[0])).not.toContain('-26.2'); // no coordinates in the audit row
  });

  it('says tracking is off after consent withdrawal and never resurrects a position', async () => {
    const owner = randomUUID();
    const phone = loc({ assetType: 'smartphone', locationSource: 'self_device' }, owner, ASSET); // stray value
    harness = createHarness({
      assets: [phone],
      events: [event(owner, 1)],
      consent: [consentEvent(owner, 'granted'), consentEvent(owner, 'withdrawn')],
    });
    await harness.start();
    const res = await getOne(harness);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    expect(data).toMatchObject({ trackingOff: true, trackingOffReason: 'withdrawn', lastLocation: null, history: [], source: null, freshness: 'never' });
    expect(harness.historyCalls).toHaveLength(0);
    expect(harness.detailCalls).toHaveLength(1);
  });

  it('a newer grant after a withdrawal turns tracking back on', async () => {
    const owner = randomUUID();
    harness = createHarness({
      assets: [loc({ assetType: 'smartphone', locationSource: 'self_device' }, owner, ASSET)],
      consent: [consentEvent(owner, 'withdrawn'), consentEvent(owner, 'granted')],
    });
    await harness.start();
    const { data } = (await (await getOne(harness)).json()) as { data: Record<string, unknown> };
    expect(data).toMatchObject({ trackingOff: false, source: 'phone' });
  });

  it('fails closed: no consent record at all means tracking off, even with a stored position', async () => {
    const owner = randomUUID();
    harness = createHarness({
      assets: [loc({ assetType: 'vehicle', gpsDeviceId: '507f1f77bcf86cd799439100' }, owner, ASSET)],
      events: [event(owner, 1, { source: 'hardware' })],
    });
    await harness.start();
    const { data } = (await (await getOne(harness)).json()) as { data: Record<string, unknown> };
    expect(data).toMatchObject({ trackingOff: true, trackingOffReason: 'no_consent', lastLocation: null, history: [] });
    expect(harness.historyCalls).toHaveLength(0);
    expect(harness.detailCalls).toHaveLength(1);
  });

  it('an archived (removed) asset never returns a location, even with a grant on record', async () => {
    const owner = randomUUID();
    harness = createHarness({
      assets: [loc({ assetType: 'smartphone', locationSource: 'self_device', status: 'removed' }, owner, ASSET)],
      events: [event(owner, 1)],
      consent: [consentEvent(owner, 'granted')],
    });
    await harness.start();
    const { data } = (await (await getOne(harness)).json()) as { data: Record<string, unknown> };
    expect(data).toMatchObject({ trackingOff: true, trackingOffReason: 'archived', lastLocation: null, history: [] });
    expect(harness.historyCalls).toHaveLength(0);
    expect(harness.detailCalls[0]).toMatchObject({ resourceType: 'asset_location' });
  });

  it('empty state: consent granted but no position yet, still audited', async () => {
    const owner = randomUUID();
    harness = createHarness({ assets: [{ ...sampleAsset(owner, ASSET), lastLocation: null }], consent: [consentEvent(owner, 'granted')] });
    await harness.start();
    const { data } = (await (await getOne(harness)).json()) as { data: Record<string, unknown> };
    expect(data).toMatchObject({ trackingOff: false, trackingOffReason: null, lastLocation: null, history: [], trackingDevice: null, freshness: 'never' });
    expect(harness.detailCalls).toHaveLength(1);
  });

  it('404s an unknown or malformed asset id without auditing', async () => {
    harness = createHarness({});
    await harness.start();
    expect((await getOne(harness)).status).toBe(404);
    expect((await getOne(harness, 'not-an-id')).status).toBe(404);
    expect(harness.detailCalls).toHaveLength(0);
  });

  it('is admin only: a customer (even the owner) gets 403 and nothing is audited or read', async () => {
    const env = fakeEnv();
    const owner = randomUUID();
    const token = signAccessToken(
      { sub: owner, user_type: 'customer', mfa_required: false, account_state: 'active', partner_organization_id: null, session_id: randomUUID() },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;
    harness = createHarness({ assets: [loc({}, owner, ASSET)] });
    await harness.start();
    expect((await getOne(harness, ASSET, token)).status).toBe(403);
    expect(harness.detailCalls).toHaveLength(0);
    expect(harness.historyCalls).toHaveLength(0);
  });

  it('requires a token', async () => {
    harness = createHarness({});
    await harness.start();
    expect((await fetch(harness.url(`/admin/assets/${ASSET}/location`))).status).toBe(401);
  });
});
