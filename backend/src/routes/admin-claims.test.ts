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
import { isForwardClaimTransition, type ClaimStatus } from '../lib/claim-rules.js';
import type { Env } from '../config/env.js';
import type {
  AdminAccessBulkDisclosureInput,
  AdminAccessDetailInput,
  AdminAccessStateChangeInput,
} from '../repositories/admin-access-log.js';

const ASSET_ID = '507f1f77bcf86cd799439021';
const POLICY_ID = '507f1f77bcf86cd799439010';
const CLAIM_ID = '507f1f77bcf86cd799439055';

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

function createHarness(opts: { accountId?: string; policy?: PolicyDocument; asset?: AssetDocument; claim: ClaimDocument }) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = opts.accountId ?? randomUUID();
  const adminAccountId = randomUUID();
  const adminSessionId = randomUUID();
  let claim = opts.claim;
  const stateChanges: AdminAccessStateChangeInput[] = [];
  const bulkDisclosures: AdminAccessBulkDisclosureInput[] = [];
  const detailAccesses: AdminAccessDetailInput[] = [];

  const ctx = {
    env,
    kv,
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
        input: { expectedStatus: ClaimStatus; approvedAmount: number; actorAccountId: string },
      ) {
        if (claim.status !== input.expectedStatus) return null;
        if (!isForwardClaimTransition(input.expectedStatus, 'approved')) {
          throw Object.assign(new Error('invalid'), { name: 'InvalidClaimStatusTransitionError' });
        }
        claim = { ...claim, status: 'awaiting_payout', approvedAmount: input.approvedAmount, decidedAt: new Date(), updatedAt: new Date() };
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

describe('PATCH /v1/admin/claims/{claimId}', () => {
  it('AC-6: rejects an approvedAmount above a configured coverage limit', async () => {
    const acctId = randomUUID();
    const policy = samplePolicy(acctId, { coverageLimits: [{ assetType: 'laptop', amount: 5000, currency: 'ZAR' }] });
    const harness = createHarness({ accountId: acctId, policy, asset: sampleAsset(acctId), claim: sampleClaim(acctId) });
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
    const harness = createHarness({ accountId: acctId, policy, asset: sampleAsset(acctId), claim: sampleClaim(acctId) });
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
});
