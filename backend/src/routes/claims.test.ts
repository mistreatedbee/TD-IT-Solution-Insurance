/**
 * Customer `/claims*` routes — eligibility gates, duplicate-claim guard,
 * withdrawal/respond transitions. Mirrors `recovery.test.ts`'s hand-rolled
 * fake-`AppContext` harness pattern (route-level HTTP-shape testing; the
 * repository's own Mongo-driver logic and the pure state-machine/fraud-flag
 * logic are covered in `repositories/claims.test.ts` / `lib/claim-rules.test.ts`).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createClaimsRouter } from './claims.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AccountStatus } from '../repositories/accounts.js';
import type { AssetDocument } from '../repositories/assets.js';
import type { PolicyDocument } from '../repositories/policies.js';
import { DuplicateOpenClaimError, type ClaimDocument } from '../repositories/claims.js';
import { isForwardClaimTransition, MAX_CLAIMED_AMOUNT_SANITY_BOUND, type ClaimStatus } from '../lib/claim-rules.js';
import type { Env } from '../config/env.js';
import type { IdempotencyRepo } from '../repositories/idempotency.js';

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
  const rows = new Map<string, { accountId: string | null; requestHash: string; responseStatus: number; responseBody: unknown }>();
  return {
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

const ASSET_ID = '507f1f77bcf86cd799439021';
const POLICY_ID = '507f1f77bcf86cd799439010';

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

function sampleClaim(accountId: string, overrides?: Partial<ClaimDocument>): ClaimDocument {
  const now = new Date('2026-09-01T12:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439055',
    accountId,
    policyId: POLICY_ID,
    assetId: ASSET_ID,
    recoveryCaseId: null,
    supersedesClaimId: null,
    status: 'submitted',
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
    closeReason: null,
    quantumReason: null,
    decisionNotices: [],
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
  asset?: AssetDocument | null;
  policy?: PolicyDocument | null;
  claims?: ClaimDocument[];
  envOverrides?: Partial<Env>;
}) {
  const env = fakeEnv(opts.envOverrides);
  const kv = new InMemoryKeyValueStore();
  const accountId = opts.accountId ?? randomUUID();
  const sessionId = randomUUID();
  const claims = [...(opts.claims ?? [])];
  // SR-018-5 concurrency test support: mirrors the real `claims` collection's
  // partial-unique-index behavior (`db/claims-collections.ts`) in-memory — an
  // assetId can be "reserved" by at most one non-terminal claim at a time. The
  // `await setImmediate` below deliberately reopens the check-then-insert race
  // window a real two-phase commit would have, so `Promise.all`-fired concurrent
  // `createForAccount` calls exercise the same interleaving a real unique-index
  // collision does, including on the losing call throwing `DuplicateOpenClaimError`
  // exactly as the real repository now does on Mongo error code 11000.
  const NON_TERMINAL = ['submitted', 'under_review', 'more_info_requested'];
  const reservedAssetIds = new Set<string>(
    claims.filter((c) => NON_TERMINAL.includes(c.status)).map((c) => c.assetId),
  );

  const ctx = {
    env,
    kv,
    idempotency: createInMemoryIdempotencyRepo(),
    accounts: {
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== accountId) return null;
        return {
          id: accountId,
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
        return opts.asset && opts.asset.accountId === acctId && opts.asset.id === assetId ? opts.asset : null;
      },
    },
    policies: {
      async findByIdForAccount(acctId: string, policyId: string) {
        return opts.policy && opts.policy.accountId === acctId && opts.policy.id === policyId ? opts.policy : null;
      },
    },
    recoveryCases: {
      async findByIdForAccount() {
        return null;
      },
    },
    claims: {
      async createForAccount(input: Record<string, unknown>) {
        const assetId = input.assetId as string;
        // Yield so two concurrent callers both reach this point before either
        // has reserved the assetId — the check-then-insert race SR-018-5 covers.
        await new Promise((resolve) => setImmediate(resolve));
        if (reservedAssetIds.has(assetId)) {
          throw new DuplicateOpenClaimError(assetId);
        }
        reservedAssetIds.add(assetId);
        const created = sampleClaim(accountId, {
          id: randomUUID().replace(/-/g, '').slice(0, 24),
          ...input,
          status: 'submitted',
        } as Partial<ClaimDocument>);
        claims.push(created);
        return created;
      },
      async listByAccount(acctId: string, limit: number) {
        return claims.filter((c) => c.accountId === acctId).slice(0, limit);
      },
      async findByIdForAccount(acctId: string, claimId: string) {
        return claims.find((c) => c.accountId === acctId && c.id === claimId) ?? null;
      },
      async findNonTerminalByAssetForAccount(acctId: string, assetId: string) {
        return (
          claims.find(
            (c) =>
              c.accountId === acctId &&
              c.assetId === assetId &&
              ['submitted', 'under_review', 'more_info_requested'].includes(c.status),
          ) ?? null
        );
      },
      async listSinceForAccount(acctId: string) {
        return claims.filter((c) => c.accountId === acctId);
      },
      async listByAccountAndAssetType(acctId: string, assetType: string) {
        return claims.filter((c) => c.accountId === acctId && c.assetTypeSnapshot === assetType);
      },
      async respondToInfoRequest(acctId: string, claimId: string, input: { text: string; incidentDescription?: string }) {
        const idx = claims.findIndex((c) => c.accountId === acctId && c.id === claimId && c.status === 'more_info_requested');
        if (idx < 0) return null;
        const current = claims[idx]!;
        const updated: ClaimDocument = {
          ...current,
          status: 'under_review',
          incidentDescription: input.incidentDescription ?? current.incidentDescription,
          reviewNotes: [...current.reviewNotes, { actorAccountId: acctId, text: input.text, createdAt: new Date() }],
          updatedAt: new Date(),
        };
        claims[idx] = updated;
        return updated;
      },
      async withdrawForAccount(acctId: string, claimId: string, expectedStatus: ClaimStatus) {
        const idx = claims.findIndex((c) => c.accountId === acctId && c.id === claimId);
        if (idx < 0) return null;
        const current = claims[idx]!;
        if (current.status !== expectedStatus) return null;
        if (!isForwardClaimTransition(expectedStatus, 'closed')) {
          throw Object.assign(new Error('invalid'), { name: 'InvalidClaimStatusTransitionError' });
        }
        const updated: ClaimDocument = { ...current, status: 'closed', decidedAt: new Date(), updatedAt: new Date() };
        claims[idx] = updated;
        return updated;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createClaimsRouter(ctx));
  app.use(errorHandler);

  return { app, env, accountId, sessionId, claims };
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

describe('POST /v1/claims', () => {
  // SR-018-8(d): the idempotency gate must run (and fail closed) before any
  // claim is created, for both a missing header and a non-UUID value.
  it.each([
    ['missing', undefined],
    ['non-UUID', 'not-a-uuid'],
  ])('rejects a %s Idempotency-Key with 400 and creates no claim', async (_label, keyValue) => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      asset: sampleAsset(acctId),
      policy: samplePolicy(acctId),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    if (keyValue !== undefined) headers['idempotency-key'] = keyValue;

    const res = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        policyId: POLICY_ID,
        assetId: ASSET_ID,
        incidentDescription: 'Laptop was stolen from my car overnight.',
        incidentDate: '2026-09-15',
        claimedAmount: 1000,
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(harness.claims).toHaveLength(0);
  });

  it('AC-1: rejects a claim against a non-active (cancelled) policy with 422 POLICY_NOT_ACTIVE', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      asset: sampleAsset(acctId),
      policy: samplePolicy(acctId, { status: 'cancelled' }),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        policyId: POLICY_ID,
        assetId: ASSET_ID,
        incidentDescription: 'Laptop was stolen from my car overnight.',
        incidentDate: '2026-08-15',
        claimedAmount: 1000,
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('POLICY_NOT_ACTIVE');
  });

  it('SR-018-4: ignores a customer-supplied claimedAmountCurrency and always uses the policy currency', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      asset: sampleAsset(acctId),
      policy: samplePolicy(acctId), // billing.currency: 'ZAR'
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        policyId: POLICY_ID,
        assetId: ASSET_ID,
        incidentDescription: 'Laptop was stolen from my car overnight.',
        incidentDate: '2026-09-15',
        claimedAmount: 1000,
        // Attempting to file in a currency the policy is not written in.
        claimedAmountCurrency: 'USD',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.claimedAmountCurrency).toBe('ZAR');
  });

  it('SR-018-3: rejects a claimedAmount above the platform hard ceiling with 400 VALIDATION_ERROR', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      asset: sampleAsset(acctId),
      policy: samplePolicy(acctId),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        policyId: POLICY_ID,
        assetId: ASSET_ID,
        incidentDescription: 'Laptop was stolen from my car overnight.',
        incidentDate: '2026-09-15',
        claimedAmount: MAX_CLAIMED_AMOUNT_SANITY_BOUND + 1,
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('SR-018-3: rejects a claimedAmount with more than 2 decimal places with 400 VALIDATION_ERROR', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      asset: sampleAsset(acctId),
      policy: samplePolicy(acctId),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        policyId: POLICY_ID,
        assetId: ASSET_ID,
        incidentDescription: 'Laptop was stolen from my car overnight.',
        incidentDate: '2026-09-15',
        claimedAmount: 999.999,
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('AC-2: rejects a claim filed before the waiting period clears (policy-effectiveDate path)', async () => {
    const acctId = randomUUID();
    const now = new Date('2026-10-28T00:00:00.000Z');
    const policy = samplePolicy(acctId, { effectiveDate: new Date('2026-10-18T00:00:00.000Z') });
    const asset = sampleAsset(acctId, { registeredAt: new Date('2026-01-01T00:00:00.000Z') });
    const harness = createHarness({ accountId: acctId, asset, policy });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        policyId: POLICY_ID,
        assetId: ASSET_ID,
        incidentDescription: 'Laptop was stolen from my car overnight.',
        incidentDate: now.toISOString().slice(0, 10),
        claimedAmount: 1000,
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('WAITING_PERIOD_NOT_MET');
  });

  // §12.2 R7-1 (compliance ruling 2026-10-28) — an incident dated before the
  // policy's effectiveDate must be ACCEPTED and flagged, never hard-blocked
  // at intake. The old `claims.ts:127` refusal is removed.
  it('§12.2 R7-1: accepts and flags a claim whose incidentDate predates the policy effectiveDate, instead of rejecting it', async () => {
    const acctId = randomUUID();
    const policy = samplePolicy(acctId, { effectiveDate: new Date('2026-01-01T00:00:00.000Z') });
    const asset = sampleAsset(acctId, { registeredAt: new Date('2026-01-01T00:00:00.000Z') });
    const harness = createHarness({ accountId: acctId, asset, policy });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        policyId: POLICY_ID,
        assetId: ASSET_ID,
        incidentDescription: 'Laptop was stolen from my car overnight.',
        // Before the policy effectiveDate — would previously have been a
        // hard 400 VALIDATION_ERROR.
        incidentDate: '2025-12-15',
        claimedAmount: 1000,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.error).toBeUndefined();
    // Never shown to the customer.
    expect(body.fraudFlags).toBeUndefined();
    expect(body.statusHistory).toBeUndefined();

    // But recorded admin-side on the stored domain document.
    const stored = harness.claims.find((c) => c.id === body.id);
    expect(stored?.fraudFlags).toContain('FLAG_INCIDENT_BEFORE_ELIGIBILITY');
  });

  it('AC-4: rejects a duplicate open claim on the same asset with 409 DUPLICATE_OPEN_CLAIM', async () => {
    const acctId = randomUUID();
    const existing = sampleClaim(acctId, { status: 'under_review' });
    const harness = createHarness({
      accountId: acctId,
      asset: sampleAsset(acctId),
      policy: samplePolicy(acctId),
      claims: [existing],
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        policyId: POLICY_ID,
        assetId: ASSET_ID,
        incidentDescription: 'Second incident, different description here.',
        incidentDate: '2026-09-15',
        claimedAmount: 500,
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('DUPLICATE_OPEN_CLAIM');
    expect(body.error.claimId).toBe(existing.id);
  });

  it('SR-018-5: two simultaneous claim-filing requests for the same asset produce exactly one created claim and one 409 DUPLICATE_OPEN_CLAIM (never a raw 500)', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      asset: sampleAsset(acctId),
      policy: samplePolicy(acctId),
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const fire = () =>
      fetch(`${listened.baseUrl}/claims`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          // Different idempotency keys — this proves the asset-level race guard
          // itself (DB unique index + DuplicateOpenClaimError translation), not
          // the separate idempotency-key reservation path.
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          policyId: POLICY_ID,
          assetId: ASSET_ID,
          incidentDescription: 'Laptop was stolen from my car overnight.',
          incidentDate: '2026-09-15',
          claimedAmount: 1000,
        }),
      });

    const [resA, resB] = await Promise.all([fire(), fire()]);
    const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);
    const results = [
      { status: resA.status, body: bodyA },
      { status: resB.status, body: bodyB },
    ];

    const created = results.filter((r) => r.status === 201);
    const duplicates = results.filter((r) => r.status === 409);

    expect(created).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.body.error.code).toBe('DUPLICATE_OPEN_CLAIM');
    // The duplicate response names the claim that actually won the race, not a
    // raw database error — and the harness's in-memory `claims` array ends up
    // with exactly one row for this asset.
    expect(duplicates[0]!.body.error.claimId).toBe(created[0]!.body.id);
    expect(harness.claims.filter((c) => c.assetId === ASSET_ID)).toHaveLength(1);
  });

  it('AC-5: allows a new claim on the same asset once the prior claim is terminal (rejected)', async () => {
    const acctId = randomUUID();
    const rejected = sampleClaim(acctId, { status: 'rejected', id: '507f1f77bcf86cd799439066' });
    const harness = createHarness({
      accountId: acctId,
      asset: sampleAsset(acctId),
      policy: samplePolicy(acctId),
      claims: [rejected],
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        policyId: POLICY_ID,
        assetId: ASSET_ID,
        supersedesClaimId: rejected.id,
        incidentDescription: 'Disputing the rejection with new evidence attached.',
        incidentDate: '2026-09-15',
        claimedAmount: 500,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('submitted');
    expect(body.supersedesClaimId).toBe(rejected.id);
  });

  it('accepts a claim that crosses the rate threshold instead of blocking it (corrected §5 item 3)', async () => {
    const acctId = randomUUID();
    const priorClaims = [
      sampleClaim(acctId, { id: '507f1f77bcf86cd799439071', status: 'closed', assetId: '507f1f77bcf86cd799439031' }),
      sampleClaim(acctId, { id: '507f1f77bcf86cd799439072', status: 'closed', assetId: '507f1f77bcf86cd799439032' }),
      sampleClaim(acctId, { id: '507f1f77bcf86cd799439073', status: 'closed', assetId: '507f1f77bcf86cd799439033' }),
    ];
    const harness = createHarness({
      accountId: acctId,
      asset: sampleAsset(acctId),
      policy: samplePolicy(acctId),
      claims: priorClaims,
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        policyId: POLICY_ID,
        assetId: ASSET_ID,
        incidentDescription: 'A fourth, genuinely separate incident this month.',
        incidentDate: '2026-09-15',
        claimedAmount: 500,
      }),
    });
    // Never refused: still a 201, claim created in `submitted`.
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('submitted');
    // SR-018-8(c): the response body is admin-only-field-free by design
    // (`serializeClaimForCustomer` strips `fraudFlags`), so the only way to
    // prove the flag was actually computed AND persisted — not just eligible
    // to be returned — is to read the stored document directly.
    const persisted = harness.claims.find((c) => c.id === body.id);
    expect(persisted).toBeDefined();
    expect(persisted!.fraudFlags).toContain('FLAG_RATE_THRESHOLD');
  });
});

describe('PATCH /v1/claims/{claimId}/withdraw', () => {
  it('allows the customer to withdraw a non-terminal claim', async () => {
    const acctId = randomUUID();
    const claim = sampleClaim(acctId, { status: 'under_review' });
    const harness = createHarness({ accountId: acctId, claims: [claim] });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims/${claim.id}/withdraw`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('closed');
  });

  it('AC-10: rejects any further transition on an already-terminal claim with 409', async () => {
    const acctId = randomUUID();
    const claim = sampleClaim(acctId, { status: 'closed' });
    const harness = createHarness({ accountId: acctId, claims: [claim] });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims/${claim.id}/withdraw`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /v1/claims/{claimId}/respond', () => {
  it('moves a more_info_requested claim back to under_review', async () => {
    const acctId = randomUUID();
    const claim = sampleClaim(acctId, { status: 'more_info_requested' });
    const harness = createHarness({ accountId: acctId, claims: [claim] });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims/${claim.id}/respond`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Here is the original receipt, dated 2026-08-01.' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('under_review');
  });

  it('rejects a respond call when the claim is not in more_info_requested', async () => {
    const acctId = randomUUID();
    const claim = sampleClaim(acctId, { status: 'under_review' });
    const harness = createHarness({ accountId: acctId, claims: [claim] });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims/${claim.id}/respond`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Unsolicited update.' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('SR-018-2: claims API kill switch (CLAIMS_API_ENABLED)', () => {
  it('GET /v1/claims returns 404 when claimsApiEnabled is unset (fail-closed default)', async () => {
    const acctId = randomUUID();
    const harness = createHarness({ accountId: acctId, envOverrides: { claimsApiEnabled: undefined } });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it('GET /v1/claims returns 404 when claimsApiEnabled is explicitly false', async () => {
    const acctId = randomUUID();
    const harness = createHarness({ accountId: acctId, envOverrides: { claimsApiEnabled: false } });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for the kill switch before authentication runs (no token, still 404 not 401)', async () => {
    const harness = createHarness({ envOverrides: { claimsApiEnabled: false } });
    const listened = await listen(harness.app);
    activeServer = listened.server;

    const res = await fetch(`${listened.baseUrl}/claims`);
    expect(res.status).toBe(404);
  });

  it('POST /v1/claims returns 404 when disabled', async () => {
    const acctId = randomUUID();
    const harness = createHarness({
      accountId: acctId,
      asset: sampleAsset(acctId),
      policy: samplePolicy(acctId),
      envOverrides: { claimsApiEnabled: false },
    });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        policyId: POLICY_ID,
        assetId: ASSET_ID,
        incidentDescription: 'Laptop was stolen from my car overnight.',
        incidentDate: '2026-08-15',
        claimedAmount: 1000,
      }),
    });
    expect(res.status).toBe(404);
  });

  it('GET /v1/claims/{claimId} returns 404 when disabled', async () => {
    const acctId = randomUUID();
    const claim = sampleClaim(acctId);
    const harness = createHarness({ accountId: acctId, claims: [claim], envOverrides: { claimsApiEnabled: false } });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims/${claim.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/claims/{claimId}/respond returns 404 when disabled', async () => {
    const acctId = randomUUID();
    const claim = sampleClaim(acctId, { status: 'more_info_requested' });
    const harness = createHarness({ accountId: acctId, claims: [claim], envOverrides: { claimsApiEnabled: false } });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims/${claim.id}/respond`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Response text.' }),
    });
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/claims/{claimId}/withdraw returns 404 when disabled', async () => {
    const acctId = randomUUID();
    const claim = sampleClaim(acctId, { status: 'submitted' });
    const harness = createHarness({ accountId: acctId, claims: [claim], envOverrides: { claimsApiEnabled: false } });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims/${claim.id}/withdraw`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it('still functions normally when claimsApiEnabled is explicitly true', async () => {
    const acctId = randomUUID();
    const claim = sampleClaim(acctId);
    const harness = createHarness({ accountId: acctId, claims: [claim], envOverrides: { claimsApiEnabled: true } });
    const listened = await listen(harness.app);
    activeServer = listened.server;
    const token = customerToken(harness.env, acctId, harness.sessionId);

    const res = await fetch(`${listened.baseUrl}/claims`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });
});
