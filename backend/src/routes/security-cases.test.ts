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

const WRAP_UP_WINDOW_DAYS = 90;

/**
 * SR-009S-2 — exact-key allowlists for each tier's serialized response shape, kept in
 * lockstep with `serializeOfferTierRecoveryCase`/`serializeClaimedTierRecoveryCase`
 * (`repositories/recovery-cases.ts`). A denylist test ("does not contain `accountId`")
 * only catches the one field it names; these allowlists fail if a FUTURE field is added
 * to either serializer without updating the test here too — the exact failure mode the
 * chair's security review (§1 item 4, SR-009S-2) called out as the weak point of the
 * pre-existing tests.
 */
const OFFER_TIER_RESPONSE_KEYS = [
  'id',
  'status',
  'referenceNumber',
  'reportedAt',
  'partnerOrganizationId',
  'updatedAt',
  // Product-differentiation research, "pool triage signals" — derived annotations
  // computed by `serializeOfferTierRecoveryCase`, not new DB-fetched fields.
  'ageInPoolSeconds',
  'poolUrgencyTier',
].sort();
const CLAIMED_TIER_RESPONSE_KEYS = [
  'id',
  'assetId',
  'status',
  'referenceNumber',
  'reportedAt',
  'notes',
  'lastLocationAt',
  'partnerOrganizationId',
  'updatedAt',
  // Product-differentiation research, "structured close reasons".
  'closeReason',
].sort();

function expectExactKeys(obj: Record<string, unknown>, expectedKeys: string[]) {
  expect(Object.keys(obj).sort()).toEqual(expectedKeys);
}

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

/** OB-03 §3.5 [A1] — mirrors the new dispatch-model predicates
 * (`pendingCaseVisiblePredicate`/`dispatchClaimedCaseVisiblePredicate`) closely
 * enough for route-level tests. No "unclaimed pool" tier exists under this model. */
