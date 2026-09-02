/**
 * `assertPlanChangeAllowed()` — PLAN_DOWNGRADE_NOT_ALLOWED business rule.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { assertPlanChangeAllowed } from './plan-change.js';
import type { AppContext } from '../context.js';
import type { PlanCatalogDocument } from '../repositories/plan-catalog.js';
import { PLAN_CATALOG_DEFAULTS } from './plan-catalog-defaults.js';

function samplePlan(overrides: Partial<PlanCatalogDocument> = {}): PlanCatalogDocument {
  const defaults = PLAN_CATALOG_DEFAULTS[0]!;
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439088',
    slug: defaults.slug,
    name: defaults.name,
    tagline: defaults.tagline,
    positioning: defaults.positioning,
    maxAssets: defaults.maxAssets,
    maxUsers: defaults.maxUsers,
    monthlyAmountCents: defaults.monthlyAmountCents,
    currency: defaults.currency,
    isCustomPricing: defaults.isCustomPricing,
    isMostPopular: defaults.isMostPopular,
    isActive: defaults.isActive,
    sortOrder: defaults.sortOrder,
    supportLevel: defaults.supportLevel,
    features: defaults.features,
    accountTypes: defaults.accountTypes,
    entitlements: defaults.entitlements,
    catalogVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createCtx(activeCount: number): Pick<AppContext, 'assets' | 'planCatalog'> {
  return {
    assets: {
      async countActiveByAccount() {
        return activeCount;
      },
    },
    planCatalog: {
      async findById() {
        return null;
      },
    },
  } as unknown as Pick<AppContext, 'assets' | 'planCatalog'>;
}

describe('assertPlanChangeAllowed', () => {
  it('allows downgrade when active assets are within the new plan limit', async () => {
    const accountId = randomUUID();
    const ctx = createCtx(3);
    await expect(
      assertPlanChangeAllowed(ctx, accountId, samplePlan({ maxAssets: 5 })),
    ).resolves.toBeUndefined();
  });

  it('allows change to unlimited (business) plan regardless of asset count', async () => {
    const accountId = randomUUID();
    const ctx = createCtx(100);
    await expect(
      assertPlanChangeAllowed(ctx, accountId, samplePlan({ slug: 'business', maxAssets: null })),
    ).resolves.toBeUndefined();
  });

  it('rejects downgrade with PLAN_DOWNGRADE_NOT_ALLOWED when assets exceed limit', async () => {
    const accountId = randomUUID();
    const ctx = createCtx(8);
    await expect(
      assertPlanChangeAllowed(ctx, accountId, samplePlan({ slug: 'essential', maxAssets: 5, name: 'Essential' })),
    ).rejects.toMatchObject({
      code: 'PLAN_DOWNGRADE_NOT_ALLOWED',
      extra: { activeAssets: 8, maxAssets: 5, planName: 'Essential' },
    });
  });
});
