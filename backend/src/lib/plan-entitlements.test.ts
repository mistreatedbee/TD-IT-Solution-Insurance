/**
 * Plan entitlement resolution and enforcement helpers.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  assertPlanEntitlement,
  accountHasEntitlement,
  resolveAccountPlanCatalog,
} from './plan-entitlements.js';
import type { AppContext } from '../context.js';
import type { PolicyDocument } from '../repositories/policies.js';
import type { PlanCatalogDocument } from '../repositories/plan-catalog.js';
import { PLAN_CATALOG_DEFAULTS } from './plan-catalog-defaults.js';

function planFromDefault(index: number, id: string): PlanCatalogDocument {
  const row = PLAN_CATALOG_DEFAULTS[index]!;
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    positioning: row.positioning,
    maxAssets: row.maxAssets,
    maxUsers: row.maxUsers,
    monthlyAmountCents: row.monthlyAmountCents,
    currency: row.currency,
    isCustomPricing: row.isCustomPricing,
    isMostPopular: row.isMostPopular,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    supportLevel: row.supportLevel,
    features: row.features,
    accountTypes: row.accountTypes,
    entitlements: row.entitlements,
    catalogVersion: 2,
    createdAt: now,
    updatedAt: now,
  };
}

function samplePolicy(accountId: string, planCatalogId: string): PolicyDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439011',
    accountId,
    planTier: 'essential',
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

describe('plan entitlements', () => {
  it('resolves the catalog plan from the first policy', async () => {
    const accountId = randomUUID();
    const planId = '507f1f77bcf86cd799439088';
    const essential = planFromDefault(0, planId);
    const ctx = {
      policies: {
        async listByAccount() {
          return [samplePolicy(accountId, planId)];
        },
      },
      planCatalog: {
        async findById(id: string) {
          return id === planId ? essential : null;
        },
      },
    } as unknown as Pick<AppContext, 'policies' | 'planCatalog'>;

    const plan = await resolveAccountPlanCatalog(ctx, accountId);
    expect(plan?.slug).toBe('essential');
  });

  it('fails open when no planCatalogId is attached', async () => {
    const accountId = randomUUID();
    const ctx = {
      policies: {
        async listByAccount() {
          return [samplePolicy(accountId, '')];
        },
      },
      planCatalog: {
        async findById() {
          return null;
        },
      },
    } as unknown as Pick<AppContext, 'policies' | 'planCatalog'>;

    await expect(assertPlanEntitlement(ctx, accountId, 'locationHistory')).resolves.toBeUndefined();
  });

  it('rejects locationHistory on Essential plan', async () => {
    const accountId = randomUUID();
    const planId = '507f1f77bcf86cd799439088';
    const essential = planFromDefault(0, planId);
    const ctx = {
      policies: {
        async listByAccount() {
          return [samplePolicy(accountId, planId)];
        },
      },
      planCatalog: {
        async findById(id: string) {
          return id === planId ? essential : null;
        },
      },
    } as unknown as Pick<AppContext, 'policies' | 'planCatalog'>;

    await expect(assertPlanEntitlement(ctx, accountId, 'locationHistory')).rejects.toMatchObject({
      code: 'PLAN_FEATURE_NOT_INCLUDED',
      extra: { feature: 'locationHistory' },
    });
  });

  it('allows gpsAlerts on Plus plan', () => {
    const plus = planFromDefault(1, '507f1f77bcf86cd799439089');
    expect(accountHasEntitlement(plus, 'gpsAlerts')).toBe(true);
    expect(accountHasEntitlement(planFromDefault(0, '507f1f77bcf86cd799439088'), 'gpsAlerts')).toBe(false);
  });
});
