/**
 * GET /admin/assets* — RBAC, pagination, ADR-0006 R-1 Trail B bulk audit.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAdminAssetsRouter } from './admin-assets.js';
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
        return id === adminId ? stubAccount : null;
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
      async listForAdmin(_filters: { accountId?: string; status?: string; assetType?: string }, limit: number) {
        return [...stored.values()].slice(0, limit);
      },
      async findByIdForAdmin(assetId: string) {
        return stored.get(assetId) ?? null;
      },
      async countActiveGlobal() {
        return [...stored.values()].filter((a) => a.status !== 'removed').length;
      },
      async markRemovedForAdmin(assetId: string) {
        const existing = stored.get(assetId);
        if (!existing || existing.status === 'removed') return null;
        const updated: AssetDocument = { ...existing, status: 'removed', updatedAt: new Date('2026-09-01T00:00:00.000Z') };
        stored.set(assetId, updated);
        return updated;
      },
      async setLegalHoldForAdmin(assetId: string, legalHold: boolean) {
        const existing = stored.get(assetId);
        if (!existing) return null;
        const updated: AssetDocument = { ...existing, legalHold, updatedAt: new Date('2026-09-01T00:00:00.000Z') };
        stored.set(assetId, updated);
        return updated;
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
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAdminAssetsRouter(ctx));
  app.use(errorHandler);

  let server: Server | undefined;
  let baseUrl = '';

  return {
    adminId,
    sessionId,
    bulkCalls,
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

describe('routes/admin-assets', () => {
  let harness: ReturnType<typeof createHarness>;

  afterEach(async () => {
    if (harness) await harness.stop();
  });

  describe('GET /admin/assets/count (Admin Home KPI row)', () => {
    it('counts everything except removed assets, and records a zero-resultCount disclosure', async () => {
      harness = createHarness({
        assets: [
          { ...sampleAsset(randomUUID(), '507f1f77bcf86cd799439031'), status: 'active' },
          { ...sampleAsset(randomUUID(), '507f1f77bcf86cd799439032'), status: 'inactive' },
          { ...sampleAsset(randomUUID(), '507f1f77bcf86cd799439033'), status: 'removed' },
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/admin/assets/count'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { count: number } };
      expect(body.data.count).toBe(2);

      expect(harness.bulkCalls).toHaveLength(1);
      expect(harness.bulkCalls[0]).toMatchObject({
        disclosedAccountIds: [],
        resultCount: 0,
        resourceType: 'asset',
        endpoint: 'GET /v1/admin/assets/count',
        actorAccountId: harness.adminId,
        actorSessionId: harness.sessionId,
      });
    });

    it('returns 403, not the count, for a non-admin caller', async () => {
      const env = fakeEnv();
      const customerId = randomUUID();
      const token = signAccessToken(
        {
          sub: customerId,
          user_type: 'customer',
          mfa_required: false,
          account_state: 'active',
          partner_organization_id: null,
          session_id: randomUUID(),
        },
        env.jwtSigningKeys,
        env.jwtActiveKid,
      ).token;

      harness = createHarness({});
      await harness.start();
      const res = await fetch(harness.url('/admin/assets/count'), {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(403);
    });
  });

  it('returns 403 for non-admin callers', async () => {
    const env = fakeEnv();
    const customerId = randomUUID();
    const token = signAccessToken(
      {
        sub: customerId,
        user_type: 'customer',
        mfa_required: false,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    harness = createHarness({});
    await harness.start();
    const res = await fetch(harness.url('/admin/assets'), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('list call records Trail B bulk disclosure with resultCount = page size', async () => {
    const subjectA = randomUUID();
    const subjectB = randomUUID();
    harness = createHarness({
      assets: [
        sampleAsset(subjectA, '507f1f77bcf86cd799439021'),
        sampleAsset(subjectB, '507f1f77bcf86cd799439022'),
      ],
    });
    await harness.start();

    const res = await fetch(harness.url('/admin/assets'), {
      headers: { authorization: `Bearer ${harness.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(2);

    expect(harness.bulkCalls).toHaveLength(1);
    expect(harness.bulkCalls[0]?.resultCount).toBe(2);
    expect(harness.bulkCalls[0]?.resourceType).toBe('asset');
    expect(harness.bulkCalls[0]?.endpoint).toBe('GET /v1/admin/assets');
    expect([...harness.bulkCalls[0]!.disclosedAccountIds].sort()).toEqual([subjectA, subjectB].sort());
  });

  it('SECURITY: detail response never includes lastLocation, even when the asset has one', async () => {
    const subjectId = randomUUID();
    const asset = sampleAsset(subjectId);
    asset.lastLocation = { latitude: -26.2041, longitude: 28.0473, accuracyMeters: 10, recordedAt: new Date() };
    asset.locationSource = 'self_device';
    harness = createHarness({ assets: [asset] });
    await harness.start();

    const res = await fetch(harness.url(`/admin/assets/${asset.id}`), {
      headers: { authorization: `Bearer ${harness.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // cybersecurity-architect ruling, 2026-10-05: admin detail view must never
    // return a customer's precise coordinate with no case context — this was a
    // live exposure (serializeAdminAsset spread serializeAsset wholesale)
    // until this commit. Every other field stays available; only the
    // coordinate itself is withheld.
    expect(body).not.toHaveProperty('lastLocation');
    expect(body.id).toBe(asset.id);
    expect(body.displayName).toBe('Work laptop');
  });

  it('detail call records privileged_data_access for the subject viewed', async () => {
    const subjectId = randomUUID();
    const asset = sampleAsset(subjectId);
    harness = createHarness({ assets: [asset] });
    await harness.start();

    const res = await fetch(harness.url(`/admin/assets/${asset.id}`), {
      headers: { authorization: `Bearer ${harness.token}` },
    });
    expect(res.status).toBe(200);

    expect(harness.detailCalls).toHaveLength(1);
    expect(harness.detailCalls[0]?.targetAccountId).toBe(subjectId);
    expect(harness.detailCalls[0]?.resourceId).toBe(asset.id);
    expect(harness.detailCalls[0]?.resourceType).toBe('asset');
    expect(harness.detailCalls[0]?.endpoint).toBe('GET /v1/admin/assets/{assetId}');
  });

  it('list returns summary projection without details or estimatedValue (SR-004-admin-6)', async () => {
    const subjectId = randomUUID();
    harness = createHarness({ assets: [sampleAsset(subjectId)] });
    await harness.start();

    const res = await fetch(harness.url('/admin/assets'), {
      headers: { authorization: `Bearer ${harness.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    expect(body.data[0]).toHaveProperty('displayName');
    expect(body.data[0]).not.toHaveProperty('details');
    expect(body.data[0]).not.toHaveProperty('estimatedValue');
    expect(body.data[0]).not.toHaveProperty('photos');
  });

  describe('PATCH /admin/assets/:assetId (archive/remove — business-owner gap report item 3)', () => {
    it('admin can archive an active asset — status becomes removed, state-change audit written', async () => {
      const subjectId = randomUUID();
      const asset = sampleAsset(subjectId);
      harness = createHarness({ assets: [asset] });
      await harness.start();

      const res = await fetch(harness.url(`/admin/assets/${asset.id}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'removed', reason: 'Asset reported sold by customer.' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe('removed');

      expect(harness.stateChangeCalls).toHaveLength(1);
      expect(harness.stateChangeCalls[0]).toMatchObject({
        resourceType: 'asset',
        resourceId: asset.id,
        fromStatus: 'active',
        toStatus: 'removed',
        reason: 'Asset reported sold by customer.',
        targetAccountId: subjectId,
        actorAccountId: harness.adminId,
      });
    });

    it('archiving an already-removed asset returns 409, no audit written', async () => {
      const asset = { ...sampleAsset(randomUUID()), status: 'removed' as const };
      harness = createHarness({ assets: [asset] });
      await harness.start();

      const res = await fetch(harness.url(`/admin/assets/${asset.id}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'removed' }),
      });
      expect(res.status).toBe(409);
      expect(harness.stateChangeCalls).toHaveLength(0);
    });

    it('returns 404 for an unknown asset id', async () => {
      harness = createHarness({});
      await harness.start();

      const res = await fetch(harness.url('/admin/assets/507f1f77bcf86cd799439099'), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'removed' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects a body with a status other than removed', async () => {
      const asset = sampleAsset(randomUUID());
      harness = createHarness({ assets: [asset] });
      await harness.start();

      const res = await fetch(harness.url(`/admin/assets/${asset.id}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      expect(res.status).toBe(400);
    });

    it('requires step-up — stale mfaVerifiedAt returns STEP_UP_REQUIRED, asset unchanged', async () => {
      const asset = sampleAsset(randomUUID());
      harness = createHarness({ assets: [asset], mfaVerifiedAt: new Date(Date.now() - 16 * 60 * 1000) });
      await harness.start();

      const res = await fetch(harness.url(`/admin/assets/${asset.id}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'removed' }),
      });
      expect(res.status).toBe(401);
      expect(harness.stored.get(asset.id)?.status).toBe('active');
    });

    it('returns 403 for a non-admin caller', async () => {
      const env = fakeEnv();
      const token = signAccessToken(
        {
          sub: randomUUID(),
          user_type: 'customer',
          mfa_required: false,
          account_state: 'active',
          partner_organization_id: null,
          session_id: randomUUID(),
        },
        env.jwtSigningKeys,
        env.jwtActiveKid,
      ).token;
      const asset = sampleAsset(randomUUID());
      harness = createHarness({ assets: [asset] });
      await harness.start();

      const res = await fetch(harness.url(`/admin/assets/${asset.id}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'removed' }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /admin/assets/:assetId/legal-hold (business-owner gap report item 4)', () => {
    it('admin can place an asset on legal hold — audit written with legal_hold_on/off markers', async () => {
      const subjectId = randomUUID();
      const asset = sampleAsset(subjectId);
      harness = createHarness({ assets: [asset] });
      await harness.start();

      const res = await fetch(harness.url(`/admin/assets/${asset.id}/legal-hold`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ legalHold: true, reason: 'Subpoena received.' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { legalHold: boolean };
      expect(body.legalHold).toBe(true);

      expect(harness.stateChangeCalls).toHaveLength(1);
      expect(harness.stateChangeCalls[0]).toMatchObject({
        resourceType: 'asset',
        fromStatus: 'legal_hold_off',
        toStatus: 'legal_hold_on',
        reason: 'Subpoena received.',
      });
    });

    it('is idempotent — setting the same value again is a 200 no-op with no new audit row', async () => {
      const asset = { ...sampleAsset(randomUUID()), legalHold: true };
      harness = createHarness({ assets: [asset] });
      await harness.start();

      const res = await fetch(harness.url(`/admin/assets/${asset.id}/legal-hold`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ legalHold: true }),
      });
      expect(res.status).toBe(200);
      expect(harness.stateChangeCalls).toHaveLength(0);
    });

    it('returns 404 for an unknown asset id', async () => {
      harness = createHarness({});
      await harness.start();

      const res = await fetch(harness.url('/admin/assets/507f1f77bcf86cd799439099/legal-hold'), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ legalHold: true }),
      });
      expect(res.status).toBe(404);
    });

    it('requires step-up', async () => {
      const asset = sampleAsset(randomUUID());
      harness = createHarness({ assets: [asset], mfaVerifiedAt: null });
      await harness.start();

      const res = await fetch(harness.url(`/admin/assets/${asset.id}/legal-hold`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ legalHold: true }),
      });
      expect(res.status).toBe(401);
    });
  });
});
