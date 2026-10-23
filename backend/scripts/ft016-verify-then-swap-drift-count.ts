#!/usr/bin/env node
/**
 * Feature 016 Stage 5 — read-only diagnostic per `cto` ruling
 * (`docs/features/016-kyc-identity-verification/03d-cto-ruling-stage5.md`, Ruling 2,
 * "Read-only check of existing data").
 *
 * Counts `customer_profiles` documents where `verificationStatus === 'verified'` AND
 * `updatedAt > verificationReviewedAt`.
 *
 * This is a HINT ONLY, not a precise measure of the verify-then-swap defect's actual
 * impact: profile-picture updates also bump `updatedAt` without touching any
 * identity-bearing field, so this overcounts. Do not treat the number this prints as
 * "N customers have incorrect verified status" — it is an upper bound requiring manual
 * review to narrow.
 *
 * Strictly READ-ONLY: no writes, no deletes, no updates. Takes no action on any
 * customer record. Produces a count for `cto`/`backend-architect` to weigh; this script
 * does not make the remediation call.
 *
 * Run from repo root (requires MONGODB_URI in repo-root `.env`/`.env.local` — see
 * backend/.env.example):
 *
 *   npx tsx backend/scripts/ft016-verify-then-swap-drift-count.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

import { openMongoDatabase, resolveMongoDatabaseName } from '../src/db/mongo-connection.js';
import { CUSTOMER_PROFILES_COLLECTION } from '../src/db/customer-profile-collections.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  const mongoDbNameOverride = process.env.MONGODB_DB_NAME?.trim() || undefined;
  const resolvedDbName = resolveMongoDatabaseName(mongoUri, mongoDbNameOverride);
  const mongo = new MongoClient(mongoUri);

  // Print the resolved database name unconditionally before querying, so a run
  // against the wrong/empty database is never mistaken for a genuine zero
  // (same discipline as inc-001-location-inventory.ts).
  // eslint-disable-next-line no-console
  console.error(
    `[ft016-verify-then-swap-drift-count] resolvedDatabaseName=${resolvedDbName ?? '(driver default — no db name in URI or MONGODB_DB_NAME; almost certainly wrong)'}`,
  );

  try {
    await mongo.connect();
    const db = openMongoDatabase(mongo, mongoDbNameOverride);
    if (db.databaseName !== (resolvedDbName ?? db.databaseName)) {
      throw new Error(
        `Resolved database name (${resolvedDbName}) does not match the database actually opened (${db.databaseName}) — refusing to run.`,
      );
    }

    const profiles = db.collection(CUSTOMER_PROFILES_COLLECTION);

    // Positive control: unfiltered count on the same collection. If this is zero,
    // the run reached the wrong/empty database and the filtered count below is VOID.
    const totalProfiles = await profiles.estimatedDocumentCount();
    const totalVerified = await profiles.countDocuments({ verificationStatus: 'verified' });

    // $expr required to compare two fields of the same document.
    const driftCount = await profiles.countDocuments({
      verificationStatus: 'verified',
      verificationReviewedAt: { $ne: null },
      $expr: { $gt: ['$updatedAt', '$verificationReviewedAt'] },
    });

    const runVoid = totalProfiles === 0;

    const summary = {
      generatedAt: new Date().toISOString(),
      resolvedDatabaseName: resolvedDbName ?? db.databaseName,
      positiveControl: {
        description:
          'Unfiltered estimatedDocumentCount() on customer_profiles. If 0, this run is VOID.',
        totalProfiles,
        passed: !runVoid,
      },
      runVoid,
      totalVerifiedProfiles: totalVerified,
      driftCount,
      note:
        'HINT ONLY per cto ruling 03d §Ruling 2 — profile-picture updates also bump updatedAt ' +
        'without touching any identity-bearing field, so this overcounts the true verify-then-swap ' +
        'impact. No action was taken on any customer record. Read-only; no documents modified or deleted.',
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));
    if (runVoid) {
      // eslint-disable-next-line no-console
      console.error(
        '[ft016-verify-then-swap-drift-count] POSITIVE CONTROL FAILED — customer_profiles is empty ' +
          `in database "${resolvedDbName ?? db.databaseName}". This run is VOID.`,
      );
    }
  } finally {
    await mongo.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[ft016-verify-then-swap-drift-count] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
