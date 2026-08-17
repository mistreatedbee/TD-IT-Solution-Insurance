/**
 * Customer `/recovery/cases*` routes — ownership scoping, idempotency, duplicate guard.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createRecoveryRouter } from './recovery.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AccountStatus } from '../repositories/accounts.js';
import type { AssetDocument } from '../repositories/assets.js';
import type { RecoveryCaseDocument } from '../repositories/recovery-cases.js';
import type { Env } from '../config/env.js';
import type { IdempotencyRepo } from '../repositories/idempotency.js';

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

function customerToken(env: Env, accountId: string, sessionId: string, accountState = 'active'): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: 'customer',
      mfa_required: false,
      account_state: accountState,
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
    // Mirrors repositories/idempotency.ts's real `account_id is not distinct
    // from $3` scoping — a stored row belonging to a different account must
    // never be replayed to this caller (cross-account IDOR guard).
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

function sampleCase(accountId: string, assetId: string, id = '507f1f77bcf86cd799439099'): RecoveryCaseDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id,
    accountId,
    assetId,
    partnerOrganizationId: null,
    status: 'open',
    referenceNumber: 'RC-20260801-ABCD',
    reportedAt: now,
    notes: 'Stolen from office',
    lastLocationAt: null,
    lastLocation: null,
    legalHold: false,
    createdAt: now,
    updatedAt: now,
  };
}

function createHarness(opts: {
  accountId?: string;
  accountState?: AccountStatus['accountState'];
  assets?: AssetDocument[];
  cases?: RecoveryCaseDocument[];
}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = opts.accountId ?? randomUUID();
  const sessionId = randomUUID();
  const assets = new Map((opts.assets ?? []).map((a) => [a.id, a]));
  const cases = [...(opts.cases ?? [])];

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
      async findByIdForAccount(acctId: string, assetId: string) {
        const row = assets.get(assetId);
        return row && row.accountId === acctId ? row : null;
      },
    },
    recoveryCases: {
      async createForAccount(acctId: string, assetId: string, notes: string | null) {
        const created = sampleCase(acctId, assetId, '507f1f77bcf86cd799439088');
        created.notes = notes;
        cases.push(created);
        return created;
      },
      async listByAccount(acctId: string, limit: number) {
        return cases.filter((c) => c.accountId === acctId).slice(0, limit);
      },
      async findByIdForAccount(acctId: string, caseId: string) {
        return cases.find((c) => c.accountId === acctId && c.id === caseId) ?? null;
      },
      async getLocationForCase(acctId: string, caseId: string) {
        const doc = cases.find((c) => c.accountId === acctId && c.id === caseId);
        return doc?.lastLocation ?? null;
      },
    },
    idempotency: createInMemoryIdempotencyRepo(),
    recoveryNotifications: {
      async notifyTheftReportSubmitted() {
        return undefined;
      },
      async notifySecurityOperatorsTheftReported() {
        return undefined;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createRecoveryRouter(ctx));
  app.use(errorHandler);

  return { app, accountId, sessionId, env, cases };
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('routes/recovery', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('creates a recovery case for an active customer with idempotency', async () => {
    const assetId = '507f1f77bcf86cd799439021';
    const acctId = randomUUID();
    const { app, accountId, sessionId, env } = createHarness({
      accountId: acctId,
      assets: [sampleAsset(acctId, assetId)],
    });
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/recovery/cases`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ assetId, notes: 'Stolen yesterday' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.assetId).toBe(assetId);
    expect(body.status).toBe('open');
    expect(body.referenceNumber).toMatch(/^RC-/);
  });

  it('returns 409 when an open case already exists for the asset', async () => {
    const assetId = '507f1f77bcf86cd799439021';
    const acctId = randomUUID();
    const { app, accountId, sessionId, env } = createHarness({
      accountId: acctId,
      assets: [sampleAsset(acctId, assetId)],
      cases: [sampleCase(acctId, assetId)],
    });
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/recovery/cases`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${customerToken(env, accountId, sessionId)}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ assetId }),
    });

    expect(res.status).toBe(409);
  });

  it('lists and returns detail for the caller own cases', async () => {
    const accountId = randomUUID();
    const assetId = '507f1f77bcf86cd799439021';
    const existing = sampleCase(accountId, assetId);
    const { app, sessionId, env } = createHarness({ accountId, cases: [existing] });
    const listened = await listen(app);
    server = listened.server;
    const token = customerToken(env, accountId, sessionId);

    const listRes = await fetch(`${listened.baseUrl}/recovery/cases`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { data: Array<{ id: string }> };
    expect(listBody.data).toHaveLength(1);

    const detailRes = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as { id: string };
    expect(detailBody.id).toBe(existing.id);
  });

  it('returns 403 for non-customer callers', async () => {
    const env = fakeEnv();
    const adminId = randomUUID();
    const token = signAccessToken(
      {
        sub: adminId,
        user_type: 'admin',
        mfa_required: true,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;
    const { app } = createHarness({});
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/recovery/cases`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});