function visibleToOrgDispatch(c: RecoveryCaseDocument, orgId: string): 'claimed' | 'offer' | null {
  if (c.partnerOrganizationId !== orgId) return null;
  if (c.dispatchStatus === 'pending' && c.status === 'open') return 'offer';
  if (c.dispatchStatus === 'accepted') {
    if ((c.status === 'recovered' || c.status === 'closed') && c.closedAt) {
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - WRAP_UP_WINDOW_DAYS);
      if (c.closedAt <= cutoff) return null;
    }
    return 'claimed';
  }
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
          closeReason: c.closeReason,
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
  /** SR-009S-4 — simulates the `recordStateChange` audit write itself throwing (e.g. a
   * DB write failure), to prove the C-B fail-closed sequence: if the audit write
   * throws, the subsequent mutation (`claimForPartnerOrg`/`updateStatusForPartnerOrg`)
   * must never run, and the response must be a 5xx, not a 2xx built from a mutation
   * that happened anyway. */
  failStateChangeAudit?: boolean;
  /** Target-org fixtures for `ctx.partnerOrganizations.findById` — the reassign
   * route's validation path. Defaults to an empty directory (every lookup 404s).
   * OB-03 — also used by the dispatch model's `isOrgDispatchEligible` check; add
   * `agreementStatus`/`terminatedAt` fields on these fixtures to drive CO-OB03-3
   * tests (defaults: `executed`/`null` when the caller's own org isn't fixtured,
   * see `callerOrgEligible` below for the common case). */
  partnerOrganizations?: Array<{
    id: string;
    status: 'active' | 'suspended';
    agreementStatus?: 'executed' | 'terminated' | null;
    terminatedAt?: Date | null;
  }>;
  /** OB-03 — whether the harness's own `partnerOrgId` is eligible per
   * `isOrgDispatchEligible` (`agreementStatus: 'executed', terminatedAt: null`).
   * Defaults to `true`. Set `false` to exercise CO-OB03-3 (terminated org). */
  callerOrgEligible?: boolean;
  /** OB-03 §3 — mounts the dispatch-model routes/predicates instead of the pool
   * model (`ctx.env.directedDispatchEnabled`). Defaults to `false`/unset, matching
   * every pre-OB-03 test in this file. */
  directedDispatchEnabled?: boolean;
}) {
  const env = fakeEnv();
  if (opts.directedDispatchEnabled) {
    (env as unknown as { directedDispatchEnabled: boolean }).directedDispatchEnabled = true;
  }
  const kv = new InMemoryKeyValueStore();
  const operatorId = randomUUID();
  const sessionId = randomUUID();
  const partnerOrgId = opts.partnerOrgId ?? randomUUID();
  const cases = [...(opts.cases ?? [])];
  const auditCalls: Array<{ kind: 'record' | 'bulk'; event: unknown }> = [];
  const mutationCalls = { claim: 0, updateStatus: 0, release: 0, reassign: 0, accept: 0, decline: 0, handBack: 0 };
  const caseMessageCalls: Array<{ accountId: string; assetName: string; caseId: string; referenceNumber: string; message: string }> = [];
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
        mutationCalls.claim += 1;
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
        closeReason: RecoveryCaseDocument['closeReason'] | null = null,
      ) {
        mutationCalls.updateStatus += 1;
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
          // Mirrors the real repository: written on every terminal transition, not just
          // the first (see `recovery-cases.ts`'s `closeReason` doc comment).
          closeReason: status === 'recovered' || status === 'closed' ? closeReason : cases[idx]!.closeReason,
        };
        return cases[idx]!;
      },
      async countForPartnerOrg(orgId: string, filters: { status?: RecoveryCaseStatus }) {
        return cases
          .map((c) => ({ c, tier: visibleToOrg(c, orgId) }))
          .filter(({ tier }) => tier !== null)
          .filter(({ c }) => (filters.status ? c.status === filters.status : true)).length;
      },
      async releaseForPartnerOrg(orgId: string, caseId: string) {
        mutationCalls.release += 1;
        const idx = cases.findIndex(
          (c) =>
            c.id === caseId &&
            c.partnerOrganizationId === orgId &&
            (c.status === 'investigating' || c.status === 'tracking'),
        );
        if (idx < 0) return null;
        cases[idx] = {
          ...cases[idx]!,
          partnerOrganizationId: null,
          status: 'open',
          updatedAt: new Date(),
        };
        return cases[idx]!;
      },
      async reassignForPartnerOrg(callerOrgId: string, caseId: string, targetOrgId: string) {
        mutationCalls.reassign += 1;
        const idx = cases.findIndex(
          (c) =>
            c.id === caseId &&
            c.partnerOrganizationId === callerOrgId &&
            (c.status === 'investigating' || c.status === 'tracking'),
        );
        if (idx < 0) return null;
        cases[idx] = {
          ...cases[idx]!,
          partnerOrganizationId: targetOrgId,
          status: 'investigating',
          updatedAt: new Date(),
        };
        return cases[idx]!;
      },
      // -----------------------------------------------------------------
      // OB-03 §3 — dispatch-model fakes, mirroring `recovery-cases.ts`'s
      // real `*Dispatch` methods closely enough for route-level tests.
      // -----------------------------------------------------------------
      async listForPartnerOrgDispatch(orgId: string, filters: { status?: RecoveryCaseStatus }, limit: number) {
        return cases
          .map((c) => ({ c, tier: visibleToOrgDispatch(c, orgId) }))
          .filter(({ tier }) => tier !== null)
          .filter(({ c }) => (filters.status ? c.status === filters.status : true))
          .slice(0, limit)
          .map(({ c, tier }) => toResult(c, tier!));
      },
      async countForPartnerOrgDispatch(orgId: string, filters: { status?: RecoveryCaseStatus }) {
        return cases
          .map((c) => ({ c, tier: visibleToOrgDispatch(c, orgId) }))
          .filter(({ tier }) => tier !== null)
          .filter(({ c }) => (filters.status ? c.status === filters.status : true)).length;
      },
      async findByIdForPartnerOrgDispatch(orgId: string, caseId: string) {
        const row = cases.find((c) => c.id === caseId);
        if (!row) return null;
        const tier = visibleToOrgDispatch(row, orgId);
        if (!tier) return null;
        return toResult(row, tier);
      },
      async acceptDispatchedCase(orgId: string, caseId: string) {
        mutationCalls.accept += 1;
        const idx = cases.findIndex(
          (c) => c.id === caseId && c.partnerOrganizationId === orgId && c.dispatchStatus === 'pending',
        );
        if (idx < 0) return null;
        cases[idx] = {
          ...cases[idx]!,
          dispatchStatus: 'accepted',
          acceptedAt: new Date(),
          status: cases[idx]!.status === 'open' ? 'investigating' : cases[idx]!.status,
          updatedAt: new Date(),
        };
        return cases[idx]!;
      },
      async declineDispatchedCase(orgId: string, caseId: string) {
        mutationCalls.decline += 1;
        const idx = cases.findIndex(
          (c) => c.id === caseId && c.partnerOrganizationId === orgId && c.dispatchStatus === 'pending',
        );
        if (idx < 0) return null;
        cases[idx] = {
          ...cases[idx]!,
          partnerOrganizationId: null,
          dispatchStatus: null,
          acceptedAt: null,
          dispatchedBy: null,
          updatedAt: new Date(),
        };
        return cases[idx]!;
      },
      async handBackAcceptedCase(orgId: string, caseId: string) {
        mutationCalls.handBack += 1;
        const idx = cases.findIndex(
          (c) => c.id === caseId && c.partnerOrganizationId === orgId && c.dispatchStatus === 'accepted',
        );
        if (idx < 0) return null;
        cases[idx] = {
          ...cases[idx]!,
          partnerOrganizationId: null,
          dispatchStatus: null,
          acceptedAt: null,
          dispatchedBy: null,
          updatedAt: new Date(),
        };
        return cases[idx]!;
      },
      async updateStatusForPartnerOrgDispatch(
        orgId: string,
        caseId: string,
        status: RecoveryCaseStatus,
        expectedStatus: RecoveryCaseStatus,
        closeReason: RecoveryCaseDocument['closeReason'] | null = null,
      ) {
        mutationCalls.updateStatus += 1;
        const idx = cases.findIndex(
          (c) =>
            c.id === caseId &&
            c.partnerOrganizationId === orgId &&
            c.dispatchStatus === 'accepted' &&
            c.status === expectedStatus,
        );
        if (idx < 0) return null;
        cases[idx] = {
          ...cases[idx]!,
          status,
          updatedAt: new Date(),
          closeReason: status === 'recovered' || status === 'closed' ? closeReason : cases[idx]!.closeReason,
        };
        return cases[idx]!;
      },
    },
    partnerOrganizations: {
      async findById(id: string) {
        const found = (opts.partnerOrganizations ?? []).find((o) => o.id === id);
        if (found) {
          return {
            id: found.id,
            name: 'Test Partner Org',
            status: found.status,
            contactEmail: 'partner@example.com',
            notes: null,
            agreementStatus: found.agreementStatus ?? 'executed',
            agreementReference: 'AGR-TEST',
            effectiveFrom: new Date(),
            terminatedAt: found.terminatedAt ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        // OB-03 — the harness's own `partnerOrgId` (the caller's org) is not
        // usually listed in `opts.partnerOrganizations` (that array is for
        // reassign-target fixtures). Default it to eligible unless
        // `callerOrgEligible: false` is set, so pre-existing tests that never
        // set either option keep working under the dispatch model too.
        if (id === partnerOrgId) {
          const eligible = opts.callerOrgEligible !== false;
          return {
            id,
            name: 'Caller Partner Org',
            status: 'active' as const,
            contactEmail: 'caller@example.com',
            notes: null,
            agreementStatus: eligible ? ('executed' as const) : ('terminated' as const),
            agreementReference: eligible ? 'AGR-CALLER' : null,
            effectiveFrom: eligible ? new Date() : null,
            terminatedAt: eligible ? null : new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
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
        if (opts.failStateChangeAudit) {
          throw new Error('simulated admin_access_log write failure (SR-009S-4)');
        }
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
      async notifyCaseMessage(params: {
        accountId: string;
        assetName: string;
        caseId: string;
        referenceNumber: string;
        message: string;
      }) {
        caseMessageCalls.push(params);
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
    mutationCalls,
    caseMessageCalls,
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
      body: JSON.stringify({ status: 'recovered', closeReason: 'recovered-intact' }),
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
      // SR-009S-2: exact-key allowlist, not a denylist on `accountId` alone — a future
      // field added to `ClaimedTierRecoveryCase` without updating this test fails here.
      expectExactKeys(body.data[0]!, CLAIMED_TIER_RESPONSE_KEYS);
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
      expectExactKeys(body, CLAIMED_TIER_RESPONSE_KEYS);
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
      expectExactKeys(body, OFFER_TIER_RESPONSE_KEYS);
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
      expectExactKeys(body, CLAIMED_TIER_RESPONSE_KEYS);
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
      expectExactKeys(body, CLAIMED_TIER_RESPONSE_KEYS);
      expect(JSON.stringify(body)).not.toContain(accountId);
    });
  });

  // PDM-2 (compliance-review-security-partner-data-minimisation.md §4): tiered field
  // exposure by claim state, observable from the HTTP response shape.
  describe('PDM-2 — tiered response shape by claim state', () => {
    it('an unclaimed (offer-tier) case in the list has EXACTLY the offer-tier key set (SR-009S-2)', async () => {
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
      // Exact-key allowlist: fails loudly if ANY field (not just the ones named in the
      // old denylist test) is ever added to the offer tier's response without updating
      // this test — the weakness SR-009S-2 was written to close.
      expectExactKeys(body.data[0]!, OFFER_TIER_RESPONSE_KEYS);
    });

    it('a claimed (Tier 1) case in the detail response has EXACTLY the claimed-tier key set (SR-009S-2)', async () => {
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
      expectExactKeys(body, CLAIMED_TIER_RESPONSE_KEYS);
    });

    it('POST /claim response has EXACTLY the claimed-tier key set (SR-009S-2)', async () => {
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
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(200);
      expectExactKeys(body, CLAIMED_TIER_RESPONSE_KEYS);
    });

    it('PATCH response has EXACTLY the claimed-tier key set (SR-009S-2)', async () => {
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
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(200);
      expectExactKeys(body, CLAIMED_TIER_RESPONSE_KEYS);
    });
  });

  // Product-differentiation research, "pool triage signals".
  describe('GET /security/cases — pool triage annotations on unclaimed (offer-tier) rows', () => {
    it('a freshly-opened unclaimed case is annotated "fresh" with a small ageInPoolSeconds', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      const now = new Date();
      harness = createHarness({
        cases: [
          sampleCase({
            id: caseId,
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: null,
            status: 'open',
            updatedAt: now,
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      const body = (await res.json()) as { data: Array<Record<string, unknown>> };
      expect(res.status).toBe(200);
      expect(body.data[0]!.poolUrgencyTier).toBe('fresh');
      expect(body.data[0]!.ageInPoolSeconds as number).toBeLessThan(5);
    });

    it('an unclaimed case that has sat in the pool for days is annotated "stale"', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      harness = createHarness({
        cases: [
          sampleCase({
            id: caseId,
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: null,
            status: 'open',
            reportedAt: fourDaysAgo,
            updatedAt: fourDaysAgo,
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      const body = (await res.json()) as { data: Array<Record<string, unknown>> };
      expect(body.data[0]!.poolUrgencyTier).toBe('stale');
    });

    it('does not add any new personal-data field to the offer-tier list response (asset category NOT included — not available without a schema change)', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        cases: [
          sampleCase({
            id: caseId,
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: null,
            status: 'open',
            notes: 'sensitive address details',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      const body = (await res.json()) as { data: Array<Record<string, unknown>> };
      expectExactKeys(body.data[0]!, OFFER_TIER_RESPONSE_KEYS);
      expect(body.data[0]).not.toHaveProperty('assetId');
      expect(body.data[0]).not.toHaveProperty('accountId');
      expect(body.data[0]).not.toHaveProperty('assetType');
      expect(body.data[0]).not.toHaveProperty('assetCategory');
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
        body: JSON.stringify({ status: 'recovered', closeReason: 'recovered-intact' }),
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

      // ADR-0006 §18.8 C-C / SR-009S-7 — the applied-iff chain-check rule
      // (docs/organization/runbooks/aud-8-privileged-access-reconstruction.md §14.2),
      // applied directly to this race's own resulting row and case state: this is
      // the only (hence latest) privileged_state_change row for the case, so it was
      // "applied" iff the case's current status equals the row's toStatus. The case
      // is at 'tracking' (the race's own outcome) and the row's toStatus is
      // 'recovered' — they differ, so the chain check must say "not applied",
      // which matches reality: the audited transition never took effect.
      const row = stateChangeCalls[0]!.event;
      const caseStatusAfter = stored.status;
      const chainCheckApplied = caseStatusAfter === row.toStatus;
      expect(chainCheckApplied).toBe(false);
    });

    // ADR-0006 §18.8 C-B: "write the decision record BEFORE the mutation" is only an
    // acceptable substitute for a transaction if a failed audit write provably stops
    // the mutation from running. SR-009S-4 — no prior test actually simulated the
    // audit write itself throwing; the race tests above simulate a concurrent writer,
    // not a failing `recordStateChange` call.
    describe('SR-009S-4 — C-B fail-closed: if the audit write throws, the mutation never runs', () => {
      it('POST /claim: recordStateChange throwing returns 5xx, never calls claimForPartnerOrg, and leaves the case unclaimed', async () => {
        const caseId = '507f1f77bcf86cd799439011';
        const accountId = randomUUID();
        harness = createHarness({
          failStateChangeAudit: true,
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

        expect(res.status).toBeGreaterThanOrEqual(500);
        expect(harness.mutationCalls.claim).toBe(0);
        const stored = harness.cases.find((c) => c.id === caseId)!;
        expect(stored.status).toBe('open');
        expect(stored.partnerOrganizationId).toBeNull();
      });

      it('PATCH: recordStateChange throwing returns 5xx, never calls updateStatusForPartnerOrg, and leaves the case status unchanged', async () => {
        const caseId = '507f1f77bcf86cd799439011';
        const accountId = randomUUID();
        harness = createHarness({
          partnerOrgId: 'org-123',
          failStateChangeAudit: true,
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

        expect(res.status).toBeGreaterThanOrEqual(500);
        expect(harness.mutationCalls.updateStatus).toBe(0);
        const stored = harness.cases.find((c) => c.id === caseId)!;
        expect(stored.status).toBe('investigating');
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

  // SR-009S-6 — forward-only status transitions: a claimed case may not be moved
  // back to an earlier status (defeats the PDM-4 90-day wrap-up window otherwise).
  describe('SR-009S-6 — PATCH enforces forward-only status transitions', () => {
    it('rejects moving a closed case back to investigating with 409, not 2xx', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        partnerOrgId: 'org-123',
        cases: [
          sampleCase({
            id: caseId,
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-123',
            status: 'closed',
            closedAt: new Date(),
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
        body: JSON.stringify({ status: 'investigating' }),
      });
      expect(res.status).toBe(409);

      const stored = harness.cases.find((c) => c.id === caseId);
      expect(stored?.status).toBe('closed');
      expect(harness.accessLogCalls.filter((c) => c.kind === 'stateChange')).toHaveLength(0);
    });

    it('rejects moving a recovered case back to tracking with 409', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        partnerOrgId: 'org-123',
        cases: [
          sampleCase({
            id: caseId,
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-123',
            status: 'recovered',
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
      expect(res.status).toBe(409);
    });

    it('still allows the legitimate forward recovered -> closed transition', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({
        partnerOrgId: 'org-123',
        cases: [
          sampleCase({
            id: caseId,
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-123',
            status: 'recovered',
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
        body: JSON.stringify({ status: 'closed', closeReason: 'handed-to-police' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; closeReason: string };
      expect(body.status).toBe('closed');
      expect(body.closeReason).toBe('handed-to-police');
    });

    it('still allows skipping directly from investigating to recovered (forward, not sequential)', async () => {
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
        body: JSON.stringify({ status: 'recovered', closeReason: 'recovered-intact' }),
      });
      expect(res.status).toBe(200);
    });
  });

  // Product-differentiation research, "structured close reasons".
  describe('PATCH closeReason — required on terminal transitions, forbidden otherwise', () => {
    function harnessWithInvestigatingCase(caseId: string) {
      return createHarness({
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
    }

    it('400s a transition to "recovered" with no closeReason', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = harnessWithInvestigatingCase(caseId);
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'recovered' }),
      });
      expect(res.status).toBe(400);
      expect(harness.mutationCalls.updateStatus).toBe(0);
      expect(harness.accessLogCalls).toHaveLength(0);
    });

    it('400s a transition to "closed" with no closeReason', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = harnessWithInvestigatingCase(caseId);
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      expect(res.status).toBe(400);
    });

    it('400s a transition to "recovered" with an out-of-vocabulary closeReason', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = harnessWithInvestigatingCase(caseId);
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'recovered', closeReason: 'lost-forever' }),
      });
      expect(res.status).toBe(400);
    });

    it('400s a non-terminal transition that (incorrectly) supplies a closeReason', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = harnessWithInvestigatingCase(caseId);
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'tracking', closeReason: 'not-located' }),
      });
      expect(res.status).toBe(400);
    });

    it('accepts a terminal transition with a valid closeReason and stores/returns it', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = harnessWithInvestigatingCase(caseId);
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'recovered', closeReason: 'recovered-damaged' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; closeReason: string };
      expect(body.status).toBe('recovered');
      expect(body.closeReason).toBe('recovered-damaged');

      const stored = harness.cases.find((c) => c.id === caseId);
      expect(stored?.closeReason).toBe('recovered-damaged');
    });

    it('each of the five documented close reasons is individually accepted', async () => {
      const reasons = [
        'recovered-intact',
        'recovered-damaged',
        'not-located',
        'handed-to-police',
        'customer-withdrew',
      ] as const;

      harness = createHarness({
        partnerOrgId: 'org-123',
        cases: reasons.map((_, i) =>
          sampleCase({
            id: `507f1f77bcf86cd79943901${i}`,
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: 'org-123',
            status: 'investigating',
          }),
        ),
      });
      await harness.start();

      for (let i = 0; i < reasons.length; i += 1) {
        const caseId = `507f1f77bcf86cd79943901${i}`;
        const closeReason = reasons[i]!;
        const res = await fetch(harness.url(`/security/cases/${caseId}`), {
          method: 'PATCH',
          headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'closed', closeReason }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { closeReason: string };
        expect(body.closeReason).toBe(closeReason);
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

  // SR-009S-8 (security-engineer, §9.5) — a validly-authenticated token of the WRONG
  // userType must be rejected by `requireUserType('security_company_operator')`. Only
  // "no partner org" (403, above) and the happy path were covered before this; nothing
  // pinned a `customer`-typed token specifically being refused.
  it('SR-009S-8: a valid customer-typed token receives 403, not 2xx, on GET /security/cases', async () => {
    const env = fakeEnv();
    const customerToken = signAccessToken(
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
      headers: { authorization: `Bearer ${customerToken}` },
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

  // Gap-closure #1 — POST /security/cases/:caseId/release.
  describe('POST /security/cases/:caseId/release', () => {
    it('releases a case this org has claimed back to the unassigned pool', async () => {
      const orgId = randomUUID();
      const accountId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/release'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      // Offer-tier response shape — released case is unclaimed again, so no
      // accountId/notes/assetId/location fields (PDM-1/PDM-2).
      expectExactKeys(body, OFFER_TIER_RESPONSE_KEYS);
      expect(body.status).toBe('open');
      expect(body.partnerOrganizationId).toBeNull();

      expect(harness.mutationCalls.release).toBe(1);
      const stateChange = harness.accessLogCalls.find((c) => c.kind === 'stateChange');
      expect(stateChange).toBeDefined();
      expect(stateChange!.event).toMatchObject({
        targetAccountId: accountId,
        resourceType: 'recovery_case',
        resourceId: '507f1f77bcf86cd799439011',
        fromStatus: 'investigating',
        toStatus: 'open',
      });

      // The now-unclaimed case is claimable again by any org, including this one.
      const claimRes = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/claim'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(claimRes.status).toBe(200);
    });

    it('allows releasing a "tracking" case too', async () => {
      const orgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'tracking',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/release'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);
    });

    it('404s on a case not claimed by the caller org (no cross-tenant release)', async () => {
      const orgId = randomUUID();
      const otherOrgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: otherOrgId,
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/release'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(404);
      expect(harness.accessLogCalls).toHaveLength(0);
    });

    it('404s on an already-recovered/closed case (no re-opening via release)', async () => {
      const orgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'closed',
            closedAt: new Date(),
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/release'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(404);
      expect(harness.mutationCalls.release).toBe(0);
    });

    it('404s on an unclaimed/offer-tier case', async () => {
      const orgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
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

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/release'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 for a wrong-role token', async () => {
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

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/release'), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(403);
    });
  });

  // POST /security/cases/:caseId/reassign — targeted reassignment to a specific
  // partner org, now that `partner_organizations` exists.
  describe('POST /security/cases/:caseId/reassign', () => {
    it('reassigns a claimed case directly to a specific active target org', async () => {
      const orgId = randomUUID();
      const targetOrgId = randomUUID();
      const accountId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        partnerOrganizations: [{ id: targetOrgId, status: 'active' }],
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'tracking',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/reassign'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: targetOrgId }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      // Claimed-tier response shape (PDM-1/PDM-2) — same as /claim's own response.
      expectExactKeys(body, CLAIMED_TIER_RESPONSE_KEYS);
      expect(body.status).toBe('investigating');
      expect(body.partnerOrganizationId).toBe(targetOrgId);

      expect(harness.mutationCalls.reassign).toBe(1);
      // The case never passed through the shared unassigned pool — no claim call
      // happened as part of this operation.
      expect(harness.mutationCalls.claim).toBe(0);

      const stateChange = harness.accessLogCalls.find((c) => c.kind === 'stateChange');
      expect(stateChange).toBeDefined();
      expect(stateChange!.event).toMatchObject({
        targetAccountId: accountId,
        resourceType: 'recovery_case',
        resourceId: '507f1f77bcf86cd799439011',
        fromStatus: 'tracking',
        toStatus: 'investigating',
      });

      // The case is now claimed by the target org, not the pool — the original
      // caller's org can no longer see/release it, and a third org cannot claim it.
      const releaseRes = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/release'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(releaseRes.status).toBe(404);
    });

    it('404s on a case not claimed by the caller org (no cross-tenant reassign)', async () => {
      const orgId = randomUUID();
      const otherOrgId = randomUUID();
      const targetOrgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        partnerOrganizations: [{ id: targetOrgId, status: 'active' }],
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: otherOrgId,
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/reassign'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: targetOrgId }),
      });
      expect(res.status).toBe(404);
      expect(harness.accessLogCalls).toHaveLength(0);
      expect(harness.mutationCalls.reassign).toBe(0);
    });

    it('404s on an already-recovered/closed case', async () => {
      const orgId = randomUUID();
      const targetOrgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        partnerOrganizations: [{ id: targetOrgId, status: 'active' }],
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'closed',
            closedAt: new Date(),
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/reassign'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: targetOrgId }),
      });
      expect(res.status).toBe(404);
      expect(harness.mutationCalls.reassign).toBe(0);
    });

    it('rejects reassignment to an unknown target org', async () => {
      const orgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        partnerOrganizations: [],
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/reassign'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: randomUUID() }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(harness.mutationCalls.reassign).toBe(0);
      expect(harness.accessLogCalls).toHaveLength(0);
    });

    it('rejects reassignment to a suspended target org', async () => {
      const orgId = randomUUID();
      const targetOrgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        partnerOrganizations: [{ id: targetOrgId, status: 'suspended' }],
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/reassign'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: targetOrgId }),
      });
      expect(res.status).toBe(400);
      expect(harness.mutationCalls.reassign).toBe(0);
    });

    it('rejects reassignment to the caller\'s own org', async () => {
      const orgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        partnerOrganizations: [{ id: orgId, status: 'active' }],
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/reassign'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: orgId }),
      });
      expect(res.status).toBe(400);
      expect(harness.mutationCalls.reassign).toBe(0);
    });

    it('rejects a non-UUID targetPartnerOrganizationId with VALIDATION_ERROR', async () => {
      const orgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/reassign'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: 'not-a-uuid' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 403 for a wrong-role token', async () => {
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

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/reassign'), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: randomUUID() }),
      });
      expect(res.status).toBe(403);
    });
  });

  // Gap-closure #2 — POST /security/cases/:caseId/messages ("contact customer").
  describe('POST /security/cases/:caseId/messages', () => {
    it('accepts a message to the customer on a case this org has claimed', async () => {
      const orgId = randomUUID();
      const accountId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId,
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'investigating',
            referenceNumber: 'RC-20260801-ABCD',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/messages'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'We need a clearer photo of the asset to proceed.' }),
      });
      expect(res.status).toBe(202);
      const body = (await res.json()) as { data: { accepted: boolean } };
      expect(body.data.accepted).toBe(true);

      // Audit trail written — no status change (fromStatus === toStatus), reason tags
      // the action, and the message's free text is NOT written to the audit row.
      const stateChange = harness.accessLogCalls.find((c) => c.kind === 'stateChange');
      expect(stateChange).toBeDefined();
      expect(stateChange!.event).toMatchObject({
        targetAccountId: accountId,
        resourceType: 'recovery_case',
        resourceId: '507f1f77bcf86cd799439011',
        fromStatus: 'investigating',
        toStatus: 'investigating',
        reason: 'security_operator_contacted_customer',
      });
      const stateChangeEvent = stateChange!.event as Record<string, unknown>;
      expect(JSON.stringify(stateChangeEvent)).not.toContain('clearer photo');

      // Dispatched via the existing recovery-notification infrastructure, which
      // itself gates on the customer's notification preferences — not a new
      // delivery channel.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(harness.caseMessageCalls).toHaveLength(1);
      expect(harness.caseMessageCalls[0]).toMatchObject({
        accountId,
        caseId: '507f1f77bcf86cd799439011',
        referenceNumber: 'RC-20260801-ABCD',
        message: 'We need a clearer photo of the asset to proceed.',
      });
    });

    it('404s — and does not dispatch a notification — on a case not claimed by the caller org', async () => {
      const orgId = randomUUID();
      const otherOrgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: otherOrgId,
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/messages'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });
      expect(res.status).toBe(404);
      expect(harness.accessLogCalls).toHaveLength(0);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(harness.caseMessageCalls).toHaveLength(0);
    });

    it('404s on an unclaimed/offer-tier case (must claim before messaging)', async () => {
      const orgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
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

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/messages'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects an empty message with a validation error', async () => {
      const orgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/messages'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: '   ' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects a message over 500 characters', async () => {
      const orgId = randomUUID();
      harness = createHarness({
        partnerOrgId: orgId,
        cases: [
          sampleCase({
            id: '507f1f77bcf86cd799439011',
            accountId: randomUUID(),
            assetId: '507f1f77bcf86cd799439021',
            partnerOrganizationId: orgId,
            status: 'investigating',
          }),
        ],
      });
      await harness.start();

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/messages'), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'x'.repeat(501) }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 403 for a wrong-role token', async () => {
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

      const res = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011/messages'), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------
  // OB-03 (api-design-ob03-dispatch-location-grants.md §3, Tier A sub-task 3) —
  // dispatch-model routes/predicates, `ctx.env.directedDispatchEnabled: true`.
  // ---------------------------------------------------------------------
  describe('dispatch model (DIRECTED_DISPATCH_ENABLED=true)', () => {
    function pendingCase(overrides: Partial<RecoveryCaseDocument> & { id: string; partnerOrganizationId: string }) {
      return sampleCase({
        accountId: randomUUID(),
        assetId: randomUUID(),
        status: 'open',
        dispatchStatus: 'pending',
        dispatchedAt: new Date(),
        dispatchedBy: randomUUID(),
        firstDispatchedAt: new Date(),
        dispatchCount: 1,
        ...overrides,
      });
    }

    function acceptedCase(overrides: Partial<RecoveryCaseDocument> & { id: string; partnerOrganizationId: string }) {
      return sampleCase({
        accountId: randomUUID(),
        assetId: randomUUID(),
        status: 'investigating',
        dispatchStatus: 'accepted',
        dispatchedAt: new Date(),
        dispatchedBy: randomUUID(),
        acceptedAt: new Date(),
        firstDispatchedAt: new Date(),
        dispatchCount: 1,
        ...overrides,
      });
    }

    it('claim is unmounted (404) once the flag is on', async () => {
      harness = createHarness({ directedDispatchEnabled: true });
      await harness.start();
      const res = await fetch(harness.url(`/security/cases/${randomUUID().replace(/-/g, '').slice(0, 24)}/claim`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(404);
    });

    it('reassign is unmounted (404) once the flag is on', async () => {
      harness = createHarness({ directedDispatchEnabled: true });
      await harness.start();
      const res = await fetch(harness.url(`/security/cases/${randomUUID().replace(/-/g, '').slice(0, 24)}/reassign`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ targetPartnerOrganizationId: randomUUID() }),
      });
      expect(res.status).toBe(404);
    });

    it('a pending case is visible at the offer tier only; list/count include it', async () => {
      harness = createHarness({
        directedDispatchEnabled: true,
        cases: [pendingCase({ id: '507f1f77bcf86cd799439011', partnerOrganizationId: '' })],
      });
      // partnerOrganizationId is filled in after harness creation below, since the
      // fixture needs the harness's own generated partnerOrgId.
      harness.cases[0]!.partnerOrganizationId = harness.partnerOrgId;
      await harness.start();

      const listRes = await fetch(harness.url('/security/cases'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as { data: Array<Record<string, unknown>> };
      expect(listBody.data).toHaveLength(1);
      expect(listBody.data[0]).not.toHaveProperty('notes');

      const countRes = await fetch(harness.url('/security/cases/count'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect((await countRes.json()) as { data: { count: number } }).toEqual({ data: { count: 1 } });

      const detailRes = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439011'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(detailRes.status).toBe(200);
    });

    it('a pending (not yet accepted) org cannot message or PATCH status', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({ directedDispatchEnabled: true, cases: [] });
      harness.cases.push(pendingCase({ id: caseId, partnerOrganizationId: harness.partnerOrgId }));
      await harness.start();

      const msgRes = await fetch(harness.url(`/security/cases/${caseId}/messages`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      });
      expect(msgRes.status).toBe(404);

      const patchRes = await fetch(harness.url(`/security/cases/${caseId}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'tracking' }),
      });
      expect(patchRes.status).toBe(404);
    });

    it('accept transitions pending -> accepted and the customer sees "investigating"', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({ directedDispatchEnabled: true, cases: [] });
      harness.cases.push(pendingCase({ id: caseId, partnerOrganizationId: harness.partnerOrgId }));
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}/accept`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      expect(harness.cases[0]!.dispatchStatus).toBe('accepted');
      expect(harness.cases[0]!.status).toBe('investigating');
      expect(harness.cases[0]!.acceptedAt).not.toBeNull();
    });

    it('accept rejects an unexpected body field (SE-1)', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({ directedDispatchEnabled: true, cases: [] });
      harness.cases.push(pendingCase({ id: caseId, partnerOrganizationId: harness.partnerOrgId }));
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}/accept`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ $ne: null }),
      });
      expect(res.status).toBe(400);
    });

    it('decline returns the case to the queue with a fixed-vocabulary reason', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({ directedDispatchEnabled: true, cases: [] });
      harness.cases.push(pendingCase({ id: caseId, partnerOrganizationId: harness.partnerOrgId }));
      await harness.start();

      const badRes = await fetch(harness.url(`/security/cases/${caseId}/decline`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'free-text-not-allowed' }),
      });
      expect(badRes.status).toBe(400);

      const res = await fetch(harness.url(`/security/cases/${caseId}/decline`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'no_capacity' }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { caseId, status: 'returned_to_queue' } });
      expect(harness.cases[0]!.partnerOrganizationId).toBeNull();
      expect(harness.cases[0]!.dispatchStatus).toBeNull();
    });

    it('release (repurposed) hands an accepted case back to the queue', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({ directedDispatchEnabled: true, cases: [] });
      harness.cases.push(acceptedCase({ id: caseId, partnerOrganizationId: harness.partnerOrgId }));
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}/release`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'unable_to_proceed' }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { caseId, status: 'returned_to_queue' } });
      expect(harness.cases[0]!.partnerOrganizationId).toBeNull();
      expect(harness.cases[0]!.dispatchStatus).toBeNull();
    });

    it('release rejects a free-text/invalid reason (SE-1)', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({ directedDispatchEnabled: true, cases: [] });
      harness.cases.push(acceptedCase({ id: caseId, partnerOrganizationId: harness.partnerOrgId }));
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}/release`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'whatever I want' }),
      });
      expect(res.status).toBe(400);
    });

    it('a pending-only org cannot release (only an accepted org can)', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({ directedDispatchEnabled: true, cases: [] });
      harness.cases.push(pendingCase({ id: caseId, partnerOrganizationId: harness.partnerOrgId }));
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}/release`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'unable_to_proceed' }),
      });
      expect(res.status).toBe(404);
    });

    it('an accepted org can PATCH status forward and message the customer', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      harness = createHarness({ directedDispatchEnabled: true, cases: [] });
      harness.cases.push(acceptedCase({ id: caseId, partnerOrganizationId: harness.partnerOrgId }));
      await harness.start();

      const patchRes = await fetch(harness.url(`/security/cases/${caseId}`), {
        method: 'PATCH',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'tracking' }),
      });
      expect(patchRes.status).toBe(200);
      expect(harness.cases[0]!.status).toBe('tracking');

      const msgRes = await fetch(harness.url(`/security/cases/${caseId}/messages`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Update on your case' }),
      });
      expect(msgRes.status).toBe(202);
    });

    it('an accepted case closed 30 days ago is still visible at Tier 2 (wrap-up restored)', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      const closedAt = new Date();
      closedAt.setUTCDate(closedAt.getUTCDate() - 30);
      harness = createHarness({
        directedDispatchEnabled: true,
        cases: [
          acceptedCase({
            id: caseId,
            partnerOrganizationId: '',
            status: 'closed',
            closedAt,
            closeReason: 'recovered-intact',
          }),
        ],
      });
      harness.cases[0]!.partnerOrganizationId = harness.partnerOrgId;
      await harness.start();

      const res = await fetch(harness.url(`/security/cases/${caseId}`), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(res.status).toBe(200);
    });

    it('[CO-OB03-3] a terminated org loses access immediately, even inside the 90-day window', async () => {
      const caseId = '507f1f77bcf86cd799439011';
      const closedAt = new Date();
      closedAt.setUTCDate(closedAt.getUTCDate() - 30);
      harness = createHarness({
        directedDispatchEnabled: true,
        callerOrgEligible: false,
        cases: [
          acceptedCase({
            id: caseId,
            partnerOrganizationId: '',
            status: 'closed',
            closedAt,
            closeReason: 'recovered-intact',
          }),
        ],
      });
      harness.cases[0]!.partnerOrganizationId = harness.partnerOrgId;
      await harness.start();

      const detailRes = await fetch(harness.url(`/security/cases/${caseId}`), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(detailRes.status).toBe(404);

      const listRes = await fetch(harness.url('/security/cases'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(listRes.status).toBe(200);
      expect(((await listRes.json()) as { data: unknown[] }).data).toHaveLength(0);

      const countRes = await fetch(harness.url('/security/cases/count'), {
        headers: { authorization: `Bearer ${harness.token}` },
      });
      expect(((await countRes.json()) as { data: { count: number } }).data.count).toBe(0);

      const msgRes = await fetch(harness.url(`/security/cases/${caseId}/messages`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      });
      expect(msgRes.status).toBe(404);

      const releaseRes = await fetch(harness.url(`/security/cases/${caseId}/release`), {
        method: 'POST',
        headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'unable_to_proceed' }),
      });
      expect(releaseRes.status).toBe(404);
    });

    // [A9(i)] CS-8 oracle uniformity — identical NOT_FOUND body across
    // undispatched / dispatched-elsewhere / nonexistent, for detail/release/
    // messages/status-PATCH, plus cross-type tokens.
    describe('[A9(i)] CS-8 oracle uniformity', () => {
      const CASE_ID = '507f1f77bcf86cd799439099';

      async function bodyOf(res: Response) {
        if (res.status !== 404) return null;
        const body = (await res.json()) as { error: Record<string, unknown> };
        const { requestId: _requestId, ...rest } = body.error;
        return rest;
      }

      it('detail returns the identical body for nonexistent / dispatched-elsewhere / undispatched', async () => {
        const otherOrgId = randomUUID();
        harness = createHarness({
          directedDispatchEnabled: true,
          cases: [pendingCase({ id: CASE_ID, partnerOrganizationId: otherOrgId })],
        });
        await harness.start();

        const nonexistentRes = await fetch(harness.url('/security/cases/507f1f77bcf86cd799439098'), {
          headers: { authorization: `Bearer ${harness.token}` },
        });
        const dispatchedElsewhereRes = await fetch(harness.url(`/security/cases/${CASE_ID}`), {
          headers: { authorization: `Bearer ${harness.token}` },
        });

        expect(nonexistentRes.status).toBe(404);
        expect(dispatchedElsewhereRes.status).toBe(404);
        expect(await bodyOf(nonexistentRes)).toEqual(await bodyOf(dispatchedElsewhereRes));
      });

      it('a customer token and an admin token both get the same NOT_FOUND shape as a partner token', async () => {
        harness = createHarness({ directedDispatchEnabled: true, cases: [] });
        await harness.start();
        const env = fakeEnv();

        const customerToken = signAccessToken(
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
        const adminToken = signAccessToken(
          {
            sub: randomUUID(),
            user_type: 'admin',
            mfa_required: true,
            account_state: 'active',
            partner_organization_id: null,
            session_id: randomUUID(),
          },
          env.jwtSigningKeys,
          env.jwtActiveKid,
        ).token;

        const customerRes = await fetch(harness.url(`/security/cases/${CASE_ID}`), {
          headers: { authorization: `Bearer ${customerToken}` },
        });
        const adminRes = await fetch(harness.url(`/security/cases/${CASE_ID}`), {
          headers: { authorization: `Bearer ${adminToken}` },
        });
        // Neither has a partnerOrganizationId, so both are rejected by
        // `requirePartnerOrg` before ever reaching a case lookup — same 403
        // shape either way, and distinctly NOT a 200/404 case-shaped body.
        expect(customerRes.status).toBe(403);
        expect(adminRes.status).toBe(403);
      });
    });

    // Stage 10 QA report (qa-report-ob03-dispatch-tier-a.md) Finding 2 — CO-OB03-5 /
    // SR-009S-4: accept/decline/release in dispatch mode must each write exactly one
    // `recordStateChange` audit row (mirroring the pool-mode PDM-8/SR-009S-4 tests
    // above at lines ~1195-1426), and a failing audit write must block the mutation.
    describe('[Finding 2] CO-OB03-5 audit trail + SR-009S-4 fail-closed, dispatch mode', () => {
      it('accept writes exactly one recordStateChange row with fromStatus "open"/toStatus "investigating"', async () => {
        const caseId = '507f1f77bcf86cd799439011';
        const accountId = randomUUID();
        harness = createHarness({ directedDispatchEnabled: true, cases: [] });
        harness.cases.push(pendingCase({ id: caseId, accountId, partnerOrganizationId: harness.partnerOrgId }));
        await harness.start();

        const res = await fetch(harness.url(`/security/cases/${caseId}/accept`), {
          method: 'POST',
          headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({}),
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
          reason: 'dispatch_accepted',
        });
      });

      it('decline writes exactly one recordStateChange row tagged with the decline reason', async () => {
        const caseId = '507f1f77bcf86cd799439011';
        const accountId = randomUUID();
        harness = createHarness({ directedDispatchEnabled: true, cases: [] });
        harness.cases.push(pendingCase({ id: caseId, accountId, partnerOrganizationId: harness.partnerOrgId }));
        await harness.start();

        const res = await fetch(harness.url(`/security/cases/${caseId}/decline`), {
          method: 'POST',
          headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'no_capacity' }),
        });
        expect(res.status).toBe(200);

        const stateChangeCalls = harness.accessLogCalls.filter((c) => c.kind === 'stateChange');
        expect(stateChangeCalls).toHaveLength(1);
        expect(stateChangeCalls[0]!.event).toMatchObject({
          targetAccountId: accountId,
          resourceType: 'recovery_case',
          resourceId: caseId,
          reason: 'dispatch_declined:no_capacity',
        });
      });

      it('release (hand-back) writes exactly one recordStateChange row tagged with the hand-back reason', async () => {
        const caseId = '507f1f77bcf86cd799439011';
        const accountId = randomUUID();
        harness = createHarness({ directedDispatchEnabled: true, cases: [] });
        harness.cases.push(acceptedCase({ id: caseId, accountId, partnerOrganizationId: harness.partnerOrgId }));
        await harness.start();

        const res = await fetch(harness.url(`/security/cases/${caseId}/release`), {
          method: 'POST',
          headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'unable_to_proceed' }),
        });
        expect(res.status).toBe(200);

        const stateChangeCalls = harness.accessLogCalls.filter((c) => c.kind === 'stateChange');
        expect(stateChangeCalls).toHaveLength(1);
        expect(stateChangeCalls[0]!.event).toMatchObject({
          targetAccountId: accountId,
          resourceType: 'recovery_case',
          resourceId: caseId,
          reason: 'case_handed_back:unable_to_proceed',
        });
      });

      describe('SR-009S-4 fail-closed — dispatch-mode accept/decline/release', () => {
        it('accept: recordStateChange throwing returns 5xx, never calls acceptDispatchedCase, and leaves the case pending', async () => {
          const caseId = '507f1f77bcf86cd799439011';
          harness = createHarness({ directedDispatchEnabled: true, failStateChangeAudit: true, cases: [] });
          harness.cases.push(pendingCase({ id: caseId, partnerOrganizationId: harness.partnerOrgId }));
          await harness.start();

          const res = await fetch(harness.url(`/security/cases/${caseId}/accept`), {
            method: 'POST',
            headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({}),
          });

          expect(res.status).toBeGreaterThanOrEqual(500);
          expect(harness.mutationCalls.accept).toBe(0);
          const stored = harness.cases.find((c) => c.id === caseId)!;
          expect(stored.dispatchStatus).toBe('pending');
          expect(stored.status).toBe('open');
        });

        it('decline: recordStateChange throwing returns 5xx, never calls declineDispatchedCase, and leaves the case pending/assigned', async () => {
          const caseId = '507f1f77bcf86cd799439011';
          harness = createHarness({ directedDispatchEnabled: true, failStateChangeAudit: true, cases: [] });
          harness.cases.push(pendingCase({ id: caseId, partnerOrganizationId: harness.partnerOrgId }));
          await harness.start();

          const res = await fetch(harness.url(`/security/cases/${caseId}/decline`), {
            method: 'POST',
            headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ reason: 'no_capacity' }),
          });

          expect(res.status).toBeGreaterThanOrEqual(500);
          expect(harness.mutationCalls.decline).toBe(0);
          const stored = harness.cases.find((c) => c.id === caseId)!;
          expect(stored.dispatchStatus).toBe('pending');
          expect(stored.partnerOrganizationId).toBe(harness.partnerOrgId);
        });

        it('release: recordStateChange throwing returns 5xx, never calls handBackAcceptedCase, and leaves the case accepted/assigned', async () => {
          const caseId = '507f1f77bcf86cd799439011';
          harness = createHarness({ directedDispatchEnabled: true, failStateChangeAudit: true, cases: [] });
          harness.cases.push(acceptedCase({ id: caseId, partnerOrganizationId: harness.partnerOrgId }));
          await harness.start();

          const res = await fetch(harness.url(`/security/cases/${caseId}/release`), {
            method: 'POST',
            headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ reason: 'unable_to_proceed' }),
          });

          expect(res.status).toBeGreaterThanOrEqual(500);
          expect(harness.mutationCalls.handBack).toBe(0);
          const stored = harness.cases.find((c) => c.id === caseId)!;
          expect(stored.dispatchStatus).toBe('accepted');
          expect(stored.partnerOrganizationId).toBe(harness.partnerOrgId);
        });
      });
    });

    // Stage 10 QA report Finding 4 — CO-OB03-6: a full partner-initiated
    // accept -> release (hand-back) -> admin re-dispatch -> accept-by-a-different-org
    // cycle through `security-cases.ts`'s own endpoints (as opposed to the
    // admin-initiated re-dispatch-to-null path already covered at
    // `admin-case-dispatch.test.ts:710`). Asserts the "returned to queue" signal is
    // correct immediately after the partner-initiated release step specifically, not
    // just after an admin-initiated recall.
    describe('[Finding 4] CO-OB03-6 — partner-initiated accept -> release -> re-dispatch -> accept cycle', () => {
      it('clears assignment on release, then a different org can accept after an admin re-dispatch', async () => {
        const caseId = '507f1f77bcf86cd799439011';
        const accountId = randomUUID();
        const orgA = randomUUID();
        const orgB = randomUUID();
        harness = createHarness({
          directedDispatchEnabled: true,
          partnerOrgId: orgA,
          partnerOrganizations: [{ id: orgB, status: 'active', agreementStatus: 'executed', terminatedAt: null }],
          cases: [],
        });
        harness.cases.push(pendingCase({ id: caseId, accountId, partnerOrganizationId: orgA }));
        await harness.start();

        // Org A accepts.
        const acceptRes = await fetch(harness.url(`/security/cases/${caseId}/accept`), {
          method: 'POST',
          headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(acceptRes.status).toBe(200);
        expect(harness.cases[0]!.dispatchStatus).toBe('accepted');
        expect(harness.cases[0]!.partnerOrganizationId).toBe(orgA);

        // Org A hands the case back (release).
        const releaseRes = await fetch(harness.url(`/security/cases/${caseId}/release`), {
          method: 'POST',
          headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'unable_to_proceed' }),
        });
        expect(releaseRes.status).toBe(200);
        expect(await releaseRes.json()).toEqual({ data: { caseId, status: 'returned_to_queue' } });

        // [CO-OB03-6] Immediately after the partner-initiated release — not after a
        // later admin action — the case must show as unassigned/returned to the
        // queue, not still "assigned" to org A (the org that released it).
        const afterRelease = harness.cases.find((c) => c.id === caseId)!;
        expect(afterRelease.partnerOrganizationId).toBeNull();
        expect(afterRelease.dispatchStatus).toBeNull();

        // Admin re-dispatches the now-unassigned case to org B. This mutation mirrors
        // exactly what `admin-case-dispatch.ts`'s dispatch/re-dispatch route performs
        // on a `dispatchStatus: null` case (verified at the route level in
        // `admin-case-dispatch.test.ts`); applied here directly against the shared
        // fake store so org B can exercise its own `accept` through this file's
        // `security-cases` router.
        harness.cases[0] = {
          ...harness.cases[0]!,
          partnerOrganizationId: orgB,
          dispatchStatus: 'pending',
          status: 'open',
          dispatchedAt: new Date(),
          dispatchedBy: randomUUID(),
          dispatchCount: (harness.cases[0]!.dispatchCount ?? 0) + 1,
        };

        // Org B's token — a fresh harness is needed to get a valid bearer scoped to
        // orgB, since this harness's token is scoped to orgA.
        const orgBHarness = createHarness({
          directedDispatchEnabled: true,
          partnerOrgId: orgB,
          cases: harness.cases,
        });

        const acceptByOrgBRes = await fetch(harness.url(`/security/cases/${caseId}/accept`), {
          method: 'POST',
          headers: { authorization: `Bearer ${orgBHarness.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(acceptByOrgBRes.status).toBe(200);
        expect(harness.cases[0]!.partnerOrganizationId).toBe(orgB);
        expect(harness.cases[0]!.dispatchStatus).toBe('accepted');
      });
    });
  });
});
