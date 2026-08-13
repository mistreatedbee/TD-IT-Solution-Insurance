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
    maxAssets: plan.maxAssets,
    monthlyAmountCents: plan.monthlyAmountCents,
    currency: plan.currency,
    isCustomPricing: plan.isCustomPricing,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    features: plan.features,
    accountTypes: plan.accountTypes,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
