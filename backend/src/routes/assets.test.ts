/**
 * Customer `/assets` routes — polymorphic validation, ownership, account gate.
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
import type { AssetDocument } from '../repositories/assets.js';
import type { Env } from '../config/env.js';
import type { IdempotencyRepo } from '../repositories/idempotency.js';
import type { CreateAssetBody } from '../lib/asset-validation.js';

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
  const rows = new Map<string, { requestHash: string; responseStatus: number; responseBody: unknown }>();
  return {
    async find(endpoint, key) {
      const row = rows.get(`${endpoint}:${key}`);
      return row
        ? {
            endpoint,
            idempotencyKey: key,
            accountId: null,
            requestHash: row.requestHash,
            responseStatus: row.responseStatus,
            responseBody: row.responseBody,
            createdAt: new Date(),
          }
        : null;
    },
    async store(record) {
      rows.set(`${record.endpoint}:${record.idempotencyKey}`, {
        requestHash: record.requestHash,
        responseStatus: record.responseStatus,
        responseBody: record.responseBody,
      });
    },
  };
}

function sampleAsset(accountId: string, id = '507f1f77bcf86cd799439022'): AssetDocument {
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
    legalHold: false,
    details: { brand: 'Dell', model: 'XPS', serialNumber: 'SN123' },
    createdAt: now,
    updatedAt: now,
  };
}

function createHarness(opts: { accountId?: string; accountState?: AccountStatus['accountState']; assets?: AssetDocument[] }) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = opts.accountId ?? randomUUID();
  const sessionId = randomUUID();
  const storedAssets = new Map<string, AssetDocument>();
  for (const asset of opts.assets ?? []) {
    storedAssets.set(asset.id, asset);
  }

  const ctx = {
    env,
    kv,
    accounts: {
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== accountId) return null;
        return {
          id: accountId,
          accountState: opts.accountState ?? 'active',
          mfaRequired: false,
          userType: 'customer',
          partnerOrganizationId: null,
          updatedAt: new Date(),
        };
      },
    },
    assets: {
      async createForAccount(acctId: string, body: CreateAssetBody): Promise<AssetDocument> {
        const now = new Date();
        const asset: AssetDocument = {
          id: '507f1f77bcf86cd799439088',
          accountId: acctId,
          assetType: body.assetType,
          displayName: body.displayName,
          status: 'active',
          registeredAt: now,
          estimatedValue: body.estimatedValue
            ? { ...body.estimatedValue, asOf: now }
            : null,
          photos: [],
          gpsDeviceId: null,
          gpsPairedAt: null,
          legalHold: false,
          details: body.details as Record<string, unknown>,
          createdAt: now,
          updatedAt: now,
        };
        storedAssets.set(asset.id, asset);
        return asset;
      },
      async listByAccount(acctId: string, limit: number) {
        return [...storedAssets.values()].filter((a) => a.accountId === acctId).slice(0, limit);
      },
      async findByIdForAccount(acctId: string, assetId: string) {
        const row = storedAssets.get(assetId);
        return row && row.accountId === acctId ? row : null;
      },
      async countActiveByAccount(acctId: string) {
        return [...storedAssets.values()].filter((a) => a.accountId === acctId && a.status !== 'removed').length;
      },
      async updateForAccount(acctId: string, assetId: string, patch: Partial<AssetDocument>) {
        const row = storedAssets.get(assetId);
        if (!row || row.accountId !== acctId || row.status === 'removed') return null;
        const updated = { ...row, ...patch, updatedAt: new Date() };
        storedAssets.set(assetId, updated);
        return updated;
      },
      async markRemovedForAccount(acctId: string, assetId: string) {
        const row = storedAssets.get(assetId);
        if (!row || row.accountId !== acctId || row.status === 'removed') return null;
        const updated = { ...row, status: 'removed' as const, updatedAt: new Date() };
        storedAssets.set(assetId, updated);
        return updated;
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
      async notifyAssetCreated() {},
      async notifyAssetUpdated() {},
      async notifyAssetRemoved() {},
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAssetsRouter(ctx));
  app.use(errorHandler);

  return { app, accountId, sessionId, env };
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('POST /assets', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('registers a laptop with matching details shape', async () => {
    const { app, accountId, sessionId, env } = createHarness({});
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({
        assetType: 'laptop',
        displayName: 'Work laptop',
        details: { brand: 'Dell', model: 'XPS 13', serialNumber: 'ABC123' },
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { assetType: string; status: string; details: Record<string, string> };
    expect(body.assetType).toBe('laptop');
    expect(body.status).toBe('active');
    expect(body.details.serialNumber).toBe('ABC123');
  });

  it('rejects vehicle details missing required vin', async () => {
    const { app, accountId, sessionId, env } = createHarness({});
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({
        assetType: 'vehicle',
        displayName: 'My car',
        details: { make: 'Toyota', model: 'Corolla', year: 2020 },
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 when account is not active', async () => {
    const { app, accountId, sessionId, env } = createHarness({ accountState: 'pending_verification' });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({
        assetType: 'smartphone',
        displayName: 'Phone',
        details: { brand: 'Apple', model: 'iPhone', imei: '123456789012345' },
      }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
  });
});

describe('GET /assets', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('lists only assets for the authenticated account', async () => {
    const accountId = randomUUID();
    const otherAccount = randomUUID();
    const ownAsset = sampleAsset(accountId, '507f1f77bcf86cd799439011');
    const otherAsset = sampleAsset(otherAccount, '507f1f77bcf86cd799439012');
    const { app, sessionId, env } = createHarness({
      accountId,
      assets: [ownAsset, otherAsset],
    });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets`, {
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Array<{ id: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(ownAsset.id);
  });
});

describe('GET /assets/:assetId', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('returns 404 for another account asset', async () => {
    const otherAccount = randomUUID();
    const asset = sampleAsset(otherAccount);
    const { app, accountId, sessionId, env } = createHarness({ assets: [asset] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${asset.id}`, {
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(404);
  });
});

describe('PATCH /assets/:assetId', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('updates displayName and returns 200', async () => {
    const accountId = randomUUID();
    const asset = sampleAsset(accountId);
    const { app, sessionId, env } = createHarness({ accountId, assets: [asset] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${asset.id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'Updated laptop' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { displayName: string };
    expect(body.displayName).toBe('Updated laptop');
  });
});

describe('DELETE /assets/:assetId', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('soft-deletes an asset', async () => {
    const accountId = randomUUID();
    const asset = sampleAsset(accountId);
    const { app, sessionId, env } = createHarness({ accountId, assets: [asset] });
    const listened = await listen(app);
    server = listened.server;

    const response = await fetch(`${listened.baseUrl}/assets/${asset.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${customerToken(env, accountId, sessionId)}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('removed');
  });
});
