/**
 * Idempotent MongoDB collection/index bootstrap for Feature 004 at server startup.
 *
 * Delegates to `bootstrapFeature004Collections()` in feature004-collections.ts —
 * same logic as backend/scripts/bootstrap-mongo-collections.ts (policies, assets,
 * policy_status_history, admin_access_log).
 */
import type { Db } from 'mongodb';
import { bootstrapFeature004Collections } from './feature004-collections.js';
import { bootstrapRecoveryCollections } from './recovery-collections.js';
import { bootstrapNotificationCollections } from './notification-collections.js';
import { bootstrapCustomerProfileCollections } from './customer-profile-collections.js';
import { bootstrapTrackingDeviceCollections } from './tracking-device-collections.js';
import { bootstrapLocationEventsCollections } from './location-events-collections.js';
import { bootstrapAlertsCollections } from './alerts-collections.js';
import { bootstrapProductEventsCollections } from './product-events-collections.js';
import { createPlanCatalogRepo } from '../repositories/plan-catalog.js';

export async function ensurePolicyAssetCollections(db: Db): Promise<void> {
  await bootstrapFeature004Collections(db);
  await bootstrapRecoveryCollections(db);
  try {
    await bootstrapNotificationCollections(db);
  } catch (err) {
    // Non-fatal: auth/policy routes must stay up if notification bootstrap fails on Atlas.
    console.error(
      '[startup] Notification collection bootstrap failed:',
      err instanceof Error ? err.message : err,
    );
  }
  try {
    await bootstrapCustomerProfileCollections(db);
  } catch (err) {
    console.error(
      '[startup] Customer profile collection bootstrap failed:',
      err instanceof Error ? err.message : err,
    );
  }
  try {
    await bootstrapTrackingDeviceCollections(db);
  } catch (err) {
    console.error(
      '[startup] Tracking device collection bootstrap failed:',
      err instanceof Error ? err.message : err,
    );
  }
  try {
    await bootstrapLocationEventsCollections(db);
  } catch (err) {
    console.error(
      '[startup] Location events collection bootstrap failed:',
      err instanceof Error ? err.message : err,
    );
  }
  try {
    await bootstrapAlertsCollections(db);
  } catch (err) {
    console.error(
      '[startup] Alerts collection bootstrap failed:',
      err instanceof Error ? err.message : err,
    );
  }
  try {
    await bootstrapProductEventsCollections(db);
  } catch (err) {
    console.error(
      '[startup] Product events collection bootstrap failed:',
      err instanceof Error ? err.message : err,
    );
  }
  const planCatalog = createPlanCatalogRepo(db);
  await planCatalog.ensureSeeded();
  try {
    await planCatalog.migrateCatalogToV2();
  } catch (err) {
    console.error(
      '[startup] Plan catalog v2 migration failed:',
      err instanceof Error ? err.message : err,
    );
  }
  try {
  const { createPoliciesRepo } = await import('../repositories/policies.js');
    await createPoliciesRepo(db).migrateLegacyPlanTiers();
  } catch (err) {
    console.error(
      '[startup] Policy planTier legacy slug migration failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
