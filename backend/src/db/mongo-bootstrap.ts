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

export async function ensurePolicyAssetCollections(db: Db): Promise<void> {
  await bootstrapFeature004Collections(db);
  await bootstrapRecoveryCollections(db);
}
