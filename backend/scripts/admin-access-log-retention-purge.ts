#!/usr/bin/env node
/**
 * `admin_access_log` retention-purge script, closing F-019-C1.
 *
 * Design: docs/organization/adr/0006-privileged-access-audit-correlation.md §19
 * (`database-architect`, 2026-10-29). Gate: makes the ratified 12-month ceiling
 * (ADR-0006 §14.2, FU-A8) operable.
 *
 * WHAT THIS DOES: whole-document DELETE (never a field-level clear — unlike the
 * police-report job, `admin_access_log` rows are themselves the evidentiary artifact
 * with no parent document that needs to survive) of `admin_access_log` documents
 * whose `createdAt` is more than `ADMIN_ACCESS_LOG_RETENTION_MONTHS` (12) months in
 * the past and that are NOT under `legalHold: true`. Idempotent — a deleted row
 * cannot match on a later run.
 *
 * WHAT THIS DOES NOT DO: this is a script, not a scheduled job. Actual scheduling
 * (cron, a Render Cron Job, or equivalent) is a separate `devops-engineer`/`cto`
 * decision (ADR-0006 §19.5) — not made or wired up here. Cadence should be at least
 * monthly per that section.
 *
 * SAFETY: `--dry-run` is NOT the default — pass it explicitly to report what WOULD be
 * deleted without writing, matching this repo's existing conventions for scripts that
 * touch production data (see `police-report-retention-purge.ts`). Always run with
 * `--dry-run` first against production data.
 *
 * USAGE (run from repo root; requires MONGODB_URI in repo-root `.env`/`.env.local` —
 * see backend/.env.example):
 *
 *   npx tsx backend/scripts/admin-access-log-retention-purge.ts --dry-run
 *   npx tsx backend/scripts/admin-access-log-retention-purge.ts
 *
 * OUTPUT: a structured JSON summary to stdout
 * (`{ runAt, dryRun, retentionMonths, cutoffDate, candidatesFound, cleared, error }`),
 * mirroring `police-report-retention-purge.ts`'s own stdout-summary convention. The
 * durable `retention_job_runs` row (written by `runAdminAccessLogRetentionPurge`
 * itself) is the source of truth; stdout remains a convenience.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

import { openMongoDatabase, resolveMongoDatabaseName } from '../src/db/mongo-connection.js';
import { runAdminAccessLogRetentionPurge } from '../src/lib/admin-access-log-retention.js';

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

  // Same discipline as police-report-retention-purge.ts: print the resolved database
  // name unconditionally, before any query/write runs, so a run against the wrong
  // database is never mistaken for "nothing to purge".
  // eslint-disable-next-line no-console
  console.error(
    `[admin-access-log-retention-purge] mode=${dryRun ? 'DRY-RUN (no writes)' : 'LIVE (will write)'} ` +
      `resolvedDatabaseName=${resolvedDbName ?? '(driver default — no db name in URI or MONGODB_DB_NAME)'}`,
  );

  try {
    await mongo.connect();
    const db = openMongoDatabase(mongo, mongoDbNameOverride);

    const summary = await runAdminAccessLogRetentionPurge(db, { dryRun });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));

    if (summary.error) {
      // eslint-disable-next-line no-console
      console.error(`[admin-access-log-retention-purge] Run completed with an error: ${summary.error}`);
      process.exitCode = 1;
    }
  } finally {
    await mongo.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[admin-access-log-retention-purge] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
