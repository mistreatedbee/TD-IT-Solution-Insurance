import { describe, it, expect } from 'vitest';
import type { PolicyDocument } from '../repositories/policies.js';
import { essentialPlanFixture, plusPlanFixture } from './plan-test-fixtures.js';
import {
  buildAdminPolicyAssetUsageBatch,
  buildPlanSummary,
  toPlanSummary,
} from './plan-subscription-summary.js';

function samplePolicy(accountId: string): PolicyDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439011',
    accountId,
    planTier: 'essential',
    planCatalogId: '507f1f77bcf86cd799439088',
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

describe('plan-subscription-summary', () => {
  it('toPlanSummary projects slim fields from full summary', async () => {
    const accountId = 'acct-1';
    const policy = samplePolicy(accountId);
    const ctx = {
      assets: { async countActiveByAccount() { return 2; } },
      planCatalog: {
        async findById() {
          return essentialPlanFixture('507f1f77bcf86cd799439088');
        },
      },
    };

    const summary = await buildPlanSummary(ctx, policy);
    expect(toPlanSummary({
      planCatalogId: policy.planCatalogId,
      planSlug: 'essential',
      planName: 'Essential',
      positioning: 'Protection',
      monthlyAmountCents: 19_900,
      currency: 'ZAR',
      isCustomPricing: false,
      supportLevel: 'Standard',
      maxAssets: 5,
      maxUsers: 1,
      activeAssetCount: 2,
      assetUsageLabel: '2 / 5 assets',
      entitlements: essentialPlanFixture('507f1f77bcf86cd799439088').entitlements,
    })).toEqual(summary);
  });

  it('buildAdminPolicyAssetUsageBatch batches counts per policy', async () => {
    const accountA = 'acct-a';
    const accountB = 'acct-b';
    const policies = [
      { ...samplePolicy(accountA), id: '507f1f77bcf86cd799439011' },
      { ...samplePolicy(accountB), id: '507f1f77bcf86cd799439012', planCatalogId: '507f1f77bcf86cd799439089' },
    ];
    const ctx = {
      assets: {
        async countActiveByAccount(accountId: string) {
          return accountId === accountA ? 5 : 1;
        },
      },
      planCatalog: {
        async findById(id: string) {
          if (id === '507f1f77bcf86cd799439088') return essentialPlanFixture(id);
          if (id === '507f1f77bcf86cd799439089') return plusPlanFixture(id);
          return null;
        },
      },
    };

    const usage = await buildAdminPolicyAssetUsageBatch(ctx, policies);
    expect(usage.get('507f1f77bcf86cd799439011')).toMatchObject({
      planName: 'Essential',
      maxAssets: 5,
      activeAssetCount: 5,
      assetUsageLabel: '5 / 5 assets',
    });
    expect(usage.get('507f1f77bcf86cd799439012')).toMatchObject({
      planName: 'Plus',
      maxAssets: 10,
      activeAssetCount: 1,
      assetUsageLabel: '1 / 10 assets',
    });
  });
});
