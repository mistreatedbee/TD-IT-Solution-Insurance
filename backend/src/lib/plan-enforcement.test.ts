/**
 * `assertAssetRegistrationAllowed()` — ASSET_LIMIT_REACHED business rule.
 * qa-test-strategy.md §3.1 (Feature 006 Stage 10 gap).
 *
 * Pricing v2 asset limits: Essential 5, Plus 10, Pro 25 (allow at limit-1, reject at limit).
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { assertAssetRegistrationAllowed } from './plan-enforcement.js';
import type { AppContext } from '../context.js';
import type { PolicyDocument } from '../repositories/policies.js';
import type { PlanCatalogDocument } from '../repositories/plan-catalog.js';
import { essentialPlanFixture, businessPlanFixture } from '../lib/plan-test-fixtures.js';

function samplePolicy(accountId: string, overrides: Partial<PolicyDocument> = {}): PolicyDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439011',
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

function samplePlan(overrides: Partial<PlanCatalogDocument> = {}): PlanCatalogDocument {
  return essentialPlanFixture('507f1f77bcf86cd799439088', overrides);
}

function createCtx(opts: {
  policies?: PolicyDocument[];
  plans?: Record<string, PlanCatalogDocument | null>;
  activeCount?: number;
}): Pick<AppContext, 'policies' | 'assets' | 'planCatalog'> {
  const policies = opts.policies ?? [];
  const plans = opts.plans ?? {};
  return {
    policies: {
      async listByAccount(accountId: string) {
        return policies.filter((p) => p.accountId === accountId);
      },
    },
    assets: {
      async countActiveByAccount() {
        return opts.activeCount ?? 0;
      },
    },
    planCatalog: {
      async findById(id: string) {
        return id in plans ? plans[id]! : null;
      },
    },
  } as unknown as Pick<AppContext, 'policies' | 'assets' | 'planCatalog'>;
}

describe('assertAssetRegistrationAllowed', () => {
  it('allows registration when the account has no policy at all', async () => {
    const accountId = randomUUID();
    const ctx = createCtx({ policies: [] });
    await expect(assertAssetRegistrationAllowed(ctx, accountId)).resolves.toBeUndefined();
  });

  it('allows registration when the policy has no planCatalogId (no plan attached)', async () => {
    const accountId = randomUUID();
    const ctx = createCtx({
      policies: [samplePolicy(accountId, { planCatalogId: null })],
      activeCount: 999,
    });
    await expect(assertAssetRegistrationAllowed(ctx, accountId)).resolves.toBeUndefined();
  });

  it('allows registration when maxAssets is null (business/custom tier — unlimited)', async () => {
    const accountId = randomUUID();
    const planId = '507f1f77bcf86cd799439087';
    const ctx = createCtx({
      policies: [samplePolicy(accountId, { planCatalogId: planId })],
      plans: { [planId]: businessPlanFixture(planId, { maxAssets: null }) },
      activeCount: 1000,
    });
    await expect(assertAssetRegistrationAllowed(ctx, accountId)).resolves.toBeUndefined();
  });

  it('allows registration when active count is under the limit (boundary: 4 < 5)', async () => {
    const accountId = randomUUID();
    const planId = '507f1f77bcf86cd799439088';
    const ctx = createCtx({
      policies: [samplePolicy(accountId, { planCatalogId: planId })],
      plans: { [planId]: samplePlan({ id: planId, maxAssets: 5 }) },
      activeCount: 4,
    });
    await expect(assertAssetRegistrationAllowed(ctx, accountId)).resolves.toBeUndefined();
  });

  it('rejects with ASSET_LIMIT_REACHED when active count is exactly at the limit (boundary: 5 >= 5)', async () => {
    const accountId = randomUUID();
    const planId = '507f1f77bcf86cd799439088';
    const ctx = createCtx({
      policies: [samplePolicy(accountId, { planCatalogId: planId })],
      plans: { [planId]: samplePlan({ id: planId, maxAssets: 5 }) },
      activeCount: 5,
    });

    await expect(assertAssetRegistrationAllowed(ctx, accountId)).rejects.toMatchObject({
      code: 'ASSET_LIMIT_REACHED',
      extra: { maxAssets: 5 },
    });
  });

  it('rejects with ASSET_LIMIT_REACHED when active count exceeds the limit', async () => {
    const accountId = randomUUID();
    const planId = '507f1f77bcf86cd799439088';
    const ctx = createCtx({
      policies: [samplePolicy(accountId, { planCatalogId: planId })],
      plans: { [planId]: samplePlan({ id: planId, maxAssets: 5 }) },
      activeCount: 6,
    });

    await expect(assertAssetRegistrationAllowed(ctx, accountId)).rejects.toMatchObject({
      code: 'ASSET_LIMIT_REACHED',
      extra: { maxAssets: 5 },
    });
  });

  it('fails open (allows registration) when the referenced plan no longer resolves', async () => {
    const accountId = randomUUID();
    const ctx = createCtx({
      policies: [samplePolicy(accountId, { planCatalogId: 'deleted-plan-id' })],
      plans: {},
      activeCount: 999,
    });
    await expect(assertAssetRegistrationAllowed(ctx, accountId)).resolves.toBeUndefined();
  });

  it('checks the first policy returned by listByAccount(accountId, 1, null) when an account has more than one policy', async () => {
    const accountId = randomUUID();
    const overLimitPlanId = '507f1f77bcf86cd799439088';
    const unlimitedPlanId = '507f1f77bcf86cd799439087';
    let received: unknown;
    const ctx: Pick<AppContext, 'policies' | 'assets' | 'planCatalog'> = {
      policies: {
        async listByAccount(_accountId: string, limit: number, cursor: unknown) {
          received = { limit, cursor };
          // Only the first policy in the array is ever returned, mirroring
          // the real repo's `listByAccount(accountId, 1, null)` call site.
          return [samplePolicy(accountId, { id: 'first', planCatalogId: overLimitPlanId })];
        },
      },
      assets: {
        async countActiveByAccount() {
          return 10;
        },
      },
      planCatalog: {
        async findById(id: string) {
          if (id === overLimitPlanId) return samplePlan({ id: overLimitPlanId, maxAssets: 5 });
          if (id === unlimitedPlanId) return samplePlan({ id: unlimitedPlanId, maxAssets: null });
          return null;
        },
      },
    } as unknown as Pick<AppContext, 'policies' | 'assets' | 'planCatalog'>;

    await expect(assertAssetRegistrationAllowed(ctx, accountId)).rejects.toMatchObject({
      code: 'ASSET_LIMIT_REACHED',
    });
    expect(received).toEqual({ limit: 1, cursor: null });
  });

  describe.each([
    { tier: 'essential', maxAssets: 5 },
    { tier: 'plus', maxAssets: 10 },
    { tier: 'pro', maxAssets: 25 },
  ] as const)('$tier plan (max $maxAssets assets)', ({ tier, maxAssets }) => {
    it(`allows registration at limit-1 (${maxAssets - 1} active)`, async () => {
      const accountId = randomUUID();
      const planId = `507f1f77bcf86cd7994390${maxAssets}`;
      const ctx = createCtx({
        policies: [samplePolicy(accountId, { planCatalogId: planId })],
        plans: {
          [planId]: samplePlan({ id: planId, slug: tier, name: tier, maxAssets }),
        },
        activeCount: maxAssets - 1,
      });
      await expect(assertAssetRegistrationAllowed(ctx, accountId)).resolves.toBeUndefined();
    });

    it(`rejects at limit (${maxAssets} active)`, async () => {
      const accountId = randomUUID();
      const planId = `507f1f77bcf86cd7994391${maxAssets}`;
      const ctx = createCtx({
        policies: [samplePolicy(accountId, { planCatalogId: planId })],
        plans: {
          [planId]: samplePlan({ id: planId, slug: tier, name: tier, maxAssets }),
        },
        activeCount: maxAssets,
      });
      await expect(assertAssetRegistrationAllowed(ctx, accountId)).rejects.toMatchObject({
        code: 'ASSET_LIMIT_REACHED',
        extra: { maxAssets },
      });
    });
  });
});
