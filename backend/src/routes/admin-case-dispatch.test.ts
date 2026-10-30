/**
 * GET/POST /admin/dispatch/cases/* — OB-03 §2 admin dispatch router.
 * Mirrors `routes/admin-partner-organizations.test.ts`'s harness pattern.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAdminCaseDispatchRouter } from './admin-case-dispatch.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { PartnerOrganizationDocument } from '../repositories/partner-organizations.js';
import type { RecoveryCaseDocument, PendingDispatchApproval } from '../repositories/recovery-cases.js';

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
  } as unknown as Env;
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

function partnerToken(env: Env, accountId: string, sessionId: string, orgId: string): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: 'security_company_operator',
      mfa_required: false,
      account_state: 'active',
      partner_organization_id: orgId,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
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

function sampleCase(overrides: Partial<RecoveryCaseDocument> = {}): RecoveryCaseDocument {
  const now = new Date('2026-10-29T00:00:00.000Z');
  return {
    id: randomUUID().replace(/-/g, '').slice(0, 24),
    accountId: randomUUID(),
    assetId: randomUUID(),
    partnerOrganizationId: null,
    status: 'open',
    referenceNumber: 'RC-20261029-ABCD',
    reportedAt: now,
    notes: null,
    callCentreNotes: [],
    lastLocationAt: null,
    lastLocation: null,
    legalHold: false,
    dispatchStatus: null,
    dispatchedAt: null,
    dispatchedBy: null,
    acceptedAt: null,
    firstDispatchedAt: null,
    dispatchCount: 0,
    pendingApproval: null,
    reportedFromDeviceId: null,
    closedAt: null,
    closeReason: null,
    sapsCaseNumber: null,
    reportingStation: null,
    reportedToPoliceAt: null,
    policeReportHistory: [],
    policeReportReminderSentAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sampleOrg(overrides: Partial<PartnerOrganizationDocument> = {}): PartnerOrganizationDocument {
  const now = new Date('2026-10-23T00:00:00.000Z');
  return {
    id: randomUUID(),
    name: 'Acme Recovery',
    status: 'active',
    contactEmail: 'ops@acme.example',
    notes: null,
    agreementStatus: 'executed',
    agreementReference: 'AGR-001',
    effectiveFrom: now,
    terminatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createHarness(
  opts: {
    cases?: RecoveryCaseDocument[];
    orgs?: PartnerOrganizationDocument[];
    mfaVerifiedAt?: Date | null;
    onDispatchPush?: (params: Record<string, unknown>) => void;
  } = {},
) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const adminId = randomUUID();
  const admin2Id = randomUUID();
  const customerId = randomUUID();
  const partnerOrgId = randomUUID();
  const sessionId = randomUUID();
  const session2Id = randomUUID();

  const cases = new Map<string, RecoveryCaseDocument>();
  for (const c of opts.cases ?? []) cases.set(c.id, c);
  const orgs = new Map<string, PartnerOrganizationDocument>();
  for (const o of opts.orgs ?? []) orgs.set(o.id, o);

  const auditRows: unknown[] = [];

  const sessionRecord = {
    id: sessionId,
    accountId: adminId,
    revokedAt: null,
    mfaVerifiedAt: opts.mfaVerifiedAt !== undefined ? opts.mfaVerifiedAt : new Date(),
  };
  const session2Record = {
    id: session2Id,
    accountId: admin2Id,
    revokedAt: null,
    mfaVerifiedAt: new Date(),
  };

  const ctx = {
    env,
    kv,
    sessions: {
      async findById(id: string) {
        if (id === sessionId) return { ...sessionRecord };
        if (id === session2Id) return { ...session2Record };
        return null;
      },
    },
    auditLog: {
      async recordBulkDisclosure(input: unknown) {
        auditRows.push({ kind: 'trail-a-bulk', input });
      },
    },
    adminAccessLog: {
      async recordDetail(input: unknown) {
        auditRows.push({ kind: 'detail', input });
      },
      async recordCaseBulkDisclosure(input: unknown) {
        auditRows.push({ kind: 'case-bulk', input });
      },
      async recordStateChange(input: unknown) {
        auditRows.push({ kind: 'state-change', input });
      },
    },
    partnerOrganizations: {
      async findById(id: string) {
        return orgs.get(id) ?? null;
      },
    },
    recoveryCases: {
      async listForAdminDispatchQueue(
        filters: { status?: string; dispatchStatus?: string },
        limit: number,
      ) {
        let rows = [...cases.values()];
        if (filters.status) rows = rows.filter((c) => c.status === filters.status);
        if (filters.dispatchStatus === 'undispatched') rows = rows.filter((c) => c.dispatchStatus === null);
        else if (filters.dispatchStatus) rows = rows.filter((c) => c.dispatchStatus === filters.dispatchStatus);
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows.slice(0, limit);
      },
      async countForAdminDispatchQueue(filters: { status?: string; dispatchStatus?: string }) {
        let rows = [...cases.values()];
        if (filters.status) rows = rows.filter((c) => c.status === filters.status);
        if (filters.dispatchStatus === 'undispatched') rows = rows.filter((c) => c.dispatchStatus === null);
        else if (filters.dispatchStatus) rows = rows.filter((c) => c.dispatchStatus === filters.dispatchStatus);
        return rows.length;
      },
      async findByIdForAdmin(caseId: string) {
        return cases.get(caseId) ?? null;
      },
      async dispatchCase(caseId: string, input: { partnerOrganizationId: string; dispatchedBy: string }) {
        const existing = cases.get(caseId);
        if (!existing || existing.dispatchStatus !== null) return null;
        const now = new Date();
        const updated: RecoveryCaseDocument = {
          ...existing,
          partnerOrganizationId: input.partnerOrganizationId,
          dispatchStatus: 'pending',
          dispatchedAt: now,
          dispatchedBy: input.dispatchedBy,
          acceptedAt: null,
          firstDispatchedAt: existing.firstDispatchedAt ?? now,
          dispatchCount: existing.dispatchCount + 1,
          updatedAt: now,
        };
        cases.set(caseId, updated);
        return updated;
      },
      async reDispatchToNull(caseId: string) {
        const existing = cases.get(caseId);
        if (!existing) return null;
        const now = new Date();
        const updated: RecoveryCaseDocument = {
          ...existing,
          partnerOrganizationId: null,
          dispatchStatus: null,
          acceptedAt: null,
          dispatchedBy: null,
          updatedAt: now,
        };
        cases.set(caseId, updated);
        return updated;
      },
      async reDispatchToOrgDirect(
        caseId: string,
        input: { targetPartnerOrganizationId: string; actorAccountId: string },
      ) {
        const existing = cases.get(caseId);
        if (!existing) return null;
        const now = new Date();
        const updated: RecoveryCaseDocument = {
          ...existing,
          partnerOrganizationId: input.targetPartnerOrganizationId,
          dispatchStatus: 'pending',
          dispatchedAt: now,
          dispatchedBy: input.actorAccountId,
          acceptedAt: null,
          firstDispatchedAt: existing.firstDispatchedAt ?? now,
          dispatchCount: existing.dispatchCount + 1,
          updatedAt: now,
        };
        cases.set(caseId, updated);
        return updated;
      },
      async createPendingDispatchApproval(caseId: string, approval: PendingDispatchApproval) {
        const existing = cases.get(caseId);
        if (!existing) return null;
        const updated: RecoveryCaseDocument = { ...existing, pendingApproval: approval, updatedAt: new Date() };
        cases.set(caseId, updated);
        return updated;
      },
      async approvePendingDispatch(
        caseId: string,
        input: { pendingApprovalId: string; approvingAdminAccountId: string },
      ) {
        const existing = cases.get(caseId);
        if (!existing || !existing.pendingApproval || existing.pendingApproval.id !== input.pendingApprovalId) {
          return { outcome: 'not_found' as const };
        }
        const pending = existing.pendingApproval;
        if (pending.requestedBy === input.approvingAdminAccountId) {
          return { outcome: 'same_admin' as const };
        }
        const snapshotStillMatches =
          pending.expiresAt.getTime() >= Date.now() &&
          pending.snapshot.partnerOrganizationId === existing.partnerOrganizationId &&
          pending.snapshot.dispatchStatus === existing.dispatchStatus &&
          pending.snapshot.status === existing.status;
        if (!snapshotStillMatches) {
          return { outcome: 'snapshot_mismatch' as const };
        }
        const now = new Date();
        const updated: RecoveryCaseDocument = {
          ...existing,
          partnerOrganizationId: pending.requestedTargetOrgId,
          dispatchStatus: 'pending',
          dispatchedAt: now,
          dispatchedBy: pending.requestedBy,
          acceptedAt: null,
          firstDispatchedAt: existing.firstDispatchedAt ?? now,
          dispatchCount: existing.dispatchCount + 1,
          pendingApproval: null,
          updatedAt: now,
        };
        cases.set(caseId, updated);
        return { outcome: 'ok' as const, case: updated };
      },
    },
    assets: {
      async findByIdForAdmin() {
        return { id: randomUUID(), assetType: 'laptop', reportingDeviceId: null };
      },
    },
    recoveryNotifications: {
      async notifyPartnerOrgCaseDispatched(params: Record<string, unknown>) {
        opts.onDispatchPush?.(params);
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/api/v1', createAdminCaseDispatchRouter(ctx));
  app.use(errorHandler);

  return {
    app,
    adminId,
    admin2Id,
    customerId,
    partnerOrgId,
    sessionId,
    session2Id,
    env,
    cases,
    orgs,
    auditRows,
    adminBearer: `Bearer ${adminToken(env, adminId, sessionId)}`,
    admin2Bearer: `Bearer ${adminToken(env, admin2Id, session2Id)}`,
    customerBearer: `Bearer ${customerToken(env, customerId, sessionId)}`,
    partnerBearer: `Bearer ${partnerToken(env, randomUUID(), sessionId, partnerOrgId)}`,
  };
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/api/v1` });
    });
  });
}

describe('routes/admin-case-dispatch', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  describe('GET /admin/dispatch/cases', () => {
    it('returns 401 when unauthenticated', async () => {
      const { app } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for a partner-org caller', async () => {
      const { app, partnerBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases`, {
        headers: { authorization: partnerBearer },
      });
      expect(res.status).toBe(403);
    });

    it('returns 403 for a customer caller', async () => {
      const { app, customerBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases`, {
        headers: { authorization: customerBearer },
      });
      expect(res.status).toBe(403);
    });

    it('lists cases for an admin, excluding lastLocation/lastLocationAt [A8]', async () => {
      const kase = sampleCase({ lastLocation: { latitude: 1, longitude: 2 }, lastLocationAt: new Date() } as never);
      const { app, adminBearer } = createHarness({ cases: [kase] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases`, {
        headers: { authorization: adminBearer },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<Record<string, unknown>> };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).not.toHaveProperty('lastLocation');
      expect(body.data[0]).not.toHaveProperty('lastLocationAt');
      expect(body.data[0]?.dispatchStatus).toBe('undispatched');
    });

    it('[SE-1] rejects a $ne-shaped dispatchStatus query value with 400, not a widened query', async () => {
      const { app, adminBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(
        `${listened.baseUrl}/admin/dispatch/cases?dispatchStatus[$ne]=null`,
        { headers: { authorization: adminBearer } },
      );
      expect(res.status).toBe(400);
    });

    it('[SE-1] rejects a $ne-shaped status query value with 400', async () => {
      const { app, adminBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases?status[$ne]=closed`, {
        headers: { authorization: adminBearer },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /admin/dispatch/cases/count', () => {
    it('is registered before :caseId (BA-4) — resolves to the count handler, not a 400 caseId mismatch', async () => {
      const { app, adminBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/count`, {
        headers: { authorization: adminBearer },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { count: number } };
      expect(body.data.count).toBe(0);
    });

    it('[SE-1] rejects a $ne-shaped query value with 400', async () => {
      const { app, adminBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/count?dispatchStatus[$ne]=null`, {
        headers: { authorization: adminBearer },
      });
      expect(res.status).toBe(400);
    });

    it('counts matching cases', async () => {
      const kase = sampleCase();
      const { app, adminBearer } = createHarness({ cases: [kase] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/count?dispatchStatus=undispatched`, {
        headers: { authorization: adminBearer },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { count: number } };
      expect(body.data.count).toBe(1);
    });
  });

  describe('GET /admin/dispatch/cases/:caseId', () => {
    it('returns 404 for an unknown case', async () => {
      const { app, adminBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${'a'.repeat(24)}`, {
        headers: { authorization: adminBearer },
      });
      expect(res.status).toBe(404);
    });

    it('[A8] includes lastLocation on detail and writes a per-subject Trail B row', async () => {
      const kase = sampleCase({ lastLocation: { latitude: 1, longitude: 2 } as never, lastLocationAt: new Date() });
      const { app, adminBearer, auditRows } = createHarness({ cases: [kase] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}`, {
        headers: { authorization: adminBearer },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { lastLocation: unknown } };
      expect(body.data.lastLocation).toEqual({ latitude: 1, longitude: 2 });
      expect(auditRows.some((r) => (r as { kind: string }).kind === 'detail')).toBe(true);
    });
  });

  describe('POST /admin/dispatch/cases/:caseId/dispatch', () => {
    it('returns 401 STEP_UP_REQUIRED when MFA is not fresh', async () => {
      const kase = sampleCase();
      const org = sampleOrg();
      const { app, adminBearer } = createHarness({ cases: [kase], orgs: [org], mfaVerifiedAt: null });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ partnerOrganizationId: org.id }),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('STEP_UP_REQUIRED');
    });

    it('dispatches an undispatched case to an eligible org', async () => {
      const kase = sampleCase();
      const org = sampleOrg();
      const { app, adminBearer, auditRows } = createHarness({ cases: [kase], orgs: [org] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ partnerOrganizationId: org.id }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { dispatchStatus: string; dispatchCount: number } };
      expect(body.data.dispatchStatus).toBe('pending');
      expect(body.data.dispatchCount).toBe(1);
      expect(auditRows.some((r) => (r as { kind: string }).kind === 'state-change')).toBe(true);
    });

    it('[CO-OB03-2] sends the target-org-only push at dispatch time, with no assetId in the payload', async () => {
      const kase = sampleCase();
      const org = sampleOrg();
      let captured: Record<string, unknown> | undefined;
      const { app, adminBearer } = createHarness({
        cases: [kase],
        orgs: [org],
        onDispatchPush: (params) => {
          captured = params;
        },
      });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ partnerOrganizationId: org.id }),
      });

      expect(res.status).toBe(200);
      expect(captured).toBeDefined();
      expect(captured?.partnerOrganizationId).toBe(org.id);
      expect(captured).not.toHaveProperty('assetId');
    });

    it('[A2] rejects dispatch to a non-eligible (not executed) org with 422', async () => {
      const kase = sampleCase();
      const org = sampleOrg({ agreementStatus: null });
      const { app, adminBearer } = createHarness({ cases: [kase], orgs: [org] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ partnerOrganizationId: org.id }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('DISPATCH_TARGET_NOT_ELIGIBLE');
    });

    it('[A2] rejects dispatch to a terminated org with 422', async () => {
      const kase = sampleCase();
      const org = sampleOrg({ agreementStatus: 'terminated', terminatedAt: new Date() });
      const { app, adminBearer } = createHarness({ cases: [kase], orgs: [org] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ partnerOrganizationId: org.id }),
      });
      expect(res.status).toBe(422);
    });

    it('returns 409 when the case is already dispatched', async () => {
      const org = sampleOrg();
      const kase = sampleCase({ dispatchStatus: 'pending', partnerOrganizationId: org.id });
      const { app, adminBearer } = createHarness({ cases: [kase], orgs: [org] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ partnerOrganizationId: org.id }),
      });
      expect(res.status).toBe(409);
    });

    it('[SE-1] rejects a non-uuid partnerOrganizationId body with 400', async () => {
      const kase = sampleCase();
      const { app, adminBearer } = createHarness({ cases: [kase] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ partnerOrganizationId: { $ne: null } }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/dispatch/cases/:caseId/re-dispatch', () => {
    it('[A9(iii)] rejects a same-holder target with 422 NO_OP_TARGET', async () => {
      const org = sampleOrg();
      const kase = sampleCase({ dispatchStatus: 'pending', partnerOrganizationId: org.id, firstDispatchedAt: new Date() });
      const { app, adminBearer } = createHarness({ cases: [kase], orgs: [org] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/re-dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: org.id, reason: 'other' }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('NO_OP_TARGET');
    });

    it('returns a case to the queue (null target) single-admin, with status reflecting returned_to_queue', async () => {
      const org = sampleOrg();
      const kase = sampleCase({ dispatchStatus: 'pending', partnerOrganizationId: org.id, firstDispatchedAt: new Date() });
      const { app, adminBearer } = createHarness({ cases: [kase], orgs: [org] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/re-dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: null, reason: 'admin_recall' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { dispatchStatus: string; partnerOrganizationId: string | null } };
      expect(body.data.dispatchStatus).toBe('undispatched');
      expect(body.data.partnerOrganizationId).toBeNull();
    });

    it('[A4] a never-dispatched case re-dispatched to a different org is single-admin (200), not pending-approval', async () => {
      const org1 = sampleOrg();
      const org2 = sampleOrg();
      // dispatchStatus null (currently undispatched) + firstDispatchedAt null (never
      // dispatched before) — the gate's condition (a) is false.
      const kase = sampleCase({ dispatchStatus: null, partnerOrganizationId: null, firstDispatchedAt: null });
      const { app, adminBearer } = createHarness({ cases: [kase], orgs: [org1, org2] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/re-dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: org2.id, reason: 'other' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { dispatchStatus: string; partnerOrganizationId: string } };
      expect(body.data.dispatchStatus).toBe('pending');
      expect(body.data.partnerOrganizationId).toBe(org2.id);
    });

    it('[A4] a previously-dispatched case re-dispatched to a different org requires second-admin approval (202)', async () => {
      const org1 = sampleOrg();
      const org2 = sampleOrg();
      const kase = sampleCase({
        dispatchStatus: null,
        partnerOrganizationId: null,
        firstDispatchedAt: new Date('2026-10-01T00:00:00.000Z'),
      });
      const { app, adminBearer } = createHarness({ cases: [kase], orgs: [org1, org2] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/re-dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: org2.id, reason: 'partner_declined' }),
      });
      expect(res.status).toBe(202);
      const body = (await res.json()) as { data: { pendingApprovalId: string } };
      expect(typeof body.data.pendingApprovalId).toBe('string');
    });

    it('[A4] null-then-dispatch bypass is closed: a null re-dispatch followed by a plain dispatch to a different org still requires approval via re-dispatch, not a plain dispatch call', async () => {
      // Regression for the G-1 compositional-bypass finding: after
      // null-then-dispatch, firstDispatchedAt survives, so the SECOND call
      // must go through re-dispatch (not plain dispatch, since
      // dispatchStatus is null again and a plain dispatch would otherwise
      // single-admin it). This test exercises the re-dispatch path directly
      // to confirm the gate is keyed on firstDispatchedAt, not on dispatch
      // being the literal previous call.
      const org1 = sampleOrg();
      const org2 = sampleOrg();
      const kase = sampleCase({
        dispatchStatus: null,
        partnerOrganizationId: null,
        firstDispatchedAt: new Date('2026-10-01T00:00:00.000Z'),
      });
      const { app, adminBearer } = createHarness({ cases: [kase], orgs: [org1, org2] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/re-dispatch`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: org1.id, reason: 'other' }),
      });
      expect(res.status).toBe(202);
    });
  });

  describe('POST /admin/dispatch/cases/:caseId/re-dispatch/approve', () => {
    it('rejects same-admin approval with 403 CSA_SAME_ADMIN', async () => {
      const org = sampleOrg();
      const pendingApprovalId = randomUUID();
      const kase = sampleCase({
        dispatchStatus: null,
        partnerOrganizationId: null,
        firstDispatchedAt: new Date('2026-10-01T00:00:00.000Z'),
        pendingApproval: {
          id: pendingApprovalId,
          requestedBy: '', // filled below after we know adminId
          requestedTargetOrgId: org.id,
          requestedAt: new Date(),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          snapshot: { partnerOrganizationId: null, dispatchStatus: null, status: 'open' },
        },
      });
      const { app, adminBearer, adminId, cases } = createHarness({ cases: [kase], orgs: [org] });
      // Set requestedBy to the same admin who will call approve.
      cases.set(kase.id, { ...kase, pendingApproval: { ...kase.pendingApproval!, requestedBy: adminId } });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${kase.id}/re-dispatch/approve`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ pendingApprovalId }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('CSA_SAME_ADMIN');
    });

    it('a second admin approves successfully', async () => {
      const org = sampleOrg();
      const pendingApprovalId = randomUUID();
      const baseCase = sampleCase({
        dispatchStatus: null,
        partnerOrganizationId: null,
        firstDispatchedAt: new Date('2026-10-01T00:00:00.000Z'),
        status: 'open',
      });
      const harness = createHarness({ cases: [baseCase], orgs: [org] });
      harness.cases.set(baseCase.id, {
        ...baseCase,
        pendingApproval: {
          id: pendingApprovalId,
          requestedBy: harness.adminId,
          requestedTargetOrgId: org.id,
          requestedAt: new Date(),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          snapshot: { partnerOrganizationId: null, dispatchStatus: null, status: 'open' },
        },
      });
      const listened = await listen(harness.app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${baseCase.id}/re-dispatch/approve`, {
        method: 'POST',
        headers: { authorization: harness.admin2Bearer, 'content-type': 'application/json' },
        body: JSON.stringify({ pendingApprovalId }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { dispatchStatus: string; partnerOrganizationId: string } };
      expect(body.data.dispatchStatus).toBe('pending');
      expect(body.data.partnerOrganizationId).toBe(org.id);
    });

    it('returns 409 PENDING_APPROVAL_INVALID when the case has changed since the request (snapshot mismatch)', async () => {
      const org = sampleOrg();
      const pendingApprovalId = randomUUID();
      const baseCase = sampleCase({
        dispatchStatus: 'pending', // case moved on since the pendingApproval snapshot
        partnerOrganizationId: randomUUID(),
        firstDispatchedAt: new Date('2026-10-01T00:00:00.000Z'),
        status: 'open',
      });
      const harness = createHarness({ cases: [baseCase], orgs: [org] });
      harness.cases.set(baseCase.id, {
        ...baseCase,
        pendingApproval: {
          id: pendingApprovalId,
          requestedBy: harness.adminId,
          requestedTargetOrgId: org.id,
          requestedAt: new Date(),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          snapshot: { partnerOrganizationId: null, dispatchStatus: null, status: 'open' },
        },
      });
      const listened = await listen(harness.app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${baseCase.id}/re-dispatch/approve`, {
        method: 'POST',
        headers: { authorization: harness.admin2Bearer, 'content-type': 'application/json' },
        body: JSON.stringify({ pendingApprovalId }),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('PENDING_APPROVAL_INVALID');
    });

    it('returns 409 PENDING_APPROVAL_INVALID for an unknown pendingApprovalId', async () => {
      const baseCase = sampleCase();
      const harness = createHarness({ cases: [baseCase] });
      const listened = await listen(harness.app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/dispatch/cases/${baseCase.id}/re-dispatch/approve`, {
        method: 'POST',
        headers: { authorization: harness.admin2Bearer, 'content-type': 'application/json' },
        body: JSON.stringify({ pendingApprovalId: randomUUID() }),
      });
      expect(res.status).toBe(409);
    });
  });

  describe('oracle uniformity / RBAC (CS-8-adjacent)', () => {
    it('a partner token is rejected on every admin dispatch route the same way (403)', async () => {
      const kase = sampleCase();
      const { app, partnerBearer } = createHarness({ cases: [kase] });
      const listened = await listen(app);
      server = listened.server;

      const paths = [
        ['GET', '/admin/dispatch/cases'],
        ['GET', '/admin/dispatch/cases/count'],
        ['GET', `/admin/dispatch/cases/${kase.id}`],
        ['POST', `/admin/dispatch/cases/${kase.id}/dispatch`],
        ['POST', `/admin/dispatch/cases/${kase.id}/re-dispatch`],
        ['POST', `/admin/dispatch/cases/${kase.id}/re-dispatch/approve`],
      ] as const;

      for (const [method, path] of paths) {
        const res = await fetch(`${listened.baseUrl}${path}`, {
          method,
          headers: { authorization: partnerBearer, 'content-type': 'application/json' },
          body: method === 'POST' ? JSON.stringify({}) : undefined,
        });
        expect(res.status).toBe(403);
      }
    });
  });
});
