/**
 * Security operator `/security/cases*` — partner-org scoping, claim, status updates.
 *
 * PDM-1/PDM-2/PDM-3/PDM-4/PDM-8 coverage (compliance-review-security-partner-data-
 * minimisation.md, ADR-0006 §18/§18.8). The fake `ctx.recoveryCases` below mirrors
 * `repositories/recovery-cases.ts`'s real tiering/visibility logic closely enough to
 * exercise the route layer's audit wiring and response-shaping without needing a live
 * MongoDB — the repository's own narrower, projection-level guarantees are covered in
 * `repositories/recovery-cases.test.ts`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createSecurityCasesRouter } from './security-cases.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AccountRow, AccountStatus } from '../repositories/accounts.js';
import type { RecoveryCaseDocument, RecoveryCaseStatus } from '../repositories/recovery-cases.js';
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

function operatorToken(
  env: Env,
  accountId: string,
  sessionId: string,
  partnerOrganizationId: string,
): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: 'security_company_operator',
      mfa_required: false,
      account_state: 'active',
      partner_organization_id: partnerOrganizationId,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

function sampleCase(
  overrides: Partial<RecoveryCaseDocument> & Pick<RecoveryCaseDocument, 'id' | 'accountId' | 'assetId'>,
): RecoveryCaseDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    partnerOrganizationId: null,
    status: 'open',
    referenceNumber: 'RC-20260801-TEST',
    reportedAt: now,
    notes: null,
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
    ...overrides,
  };
}

const WRAP_UP_WINDOW_DAYS = 90;

/** Mirrors `recovery-cases.ts`'s `claimedCaseVisiblePredicate`/`unclaimedCaseVisiblePredicate`
 * closely enough for route-level tests — see that file's own repository-level tests for
 * the authoritative, projection-level guarantees. */
function visibleToOrg(c: RecoveryCaseDocument, orgId: string): 'claimed' | 'offer' | null {
  if (c.partnerOrganizationId === orgId) {
    if ((c.status === 'recovered' || c.status === 'closed') && c.closedAt) {
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - WRAP_UP_WINDOW_DAYS);
      if (c.closedAt <= cutoff) return null;
    }
    return 'claimed';
  }
  if (c.partnerOrganizationId === null && c.status === 'open') return 'offer';
  return null;
}

function toResult(c: RecoveryCaseDocument, tier: 'claimed' | 'offer') {
  const caseShape =
    tier === 'claimed'
      ? {
          id: c.id,
          assetId: c.assetId,
          partnerOrganizationId: c.partnerOrganizationId,
          status: c.status,
          referenceNumber: c.referenceNumber,
          reportedAt: c.reportedAt,
          notes: c.notes,
          lastLocationAt: c.lastLocationAt,
          updatedAt: c.updatedAt,
        }
      : {
          id: c.id,
          partnerOrganizationId: c.partnerOrganizationId,
          status: c.status,
          referenceNumber: c.referenceNumber,
          reportedAt: c.reportedAt,
          updatedAt: c.updatedAt,
        };
  return { tier, accountId: c.accountId, createdAt: c.createdAt, case: caseShape };
}

