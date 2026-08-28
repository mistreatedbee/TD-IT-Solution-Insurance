#!/usr/bin/env node
/**
 * MongoDB collection bootstrap (Atlas / local) — Feature 004 + recovery_cases.
 *
 * Idempotently creates policies, policy_status_history, assets, admin_access_log,
 * and recovery_cases; applies validators and indexes.
 *
 * Run from repo root (requires MONGODB_URI in repo-root `.env`):
 *
 *   npx tsx backend/scripts/bootstrap-mongo-collections.ts
 *
 * Safe to re-run — same logic as server startup (`mongo-bootstrap.ts`).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

import { openMongoDatabase } from '../src/db/mongo-connection.js';

import { bootstrapFeature004Collections } from '../src/db/feature004-collections.js';
import { bootstrapRecoveryCollections } from '../src/db/recovery-collections.js';
import { bootstrapCustomerProfileCollections } from '../src/db/customer-profile-collections.js';
import { bootstrapTrackingDeviceCollections } from '../src/db/tracking-device-collections.js';
import { bootstrapLocationEventsCollections } from '../src/db/location-events-collections.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

function requireMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error(
      '[bootstrap-mongo] Missing MONGODB_URI. Set it in the repo-root .env before running.',
    );
  }
  return uri;
}

function requireMongoDbName(): string | undefined {
  const name = process.env.MONGODB_DB_NAME?.trim();
  return name || undefined;
}

async function main(): Promise<void> {
  const uri = requireMongoUri();
  const dbName = requireMongoDbName();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });

  try {
    await client.connect();
    const db = openMongoDatabase(client, dbName);
    await db.command({ ping: 1 });

    const resolvedDbName = db.databaseName;

    // eslint-disable-next-line no-console
    console.log(`[bootstrap-mongo] Connected to database "${resolvedDbName}".`);

    const feature004 = await bootstrapFeature004Collections(db);

    // eslint-disable-next-line no-console
    console.log('[bootstrap-mongo] Feature 004 collections created this run:', feature004.collectionsEnsured.length
      ? feature004.collectionsEnsured.join(', ')
      : '(none — already existed)');

    // eslint-disable-next-line no-console
    console.log('[bootstrap-mongo] Validators applied/updated on:', feature004.validatorApplied.join(', '));

    // eslint-disable-next-line no-console
    console.log('[bootstrap-mongo] Feature 004 indexes ensured:');
    for (const idx of feature004.indexesEnsured) {
      // eslint-disable-next-line no-console
      console.log(`  - ${idx.collection}.${idx.name}`);
    }

    const recovery = await bootstrapRecoveryCollections(db);

    // eslint-disable-next-line no-console
    console.log(
      `[bootstrap-mongo] recovery_cases: ${recovery.created ? 'created' : 'already existed'}, validator applied`,
    );
    // eslint-disable-next-line no-console
    console.log('[bootstrap-mongo] recovery_cases indexes:', recovery.indexes.join(', ') || '(none new)');

    const profilesCreated =
      (await db.listCollections({ name: 'customer_profiles' }).toArray()).length === 0;
    await bootstrapCustomerProfileCollections(db);

    // eslint-disable-next-line no-console
    console.log(
      `[bootstrap-mongo] customer_profiles: ${profilesCreated ? 'created' : 'already existed'}, indexes ensured`,
    );

    const trackingCreated =
      (await db.listCollections({ name: 'tracking_devices' }).toArray()).length === 0;
    await bootstrapTrackingDeviceCollections(db);

    // eslint-disable-next-line no-console
    console.log(
      `[bootstrap-mongo] tracking_devices: ${trackingCreated ? 'created' : 'already existed'}, indexes ensured`,
    );

    const locationEventsCreated =
      (await db.listCollections({ name: 'location_events' }).toArray()).length === 0;
    await bootstrapLocationEventsCollections(db);

    // eslint-disable-next-line no-console
    console.log(
      `[bootstrap-mongo] location_events: ${locationEventsCreated ? 'created' : 'already existed'}, indexes ensured`,
    );

    // eslint-disable-next-line no-console
    console.log('[bootstrap-mongo] Done.');
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error('[bootstrap-mongo] Failed:', message);
  process.exitCode = 1;
});
