/**
 * Admin `/admin/claims*` routes — coverage-limit enforcement, required-reason
 * gates, approval auto-advance, forward-only transitions, RBAC.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAdminClaimsRouter } from './admin-claims.js';
import { createClaimsRouter } from './claims.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AccountStatus } from '../repositories/accounts.js';
import type { AssetDocument } from '../repositories/assets.js';
import type { PolicyDocument } from '../repositories/policies.js';
import type { ClaimDocument } from '../repositories/claims.js';
import {
  isForwardClaimTransition,
  MAX_CLAIMED_AMOUNT_SANITY_BOUND,
  MAX_CLAIM_APPROVED_AMOUNT_ZAR,
  type ClaimStatus,
} from '../lib/claim-rules.js';
import type { Env } from '../config/env.js';
import type {
  AdminAccessBulkDisclosureInput,
  AdminAccessDetailInput,
  AdminAccessStateChangeInput,
} from '../repositories/admin-access-log.js';

const ASSET_ID = '507f1f77bcf86cd799439021';
const POLICY_ID = '507f1f77bcf86cd799439010';
const CLAIM_ID = '507f1f77bcf86cd799439055';

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
    // SR-018-2: the claims API kill switch defaults to false (fail-closed).
    // Every pre-existing test in this file exercises claims *behavior*, so it
    // must opt in explicitly; the kill-switch-specific tests below override it.
    claimsApiEnabled: true,
    ...overrides,
  };
}

function tokenFor(env: Env, accountId: string, sessionId: string, userType: 'admin' | 'customer'): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: userType,
      mfa_required: userType === 'admin',
      account_state: 'active',
      partner_organization_id: null,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

function samplePolicy(accountId: string, overrides?: Partial<PolicyDocument>): PolicyDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id: POLICY_ID,
    accountId,
    planTier: 'essential',
    planCatalogId: null,
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
    ...overrides,
  };
}

function sampleAsset(accountId: string, overrides?: Partial<AssetDocument>): AssetDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id: ASSET_ID,
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
    details: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sampleClaim(accountId: string, overrides?: Partial<ClaimDocument>): ClaimDocument {
  const now = new Date('2026-09-01T12:00:00.000Z');
  return {
    id: CLAIM_ID,
    accountId,
    policyId: POLICY_ID,
    assetId: ASSET_ID,
    recoveryCaseId: null,
    supersedesClaimId: null,
    status: 'under_review',
    assetTypeSnapshot: 'laptop',
    assetDisplayNameSnapshot: 'Work laptop',
    policyPlanTierSnapshot: 'essential',
    incidentDescription: 'Laptop was stolen from my car overnight.',
    incidentDate: now,
    evidenceDescription: null,
    claimedAmount: 1000,
    claimedAmountCurrency: 'ZAR',
    approvedAmount: null,
    rejectionReason: null,
    reviewNotes: [],
    statusHistory: [],
    fraudFlags: [],
    submittedAt: now,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createHarness(opts: {
  accountId?: string;
  policy?: PolicyDocument;
  asset?: AssetDocument;
  claim: ClaimDocument;
  mfaVerifiedAt?: Date | null;
  envOverrides?: Partial<Env>;
  linkedRecoveryCase?: {
    id: string;
    status: string;
    partnerOrganizationId: string | null;
    referenceNumber: string;
  } | null;
}) {
  const env = fakeEnv(opts.envOverrides);
  const kv = new InMemoryKeyValueStore();
  const accountId = opts.accountId ?? randomUUID();
  const adminAccountId = randomUUID();
  const adminSessionId = randomUUID();
  let claim = opts.claim;
  const stateChanges: AdminAccessStateChangeInput[] = [];
  const bulkDisclosures: AdminAccessBulkDisclosureInput[] = [];
  const detailAccesses: AdminAccessDetailInput[] = [];

  const sessionRecord = {
    id: adminSessionId,
    accountId: adminAccountId,
    revokedAt: null as Date | null,
    mfaVerifiedAt: opts.mfaVerifiedAt !== undefined ? opts.mfaVerifiedAt : new Date(),
  };

  const ctx = {
    env,
    kv,
    sessions: {
      async findById(id: string) {
        return id === adminSessionId ? { ...sessionRecord } : null;
      },
    },
    claims: {
      async listForAdmin() {
        return [claim];
      },
      async findByIdForAdmin(id: string) {
        return id === claim.id ? claim : null;
      },
      async findNonTerminalByAssetForAccount() {
        return null;
      },
      async getLinkedRecoveryCaseSummary() {
        return opts.linkedRecoveryCase ?? null;
      },
      async transitionForAdmin(
        _id: string,
        input: { expectedStatus: ClaimStatus; toStatus: ClaimStatus; actorAccountId: string; reason: string | null },
      ) {
        if (claim.status !== input.expectedStatus) return null;
        if (!isForwardClaimTransition(input.expectedStatus, input.toStatus)) {
          throw Object.assign(new Error('invalid'), { name: 'InvalidClaimStatusTransitionError' });
        }
        claim = {
          ...claim,
          status: input.toStatus,
          rejectionReason: input.toStatus === 'rejected' ? input.reason : claim.rejectionReason,
          decidedAt: ['awaiting_payout', 'rejected', 'closed'].includes(input.toStatus) ? new Date() : claim.decidedAt,
          updatedAt: new Date(),
        };
        return claim;
      },
      async approveAndAdvance(
        _id: string,
        input: {
          expectedStatus: ClaimStatus;
          approvedAmount: number;
          actorAccountId: string;
          eligibilityDetermination?: string | null;
        },
      ) {
        if (claim.status !== input.expectedStatus) return null;
        if (!isForwardClaimTransition(input.expectedStatus, 'approved')) {
          throw Object.assign(new Error('invalid'), { name: 'InvalidClaimStatusTransitionError' });
        }
        claim = {
          ...claim,
          status: 'awaiting_payout',
          approvedAmount: input.approvedAmount,
          decidedAt: new Date(),
          updatedAt: new Date(),
          statusHistory: [
            ...claim.statusHistory,
            {
              fromStatus: input.expectedStatus,
              toStatus: 'approved',
              actorAccountId: input.actorAccountId,
              actorRole: 'admin',
              reason: input.eligibilityDetermination
                ? `eligibilityDetermination=${input.eligibilityDetermination}`
                : null,
              changedAt: new Date(),
            },
            {
              fromStatus: 'approved',
              toStatus: 'awaiting_payout',
              actorAccountId: input.actorAccountId,
              actorRole: 'system',
              reason: null,
              changedAt: new Date(),
            },
          ],
        };
        return claim;
      },
    },
    policies: {
      async findByIdForAdmin(id: string) {
        return opts.policy && opts.policy.id === id ? opts.policy : null;
      },
    },
    assets: {
      async findByIdForAdmin(id: string) {
        return opts.asset && opts.asset.id === id ? opts.asset : null;
      },
    },
    adminAccessLog: {
      async recordDetail(input: AdminAccessDetailInput) {
        detailAccesses.push(input);
      },
      async recordBulkDisclosure(input: AdminAccessBulkDisclosureInput) {
        bulkDisclosures.push(input);
      },
      async recordStateChange(input: AdminAccessStateChangeInput) {
        stateChanges.push(input);
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAdminClaimsRouter(ctx));
  app.use(createClaimsRouter(ctx));
  app.use(errorHandler);

  return { app, env, accountId, adminAccountId, adminSessionId, stateChanges, getClaim: () => claim };
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

let activeServer: Server | undefined;
afterEach(async () => {
  if (activeServer) {
    await new Promise((resolve) => activeServer!.close(resolve));
    activeServer = undefined;
  }
});

describe('GET /v1/admin/claims/{claimId} — linked recovery-case summary', () => {
  it('product-manager linkage: exposes linkedRecoveryCase when the claim has a recoveryCaseId', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { recoveryCaseId: '507f1f77bcf86cd799439099' }),
      linkedRecoveryCase: {
        id: '507f1f77bcf86cd799439099',
        status: 'open',
        partnerOrganizationId: 'partner-org-1',
        referenceNumber: 'RC-20260901-0001',
      },
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linkedRecoveryCase).toEqual({
      id: '507f1f77bcf86cd799439099',
      status: 'open',
      partnerOrganizationId: 'partner-org-1',
      referenceNumber: 'RC-20260901-0001',
    });
  });

  it('returns linkedRecoveryCase: null when the claim has no recoveryCaseId', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { recoveryCaseId: null }),
      linkedRecoveryCase: null,
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linkedRecoveryCase).toBeNull();
  });
});

describe('PATCH /v1/admin/claims/{claimId}', () => {
  it('AC-6: rejects an approvedAmount above a configured coverage limit', async () => {
    const acctId = randomUUID();
    const policy = samplePolicy(acctId, { coverageLimits: [{ assetType: 'laptop', amount: 5000, currency: 'ZAR' }] });
    // claimedAmount raised above the coverage limit under test so this
    // scenario exercises the coverage-limit guardrail specifically, not the
    // (lower-priority-to-report-but-also-true) approvedAmount > claimedAmount guardrail (SR-018-3).
    const harness = createHarness({
      accountId: acctId,
      policy,
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { claimedAmount: 10000 }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: 6000 }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('APPROVED_AMOUNT_EXCEEDS_COVERAGE_LIMIT');
    expect(harness.getClaim().status).toBe('under_review');
  });

  it('AC-7/AC-9: approves successfully and auto-advances to awaiting_payout when no coverage limit is configured', async () => {
    const acctId = randomUUID();
    const policy = samplePolicy(acctId, { coverageLimits: [] });
    // claimedAmount raised so an approvedAmount comfortably inside the
    // SR-018-3 hard ceiling can still be <= claimedAmount.
    const harness = createHarness({
      accountId: acctId,
      policy,
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { claimedAmount: 50000 }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: 50000 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('awaiting_payout');
    expect(body.approvedAmount).toBe(50000);
    // one state-change audit row, never a payout-related side effect.
    expect(harness.stateChanges).toHaveLength(1);
    expect(harness.stateChanges[0]!.toStatus).toBe('awaiting_payout');
    // SR-018-3: the approved figure is now recorded on the decision record
    // itself (reusing the existing `reason` field), not only on the mutable
    // domain document.
    expect(harness.stateChanges[0]!.reason).toBe('approvedAmount=50000.00 ZAR');
  });

  // §12.2 R7-3 (compliance ruling 2026-10-28) — eligibility hold on approval.
  describe('§12.2 R7-3: eligibility-determination hold on approving a FLAG_INCIDENT_BEFORE_ELIGIBILITY claim', () => {
    it('blocks approval with 422 ELIGIBILITY_DETERMINATION_REQUIRED when the claim is flagged and no determination is supplied', async () => {
      const acctId = randomUUID();
      const harness = createHarness({
        accountId: acctId,
        policy: samplePolicy(acctId),
        asset: sampleAsset(acctId),
        claim: sampleClaim(acctId, { claimedAmount: 1000, fraudFlags: ['FLAG_INCIDENT_BEFORE_ELIGIBILITY'] }),
      });
      const listened = await listen(harness.app);
      activeServer = listened.server;
      const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

      const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approved', approvedAmount: 1000 }),
      });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error.code).toBe('ELIGIBILITY_DETERMINATION_REQUIRED');
      expect(harness.getClaim().status).toBe('under_review');
      // No audit row and no mutation on a blocked attempt.
      expect(harness.stateChanges).toHaveLength(0);
    });

    it('succeeds with an eligibilityDetermination, recording it in statusHistory and the admin audit trail, never in the customer response', async () => {
      const acctId = randomUUID();
      const harness = createHarness({
        accountId: acctId,
        policy: samplePolicy(acctId),
        asset: sampleAsset(acctId),
        claim: sampleClaim(acctId, { claimedAmount: 1000, fraudFlags: ['FLAG_INCIDENT_BEFORE_ELIGIBILITY'] }),
      });
      const listened = await listen(harness.app);
      activeServer = listened.server;
      const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

      const determination =
        'Customer confirmed the incident date was mistyped; actual date is within cover, corroborated by police report.';
      const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'approved',
          approvedAmount: 1000,
          eligibilityDetermination: determination,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('awaiting_payout');
      expect(body.approvedAmount).toBe(1000);

      // Recorded in the admin audit trail (Trail B).
      expect(harness.stateChanges).toHaveLength(1);
      expect(harness.stateChanges[0]!.reason).toContain(`eligibilityDetermination=${determination}`);

      // Recorded in the claim's own statusHistory.
      const stored = harness.getClaim();
      expect(stored.statusHistory.some((h) => h.reason?.includes(determination))).toBe(true);

      // Never shown to the customer — not in the JSON response body at all,
      // under any key.
      expect(JSON.stringify(body)).not.toContain(determination);
      expect(body.eligibilityDetermination).toBeUndefined();
      expect(body.statusHistory).toBeUndefined();
    });

    it('does not require eligibilityDetermination for an ordinary (unflagged) approval', async () => {
      const acctId = randomUUID();
      const harness = createHarness({
        accountId: acctId,
        policy: samplePolicy(acctId),
        asset: sampleAsset(acctId),
        claim: sampleClaim(acctId, { claimedAmount: 1000, fraudFlags: [] }),
      });
      const listened = await listen(harness.app);
      activeServer = listened.server;
      const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

      const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approved', approvedAmount: 1000 }),
      });
      expect(res.status).toBe(200);
    });
  });

  it('SR-018-3: rejects approvedAmount above claimedAmount with 422 APPROVED_AMOUNT_EXCEEDS_CLAIMED', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { claimedAmount: 1000 }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: 1500 }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('APPROVED_AMOUNT_EXCEEDS_CLAIMED');
    expect(harness.getClaim().status).toBe('under_review');
    expect(harness.stateChanges).toHaveLength(0);
  });

  it('SR-018-3: allows approvedAmount exactly equal to claimedAmount', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { claimedAmount: 1000 }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: 1000 }),
    });
    expect(res.status).toBe(200);
  });

  it('SR-018-3: rejects an approvedAmount above the platform hard ceiling with 400 VALIDATION_ERROR', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { claimedAmount: MAX_CLAIMED_AMOUNT_SANITY_BOUND + 1_000_000 }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: MAX_CLAIMED_AMOUNT_SANITY_BOUND + 1 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(harness.getClaim().status).toBe('under_review');
  });

  it('security-review.md §12.4: rejects approval above the self-service ZAR ceiling with 422 APPROVAL_REQUIRES_ESCALATION, without capping or mutating the claim', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { claimedAmount: MAX_CLAIM_APPROVED_AMOUNT_ZAR + 50_000 }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: MAX_CLAIM_APPROVED_AMOUNT_ZAR + 1 }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('APPROVAL_REQUIRES_ESCALATION');
    expect(harness.getClaim().status).toBe('under_review');
  });

  it('security-review.md §12.4: allows approval exactly at the self-service ZAR ceiling', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { claimedAmount: MAX_CLAIM_APPROVED_AMOUNT_ZAR }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: MAX_CLAIM_APPROVED_AMOUNT_ZAR }),
    });
    expect(res.status).toBe(200);
  });

  it('security-review.md §12.4: fails closed (requires escalation) when the claim currency is not ZAR', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { claimedAmount: 1000, claimedAmountCurrency: 'USD' }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: 100 }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('APPROVAL_REQUIRES_ESCALATION');
  });

  it('SR-018-3: rejects an approvedAmount with more than 2 decimal places with 400 VALIDATION_ERROR', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { claimedAmount: 1000 }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: 999.999 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('SR-018-4: a configured coverage limit in a different currency fails closed (treated as exceeded)', async () => {
    const acctId = randomUUID();
    const policy = samplePolicy(acctId, {
      coverageLimits: [{ assetType: 'laptop', amount: 50000, currency: 'USD' }],
    });
    const harness = createHarness({
      accountId: acctId,
      policy,
      asset: sampleAsset(acctId),
      // claim's claimedAmountCurrency defaults to 'ZAR' (sampleClaim), which
      // does not match the USD-denominated limit above.
      claim: sampleClaim(acctId, { claimedAmount: 1000, claimedAmountCurrency: 'ZAR' }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: 1 }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('APPROVED_AMOUNT_EXCEEDS_COVERAGE_LIMIT');
    expect(harness.getClaim().status).toBe('under_review');
  });

  it('SR-018-4: a missing policy at approval time fails CLOSED (409), never an uncapped approval', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      // No policy registered in the harness at all — findByIdForAdmin
      // returns null for any id, simulating a policy that can no longer be
      // found at approval time.
      policy: undefined,
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { claimedAmount: 1000 }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: 500 }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('CLAIM_POLICY_NOT_FOUND');
    expect(harness.getClaim().status).toBe('under_review');
    expect(harness.stateChanges).toHaveLength(0);
  });

  it('AC-8: rejecting a claim without a rejectionReason returns 400 VALIDATION_ERROR and leaves status unchanged', async () => {
    const acctId = randomUUID();
    const harness = createHarness({ accountId: acctId, policy: samplePolicy(acctId), asset: sampleAsset(acctId), claim: sampleClaim(acctId) });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'rejected', rejectionReason: '' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(harness.getClaim().status).toBe('under_review');
  });

  it('rejects with a reason successfully', async () => {
    const acctId = randomUUID();
    const harness = createHarness({ accountId: acctId, policy: samplePolicy(acctId), asset: sampleAsset(acctId), claim: sampleClaim(acctId) });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'rejected', rejectionReason: 'Insufficient evidence of ownership.' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('rejected');
    expect(body.rejectionReason).toBe('Insufficient evidence of ownership.');
  });

  it('AC-10: rejects any further transition on an already-terminal claim with 409', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { status: 'rejected' }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start_review' }),
    });
    expect(res.status).toBe(409);
  });

  it('AC-12: a customer cannot call the admin PATCH route (403, route-level auth)', async () => {
    const acctId = randomUUID();
    const harness = createHarness({ accountId: acctId, policy: samplePolicy(acctId), asset: sampleAsset(acctId), claim: sampleClaim(acctId, { accountId: acctId }) });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, acctId, randomUUID(), 'customer');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approved', approvedAmount: 100 }),
    });
    expect(res.status).toBe(403);
  });

  it('requires a non-empty reviewNote for more_info_requested', async () => {
    const acctId = randomUUID();
    const harness = createHarness({ accountId: acctId, policy: samplePolicy(acctId), asset: sampleAsset(acctId), claim: sampleClaim(acctId) });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const missing = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'more_info_requested' }),
    });
    expect(missing.status).toBe(400);

    const ok = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'more_info_requested', reviewNote: 'Please attach a photo of the serial number.' }),
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.status).toBe('more_info_requested');
  });

  // ADR-0012 SU-FU-1 — claim adjudication sets approvedAmount, a real
  // financial figure, same Tier-A posture as admin-policies.ts's cancel route.
  it('requires step-up — stale mfaVerifiedAt returns STEP_UP_REQUIRED, claim unchanged', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId),
      mfaVerifiedAt: new Date(Date.now() - 16 * 60 * 1000),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'rejected', rejectionReason: 'Insufficient evidence of ownership.' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('STEP_UP_REQUIRED');
    expect(harness.getClaim().status).toBe('under_review');
  });

  it('requires step-up — no mfaVerifiedAt at all returns STEP_UP_REQUIRED', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId),
      mfaVerifiedAt: null,
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start_review' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('STEP_UP_REQUIRED');
  });

  it('succeeds with a fresh step-up (default harness mfaVerifiedAt = now)', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { status: 'submitted' }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start_review' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('under_review');
  });
});

describe('SR-018-2: admin claims API kill switch (CLAIMS_API_ENABLED)', () => {
  it('GET /v1/admin/claims returns 404 when claimsApiEnabled is unset (fail-closed default)', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      claim: sampleClaim(acctId),
      envOverrides: { claimsApiEnabled: undefined },
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it('GET /v1/admin/claims returns 404 when claimsApiEnabled is explicitly false', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      claim: sampleClaim(acctId),
      envOverrides: { claimsApiEnabled: false },
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 before authentication runs (no token, still 404 not 401)', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      claim: sampleClaim(acctId),
      envOverrides: { claimsApiEnabled: false },
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;

    const res = await fetch(`${listened.baseUrl}/admin/claims`);
    expect(res.status).toBe(404);
  });

  it('GET /v1/admin/claims/{claimId} returns 404 when disabled', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      claim: sampleClaim(acctId),
      envOverrides: { claimsApiEnabled: false },
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/admin/claims/{claimId} returns 404 when disabled (no mutation occurs)', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      policy: samplePolicy(acctId),
      asset: sampleAsset(acctId),
      claim: sampleClaim(acctId, { status: 'submitted' }),
      envOverrides: { claimsApiEnabled: false },
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims/${CLAIM_ID}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start_review' }),
    });
    expect(res.status).toBe(404);
    expect(harness.getClaim().status).toBe('submitted');
  });

  it('still functions normally when claimsApiEnabled is explicitly true', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      claim: sampleClaim(acctId),
      envOverrides: { claimsApiEnabled: true },
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = tokenFor(harness.env, harness.adminAccountId, harness.adminSessionId, 'admin');

    const res = await fetch(`${listened.baseUrl}/admin/claims`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });
});