function createHarness(opts: {
  cases?: RecoveryCaseDocument[];
  partnerOrgId?: string;
  /** Simulates a concurrent writer changing a case's status between this handler's
   * own pre-read and its compare-and-set mutation — exercises the ADR-0006 §18.8 C-A
   * race-condition path for real, rather than merely asserting against a
   * pre-mutated fixture. Fires once, on the first `updateStatusForPartnerOrg` call. */
  simulateRaceOnFirstUpdate?: RecoveryCaseStatus;
}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const operatorId = randomUUID();
  const sessionId = randomUUID();
  const partnerOrgId = opts.partnerOrgId ?? randomUUID();
  const cases = [...(opts.cases ?? [])];
  const auditCalls: Array<{ kind: 'record' | 'bulk'; event: unknown }> = [];
  const accessLogCalls: Array<
    | { kind: 'detail'; event: unknown }
    | { kind: 'caseBulk'; event: unknown }
    | { kind: 'stateChange'; event: unknown }
  > = [];

  const stubAccount: AccountRow = {
    id: operatorId,
    userType: 'security_company_operator',
    accountState: 'active',
    email: 'operator@security.example',
    phone: null,
    mfaRequired: false,
    partnerOrganizationId: partnerOrgId,
    invitedBy: null,
    createdAt: new Date(),
  };

  const ctx = {
    env,
    kv,
    accounts: {
      async findById(id: string): Promise<AccountRow | null> {
        return id === operatorId ? stubAccount : null;
      },
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== operatorId) return null;
        return {
          id: operatorId,
          accountState: 'active',
          mfaRequired: false,
          userType: 'security_company_operator',
          partnerOrganizationId: partnerOrgId,
          updatedAt: new Date(),
        };
      },
    },
    recoveryCases: {
      async listForPartnerOrg(orgId: string, filters: { status?: RecoveryCaseStatus }, limit: number) {
        return cases
          .map((c) => ({ c, tier: visibleToOrg(c, orgId) }))
          .filter(({ tier }) => tier !== null)
          .filter(({ c }) => (filters.status ? c.status === filters.status : true))
          .slice(0, limit)
          .map(({ c, tier }) => toResult(c, tier!));
      },
      async findByIdForPartnerOrg(orgId: string, caseId: string) {
        const row = cases.find((c) => c.id === caseId);
        if (!row) return null;
        const tier = visibleToOrg(row, orgId);
        if (!tier) return null;
        return toResult(row, tier);
      },
      async claimForPartnerOrg(orgId: string, caseId: string) {
        const idx = cases.findIndex(
          (c) => c.id === caseId && c.partnerOrganizationId === null && c.status === 'open',
        );
        if (idx < 0) return null;
        cases[idx] = {
          ...cases[idx]!,
          partnerOrganizationId: orgId,
          status: 'investigating',
          updatedAt: new Date(),
        };
        return cases[idx]!;
      },
      async updateStatusForPartnerOrg(
        orgId: string,
        caseId: string,
        status: RecoveryCaseStatus,
        expectedStatus: RecoveryCaseStatus,
      ) {
        if (opts.simulateRaceOnFirstUpdate) {
          const raceIdx = cases.findIndex((c) => c.id === caseId);
          if (raceIdx >= 0) {
            cases[raceIdx] = { ...cases[raceIdx]!, status: opts.simulateRaceOnFirstUpdate };
          }
          opts.simulateRaceOnFirstUpdate = undefined;
        }
        // Mirrors the repository's compare-and-set (ADR-0006 §18.8 C-A): a case must
        // already be claimed by this org AND still be in exactly the status the
        // caller's pre-read observed.
        const idx = cases.findIndex(
          (c) => c.id === caseId && c.partnerOrganizationId === orgId && c.status === expectedStatus,
        );
        if (idx < 0) return null;
        cases[idx] = {
          ...cases[idx]!,
          status,
          updatedAt: new Date(),
        };
        return cases[idx]!;
      },
      async countForPartnerOrg(orgId: string, filters: { status?: RecoveryCaseStatus }) {
        return cases
          .map((c) => ({ c, tier: visibleToOrg(c, orgId) }))
          .filter(({ tier }) => tier !== null)
          .filter(({ c }) => (filters.status ? c.status === filters.status : true)).length;
      },
    },
    auditLog: {
      async record(event: unknown) {
        auditCalls.push({ kind: 'record', event });
      },
      async recordBulkDisclosure(event: unknown) {
        auditCalls.push({ kind: 'bulk', event });
      },
    },
    adminAccessLog: {
      async recordDetail(event: unknown) {
        accessLogCalls.push({ kind: 'detail', event });
      },
      async recordCaseBulkDisclosure(event: unknown) {
        accessLogCalls.push({ kind: 'caseBulk', event });
      },
      async recordStateChange(event: unknown) {
        accessLogCalls.push({ kind: 'stateChange', event });
      },
    },
    assets: {
      async findByIdForAdmin() {
        return { displayName: 'Test asset' };
      },
      async findByIdForAccount() {
        return null;
      },
    },
    recoveryNotifications: {
      async notifyCaseAssigned() {
        return undefined;
      },
      async notifyCaseStatusUpdated() {
        return undefined;
      },
      async notifyRecoverySuccessful() {
        return undefined;
      },
      async notifyCaseClosed() {
        return undefined;
      },
      async notifyTheftReportSubmitted() {
        return undefined;
      },
      async notifySecurityOperatorsTheftReported() {
        return undefined;
      },
    },
    customerNotifications: {
      async notifyAssetRecovered() {
        return undefined;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createSecurityCasesRouter(ctx));
  app.use(errorHandler);

  let server: Server | undefined;
  let baseUrl = '';

  return {
    operatorId,
    sessionId,
    partnerOrgId,
    cases,
    auditCalls,
    accessLogCalls,
    token: operatorToken(env, operatorId, sessionId, partnerOrgId),
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

describe('routes/security-cases', () => {
  let harness: ReturnType<typeof createHarness>;

  afterEach(async () => {
    if (harness) await harness.stop();
  });

  it('lists open unassigned cases and org-assigned cases', async () => {
    harness = createHarness({
      cases: [
        sampleCase({
          id: '507f1f77bcf86cd799439011',
          accountId: randomUUID(),
          assetId: '507f1f77bcf86cd799439021',
          partnerOrganizationId: null,
          status: 'open',
        }),
      ],
    });
    await harness.start();

    const res = await fetch(harness.url('/security/cases'), {
      headers: { authorization: `Bearer ${harness.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data).toHaveLength(1);
  });

  it('claims an unassigned open case for the operator org', async () => {
    const caseId = '507f1f77bcf86cd799439011';
    harness = createHarness({
      cases: [
        sampleCase({
          id: caseId,
          accountId: randomUUID(),
          assetId: '507f1f77bcf86cd799439021',
          partnerOrganizationId: null,
          status: 'open',
        }),
      ],
    });
    await harness.start();

    const res = await fetch(harness.url(`/security/cases/${caseId}/claim`), {
      method: 'POST',
      headers: { authorization: `Bearer ${harness.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; partnerOrganizationId: string };
    expect(body.status).toBe('investigating');
    expect(body.partnerOrganizationId).toBe(harness.partnerOrgId);
  });

  it('updates case status via PATCH', async () => {
    const caseId = '507f1f77bcf86cd799439011';
    harness = createHarness({
      partnerOrgId: 'org-123',
      cases: [
        sampleCase({
          id: caseId,
          accountId: randomUUID(),
          assetId: '507f1f77bcf86cd799439021',
          partnerOrganizationId: 'org-123',
          status: 'investigating',
        }),
      ],
    });
    await harness.start();

    const res = await fetch(harness.url(`/security/cases/${caseId}`), {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${harness.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'tracking' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('tracking');
  });

  it('rejects PATCH directly to a terminal status on an unclaimed case (not yet claimed via /claim)', async () => {
    const caseId = '507f1f77bcf86cd799439011';
    harness = createHarness({
      cases: [
        sampleCase({
          id: caseId,
          accountId: randomUUID(),
          assetId: '507f1f77bcf86cd799439021',
          partnerOrganizationId: null,
          status: 'open',
        }),
      ],
    });
    await harness.start();

    const res = await fetch(harness.url(`/security/cases/${caseId}`), {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${harness.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'recovered' }),
    });
    expect(res.status).toBe(404);

    // Confirm the case was not silently claimed/closed as a side effect of the rejected PATCH.
    const stored = harness.cases.find((c) => c.id === caseId);
    expect(stored?.status).toBe('open');
    expect(stored?.partnerOrganizationId).toBeNull();
  });

  // PDM-1 (compliance-review-security-partner-data-minimisation.md §4): accountId must
  // never appear in ANY /v1/security/cases* response, at any claim stage.
  describe('PDM-1 — accountId never reaches a response', () => {
    const accountId = 'real-customer-account-id-should-never-leak';

    it('GET /security/cases (list) omits accountId', async () => {
      harness = createHarness({
        partnerOrgId: 'org-1',
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-1',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      const body = (await res.json()) as { data: Array<Record<string, unknown>> };
      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(Object.keys(body.data[0]!)).not.toContain('accountId');
      expect(JSON.stringify(body)).not.toContain(accountId);
    });

    it('GET /security/cases/:caseId (detail, claimed tier) omits accountId', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        partnerOrgId: 'org-1',
        cases: [
          sampleCase({
            id: caseId,
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-1',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(Object.keys(body)).not.toContain('accountId');
      expect(JSON.stringify(body)).not.toContain(accountId);
    });

    it('GET /security/cases/:caseId (detail, offer tier — unclaimed) omits accountId', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        cases: [
          sampleCase({
            id: caseId,
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: null,
            status: 'open',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(Object.keys(body)).not.toContain('accountId');
      expect(JSON.stringify(body)).not.toContain(accountId);
    });

    it('POST /security/cases/:caseId/claim omits accountId', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        cases: [
          sampleCase({
            id: caseId,
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: null,
            status: 'open',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}/claim`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(Object.keys(body)).not.toContain('accountId');
      expect(JSON.stringify(body)).not.toContain(accountId);
    });

    it('PATCH /security/cases/:caseId omits accountId', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        partnerOrgId: 'org-123',
        cases: [
          sampleCase({
            id: caseId,
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-123',
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${harness.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'tracking' }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(Object.keys(body)).not.toContain('accountId');
      expect(JSON.stringify(body)).not.toContain(accountId);
    });
  });

  // PDM-2 (compliance-review-security-partner-data-minimisation.md §4): tiered field
  // exposure by claim state, observable from the HTTP response shape.
  describe('PDM-2 — tiered response shape by claim state', () => {
    it('an unclaimed (offer-tier) case in the list omits notes/assetId/lastLocationAt', async () => {
      harness = createHarness({
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: null,
            status: 'open',
            notes: 'sensitive address details',
            lastLocationAt: new Date(),
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      const body = (await res.json()) as { data: Array<Record<string, unknown>> };
      expect(res.status).toBe(200);
      const row = body.data[0]!;
      for (const key of ['notes', 'assetId', 'lastLocationAt', 'lastLocation', 'callCentreNotes']) {
        expect(Object.keys(row)).not.toContain(key);
      }
    });

    it('a claimed (Tier 1) case in the detail response includes notes/assetId/lastLocationAt', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      const lastLocationAt = new Date('2026-08-01T00:00:00.000Z');
      harness = createHarness({
        partnerOrgId: 'org-1',
        cases: [
          sampleCase({
            id: caseId,
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-1',
            notes: 'the customer’s own description of the theft',
            lastLocationAt,
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body.notes).toBe('the customer’s own description of the theft');
      expect(body.assetId).toBe('507f1f77bcf86cd799439021');
      expect(body.lastLocationAt).toBe(lastLocationAt.toISOString());
      for (const key of ['callCentreNotes', 'lastLocation']) {
        expect(Object.keys(body)).not.toContain(key);
      }
    });
  });

  // PDM-8 / ADR-0006 §18.3/§18.4/§18.8 — audit trail on admin_access_log (Trail B).
  describe('PDM-8 — partner case-access audit trail', () => {
    it('GET /security/cases writes exactly one recordCaseBulkDisclosure call, one entry per disclosed case', async () => {
      const accountA = randomUUID();
      const accountB = randomUUID();
      harness = createHarness({
        partnerOrgId: 'org-1',
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: accountA,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-1',
          }),
          sampleCase({
            id: '507f1f77bcf86cd799439012',
            accountId: accountB,
            assetId: '507f1f77bcf86cd799439022',
            partnerOrganizationId: null,
            status: 'open',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);

      const bulkCalls = harness.accessLogCalls.filter((c) => c.kind === 'caseBulk');
      expect(bulkCalls).toHaveLength(1);
      const event = bulkCalls[0]!.event as {
        disclosedCases: Array<{ accountId: string; caseId: string }>;
        actorAccountId: string;
      };
      expect(event.disclosedCases).toHaveLength(2);
      expect(event.disclosedCases.map((d) => d.accountId).sort()).toEqual([accountA, accountB].sort());
      expect(event.actorAccountId).toBe(harness.operatorId);
    });

    it('a customer with two disclosed cases on one page produces two entries, not deduped (C-16(b))', async () => {
      const sharedAccountId = randomUUID();
      harness = createHarness({
        partnerOrgId: 'org-1',
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: sharedAccountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-1',
          }),
          sampleCase({
            id: '507f1f77bcf86cd799439012',
            accountId: sharedAccountId,
            assetId: '507f1f77bcf86cd799439022',
            partnerOrganizationId: 'org-1',
            status: 'tracking',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);

      const bulkCalls = harness.accessLogCalls.filter((c) => c.kind === 'caseBulk');
      const event = bulkCalls[0]!.event as { disclosedCases: Array<{ accountId: string; caseId: string }> };
      expect(event.disclosedCases).toHaveLength(2);
      expect(new Set(event.disclosedCases.map((d) => d.caseId)).size).toBe(2);
    });

    it('GET /security/cases/:caseId writes exactly one recordDetail call with the case reference from the DB row', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      const accountId = randomUUID();
      harness = createHarness({
        partnerOrgId: 'org-1',
        cases: [
          sampleCase({
            id: caseId,
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-1',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);

      const detailCalls = harness.accessLogCalls.filter((c) => c.kind === 'detail');
      expect(detailCalls).toHaveLength(1);
      expect(detailCalls[0]!.event).toMatchObject({
        targetAccountId: accountId,
        resourceType: 'recovery_case',
        resourceId: caseId,
      });
    });

    it('a 404 detail read (case not visible to this org) writes no audit row', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        partnerOrgId: 'org-1',
        cases: [
          sampleCase({
            id: caseId,
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-2',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(404);
      expect(harness.accessLogCalls).toHaveLength(0);
    });

    it('POST /security/cases/:caseId/claim writes a privileged_state_change-style record with fromStatus "open"', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      const accountId = randomUUID();
      harness = createHarness({
        cases: [
          sampleCase({
            id: caseId,
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: null,
            status: 'open',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}/claim`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);

      const stateChangeCalls = harness.accessLogCalls.filter((c) => c.kind === 'stateChange');
      expect(stateChangeCalls).toHaveLength(1);
      expect(stateChangeCalls[0]!.event).toMatchObject({
        targetAccountId: accountId,
        resourceType: 'recovery_case',
        resourceId: caseId,
        fromStatus: 'open',
        toStatus: 'investigating',
      });
    });

    it('a failed claim (already claimed — race lost) does not write a 2xx and reports NOT_FOUND', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        partnerOrgId: 'org-1',
        cases: [
          sampleCase({
            id: caseId,
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-2', // already claimed by a different org
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}/claim`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(404);
      // Not visible to this org at all — no precondition-passing pre-read, so no audit row.
      expect(harness.accessLogCalls.filter((c) => c.kind === 'stateChange')).toHaveLength(0);
    });

    it('PATCH writes a privileged_state_change-style record with fromStatus taken from the pre-read', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      const accountId = randomUUID();
      harness = createHarness({
        partnerOrgId: 'org-123',
        cases: [
          sampleCase({
            id: caseId,
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-123',
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${harness.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'tracking' }),
      });
      expect(res.status).toBe(200);

      const stateChangeCalls = harness.accessLogCalls.filter((c) => c.kind === 'stateChange');
      expect(stateChangeCalls).toHaveLength(1);
      expect(stateChangeCalls[0]!.event).toMatchObject({
        targetAccountId: accountId,
        resourceId: caseId,
        fromStatus: 'investigating',
        toStatus: 'tracking',
      });
    });

    // ADR-0006 §18.8 ruling (b), C-A/C-B: the named regression case — a partner
    // retrying a status change that raced with another update must get the correct
    // old-status check and a non-2xx response, not a silently-applied stale transition.
    // ADR-0006 §18.8 ruling (b), C-A/C-B: the named regression case — a status change
    // that races with another, concurrent write between this handler's own pre-read
    // and its compare-and-set mutation must get the correct old-status check (not a
    // value the handler merely assumed) and a non-2xx response, never a silently
    // applied stale transition.
    it('a PATCH that races a concurrent status change returns 404, not 2xx, and leaves the case at the post-race status', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      const accountId = randomUUID();
      harness = createHarness({
        partnerOrgId: 'org-123',
        // Between this handler's pre-read (which observes 'investigating') and its
        // compare-and-set mutation, a concurrent operator/process moves the case to
        // 'tracking' — simulated inside the fake's updateStatusForPartnerOrg, exactly
        // where the real race window sits.
        simulateRaceOnFirstUpdate: 'tracking',
        cases: [
          sampleCase({
            id: caseId,
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-123',
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${harness.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'recovered' }),
      });

      // The handler's pre-read observed 'investigating' and audited that as
      // `fromStatus`, but by the time the compare-and-set mutation ran the document
      // had already moved to 'tracking' — the mutation's own `status: expectedStatus`
      // filter must miss, and the route must map that miss to 404, never 2xx.
      expect(res.status).toBe(404);

      const stored = harness.cases.find((c) => c.id === caseId)!;
      expect(stored.status).toBe('tracking'); // left exactly where the race left it, not 'recovered'

      const stateChangeCalls = harness.accessLogCalls.filter((c) => c.kind === 'stateChange');
      expect(stateChangeCalls).toHaveLength(1);
      expect(stateChangeCalls[0]!.event).toMatchObject({
        targetAccountId: accountId,
        fromStatus: 'investigating', // what the pre-read actually observed
        toStatus: 'recovered',
      });
    });
  });

  // Feature 011 (SAPS case-number capture) — SR-011-1b, security-review.md. Merge-blocking
  // regression: if a future edit ever adds a police-report field to any of these four
  // route responses, this test fails. Covers a case document with every police-report
  // field populated, including a non-empty policeReportHistory[].
  describe('Feature 011 — police-report fields never reach a security-company operator', () => {
    const POLICE_REPORT_KEYS = [
      'sapsCaseNumber',
      'reportingStation',
      'reportedToPoliceAt',
      'policeReport',
      'policeReportHistory',
      'policeReportReminderSentAt',
    ];

    function caseWithPoliceReportSet(overrides: Partial<RecoveryCaseDocument> & Pick<RecoveryCaseDocument, 'id' | 'accountId' | 'assetId'>) {
      return sampleCase({
        ...overrides,
        sapsCaseNumber: '123/01/2026',
        reportingStation: 'Sandton SAPS',
        reportedToPoliceAt: new Date('2026-08-02T00:00:00.000Z'),
        policeReportHistory: [
          {
            actorAccountId: overrides.accountId,
            field: 'sapsCaseNumber',
            previousValue: null,
            newValue: '123/01/2026',
            changedAt: new Date('2026-08-02T00:00:00.000Z'),
          },
        ],
        policeReportReminderSentAt: new Date('2026-08-04T00:00:00.000Z'),
      } as Partial<RecoveryCaseDocument> & Pick<RecoveryCaseDocument, 'id' | 'accountId' | 'assetId'>);
    }

    it('GET /security/cases (list) excludes police-report fields', async () => {
      const accountId = randomUUID();
      harness = createHarness({
        partnerOrgId: 'org-1',
        cases: [
          caseWithPoliceReportSet({
            id: '507f1f77bcf86cd799439011',
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-1',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<Record<string, unknown>> };
      expect(body.data).toHaveLength(1);
      for (const key of POLICE_REPORT_KEYS) {
        expect(Object.keys(body.data[0]!)).not.toContain(key);
      }
    });

    it('GET /security/cases/:caseId (detail) excludes police-report fields', async () => {
      const accountId = randomUUID();
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        partnerOrgId: 'org-1',
        cases: [
          caseWithPoliceReportSet({
            id: caseId,
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-1',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      for (const key of POLICE_REPORT_KEYS) {
        expect(Object.keys(body)).not.toContain(key);
      }
    });

    it('POST /security/cases/:caseId/claim excludes police-report fields', async () => {
      const accountId = randomUUID();
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        cases: [
          caseWithPoliceReportSet({
            id: caseId,
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: null,
            status: 'open',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}/claim`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      for (const key of POLICE_REPORT_KEYS) {
        expect(Object.keys(body)).not.toContain(key);
      }
    });

    it('PATCH /security/cases/:caseId excludes police-report fields', async () => {
      const accountId = randomUUID();
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        partnerOrgId: 'org-123',
        cases: [
          caseWithPoliceReportSet({
            id: caseId,
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-123',
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${harness.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'tracking' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      for (const key of POLICE_REPORT_KEYS) {
        expect(Object.keys(body)).not.toContain(key);
      }
    });
  });

  it('returns 403 when operator has no partner organization', async () => {
    const env = fakeEnv();
    const operatorId = randomUUID();
    const token = signAccessToken(
      {
        sub: operatorId,
        user_type: 'security_company_operator',
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

    const res = await fetch(harness.url('/security/cases'), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  // Feature 012 FR-4 — GET /security/cases/count (api-design.md §3, security-review.md §10, C-012-1).
  describe('GET /security/cases/count (Feature 012 FR-4)', () => {
    it('returns the true total count for the org — happy path', async () => {
      const orgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        cases: [
          sampleCase({ id: '507f1f77bcf86cd799439011', accountId: randomUUID(), assetId: '507f1f77bcf86cd799439021', partnerOrganizationId: null, status: 'open' }),
          sampleCase({ id: '507f1f77bcf86cd799439012', accountId: randomUUID(), assetId: '507f1f77bcf86cd799439022', partnerOrganizationId: orgId, status: 'investigating' }),
          sampleCase({ id: '507f1f77bcf86cd799439013', accountId: randomUUID(), assetId: '507f1f77bcf86cd799439023', partnerOrganizationId: orgId, status: 'closed' }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/count'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { count: number } };
      // All 3 cases are partner-visible: the unassigned open one + the org's own two
      // (both recently closed/open — within the PDM-4 90-day wrap-up window, since
      // closedAt defaults to null on the sample fixture).
      expect(body.data.count).toBe(3);
    });

    it('applies the status filter identically to the sibling list route (AC-5 / SR-012-6)', async () => {
      const orgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        cases: [
          sampleCase({ id: '507f1f77bcf86cd799439011', accountId: randomUUID(), assetId: '507f1f77bcf86cd799439021', partnerOrganizationId: null, status: 'open' }),
          sampleCase({ id: '507f1f77bcf86cd799439012', accountId: randomUUID(), assetId: '507f1f77bcf86cd799439022', partnerOrganizationId: orgId, status: 'investigating' }),
        ],
      });
      await harness.start();

      const [countRes, listRes] = await Promise.all([
        fetch(harness.url('/security/cases/count?status=open'), {
          headers: { authorization: `Bearer ${harness.token}` },
        }),
        fetch(harness.url('/security/cases?status=open'), {
          headers: { authorization: `Bearer ${harness.token}` },
        }),
      ]);
      const countBody = (await countRes.json()) as { data: { count: number } };
      const listBody = (await listRes.json()) as { data: unknown[] };
      expect(countBody.data.count).toBe(listBody.data.length);
      expect(countBody.data.count).toBe(1);
    });

    it('emits exactly one privileged_bulk_access audit row, resultCount 0, and zero privileged_data_access rows (C-012-1)', async () => {
      harness = createHarness({});
      await harness.start();

      const res = await fetch(harness.url('/security/cases/count'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);

      expect(harness.auditCalls).toHaveLength(1);
      expect(harness.auditCalls[0]!.kind).toBe('bulk');
      expect(harness.auditCalls[0]!.event).toMatchObject({
        disclosedAccountIds: [],
        actorAccountId: harness.operatorId,
        actorSessionId: harness.sessionId,
      });
      const recordCalls = harness.auditCalls.filter((c) => c.kind === 'record');
      expect(recordCalls).toHaveLength(0);
      // RR-012-1's unlogged, cheap aggregate stays on Trail A (ctx.auditLog) — this
      // route must not also write to the new Trail B extension.
      expect(harness.accessLogCalls).toHaveLength(0);
    });

    it('returns 403 when operator has no partner organization — not data', async () => {
      const env = fakeEnv();
      const operatorId = randomUUID();
      const token = signAccessToken(
        {
          sub: operatorId,
          user_type: 'security_company_operator',
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

      const res = await fetch(harness.url('/security/cases/count'), {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(403);
    });

    it('returns 403, not the count, for a wrong-role token', async () => {
      const env = fakeEnv();
      const token = signAccessToken(
        {
          sub: randomUUID(),
          user_type: 'support_agent',
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

      const res = await fetch(harness.url('/security/cases/count'), {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(403);
    });

    // SR-012-2 regression guard: /count must not be shadowed by the earlier-registered
    // /:caseId route. Without the fix, this request matches :caseId="count", fails the
    // 24-hex regex, and returns 400 — not the count.
    it('SR-012-2 regression — /count is not captured by the :caseId route (would 400 if shadowed)', async () => {
      harness = createHarness({});
      await harness.start();

      const res = await fetch(harness.url('/security/cases/count'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).not.toBe(400);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { count: number } };
      expect(typeof body.data.count).toBe('number');
    });
  });
});
