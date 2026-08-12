/**
 * Maps MongoDB policy/asset documents to api-design.md §6 customer-facing shapes.
 */
import type { AssetDocument } from '../repositories/assets.js';
import type { PolicyDocument } from '../repositories/policies.js';

export function serializePolicy(doc: PolicyDocument) {
  return {
    id: doc.id,
    planTier: doc.planTier,
    status: doc.status,
    coverageLimits: doc.coverageLimits,
    billing: {
      billingStatus: doc.billing.billingStatus,
      currentPeriodEnd: doc.billing.currentPeriodEnd?.toISOString() ?? null,
      nextBillingAt: doc.billing.nextBillingAt?.toISOString() ?? null,
      cancelAt: doc.billing.cancelAt?.toISOString() ?? null,
    },
    effectiveDate: doc.effectiveDate.toISOString(),
    renewalDate: doc.renewalDate?.toISOString() ?? null,
    cancelledAt: doc.cancelledAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function serializeAsset(doc: AssetDocument) {
  return {
    id: doc.id,
    assetType: doc.assetType,
    displayName: doc.displayName,
    status: doc.status,
    registeredAt: doc.registeredAt.toISOString(),
    estimatedValue: doc.estimatedValue
      ? {
          amount: doc.estimatedValue.amount,
          currency: doc.estimatedValue.currency,
          asOf: doc.estimatedValue.asOf.toISOString(),
        }
      : null,
    photos: doc.photos,
    gpsDeviceId: doc.gpsDeviceId,
    gpsPairedAt: doc.gpsPairedAt?.toISOString() ?? null,
    details: doc.details,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function serializeAdminPolicy(doc: PolicyDocument) {
  return {
    ...serializePolicy(doc),
    accountId: doc.accountId,
    legalHold: doc.legalHold,
  };
}

/** Admin list projection — omits coverageLimits and billing sub-object (SR-004-admin-6). */
export function serializeAdminPolicySummary(doc: PolicyDocument) {
  return {
    id: doc.id,
    accountId: doc.accountId,
    planTier: doc.planTier,
    status: doc.status,
    legalHold: doc.legalHold,
    billingStatus: doc.billing.billingStatus,
    effectiveDate: doc.effectiveDate.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

export function serializeAdminAsset(doc: AssetDocument) {
  return {
    ...serializeAsset(doc),
    accountId: doc.accountId,
    legalHold: doc.legalHold,
  };
}

/** Admin list projection — omits details, estimatedValue, and photos (SR-004-admin-6). */
export function serializeAdminAssetSummary(doc: AssetDocument) {
  return {
    id: doc.id,
    accountId: doc.accountId,
    assetType: doc.assetType,
    displayName: doc.displayName,
    status: doc.status,
    legalHold: doc.legalHold,
    gpsDeviceId: doc.gpsDeviceId,
    registeredAt: doc.registeredAt.toISOString(),
  };
}
