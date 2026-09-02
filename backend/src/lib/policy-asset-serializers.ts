/**
 * Maps MongoDB policy/asset documents to api-design.md §6 customer-facing shapes.
 */
import type { AdminPolicyAssetUsage } from './plan-subscription-summary.js';
import type { AssetDocument, AssetLastLocation } from '../repositories/assets.js';
import type { PolicyDocument } from '../repositories/policies.js';

function serializeAssetLastLocation(location: AssetLastLocation | null) {
  if (!location) return null;
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracyMeters,
    recordedAt: location.recordedAt.toISOString(),
  };
}

export function serializePolicy(doc: PolicyDocument) {
  return {
    id: doc.id,
    planTier: doc.planTier,
    planCatalogId: doc.planCatalogId,
    status: doc.status,
    coverageLimits: doc.coverageLimits,
    billing: {
      billingStatus: doc.billing.billingStatus,
      currency: doc.billing.currency,
      amount: doc.billing.amount,
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
    locationSource: doc.locationSource,
    reportingDeviceId: doc.reportingDeviceId,
    lastLocation: serializeAssetLastLocation(doc.lastLocation),
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
export function serializeAdminPolicySummary(
  doc: PolicyDocument,
  assetUsage?: AdminPolicyAssetUsage,
) {
  return {
    id: doc.id,
    accountId: doc.accountId,
    planTier: doc.planTier,
    planCatalogId: doc.planCatalogId,
    status: doc.status,
    legalHold: doc.legalHold,
    billingStatus: doc.billing.billingStatus,
    effectiveDate: doc.effectiveDate.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    planName: assetUsage?.planName ?? null,
    maxAssets: assetUsage?.maxAssets ?? null,
    activeAssetCount: assetUsage?.activeAssetCount ?? 0,
    assetUsageLabel: assetUsage?.assetUsageLabel ?? '0 assets',
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

export function serializeAssetLocation(doc: AssetDocument) {
  return {
    assetId: doc.id,
    locationSource: doc.locationSource,
    reportingDeviceId: doc.reportingDeviceId,
    lastLocation: serializeAssetLastLocation(doc.lastLocation),
  };
}

export function serializeAssetLocationSummaryEntry(doc: AssetDocument) {
  return {
    assetId: doc.id,
    displayName: doc.displayName,
    assetType: doc.assetType,
    lastLocation: serializeAssetLastLocation(doc.lastLocation),
    locationSource: doc.locationSource,
    reportingDeviceId: doc.reportingDeviceId,
  };
}

export function serializeLocationEvent(doc: {
  id: string;
  assetId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: Date;
  receivedAt: Date;
  source: string;
  triggeredBy: string | null;
}) {
  return {
    id: doc.id,
    assetId: doc.assetId,
    latitude: doc.latitude,
    longitude: doc.longitude,
    accuracyMeters: doc.accuracyMeters,
    recordedAt: doc.recordedAt.toISOString(),
    receivedAt: doc.receivedAt.toISOString(),
    source: doc.source,
    triggeredBy: doc.triggeredBy,
  };
}
