#!/usr/bin/env node
/**
 * OB-03 — `DIRECTED_DISPATCH_ENABLED` flag-flip migration CLI.
 *
 * Design: docs/features/009-customer-experience-redesign/
 * api-design-ob03-dispatch-location-grants.md §1. Logic lives in
 * `backend/src/lib/dispatch-flag-flip-migration.ts` (unit-tested there); this script
 * is the thin CLI wrapper, following the exact same shape as
 * `backend/scripts/police-report-retention-purge.ts`.
 *
 * SAFETY: `--dry-run` is NOT the default — pass it explicitly to report what WOULD be
 * migrated without writing. Always run with `--dry-run` first against production
 * data.
 *
 * REQUIRED ORDERING (§1's "mechanism, stated"): this script must complete
 * successfully (exit 0) BEFORE `DIRECTED_DISPATCH_ENABLED='true'` is applied to the
 * running service's environment. `assertDirectedDispatchMigrationApplied`
 * (`backend/src/lib/dispatch-migration-guard.ts`, invoked from `backend/src/index.ts`
 * at boot) is the second, independent guard that refuses to start the service if this
 * ordering was violated.
 *
 * USAGE (run from repo root; requires MONGODB_URI in repo-root `.env`/`.env.local` —
 * see backend/.env.example):
 *
 *   npx tsx backend/scripts/ob03-dispatch-flag-flip-migration.ts --dry-run
 *   npx tsx backend/scripts/ob03-dispatch-flag-flip-migration.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

import { openMongoDatabase, resolveMongoDatabaseName } from '../src/db/mongo-connection.js';
import { runDispatchFlagFlipMigration } from '../src/lib/dispatch-flag-flip-migration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  const mongoDbNameOverride = process.env.MONGODB_DB_NAME?.trim() || undefined;
  const resolvedDbName = resolveMongoDatabaseName(mongoUri, mongoDbNameOverride);
  const mongo = new MongoClient(mongoUri);

  // eslint-disable-next-line no-console
  console.error(
    `[ob03-dispatch-flag-flip-migration] mode=${dryRun ? 'DRY-RUN (no writes)' : 'LIVE (will write)'} ` +
      `resolvedDatabaseName=${resolvedDbName ?? '(driver default — no db name in URI or MONGODB_DB_NAME)'}`,
  );

  try {
    await mongo.connect();
    const db = openMongoDatabase(mongo, mongoDbNameOverride);

    const summary = await runDispatchFlagFlipMigration(db, { dryRun });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));

    if (summary.errors.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `[ob03-dispatch-flag-flip-migration] Run completed with ${summary.errors.length} error(s).`,
      );
      process.exitCode = 1;
    }
  } finally {
    await mongo.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[ob03-dispatch-flag-flip-migration] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
