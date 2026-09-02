/**
 * Serialize plan catalog documents for API responses.
 */
import type { PlanCatalogDocument } from '../repositories/plan-catalog.js';

export function serializePlanCatalog(plan: PlanCatalogDocument) {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    tagline: plan.tagline,
    positioning: plan.positioning,
    maxAssets: plan.maxAssets,
    maxUsers: plan.maxUsers,
    monthlyAmountCents: plan.monthlyAmountCents,
    currency: plan.currency,
    isCustomPricing: plan.isCustomPricing,
    isMostPopular: plan.isMostPopular,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    supportLevel: plan.supportLevel,
    features: plan.features,
    accountTypes: plan.accountTypes,
    entitlements: plan.entitlements,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
