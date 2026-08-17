/**
 * GET /tracking/installation-guide, POST /tracking-devices/register,
 * POST /assets/:assetId/tracking-devices/link, GET /assets/:assetId/tracking-profile
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createTrackingDevicesRouter } from './tracking-devices.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AccountStatus } from '../repositories/accounts.js';
import type { AssetDocument } from '../repositories/assets.js';
import type { TrackingDeviceDocument } from '../repositories/tracking-devices.js';
import type { Env } from '../config/env.js';
import { PENDING_HARDWARE_CAPABILITIES } from '../lib/tracking-device-types.js';

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

function sampleAsset(
  accountId: string,
  overrides: Partial<AssetDocument> = {},
): AssetDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439022',
    accountId,
    assetType: 'vehicle',
    displayName: 'My Toyota',
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
    details: { make: 'Toyota', model: 'Corolla' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createHarness(opts: {
  accountId?: string;
  assets?: AssetDocument[];
  devices?: TrackingDeviceDocument[];
}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = opts.accountId ?? randomUUID();
  const sessionId = randomUUID();
  const storedAssets = new Map<string, AssetDocument>();
  for (const asset of opts.assets ?? []) {
    storedAssets.set(asset.id, asset);
  }
  const storedDevices = new Map<string, TrackingDeviceDocument>();
  for (const device of opts.devices ?? []) {
    storedDevices.set(device.id, device);
  }
  let nextDeviceSuffix = 0x01;

  const ctx = {
    env,
    kv,
    accounts: {
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== accountId) return null;
        return {
          id,
          accountState: 'active',
          mfaRequired: false,
          userType: 'customer',
          partnerOrganizationId: null,
          updatedAt: new Date(),
        };
      },
    },
    assets: {
      async findByIdForAccount(acctId: string, assetId: string) {
        const row = storedAssets.get(assetId);
        return row && row.accountId === acctId ? row : null;
      },
      async linkGpsDevice(acctId: string, assetId: string, gpsDeviceId: string) {
        const row = storedAssets.get(assetId);
        if (!row || row.accountId !== acctId || row.status !== 'active') return null;
        if (row.assetType === 'smartphone') return null;
        const updated = {
          ...row,
          gpsDeviceId,
          gpsPairedAt: new Date(),
          updatedAt: new Date(),
        };
        storedAssets.set(assetId, updated);
        return updated;
      },
    },
    trackingDevices: {
      async registerForAccount(
        acctId: string,
        input: { serialOrImei: string; label?: string | null; deviceTypeId?: string },
      ) {
        const now = new Date();
        const device: TrackingDeviceDocument = {
          id: `507f1f77bcf86cd7994390${(nextDeviceSuffix++).toString(16).padStart(2, '0')}`,
          accountId: acctId,
          providerId: 'hardware_pending',
          serialOrImei: input.serialOrImei.trim().toUpperCase(),
          label: input.label?.trim() || null,
          deviceTypeId: input.deviceTypeId?.trim() || 'gps_tracker_generic',
          status: 'pending_vendor',
          capabilities: PENDING_HARDWARE_CAPABILITIES,
          assetId: null,
          activatedAt: null,
          lastTelemetryAt: null,
          createdAt: now,
          updatedAt: now,
        };
        storedDevices.set(device.id, device);
        return device;
      },
      async findBySerial(serialOrImei: string) {
        const normalized = serialOrImei.trim().toUpperCase();
        return [...storedDevices.values()].find((d) => d.serialOrImei === normalized) ?? null;
      },
      async findByIdForAccount(acctId: string, deviceId: string) {
        const row = storedDevices.get(deviceId);
        return row && row.accountId === acctId ? row : null;
      },
      async findByAssetId(acctId: string, assetId: string) {
        return (
          [...storedDevices.values()].find((d) => d.accountId === acctId && d.assetId === assetId) ??
          null
        );
      },
      async linkToAsset(acctId: string, deviceId: string, assetId: string) {
        const row = storedDevices.get(deviceId);
        if (!row || row.accountId !== acctId) return null;
        if (row.assetId && row.assetId !== assetId) return null;
        const updated = {
          ...row,
          assetId,
          status: 'activating' as const,
          activatedAt: new Date(),
          updatedAt: new Date(),
        };
        storedDevices.set(deviceId, updated);
        return updated;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createTrackingDevicesRouter(ctx));
  app.use(errorHandler);

  return { app, accountId, sessionId, env, storedAssets, storedDevices };
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('tracking-devices routes', () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
    });
    server = undefined;
  });

  it('GET /tracking/installation-guide returns configurable steps', async () => {
    const { app, accountId, sessionId, env } = createHarness({});
    const { server: s, baseUrl } = await listen(app);
    server = s;

    const res = await fetch(`${baseUrl}/tracking/installation-guide`, {
      headers: { Authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string; steps: unknown[] };
    expect(body.title).toBe('GPS tracker installation');
    expect(body.steps.length).toBeGreaterThan(0);
  });

  it('POST /tracking-devices/register creates a pending device', async () => {
    const { app, accountId, sessionId, env } = createHarness({});
    const { server: s, baseUrl } = await listen(app);
    server = s;

    const res = await fetch(`${baseUrl}/tracking-devices/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ serialOrImei: '359876543210987', label: 'Tracker 1' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { serialOrImei: string; status: string } };
    expect(body.data.serialOrImei).toBe('359876543210987');
    expect(body.data.status).toBe('pending_vendor');
  });

  it('POST /tracking-devices/register is idempotent for same serial', async () => {
    const { app, accountId, sessionId, env } = createHarness({});
    const { server: s, baseUrl } = await listen(app);
    server = s;
    const token = customerToken(env, accountId, sessionId);

    const first = await fetch(`${baseUrl}/tracking-devices/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ serialOrImei: 'ABC123456789' }),
    });
    const second = await fetch(`${baseUrl}/tracking-devices/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ serialOrImei: 'abc123456789' }),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const a = (await first.json()) as { data: { id: string } };
    const b = (await second.json()) as { data: { id: string } };
    expect(a.data.id).toBe(b.data.id);
  });

  it('POST link connects device to non-smartphone asset', async () => {
    const accountId = randomUUID();
    const asset = sampleAsset(accountId);
    const { app, sessionId, env, storedAssets } = createHarness({ accountId, assets: [asset] });
    const { server: s, baseUrl } = await listen(app);
    server = s;
    const token = customerToken(env, accountId, sessionId);

    const registerRes = await fetch(`${baseUrl}/tracking-devices/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ serialOrImei: 'IMEI999888777' }),
    });
    const { data: device } = (await registerRes.json()) as { data: { id: string } };

    const linkRes = await fetch(`${baseUrl}/assets/${asset.id}/tracking-devices/link`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingDeviceId: device.id }),
    });

    expect(linkRes.status).toBe(200);
    const linked = (await linkRes.json()) as {
      data: { device: { status: string }; profile: { providerId: string } };
    };
    expect(linked.data.device.status).toBe('activating');
    expect(linked.data.profile.providerId).toBe('hardware_pending');
    expect(storedAssets.get(asset.id)?.gpsDeviceId).toBe(device.id);
  });

  it('POST link rejects smartphone assets', async () => {
    const accountId = randomUUID();
    const asset = sampleAsset(accountId, { assetType: 'smartphone' });
    const { app, sessionId, env } = createHarness({ accountId, assets: [asset] });
    const { server: s, baseUrl } = await listen(app);
    server = s;
    const token = customerToken(env, accountId, sessionId);

    const registerRes = await fetch(`${baseUrl}/tracking-devices/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ serialOrImei: 'IMEI111222333' }),
    });
    const { data: device } = (await registerRes.json()) as { data: { id: string } };

    const linkRes = await fetch(`${baseUrl}/assets/${asset.id}/tracking-devices/link`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingDeviceId: device.id }),
    });

    expect(linkRes.status).toBe(400);
  });

  it('GET /assets/:assetId/tracking-profile resolves hardware_pending when no device', async () => {
    const accountId = randomUUID();
    const asset = sampleAsset(accountId);
    const { app, sessionId, env } = createHarness({ accountId, assets: [asset] });
    const { server: s, baseUrl } = await listen(app);
    server = s;

    const res = await fetch(`${baseUrl}/assets/${asset.id}/tracking-profile`, {
      headers: { Authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { providerLabel: string; device: null } };
    expect(body.data.providerLabel).toBe('No tracker linked');
    expect(body.data.device).toBeNull();
  });
});
