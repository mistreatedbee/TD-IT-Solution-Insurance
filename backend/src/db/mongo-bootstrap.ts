/**
 * Idempotent MongoDB collection/index bootstrap for Feature 004 at server startup.
 *
 * Delegates to `bootstrapFeature004Collections()` in feature004-collections.ts —
 * same logic as backend/scripts/bootstrap-mongo-collections.ts (Atlas apply verified
 * 2026-08-11 by database-architect).
 */
import type { Db } from 'mongodb';
import { bootstrapFeature004Collections } from './feature004-collections.js';

export async function ensurePolicyAssetCollections(db: Db): Promise<void> {
  await bootstrapFeature004Collections(db);
}
