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
import type { PolicyDocument } from '../repositories/policies.js';
import type { Env } from '../config/env.js';
import type { IdempotencyRepo } from '../repositories/idempotency.js';
import { essentialPlanFixture, plusPlanFixture } from '../lib/plan-test-fixtures.js';

const ESSENTIAL_PLAN_ID = '507f1f77bcf86cd799439088';
const PLUS_PLAN_ID = '507f1f77bcf86cd799439089';

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
    callCentreNotes: [],
    lastLocationAt: null,
    lastLocation: null,
    legalHold: false,
    closedAt: null,
    sapsCaseNumber: null,
    reportingStation: null,
    reportedToPoliceAt: null,
    policeReportHistory: [],
    policeReportReminderSentAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function samplePolicy(accountId: string, planCatalogId: string): PolicyDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439010',
    accountId,
    planTier: planCatalogId === PLUS_PLAN_ID ? 'plus' : 'essential',
    planCatalogId,
    status: 'active',
    coverageLimits: [],
    billing: {
      provider: null,
      externalCustomerId: null,
      externalSubscriptionId: null,
      billingStatus: 'not_configured',
      currency: 'ZAR',
      amount: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      nextBillingAt: null,
      cancelAt: null,
    },
    effectiveDate: now,
    renewalDate: null,
    cancelledAt: null,
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
  planCatalogId?: string | null;
}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = opts.accountId ?? randomUUID();
  const sessionId = randomUUID();
  const assets = new Map((opts.assets ?? []).map((a) => [a.id, a]));
  const cases = [...(opts.cases ?? [])];
  const policy = opts.planCatalogId ? samplePolicy(accountId, opts.planCatalogId) : null;

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
      // Feature 011 — a faithful-enough fake of repositories/recovery-cases.ts's real
      // setPoliceReportFields for route-level (validation/HTTP-shape) testing. The
      // repository's own logic is exercised directly in repositories/recovery-cases.test.ts.
      async setPoliceReportFields(
        acctId: string,
        caseId: string,
        actorAccountId: string,
        changes: Partial<{
          sapsCaseNumber: string | null;
          reportingStation: string | null;
          reportedToPoliceAt: Date | null;
        }>,
      ) {
        const idx = cases.findIndex((c) => c.accountId === acctId && c.id === caseId);
        if (idx < 0) return { ok: false as const, reason: 'not_found' as const };
        const current = cases[idx]!;

        const cutoff = new Date();
        cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
        if (
          current.status === 'closed' &&
          current.closedAt != null &&
          !current.legalHold &&
          current.closedAt <= cutoff
        ) {
          return { ok: false as const, reason: 'retention_expired' as const };
        }

        const toDateOnlyString = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
        const newEntries: RecoveryCaseDocument['policeReportHistory'] = [];
        const setUpdate: Partial<RecoveryCaseDocument> = {};

        if ('sapsCaseNumber' in changes) {
          const previousValue = current.sapsCaseNumber ?? null;
          const newValue = changes.sapsCaseNumber ?? null;
          if (previousValue !== newValue) {
            newEntries.push({ actorAccountId, field: 'sapsCaseNumber', previousValue, newValue, changedAt: new Date() });
            setUpdate.sapsCaseNumber = newValue;
          }
        }
        if ('reportingStation' in changes) {
          const previousValue = current.reportingStation ?? null;
          const newValue = changes.reportingStation ?? null;
          if (previousValue !== newValue) {
            newEntries.push({ actorAccountId, field: 'reportingStation', previousValue, newValue, changedAt: new Date() });
            setUpdate.reportingStation = newValue;
          }
        }
        if ('reportedToPoliceAt' in changes) {
          const previousValue = toDateOnlyString(current.reportedToPoliceAt ?? null);
          const newValue = toDateOnlyString(changes.reportedToPoliceAt ?? null);
          if (previousValue !== newValue) {
            newEntries.push({ actorAccountId, field: 'reportedToPoliceAt', previousValue, newValue, changedAt: new Date() });
            setUpdate.reportedToPoliceAt = changes.reportedToPoliceAt ?? null;
          }
        }

        if (newEntries.length === 0) return { ok: true as const, case: current };
        if (current.policeReportHistory.length + newEntries.length > 50) {
          return { ok: false as const, reason: 'history_limit_exceeded' as const };
        }

        const updated: RecoveryCaseDocument = {
          ...current,
          ...setUpdate,
          policeReportHistory: [...current.policeReportHistory, ...newEntries],
          updatedAt: new Date(),
        };
        cases[idx] = updated;
        return { ok: true as const, case: updated };
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
    policies: {
      async listByAccount(acctId: string, limit: number) {
        if (!policy || policy.accountId !== acctId) return [];
        return [policy].slice(0, limit);
      },
    },
    planCatalog: {
      async findById(id: string) {
        if (id === ESSENTIAL_PLAN_ID) return essentialPlanFixture(id);
        if (id === PLUS_PLAN_ID) return plusPlanFixture(id);
        return null;
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

  it('returns 403 PLAN_FEATURE_NOT_INCLUDED for Essential plan theft reports', async () => {
    const assetId = '507f1f77bcf86cd799439021';
    const acctId = randomUUID();
    const { app, accountId, sessionId, env } = createHarness({
      accountId: acctId,
      assets: [sampleAsset(acctId, assetId)],
      planCatalogId: ESSENTIAL_PLAN_ID,
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

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('PLAN_FEATURE_NOT_INCLUDED');
  });

  it('allows theft reports on Plus plan and above', async () => {
    const assetId = '507f1f77bcf86cd799439021';
    const acctId = randomUUID();
    const { app, accountId, sessionId, env } = createHarness({
      accountId: acctId,
      assets: [sampleAsset(acctId, assetId)],
      planCatalogId: PLUS_PLAN_ID,
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

    expect(res.status).toBe(201);
  });

  it('GET /recovery/cases and GET /recovery/cases/:caseId include a policeReport sub-object', async () => {
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
    const listBody = (await listRes.json()) as { data: Array<{ policeReport: unknown }> };
    expect(listBody.data[0]!.policeReport).toEqual({
      sapsCaseNumber: null,
      reportingStation: null,
      reportedToPoliceAt: null,
      history: [],
    });

    const detailRes = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const detailBody = (await detailRes.json()) as { policeReport: unknown };
    expect(detailBody.policeReport).toEqual({
      sapsCaseNumber: null,
      reportingStation: null,
      reportedToPoliceAt: null,
      history: [],
    });
  });

  describe('PATCH /recovery/cases/:caseId/police-report — Feature 011', () => {
    it('sets fields and returns the full updated case, including history', async () => {
      const accountId = randomUUID();
      const assetId = '507f1f77bcf86cd799439021';
      const existing = sampleCase(accountId, assetId);
      const { app, sessionId, env } = createHarness({ accountId, cases: [existing] });
      const listened = await listen(app);
      server = listened.server;
      const token = customerToken(env, accountId, sessionId);

      const res = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sapsCaseNumber: '123/01/2026', reportingStation: 'Sandton SAPS' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        policeReport: { sapsCaseNumber: string | null; reportingStation: string | null; history: unknown[] };
      };
      expect(body.policeReport.sapsCaseNumber).toBe('123/01/2026');
      expect(body.policeReport.reportingStation).toBe('Sandton SAPS');
      expect(body.policeReport.history).toHaveLength(2);
    });

    it('accepts a single field and independently editable fields across calls (BR-011-05)', async () => {
      const accountId = randomUUID();
      const assetId = '507f1f77bcf86cd799439021';
      const existing = sampleCase(accountId, assetId);
      const { app, sessionId, env } = createHarness({ accountId, cases: [existing] });
      const listened = await listen(app);
      server = listened.server;
      const token = customerToken(env, accountId, sessionId);

      const first = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reportingStation: 'Sandton SAPS' }),
      });
      expect(first.status).toBe(200);

      const second = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sapsCaseNumber: '123/01/2026' }),
      });
      expect(second.status).toBe(200);
      const body = (await second.json()) as {
        policeReport: { sapsCaseNumber: string | null; reportingStation: string | null; history: unknown[] };
      };
      expect(body.policeReport.reportingStation).toBe('Sandton SAPS');
      expect(body.policeReport.sapsCaseNumber).toBe('123/01/2026');
      expect(body.policeReport.history).toHaveLength(2);
    });

    it('rejects a body with no recognized fields', async () => {
      const accountId = randomUUID();
      const assetId = '507f1f77bcf86cd799439021';
      const existing = sampleCase(accountId, assetId);
      const { app, sessionId, env } = createHarness({ accountId, cases: [existing] });
      const listened = await listen(app);
      server = listened.server;
      const token = customerToken(env, accountId, sessionId);

      const res = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('rejects sapsCaseNumber shorter than 3 characters, accepts an unusual real-world format (BR-011-02)', async () => {
      const accountId = randomUUID();
      const assetId = '507f1f77bcf86cd799439021';
      const existing = sampleCase(accountId, assetId);
      const { app, sessionId, env } = createHarness({ accountId, cases: [existing] });
      const listened = await listen(app);
      server = listened.server;
      const token = customerToken(env, accountId, sessionId);

      const tooShort = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sapsCaseNumber: 'AB' }),
      });
      expect(tooShort.status).toBe(400);

      const unusualFormat = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sapsCaseNumber: '  CAS 45/2/26  ' }),
      });
      expect(unusualFormat.status).toBe(200);
      const body = (await unusualFormat.json()) as { policeReport: { sapsCaseNumber: string | null } };
      expect(body.policeReport.sapsCaseNumber).toBe('CAS 45/2/26');
    });

    it('rejects a reportedToPoliceAt with a time component', async () => {
      const accountId = randomUUID();
      const assetId = '507f1f77bcf86cd799439021';
      const existing = sampleCase(accountId, assetId);
      const { app, sessionId, env } = createHarness({ accountId, cases: [existing] });
      const listened = await listen(app);
      server = listened.server;
      const token = customerToken(env, accountId, sessionId);

      const res = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reportedToPoliceAt: '2026-08-02T10:00:00.000Z' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 for a case owned by a different account (no enumeration)', async () => {
      const accountId = randomUUID();
      const otherAccountId = randomUUID();
      const assetId = '507f1f77bcf86cd799439021';
      const existing = sampleCase(otherAccountId, assetId);
      const { app, sessionId, env } = createHarness({ accountId, cases: [existing] });
      const listened = await listen(app);
      server = listened.server;
      const token = customerToken(env, accountId, sessionId);

      const res = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sapsCaseNumber: '123/01/2026' }),
      });
      expect(res.status).toBe(404);
    });

    it('accepts an edit on a closed case (api-design.md §2.3 — no status gate)', async () => {
      const accountId = randomUUID();
      const assetId = '507f1f77bcf86cd799439021';
      const existing = { ...sampleCase(accountId, assetId), status: 'closed' as const, closedAt: new Date() };
      const { app, sessionId, env } = createHarness({ accountId, cases: [existing] });
      const listened = await listen(app);
      server = listened.server;
      const token = customerToken(env, accountId, sessionId);

      const res = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sapsCaseNumber: '123/01/2026' }),
      });
      expect(res.status).toBe(200);
    });

    it('rejects an edit on a case whose retention window has already expired (SR-011-2)', async () => {
      const accountId = randomUUID();
      const assetId = '507f1f77bcf86cd799439021';
      const longAgo = new Date();
      longAgo.setUTCFullYear(longAgo.getUTCFullYear() - 6);
      const existing = { ...sampleCase(accountId, assetId), status: 'closed' as const, closedAt: longAgo };
      const { app, sessionId, env } = createHarness({ accountId, cases: [existing] });
      const listened = await listen(app);
      server = listened.server;
      const token = customerToken(env, accountId, sessionId);

      const res = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sapsCaseNumber: '123/01/2026' }),
      });
      expect(res.status).toBe(409);
    });

    it('does not append a history entry when the resubmitted value is unchanged (api-design.md §2.5 no-op suppression)', async () => {
      const accountId = randomUUID();
      const assetId = '507f1f77bcf86cd799439021';
      const existing = sampleCase(accountId, assetId);
      const { app, sessionId, env } = createHarness({ accountId, cases: [existing] });
      const listened = await listen(app);
      server = listened.server;
      const token = customerToken(env, accountId, sessionId);

      const first = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sapsCaseNumber: '123/01/2026' }),
      });
      expect((await first.json() as { policeReport: { history: unknown[] } }).policeReport.history).toHaveLength(1);

      const second = await fetch(`${listened.baseUrl}/recovery/cases/${existing.id}/police-report`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sapsCaseNumber: '123/01/2026' }),
      });
      expect(second.status).toBe(200);
      const body = (await second.json()) as { policeReport: { history: unknown[] } };
      expect(body.policeReport.history).toHaveLength(1);
    });
  });
});
